#!/usr/bin/env python3
"""
atah.io GA4 데이터 수집기.

GA4(Google Analytics 4) Data API에서 지표를 읽어 dashboard/data/ga4.js 로
저장한다. 페이지(dashboard/index.html)는 손으로 관리하고, 이 스크립트는
데이터만 덮어쓴다 — 자동 커밋 diff가 데이터에만 남도록.

이 대시보드가 말하는 날은 **어제 하루**다. 28일치도 함께 담지만 그건 어제가
많은 날이었는지 적은 날이었는지 가늠할 자로만 쓴다. 지표마다 확정 시점이
다르다는 점이 수집 구조를 가른다 — 아래 SETTLED 주석 참조.

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
import statistics
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

# 이 대시보드가 말하는 날은 "어제"다. 오늘은 아직 진행 중이라 어느 구간에도 넣지 않는다.
TREND_DAYS = 28
YDAY = ("yesterday", "yesterday")
TREND = (f"{TREND_DAYS}daysAgo", "yesterday")

# GA4는 어제치를 아침에 확정하지 않는다 —— 세션 속성(채널 그룹, 참여 세션)을
# 하루 이상 뒤에 재처리한다. 실측(2026-08-14 조회): 어제는 참여세션 0 / 채널
# Unassigned 16-of-22 인데 그저께는 참여율 69%로 정상이었다. 평균 체류가 441초인
# 날의 참여율 0%는 나올 수 없는 값이고, 그동안 이 값이 매일 화면에 찍혀 왔다.
#
# 그래서 지표를 신뢰도로 나눈다:
#   - 개수 세기(사용자·세션·조회수와 그 분해)는 어제치를 그대로 쓴다
#   - 세션 속성(참여율·평균 체류)은 재처리가 끝난 구간에서만 본다  ← SETTLED
#   - 유입원은 그 중간이라 어제치를 쓰되 미분류분을 합치지 않고 따로 센다
SETTLED = ("8daysAgo", "2daysAgo")     # 어제를 뺀, 확정된 마지막 7일
PRIOR = (f"{TREND_DAYS}daysAgo", "2daysAgo")   # 어제가 "처음"인지 가릴 비교용

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
SITE_TITLE_SUFFIX = " : atah.io"   # 사이트 공통 <title> 접미사 — pageTitle 정리용


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


def totals(client, target, date_range, metrics):
    """구간 전체 합계 한 줄. 차원이 없으면 GA4는 총계 한 행만 돌려준다."""
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


# 유입원 이름 중 "아직 모른다"는 뜻인 값들. 어제치에서는 이것들이 크게 잡히는데
# (재처리 전이라) 다른 출처와 나란히 세우면 1위가 "(not set)"이 되어 화면이
# 거짓말을 한다. 합계에서 떼어 내 따로 센다.
UNRESOLVED_SOURCES = {"(not set)", "(data not available)", ""}
SOURCE_LABELS = {"(direct)": "직접 방문"}

# 인사이트 문장을 낼지 말지 가르는 문턱. 이 사이트는 하루 15~20명 규모라
# 문턱이 낮으면 매일 "몇 배 뛰었다"가 나와 아무 뜻이 없어진다.
SPIKE_MIN_VIEWS = 5    # 이보다 적게 본 페이지는 몇 배가 됐든 말하지 않는다
SPIKE_RATIO = 2.0      # 평소 하루 평균의 몇 배부터 "튀었다"고 할지
DEPTH_RATIO = 2.0      # 신규/재방문의 1인당 조회수가 몇 배 차이부터 말할지
MIN_DAYS_FOR_NORMAL = 14   # 이만큼은 쌓여야 "평소와 같았다"고 말할 수 있다


def josa(word, with_final, without_final):
    """받침 유무에 맞는 조사를 고른다 — "환세풍광전이" / "술창고 청소가".

    문장 안에 "이(가)"를 그대로 두면 자동 생성 티가 심하게 난다. 페이지 이름이
    데이터에서 오는 값이라 미리 정할 수 없어 여기서 가린다.
    한글 음절(가~힣)은 (코드 - 0xAC00) % 28 이 0이 아니면 받침이 있다.
    끝의 괄호·따옴표 따위는 건너뛴다 — "메인 (아타호의 거처)"는 ")"가 아니라
    "처"로 판정해야 한다. 한글로 끝나지 않는 이름(영문 경로 등)은 규칙이
    갈려서 두 형태를 함께 쓴다.
    """
    tail = (word or "").strip().rstrip(")]}>'\"」』.… \t")
    if not tail:
        return f"{with_final}({without_final})"
    last = tail[-1]
    if "가" <= last <= "힣":
        return with_final if (ord(last) - 0xAC00) % 28 else without_final
    return f"{with_final}({without_final})"


def quartiles(values):
    """28일 분포 요약. 어제가 '평소'인지 가리는 자."""
    if not values:
        return None
    ordered = sorted(values)
    n = len(ordered)
    # statistics.quantiles 는 표본이 2개 미만이면 예외를 던진다
    if n >= 4:
        q1, _, q3 = statistics.quantiles(ordered, n=4)
    else:
        q1 = q3 = statistics.median(ordered)
    return {"median": statistics.median(ordered), "q1": q1, "q3": q3,
            "min": ordered[0], "max": ordered[-1], "n": n}


def standing(value, box):
    """어제 값이 28일 분포의 어디인가. 화면 문구와 색을 여기서 한 번에 정한다."""
    if not box:
        return None
    # 동점이면 같은 등수 — "3번째로 많은 날"이 여럿일 수 있다
    rank = sum(1 for v in box["_values"] if v > value) + 1
    if value > box["q3"]:
        where = "high"
    elif value < box["q1"]:
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


def fetch(client, target):
    """어제 하루를 중심으로 모은다. 28일치는 어제를 가늠할 기준자로만 쓴다."""
    data = {}

    # --- 1) 어제 하루 (개수 세기 — 재처리 지연의 영향이 적은 지표) --------
    yday = totals(client, target, YDAY,
                  ["activeUsers", "newUsers", "sessions", "screenPageViews"])
    daily_rows = report(client, target, dimensions=["date"],
                        metrics=["activeUsers", "sessions", "screenPageViews"],
                        date_range=TREND, order_by=("date", False))
    data["daily"] = [
        {"date": date_key(r["date"]), "users": int(r["activeUsers"]),
         "sessions": int(r["sessions"]), "views": int(r["screenPageViews"])}
        for r in daily_rows
    ]

    yday_date = data["daily"][-1]["date"] if data["daily"] else None
    data["yesterday"] = {
        "date": yday_date,
        "users": int(yday["activeUsers"]),
        "newUsers": int(yday["newUsers"]),
        "sessions": int(yday["sessions"]),
        "views": int(yday["screenPageViews"]),
    }

    # --- 2) 평소 대비 어디쯤인가 -----------------------------------------
    # 어제 하나만 보면 많은 날인지 적은 날인지 알 수 없다. 28일 분포에서의
    # 위치를 사용자와 조회수 양쪽으로 낸다 — 둘의 방향이 갈리는 날이 있다
    # (사람 수는 평소인데 조회수만 높은 날 = 적은 사람이 깊게 본 날).
    per_user = [(d["views"] / d["users"] if d["users"] else 0.0) for d in data["daily"]]
    data["baseline"] = {
        "users": distribution([d["users"] for d in data["daily"]],
                              data["yesterday"]["users"]),
        "views": distribution([d["views"] for d in data["daily"]],
                              data["yesterday"]["views"]),
        "sessions": distribution([d["sessions"] for d in data["daily"]],
                                 data["yesterday"]["sessions"]),
        # 한 사람이 몇 장을 보고 갔나. 방문자 수와 조회수를 따로 보면 "사람은
        # 평소인데 조회수만 많은 날"이 눈에 안 들어오는데, 이 값 하나면 잡힌다.
        "perUser": distribution(per_user, per_user[-1] if per_user else 0.0),
    }

    # --- 3) 어제 본 페이지 / 사이트별 -------------------------------------
    # 사이트는 "어느 호스트의 어느 경로"가 필요하고, 블로그는 /entry/123 만
    # 봐선 무슨 글인지 모르니 제목으로 센다.
    #
    # 사이트 쪽도 pageTitle 을 함께 물어본다 — pc98/suiko 페이지는 atah.io 같은
    # 코너 분류가 없어 원시 경로(/hukyou.html)만 남는데, GA4가 <title>을 자동
    # 수집한 pageTitle 에는 "환세풍광전 : atah.io" 처럼 사람이 읽는 이름이 있다.
    # 접미사(" : atah.io")는 이 사이트 공통 <title> 템플릿이라 잘라낸다
    # (2026-08-14 API 실측: pc98·suiko·atah.io 모든 페이지가 이 형식이었다).
    page_dims = (["hostName", "pagePath", "pageTitle"] if target.split_hosts
                 else [target.page_dimension])

    def clean_title(raw):
        t = (raw or "").strip()
        if t.endswith(SITE_TITLE_SUFFIX):
            t = t[:-len(SITE_TITLE_SUFFIX)].strip()
        return t

    page_rows = report(client, target, dimensions=page_dims,
                       metrics=["screenPageViews", "activeUsers"],
                       date_range=YDAY, order_by=("screenPageViews", True), limit=15)

    # 같은 페이지를 어제 이전 구간에서도 세어 "평소 하루 몇 번 보던 페이지인가"를
    # 낸다. 어제 23회가 많은 건지 적은 건지는 그 페이지의 평소를 알아야 말할 수
    # 있다 — 어떤 페이지는 원래 하루 9회고 어떤 페이지는 0.7회다.
    prior_key = ["hostName", "pagePath"] if target.split_hosts else [target.page_dimension]
    prior_views = {}
    for r in report(client, target, dimensions=prior_key, metrics=["screenPageViews"],
                    date_range=PRIOR, order_by=("screenPageViews", True), limit=300):
        prior_views[tuple(r[k] for k in prior_key)] = r["screenPageViews"]
    prior_days = max(1, len(data["daily"]) - 1)   # PRIOR 는 어제를 뺀 구간

    if target.split_hosts:
        data["ydayPages"] = [
            {"name": r["pagePath"], "title": clean_title(r.get("pageTitle")),
             "host": r["hostName"],
             # 코너 이름(미니게임·해설서 등)은 이 레포만 아는 분류다. 예전엔 따로
             # 구획이 있었지만 어제 기준으로는 1~3행뿐이라, 페이지 표의 라벨로 붙인다.
             "section": classify_section(r["pagePath"]) if r["hostName"] == MAIN_HOST else "",
             "views": int(r["screenPageViews"]), "users": int(r["activeUsers"]),
             "priorAvg": prior_views.get((r["hostName"], r["pagePath"]), 0.0) / prior_days}
            for r in page_rows
        ]
    else:
        data["ydayPages"] = [
            {"name": r[target.page_dimension] or "(제목 없음)", "title": "", "host": "",
             "section": "", "views": int(r["screenPageViews"]), "users": int(r["activeUsers"]),
             "priorAvg": prior_views.get((r[target.page_dimension],), 0.0) / prior_days}
            for r in page_rows
        ]

    # "평소보다 튀었다"의 판정은 여기서만 한다 — 화면(표의 배율 표시)과 인사이트
    # 문장이 같은 문턱을 쓰게 하려는 것. 두 곳에서 따로 재면 언젠가 어긋나서
    # "표에는 튀었다고 표시됐는데 문장은 아무 말도 안 하는" 상태가 된다.
    for p in data["ydayPages"]:
        p["spike"] = bool(p["priorAvg"] > 0 and p["views"] >= SPIKE_MIN_VIEWS
                          and p["views"] / p["priorAvg"] >= SPIKE_RATIO)

    # --- 3-1) 어제 신규 vs 재방문 -----------------------------------------
    # 조회수를 기준으로 본다 — 사용자 수는 구간마다 중복 제외라 합이 총계와 안 맞고
    # (실측: new 11 + returning 4 + 미분류 6 = 21 ≠ 총 15), 세션도 넘친다.
    # 조회수는 정확히 떨어진다(22 + 36 + 2 = 60 = 어제 총 조회).
    #
    # newVsReturning 은 세션 속성이라 재처리 지연군이다 — 어제치에는 빈 문자열로
    # 남는 몫이 있다. 그 몫을 따로 담아 두고, 화면에서 크면 입을 다물게 한다.
    visitors, unclassified_views = [], 0
    for r in report(client, target, dimensions=["newVsReturning"],
                    metrics=["screenPageViews", "activeUsers", "sessions"],
                    date_range=YDAY, order_by=("screenPageViews", True)):
        kind = r["newVsReturning"]
        if kind not in ("new", "returning"):
            unclassified_views += int(r["screenPageViews"])
            continue
        visitors.append({"name": "신규" if kind == "new" else "재방문",
                         "kind": kind,
                         "views": int(r["screenPageViews"]),
                         "users": int(r["activeUsers"]),
                         "sessions": int(r["sessions"])})
    # ydayVisitors 도 _priorSources 와 같은 처지다 — 인사이트 문장(3번)에만 쓰이고
    # 화면(dashboard.js)은 읽지 않는다. 밑줄을 붙여 main()이 파일에서 걸러내게 한다.
    data["_ydayVisitors"] = visitors
    data["_ydayVisitorsUnclassified"] = unclassified_views

    data["ydaySites"] = []
    if target.split_hosts:
        data["ydaySites"] = [
            {"name": r["hostName"], "views": int(r["screenPageViews"])}
            for r in report(client, target, dimensions=["hostName"],
                            metrics=["screenPageViews"], date_range=YDAY,
                            order_by=("screenPageViews", True), limit=10)
        ]

    # --- 4) 어제 온 곳 ----------------------------------------------------
    # 미분류(not set 등)를 목록에 섞으면 대개 그게 1위로 올라와 화면이 거짓말을
    # 한다. 떼어 내 따로 세고, 화면에서도 "아직 분류 중"으로 따로 말한다.
    sources, unresolved = [], 0
    for r in report(client, target, dimensions=["sessionSource"],
                    metrics=["sessions"], date_range=YDAY,
                    order_by=("sessions", True), limit=25):
        name = r["sessionSource"] or ""
        n = int(r["sessions"])
        if name in UNRESOLVED_SOURCES:
            unresolved += n
        else:
            sources.append({"name": SOURCE_LABELS.get(name, name), "sessions": n})
    data["ydaySources"] = sources
    data["ydayUnresolved"] = unresolved

    # 어제 처음 보는 유입원을 가리기 위한 28일치 목록(어제 제외).
    # 이름만 쓰고 버린다 — 화면에 싣지 않고 인사이트 문장에만 쓴다.
    data["_priorSources"] = sorted({
        r["sessionSource"] for r in report(
            client, target, dimensions=["sessionSource"], metrics=["sessions"],
            date_range=PRIOR, order_by=("sessions", True), limit=200)
        if r["sessionSource"] and r["sessionSource"] not in UNRESOLVED_SOURCES
    })

    # --- 5) 어제 시간대 ---------------------------------------------------
    hours = [0] * 24
    for r in report(client, target, dimensions=["hour"], metrics=["sessions"],
                    date_range=YDAY, limit=24):
        try:
            hh = int(r["hour"])
        except ValueError:
            continue
        if 0 <= hh < 24:
            hours[hh] = int(r["sessions"])
    data["ydayHours"] = hours

    # --- 6) 확정 구간 지표 -------------------------------------------------
    # 참여율·평균 체류는 어제치를 믿을 수 없다(파일 맨 위 주석 참조).
    # 재처리가 끝난 구간에서만 내고, 화면에도 그 구간을 밝혀 적는다.
    settled = totals(client, target, SETTLED,
                     ["engagementRate", "averageSessionDuration", "sessions"])
    data["settled"] = {
        "engagementRate": settled["engagementRate"],
        "avgDuration": settled["averageSessionDuration"],
        "sessions": int(settled["sessions"]),
        "from": SETTLED[0], "to": SETTLED[1],
    }

    return data


def build_insights(data):
    """어제를 주어로. 화면을 봐서는 알 수 없는 것만 문장으로 낸다.

    규칙 하나: **화면에 이미 있는 숫자를 되풀이하지 않는다.** 히어로가 "어제
    방문자 15명 · 평소 범위"를 이미 말하고 표가 "환세풍광전 23회"를 이미
    보여주는데, 인사이트가 같은 말을 하면 네 줄이 두 줄 값어치밖에 못 한다.
    그래서 여기서는 비교(평소 그 페이지는 몇 회였나)와 분해(누가 그 조회수를
    만들었나)만 말한다. 할 말이 없으면 줄 수가 줄어드는 게 정상이다.
    """
    out = []
    y = data["yesterday"]
    if not y["date"]:
        return out

    # 1) 평소보다 튄 페이지 — 어제 조회수가 왜 그랬는지에 대한 답.
    #    판정(spike)은 fetch 에서 이미 끝났다. 표의 배율 표시와 같은 값을 쓴다.
    spikes = [p for p in data["ydayPages"] if p["spike"]]
    if spikes:
        top = max(spikes, key=lambda p: p["views"] / p["priorAvg"])
        label = top["section"] or top["title"] or top["name"]
        quiet = [p for p in data["ydayPages"]
                 if p is not top and p["priorAvg"] > 0 and p["views"] < p["priorAvg"]]
        tail = (f" 나머지 {len(quiet)}곳은 평소보다 조용했습니다."
                if len(quiet) >= 2 else "")
        out.append({
            "tone": "up",
            "text": f"{label}{josa(label, '이', '가')} 어제 {top['views']:,}회 — 평소 하루 "
                    f"{top['priorAvg']:.1f}회 보던 페이지라 {top['views'] / top['priorAvg']:.1f}배로 "
                    f"뛰었습니다.{tail}",
        })

    # 2) 한 사람이 몇 장을 보고 갔나 — 평소 범위를 벗어날 때만
    pu = data["baseline"].get("perUser")
    if pu and pu["where"] != "usual":
        deeper = pu["where"] == "high"
        out.append({
            "tone": "flat",
            "text": f"어제 한 사람이 평균 {pu['value']:.1f}장을 봤습니다 — 평소 "
                    f"{pu['median']:.1f}장이니 {'깊게 본' if deeper else '얕게 본'} 날입니다"
                    f"(28일 {'최대' if deeper else '최소'} {pu['max' if deeper else 'min']:.1f}장).",
        })

    # 3) 그 조회수를 누가 만들었나 — 신규와 재방문의 소비량은 대개 크게 다르다.
    #    미분류(재처리 전)가 많이 섞인 날은 비율이 흔들리므로 말하지 않는다.
    vis = {v["kind"]: v for v in data.get("_ydayVisitors", [])}
    total_views = sum(v["views"] for v in data.get("_ydayVisitors", [])) \
        + data.get("_ydayVisitorsUnclassified", 0)
    unclassified_ok = (total_views and
                       data.get("_ydayVisitorsUnclassified", 0) / total_views < 0.2)
    if unclassified_ok and len(vis) == 2:
        depth = {k: (v["views"] / v["users"] if v["users"] else 0.0) for k, v in vis.items()}
        heavy = max(depth, key=depth.get)
        light = "returning" if heavy == "new" else "new"
        if depth[light] and depth[heavy] / depth[light] >= DEPTH_RATIO:
            v = vis[heavy]
            out.append({
                "tone": "flat",
                "text": f"어제 조회 {total_views:,}회 가운데 {v['views']:,}회"
                        f"({v['views'] / total_views * 100:.0f}%)가 {v['name']} 쪽입니다 — "
                        f"{v['users']:,}명이 1인당 {depth[heavy]:.0f}장씩 봤습니다"
                        f"({vis[light]['name']}는 {depth[light]:.1f}장).",
            })

    # 4) 28일 동안 없다가 어제 처음 나타난 유입원
    prior = set(data.get("_priorSources", []))
    fresh = [s for s in data["ydaySources"] if s["name"] not in prior
             and s["name"] != SOURCE_LABELS["(direct)"]]
    if prior and fresh:
        names = ", ".join(s["name"] for s in fresh[:3])
        out.append({
            "tone": "up",
            "text": f"최근 {TREND_DAYS}일 동안 없던 유입원이 어제 생겼습니다 — {names}.",
        })

    # 5) 어제가 정말 평소를 벗어난 날일 때만 방문자 수를 짚는다.
    #    평소 범위면 히어로의 "평소 범위" 배지가 이미 말하고 있으니 침묵한다.
    users = data["baseline"]["users"]
    if users and users["where"] != "usual":
        if users["rank"] == 1:
            out.append({"tone": "up",
                        "text": f"어제 방문자 {y['users']:,}명은 최근 {users['n']}일 중 "
                                f"가장 많습니다(그 전 최고 {users['max']:,}명)."})
        else:
            many = users["where"] == "high"
            out.append({
                "tone": "up" if many else "down",
                "text": f"어제 방문자 {y['users']:,}명 — 평소({users['median']:.0f}명)보다 "
                        f"{'많은' if many else '적은'} 편으로, {users['n']}일 중 "
                        f"{users['rank']}번째입니다.",
            })

    # 6) 미분류가 절반을 넘으면 수치를 곧이곧대로 읽지 말라고 말해 준다.
    #    보통은 GA4의 재처리 지연이지만, 며칠 지나도 남으면 계측 설정 문제다.
    #    여기서 합계를 "어제 세션 수"라고 부르지 않는 이유: GA4는 한 세션에
    #    출처를 여럿 붙이는 경우가 있어 유입원별 합이 총 세션(어제 22)을 넘는다
    #    (실측 35). 헤드라인 숫자와 어긋나는 총계를 말하면 화면이 서로 모순된다.
    resolved = sum(s["sessions"] for s in data["ydaySources"])
    total = resolved + data["ydayUnresolved"]
    if total and data["ydayUnresolved"] / total > 0.5:
        out.append({
            "tone": "down",
            "text": f"어제 유입 가운데 {data['ydayUnresolved']:,}건은 출처가 아직 "
                    f"분류되지 않았습니다(분류된 것은 {resolved:,}건) — GA4가 어제치를 "
                    f"재처리하는 중이라 내일이면 대개 채워집니다.",
        })

    # 할 말이 없으면 없다고 말한다 — 빈 자리만 남기면 고장 난 것처럼 보인다.
    # 다만 "평소와 같았다"는 판단은 평소를 알 만큼 쌓였을 때만 할 수 있다.
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
                "text": "어제는 평소와 크게 다른 점이 없었습니다 — 방문자도 "
                        "페이지별 조회수도 늘 보던 범위 안입니다.",
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
            "settledDays": 7,
        }

        # 밑줄로 시작하는 키는 인사이트 문장을 만들 때만 쓰는 중간 재료다.
        # 화면은 안 쓰므로 파일에 싣지 않는다 — 매일 커밋되는 파일이라 군더더기를 뺀다.
        data = {k: v for k, v in data.items() if not k.startswith("_")}

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
