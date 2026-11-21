#!/usr/bin/env python3
import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ga4_dashboard as ga4  # noqa: E402

ARCHIVE_DIR = ga4.REPO_ROOT / "dashboard" / "archive"
REFRESH_DAYS = 10
PAGE_SIZE = 100000


def report_all(client, target, **kw):
    rows, offset = [], 0
    while True:
        chunk = ga4.report(client, target, limit=PAGE_SIZE, offset=offset, exclude_bots=False, **kw)
        rows += chunk
        if len(chunk) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def collect(client, target, start, end):
    rng = (start.isoformat(), end.isoformat())
    days = {}

    def day(r):
        return days.setdefault(ga4.date_key(r["date"]), {
            "users": 0, "newUsers": 0, "sessions": 0, "views": 0,
            "pages": [], "sources": [], "devices": [], "hours": [0] * 24})

    for r in report_all(client, target, dimensions=["date"],
                        metrics=["activeUsers", "newUsers", "sessions", "screenPageViews"],
                        date_range=rng):
        d = day(r)
        d["users"], d["newUsers"] = int(r["activeUsers"]), int(r["newUsers"])
        d["sessions"], d["views"] = int(r["sessions"]), int(r["screenPageViews"])

    page_dims = ["hostName", "pagePath"] if target.split_hosts else ["pagePath", "pageTitle"]
    for r in report_all(client, target, dimensions=["date"] + page_dims,
                        metrics=["screenPageViews", "activeUsers"], date_range=rng):
        if r["screenPageViews"] > 0:
            day(r)["pages"].append([r[k] for k in page_dims]
                                   + [int(r["screenPageViews"]), int(r["activeUsers"])])

    for r in report_all(client, target,
                        dimensions=["date", "sessionSource", "sessionMedium", "sessionDefaultChannelGroup"],
                        metrics=["sessions"], date_range=rng):
        day(r)["sources"].append([r["sessionSource"], r["sessionMedium"],
                                  r["sessionDefaultChannelGroup"], int(r["sessions"])])

    for r in report_all(client, target, dimensions=["date", "deviceCategory"],
                        metrics=["sessions"], date_range=rng):
        day(r)["devices"].append([r["deviceCategory"], int(r["sessions"])])

    for r in report_all(client, target, dimensions=["date", "hour"], metrics=["sessions"], date_range=rng):
        try:
            hh = int(r["hour"])
        except ValueError:
            continue
        if 0 <= hh < 24:
            day(r)["hours"][hh] = int(r["sessions"])

    try:
        ref_rows = report_all(client, target, dimensions=["date", "sessionSource", "pageReferrer"],
                              metrics=["eventCount"], date_range=rng, dimension_filter=ga4.SESSION_START)
    except Exception as err:  # noqa: BLE001
        print(f"{target.key}: 글 주소 조회 실패, 이번엔 건너뜁니다: {type(err).__name__}", file=sys.stderr)
    else:
        by_date = {}
        for r in ref_rows:
            by_date.setdefault(ga4.date_key(r["date"]), []).append(r)
        for k, d in days.items():
            grouped = ga4.group_refs(by_date.get(k, []))
            d["refs"] = sorted(([src, f["url"], f["sessions"]] for src, found in grouped.items() for f in found),
                               key=lambda x: (-x[2], x[0], x[1]))

    for d in days.values():
        d["pages"].sort(key=lambda p: -p[-2])
        d["sources"].sort(key=lambda s: -s[-1])
        d["devices"].sort(key=lambda s: -s[-1])
    return days


def has_value(d):
    return bool(d and (d["users"] or d["sessions"] or d["views"]))


def fill(days, start, end, existing=None):
    existing = existing or {}
    out, kept, cur = {}, [], start
    while cur <= end:
        k = cur.isoformat()
        if not has_value(days.get(k)) and has_value(existing.get(k)):
            out[k] = existing[k]
            kept.append(k)
        else:
            out[k] = days.get(k) or {"users": 0, "newUsers": 0, "sessions": 0, "views": 0,
                                     "pages": [], "sources": [], "devices": [], "hours": [0] * 24}
            if "refs" not in out[k] and "refs" in existing.get(k, {}):
                out[k]["refs"] = existing[k]["refs"]
        cur += timedelta(days=1)
    return out, kept


def load(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, archive):
    lines = [f"{json.dumps(d)}:{json.dumps(archive[d], ensure_ascii=False, separators=(',', ':'))}"
             for d in sorted(archive)]
    path.write_text("{\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backfill", action="store_true")
    args = parser.parse_args()

    client = ga4.BetaAnalyticsDataClient(credentials=ga4.load_credentials())
    yesterday = datetime.now(ga4.KST).date() - timedelta(days=1)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    for target in ga4.build_targets():
        path = ARCHIVE_DIR / f"{target.key}.json"
        archive = load(path)
        if args.backfill or not archive:
            days = collect(client, target, date.fromisoformat(ga4.LONG_START), yesterday)
            active = [k for k, v in days.items() if v["users"] or v["views"] or v["sessions"]]
            if not active:
                print(f"{target.key}: 데이터 없음")
                continue
            start = date.fromisoformat(min(active))
        else:
            start = yesterday - timedelta(days=REFRESH_DAYS - 1)
            days = collect(client, target, start, yesterday)
        filled, kept = fill(days, start, yesterday, archive)
        archive.update(filled)
        if kept:
            print(f"{target.key}: 새로 받은 값이 비어 보관 값 유지 {', '.join(kept)}")
        write(path, archive)
        print(f"{target.key}: {start} ~ {yesterday} 갱신 · 전체 {min(archive)} ~ {max(archive)} "
              f"{len(archive)}일 · {path.stat().st_size:,}B")


if __name__ == "__main__":
    main()
