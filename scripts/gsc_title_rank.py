#!/usr/bin/env python3
import argparse
import json
import os
import sys
import urllib.parse
from datetime import date, timedelta
from pathlib import Path

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

SITE = "https://oysterbay.tistory.com/"
TITLES = {"환세희담": 135, "환세풍광전": 44, "환세쾌도전": 98, "환세포물장": 55, "환세패유기": 43}
API = "https://searchconsole.googleapis.com/webmasters/v3/sites/{}/searchAnalytics/query"
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]


def load_credentials():
    raw_json = os.environ.get("GA4_SERVICE_ACCOUNT_JSON")
    if raw_json:
        return service_account.Credentials.from_service_account_info(json.loads(raw_json), scopes=SCOPES)
    key_file = os.environ.get("GA4_SERVICE_ACCOUNT_FILE")
    if key_file:
        return service_account.Credentials.from_service_account_file(key_file, scopes=SCOPES)
    sys.exit("Set GA4_SERVICE_ACCOUNT_JSON or GA4_SERVICE_ACCOUNT_FILE.")


def query(session, start, end, title):
    body = {
        "startDate": start, "endDate": end, "dimensions": ["page"], "rowLimit": 100, "type": "web",
        "dimensionFilterGroups": [{"filters": [{"dimension": "query", "operator": "equals", "expression": title}]}],
    }
    r = session.post(API.format(urllib.parse.quote(SITE, safe="")), json=body)
    r.raise_for_status()
    rows = r.json().get("rows", [])
    rows.sort(key=lambda row: row["position"])
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=28)
    ap.add_argument("--start")
    ap.add_argument("--end")
    ap.add_argument("--json")
    args = ap.parse_args()
    end = date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=3)
    start = date.fromisoformat(args.start) if args.start else end - timedelta(days=args.days - 1)

    session = AuthorizedSession(load_credentials())
    out = {"site": SITE, "start": str(start), "end": str(end), "titles": {}}
    print(f"{start} ~ {end}  {SITE}")
    for title, post in TITLES.items():
        rows = query(session, str(start), str(end), title)
        target = f"{SITE}{post}"
        hit = next((r for r in rows if r["keys"][0] == target), None)
        summary = (f"평균 {hit['position']:.1f}위, 노출 {hit['impressions']}, 클릭 {hit['clicks']}"
                   if hit else "데이터 없음")
        print(f"\n== {title} (소개 /{post}) → {summary}")
        for r in rows[:8]:
            mark = "*" if r["keys"][0] == target else " "
            print(f" {mark} {r['position']:5.1f}  노출 {r['impressions']:4d}  클릭 {r['clicks']:3d}  {r['keys'][0]}")
        out["titles"][title] = {"post": post, "rows": rows}
    if args.json:
        Path(args.json).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
