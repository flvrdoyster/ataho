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

에뮬레이터 피드백 시트(gensei-pc98)도 함께 읽어 dashboard/data/feedback.js 로
낸다 — "확인" 칸이 안 찍힌 제보가 몇 건 남았는지만. 자세한 내용은 fetch_feedback
주석 참조.

기타 설정:
  - GA4_PROPERTY_ID        사이트 속성 ID (기본: 516513119)
  - GA4_BLOG_PROPERTY_ID   블로그 속성 ID (없으면 블로그는 건너뜀)
  - GA4_OUTPUT_DIR         저장 폴더 (기본: dashboard/data, 레포 루트 기준)
  - FEEDBACK_SHEET_ID      피드백 시트 ID (없으면 피드백은 건너뜀)
"""
import json
import os
import re
import statistics
import sys
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

# 이 대시보드가 말하는 날은 "어제"다. 오늘은 아직 진행 중이라 어느 구간에도 넣지 않는다.
TREND_DAYS = 28
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

# --- 히스토리("살아있는 기록") ----------------------------------------------
# 매일 어제(1일 전)를 새로 모으고, 그저께(2일 전)를 한 번 더 조회해 어제
# 저장해 둔 값을 덮어쓴다. 딱 한 번만 갱신하고 그 뒤로는 다시 안 건드린다.
#
# 왜 2일인가 — 실측(2026-08-18, 커밋 히스토리로 최근 4일 대조): 08-14~08-17
# 나흘 모두 수집 당시(1일째) 67~83%가 미분류였는데, 다시 확인했을 때
# (1~4일 뒤) 전부 0%였다. 08-17은 하루도 안 지나 이미 0이었다 — 2일이면
# 넉넉하다. 예외로 08-12는 6일이 지나도 1/36(2.8%)이 남았는데, 이건 "재처리
# 중"이 아니라 리퍼러 없는 방문처럼 영영 분류가 안 되는 종류로 보인다(50%
# 경고 문턱에 걸리지 않을 만큼 작아 문제되지 않는다).
HISTORY_REFRESH_AGE = 2


def day_range(age):
    """`age`일 전 하루. age=1 이 옛 YDAY(어제)와 같다."""
    tag = f"{age}daysAgo"
    return (tag, tag)


def prior_range(age):
    """`age`일 전 날짜를 뺀 TREND_DAYS 만큼의 비교 구간 — "평소"의 기준.
    age=1(어제)일 때 옛 PRIOR와 값이 같다."""
    return (f"{TREND_DAYS + age - 1}daysAgo", f"{age + 1}daysAgo")


def mmdd(iso):
    """"2026-08-15" → "08.15". dashboard.js의 mmdd()와 표기를 맞춘다."""
    return iso[5:].replace("-", ".")

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
    ("/scene_viewer", "장면 뷰어"),
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


def fetch(client, target, age=1, include_settled=True):
    """대상 날짜(`age`일 전) 하루를 중심으로 모은다. 28일치는 그 날짜를 가늠할
    기준자로만 쓴다. age=1(기본값)이 옛 "어제"다 — 매일의 최신 스냅샷과
    히스토리 갱신(HISTORY_REFRESH_AGE) 양쪽이 이 함수 하나를 같이 쓴다.
    include_settled=False 면 참여율 조회(날짜 무관 롤링 구간)를 건너뛴다 —
    히스토리 항목엔 안 실리는 값이라 그때는 조회할 필요가 없다."""
    data = {}

    # --- 1) 어제 하루 (개수 세기 — 재처리 지연의 영향이 적은 지표) --------
    yday = totals(client, target, day_range(age),
                  ["activeUsers", "newUsers", "sessions", "screenPageViews"])
    daily_rows = report(client, target, dimensions=["date"],
                        metrics=["activeUsers", "sessions", "screenPageViews"],
                        date_range=TREND, order_by=("date", False))
    data["daily"] = [
        {"date": date_key(r["date"]), "users": int(r["activeUsers"]),
         "sessions": int(r["sessions"]), "views": int(r["screenPageViews"])}
        for r in daily_rows
    ]

    # daily 는 "28daysAgo~어제"로 항상 age=1 기준 끝나므로, 대상 날짜는
    # 뒤에서 age번째다(age=1→마지막, age=2→끝에서 둘째, ...).
    yday_date = data["daily"][-age]["date"] if len(data["daily"]) >= age else None
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
                       date_range=day_range(age), order_by=("screenPageViews", True), limit=15)

    # 같은 페이지를 어제 이전 구간에서도 세어 "평소 하루 몇 번 보던 페이지인가"를
    # 낸다. 어제 23회가 많은 건지 적은 건지는 그 페이지의 평소를 알아야 말할 수
    # 있다 — 어떤 페이지는 원래 하루 9회고 어떤 페이지는 0.7회다.
    prior_key = ["hostName", "pagePath"] if target.split_hosts else [target.page_dimension]
    prior_views = {}
    for r in report(client, target, dimensions=prior_key, metrics=["screenPageViews"],
                    date_range=prior_range(age), order_by=("screenPageViews", True), limit=300):
        prior_views[tuple(r[k] for k in prior_key)] = r["screenPageViews"]
    prior_days = max(1, len(data["daily"]) - 1)   # prior_range(age) 는 어제를 뺀 구간

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
                    date_range=day_range(age), order_by=("screenPageViews", True)):
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
                            metrics=["screenPageViews"], date_range=day_range(age),
                            order_by=("screenPageViews", True), limit=10)
        ]

    # --- 4) 어제 온 곳 ----------------------------------------------------
    # 미분류(not set 등)를 목록에 섞으면 대개 그게 1위로 올라와 화면이 거짓말을
    # 한다. 떼어 내 따로 세고, 화면에서도 "아직 분류 중"으로 따로 말한다.
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

    # 어제 처음 보는 유입원을 가리기 위한 28일치 목록(어제 제외).
    # 이름만 쓰고 버린다 — 화면에 싣지 않고 인사이트 문장에만 쓴다.
    data["_priorSources"] = sorted({
        r["sessionSource"] for r in report(
            client, target, dimensions=["sessionSource"], metrics=["sessions"],
            date_range=prior_range(age), order_by=("sessions", True), limit=200)
        if r["sessionSource"] and r["sessionSource"] not in UNRESOLVED_SOURCES
    })

    # --- 5) 어제 시간대 ---------------------------------------------------
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

    # --- 6) 확정 구간 지표 -------------------------------------------------
    # 참여율·평균 체류는 어제치를 믿을 수 없다(파일 맨 위 주석 참조).
    # 재처리가 끝난 구간에서만 내고, 화면에도 그 구간을 밝혀 적는다.
    #
    # 날짜 무관(늘 "지금 기준 최근 7일")이라 히스토리 항목엔 안 싣는다 — 그래서
    # HISTORY_REFRESH_AGE 갱신 때는 include_settled=False 로 이 조회 자체를 건너뛴다.
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
    """대상 날짜를 주어로. 화면을 봐서는 알 수 없는 것만 문장으로 낸다.

    규칙 하나: **화면에 이미 있는 숫자를 되풀이하지 않는다.** 히어로가 "어제
    방문자 15명 · 평소 범위"를 이미 말하고 표가 "환세풍광전 23회"를 이미
    보여주는데, 인사이트가 같은 말을 하면 네 줄이 두 줄 값어치밖에 못 한다.
    그래서 여기서는 비교(평소 그 페이지는 몇 회였나)와 분해(누가 그 조회수를
    만들었나)만 말한다. 할 말이 없으면 줄 수가 줄어드는 게 정상이다.

    day_label — 문장 속에서 "어제"를 대신할 말. 최신(age=1) 스냅샷을 만들 때는
    기본값 "어제"를 그대로 쓰고, 히스토리에 얼려 둘 스냅샷(그저께 갱신 포함)은
    호출부가 mmdd(날짜)("08.15")를 넘긴다 — "어제"는 상대적인 말이라 얼려서
    나중에 다시 보여주면 그날 그대로 거짓말이 된다("3주 뒤에도 어제 15명"),
    반면 날짜는 얼려도 계속 맞다.

    confirmed — 이 스냅샷이 HISTORY_REFRESH_AGE 갱신을 거쳤는지. 미분류 유입
    문장(6번)이 이 값으로 갈린다: 아직이면 "내일 다시 확인됩니다"가 참이고,
    이미 거쳤으면 그 약속을 지킬 다음 갱신이 없으므로 다른 말을 해야 한다.
    """
    out = []
    y = data["yesterday"]
    if not y["date"]:
        return out

    # "유입원이 어제 생겼습니다"처럼 조사가 필요한 자리 전용. day_label이 "어제"면
    # 그 자체로 부사어라 조사가 없고, 날짜("08.15")면 "에"를 붙여야 자연스럽다.
    day_at = day_label if day_label == "어제" else f"{day_label}에"

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
            "text": f"{label}{josa(label, '이', '가')} {day_label} {top['views']:,}회 — 평소 하루 "
                    f"{top['priorAvg']:.1f}회 보던 페이지라 {top['views'] / top['priorAvg']:.1f}배로 "
                    f"뛰었습니다.{tail}",
        })

    # 2) 한 사람이 몇 장을 보고 갔나 — 평소 범위를 벗어날 때만
    pu = data["baseline"].get("perUser")
    if pu and pu["where"] != "usual":
        deeper = pu["where"] == "high"
        out.append({
            "tone": "flat",
            "text": f"{day_label} 한 사람이 평균 {pu['value']:.1f}장을 봤습니다 — 평소 "
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
                "text": f"{day_label} 조회 {total_views:,}회 가운데 {v['views']:,}회"
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
            "text": f"최근 {TREND_DAYS}일 동안 없던 유입원이 {day_at} 생겼습니다 — {names}.",
        })

    # 5) 어제가 정말 평소를 벗어난 날일 때만 방문자 수를 짚는다.
    #    평소 범위면 히어로의 "평소 범위" 배지가 이미 말하고 있으니 침묵한다.
    users = data["baseline"]["users"]
    if users and users["where"] != "usual":
        if users["rank"] == 1:
            out.append({"tone": "up",
                        "text": f"{day_label} 방문자 {y['users']:,}명은 최근 {users['n']}일 중 "
                                f"가장 많습니다(그 전 최고 {users['max']:,}명)."})
        else:
            many = users["where"] == "high"
            out.append({
                "tone": "up" if many else "down",
                "text": f"{day_label} 방문자 {y['users']:,}명 — 평소({users['median']:.0f}명)보다 "
                        f"{'많은' if many else '적은'} 편으로, {users['n']}일 중 "
                        f"{users['rank']}번째입니다.",
            })

    # 6) 미분류가 절반을 넘으면 수치를 곧이곧대로 읽지 말라고 말해 준다.
    #    여기서 합계를 "{day_label} 세션 수"라고 부르지 않는 이유: GA4는 한
    #    세션에 출처를 여럿 붙이는 경우가 있어 유입원별 합이 총 세션을 넘는다
    #    (실측 22 vs 35). 헤드라인 숫자와 어긋나는 총계를 말하면 화면이 서로 모순된다.
    #
    #    confirmed 로 갈린다. 아직 갱신 전(fresh, age=1)이면 "내일 자동으로
    #    다시 확인됩니다"가 참말이다 — HISTORY_REFRESH_AGE 갱신이 실제로 내일
    #    이 날짜를 다시 조회해 덮어쓴다. 이미 갱신을 거쳤는데도(confirmed)
    #    여전히 절반 넘게 미분류면, 그건 재처리 지연이 아니라 계측 설정 문제일
    #    가능성이 크므로("영영 그렇다") 다른 문장을 쓴다 — 더 이상 재갱신
    #    예정이 없는데 "다시 확인됩니다"라고 하면 또 지키지 못할 약속이 된다.
    resolved = sum(s["sessions"] for s in data["ydaySources"])
    total = resolved + data["ydayUnresolved"]
    if total and data["ydayUnresolved"] / total > 0.5:
        if confirmed:
            out.append({
                "tone": "down",
                "text": f"{day_label} 유입 가운데 {data['ydayUnresolved']:,}건은 GA4가 재처리를 "
                        f"마친 뒤에도 출처가 끝내 분류되지 않았습니다(분류된 것은 {resolved:,}건) — "
                        f"흔치 않은 일이니 계측(GTM) 설정을 점검해 볼 만합니다.",
            })
        else:
            out.append({
                "tone": "down",
                "text": f"{day_label} 유입 가운데 {data['ydayUnresolved']:,}건은 출처가 아직 "
                        f"분류되지 않았습니다(분류된 것은 {resolved:,}건) — GA4가 세션 속성을 "
                        f"확정하는 데 하루 이상 걸립니다. 이 값은 내일 자동으로 다시 확인됩니다.",
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
                "text": f"{day_label}는 평소와 크게 다른 점이 없었습니다 — 방문자도 "
                        "페이지별 조회수도 늘 보던 범위 안입니다.",
            })

    return out


# --- 에뮬레이터 피드백 시트 -------------------------------------------------
# gensei-pc98 의 게임 페이지에서 보낸 제보가 쌓이는 시트. 쓰는 쪽은 그 레포의
# tools/feedback-appsscript.gs 이고, 여기서는 읽기만 한다.
#
# 시트 열은 10개인데 앞 8개(시각·분류·게임·버전·메시지·스크린샷·UA·URL)만
# Apps Script 가 쓴다. 뒤의 비고·확인은 손으로 관리하는 처리용 칸이라,
# "확인"이 안 찍힌 줄 = 아직 안 본 제보다.
SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
FEEDBACK_RANGE = "A1:J1000"
FEEDBACK_KEYS = ("시각", "분류", "게임", "확인")
# "2026. 8. 15 오전 9:19:41" 앞머리에서 날짜만. 시트 로캘이 바뀌어 구분자가
# 달라져도 숫자 세 덩이만 집으면 되도록 느슨하게 맞춘다.
FEEDBACK_DATE_RE = re.compile(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})")


def _sheet_values(creds, sheet_id, cell_range):
    """Sheets API v4 values.get — 얇은 REST 래퍼.

    google-api-python-client 를 새로 넣지 않으려고 REST 를 직접 부른다. 이미
    쓰고 있는 google-auth 로 토큰만 얻으면 되므로 의존성이 늘지 않는다.
    """
    import google.auth.transport.requests

    scoped = creds.with_scopes([SHEETS_SCOPE])
    scoped.refresh(google.auth.transport.requests.Request())
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}"
           f"/values/{cell_range}")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {scoped.token}"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8")).get("values", [])


def fetch_feedback(creds, sheet_id):
    """아직 확인 안 한 제보가 몇 건인지만 집계한다.

    **내용은 가져오지 않는다** — 메시지·UA·스크린샷 링크는 읽지도 싣지도 않는다.
    대시보드는 noindex 일 뿐 주소만 알면 누구나 보는 공개 페이지라, 남이 보낸
    글을 옮겨 실으면 제보자가 예상 못 한 형태로 공개된다. 여기서 만드는 건
    "몇 건이 밀렸나"까지이고, 실제 내용은 시트를 열어 봐야 한다.

    읽기에 실패해도 수집 전체를 세우지 않는다 — GA4 쪽은 멀쩡한데 시트 권한
    하나 때문에 대시보드가 통째로 안 갱신되면 손해가 더 크다.
    """
    out = {"available": False, "updatedAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
           "sheetUrl": f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"}
    try:
        rows = _sheet_values(creds, sheet_id, FEEDBACK_RANGE)
    except Exception as err:                      # noqa: BLE001 — 어떤 실패든 건너뛴다
        out["error"] = f"{type(err).__name__}"
        print(f"  피드백 시트를 읽지 못해 건너뜁니다: {err}", file=sys.stderr)
        return out

    # 헤더 줄을 찾아서 쓴다 — 행 번호를 박아 두면 시트 맨 위에 제목 줄이 하나
    # 생기는 순간 조용히 어긋난다.
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
            continue                              # 빈 줄·서식만 남은 줄
        total += 1
        # TRUE 가 아니면 전부 "아직 안 봄"으로 센다. 수신 스크립트가 확인 칸을
        # 쓰지 않으므로 새 제보는 FALSE 가 아니라 **빈 칸**으로 들어온다 —
        # FALSE 만 세면 정작 새로 온 제보가 리마인드에 안 잡힌다.
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


HEADER = """// 이 파일은 자동 생성됩니다 — scripts/ga4_dashboard.py 가 매일 덮어씁니다.
// 직접 고치지 마세요. 페이지 쪽 수정은 dashboard/ 의 html·css·js 에서.
"""

# history 항목 하나에 담는 필드. daily(28일 트렌드)·settled(참여율 롤링 구간)는
# 날짜 종속이 아니라 대상 전체에 하나뿐이라 top-level에만 두고 여기엔 안 싣는다
# — 항목마다 28개짜리 배열을 복제하면 history가 금방 커진다. 밑줄 필드(인사이트
# 계산용 중간 재료)도 당연히 뺀다.
HISTORY_KEEP = ("yesterday", "baseline", "ydayPages", "ydaySites",
                "ydaySources", "ydayUnresolved", "ydayHours", "insights", "confirmed")


def snapshot_shape(data):
    """fetch()+build_insights() 결과에서 history 에 얼려 둘 부분만 추린다."""
    return {k: data[k] for k in HISTORY_KEEP if k in data}


def _load_prior_history(path):
    """직전 산출물의 history 를 읽어 이어간다.

    history는 "누적"이라 매번 새로 계산하는 게 아니라 이전 파일에서 읽어
    와야 한다 — 이 스크립트가 데이터의 유일한 출처이므로 제 산출물을 다시
    읽는다. 파일이 없거나(첫 실행) 형식이 깨져 있으면 빈 채로 시작한다 —
    사고가 아니라 그만큼 짧은 기록으로 다시 쌓이기 시작할 뿐이다.
    """
    if not path.exists():
        return {}
    try:
        text = path.read_text(encoding="utf-8")
        body = text.split("=", 2)[2].strip().rstrip(";")
        return json.loads(body).get("history", {})
    except Exception as err:                          # noqa: BLE001
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

        # 1) 어제(1일 전) — 지금까지 하던 대로. 아직 재처리 전이라 미확정.
        data = fetch(client, target, age=1)
        data["confirmed"] = False
        data["insights"] = build_insights(data, day_label="어제", confirmed=False)
        if data["yesterday"]["date"]:
            history[data["yesterday"]["date"]] = snapshot_shape(data)

        # 2) 그저께(HISTORY_REFRESH_AGE 일 전) — 한 번만 다시 물어봐서 재처리가
        #    끝난 값으로 덮어쓴다("살아있는 기록"). fetch() 를 그대로 재사용하되
        #    settled(날짜 무관 롤링 구간)는 이미 위에서 얻었으니 다시 안 묻는다.
        day2 = fetch(client, target, age=HISTORY_REFRESH_AGE, include_settled=False)
        day2_date = day2["yesterday"]["date"]
        if day2_date:
            day2_label = mmdd(day2_date)
            day2["confirmed"] = True
            day2["insights"] = build_insights(day2, day_label=day2_label, confirmed=True)
            history[day2_date] = snapshot_shape(day2)

        # 보존 기간 28일 — daily 트렌드 창과 맞춘다("이 대시보드가 신경 쓰는
        # 범위"를 하나로 통일). 안 그러면 history가 끝없이 커진다.
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

        # 밑줄로 시작하는 키는 인사이트 문장을 만들 때만 쓰는 중간 재료다.
        # 화면은 안 쓰므로 파일에 싣지 않는다 — 매일 커밋되는 파일이라 군더더기를 뺀다.
        data = {k: v for k, v in data.items() if not k.startswith("_")}

        body = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True)
        path.write_text(
            f"{HEADER}window.DASHBOARD_DATA = window.DASHBOARD_DATA || {{}};\n"
            f"window.DASHBOARD_DATA['{target.key}'] = {body};\n",
            encoding="utf-8")
        print(f"Wrote {path} ({path.stat().st_size:,} bytes) "
              f"— {target.label} / 속성 {target.property_id} "
              f"/ history {len(data['history'])}일")

    # 피드백은 GA4 대상이 아니라 시트라서 위 루프 밖에 둔다. 탭도 만들지 않는다
    # (탭은 data/*.js 의 DASHBOARD_DATA 키 개수만큼 생기는데, 피드백은 별도
    # 전역 DASHBOARD_FEEDBACK 으로 낸다 — 어제 지표가 아니라 처리할 일 목록이다).
    #
    # 시트 ID가 없어도 파일은 만든다. index.html 이 <script src>로 무조건 읽으므로
    # 파일이 없으면 404가 나서 콘솔이 지저분해진다.
    sheet_id = os.environ.get("FEEDBACK_SHEET_ID", "").strip()
    feedback = (fetch_feedback(creds, sheet_id) if sheet_id
                else {"available": False, "error": "no-sheet-id"})
    fb_path = OUTPUT_DIR / "feedback.js"
    fb_path.write_text(
        f"{HEADER}window.DASHBOARD_FEEDBACK = "
        f"{json.dumps(feedback, ensure_ascii=False, indent=1, sort_keys=True)};\n",
        encoding="utf-8")
    state = (f"미확인 {feedback['pending']['count']}건 / 전체 {feedback['total']}건"
             if feedback.get("available") else f"건너뜀({feedback.get('error')})")
    print(f"Wrote {fb_path} ({fb_path.stat().st_size:,} bytes) — 피드백 / {state}")


if __name__ == "__main__":
    main()
