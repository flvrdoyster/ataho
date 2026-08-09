/* atah.io 대시보드 — data/ga4.js 의 window.GA4_DATA 를 화면으로 그린다.
   데이터는 scripts/ga4_dashboard.py 가 매일 새로 쓰고, 이 파일은 손으로 관리한다.

   차트 규칙(고쳐도 되지만 이유는 알고 고치세요):
   - y축은 하나만. 크기가 다른 두 지표를 한 그림에 겹치지 않는다.
   - 색은 항목의 정체성을 따른다. 순위가 바뀌어도 같은 항목은 같은 색.
   - 크기(많고 적음)는 파랑 한 색의 명도로만 표현한다(무지개 금지).
   - 모든 차트에는 같은 값을 읽을 수 있는 표가 함께 있다. */
(function () {
    'use strict';

    const data = window.GA4_DATA;
    const root = document.getElementById('ga4');
    if (!data) {
        root.innerHTML = '<p class="empty">아직 수집된 데이터가 없습니다.' +
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

    // --- 조각들 --------------------------------------------------------
    const parts = [];

    parts.push(`<p class="meta-line">최근 7일 (어제까지) · 마지막 갱신 ${esc(data.meta.updatedAt)} KST · ` +
        `오늘은 진행 중이라 추세에서 뺐습니다 — 지금까지 ${fmt(data.today.activeUsers)}명 / ` +
        `${fmt(data.today.sessions)}세션 / ${fmt(data.today.screenPageViews)}조회</p>`);

    if (data.insights && data.insights.length) {
        parts.push(`<ul class="insights">${data.insights
            .map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`);
    }

    // KPI — 한눈에 읽는 숫자들. 각각 지난 7일 대비 증감 + 28일 스파크라인.
    const s = data.summary;
    const dailyViews = data.trendDates.map((_, i) =>
        data.sites.reduce((a, site) => a + site.daily[i], 0));
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
    parts.push(`<div class="kpi-row">${kpis.map((k) =>
        `<div class="kpi"><div class="label">${esc(k.label)}</div>` +
        `<div class="value">${k.value}</div>${deltaHTML(k.delta)}` +
        sparkline(k.spark, 140, 26) + '</div>').join('')}</div>`);

    // 일별 추세
    parts.push(`<div class="card">
        <h2>일별 활성 사용자 · 세션</h2>
        <p class="card-note">최근 ${data.meta.trendDays}일 (어제까지)</p>
        <div class="chart-box tall"><canvas id="c-daily"></canvas></div>
        ${tableView('표로 보기', ['날짜', '활성 사용자', '신규', '세션', '참여율', '평균 체류'],
            data.daily.slice().reverse().map((d) => [
                d.date, fmt(d.users), fmt(d.newUsers), fmt(d.sessions),
                pct(d.engagementRate * 100, 1), dur(d.avgDuration)]))}
    </div>`);

    // 사이트별 / 코너별 — 항목마다 스파크라인을 붙인 소형 다중 그래프
    function rankTable(rows, nameHead, unitHead) {
        return `<table class="rank"><thead><tr>` +
            `<th>${esc(nameHead)}</th><th class="spark-cell">최근 ${data.meta.trendDays}일</th>` +
            `<th class="num">${esc(unitHead)}</th><th class="num">지난 7일 대비</th></tr></thead><tbody>` +
            rows.map((r) => `<tr><td class="name">${esc(r.name)}</td>` +
                `<td class="spark-cell">${sparkline(r.daily, 120, 24)}</td>` +
                `<td class="num">${fmt(r.cur)}</td>` +
                `<td class="num">${deltaHTML(r.delta, '')}</td></tr>`).join('') +
            `</tbody></table>`;
    }

    parts.push(`<div class="grid">
        <div class="card">
            <h2>사이트별 조회수</h2>
            <p class="card-note">이 GA4 속성이 받는 호스트 전부 · 로컬(localhost·사설 IP) 방문은 제외</p>
            ${rankTable(data.sites, '사이트', '최근 7일')}
        </div>
        <div class="card">
            <h2>atah.io 코너별 조회수</h2>
            <p class="card-note">경로 앞부분으로 묶음</p>
            ${rankTable(data.sections, '코너', '최근 7일')}
        </div>
    </div>`);

    // 유입
    parts.push(`<div class="grid">
        <div class="card">
            <h2>유입 채널별 세션</h2>
            <p class="card-note">최근 7일</p>
            <div class="chart-box"><canvas id="c-channels"></canvas></div>
            ${tableView('표로 보기', ['채널', '세션', '사용자'],
                data.channels.map((c) => [esc(c.name), fmt(c.sessions), fmt(c.users)]))}
        </div>
        <div class="card">
            <h2>어디서 오는가 (Referral)</h2>
            <p class="card-note">최근 7일 · 링크를 타고 들어온 경우만</p>
            <div class="chart-box"><canvas id="c-referral"></canvas></div>
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
    function shareCard(title, note, items, key, unit) {
        const total = items.reduce((a, i) => a + i[key], 0);
        const bar = items.map((i, n) =>
            `<span style="flex:${i[key] || 0.0001};background:${C.series[n]}" ` +
            `title="${esc(i.name)} ${fmt(i[key])}${unit}"></span>`).join('');
        const legend = items.map((i, n) =>
            `<span><i class="key" style="background:${C.series[n]}"></i>${esc(i.name)} ` +
            `<b>${fmt(i[key])}${unit}</b> (${pct(share(i[key], total))})</span>`).join('');
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
            <h2>인기 페이지</h2>
            <p class="card-note">최근 7일 · 조회수 상위 ${data.pages.length}개</p>
            <table class="rank"><thead><tr><th>페이지</th><th class="num">조회</th>
                <th class="num">사용자</th><th class="num">조회당 체류</th></tr></thead><tbody>
                ${data.pages.map((p) => `<tr><td><span class="host">${esc(p.host)}</span>` +
                    `<span class="path">${esc(p.path)}</span></td>` +
                    `<td class="num">${fmt(p.views)}</td><td class="num">${fmt(p.users)}</td>` +
                    `<td class="num">${dur(p.secPerView)}</td></tr>`).join('')}
            </tbody></table>
        </div>
        <div class="card">
            <h2>국가</h2>
            <p class="card-note">최근 7일 활성 사용자 상위 ${data.countries.length}개국</p>
            <table class="rank"><thead><tr><th>국가</th><th class="num">사용자</th></tr></thead><tbody>
                ${data.countries.map((c) => `<tr><td class="name">${esc(c.name)}</td>` +
                    `<td class="num">${fmt(c.users)}</td></tr>`).join('')}
            </tbody></table>
        </div>
    </div>`);

    parts.push(`<p class="meta-line">GA4 속성 ${esc(data.meta.propertyId)} · Google Analytics Data API · ` +
        `GitHub Actions가 매일 07:00 KST에 갱신</p>`);

    root.innerHTML = parts.join('');

    // --- 캔버스 차트 ---------------------------------------------------
    lineChart(document.getElementById('c-daily'), data.daily.map((d) => mmdd(d.date)), [
        { label: '활성 사용자', data: data.daily.map((d) => d.users), fill: true },
        { label: '세션', data: data.daily.map((d) => d.sessions), fill: true },
    ]);

    barChart(document.getElementById('c-channels'),
        data.channels.map((c) => c.name), data.channels.map((c) => c.sessions), '세션');

    barChart(document.getElementById('c-referral'),
        data.referral.map((r) => r.name), data.referral.map((r) => r.sessions), '세션');
})();
