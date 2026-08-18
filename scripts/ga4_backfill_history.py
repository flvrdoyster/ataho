#!/usr/bin/env python3
"""
과거 히스토리 일괄 채우기 — 1회성 도구. 자동 실행되는 워크플로우와 무관하다.

날짜 히스토리 기능(ga4_dashboard.py, HISTORY_REFRESH_AGE)은 매일 어제(age=1)·
그저께(age=2) 딱 두 날짜만 채운다. 그 안쪽(3일 전 ~ TREND_DAYS일 전)은 자연히
쌓이길 기다리면 26일이 걸리는데, GA4가 그만큼의 과거를 이미 갖고 있으므로
(실측 2026-08-18: 사이트 속성은 2025-12-16부터, 블로그는 속성이 어려서 9일치뿐)
한 번에 긁어와 채운다.

TREND_DAYS(28일) 보존 정책은 안 건드린다 — 그 이상 긁어와 봐야 다음 날 아침
워크플로우가 main()을 돌리며 바로 잘라낸다(main()의 cutoff 정리 로직 참조).
그래서 나이(age) 3~TREND_DAYS 만 채운다. 이미 있는 날짜는 건너뛰어 재실행해도
안전하다(부분 실패 후 재시도 가능).

백필한 날짜는 전부 confirmed=True 로 저장한다 — HISTORY_REFRESH_AGE(2일)보다
훨씬 오래된 날짜라 재처리 지연 걱정 없이 이미 확정된 값이다.

실행:
  GA4_SERVICE_ACCOUNT_FILE=... [GA4_BLOG_PROPERTY_ID=... FEEDBACK_SHEET_ID=...] \\
      python scripts/ga4_backfill_history.py
(자격 증명·환경변수는 ga4_dashboard.py 와 동일)
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ga4_dashboard as ga4  # noqa: E402


def backfill_target(client, target):
    path = ga4.OUTPUT_DIR / f"{target.key}.js"
    if not path.exists():
        print(f"  {target.key}: 데이터 파일이 없어 건너뜁니다 "
              f"(ga4_dashboard.py 를 먼저 한 번 돌려 두세요)")
        return

    text = path.read_text(encoding="utf-8")
    body = text.split("=", 2)[2].strip().rstrip(";")
    on_disk = json.loads(body)
    history = on_disk.get("history", {})

    filled, skipped = 0, 0
    for age in range(3, ga4.TREND_DAYS + 1):
        d = ga4.fetch(client, target, age=age, include_settled=False)
        date = d["yesterday"]["date"]
        if not date:
            print(f"  {target.key}: age={age}부터 실 데이터가 없어 멈춥니다 "
                  f"(속성이 그만큼 안 됐거나 daily 트렌드가 그만큼 안 돎)")
            break
        if date in history:
            skipped += 1
            continue
        day_label = ga4.mmdd(date)
        d["confirmed"] = True
        d["insights"] = ga4.build_insights(d, day_label=day_label, confirmed=True)
        history[date] = ga4.snapshot_shape(d)
        filled += 1
        print(f"  {target.key}: {date} 채움 (age={age})")

    # main() 과 같은 정리 규칙 — 여기서도 지켜야 다음 날 워크플로우와 결과가 같다.
    cutoff = (ga4.datetime.now(ga4.KST).date()
              - ga4.timedelta(days=ga4.TREND_DAYS)).isoformat()
    on_disk["history"] = {dt: v for dt, v in history.items() if dt >= cutoff}

    out_body = json.dumps(on_disk, ensure_ascii=False, indent=1, sort_keys=True)
    path.write_text(
        f"{ga4.HEADER}window.DASHBOARD_DATA = window.DASHBOARD_DATA || {{}};\n"
        f"window.DASHBOARD_DATA['{target.key}'] = {out_body};\n",
        encoding="utf-8")
    print(f"  {target.key}: 새로 {filled}일 채움 · 이미 있던 {skipped}일 건너뜀 "
          f"· history 총 {len(on_disk['history'])}일")


def main():
    creds = ga4.load_credentials()
    client = ga4.BetaAnalyticsDataClient(credentials=creds)
    for target in ga4.build_targets():
        print(f"=== {target.label} ({target.key}) ===")
        backfill_target(client, target)


if __name__ == "__main__":
    main()
