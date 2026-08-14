/* atah.io 대시보드 — data/*.js 가 window.DASHBOARD_DATA 에 넣어 둔 대상들을 탭으로 그린다.
   데이터는 scripts/ga4_dashboard.py 가 매일 새로 쓰고, 이 파일은 손으로 관리한다.
   대상을 늘리려면 수집 스크립트에 Target 을 추가하고 index.html 에 <script> 한 줄만
   더하면 된다 — 탭은 여기서 자동으로 만들어진다.

   이 페이지의 주어는 "어제"다. 28일치도 담지만 어제가 많은 날이었는지 적은
   날이었는지 가늠할 자로만 쓴다. 지표마다 GA4가 확정하는 시점이 달라서
   (수집 스크립트의 SETTLED 주석 참조) 어제 칸에 올릴 수 있는 것과 없는 것이
   갈린다 — 참여율·평균 체류는 맨 아래 확정 구간에만 둔다.

   차트 규칙(고쳐도 되지만 이유는 알고 고치세요):
   - y축은 하나만. 크기가 다른 두 지표를 한 그림에 겹치지 않는다.
   - 색은 항목의 정체성을 따른다. 순위가 바뀌어도 같은 항목은 같은 색.
   - 크기(많고 적음)는 파랑 한 색의 명도로만 표현한다(무지개 금지).
   - 많고 적음을 좋고 나쁨의 색으로 칠하지 않는다. 방문자가 적은 날이
     나쁜 날은 아니므로 "평소 범위 / 많은 편 / 적은 편"이라는 말로만 쓴다.
   - 캔버스로 그린 것에는 같은 값을 읽을 수 있는 표가 함께 있다.

   보이는 값(색·서체·굵기·둥글기)은 이 파일에 두지 않는다 — 전부 theme.css 의
   토큰에서 읽는다. 테마를 갈아끼울 때 이 파일을 열지 않아도 되게 하려는 것. */
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
    /* 캔버스(Chart.js·스파크라인 SVG)는 CSS가 닿지 않는 그림이라, 색·서체·굵기를
       여기서 직접 정해야 한다. 그 값을 코드에 박아 두면 테마를 갈아끼울 때 CSS와
       JS 두 곳을 고쳐야 하므로, 전부 theme.css 의 토큰에서 읽어 온다.
       새 시각 상수가 필요하면 여기 박지 말고 theme.css 에 토큰을 만들 것. */
    const css = getComputedStyle(document.documentElement);
    const T = (name, fallback) => css.getPropertyValue(name).trim() || fallback || '';
    /* px·배수 토큰을 숫자로. 토큰이 없거나 이상하면 fallback — 테마 파일을
       빠뜨려도 차트가 통째로 사라지지는 않게. */
    const N = (name, fallback) => {
        const v = parseFloat(T(name));
        return Number.isFinite(v) ? v : fallback;
    };
    const C = {
        surface: T('--surface'), textPrimary: T('--text-primary'),
        textSecondary: T('--text-secondary'), muted: T('--text-muted'),
        grid: T('--grid'), axis: T('--axis'), deemph: T('--deemph'),
        band: T('--band'),
        series: [T('--series-1'), T('--series-2'), T('--series-3'),
                 T('--series-4'), T('--series-5'), T('--series-6')],
        seq: [T('--seq-1'), T('--seq-2'), T('--seq-3'), T('--seq-4'), T('--seq-5'), T('--seq-6')],
    };
    const FONT = T('--font-ui', 'sans-serif');
    const G = {   // 기하 — 전부 theme.css 에서
        fontSize: N('--chart-font-size', 12),
        lineW: N('--line-w', 2),
        tension: N('--line-tension', 0.25),
        fillAlpha: N('--line-fill-alpha', 0.1),
        pointR: N('--point-r', 4),
    };

    /* 선 아래 면은 같은 색의 옅은 칠. #rrggbb 면 알파를 덧붙이고, 그 밖의
       표기(rgba()·color-mix 등)를 쓰는 테마에서는 원색을 그대로 돌려준다 —
       문자열을 잘못 이어 붙여 색이 통째로 무효가 되는 것보다 낫다. */
    function fillColor(color) {
        if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
        const a = Math.round(Math.min(1, Math.max(0, G.fillAlpha)) * 255);
        return color + a.toString(16).padStart(2, '0');
    }

    const nf = new Intl.NumberFormat('ko-KR');
    const fmt = (n) => nf.format(Math.round(n));
    /* 하루 평균처럼 1보다 작을 수 있는 값은 반올림하면 "0"이 되어 버린다
       (평소 하루 0.7회짜리 페이지가 "0"으로 보이면 배율을 읽을 수가 없다). */
    const dec1 = (n) => n.toFixed(1);
    const pct = (n, digits) => `${n.toFixed(digits === undefined ? 0 : digits)}%`;
    const dur = (s) => {
        const m = Math.floor(s / 60), sec = Math.round(s % 60);
        return m ? `${m}분 ${sec}초` : `${sec}초`;
    };
    const esc = (s) => String(s).replace(/[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const mmdd = (iso) => iso.slice(5).replace('-', '.');
    const share = (v, total) => (total ? v / total * 100 : 0);
    function tableView(summary, head, rows) {
        return `<details class="table-view"><summary>${esc(summary)}</summary><div class="scroll">` +
            `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
            `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}` +
            `</tbody></table></div></details>`;
    }

    // --- Chart.js 공통 ------------------------------------------------
    Chart.defaults.font.family = FONT;
    Chart.defaults.font.size = G.fontSize;
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

    /* 선 끝 직접 라벨. 두 선이 글자 한 줄(+여유 2px)보다 가까우면 겹쳐 읽히므로
       범례에 맡기고 그리지 않는다 — 서체 크기를 키우면 이 기준도 같이 커진다. */
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
                    if (Math.abs(ends[i].el.y - ends[j].el.y) < G.fontSize + 2) return;
                }
            }
            const ctx = chart.ctx;
            ends.forEach((e) => {
                ctx.save();
                ctx.fillStyle = C.textSecondary;
                ctx.font = `${G.fontSize}px ${FONT}`;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText(e.label, e.el.x, e.el.y - 8);
                ctx.restore();
            });
        },
    };

    function lineChart(canvas, labels, datasets, extraPlugins) {
        return new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: datasets.map((d, i) => ({
                    label: d.label,
                    data: d.data,
                    borderColor: C.series[i],
                    backgroundColor: fillColor(C.series[i]),
                    borderWidth: G.lineW,
                    tension: G.tension,
                    fill: !!d.fill,
                    /* 점마다 다른 크기를 줄 수 있다 — 어제 점만 크게 그릴 때 쓴다 */
                    pointRadius: d.pointRadius === undefined ? 0 : d.pointRadius,
                    pointBackgroundColor: C.series[i],
                    pointBorderColor: C.surface,
                    pointBorderWidth: G.lineW,
                    pointHoverRadius: G.pointR,
                    pointHoverBorderColor: C.surface,
                    pointHoverBorderWidth: G.lineW,
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
            plugins: [crosshair, lineEndLabels].concat(extraPlugins || []),
        });
    }

    /* 어제 하루를 28일 분포 위에 얹어 그린다 — q1~q3 띠와 중앙값 선을 추세선
       뒤에 깔면 "어제가 평소보다 위인지 아래인지"를 눈금을 읽지 않고 알 수 있다.
       crosshair 와 같은 방식으로 데이터셋보다 먼저 그려 배경이 되게 한다. */
    function normalBand(box) {
        return {
            id: 'normalBand',
            beforeDatasetsDraw(chart) {
                if (!box) return;
                const { ctx, chartArea: area, scales } = chart;
                const y = scales.y;
                const top = y.getPixelForValue(box.q3);
                const bottom = y.getPixelForValue(box.q1);
                const mid = y.getPixelForValue(box.median);
                ctx.save();
                ctx.fillStyle = C.band;
                ctx.fillRect(area.left, top, area.right - area.left, bottom - top);
                ctx.strokeStyle = C.deemph;
                ctx.setLineDash([3, 3]);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(area.left, mid);
                ctx.lineTo(area.right, mid);
                ctx.stroke();
                ctx.restore();
            },
        };
    }

    // --- 화면 한 벌 ----------------------------------------------------
    /* 이 페이지의 주어는 "어제"다. 28일치는 어제를 가늠할 자로만 쓴다.
       지표마다 확정 시점이 달라서(수집 스크립트의 SETTLED 주석 참조) 어제 칸에
       올릴 수 있는 것과 없는 것이 갈린다 — 참여율·평균 체류는 맨 아래 확정 구간에만.

       화면은 모듈(박스) 여럿을 12칸 격자에 올려 만든다. 구획을 하나 넣거나
       빼거나 순서를 바꾸는 일이 mod() 호출 하나로 끝나게 하려는 것 —
       배치 규칙은 CSS 한 곳(.dash-main / .module)에만 있다. */
    function buildHTML(data, key) {
    const parts = [];
    const y = data.yesterday;

    /* 모듈 하나 = 박스 하나. span 은 12칸 중 몇 칸을 차지할지.
       note·body 는 이 파일 안에서 만든 마크업이라 그대로 넣고, 데이터에서 온
       문자열은 각 호출부에서 esc() 를 거친다. */
    function mod(span, title, note, body, extra) {
        return `<section class="module span-${span}${extra ? ' ' + extra : ''}">` +
            (title ? `<h2>${esc(title)}</h2>` : '') +
            (note ? `<p class="module-note">${note}</p>` : '') +
            body + '</section>';
    }

    if (!data.daily.length || !y || !y.date) {
        return mod(12, '', '',
            `<p class="meta-line">마지막 갱신 ${esc(data.meta.updatedAt)} KST · ` +
            `GA4 속성 ${esc(data.meta.propertyId)}</p>` +
            '<p class="empty">아직 이 대상에서 집계된 하루가 없습니다.' +
            '<br>측정 코드를 심은 다음 날부터 채워집니다.</p>');
    }

    const base = data.baseline || {};
    const WHERE = { high: '많은 편', low: '적은 편', usual: '평소 범위' };

    /* 어제가 분포의 어디인지 한 줄로. 색은 좋고 나쁨이 아니라 위치를 말한다 —
       방문자가 적은 날이 "나쁜 날"은 아니므로 증감색은 쓰지 않는다.
       num 은 칸마다 다르다 — 방문자·세션은 정수지만 "한 사람당 2.7장"은
       반올림하면 3장이 되어 4.0장과의 차이가 사라진다. */
    function standing(box, unit, num) {
        if (!box) return '<div class="standing"></div>';
        return `<div class="standing"><span class="where ${esc(box.where)}">` +
            `${esc(WHERE[box.where])}</span>` +
            `<span class="dim">중앙값 ${(num || fmt)(box.median)}${esc(unit)}</span></div>`;
    }

    function stat(label, box, unit, num, sub) {
        const f = num || fmt;
        return `<div class="stat">
            <div class="label">${esc(label)}</div>
            <div class="value">${box ? f(box.value) : '—'}` +
            `<span class="unit">${esc(unit)}</span></div>
            ${standing(box, unit, f)}
            ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
        </div>`;
    }

    // 1) 어제 스탯 네 칸
    const pu = base.perUser;
    parts.push(mod(5, '', '', `
        <div class="yday-title">어제 <span class="tag">${esc(mmdd(y.date))}</span></div>
        <p class="meta-line">마지막 갱신 ${esc(data.meta.updatedAt)} KST ·
            매일 아침 07:00 KST에 어제 하루치를 모읍니다.</p>
        <div class="stat-grid">
            ${stat('방문자', base.users, '명', fmt, `새로 온 사람 ${fmt(y.newUsers)}명`)}
            ${stat('페이지 조회', base.views, '회', fmt)}
            ${stat('세션', base.sessions, '', fmt)}
            ${stat('한 사람당', pu, '장', dec1)}
        </div>`, 'accent stretch'));

    // 2) 평소와 견주면 — 28일 추세선 + 분포 띠. 어제 점만 크게.
    /* data.meta.trendDays 는 수집 스크립트가 "요청한" 구간(항상 28)이라 실제
       받아온 일수와 다를 수 있다 — 블로그는 속성을 튼 지 얼마 안 돼 daily 가
       5행뿐인데 trendDays 를 그대로 쓰면 "최근 28일"이라고 거짓말하게 된다.
       실제로 그려지는 data.daily.length 를 쓴다(아래 「평소/일」 설명과 같은 이유). */
    parts.push(mod(7, '평소와 견주면',
        `최근 ${data.daily.length}일 일별 방문자 ·
         띠는 가운데 절반이 들어오는 구간, 점선은 중앙값`,
        `<div class="chart-box"><canvas id="c-trend-${key}"></canvas></div>
         ${tableView('표로 보기', ['날짜', '방문자', '세션', '조회'],
             data.daily.slice().reverse().map((d) => [
                 d.date, fmt(d.users), fmt(d.sessions), fmt(d.views)]))}`, 'stretch'));

    // 3) 인사이트
    if (data.insights && data.insights.length) {
        parts.push(mod(12, '', '',
            `<ul class="insights">${data.insights
                .map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul>`));
    }

    // 4) 어제 본 페이지 — 사이트별 소계를 위에 한 줄로
    /* 이름 우선순위: 코너(atah.io 안) → 페이지 제목(pc98/suiko — <title>에서
       따온 사람이 읽는 이름) → 원시 경로(둘 다 없을 때만). 원래 경로로 바꿔치기
       한 경우에만 그 경로를 작게 보조줄로 남긴다 — "환세풍광전" 아래 "/hukyou.html".
       「평소/일」 칸의 배율은 수집 스크립트가 튀었다고 판정한 행에만 붙인다 —
       문턱을 여기서 다시 재면 표와 인사이트 문장이 언젠가 어긋난다. */
    const pageRows = data.ydayPages.map((p) => {
        const label = p.section || p.title || p.name;
        const sub = label !== p.name ? p.name : '';
        const usual = p.priorAvg > 0
            ? dec1(p.priorAvg) + (p.spike
                ? `<span class="ratio">${dec1(p.views / p.priorAvg)}배</span>` : '')
            : '<span class="dim" title="어제 이전 구간에는 조회가 없던 페이지">처음</span>';
        /* 호스트는 이름 옆에 작게 붙인다 — 제 줄을 차지하면 한 행이 3줄이 되고
           같은 호스트가 아홉 번 반복된다. 위의 점유율 막대가 이미 비중을 말한다. */
        return `<tr><td class="page">` +
            `<span class="name">${esc(label)}</span>` +
            (p.host ? `<span class="host">${esc(p.host)}</span>` : '') +
            (sub ? `<div class="path">${esc(sub)}</div>` : '') +
            `</td><td class="num">${fmt(p.views)}</td>` +
            `<td class="num usual">${usual}</td>` +
            `<td class="num">${fmt(p.users)}</td></tr>`;
    }).join('');

    const siteTotal = data.ydaySites.reduce((a, s) => a + s.views, 0);
    const siteBar = data.ydaySites.length ? `<div class="share-bar">${data.ydaySites
        .map((s, n) => `<span style="flex:${s.views || 0.0001};background:${C.series[n]}" ` +
            `title="${esc(s.name)} ${fmt(s.views)}회"></span>`).join('')}</div>` +
        `<div class="share-legend">${data.ydaySites.map((s, n) =>
            `<span><i class="key" style="background:${C.series[n]}"></i>${esc(s.name)} ` +
            `<b>${fmt(s.views)}</b> (${pct(share(s.views, siteTotal))})</span>`).join('')}</div>` : '';

    /* 설명문은 대상에 맞춰 갈라진다 — 코너 묶음은 사이트에만 있고, 평소 평균의
       기준 일수도 대상마다 다르다(블로그는 아직 5일치라 4일 평균이다).
       meta.trendDays 를 그대로 쓰면 블로그에도 "27일 평균"이라고 적힌다. */
    parts.push(mod(7, '어제 본 페이지',
        `조회수 순${data.ydaySites.length ? ' · atah.io 안은 코너 이름으로 묶어 표시' : ''} ·
         「평소/일」은 어제 이전 ${data.daily.length - 1}일의 하루 평균`,
        `${siteBar}
         <div class="scroll"><table class="rank pages"><thead><tr>
            <th>페이지</th><th class="num">어제 조회</th>
            <th class="num">평소/일</th><th class="num">사람</th>
         </tr></thead><tbody>${pageRows ||
            '<tr><td colspan="4" class="dim">어제 조회된 페이지가 없습니다.</td></tr>'}
         </tbody></table></div>`));

    // 5) 어제 온 곳
    const srcRows = data.ydaySources.map((s) =>
        `<tr><td class="name">${esc(s.name)}</td>` +
        `<td class="num">${fmt(s.sessions)}</td></tr>`).join('');

    /* 미분류를 목록에 섞지 않는 이유는 수집 스크립트 주석 참조 — 어제치는
       GA4가 아직 재처리 중이라 대개 이게 1위로 올라온다. */
    const unresolved = data.ydayUnresolved
        ? `<p class="note-line">아직 분류 중 <b>${fmt(data.ydayUnresolved)}</b>건 —
             GA4가 어제 유입을 재처리하는 중입니다. 내일이면 대개 채워집니다.</p>`
        : '';

    parts.push(mod(5, '어제 온 곳',
        `유입원별 세션 · 한 세션에 출처가 여럿 붙는 경우가 있어
         합계가 어제 세션 수와 다를 수 있습니다`,
        `<div class="scroll"><table class="rank"><thead><tr>
            <th>출처</th><th class="num">세션</th></tr></thead><tbody>${srcRows ||
            '<tr><td colspan="2" class="dim">분류된 유입원이 없습니다.</td></tr>'}
         </tbody></table></div>
         ${unresolved}`));

    // 6) 어제 시간대 — 24칸이라 전체폭이 가장 잘 맞는다
    /* 색 계단 수는 실제 값의 종류만큼만 쓴다. 어제 최대가 4세션인데 6단계 램프를
       그대로 쓰면 1세션과 2세션이 거의 같은 색이 되고 4세션 칸만 하얗게 튄다 —
       구간이 값보다 잘게 쪼개져서 색이 정보를 잃는다. */
    const hours = data.ydayHours || [];
    const hourMax = Math.max(1, ...hours);
    const steps = Math.min(C.seq.length, hourMax);
    const strip = hours.map((v, hh) => {
        const bg = v === 0 ? ''
            : ` style="background:${C.seq[Math.min(steps, Math.ceil(v / hourMax * steps)) - 1]}"`;
        return `<div class="cell"${bg} title="${hh}시 · ${fmt(v)}세션"></div>`;
    }).join('');
    const hourTicks = hours.map((_, hh) =>
        `<div class="collabel">${hh % 6 === 0 ? `${hh}시` : ''}</div>`).join('');
    const hourScale = C.seq.slice(0, steps)
        .map((c) => `<i style="background:${c}"></i>`).join('');

    parts.push(mod(12, '어제 시간대', '시각별 세션 · 속성 시간대 기준',
        `<div class="hour-strip">${strip}</div>
         <div class="hour-ticks">${hourTicks}</div>
         <div class="legend-scale"><span>적음</span>${hourScale}` +
        `<span>많음 (최대 ${fmt(hourMax)}세션)</span></div>`));

    // 7) 확정 구간 — 어제 칸에 못 올리는 두 값
    const st = data.settled;
    if (st) {
        parts.push(mod(12, '참여율 · 체류시간',
            `어제를 뺀 마지막 ${data.meta.settledDays || 7}일 기준
             (세션 ${fmt(st.sessions)}건). GA4가 참여 여부를 하루 이상 뒤에
             확정하므로 어제 칸에는 올리지 않습니다.`,
            `<div class="settled-row">
                <div><div class="label">참여율</div>
                     <div class="value">${pct(st.engagementRate * 100, 1)}</div></div>
                <div><div class="label">평균 체류시간</div>
                     <div class="value">${dur(st.avgDuration)}</div></div>
             </div>`));
    }

    parts.push(`<p class="meta-line span-12">GA4 속성 ${esc(data.meta.propertyId)} · ` +
        `Google Analytics Data API · GitHub Actions가 매일 07:00 KST에 갱신</p>`);

    return parts.join('');
    }

    /* 캔버스 차트는 패널이 화면에 나온 뒤에 만든다 — 숨어 있는(display:none) 칸에서
       만들면 Chart.js가 크기를 0으로 재서 탭을 눌렀을 때 찌그러진 채로 나온다. */
    function makeCharts(data, key) {
        const at = (id) => document.getElementById(`${id}-${key}`);
        if (!at('c-trend')) return;   // 데이터가 없어 빈 화면을 그린 경우

        /* 어제 점만 크게 — 선 위에서 "오늘 말하는 날"이 어디인지 바로 짚이게.
           Chart.js는 pointRadius에 배열을 받으면 점마다 다르게 그린다. */
        const last = data.daily.length - 1;
        lineChart(at('c-trend'), data.daily.map((d) => mmdd(d.date)), [
            { label: '방문자', data: data.daily.map((d) => d.users), fill: true,
              pointRadius: data.daily.map((_, i) => (i === last ? G.pointR : 0)) },
        ], [normalBand(data.baseline && data.baseline.users)]);
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
