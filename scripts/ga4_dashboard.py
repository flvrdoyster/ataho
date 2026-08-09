#!/usr/bin/env python3
"""
atah.io GA4 데이터 수집기.

GA4(Google Analytics 4) Data API에서 지표를 읽어 dashboard/data/ga4.js 로
저장한다. 페이지(dashboard/index.html)는 손으로 관리하고, 이 스크립트는
데이터만 덮어쓴다 — 자동 커밋 diff가 데이터에만 남도록.

출력 형식은 `window.DASHBOARD_DATA['<key>'] = {...};` 인 JS 파일이다(JSON 아님).
fetch()가 아니라 <script src>로 읽히므로 로컬에서 index.html을 그냥 열어도 동작한다.

자격 증명 (둘 중 하나):
  - GA4_SERVICE_ACCOUNT_JSON   서비스 계정 키 JSON 전문을 담은 환경변수 (CI)
  - GA4_SERVICE_ACCOUNT_FILE   키 파일 경로 (로컬 테스트용)

수집 대상은 GA4 속성 하나당 하나이고, 각각 dashboard/data/<key>.js 로 나온다.
사이트(ga4)는 항상 돌고, 블로그(blog)는 속성 ID가 주어졌을 때만 돈다.

기타 설정:
  - GA4_PROPERTY_ID        사이트 속성 ID (기본: 516513119)
  - GA4_BLOG_PROPERTY_ID   블로그 속성 ID (없으면 블로그는 건너뜀)
  - GA4_OUTPUT_DIR         저장 폴더 (기본: dashboard/data, 레포 루트 기준)
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone
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

# 비교 구간은 모두 "어제"로 끝난다 — 오늘은 아직 진행 중이라 섞으면 항상 감소로 보인다.
TREND_DAYS = 28
CUR = ("7daysAgo", "yesterday")        # 최근 7일
PREV = ("14daysAgo", "8daysAgo")       # 그 전 7일
TREND = (f"{TREND_DAYS}daysAgo", "yesterday")

def host_regex(pattern):
    return FilterExpression(filter=Filter(
        field_name="hostName",
        string_filter=Filter.StringFilter(
            match_type=Filter.StringFilter.MatchType.FULL_REGEXP, value=pattern),
    ))


# 사이트 속성은 atah.io / pc98.atah.io / suiko.atah.io 세 호스트를 함께 받는다.
# 여기에 localhost·사설 IP(개발 중 자기 방문)까지 섞이면 숫자가 부풀기 때문에
# 모든 리포트에 호스트 필터를 건다. 블로그는 속성 자체가 분리돼 있지만, 스킨을
# 로컬에서 미리보기 할 때가 있어 같은 방식으로 막는다.
SITE_HOSTS = host_regex(r"^([a-z0-9-]+\.)*atah\.io$")
BLOG_HOSTS = host_regex(r"^([a-z0-9-]+\.)*tistory\.com$")
MAIN_HOST = "atah.io"

# pagePath 접두사 → 사이트 코너 이름. 위에서부터 첫 일치를 쓴다.
# atah.io 안에서만 쓴다 (다른 호스트는 사이트 단위로 따로 센다).
SECTION_PREFIXES = [
    ("/haiyuki_web", "환세패유기 (웹)"),
    ("/haiyuki_manual", "환세패유기 해설서"),
    ("/balance", "미니게임 · 균형잡기"),
    ("/sweep", "미니게임 · 술창고 청소"),
    ("/swim", "미니게임 · 헤엄치기"),
    ("/scene_viewer", "씬 뷰어"),
    ("/world", "월드 (에디터/뷰어)"),
    ("/dashboard", "대시보드"),
]
SECTION_MAIN = "메인 (아타호의 거처)"
SECTION_OTHER = "기타"
WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"]


class Target:
    """수집 대상 하나 = GA4 속성 하나 = 데이터 파일 하나(dashboard/data/<key>.js).

    사이트와 블로그는 성격이 달라서 화면 구성도 다르다:
    - 사이트는 호스트가 셋이라 사이트별·코너별로 나눠 볼 값이 있다.
    - 블로그는 호스트가 하나뿐이라 그 둘이 무의미하고, 대신 인기 목록을
      경로가 아니라 글 제목으로 봐야 한다 (/entry/123 만 봐선 무슨 글인지 모른다).
    """

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

    # 블로그 속성은 아직 없을 수도 있다 — ID가 없으면 조용히 건너뛴다.
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
           order_by=None, limit=None):
    """run_report 한 번 → [{dim_name: str, metric_name: float}, ...] 로 평탄화.

    대상의 호스트 필터는 여기서 항상 AND로 붙는다 — 호출부가 빠뜨릴 수 없게.
    """
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
    ))

    rows = []
    for r in resp.rows:
        row = {d: r.dimension_values[i].value for i, d in enumerate(dimensions)}
        for i, m in enumerate(metrics):
            row[m] = float(r.metric_values[i].value or 0)
        rows.append(row)
    return rows


def totals(client, target, date_range):
    """구간 전체 합계 한 줄. 차원이 없으면 GA4는 총계 한 행만 돌려준다."""
    metrics = ["activeUsers", "newUsers", "sessions", "screenPageViews",
               "engagementRate", "averageSessionDuration"]
    rows = report(client, target, metrics=metrics, date_range=date_range)
    return rows[0] if rows else {m: 0.0 for m in metrics}


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
    """증감률(%). 이전 구간이 0이면 비율이 무의미하므로 None."""
    if not prev:
        return None
    return (cur - prev) / prev * 100


def fetch(client, target):
    data = {}

    # --- 1) 요약: 최근 7일 vs 그 전 7일 ---------------------------------
    cur, prev = totals(client, target, CUR), totals(client, target, PREV)
    data["summary"] = {
        key: {
            "cur": cur.get(key, 0.0),
            "prev": prev.get(key, 0.0),
            "delta": pct_delta(cur.get(key, 0.0), prev.get(key, 0.0)),
        }
        for key in ("activeUsers", "newUsers", "sessions", "screenPageViews",
                    "engagementRate", "averageSessionDuration")
    }

    # --- 2) 일별 추세 28일 ----------------------------------------------
    rows = report(client, target, dimensions=["date"],
                  metrics=["activeUsers", "newUsers", "sessions", "screenPageViews",
                           "engagementRate", "averageSessionDuration"],
                  date_range=TREND, order_by=("date", False))
    data["daily"] = [
        {
            "date": date_key(r["date"]),
            "users": int(r["activeUsers"]),
            "newUsers": int(r["newUsers"]),
            "sessions": int(r["sessions"]),
            "views": int(r["screenPageViews"]),
            "engagementRate": r["engagementRate"],
            "avgDuration": r["averageSessionDuration"],
        }
        for r in rows
    ]

    # --- 3) 유입 채널 / Referral 소스 (최근 7일) -------------------------
    data["channels"] = [
        {"name": r["sessionDefaultChannelGroup"] or "(기타)",
         "sessions": int(r["sessions"]), "users": int(r["activeUsers"])}
        for r in report(client, target, dimensions=["sessionDefaultChannelGroup"],
                        metrics=["sessions", "activeUsers"], date_range=CUR,
                        order_by=("sessions", True), limit=10)
    ]

    data["referral"] = [
        {"name": r["sessionSource"] or "(직접)",
         "sessions": int(r["sessions"]), "users": int(r["activeUsers"])}
        for r in report(client, target, dimensions=["sessionSource"],
                        metrics=["sessions", "activeUsers"], date_range=CUR,
                        dimension_filter=FilterExpression(filter=Filter(
                            field_name="sessionDefaultChannelGroup",
                            string_filter=Filter.StringFilter(value="Referral"),
                        )),
                        order_by=("sessions", True), limit=10)
    ]

    # --- 4) 사이트(호스트)별 + atah.io 코너별 조회수 추세 (28일) ---------
    # 호스트가 하나뿐인 대상(블로그)에는 둘 다 의미가 없어 건너뛴다.
    dates = [d["date"] for d in data["daily"]]
    data["trendDates"] = dates
    data["sites"] = []
    data["sections"] = []

    if target.split_hosts:
        # 날짜×호스트×경로를 한 번에 받아서 두 가지로 접는다.
        rows = report(client, target, dimensions=["date", "hostName", "pagePath"],
                      metrics=["screenPageViews"], date_range=TREND, limit=100000)
        date_index = {d: i for i, d in enumerate(dates)}

        site_buckets, section_buckets = {}, {}
        for r in rows:
            i = date_index.get(date_key(r["date"]))
            if i is None:
                continue
            views = int(r["screenPageViews"])
            host = r["hostName"]
            site_buckets.setdefault(host, [0] * len(dates))[i] += views
            if host == MAIN_HOST:
                name = classify_section(r["pagePath"])
                section_buckets.setdefault(name, [0] * len(dates))[i] += views

        def fold(buckets):
            out = []
            for name, series in buckets.items():
                cur7, prev7 = sum(series[-7:]), sum(series[-14:-7])
                out.append({"name": name, "daily": series, "cur": cur7, "prev": prev7,
                            "delta": pct_delta(cur7, prev7)})
            out.sort(key=lambda s: s["cur"], reverse=True)
            return out

        data["sites"] = fold(site_buckets)
        data["sections"] = fold(section_buckets)

    # --- 5) 방문 시간대 (요일 × 시각, 28일) ------------------------------
    grid = [[0] * 24 for _ in range(7)]
    for r in report(client, target, dimensions=["dayOfWeek", "hour"],
                    metrics=["sessions"], date_range=TREND, limit=200):
        try:
            wd, hh = int(r["dayOfWeek"]), int(r["hour"])
        except ValueError:
            continue
        if 0 <= wd < 7 and 0 <= hh < 24:
            grid[wd][hh] = int(r["sessions"])
    data["heatmap"] = {"labels": WEEKDAY_LABELS, "grid": grid}

    # --- 6) 기기 / 신규 vs 재방문 (최근 7일) -----------------------------
    device_names = {"mobile": "모바일", "desktop": "PC", "tablet": "태블릿"}
    data["devices"] = [
        {"name": device_names.get(r["deviceCategory"], r["deviceCategory"]),
         "sessions": int(r["sessions"]), "users": int(r["activeUsers"])}
        for r in report(client, target, dimensions=["deviceCategory"],
                        metrics=["sessions", "activeUsers"], date_range=CUR,
                        order_by=("sessions", True))
    ]

    visitor_names = {"new": "신규", "returning": "재방문"}
    data["visitors"] = [
        {"name": visitor_names.get(r["newVsReturning"], r["newVsReturning"] or "(미분류)"),
         "users": int(r["activeUsers"])}
        for r in report(client, target, dimensions=["newVsReturning"],
                        metrics=["activeUsers"], date_range=CUR,
                        order_by=("activeUsers", True))
    ]

    # --- 7) 인기 페이지 / 국가 (최근 7일) --------------------------------
    # 사이트는 호스트가 여럿이라 "어느 호스트의 어느 경로"가 필요하고,
    # 블로그는 /entry/123 만 봐선 무슨 글인지 모르니 제목으로 센다.
    page_dims = (["hostName", target.page_dimension] if target.split_hosts
                 else [target.page_dimension])
    data["pages"] = [
        {"name": r[page_dims[-1]] or "(제목 없음)",
         "note": r["hostName"] if target.split_hosts else "",
         "views": int(r["screenPageViews"]), "users": int(r["activeUsers"]),
         "secPerView": (r["userEngagementDuration"] / r["screenPageViews"]
                        if r["screenPageViews"] else 0.0)}
        for r in report(client, target, dimensions=page_dims,
                        metrics=["screenPageViews", "activeUsers", "userEngagementDuration"],
                        date_range=CUR, order_by=("screenPageViews", True), limit=15)
    ]

    data["countries"] = [
        {"name": r["country"] or "(미상)", "users": int(r["activeUsers"])}
        for r in report(client, target, dimensions=["country"], metrics=["activeUsers"],
                        date_range=CUR, order_by=("activeUsers", True), limit=8)
    ]

    return data


def build_insights(data):
    """숫자에서 바로 읽히지 않는 것만 문장으로. 과장 없이 사실만."""
    out = []
    s = data["summary"]

    users = s["activeUsers"]
    if users["delta"] is not None:
        direction = "늘었" if users["delta"] >= 0 else "줄었"
        out.append({
            "tone": "up" if users["delta"] >= 0 else "down",
            "text": f"최근 7일 활성 사용자 {int(users['cur']):,}명 — 그 전 7일보다 "
                    f"{abs(users['delta']):.0f}% {direction}습니다.",
        })

    if data["sites"]:
        total = sum(s["cur"] for s in data["sites"]) or 1
        top = data["sites"][0]
        out.append({
            "tone": "flat",
            "text": f"조회수 1위 사이트는 {top['name']} — 최근 7일 전체 조회수의 "
                    f"{top['cur'] / total * 100:.0f}%({top['cur']:,}회)입니다.",
        })

    if data["channels"]:
        total = sum(c["sessions"] for c in data["channels"]) or 1
        top = data["channels"][0]
        line = (f"유입 1위는 {top['name']} — 전체 세션의 "
                f"{top['sessions'] / total * 100:.0f}%({top['sessions']:,}회)입니다.")
        if top["name"] == "Referral" and data["referral"]:
            line += f" 그 안에서는 {data['referral'][0]['name']}가 가장 많이 보냅니다."
        out.append({"tone": "flat", "text": line})

    # 최근 7일에 의미 있는 양이 있으면서 가장 크게 오른 코너 (사이트 대상에만 있음)
    rising = [s for s in data["sections"] if s["delta"] is not None and s["cur"] >= 10]
    if rising:
        top = max(rising, key=lambda x: x["delta"])
        if top["delta"] >= 20:
            out.append({
                "tone": "up",
                "text": f"atah.io에서 가장 많이 오른 코너는 {top['name']} — 조회수가 "
                        f"{top['prev']:,}회에서 {top['cur']:,}회로 {top['delta']:.0f}% 늘었습니다.",
            })

    if data["devices"]:
        total = sum(d["sessions"] for d in data["devices"]) or 1
        mobile = next((d for d in data["devices"] if d["name"] == "모바일"), None)
        if mobile:
            out.append({
                "tone": "flat",
                "text": f"모바일 세션 비중 {mobile['sessions'] / total * 100:.0f}% — "
                        f"조작·레이아웃 우선순위 판단에 씁니다.",
            })

    grid = data["heatmap"]["grid"]
    peak = max(((wd, hh, grid[wd][hh]) for wd in range(7) for hh in range(24)),
               key=lambda t: t[2], default=None)
    if peak and peak[2] > 0:
        wd, hh, n = peak
        out.append({
            "tone": "flat",
            "text": f"방문이 가장 몰리는 때는 {WEEKDAY_LABELS[wd]}요일 {hh}시대 "
                    f"({n:,}세션 / 최근 {TREND_DAYS}일 누적)입니다.",
        })

    return out


HEADER = """// 이 파일은 자동 생성됩니다 — scripts/ga4_dashboard.py 가 매일 덮어씁니다.
// 직접 고치지 마세요. 페이지 쪽 수정은 dashboard/ 의 html·css·js 에서.
"""


def main():
    creds = load_credentials()
    client = BetaAnalyticsDataClient(credentials=creds)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for target in build_targets():
        data = fetch(client, target)
        data["insights"] = build_insights(data)
        data["meta"] = {
            "key": target.key,
            "label": target.label,
            "updatedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
            "propertyId": target.property_id,
            "trendDays": TREND_DAYS,
        }

        body = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True)
        path = OUTPUT_DIR / f"{target.key}.js"
        path.write_text(
            f"{HEADER}window.DASHBOARD_DATA = window.DASHBOARD_DATA || {{}};\n"
            f"window.DASHBOARD_DATA['{target.key}'] = {body};\n",
            encoding="utf-8")
        print(f"Wrote {path} ({path.stat().st_size:,} bytes) "
              f"— {target.label} / 속성 {target.property_id}")


if __name__ == "__main__":
    main()
