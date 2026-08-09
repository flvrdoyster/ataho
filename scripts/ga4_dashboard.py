#!/usr/bin/env python3
"""
atah.io GA4 daily dashboard generator.

Reads GA4 (Google Analytics 4) data for a property and renders a static,
self-contained HTML dashboard (Chart.js) to disk. Designed to run from
GitHub Actions on a schedule, but also runs locally.

Credentials (pick one):
  - GA4_SERVICE_ACCOUNT_JSON  env var containing the full service-account
    JSON key as a string (used in CI, e.g. a GitHub Actions secret).
  - GA4_SERVICE_ACCOUNT_FILE  env var containing a path to the JSON key
    file on disk (handy for local testing).

Other config:
  - GA4_PROPERTY_ID   GA4 property id (default: 516513119)
  - GA4_OUTPUT_PATH   where to write the HTML file
                       (default: dashboard/ga4/index.html, relative to repo root)
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
    FilterExpression, Filter,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
PROPERTY_ID = os.environ.get("GA4_PROPERTY_ID", "516513119")
OUTPUT_PATH = REPO_ROOT / os.environ.get("GA4_OUTPUT_PATH", "dashboard/ga4/index.html")
KST = timezone(timedelta(hours=9))


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


def fetch_data(client: BetaAnalyticsDataClient):
    data = {}

    # 1) Daily active users / sessions / avg session duration, last 7 days
    resp = client.run_report(RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="date")],
        metrics=[Metric(name="activeUsers"), Metric(name="sessions"),
                 Metric(name="averageSessionDuration")],
        date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
        order_bys=[{"dimension": {"dimension_name": "date"}}],
    ))
    data["daily"] = [
        {
            "date": f"{r.dimension_values[0].value[0:4]}-{r.dimension_values[0].value[4:6]}-{r.dimension_values[0].value[6:8]}",
            "users": int(float(r.metric_values[0].value)),
            "sessions": int(float(r.metric_values[1].value)),
            "avgDuration": float(r.metric_values[2].value),
        }
        for r in resp.rows
    ]

    # 2) Sessions/active users by channel group, last 7 days
    resp = client.run_report(RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="sessionDefaultChannelGroup")],
        metrics=[Metric(name="sessions"), Metric(name="activeUsers")],
        date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
        order_bys=[{"metric": {"metric_name": "sessions"}, "desc": True}],
    ))
    data["channels"] = [
        {
            "channel": r.dimension_values[0].value,
            "sessions": int(float(r.metric_values[0].value)),
            "users": int(float(r.metric_values[1].value)),
        }
        for r in resp.rows
    ]

    # 3) Sessions/active users by source, within Referral channel, last 7 days
    resp = client.run_report(RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="sessionSource")],
        metrics=[Metric(name="sessions"), Metric(name="activeUsers")],
        date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
        dimension_filter=FilterExpression(filter=Filter(
            field_name="sessionDefaultChannelGroup",
            string_filter=Filter.StringFilter(value="Referral"),
        )),
        order_bys=[{"metric": {"metric_name": "sessions"}, "desc": True}],
    ))
    data["referral"] = [
        {
            "source": r.dimension_values[0].value,
            "sessions": int(float(r.metric_values[0].value)),
            "users": int(float(r.metric_values[1].value)),
        }
        for r in resp.rows
    ]

    # 4) Page views for today only
    resp = client.run_report(RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        dimensions=[Dimension(name="pagePath")],
        metrics=[Metric(name="screenPageViews")],
        date_ranges=[DateRange(start_date="today", end_date="today")],
        order_bys=[{"metric": {"metric_name": "screenPageViews"}, "desc": True}],
    ))
    data["pages"] = [
        {"path": r.dimension_values[0].value, "views": int(float(r.metric_values[0].value))}
        for r in resp.rows
    ]

    return data


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>atah.io GA4 대시보드</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.js"></script>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    padding: 24px;
    background: #f7f7f8;
    color: #1a1a1a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }}
  h1 {{ font-size: 20px; margin: 0 0 4px; }}
  .sub {{ color: #6b6b6b; font-size: 13px; margin-bottom: 20px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }}
  .card {{ background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 16px; }}
  .card h2 {{ font-size: 14px; margin: 0 0 12px; color: #333; }}
  .stat-row {{ display: flex; gap: 24px; margin-bottom: 12px; }}
  .stat {{ flex: 1; }}
  .stat .label {{ font-size: 12px; color: #6b6b6b; }}
  .stat .value {{ font-size: 26px; font-weight: 600; }}
  canvas {{ max-height: 260px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th, td {{ text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }}
  th {{ color: #6b6b6b; font-weight: 500; }}
  .footer {{ font-size: 11px; color: #999; margin-top: 8px; }}
</style>
</head>
<body>
  <h1>atah.io GA4 대시보드</h1>
  <div class="sub">최근 7일 · 마지막 업데이트: {updated_at} KST</div>

  <div class="grid">
    <div class="card">
      <h2>일별 활성 사용자 · 세션</h2>
      <div class="stat-row">
        <div class="stat"><div class="label">합계 활성 사용자</div><div class="value" id="total-users"></div></div>
        <div class="stat"><div class="label">합계 세션</div><div class="value" id="total-sessions"></div></div>
      </div>
      <canvas id="dailyChart"></canvas>
    </div>

    <div class="card">
      <h2>트래픽 소스별 세션</h2>
      <canvas id="trafficChart"></canvas>
    </div>

    <div class="card">
      <h2>Referral 소스별 세션</h2>
      <canvas id="referralChart"></canvas>
    </div>
  </div>

  <div class="card">
    <h2>상세 데이터</h2>
    <table>
      <thead><tr><th>날짜</th><th>활성 사용자</th><th>세션</th><th>평균 체류시간</th></tr></thead>
      <tbody id="daily-table"></tbody>
    </table>
  </div>

  <div class="card" style="margin-top:16px;">
    <h2>주요 페이지 <span id="pages-date-label" style="color:#6b6b6b; font-weight:400;"></span></h2>
    <canvas id="pagesChart"></canvas>
  </div>

  <div class="footer">GA4 속성 ID {property_id} · Google Analytics Data API · GitHub Actions로 매일 자동 갱신</div>

<script>
  const dailyData = {daily_json};
  const trafficData = {channels_json};
  const referralData = {referral_json};
  const latestPageData = {{ date: {pages_date_json}, pages: {pages_json} }};

  const fmtDuration = s => `${{Math.floor(s/60)}}:${{String(Math.round(s%60)).padStart(2,"0")}}`;

  document.getElementById("total-users").textContent = dailyData.reduce((a,d)=>a+d.users,0);
  document.getElementById("total-sessions").textContent = dailyData.reduce((a,d)=>a+d.sessions,0);

  const tbody = document.getElementById("daily-table");
  dailyData.forEach(d => {{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${{d.date}}</td><td>${{d.users}}</td><td>${{d.sessions}}</td><td>${{fmtDuration(d.avgDuration)}}</td>`;
    tbody.appendChild(tr);
  }});

  new Chart(document.getElementById("dailyChart"), {{
    type: "line",
    data: {{
      labels: dailyData.map(d => d.date.slice(5)),
      datasets: [
        {{ label: "활성 사용자", data: dailyData.map(d => d.users), borderColor: "#4f46e5", backgroundColor: "rgba(79,70,229,0.1)", tension: 0.3, fill: true }},
        {{ label: "세션", data: dailyData.map(d => d.sessions), borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.1)", tension: 0.3, fill: true }},
      ]
    }},
    options: {{ responsive: true, maintainAspectRatio: false, plugins: {{ legend: {{ position: "bottom" }} }} }}
  }});

  new Chart(document.getElementById("trafficChart"), {{
    type: "bar",
    data: {{
      labels: trafficData.map(t => t.channel),
      datasets: [{{ label: "세션", data: trafficData.map(t => t.sessions), backgroundColor: "#4f46e5" }}]
    }},
    options: {{ responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: {{ legend: {{ display: false }} }} }}
  }});

  new Chart(document.getElementById("referralChart"), {{
    type: "bar",
    data: {{
      labels: referralData.map(r => r.source),
      datasets: [{{ label: "세션", data: referralData.map(r => r.sessions), backgroundColor: "#f59e0b" }}]
    }},
    options: {{ responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: {{ legend: {{ display: false }} }} }}
  }});

  document.getElementById("pages-date-label").textContent = `(${{latestPageData.date}})`;
  const pagesTotal = latestPageData.pages.reduce((a, p) => a + p.views, 0) || 1;
  const pieColors = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#9ca3af"];
  new Chart(document.getElementById("pagesChart"), {{
    type: "pie",
    data: {{
      labels: latestPageData.pages.map(p => p.path),
      datasets: [{{
        data: latestPageData.pages.map(p => p.views),
        backgroundColor: latestPageData.pages.map((_, i) => pieColors[i % pieColors.length]),
      }}],
    }},
    options: {{
      responsive: true,
      maintainAspectRatio: false,
      plugins: {{
        legend: {{ position: "right", labels: {{ boxWidth: 12, font: {{ size: 11 }} }} }},
        tooltip: {{ callbacks: {{ label: ctx => `${{ctx.label}}: ${{ctx.parsed}}회 (${{(ctx.parsed / pagesTotal * 100).toFixed(1)}}%)` }} }},
      }},
    }},
  }});
</script>
</body>
</html>
"""


def render_html(data: dict) -> str:
    now_kst = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    today_kst = datetime.now(KST).strftime("%Y-%m-%d")
    return HTML_TEMPLATE.format(
        updated_at=now_kst,
        property_id=PROPERTY_ID,
        daily_json=json.dumps(data["daily"], ensure_ascii=False),
        channels_json=json.dumps(data["channels"], ensure_ascii=False),
        referral_json=json.dumps(data["referral"], ensure_ascii=False),
        pages_date_json=json.dumps(today_kst, ensure_ascii=False),
        pages_json=json.dumps(data["pages"], ensure_ascii=False),
    )


def main():
    creds = load_credentials()
    client = BetaAnalyticsDataClient(credentials=creds)
    data = fetch_data(client)
    html = render_html(data)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(html, encoding="utf-8")
    print(f"Wrote dashboard to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
