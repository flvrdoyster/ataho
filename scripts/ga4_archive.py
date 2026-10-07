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
        chunk = ga4.report(client, target, limit=PAGE_SIZE, offset=offset, **kw)
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

    page_dims = ["hostName", "pagePath"] if target.split_hosts else [target.page_dimension]
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

    for d in days.values():
        d["pages"].sort(key=lambda p: -p[-2])
        d["sources"].sort(key=lambda s: -s[-1])
        d["devices"].sort(key=lambda s: -s[-1])
    return days


def fill(days, start, end):
    out, cur = {}, start
    while cur <= end:
        k = cur.isoformat()
        out[k] = days.get(k) or {"users": 0, "newUsers": 0, "sessions": 0, "views": 0,
                                 "pages": [], "sources": [], "devices": [], "hours": [0] * 24}
        cur += timedelta(days=1)
    return out


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
        archive.update(fill(days, start, yesterday))
        write(path, archive)
        print(f"{target.key}: {start} ~ {yesterday} 갱신 · 전체 {min(archive)} ~ {max(archive)} "
              f"{len(archive)}일 · {path.stat().st_size:,}B")


if __name__ == "__main__":
    main()
