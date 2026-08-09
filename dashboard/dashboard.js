/* atah.io 대시보드 — data/*.js 가 window.DASHBOARD_DATA 에 넣어 둔 대상들을 탭으로 그린다.
   데이터는 scripts/ga4_dashboard.py 가 매일 새로 쓰고, 이 파일은 손으로 관리한다.
   대상을 늘리려면 수집 스크립트에 Target 을 추가하고 index.html 에 <script> 한 줄만
   더하면 된다 — 탭은 여기서 자동으로 만들어진다.

   차트 규칙(고쳐도 되지만 이유는 알고 고치세요):
   - y축은 하나만. 크기가 다른 두 지표를 한 그림에 겹치지 않는다.
   - 색은 항목의 정체성을 따른다. 순위가 바뀌어도 같은 항목은 같은 색.
   - 크기(많고 적음)는 파랑 한 색의 명도로만 표현한다(무지개 금지).
   - 모든 차트에는 같은 값을 읽을 수 있는 표가 함께 있다. */
(function () {
    'use strict';

    const registry = window.DASHBOARD_DATA || {};
    const nav = document.getElementById('dash-nav');
    const panelRoot = document.getElementById('dash-panels');
    const views = Object.keys(registry).map((key) => ({ key, data: registry[key] }));

    if (!views.length) {
        panelRoot.innerHTML = '<p class="empty">아직 수집된 데이터가 없습니다.' +
            '<br>GitHub Actions의 <b>GA4 Daily Dashboard</b> 워크플로우가 한 번 돌면 채워집니다.</p>';
        return;
    }

    // --- 토큰 & 포맷 -------------------------------------------------
    const css = getComputedStyle(document.documentElement);
    const T = (name) => css.getPropertyValue(name).trim();
    const C = {
        surface: T('--surface'), textPrimary: T('--text-primary'),
        textSecondary: T('--text-secondary'), muted: T('--text-muted'),
        grid: T('--grid'), axis: T('--axis'), deemph: T('--deemph'),
        series: [T('--series-1'), T('--series-2'), T('--series-3'),
                 T('--series-4'), T('--series-5'), T('--series-6')],
        seq: [T('--seq-1'), T('--seq-2'), T('--seq-3'), T('--seq-4'), T('--seq-5'), T('--seq-6')],
    };
    const FONT = "'KoddiUDOnGothic', sans-serif";

    const nf = new Intl.NumberFormat('ko-KR');
    const fmt = (n) => nf.format(Math.round(n));
    const pct = (n, digits) => `${n.toFixed(digits === undefined ? 0 : digits)}%`;
    const dur = (s) => {
        const m = Math.floor(s / 60), sec = Math.round(s % 60);
        return m ? `${m}분 ${sec}초` : `${sec}초`;
    };
    const esc = (s) => String(s).replace(/[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const mmdd = (iso) => iso.slice(5).replace('-', '.');
    const share = (v, total) => (total ? v / total * 100 : 0);
    const pctDelta = (cur, base) => (base ? (cur - base) / base * 100 : null);

    /* 증감은 색만으로 말하지 않는다 — 화살표(기호) + 숫자 + "지난 7일 대비" 문구가 함께 간다. */
    function deltaHTML(d, note) {
        const label = note === undefined ? '지난 7일 대비' : note;
        const suffix = label ? ` ${label}` : '';
        if (d === null || d === undefined) {
            return `<div class="delta">비교 불가${suffix}</div>`;
        }
        const abs = Math.abs(d);
        if (abs < 0.05) return `<div class="delta">변화 없음${suffix}</div>`;
        const up = d > 0;
        // 10% 미만은 소수점 한 자리까지 — 안 그러면 0.6% 증가가 "▲ 0%"로 보인다
        return `<div class="delta"><span class="${up ? 'up' : 'down'}">` +
            `${up ? '▲' : '▼'} ${pct(abs, abs < 10 ? 1 : 0)}</span>${suffix}</div>`;
    }

    /* 28일 스파크라인. 전체는 옅은 회색, 최근 7일만 파랑 — 지금 구간이 어디인지 보이게. */
    function sparkline(values, w, h) {
        w = w || 120; h = h || 28;
        if (!values.length) return '';
        const max = Math.max.apply(null, values.concat([1]));
        const step = values.length > 1 ? w / (values.length - 1) : 0;
        const pts = values.map((v, i) => [
            +(i * step).toFixed(1),
            +(h - 1.5 - (v / max) * (h - 3)).toFixed(1),
        ]);
        const path = (arr) => arr.map((p) => p.join(',')).join(' ');
        const tail = pts.slice(Math.max(0, pts.length - 8));
        return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">` +
            `<polyline fill="none" stroke="${C.deemph}" stroke-width="1.5" stroke-linejoin="round" ` +
            `stroke-linecap="round" points="${path(pts)}"/>` +
            `<polyline fill="none" stroke="${C.series[0]}" stroke-width="2" stroke-linejoin="round" ` +
            `stroke-linecap="round" points="${path(tail)}"/>` +
            `<circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="2.5" ` +
            `fill="${C.series[0]}" stroke="${C.surface}" stroke-width="2"/></svg>`;
    }

    function tableView(summary, head, rows) {
        return `<details class="table-view"><summary>${esc(summary)}</summary><div class="scroll">` +
            `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
            `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}` +
            `</tbody></table></div></details>`;
    }

    // --- Chart.js 공통 ------------------------------------------------
    Chart.defaults.font.family = FONT;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = C.muted;
    Chart.defaults.maintainAspectRatio = false;

    const gridStyle = { color: C.grid, drawTicks: false, borderDash: [] };
    const axisStyle = { color: C.axis };

    /* 세로 기준선 — 선 그래프에서 어느 날짜를 읽고 있는지 표시 */
    const crosshair = {
        id: 'crosshair',
        beforeDatasetsDraw(chart) {
            const active = chart.tooltip && chart.tooltip.getActiveElements
                ? chart.tooltip.getActiveElements() : [];
            if (!active.length) return;
            const ctx = chart.ctx, area = chart.chartArea, x = active[0].element.x;
            ctx.save();
            ctx.strokeStyle = C.axis;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, area.top);
            ctx.lineTo(x, area.bottom);
            ctx.stroke();
            ctx.restore();
        },
    };

    /* 가로 막대 끝에 값 — 축 눈금 대신 값을 바로 읽게 (layout.padding.right로 자리 확보) */
    const barValues = {
        id: 'barValues',
        afterDatasetsDraw(chart) {
            const ctx = chart.ctx;
            chart.data.datasets.forEach((ds, di) => {
                const meta = chart.getDatasetMeta(di);
                if (meta.hidden) return;
                meta.data.forEach((el, i) => {
                    const v = ds.data[i];
                    if (v === null || v === undefined) return;
                    ctx.save();
                    ctx.fillStyle = C.textSecondary;
                    ctx.font = `12px ${FONT}`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(fmt(v), el.x + 8, el.y);
                    ctx.restore();
                });
            });
        },
    };

    /* 선 끝 직접 라벨. 두 선이 붙어 있으면(14px 미만) 겹쳐 읽히므로 범례에 맡기고 그리지 않는다. */
    const lineEndLabels = {
        id: 'lineEndLabels',
        afterDatasetsDraw(chart) {
            const ends = chart.data.datasets.map((ds, di) => {
                const pts = chart.getDatasetMeta(di).data;
                return pts.length ? { el: pts[pts.length - 1], label: ds.label } : null;
            }).filter(Boolean);
            if (ends.length < 2) return;
            for (let i = 0; i < ends.length; i++) {
                for (let j = i + 1; j < ends.length; j++) {
                    if (Math.abs(ends[i].el.y - ends[j].el.y) < 14) return;
                }
            }
            const ctx = chart.ctx;
            ends.forEach((e) => {
                ctx.save();
                ctx.fillStyle = C.textSecondary;
                ctx.font = `12px ${FONT}`;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText(e.label, e.el.x, e.el.y - 8);
                ctx.restore();
            });
        },
    };

    function lineChart(canvas, labels, datasets) {
        return new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: datasets.map((d, i) => ({
                    label: d.label,
                    data: d.data,
                    borderColor: C.series[i],
                    backgroundColor: C.series[i] + '1a',   /* 면은 ~10% 농도의 옅은 칠 */
                    borderWidth: 2,
                    tension: 0.25,
                    fill: !!d.fill,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBorderColor: C.surface,
                    pointHoverBorderWidth: 2,
                    pointHoverBackgroundColor: C.series[i],
                })),
            },
            options: {
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { top: 8, right: 8 } },
                plugins: {
                    legend: {
                        display: datasets.length > 1,
                        position: 'bottom',
                        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' },
                    },
                    tooltip: {
                        backgroundColor: C.surface,
                        borderColor: C.axis,
                        borderWidth: 1,
                        titleColor: C.textPrimary,
                        bodyColor: C.textSecondary,
                        padding: 10,
                        displayColors: true,
                        boxWidth: 8,
                        boxHeight: 8,
                        usePointStyle: true,
                    },
                },
                scales: {
                    x: { grid: { display: false }, border: axisStyle, ticks: { maxRotation: 0, autoSkipPadding: 16 } },
                    y: { beginAtZero: true, grid: gridStyle, border: { display: false }, ticks: { precision: 0 } },
                },
            },
            plugins: [crosshair, lineEndLabels],
        });
    }

    /* 항목이 하나뿐인 막대는 전부 같은 색 — 길이가 이미 크기를 말하므로 색까지 쓰지 않는다. */
    function barChart(canvas, labels, values, unit) {
        return new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: C.series[0],
                    borderRadius: 4,
                    borderSkipped: 'start',   /* 둥근 쪽은 값 끝, 기준선 쪽은 각지게 */
                    maxBarThickness: 24,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                layout: { padding: { right: 44 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: C.surface,
                        borderColor: C.axis,
                        borderWidth: 1,
                        titleColor: C.textPrimary,
                        bodyColor: C.textSecondary,
                        padding: 10,
                        displayColors: false,
                        callbacks: { label: (ctx) => `${fmt(ctx.parsed.x)}${unit}` },
                    },
                },
                scales: {
                    x: { display: false, beginAtZero: true, grace: '4%' },
                    y: { grid: { display: false }, border: axisStyle, ticks: { color: C.textSecondary } },
                },
            },
            plugins: [barValues],
        });
    }

    // --- 화면 한 벌 ----------------------------------------------------
    function buildHTML(data, key) {
    const parts = [];

    if (!data.daily.length) {
        return `<p class="meta-line">마지막 갱신 ${esc(data.meta.updatedAt)} KST · ` +
            `GA4 속성 ${esc(data.meta.propertyId)}</p>` +
            '<p class="empty">아직 이 대상에서 집계된 하루가 없습니다.' +
            '<br>측정 코드를 심은 다음 날부터 채워집니다.</p>';
    }

    /* 데일리 카운터 — 이 페이지가 말하는 숫자는 "어제 하루"다.
       데이터가 매일 아침 07:00에 한 번만 갱신되므로 그 시점의 "오늘"은 새벽치뿐이라
       (실측: 00~06시가 전체 세션의 15%) 아예 싣지 않는다. 어제가 많았는지 적었는지는
       옆의 7일 하루 평균과 견주면 된다. */
    const yday = data.daily.length ? data.daily[data.daily.length - 1] : null;
    const avg7 = data.summary.activeUsers.cur / 7;
    parts.push(`<section class="hero">
        <div class="hero-main">
            <div class="label">어제 방문자${yday ? ` <span class="tag">${esc(mmdd(yday.date))}</span>` : ''}</div>
            <div class="figure">${yday ? fmt(yday.users) : '—'}</div>
            <div class="sub">${yday
                ? `세션 ${fmt(yday.sessions)} · 페이지 조회 ${fmt(yday.views)}`
                : '집계된 하루가 아직 없습니다'}</div>
            ${yday ? deltaHTML(pctDelta(yday.users, avg7), '최근 7일 하루 평균 대비') : ''}
        </div>
        <div class="hero-side">
            <div class="label">최근 7일 하루 평균</div>
            <div class="value">${fmt(avg7)}<span class="unit">명</span></div>
            <div class="sub">7일 합계 ${fmt(data.summary.activeUsers.cur)}명</div>
        </div>
    </section>`);

    parts.push(`<p class="meta-line">마지막 갱신 ${esc(data.meta.updatedAt)} KST · ` +
        `매일 아침 07:00 KST에 한 번 갱신하며, 모든 수치는 어제까지의 완결된 하루만 셉니다.</p>`);

    if (data.insights && data.insights.length) {
        parts.push(`<ul class="insights">${data.insights
            .map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`);
    }

    // KPI — 최근 7일 합계. 각각 지난 7일 대비 증감 + 28일 스파크라인.
    const s = data.summary;
    const dailyViews = data.daily.map((d) => d.views);
    const kpis = [
        { label: '활성 사용자', value: fmt(s.activeUsers.cur), delta: s.activeUsers.delta,
          spark: data.daily.map((d) => d.users) },
        { label: '신규 사용자', value: fmt(s.newUsers.cur), delta: s.newUsers.delta,
          spark: data.daily.map((d) => d.newUsers) },
        { label: '세션', value: fmt(s.sessions.cur), delta: s.sessions.delta,
          spark: data.daily.map((d) => d.sessions) },
        { label: '페이지 조회', value: fmt(s.screenPageViews.cur), delta: s.screenPageViews.delta,
          spark: dailyViews },
        { label: '참여율', value: pct(s.engagementRate.cur * 100, 1), delta: s.engagementRate.delta,
          spark: data.daily.map((d) => d.engagementRate) },
        { label: '평균 체류시간', value: dur(s.averageSessionDuration.cur),
          delta: s.averageSessionDuration.delta,
          spark: data.daily.map((d) => d.avgDuration) },
    ];
    parts.push('<h2 class="row-title">최근 7일</h2>');
    parts.push(`<div class="kpi-row">${kpis.map((k) =>
        `<div class="kpi"><div class="label">${esc(k.label)}</div>` +
        `<div class="value">${k.value}</div>${deltaHTML(k.delta)}` +
        sparkline(k.spark, 140, 26) + '</div>').join('')}</div>`);

    // 일별 추세
    parts.push(`<div class="card">
        <h2>일별 활성 사용자 · 세션</h2>
        <p class="card-note">최근 ${data.meta.trendDays}일 (어제까지)</p>
        <div class="chart-box tall"><canvas id="c-daily-${key}"></canvas></div>
        ${tableView('표로 보기', ['날짜', '활성 사용자', '신규', '세션', '참여율', '평균 체류'],
            data.daily.slice().reverse().map((d) => [
                d.date, fmt(d.users), fmt(d.newUsers), fmt(d.sessions),
                pct(d.engagementRate * 100, 1), dur(d.avgDuration)]))}
    </div>`);

    // 사이트별 / 코너별 — 항목마다 스파크라인을 붙인 소형 다중 그래프
    function rankTable(rows, nameHead, unitHead) {
        return `<div class="scroll"><table class="rank"><thead><tr>` +
            `<th>${esc(nameHead)}</th><th class="spark-cell">최근 ${data.meta.trendDays}일</th>` +
            `<th class="num">${esc(unitHead)}</th><th class="num">지난 7일 대비</th></tr></thead><tbody>` +
            rows.map((r) => `<tr><td class="name">${esc(r.name)}</td>` +
                `<td class="spark-cell">${sparkline(r.daily, 120, 24)}</td>` +
                `<td class="num">${fmt(r.cur)}</td>` +
                `<td class="num">${deltaHTML(r.delta, '')}</td></tr>`).join('') +
            `</tbody></table></div>`;
    }

    // 호스트가 하나뿐인 대상(블로그)에는 이 둘이 무의미해서 수집 단계에서 비어 온다.
    if (data.sites.length || data.sections.length) {
        parts.push(`<div class="grid">
            ${data.sites.length ? `<div class="card">
                <h2>사이트별 조회수</h2>
                <p class="card-note">이 GA4 속성이 받는 호스트 전부 · 로컬(localhost·사설 IP) 방문은 제외</p>
                ${rankTable(data.sites, '사이트', '최근 7일')}
            </div>` : ''}
            ${data.sections.length ? `<div class="card">
                <h2>atah.io 코너별 조회수</h2>
                <p class="card-note">경로 앞부분으로 묶음</p>
                ${rankTable(data.sections, '코너', '최근 7일')}
            </div>` : ''}
        </div>`);
    }

    // 유입
    parts.push(`<div class="grid">
        <div class="card">
            <h2>유입 채널별 세션</h2>
            <p class="card-note">최근 7일</p>
            <div class="chart-box"><canvas id="c-channels-${key}"></canvas></div>
            ${tableView('표로 보기', ['채널', '세션', '사용자'],
                data.channels.map((c) => [esc(c.name), fmt(c.sessions), fmt(c.users)]))}
        </div>
        <div class="card">
            <h2>어디서 오는가 (Referral)</h2>
            <p class="card-note">최근 7일 · 링크를 타고 들어온 경우만</p>
            <div class="chart-box"><canvas id="c-referral-${key}"></canvas></div>
            ${tableView('표로 보기', ['출처', '세션', '사용자'],
                data.referral.map((r) => [esc(r.name), fmt(r.sessions), fmt(r.users)]))}
        </div>
    </div>`);

    // 시간대 히트맵 — 크기는 파랑 한 색의 명도로만
    const grid = data.heatmap.grid;
    const heatMax = Math.max(1, ...grid.map((row) => Math.max.apply(null, row)));
    const bin = (v) => (v === 0 ? null : Math.min(5, Math.floor(v / heatMax * 5.999)));
    let heatHTML = '<div class="heat">';
    grid.forEach((row, wd) => {
        heatHTML += `<div class="rowlabel">${data.heatmap.labels[wd]}</div>`;
        row.forEach((v, hh) => {
            const b = bin(v);
            const bg = b === null ? '' : ` style="background:${C.seq[b]}"`;
            heatHTML += `<div class="cell"${bg} title="${data.heatmap.labels[wd]} ${hh}시 · ${fmt(v)}세션"></div>`;
        });
    });
    heatHTML += '<div class="rowlabel"></div>';
    for (let hh = 0; hh < 24; hh++) {
        heatHTML += `<div class="collabel">${hh % 6 === 0 ? hh : ''}</div>`;
    }
    heatHTML += '</div>';

    parts.push(`<div class="card">
        <h2>언제 오는가</h2>
        <p class="card-note">요일 × 시각별 세션, 최근 ${data.meta.trendDays}일 누적 · 속성 시간대 기준</p>
        ${heatHTML}
        <div class="heat-scale"><span>적음</span>${C.seq.map((c) =>
            `<i style="background:${c}"></i>`).join('')}<span>많음 (최대 ${fmt(heatMax)}세션)</span></div>
        ${tableView('표로 보기', ['요일'].concat(Array.from({ length: 24 }, (_, h) => `${h}시`)),
            grid.map((row, wd) => [data.heatmap.labels[wd]].concat(row.map(fmt))))}
    </div>`);

    // 점유율 막대 — 항목이 2~3개인 부분-전체는 파이 대신 한 줄 막대
    function shareCard(title, note, items, field, unit) {
        const total = items.reduce((a, i) => a + i[field], 0);
        const bar = items.map((i, n) =>
            `<span style="flex:${i[field] || 0.0001};background:${C.series[n]}" ` +
            `title="${esc(i.name)} ${fmt(i[field])}${unit}"></span>`).join('');
        const legend = items.map((i, n) =>
            `<span><i class="key" style="background:${C.series[n]}"></i>${esc(i.name)} ` +
            `<b>${fmt(i[field])}${unit}</b> (${pct(share(i[field], total))})</span>`).join('');
        return `<div class="card"><h2>${esc(title)}</h2><p class="card-note">${esc(note)}</p>` +
            `<div class="share-bar">${bar}</div><div class="share-legend">${legend}</div></div>`;
    }

    parts.push(`<div class="grid">
        ${shareCard('기기', '최근 7일 세션', data.devices, 'sessions', '세션')}
        ${shareCard('신규 vs 재방문', '최근 7일 사용자', data.visitors, 'users', '명')}
    </div>`);

    // 인기 페이지 / 국가
    parts.push(`<div class="grid">
        <div class="card">
            <h2>${data.sites.length ? '인기 페이지' : '인기 글'}</h2>
            <p class="card-note">최근 7일 · 조회수 상위 ${data.pages.length}개</p>
            <div class="scroll"><table class="rank"><thead><tr>
                <th>${data.sites.length ? '페이지' : '글'}</th><th class="num">조회</th>
                <th class="num">사용자</th><th class="num">조회당 체류</th></tr></thead><tbody>
                ${data.pages.map((p) => `<tr><td>` +
                    (p.note ? `<span class="host">${esc(p.note)}</span>` : '') +
                    `<span class="path">${esc(p.name)}</span></td>` +
                    `<td class="num">${fmt(p.views)}</td><td class="num">${fmt(p.users)}</td>` +
                    `<td class="num">${dur(p.secPerView)}</td></tr>`).join('')}
            </tbody></table></div>
        </div>
        <div class="card">
            <h2>국가</h2>
            <p class="card-note">최근 7일 활성 사용자 상위 ${data.countries.length}개국</p>
            <div class="scroll"><table class="rank"><thead><tr><th>국가</th><th class="num">사용자</th></tr></thead><tbody>
                ${data.countries.map((c) => `<tr><td class="name">${esc(c.name)}</td>` +
                    `<td class="num">${fmt(c.users)}</td></tr>`).join('')}
            </tbody></table></div>
        </div>
    </div>`);

    parts.push(`<p class="meta-line">GA4 속성 ${esc(data.meta.propertyId)} · Google Analytics Data API · ` +
        `GitHub Actions가 매일 07:00 KST에 갱신</p>`);

    return parts.join('');
    }

    /* 캔버스 차트는 패널이 화면에 나온 뒤에 만든다 — 숨어 있는(display:none) 칸에서
       만들면 Chart.js가 크기를 0으로 재서 탭을 눌렀을 때 찌그러진 채로 나온다. */
    function makeCharts(data, key) {
        const at = (id) => document.getElementById(`${id}-${key}`);
        if (!at('c-daily')) return;   // 데이터가 없어 빈 화면을 그린 경우

        lineChart(at('c-daily'), data.daily.map((d) => mmdd(d.date)), [
            { label: '활성 사용자', data: data.daily.map((d) => d.users), fill: true },
            { label: '세션', data: data.daily.map((d) => d.sessions), fill: true },
        ]);
        barChart(at('c-channels'),
            data.channels.map((c) => c.name), data.channels.map((c) => c.sessions), '세션');
        barChart(at('c-referral'),
            data.referral.map((r) => r.name), data.referral.map((r) => r.sessions), '세션');
    }

    // --- 탭 ------------------------------------------------------------
    const charted = new Set();

    nav.innerHTML = views.map((v, i) =>
        `<a href="#${esc(v.key)}" data-key="${esc(v.key)}"${i === 0 ? ' class="active"' : ''}>` +
        `${esc(v.data.meta.label || v.key)}</a>`).join('');

    panelRoot.innerHTML = views.map((v, i) =>
        `<section class="panel" data-key="${esc(v.key)}"${i === 0 ? '' : ' hidden'}>` +
        `${buildHTML(v.data, v.key)}</section>`).join('');

    function activate(key) {
        if (!views.some((v) => v.key === key)) return;
        nav.querySelectorAll('a').forEach((a) =>
            a.classList.toggle('active', a.dataset.key === key));
        panelRoot.querySelectorAll('.panel').forEach((p) => {
            p.hidden = p.dataset.key !== key;
        });
        if (!charted.has(key)) {
            charted.add(key);
            makeCharts(registry[key], key);
        }
    }

    nav.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-key]');
        if (!a) return;
        e.preventDefault();
        history.replaceState(null, '', `#${a.dataset.key}`);
        activate(a.dataset.key);
    });

    const fromHash = window.location.hash.slice(1);
    activate(views.some((v) => v.key === fromHash) ? fromHash : views[0].key);
})();
