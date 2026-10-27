#!/usr/bin/env python3
import calendar
import json
import os
import re
import statistics
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from google.oauth2 import service_account
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    RunReportRequest, DateRange, Dimension, Metric,
    FilterExpression, FilterExpressionList, Filter, OrderBy,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / os.environ.get("GA4_OUTPUT_DIR", "dashboard/data")
KST = timezone(timedelta(hours=9))

TREND_DAYS = 28

SETTLED = ("8daysAgo", "2daysAgo")

LONGEST_DIMS = ("sessionSource", "deviceCategory", "city", "browser",
                "screenResolution", "operatingSystemVersion", "language",
                "landingPagePlusQueryString")

HISTORY_REFRESH_AGE = 2


def day_range(age):
    tag = f"{age}daysAgo"
    return (tag, tag)


def trend_range(age):
    return (f"{TREND_DAYS + age - 1}daysAgo", f"{age}daysAgo")


def prior_range(age):
    return (f"{TREND_DAYS + age - 1}daysAgo", f"{age + 1}daysAgo")


def mmdd(iso):
    return iso[5:].replace("-", ".")

def host_regex(pattern):
    return FilterExpression(filter=Filter(
        field_name="hostName",
        string_filter=Filter.StringFilter(
            match_type=Filter.StringFilter.MatchType.FULL_REGEXP, value=pattern),
    ))


SITE_HOSTS = host_regex(r"^([a-z0-9-]+\.)*atah\.io$")
BLOG_HOSTS = host_regex(r"^([a-z0-9-]+\.)*tistory\.com$")
MAIN_HOST = "atah.io"

SECTION_PREFIXES = [
    ("/haiyuki_web", "환세패유기 (웹)"),
    ("/haiyuki_manual", "환세패유기 해설서"),
    ("/balance", "미니게임 · 균형잡기"),
    ("/sweep", "미니게임 · 술창고 청소"),
    ("/swim", "미니게임 · 헤엄치기"),
    ("/viewer", "장면 뷰어"),
    ("/scene_viewer", "장면 뷰어"),
    ("/world", "월드 (에디터/뷰어)"),
    ("/dashboard", "대시보드"),
]
SECTION_MAIN = "메인 (아타호의 거처)"
SECTION_OTHER = "기타"
SITE_TITLE_SUFFIX = " : atah.io"


class Target:

    def __init__(self, key, label, property_id, hosts, *, split_hosts, page_dimension):
        self.key = key
        self.label = label
        self.property_id = property_id
        self.hosts = hosts
        self.split_hosts = split_hosts
        self.page_dimension = page_dimension


def build_targets():
    targets = [Target(
        key="ga4", label="사이트",
        property_id=os.environ.get("GA4_PROPERTY_ID", "516513119"),
        hosts=SITE_HOSTS, split_hosts=True, page_dimension="pagePath",
    )]

    blog_id = os.environ.get("GA4_BLOG_PROPERTY_ID", "").strip()
    if blog_id:
        targets.append(Target(
            key="blog", label="블로그", property_id=blog_id,
            hosts=BLOG_HOSTS, split_hosts=False, page_dimension="pageTitle",
        ))
    return targets


def load_credentials():
    raw_json = os.environ.get("GA4_SERVICE_ACCOUNT_JSON")
    if raw_json:
        info = json.loads(raw_json)
        return service_account.Credentials.from_service_account_info(info)

    key_file = os.environ.get("GA4_SERVICE_ACCOUNT_FILE")
    if key_file:
        return service_account.Credentials.from_service_account_file(key_file)

    sys.exit(
        "GA4 credentials not found. Set GA4_SERVICE_ACCOUNT_JSON (CI secret) "
        "or GA4_SERVICE_ACCOUNT_FILE (local path)."
    )


def report(client, target, *, dimensions=(), metrics, date_range, dimension_filter=None,
           order_by=None, limit=None, offset=None):
    start, end = date_range
    if dimension_filter is None:
        dimension_filter = target.hosts
    else:
        dimension_filter = FilterExpression(and_group=FilterExpressionList(
            expressions=[target.hosts, dimension_filter]))

    order_bys = []
    if order_by:
        name, desc = order_by
        if name in metrics:
            order_bys = [OrderBy(metric=OrderBy.MetricOrderBy(metric_name=name), desc=desc)]
        else:
            order_bys = [OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name=name), desc=desc)]

    resp = client.run_report(RunReportRequest(
        property=f"properties/{target.property_id}",
        dimensions=[Dimension(name=d) for d in dimensions],
        metrics=[Metric(name=m) for m in metrics],
        date_ranges=[DateRange(start_date=start, end_date=end)],
        dimension_filter=dimension_filter,
        order_bys=order_bys,
        limit=limit,
        offset=offset,
    ))

    rows = []
    for r in resp.rows:
        row = {d: r.dimension_values[i].value for i, d in enumerate(dimensions)}
        for i, m in enumerate(metrics):
            row[m] = float(r.metric_values[i].value or 0)
        rows.append(row)
    return rows


def totals(client, target, date_range, metrics):
    rows = report(client, target, metrics=metrics, date_range=date_range)
    return rows[0] if rows else {m: 0.0 for m in metrics}


def fetch_longest_visit(client, target, date_range):
    base = totals(client, target, date_range, ["sessions", "averageSessionDuration"])
    n_sessions, avg = base["sessions"], base["averageSessionDuration"]
    if n_sessions < 1:
        return None
    total_duration = n_sessions * avg

    rows = report(client, target, dimensions=LONGEST_DIMS,
                  metrics=["sessions", "averageSessionDuration"],
                  date_range=date_range, limit=5000)
    if not rows:
        return None

    if (abs(sum(r["sessions"] for r in rows) - n_sessions) > 0.5
            or abs(sum(r["sessions"] * r["averageSessionDuration"]
                       for r in rows) - total_duration) > 1):
        return None

    singles = [r for r in rows if r["sessions"] == 1]
    if not singles:
        return None
    best = max(singles, key=lambda r: r["averageSessionDuration"])
    seconds = best["averageSessionDuration"]

    bound = max((r["sessions"] * r["averageSessionDuration"]
                 for r in rows if r["sessions"] > 1), default=0)
    if seconds < bound:
        return None
    if seconds <= 0:
        return None

    pin = FilterExpression(and_group=FilterExpressionList(expressions=[
        FilterExpression(filter=Filter(
            field_name=d, string_filter=Filter.StringFilter(value=best[d])))
        for d in LONGEST_DIMS]))
    detail = report(client, target, metrics=["screenPageViews", "userEngagementDuration"],
                    date_range=date_range, dimension_filter=pin)
    d0 = detail[0] if detail else {}

    source = best["sessionSource"]
    return {
        "seconds": round(seconds),
        "engagementSeconds": round(d0.get("userEngagementDuration", 0)),
        "pageViews": int(d0.get("screenPageViews", 0)),
        "source": SOURCE_LABELS.get(source, source) or "출처 미상",
        "landing": best["landingPagePlusQueryString"],
        "device": DEVICE_LABELS.get(best["deviceCategory"], best["deviceCategory"]),
    }


def classify_section(path):
    path = path.split("?")[0].split("#")[0]
    if path in ("/", "/index.html", ""):
        return SECTION_MAIN
    for prefix, name in SECTION_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return name
    return SECTION_OTHER


def date_key(yyyymmdd):
    return f"{yyyymmdd[0:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:8]}"


def pct_delta(cur, prev):
    if not prev:
        return None
    return (cur - prev) / prev * 100


UNRESOLVED_SOURCES = {"(not set)", "(data not available)", ""}
SOURCE_LABELS = {"(direct)": "직접 방문"}
DEVICE_LABELS = {"mobile": "모바일", "desktop": "데스크톱", "tablet": "태블릿"}

SPIKE_MIN_VIEWS = 5
SPIKE_RATIO = 2.0
RATIO_FLOOR = 1.0
RECENT_DAYS = 7
RISING_MIN_AVG = 2.0
RISING_RATIO = 1.5
RISING_MIN_DAYS = 3
BAND_PCT = (10, 90)
LONG_START = "2020-01-01"
LIST_PAGE_RE = re.compile(r"(카테고리|태그)의 글 목록|^태그 목록$|^방명록$")
DEBUG_SOURCES = {"tagassistant.google.com"}
MIN_DAYS_FOR_NORMAL = 14
MIN_USERS_FOR_DEPTH = 5
MIN_GROUP_USERS = 2


def josa(word, with_final, without_final):
    tail = (word or "").strip()
    while True:
        cut = re.sub(r"\s*(\([^()]*\)|\[[^\[\]]*\])$", "", tail).rstrip("'\"」』.… \t")
        if cut == tail or not cut:
            break
        tail = cut
    if not tail:
        return f"{with_final}({without_final})"
    last = tail[-1]
    if "가" <= last <= "힣":
        return with_final if (ord(last) - 0xAC00) % 28 else without_final
    if last.isdigit():
        return with_final if last in "0136789" else without_final
    low = last.lower()
    if low in "aeiouwyr":
        return without_final
    if low in "lmn":
        return with_final
    return f"{with_final}({without_final})"


def quartiles(values):
    if not values:
        return None
    ordered = sorted(values)
    n = len(ordered)
    if n >= 4:
        cuts = statistics.quantiles(ordered, n=100, method="inclusive")
        lo, hi = cuts[BAND_PCT[0] - 1], cuts[BAND_PCT[1] - 1]
    else:
        lo = hi = statistics.median(ordered)
    return {"median": statistics.median(ordered), "lo": lo, "hi": hi,
            "min": ordered[0], "max": ordered[-1], "n": n}


def standing(value, box):
    if not box:
        return None
    rank = sum(1 for v in box["_values"] if v > value) + 1
    if value > box["hi"]:
        where = "high"
    elif value < box["lo"]:
        where = "low"
    else:
        where = "usual"
    out = {k: v for k, v in box.items() if not k.startswith("_")}
    out.update({"value": value, "rank": rank, "where": where,
                "vsMedian": pct_delta(value, box["median"])})
    return out


def distribution(values, yday_value):
    box = quartiles(values)
    if box is None:
        return None
    box["_values"] = values
    return standing(yday_value, box)


def rising_state(full):
    if len(full) < RECENT_DAYS * 2:
        return None
    roll = [sum(full[e - RECENT_DAYS + 1:e + 1]) / RECENT_DAYS
            for e in range(RECENT_DAYS - 1, len(full))]
    now, before = roll[-1], sum(full[:-RECENT_DAYS]) / (len(full) - RECENT_DAYS)
    above = sum(1 for v in full[-RECENT_DAYS:] if v > max(before, RATIO_FLOOR))
    if (now >= RISING_MIN_AVG and now >= RISING_RATIO * max(before, RATIO_FLOOR)
            and now > max(roll[:-1]) and above >= RISING_MIN_DAYS):
        return {"avg7": round(now, 1), "before": round(before, 1),
                "beforeDays": len(full) - RECENT_DAYS}
    return None


def fetch(client, target, age=1, include_settled=True):
    data = {}

    yday = totals(client, target, day_range(age),
                  ["activeUsers", "newUsers", "sessions", "screenPageViews"])
    daily_rows = report(client, target, dimensions=["date"],
                        metrics=["activeUsers", "sessions", "screenPageViews"],
                        date_range=trend_range(age), order_by=("date", False))
    got = {date_key(r["date"]): r for r in daily_rows}
    data["daily"] = []
    if got:
        day = date.fromisoformat(min(got))
        end = max(date.fromisoformat(max(got)), datetime.now(KST).date() - timedelta(days=age))
        while day <= end:
            r = got.get(day.isoformat(), {})
            data["daily"].append({"date": day.isoformat(), "users": int(r.get("activeUsers", 0)),
                                  "sessions": int(r.get("sessions", 0)),
                                  "views": int(r.get("screenPageViews", 0))})
            day += timedelta(days=1)

    yday_date = data["daily"][-1]["date"] if data["daily"] else None
    data["yesterday"] = {
        "date": yday_date,
        "users": int(yday["activeUsers"]),
        "newUsers": int(yday["newUsers"]),
        "sessions": int(yday["sessions"]),
        "views": int(yday["screenPageViews"]),
    }

    per_user = [(d["views"] / d["users"] if d["users"] else 0.0) for d in data["daily"]]
    pu_value = per_user[-1] if per_user else 0.0
    data["baseline"] = {
        "users": distribution([d["users"] for d in data["daily"]],
                              data["yesterday"]["users"]),
        "views": distribution([d["views"] for d in data["daily"]],
                              data["yesterday"]["views"]),
        "sessions": distribution([d["sessions"] for d in data["daily"]],
                                 data["yesterday"]["sessions"]),
        "perUser": distribution(per_user, pu_value),
    }

    page_dims = (["hostName", "pagePath", "pageTitle"] if target.split_hosts
                 else [target.page_dimension])

    def clean_title(raw):
        t = (raw or "").strip()
        if t.endswith(SITE_TITLE_SUFFIX):
            t = t[:-len(SITE_TITLE_SUFFIX)].strip()
        return t

    page_rows = report(client, target, dimensions=page_dims,
                       metrics=["screenPageViews", "activeUsers"],
                       date_range=day_range(age), order_by=("screenPageViews", True), limit=15)
    page_rows = [r for r in page_rows if r["screenPageViews"] > 0]

    prior_key = ["hostName", "pagePath"] if target.split_hosts else [target.page_dimension]
    prior_days = max(1, len(data["daily"]) - 1)
    span = prior_days + RECENT_DAYS
    prior_dates = []
    if yday_date:
        y0 = date.fromisoformat(yday_date)
        prior_dates = [(y0 - timedelta(days=k)).isoformat() for k in range(span, 0, -1)]
    date_idx = {d: i for i, d in enumerate(prior_dates)}
    prior_series = {}
    for r in report(client, target, dimensions=prior_key + ["date"], metrics=["screenPageViews"],
                    date_range=(f"{age + span}daysAgo", f"{age + 1}daysAgo"), limit=20000):
        i = date_idx.get(date_key(r["date"]))
        if i is None:
            continue
        series = prior_series.setdefault(tuple(r[k] for k in prior_key), [0] * len(prior_dates))
        series[i] += int(r["screenPageViews"])

    if target.split_hosts:
        data["ydayPages"] = [
            {"name": r["pagePath"], "title": clean_title(r.get("pageTitle")),
             "host": r["hostName"],
             "section": (classify_section(r["pagePath"]) if r["hostName"] == MAIN_HOST else "")
                        .replace(SECTION_OTHER, ""),
             "views": int(r["screenPageViews"]), "users": int(r["activeUsers"]),
             "_series": prior_series.get((r["hostName"], r["pagePath"]), [])}
            for r in page_rows
        ]
    else:
        data["ydayPages"] = [
            {"name": r[target.page_dimension] or "(제목 없음)", "title": "", "host": "",
             "section": "", "views": int(r["screenPageViews"]), "users": int(r["activeUsers"]),
             "list": bool(LIST_PAGE_RE.search(r[target.page_dimension] or "")),
             "_series": prior_series.get((r[target.page_dimension],), [])}
            for r in page_rows
        ]

    for p in data["ydayPages"]:
        series_all = p.pop("_series") or [0] * len(prior_dates)
        series = series_all[-prior_days:]
        p["priorAvg"] = sum(series) / prior_days
        recent = series[-RECENT_DAYS:]
        recent_avg = sum(recent) / len(recent) if recent else 0.0
        ratio = p["views"] / max(p["priorAvg"], RATIO_FLOOR)
        p["ratio"] = round(ratio, 1)
        p["spike"] = bool(p["priorAvg"] > 0 and p["views"] >= SPIKE_MIN_VIEWS
                          and ratio >= SPIKE_RATIO
                          and p["views"] / max(recent_avg, RATIO_FLOOR) >= SPIKE_RATIO)

        full = series_all + [p["views"]]
        window = prior_days + 1
        p["rising"] = None
        now_rising = rising_state(full[-window:])
        if now_rising and not any(rising_state(full[-window - k:-k])
                                  for k in range(1, RECENT_DAYS + 1)):
            p["rising"] = now_rising

    by_day = {}
    for r in report(client, target, dimensions=["date", "newVsReturning"],
                    metrics=["screenPageViews", "activeUsers"],
                    date_range=trend_range(age), limit=500):
        day = by_day.setdefault(date_key(r["date"]), {
            "newViews": 0, "newUsers": 0, "retViews": 0, "retUsers": 0, "otherViews": 0})
        kind = r["newVsReturning"]
        if kind == "new":
            day["newViews"] += int(r["screenPageViews"])
            day["newUsers"] += int(r["activeUsers"])
        elif kind == "returning":
            day["retViews"] += int(r["screenPageViews"])
            day["retUsers"] += int(r["activeUsers"])
        else:
            day["otherViews"] += int(r["screenPageViews"])
    data["_visitorsByDay"] = by_day

    data["ydaySites"] = []
    if target.split_hosts:
        data["ydaySites"] = [
            {"name": r["hostName"], "views": int(r["screenPageViews"])}
            for r in report(client, target, dimensions=["hostName"],
                            metrics=["screenPageViews"], date_range=day_range(age),
                            order_by=("screenPageViews", True), limit=10)
        ]

    sources, unresolved = [], 0
    for r in report(client, target, dimensions=["sessionSource"],
                    metrics=["sessions"], date_range=day_range(age),
                    order_by=("sessions", True), limit=25):
        name = r["sessionSource"] or ""
        n = int(r["sessions"])
        if name in UNRESOLVED_SOURCES:
            unresolved += n
        else:
            sources.append({"name": SOURCE_LABELS.get(name, name), "sessions": n})
    data["ydaySources"] = sources
    data["ydayUnresolved"] = unresolved

    data["_scope"] = target.label
    data["_priorSources"] = sorted({
        r["sessionSource"] for r in report(
            client, target, dimensions=["sessionSource"], metrics=["sessions"],
            date_range=prior_range(age), order_by=("sessions", True), limit=200)
        if r["sessionSource"] and r["sessionSource"] not in UNRESOLVED_SOURCES
    })

    hours = [0] * 24
    for r in report(client, target, dimensions=["hour"], metrics=["sessions"],
                    date_range=day_range(age), limit=24):
        try:
            hh = int(r["hour"])
        except ValueError:
            continue
        if 0 <= hh < 24:
            hours[hh] = int(r["sessions"])
    data["ydayHours"] = hours

    if include_settled:
        pattern = [0.0] * 24
        for r in report(client, target, dimensions=["hour"], metrics=["sessions"],
                        date_range=trend_range(age), limit=24):
            try:
                hh = int(r["hour"])
            except ValueError:
                continue
            if 0 <= hh < 24:
                pattern[hh] = r["sessions"]
        n_days = max(1, len(data["daily"]))
        data["hourPattern"] = [round(v / n_days, 2) for v in pattern]

        got = {date_key(r["date"]): (int(r["activeUsers"]), int(r["screenPageViews"]))
               for r in report(client, target, dimensions=["date"],
                               metrics=["activeUsers", "screenPageViews"],
                               date_range=(LONG_START, "yesterday"), limit=10000)
               if r["activeUsers"] or r["screenPageViews"]}
        days = []
        if got and data["daily"]:
            d0, end = date.fromisoformat(min(got)), date.fromisoformat(data["daily"][-1]["date"])
            while d0 <= end:
                k = d0.isoformat()
                days.append((k, *got.get(k, (0, 0))))
                d0 += timedelta(days=1)
        by_month = {}
        for d, u, v in days:
            m = by_month.setdefault(d[:7], [0, 0, 0])
            m[0] += u
            m[1] += v
            m[2] += 1
        data["months"] = [
            {"month": m, "users": round(u / n, 1), "views": round(v / n, 1), "days": n,
             "partial": n < calendar.monthrange(int(m[:4]), int(m[5:]))[1]}
            for m, (u, v, n) in sorted(by_month.items())
        ]

        week = data["daily"][-RECENT_DAYS:]
        prev = data["daily"][-RECENT_DAYS * 2:-RECENT_DAYS]
        if len(prev) == RECENT_DAYS:
            avg = lambda rows, k: round(sum(r[k] for r in rows) / len(rows), 1)
            data["weekCompare"] = {"users": avg(week, "users"), "prevUsers": avg(prev, "users"),
                                   "views": avg(week, "views"), "prevViews": avg(prev, "views")}

    data["longest"] = fetch_longest_visit(client, target, day_range(age))

    if include_settled:
        settled = totals(client, target, SETTLED,
                         ["engagementRate", "averageSessionDuration", "sessions"])
        data["settled"] = {
            "engagementRate": settled["engagementRate"],
            "avgDuration": settled["averageSessionDuration"],
            "sessions": int(settled["sessions"]),
            "from": SETTLED[0], "to": SETTLED[1],
        }

    return data


def build_insights(data, day_label="어제", confirmed=False):
    out = []
    y = data["yesterday"]
    if not y["date"]:
        return out

    day_at = day_label if day_label == "어제" else f"{day_label}에"

    def page_label(p):
        return p["section"] or p["title"] or p["name"]

    pages = [p for p in data["ydayPages"] if not p.get("list")]
    spikes = [p for p in pages if p["spike"]]
    top = None
    if spikes:
        top = max(spikes, key=lambda p: p["views"] - p["priorAvg"])
        label = page_label(top)
        head = f"{label}{josa(label, '이', '가')} {day_label} "
        rise = top.get("rising")
        rise_tail = (f" 최근 {RECENT_DAYS}일 하루 평균도 {rise['avg7']:.1f}회로 늘었습니다."
                     if rise else "")
        if top["priorAvg"] < RATIO_FLOOR:
            text = (head + f"**{top['views']:,}회** — 평소 하루 1회도 안 보던 페이지"
                    + ("인데," + rise_tail if rise else "입니다."))
        else:
            text = (head + f"{top['views']:,}회 — 평소 하루 {top['priorAvg']:.1f}회 보던 페이지라 "
                    f"**{top['ratio']:.1f}배**로 " + ("뛰었고," + rise_tail if rise else "뛰었습니다."))
        out.append({"tone": "up", "text": text})

    risers = [p for p in pages if p.get("rising") and p is not top]
    if risers:
        r = max(risers, key=lambda p: p["rising"]["avg7"] - p["rising"]["before"])
        label, ri = page_label(r), r["rising"]
        out.append({
            "tone": "up",
            "text": f"{label}{josa(label, '은', '는')} 최근 {RECENT_DAYS}일 하루 평균 "
                    f"**{ri['avg7']:.1f}회**로 늘었습니다(그 전 {ri['beforeDays']}일 "
                    + (f"하루 {ri['before']:.1f}회)." if ri["before"] >= 0.1 else "거의 0회)."),
        })

    def record(value, others):
        if not others:
            return None
        if value > max(others):
            return "high"
        if value < min(others):
            return "low"
        return None

    pu_others = [d["views"] / d["users"] for d in data["daily"]
                 if d["date"] != y["date"] and d["users"]]
    pu_value = y["views"] / y["users"] if y["users"] else 0.0
    rec = record(pu_value, pu_others) if y["users"] >= MIN_USERS_FOR_DEPTH else None
    if rec:
        deeper = rec == "high"
        edge = max(pu_others) if deeper else min(pu_others)
        out.append({
            "tone": "flat",
            "text": f"{day_label} 한 사람당 본 장수가 최근 {len(pu_others) + 1}일 중 "
                    f"**가장 {'많습니다' if deeper else '적습니다'}**"
                    f"(다른 날 {'최고' if deeper else '최저'} {edge:.1f}장).",
        })

    def ret_share(v):
        total = v["newViews"] + v["retViews"] + v["otherViews"]
        if not total or v["otherViews"] / total >= 0.2 or not (v["newViews"] + v["retViews"]):
            return None
        return v["retViews"] / total

    vbd = data.get("_visitorsByDay", {})
    today = vbd.get(y["date"])
    share = ret_share(today) if today else None
    groups_ok = (today and y["users"] >= MIN_USERS_FOR_DEPTH
                 and today["newUsers"] >= MIN_GROUP_USERS
                 and today["retUsers"] >= MIN_GROUP_USERS)
    others = [s for d, v in vbd.items() if d != y["date"]
              for s in [ret_share(v)] if s is not None]
    rec = record(share, others) if share is not None and groups_ok else None
    if rec:
        high = rec == "high"
        edge = max(others) if high else min(others)
        span = (f"최근 {len(others) + 1}일" if len(others) + 1 >= len(data["daily"])
                else f"최근 {len(data['daily'])}일 가운데 분류가 끝난 {len(others) + 1}일")
        out.append({
            "tone": "flat",
            "text": f"{day_label} 조회 가운데 재방문자 몫이 **{share * 100:.0f}%**입니다 — "
                    f"{span} 중 가장 {'높습니다' if high else '낮습니다'}"
                    f"(다른 날 {'최고' if high else '최저'} {edge * 100:.0f}%)."
                    + ("" if high else " 새로 온 사람들이 대부분을 봤습니다."),
        })

    prior = set(data.get("_priorSources", []))
    fresh = [s for s in data["ydaySources"] if s["name"] not in prior and s["name"] not in DEBUG_SOURCES
             and s["name"] != SOURCE_LABELS["(direct)"]]
    if prior and fresh:
        names = ", ".join(s["name"] for s in fresh[:3])
        out.append({
            "tone": "up",
            "text": f"{data.get('_scope', '이 사이트')}에 최근 {TREND_DAYS}일 동안 없던 유입원이 {day_at} 생겼습니다 — {names}.",
        })

    others = [d["users"] for d in data["daily"] if d["date"] != y["date"]]
    rec = record(y["users"], others)
    if rec:
        many = rec == "high"
        edge = max(others) if many else min(others)
        out.append({
            "tone": "up" if many else "down",
            "text": f"{day_label} 방문자가 최근 {len(others) + 1}일 중 "
                    f"**가장 {'많습니다' if many else '적습니다'}**(다른 날 {'최고' if many else '최저'} "
                    f"{edge:,}명).",
        })

    resolved = sum(s["sessions"] for s in data["ydaySources"])
    total = resolved + data["ydayUnresolved"]
    if total and data["ydayUnresolved"] / total > 0.5:
        if confirmed:
            out.append({
                "tone": "down",
                "text": f"{day_label} 유입 가운데 **{data['ydayUnresolved']:,}건**은 GA4가 재처리를 "
                        f"마친 뒤에도 출처가 끝내 분류되지 않았습니다(분류된 것은 {resolved:,}건) — "
                        f"흔치 않은 일이니 계측(GTM) 설정을 점검해 볼 만합니다.",
            })
        else:
            out.append({
                "tone": "down",
                "text": f"{day_label} 유입 가운데 **{data['ydayUnresolved']:,}건**은 출처가 아직 "
                        f"분류되지 않았습니다(분류된 것은 {resolved:,}건) — GA4가 세션 속성을 "
                        f"확정하는 데 하루 이상 걸립니다. 이 값은 내일 자동으로 다시 확인됩니다.",
            })

    if not out:
        days = len(data["daily"])
        if days < MIN_DAYS_FOR_NORMAL:
            out.append({
                "tone": "flat",
                "text": f"아직 {days}일치만 쌓여서 '평소'를 가릴 기준이 얇습니다 — "
                        f"견줄 만한 문장은 데이터가 더 모이면 나옵니다.",
            })
        else:
            out.append({
                "tone": "flat",
                "text": f"{day_label}{'는' if day_label == '어제' else '은'} 평소와 크게 다른 점이 없었습니다 — 방문자도 "
                        "페이지별 조회수도 늘 보던 범위 안입니다.",
            })

    return out


WEEK = 7
WEEKLY_SPAN = 35
SHIFT_RATIO = 2.0
SHIFT_MIN = 15
SEARCH_RATIO = 1.5
SEARCH_MIN = 5
CHANNEL_LABELS = {"Direct": "직접 들어온 방문", "Referral": "다른 사이트 링크로 온 방문",
                  "Organic Social": "소셜에서 온 방문"}
ENGINE_LABELS = {"naver": "네이버", "m.search.naver.com": "네이버", "search.naver.com": "네이버",
                 "google": "구글", "daum": "다음", "bing": "빙"}
GAME_NAMES = {"suiko": "환세취호전", "suiko-jp": "환세취호전 일본어 원판", "suiko-demo": "환세취호전 체험판",
              "hukyou": "환세풍광전", "kitan": "환세희담", "kitan-opening": "환세희담 오프닝",
              "kaitou": "환세쾌도전", "torimono": "환세포물장", "kaisin": "환세쾌진극"}
MILESTONE_STEPS = (120, 60, 30, 15, 5)


def fetch_weekly(client, target):
    end = datetime.now(KST).date() - timedelta(days=1)
    dates = [(end - timedelta(days=k)).isoformat() for k in range(WEEKLY_SPAN - 1, -1, -1)]
    idx = {d: i for i, d in enumerate(dates)}
    series = {}
    for r in report(client, target, dimensions=["date", "sessionDefaultChannelGroup"], metrics=["sessions"],
                    date_range=(f"{WEEKLY_SPAN}daysAgo", "yesterday"), limit=5000):
        i = idx.get(date_key(r["date"]))
        if i is not None:
            series.setdefault(r["sessionDefaultChannelGroup"], [0] * WEEKLY_SPAN)[i] += int(r["sessions"])

    def by_host(rng):
        out = {}
        for r in report(client, target, dimensions=["sessionDefaultChannelGroup", "hostName", "newVsReturning"],
                        metrics=["sessions"], date_range=rng, limit=1000):
            ch = out.setdefault(r["sessionDefaultChannelGroup"], {})
            h = ch.setdefault(r["hostName"], {"sessions": 0, "returning": 0})
            h["sessions"] += int(r["sessions"])
            if r["newVsReturning"] == "returning":
                h["returning"] += int(r["sessions"])
        return out

    sources = {}
    for r in report(client, target, dimensions=["sessionDefaultChannelGroup", "sessionSource"], metrics=["sessions"],
                    date_range=(f"{WEEK}daysAgo", "yesterday"), limit=500):
        sources.setdefault(r["sessionDefaultChannelGroup"], {})[r["sessionSource"]] = int(r["sessions"])

    games = {}
    try:
        for r in report(client, target, dimensions=["eventName", "customEvent:game", "customEvent:minutes"],
                        metrics=["totalUsers"], date_range=(f"{WEEK}daysAgo", "yesterday"), limit=1000):
            g = r["customEvent:game"]
            if g not in GAME_NAMES:
                continue
            key = r["eventName"]
            if key == "play_milestone":
                key = f"play_{r['customEvent:minutes']}"
            games.setdefault(g, {})[key] = games.get(g, {}).get(key, 0) + int(r["totalUsers"])
    except Exception:  # noqa: BLE001
        games = {}

    return {"series": series, "cur": by_host((f"{WEEK}daysAgo", "yesterday")),
            "prev": by_host((f"{WEEK * 2}daysAgo", f"{WEEK + 1}daysAgo")),
            "sources": sources, "games": games}


def weekly_insights(w, scope, recent_keys, said_today=()):
    out = []
    n = WEEKLY_SPAN

    def win(ch, k, back=0):
        s = w["series"].get(ch, [0] * n)
        end = n - k - back * WEEK
        return sum(s[max(0, end - WEEK):end])

    def shift(ch, k):
        cur, prev = win(ch, k), win(ch, k, 1)
        if abs(cur - prev) < SHIFT_MIN:
            return None
        if cur >= SHIFT_RATIO * max(prev, 1):
            return "up"
        if cur * SHIFT_RATIO <= prev:
            return "down"
        return None

    shifts = []
    for ch, label in CHANNEL_LABELS.items():
        way = shift(ch, 0)
        key = f"channel:{ch}:{way}"
        if not way or key in recent_keys:
            continue
        cur, prev = win(ch, 0), win(ch, 0, 1)
        hc, hp = w["cur"].get(ch, {}), w["prev"].get(ch, {})
        diffs = {h: hc.get(h, {}).get("sessions", 0) - hp.get(h, {}).get("sessions", 0) for h in set(hc) | set(hp)}
        host, ret = None, None
        if len(diffs) > 1:
            top = max(diffs, key=lambda h: diffs[h] if way == "up" else -diffs[h])
            if diffs[top] * (cur - prev) > 0:
                host = top
                h = hc.get(top, {})
                if way == "up" and h.get("sessions"):
                    ret = round(h["returning"] * 100 / h["sessions"])
        shifts.append({"label": label, "way": way, "key": key, "cur": cur, "prev": prev,
                       "host": host, "diff": diffs.get(host, 0), "ret": ret})

    pairs = []
    for up in [x for x in shifts if x["way"] == "up" and x["host"]]:
        down = next((x for x in shifts if x["way"] == "down" and x["host"] == up["host"]
                     and not any(x in p for p in pairs)), None)
        if down:
            pairs.append((up, down))
    for up, down in pairs:
        text = (f"{up['label']}이 그 전 7일의 **{up['cur'] / max(up['prev'], 1):.1f}배**({up['prev']}→{up['cur']}세션)로 "
                f"늘고, {down['label']}은 절반 아래({down['prev']}→{down['cur']}세션)로 줄었습니다. "
                f"둘 다 {up['host']}에서 가장 크게 바뀌었습니다({up['diff']:+d}·{down['diff']:+d}세션)"
                + (f" — 그곳 {up['label']}의 {up['ret']}%가 재방문입니다." if up["ret"] is not None else "."))
        out.append({"tone": "flat", "text": text, "key": f"{up['key']} {down['key']}", "span": "week"})
    for x in shifts:
        if any(x in p for p in pairs):
            continue
        if x["way"] == "up":
            text = f"{x['label']}이 그 전 7일의 **{x['cur'] / max(x['prev'], 1):.1f}배**입니다({x['prev']}→{x['cur']}세션)."
        else:
            text = f"{x['label']}이 그 전 7일의 절반 아래로 줄었습니다({x['prev']}→**{x['cur']}세션**)."
        if x["host"]:
            text += (f" 가장 많이 {'늘어난' if x['way'] == 'up' else '줄어든'} 곳은 {x['host']}({x['diff']:+d}세션)"
                     + (f"이고, 그곳 세션의 {x['ret']}%가 재방문입니다." if x["ret"] is not None else "입니다."))
        out.append({"tone": x["way"], "text": text, "key": x["key"], "span": "week"})

    def search_state(k):
        cur = win("Organic Search", k)
        avg = sum(win("Organic Search", k, b) for b in (1, 2, 3)) / 3
        if abs(cur - avg) < SEARCH_MIN:
            return None
        if cur >= SEARCH_RATIO * max(avg, 1):
            return "up"
        if cur * 2 <= avg:
            return "down"
        return None

    way = search_state(0)
    key = f"search:{way}"
    if way and key not in recent_keys:
        cur = win("Organic Search", 0)
        avg = sum(win("Organic Search", 0, b) for b in (1, 2, 3)) / 3
        eng = {}
        for src, v in w["sources"].get("Organic Search", {}).items():
            name = ENGINE_LABELS.get(src, src)
            eng[name] = eng.get(name, 0) + v
        engines = ", ".join(f"{k} {v}" for k, v in sorted(eng.items(), key=lambda kv: -kv[1]))
        if way == "up":
            text = (f"검색 유입이 **{cur}세션**으로, 그 전 3주 평균(주 {avg:.0f}세션)의 "
                    f"{cur / max(avg, 1):.1f}배입니다" + (f" — {engines}." if engines else "."))
        else:
            text = f"검색 유입이 **{cur}세션**으로, 그 전 3주 평균(주 {avg:.0f}세션)의 절반 아래입니다."
        out.append({"tone": "up" if way == "up" else "down", "text": text, "key": key, "span": "week"})

    def ai_new(k):
        cur = win("AI Assistant", k)
        return cur > 0 and cur > max(win("AI Assistant", k, b) for b in (1, 2, 3))

    ai_srcs = sorted(w["sources"].get("AI Assistant", {}))
    said = " ".join(i["text"] for i in said_today)
    if (ai_new(0) and "ai:up" not in recent_keys
            and not (ai_srcs and all(src in said for src in ai_srcs))):
        cur = win("AI Assistant", 0)
        mx = max(win("AI Assistant", 0, b) for b in (1, 2, 3))
        before = f"주 최대 {mx}세션이었습니다" if mx else "없었습니다"
        out.append({"tone": "up", "key": "ai:up", "span": "week",
                    "text": f"{scope}에 AI 어시스턴트에서 온 방문이 **{cur}세션**입니다"
                            + (f"({', '.join(ai_srcs)})" if ai_srcs else "") + f" — 그 전 3주에는 {before}."})
    return out


def weekly_games(w):
    rows = []
    for g, d in w["games"].items():
        if not d.get("emulator_start"):
            continue
        top = next((m for m in MILESTONE_STEPS if d.get(f"play_{m}")), None)
        rows.append({"game": GAME_NAMES[g], "start": d["emulator_start"], "save": d.get("save_created", 0),
                     "restore": d.get("save_restored", 0),
                     "longest": {"minutes": top, "users": d[f"play_{top}"]} if top else None})
    return sorted(rows, key=lambda r: -r["start"])


SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
FEEDBACK_RANGE = "A1:J1000"
FEEDBACK_KEYS = ("시각", "분류", "게임", "확인")
FEEDBACK_DATE_RE = re.compile(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})")


def _sheet_values(creds, sheet_id, cell_range):
    import google.auth.transport.requests

    scoped = creds.with_scopes([SHEETS_SCOPE])
    scoped.refresh(google.auth.transport.requests.Request())
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}"
           f"/values/{cell_range}")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {scoped.token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8")).get("values", [])


def fetch_feedback(creds, sheet_id):
    out = {"available": False, "updatedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
           "sheetUrl": f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"}
    try:
        rows = _sheet_values(creds, sheet_id, FEEDBACK_RANGE)
    except Exception as err:  # noqa: BLE001
        out["error"] = f"{type(err).__name__}"
        if isinstance(err, urllib.error.HTTPError):
            out["status"] = err.code
            try:
                body = json.loads(err.read().decode("utf-8")).get("error", {})
                reasons = [d.get("reason") for d in body.get("details", []) if d.get("reason")]
                out["reason"] = reasons[0] if reasons else body.get("status")
            except Exception:  # noqa: BLE001
                pass
        print(f"  피드백 시트를 읽지 못해 건너뜁니다: {err} "
              f"({out.get('reason') or '원인 미상'})", file=sys.stderr)
        return out

    header_at = next((i for i, r in enumerate(rows[:10])
                      if "확인" in r and "시각" in r), None)
    if header_at is None:
        out["error"] = "header-not-found"
        print("  피드백 시트에서 헤더(시각…확인)를 못 찾아 건너뜁니다", file=sys.stderr)
        return out

    header = rows[header_at]
    idx = {k: header.index(k) for k in FEEDBACK_KEYS if k in header}

    def cell(row, key):
        i = idx.get(key)
        return row[i].strip() if i is not None and i < len(row) else ""

    pending, total, oldest = [], 0, None
    for row in rows[header_at + 1:]:
        when = cell(row, "시각")
        if not when:
            continue
        total += 1
        if cell(row, "확인").upper() == "TRUE":
            continue
        pending.append({"category": cell(row, "분류") or "(미분류)",
                        "game": cell(row, "게임") or "(미상)"})
        m = FEEDBACK_DATE_RE.match(when)
        if m:
            try:
                d = date(*(int(g) for g in m.groups()))
            except ValueError:
                continue
            oldest = d if oldest is None or d < oldest else oldest

    def tally(key):
        return [{"name": n, "count": c}
                for n, c in Counter(p[key] for p in pending).most_common()]

    out.update({
        "available": True,
        "total": total,
        "pending": {
            "count": len(pending),
            "byCategory": tally("category"),
            "byGame": tally("game"),
            "oldest": oldest.isoformat() if oldest else None,
            "oldestDays": (datetime.now(KST).date() - oldest).days if oldest else None,
        },
    })
    return out


HISTORY_KEEP = ("yesterday", "baseline", "ydayPages", "ydaySites",
                "ydaySources", "ydayUnresolved", "ydayHours", "insights", "confirmed",
                "longest")


def snapshot_shape(data):
    return {k: data[k] for k in HISTORY_KEEP if k in data}


def _load_prior_history(path):
    if not path.exists():
        return {}
    try:
        text = path.read_text(encoding="utf-8")
        body = text.split("=", 2)[2].strip().rstrip(";")
        return json.loads(body).get("history", {})
    except Exception as err:  # noqa: BLE001
        print(f"  {path.name}의 이전 history 를 못 읽어 새로 시작합니다: "
              f"{type(err).__name__}", file=sys.stderr)
        return {}


def main():
    creds = load_credentials()
    client = BetaAnalyticsDataClient(credentials=creds)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for target in build_targets():
        path = OUTPUT_DIR / f"{target.key}.js"
        history = _load_prior_history(path)

        data = fetch(client, target, age=1)
        data["confirmed"] = False
        data["insights"] = build_insights(data, day_label="어제", confirmed=False)
        week_cut = (datetime.now(KST).date() - timedelta(days=WEEK)).isoformat()
        recent_keys = {k for d, h in history.items() if week_cut < d < (data["yesterday"]["date"] or "")
                       for i in h.get("insights", []) for k in (i.get("key") or "").split()}
        weekly = fetch_weekly(client, target)
        data["insights"] += weekly_insights(weekly, target.label, recent_keys, data["insights"])
        data["games"] = weekly_games(weekly)
        if data["yesterday"]["date"]:
            history[data["yesterday"]["date"]] = snapshot_shape(data)

        day2 = fetch(client, target, age=HISTORY_REFRESH_AGE, include_settled=False)
        day2_date = day2["yesterday"]["date"]
        if day2_date:
            day2_label = mmdd(day2_date)
            day2["confirmed"] = True
            day2["insights"] = build_insights(day2, day_label=day2_label, confirmed=True) + [
                i for i in history.get(day2_date, {}).get("insights", []) if i.get("key")]
            history[day2_date] = snapshot_shape(day2)

        cutoff = (datetime.now(KST).date() - timedelta(days=TREND_DAYS)).isoformat()
        data["history"] = {d: v for d, v in history.items() if d >= cutoff}

        data["meta"] = {
            "key": target.key,
            "label": target.label,
            "updatedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
            "propertyId": target.property_id,
            "trendDays": TREND_DAYS,
            "settledDays": 7,
        }

        data = {k: v for k, v in data.items() if not k.startswith("_")}

        body = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True)
        path.write_text(
            f"window.DASHBOARD_DATA = window.DASHBOARD_DATA || {{}};\n"
            f"window.DASHBOARD_DATA['{target.key}'] = {body};\n",
            encoding="utf-8")
        print(f"Wrote {path} ({path.stat().st_size:,} bytes) "
              f"— {target.label} / 속성 {target.property_id} "
              f"/ history {len(data['history'])}일")

    sheet_id = os.environ.get("FEEDBACK_SHEET_ID", "").strip()
    feedback = (fetch_feedback(creds, sheet_id) if sheet_id
                else {"available": False, "error": "no-sheet-id"})
    fb_path = OUTPUT_DIR / "feedback.js"
    fb_path.write_text(
        f"window.DASHBOARD_FEEDBACK = "
        f"{json.dumps(feedback, ensure_ascii=False, indent=1, sort_keys=True)};\n",
        encoding="utf-8")
    state = (f"미확인 {feedback['pending']['count']}건 / 전체 {feedback['total']}건"
             if feedback.get("available") else f"건너뜀({feedback.get('error')})")
    print(f"Wrote {fb_path} ({fb_path.stat().st_size:,} bytes) — 피드백 / {state}")


if __name__ == "__main__":
    main()
