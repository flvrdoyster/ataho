#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ga4_dashboard as ga4  # noqa: E402


def backfill_target(client, target, refresh=False):
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
    for age in range(2 if refresh else 3, ga4.TREND_DAYS + 1):
        d = ga4.fetch(client, target, age=age, include_settled=False)
        date = d["yesterday"]["date"]
        if not date:
            print(f"  {target.key}: age={age}부터 실 데이터가 없어 멈춥니다 "
                  f"(속성이 그만큼 안 됐거나 daily 트렌드가 그만큼 안 돎)")
            break
        if date in history and not refresh:
            skipped += 1
            continue
        day_label = ga4.mmdd(date)
        d["confirmed"] = True
        d["insights"] = ga4.build_insights(d, day_label=day_label, confirmed=True) + [
            i for i in history.get(date, {}).get("insights", []) if i.get("key")]
        history[date] = ga4.snapshot_shape(d)
        filled += 1
        print(f"  {target.key}: {date} {'다시 씀' if refresh else '채움'} (age={age})")

    cutoff = (ga4.datetime.now(ga4.KST).date()
              - ga4.timedelta(days=ga4.TREND_DAYS)).isoformat()
    on_disk["history"] = {dt: v for dt, v in history.items() if dt >= cutoff}

    out_body = json.dumps(on_disk, ensure_ascii=False, indent=1, sort_keys=True)
    path.write_text(
        f"window.DASHBOARD_DATA = window.DASHBOARD_DATA || {{}};\n"
        f"window.DASHBOARD_DATA['{target.key}'] = {out_body};\n",
        encoding="utf-8")
    print(f"  {target.key}: 새로 {filled}일 채움 · 이미 있던 {skipped}일 건너뜀 "
          f"· history 총 {len(on_disk['history'])}일")


def main():
    parser = argparse.ArgumentParser(description="GA4 대시보드 히스토리 일괄 채우기")
    parser.add_argument("--refresh", action="store_true",
                        help="이미 있는 날짜도 age 2~TREND_DAYS 전부 다시 조회해 덮어쓴다")
    args = parser.parse_args()

    creds = ga4.load_credentials()
    client = ga4.BetaAnalyticsDataClient(credentials=creds)
    for target in ga4.build_targets():
        print(f"=== {target.label} ({target.key}) ===")
        backfill_target(client, target, refresh=args.refresh)


if __name__ == "__main__":
    main()
