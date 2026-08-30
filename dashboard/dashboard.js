/* atah.io 대시보드 — data/*.js 가 window.DASHBOARD_DATA 에 넣어 둔 대상들을 탭으로 그린다.
   데이터는 scripts/ga4_dashboard.py 가 매일 새로 쓰고, 이 파일은 손으로 관리한다.
   대상을 늘리려면 수집 스크립트에 Target 을 추가하고 index.html 에 <script> 한 줄만
   더하면 된다 — 탭은 여기서 자동으로 만들어진다.

   이 페이지의 주어는 "어제"다. 28일치도 담지만 어제가 많은 날이었는지 적은
   날이었는지 가늠할 자로만 쓴다. 지표마다 GA4가 확정하는 시점이 달라서
   (수집 스크립트의 SETTLED 주석 참조) 어제 칸에 올릴 수 있는 것과 없는 것이
   갈린다 — 참여율·평균 체류는 맨 아래 확정 구간에만 둔다.

   히어로의 ◀▶ 로 과거 날짜(최대 28일 전)도 다시 볼 수 있다 — 수집 스크립트가
   매일 "어제"를 history 에 얼려 넣고, 그저께치는 재처리가 끝난 값으로 한 번
   더 덮어써서(HISTORY_REFRESH_AGE) 그 뒤로는 안 건드린다("살아있는 기록").
   과거 날짜를 보고 있을 땐 isLatest=false 가 두 가지를 바꾼다: 문장 속
   "어제"가 그 날짜(mmdd)로 바뀌고, 날짜 무관인 확정 구간·미확인 피드백
   모듈은 안 보인다(현재 시점 값을 과거 화면 옆에 두면 시점이 섞인다). 자세한
   흐름은 파일 맨 아래 snapshotFor()/renderPanel() 참조.

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

    /* 피드백은 GA4 대상이 아니라 시트라서 탭을 만들지 않고 전역으로 온다.
       수집 쪽이 집계만 담아 보낸다 — 메시지·UA·스크린샷 링크는 아예 읽지
       않는다(공개 페이지라 남이 보낸 글을 옮겨 싣지 않는다). */
    const fb = window.DASHBOARD_FEEDBACK || {};
    const fbPending = (fb.available && fb.pending && fb.pending.count > 0)
        ? fb.pending : null;

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
        band: T('--band'), accent: T('--accent'),
        series: [T('--series-1'), T('--series-2'), T('--series-3'),
                 T('--series-4'), T('--series-5'), T('--series-6')],
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
    const shiftDate = (iso, days) =>
        new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000)
            .toISOString().slice(0, 10);

    /* 확정 구간(어제를 뺀 7일) 안에서 가장 오래 머문 방문. 수집기의 SETTLED
       (8daysAgo~2daysAgo)와 같은 창을 날짜로 다시 그린다 — 최신이 어제이므로
       어제-7 ~ 어제-1 이다. 판정을 못 내린 날은 longest 가 없어 건너뛴다. */
    function longestInSettled(viewData) {
        const latest = viewData.yesterday && viewData.yesterday.date;
        const hist = viewData.history;
        if (!latest || !hist) return null;
        const start = shiftDate(latest, -7), end = shiftDate(latest, -1);
        let best = null;
        Object.keys(hist).forEach((d) => {
            if (d < start || d > end) return;
            const L = hist[d] && hist[d].longest;
            if (L && L.seconds && (!best || L.seconds > best.longest.seconds)) {
                best = { date: d, longest: L };
            }
        });
        return best;
    }
    function tableView(summary, head, rows) {
        return `<details class="table-view"><summary>${esc(summary)}</summary><div class="scroll">` +
            `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
            `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}` +
            `</tbody></table></div></details>`;
    }

    /* 미확인 피드백 리마인드 — 탭 위에 띠 하나. 탭을 옮겨 다녀도 늘 보이도록
       패널 밖(탭바 앞)에 둔다. 0건이면 아무것도 만들지 않는다: 평소엔 화면이
       예전과 똑같고, 남아 있을 때만 시끄럽다. */
    const tally = (items) => items.map((i) => `${esc(i.name)} ${fmt(i.count)}`).join(' · ');

    if (fbPending) {
        const age = fbPending.oldestDays === null || fbPending.oldestDays === undefined ? ''
            : fbPending.oldestDays === 0 ? ' · 가장 오래된 건 오늘'
            : ` · 가장 오래된 건 ${fmt(fbPending.oldestDays)}일 전`;
        nav.insertAdjacentHTML('beforebegin',
            `<p class="reminder"><b>확인 안 한 피드백 ${fmt(fbPending.count)}건</b>` +
            `<span class="dim">${tally(fbPending.byCategory)}${age}</span>` +
            (fb.sheetUrl ? ` <a href="${esc(fb.sheetUrl)}" target="_blank" ` +
                `rel="noopener noreferrer">시트 열기</a>` : '') + '</p>');
    }

    if (!views.length) {
        panelRoot.innerHTML = '<p class="empty">아직 수집된 데이터가 없습니다.' +
            '<br>GitHub Actions의 <b>GA4 Daily Dashboard</b> 워크플로우가 한 번 돌면 채워집니다.</p>';
        return;
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
                datasets: datasets.map((d, i) => {
                    /* 선 색은 데이터셋이 정할 수 있다. 주색(#7CA6DE)은 큰 면에는
                       좋지만 2px 선으로는 흰 배경에서 2.5:1 뿐이라, 띠 위를
                       지날 때 윤곽을 잃는다 — 추세선은 같은 색상각의 진한
                       형제(--accent)를 쓴다. 면은 주색 그대로. */
                    const line = d.color || C.series[i];
                    return {
                    label: d.label,
                    data: d.data,
                    borderColor: line,
                    backgroundColor: fillColor(C.series[i]),
                    borderWidth: G.lineW,
                    tension: G.tension,
                    /* 굴곡 — monotone 은 데이터 점을 넘어서 부풀지 않는 곡선이다.
                       Chart.js 기본 cubic 은 7→25→15 처럼 뾰족한 날에서 곡선이
                       점 바깥으로 튀었다가 되돌아오느라 억지로 꺾인 것처럼 보인다.
                       tension 이 0 이면(각진 톤을 원하는 스킨) 곡선을 끄고 직선으로. */
                    cubicInterpolationMode: G.tension > 0 ? 'monotone' : 'default',
                    fill: !!d.fill,
                    /* 점마다 다른 크기를 줄 수 있다 — 어제 점만 크게 그릴 때 쓴다 */
                    pointRadius: d.pointRadius === undefined ? 0 : d.pointRadius,
                    pointBackgroundColor: line,
                    pointBorderColor: C.surface,
                    pointBorderWidth: G.lineW,
                    pointHoverRadius: G.pointR,
                    pointHoverBorderColor: C.surface,
                    pointHoverBorderWidth: G.lineW,
                    pointHoverBackgroundColor: line,
                    };
                }),
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
    function buildHTML(data, key, primary, isLatest, latestDate) {
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

    /* dayLabel — 문장 속에서 "어제"를 대신할 말. 파이썬의 build_insights()와
       같은 이유로 갈린다: 최신 날짜는 "어제"가 맞지만, 히스토리를 눌러 과거
       날짜를 보고 있을 땐 "어제"라고 하면 거짓말이 된다(그 날짜는 이제
       어제가 아니다). heroWord 는 히어로 타이틀 전용 — 바로 옆에 날짜 태그가
       또 있어서 "08.15 (08.15)"처럼 겹치지 않게 "{n}일 전"으로 대신한다
       (fbPending.oldestDays 와 같은 표기). n 은 최신("어제" = 1일 전) 기준
       날짜 차이로 구하므로 뷰어의 로컬 타임존과 무관하다 — 단 이때 쓰는
       "최신"은 반드시 latestDate 인자여야 한다. data.yesterday 는 과거
       스냅샷을 볼 땐 그 날짜 자신의 yesterday 로 바뀌어 있어서(history 항목이
       자기 자신을 yesterday 로 갖고 있음) data.yesterday.date 를 쓰면 항상
       y.date 와 같아져 n 이 늘 1로 나온다 — 실제로 겪은 버그.
       위의 "데이터 없음" 가드보다 반드시 뒤에 있어야 한다 — y.date 가 없을 때
       mmdd(y.date) 를 부르면 죽는다. */
    const dayLabel = isLatest ? '어제' : mmdd(y.date);
    const daysAgo = Math.round(
        (Date.parse(`${latestDate}T00:00:00Z`) - Date.parse(`${y.date}T00:00:00Z`))
        / 86400000) + 1;
    const heroWord = isLatest ? '어제' : `${daysAgo}일 전`;

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
        <div class="yday-title">
            <button type="button" class="date-nav" data-nav="prev" aria-label="이전 날짜">◀</button>
            ${esc(heroWord)} <span class="tag">${esc(mmdd(y.date))}</span>
            <button type="button" class="date-nav" data-nav="next" aria-label="다음 날짜"${isLatest ? ' disabled' : ''}>▶</button>
        </div>
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

    /* 3-1) 미확인 피드백 — 첫 탭의 최신 화면에만. 어제 지표가 아니라 "지금
       처리할 일"이라 대상(사이트·블로그)에 딸린 값도 아니고 날짜에 딸린
       값도 아니다 — 3주 전 날짜를 보고 있는데 "지금 미확인 3건"이 뜨면
       그날의 일처럼 오해할 수 있어 과거 화면에선 뺀다. */
    if (primary && isLatest && fbPending) {
        const oldest = fbPending.oldest
            ? `가장 오래된 건 ${esc(mmdd(fbPending.oldest))}` +
              (fbPending.oldestDays ? ` (${fmt(fbPending.oldestDays)}일 전)` : ' (오늘)')
            : '';
        parts.push(mod(12, '확인 안 한 피드백',
            `gensei-pc98 게임 페이지에서 온 제보 중 시트의 「확인」칸이 안 찍힌 것 ·
             내용은 공개 페이지에 싣지 않으니 시트에서 보세요`,
            `<div class="settled-row">
                <div><div class="label">미확인</div>
                     <div class="value">${fmt(fbPending.count)}건</div></div>
                <div><div class="label">분류</div>
                     <div class="value">${tally(fbPending.byCategory) || '—'}</div></div>
                <div><div class="label">게임</div>
                     <div class="value">${tally(fbPending.byGame) || '—'}</div></div>
             </div>
             <p class="note-line">${oldest}${oldest && fb.sheetUrl ? ' · ' : ''}` +
            (fb.sheetUrl ? `<a href="${esc(fb.sheetUrl)}" target="_blank" ` +
                `rel="noopener noreferrer">시트에서 확인하기</a>` : '') + '</p>'));
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
            : `<span class="dim" title="${esc(dayLabel)} 이전 구간에는 조회가 없던 페이지">처음</span>`;
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
    parts.push(mod(7, `${dayLabel} 본 페이지`,
        `조회수 순${data.ydaySites.length ? ' · atah.io 안은 코너 이름으로 묶어 표시' : ''} ·
         「평소/일」은 ${dayLabel} 이전 ${data.daily.length - 1}일의 하루 평균`,
        `${siteBar}
         <div class="scroll"><table class="rank pages"><thead><tr>
            <th>페이지</th><th class="num">${esc(dayLabel)} 조회</th>
            <th class="num">평소/일</th><th class="num">사람</th>
         </tr></thead><tbody>${pageRows ||
            `<tr><td colspan="4" class="dim">${esc(dayLabel)} 조회된 페이지가 없습니다.</td></tr>`}
         </tbody></table></div>`));

    // 5) 어제 온 곳
    const srcRows = data.ydaySources.map((s) =>
        `<tr><td class="name">${esc(s.name)}</td>` +
        `<td class="num">${fmt(s.sessions)}</td></tr>`).join('');

    /* 미분류를 목록에 섞지 않는 이유는 수집 스크립트 주석 참조 — 어제치는
       GA4가 아직 재처리 중이라 대개 이게 1위로 올라온다.

       문구는 data.confirmed 로 갈린다 — 파이썬 build_insights()의 6번 규칙과
       같은 이유다. 아직 갱신 전(fresh)이면 "내일 자동으로 다시 확인됩니다"가
       참말이다(수집 스크립트가 실제로 내일 이 날짜를 한 번 더 조회해 덮어쓴다).
       이미 갱신을 거쳤는데도(confirmed) 남아 있으면 재처리 지연이 아니라
       "끝내 못 알아낸" 값이라 다른 말을 한다 — 더는 재확인 예정이 없는데
       "다시 확인됩니다"라고 하면 또 지키지 못할 약속이 된다. */
    const unresolved = data.ydayUnresolved
        ? `<p class="note-line">${data.confirmed
            ? `출처를 끝내 알 수 없었던 세션 <b>${fmt(data.ydayUnresolved)}</b>건입니다 — ` +
              `GA4가 재처리를 마친 뒤에도 남은 값이라, 흔치 않지만 영영 분류되지 않는 ` +
              `경우입니다.`
            : `아직 분류 중 <b>${fmt(data.ydayUnresolved)}</b>건 — GA4가 세션 속성을 ` +
              `확정하는 데 하루 이상 걸립니다. 이 값은 내일 자동으로 다시 확인됩니다.`
          }</p>`
        : '';

    parts.push(mod(5, `${dayLabel} 온 곳`,
        `유입원별 세션 · 한 세션에 출처가 여럿 붙는 경우가 있어
         합계가 ${dayLabel} 세션 수와 다를 수 있습니다`,
        `<div class="scroll"><table class="rank"><thead><tr>
            <th>출처</th><th class="num">세션</th></tr></thead><tbody>${srcRows ||
            '<tr><td colspan="2" class="dim">분류된 유입원이 없습니다.</td></tr>'}
         </tbody></table></div>
         ${unresolved}`));

    // 6) 어제 시간대 — 24칸이라 전체폭이 가장 잘 맞는다
    /* 크기를 색이 아니라 **길이**로 말한다. 이 데이터는 하루 0~4세션에 값 종류가
       서너 개뿐이라 6단계 색 램프를 씌워도 실제로는 서너 색만 쓰였고, 24칸 중
       절반이 0이라 "빈 칸"과 "아주 작은 값"이 같은 색으로 뭉갰다.

       높이는 그날의 최댓값을 100%로 잡은 상대값이다 — 절대 기준(예: 5세션=꽉 참)을
       박아 두면 한산한 날엔 막대가 전부 바닥에 깔려 분포가 안 보이고, 붐비는 날엔
       천장에 붙어 버린다. 대신 축 눈금을 그리지 않으므로 **최댓값 하나에만 숫자를
       적어** 그날의 자가 얼마인지 알려 준다. */
    const hours = data.ydayHours || [];
    const hourMax = Math.max(...hours, 0);
    const peakAt = hourMax > 0 ? hours.indexOf(hourMax) : -1;
    const cols = hours.map((v, hh) => {
        const h = hourMax > 0 ? (v / hourMax * 100).toFixed(1) : 0;
        return `<div class="hour-col" title="${hh}시 · ${fmt(v)}세션">` +
            (hh === peakAt ? `<b class="peak">${fmt(v)}</b>` : '') +
            (v > 0 ? `<span class="bar" style="height:${h}%"></span>` : '') +
            '</div>';
    }).join('');
    const hourTicks = hours.map((_, hh) =>
        `<div class="collabel">${hh % 6 === 0 ? `${hh}시` : ''}</div>`).join('');

    parts.push(mod(12, `${dayLabel} 시간대`,
        '시각별 세션 · 속성 시간대 기준 · 높이는 그날 최댓값 기준',
        `<div class="hour-chart">${cols}</div>
         <div class="hour-ticks">${hourTicks}</div>`));

    // 7) 확정 구간 — 어제 칸에 못 올리는 두 값. 날짜 무관(늘 "지금 기준")이라
    // 수집 스크립트가 히스토리 스냅샷엔 애초에 안 담는다 — 그래서 과거 날짜를
    // 보고 있을 땐 data.settled 가 없어 이 if 가 저절로 꺼진다(현재 화면에만
    // 참여율·체류시간이 뜨는 게 옳다 — 3주 전 날짜 옆에 "지금" 참여율을
    // 나란히 두면 시점이 섞인다).
    const st = data.settled;
    if (st) {
        /* 최장 방문은 날짜마다 하나씩 얼려 둔 값(history 항목의 longest) 중에서
           고른다 — 여기서 새로 계산할 수는 없다(화면엔 원본 세션이 없다).
           수집기가 판정을 못 내린 날은 longest 가 없어 후보에서 자연히 빠지므로,
           확정 구간 7일이 통째로 비어 값이 아예 안 나오는 날도 있다. */
        const long_ = longestInSettled(data);
        const longRow = long_ ? `
            <p class="note-line">가장 오래 머문 방문 <b>${dur(long_.longest.seconds)}</b>
             · ${esc(mmdd(long_.date))} · ${esc(long_.longest.source)}에서
             ${esc(long_.longest.device)}로 ${esc(long_.longest.landing)}
             ${fmt(long_.longest.pageViews)}번 열어봄
             (실제 참여 ${dur(long_.longest.engagementSeconds)})</p>` : '';

        parts.push(mod(12, '참여율 · 체류시간',
            `어제를 뺀 마지막 ${data.meta.settledDays || 7}일 기준
             (세션 ${fmt(st.sessions)}건). GA4가 참여 여부를 하루 이상 뒤에
             확정하므로 어제 칸에는 올리지 않습니다.`,
            `<div class="settled-row">
                <div><div class="label">참여율</div>
                     <div class="value">${pct(st.engagementRate * 100, 1)}</div></div>
                <div><div class="label">평균 체류시간</div>
                     <div class="value">${dur(st.avgDuration)}</div></div>
             </div>${longRow}`));
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

        /* 보고 있는 날짜의 점만 크게 — 선 위에서 "지금 말하는 날"이 어디인지
           바로 짚이게. 예전엔 늘 마지막 점(최신)이었지만, 히스토리를 눌러
           과거 날짜를 보고 있을 땐 그 날짜의 위치를 daily 에서 직접 찾아야
           한다(daily 는 대상 전체가 공유하는 28일 창이라 날짜별로 안 바뀐다).
           못 찾으면(28일보다 오래된 예외적 경우) 마지막 점으로 물러난다. */
        const y = data.yesterday;
        const found = data.daily.findIndex((d) => d.date === (y && y.date));
        const at_ = found === -1 ? data.daily.length - 1 : found;
        lineChart(at('c-trend'), data.daily.map((d) => mmdd(d.date)), [
            { label: '방문자', data: data.daily.map((d) => d.users), fill: true,
              color: C.accent,
              pointRadius: data.daily.map((_, i) => (i === at_ ? G.pointR : 0)) },
        ], [normalBand(data.baseline && data.baseline.users)]);
    }

    // --- 탭 & 날짜 히스토리 ---------------------------------------------
    /* 대상마다 history 의 날짜를 오름차순(오래된→최신)으로 미리 뽑아 둔다 —
       화살표를 누를 때마다 다시 계산하지 않고 이 배열의 인덱스만 옮긴다.
       최신 날짜도 수집 스크립트가 history 에 함께 넣어 두므로(균일하게 다루려는
       설계), 이 배열의 마지막 항목이 항상 최신과 같다. */
    views.forEach((v) => {
        v.dates = Object.keys(v.data.history || {}).sort();
    });

    /* 대상의 최상위 데이터(=최신)와 history 항목(=과거)을 같은 모양으로
       맞춰 준다. history 항목엔 daily(28일 트렌드)·meta 가 없다 — 대상
       전체가 공유하는 값이라 날짜마다 중복 저장하지 않기로 했으므로,
       여기서 최상위 것을 빌려와 buildHTML()이 구분 없이 쓸 수 있게 한다. */
    function snapshotFor(viewData, wantDate) {
        const latestDate = viewData.yesterday && viewData.yesterday.date;
        if (!latestDate) return null;
        const date = wantDate || latestDate;
        if (date === latestDate) return { snap: viewData, isLatest: true, date };
        const h = viewData.history && viewData.history[date];
        if (!h) return null;
        return {
            snap: Object.assign({}, h, { daily: viewData.daily, meta: viewData.meta }),
            isLatest: false, date,
        };
    }

    function renderPanel(v, wantDate) {
        const picked = snapshotFor(v.data, wantDate) || snapshotFor(v.data, null);
        if (!picked) return;
        const panel = panelRoot.querySelector(`.panel[data-key="${v.key}"]`);
        panel.innerHTML = buildHTML(
            picked.snap, v.key, v.key === views[0].key, picked.isLatest, v.data.yesterday.date);
        panel.dataset.date = picked.date;

        // 화살표 경계 — 더 이전 기록이 없으면 ◀ 비활성, 이미 최신이면 ▶는
        // buildHTML 이 이미 disabled 로 그렸다(isLatest 를 알고 있으므로).
        const idx = v.dates.indexOf(picked.date);
        const prevBtn = panel.querySelector('[data-nav="prev"]');
        if (prevBtn) prevBtn.disabled = idx <= 0;

        makeCharts(picked.snap, v.key);   // 보이는 상태에서 그려야 하므로 항상 여기서
    }

    function showTab(key, date) {
        const v = views.find((x) => x.key === key);
        if (!v) return;
        nav.querySelectorAll('a').forEach((a) =>
            a.classList.toggle('active', a.dataset.key === key));
        panelRoot.querySelectorAll('.panel').forEach((p) => {
            p.hidden = p.dataset.key !== key;
        });
        renderPanel(v, date);
    }

    nav.innerHTML = views.map((v, i) =>
        `<a href="#${esc(v.key)}" data-key="${esc(v.key)}"${i === 0 ? ' class="active"' : ''}>` +
        `${esc(v.data.meta.label || v.key)}</a>`).join('');

    // 패널 껍데기만 미리 만든다 — 내용은 실제로 보일 때 renderPanel() 이 채운다
    // (숨은 채로 차트를 만들면 크기가 0으로 잡히는 문제 때문에, 항상 "보이게
    // 만든 다음 그린다"는 순서를 지켜야 한다).
    panelRoot.innerHTML = views.map((v, i) =>
        `<section class="panel" data-key="${esc(v.key)}"${i === 0 ? '' : ' hidden'}></section>`).join('');

    nav.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-key]');
        if (!a) return;
        e.preventDefault();
        history.replaceState(null, '', `#${a.dataset.key}`);
        showTab(a.dataset.key, null);   // 탭을 바꾸면 그 탭의 최신 날짜로
    });

    /* 날짜 화살표 — 패널 내용이 매번 다시 그려지므로 이벤트를 패널 각각이
       아니라 panelRoot 에 위임한다(재렌더링해도 리스너를 다시 붙일 필요가
       없다). URL은 최신이면 `#ga4`, 과거면 `#ga4/2026-08-15`. */
    panelRoot.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-nav]');
        if (!btn || btn.disabled) return;
        const panel = btn.closest('.panel');
        const v = views.find((x) => x.key === panel.dataset.key);
        if (!v) return;
        const idx = v.dates.indexOf(panel.dataset.date);
        if (idx === -1) return;
        const nextIdx = idx + (btn.dataset.nav === 'prev' ? -1 : 1);
        if (nextIdx < 0 || nextIdx >= v.dates.length) return;
        const targetDate = v.dates[nextIdx];
        const isLatestTarget = nextIdx === v.dates.length - 1;
        history.replaceState(null, '', `#${v.key}${isLatestTarget ? '' : '/' + targetDate}`);
        renderPanel(v, isLatestTarget ? null : targetDate);
    });

    const [hashTab, hashDate] = window.location.hash.slice(1).split('/');
    const startKey = views.some((v) => v.key === hashTab) ? hashTab : views[0].key;
    showTab(startKey, hashDate || null);
})();
