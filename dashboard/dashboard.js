(function () {
    'use strict';

    const registry = window.DASHBOARD_DATA || {};
    const nav = document.getElementById('dash-nav');
    const panelRoot = document.getElementById('dash-panels');
    const views = Object.keys(registry).map((key) => ({ key, data: registry[key] }));

    const fb = window.DASHBOARD_FEEDBACK || {};
    const fbPending = (fb.available && fb.pending && fb.pending.count > 0)
        ? fb.pending : null;
    const FB_REASON = {
        SERVICE_DISABLED: 'Sheets API가 꺼져 있습니다',
        PERMISSION_DENIED: '시트가 서비스 계정에 공유되지 않았습니다',
    };
    const fbFailed = !fb.available && fb.error && fb.error !== 'no-sheet-id'
        ? (FB_REASON[fb.reason] || (fb.status ? `HTTP ${fb.status}` : fb.error))
        : null;

    const css = getComputedStyle(document.documentElement);
    const T = (name, fallback) => css.getPropertyValue(name).trim() || fallback || '';
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
    const G = {
        fontSize: N('--chart-font-size', 12),
        lineW: N('--line-w', 2),
        tension: N('--line-tension', 0.25),
        fillAlpha: N('--line-fill-alpha', 0.1),
        pointR: N('--point-r', 4),
    };

    function fillColor(color) {
        if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
        const a = Math.round(Math.min(1, Math.max(0, G.fillAlpha)) * 255);
        return color + a.toString(16).padStart(2, '0');
    }

    const nf = new Intl.NumberFormat('ko-KR');
    const fmt = (n) => nf.format(Math.round(n));
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

    const tally = (items) => items.map((i) => `${esc(i.name)} ${fmt(i.count)}`).join(' · ');
    const fbAsOf = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(fb.updatedAt || '')
        ? `${mmdd(fb.updatedAt.slice(0, 10))} ${fb.updatedAt.slice(11)} 기준` : '';

    if (fbPending) {
        const age = fbPending.oldestDays === null || fbPending.oldestDays === undefined ? ''
            : fbPending.oldestDays === 0 ? '가장 오래된 건 오늘'
            : `가장 오래된 건 ${fmt(fbPending.oldestDays)}일 전`;
        const detail = [tally(fbPending.byCategory), age, fbAsOf].filter(Boolean).join(' · ');
        nav.insertAdjacentHTML('beforebegin',
            `<p class="reminder"><b>확인 안 한 피드백 ${fmt(fbPending.count)}건</b>` +
            `<span class="dim">${detail}</span>` +
            (fb.sheetUrl ? ` <a href="${esc(fb.sheetUrl)}" target="_blank" ` +
                `rel="noopener noreferrer">시트 열기</a>` : '') + '</p>');
    }

    const kstToday = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const updatedDays = views
        .map((v) => (v.data.meta && v.data.meta.updatedAt || '').slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .map((d) => Math.round((Date.parse(`${kstToday}T00:00:00Z`) -
            Date.parse(`${d}T00:00:00Z`)) / 86400000));
    const staleDays = updatedDays.length ? Math.max(...updatedDays) : 0;
    if (staleDays >= 2) {
        nav.insertAdjacentHTML('beforebegin',
            `<p class="reminder"><b>데이터가 ${fmt(staleDays)}일째 갱신되지 않았습니다</b>` +
            '<span class="dim">GitHub Actions의 ga4-dashboard 실행 기록을 확인하세요</span></p>');
    }

    if (!views.length) {
        panelRoot.innerHTML = '<p class="empty">아직 수집된 데이터가 없습니다.' +
            '<br>GitHub Actions의 <b>ga4-dashboard</b> 워크플로우가 한 번 돌면 채워집니다.</p>';
        return;
    }

    const hasChart = typeof window.Chart === 'function';
    if (hasChart) {
        Chart.defaults.font.family = FONT;
        Chart.defaults.font.size = G.fontSize;
        Chart.defaults.color = C.muted;
        Chart.defaults.maintainAspectRatio = false;
    }

    const gridStyle = { color: C.grid, drawTicks: false, borderDash: [] };
    const axisStyle = { color: C.axis };

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
                    const line = d.color || C.series[i];
                    return {
                    label: d.label,
                    data: d.data,
                    borderColor: line,
                    backgroundColor: fillColor(C.series[i]),
                    borderWidth: G.lineW,
                    tension: G.tension,
                    cubicInterpolationMode: G.tension > 0 ? 'monotone' : 'default',
                    fill: !!d.fill,
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

    function normalBand(box) {
        return {
            id: 'normalBand',
            beforeDatasetsDraw(chart) {
                if (!box) return;
                const { ctx, chartArea: area, scales } = chart;
                const y = scales.y;
                const top = y.getPixelForValue(box.hi);
                const bottom = y.getPixelForValue(box.lo);
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

    function buildHTML(data, key, primary, isLatest, latestDate) {
    const parts = [];
    const y = data.yesterday;

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

    const dayLabel = isLatest ? '어제' : mmdd(y.date);
    const daysAgo = Math.round(
        (Date.parse(`${latestDate}T00:00:00Z`) - Date.parse(`${y.date}T00:00:00Z`))
        / 86400000) + 1;
    const heroWord = isLatest ? '어제' : `${daysAgo}일 전`;

    const base = data.baseline || {};
    const WHERE = { high: '많은 편', low: '적은 편', usual: '평소 범위' };

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

    const pu = base.perUser;
    const newSub = y.newUsers <= y.users ? `새로 온 사람 ${fmt(y.newUsers)}명` : '';
    parts.push(mod(5, '', '', `
        <div class="yday-title">
            <button type="button" class="date-nav" data-nav="prev" aria-label="이전 날짜">◀</button>
            ${esc(heroWord)} <span class="tag">${esc(mmdd(y.date))}</span>
            <button type="button" class="date-nav" data-nav="next" aria-label="다음 날짜"${isLatest ? ' disabled' : ''}>▶</button>
        </div>
        <p class="meta-line">마지막 갱신 ${esc(data.meta.updatedAt)} KST ·
            매일 아침 어제 하루치를 모읍니다.${data.confirmed ? '' :
                ' 어제 수치는 잠정이라 내일 아침 수집 때 바로잡힙니다.'}</p>
        <div class="stat-grid">
            ${stat('방문자', base.users, '명', fmt, newSub)}
            ${stat('페이지 조회', base.views, '회', fmt)}
            ${stat('세션', base.sessions, '', fmt)}
            ${stat('한 사람당', pu, '장', dec1)}
        </div>`, 'accent stretch'));

    parts.push(mod(7, '평소와 견주면',
        `최근 ${data.daily.length}일 일별 방문자 ·
         띠는 열흘 중 여드레가 들어오는 구간, 점선은 중앙값`,
        `<div class="chart-box"><canvas id="c-trend-${key}"></canvas></div>
         ${tableView('표로 보기', ['날짜', '방문자', '세션', '조회'],
             data.daily.slice().reverse().map((d) => [
                 d.date, fmt(d.users), fmt(d.sessions), fmt(d.views)]))}`, 'stretch'));

    if (data.insights && data.insights.length) {
        const emph = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
        const weekly = (i) => i.span === 'week' || !!i.key;
        const groups = [
            [dayLabel, data.insights.filter((i) => !weekly(i))],
            [isLatest ? '최근 7일' : `${mmdd(y.date)}까지 7일`, data.insights.filter(weekly)],
        ].filter(([, items]) => items.length);
        parts.push(mod(12, '', '', groups.map(([title, items]) =>
            `<div class="insight-group"><h3>${esc(title)}</h3><ul class="insights">${items
                .map((i) => `<li>${emph(i.text)}</li>`).join('')}</ul></div>`).join('')));
    }

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
             <p class="note-line">${[oldest, fbAsOf, fb.sheetUrl
                ? `<a href="${esc(fb.sheetUrl)}" target="_blank" rel="noopener noreferrer">시트에서 확인하기</a>`
                : ''].filter(Boolean).join(' · ')}</p>`));
    } else if (primary && isLatest && fbFailed) {
        parts.push(mod(12, '확인 안 한 피드백', '',
            `<p class="note-line">시트를 읽지 못해 미확인 건수를 셀 수 없습니다 — ` +
            `${esc(fbFailed)}.${fbAsOf ? ` (${fbAsOf})` : ''}</p>`));
    }

    const barW = (v, max) => `--w:${max > 0 ? (v / max * 100).toFixed(1) : 0}%`;
    const pageMax = Math.max(0, ...data.ydayPages.map((p) => p.views));
    const pageRows = data.ydayPages.map((p) => {
        const label = p.section || p.title || p.name;
        const sub = label !== p.name ? p.name : '';
        const usual = p.priorAvg > 0
            ? (p.priorAvg < 1 ? '&lt;1' : dec1(p.priorAvg)) + (p.spike
                ? `<span class="ratio">${dec1(p.ratio)}배</span>` : '')
            : `<span class="dim" title="${esc(dayLabel)} 이전 구간에는 조회가 없던 페이지">처음</span>`;
        return `<tr><td class="page bar" style="${barW(p.views, pageMax)}">` +
            `<span class="name">${esc(label)}</span>` +
            (p.list ? '<span class="host">목록</span>' : '') +
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

    const srcMax = Math.max(0, ...data.ydaySources.map((s) => s.sessions));
    const srcRows = data.ydaySources.map((s) =>
        `<tr><td class="name bar" style="${barW(s.sessions, srcMax)}">${esc(s.name)}</td>` +
        `<td class="num">${fmt(s.sessions)}</td></tr>`).join('');

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

    const hours = data.ydayHours || [];
    const pattern = data.hourPattern || [];
    const hourMax = Math.max(...hours, ...pattern, 0);
    const ydayMax = Math.max(...hours, 0);
    const peakAt = ydayMax > 0 ? hours.indexOf(ydayMax) : -1;
    const hgt = (v) => (hourMax > 0 ? (v / hourMax * 100).toFixed(1) : 0);
    const cols = hours.map((v, hh) => {
        const usual = pattern[hh] || 0;
        return `<div class="hour-col" title="${hh}시 · ${esc(dayLabel)} ${fmt(v)}세션 · ` +
            `평소 ${dec1(usual)}">` +
            (usual > 0 ? `<span class="bar usual" style="height:${hgt(usual)}%"></span>` : '') +
            (v > 0 ? `<span class="bar yday" style="height:${hgt(v)}%"></span>` : '') +
            (hh === peakAt ? `<b class="peak" style="bottom:${hgt(v)}%">${fmt(v)}</b>` : '') +
            '</div>';
    }).join('');
    const hourTicks = hours.map((_, hh) =>
        `<div class="collabel">${hh % 6 === 0 ? `${hh}시` : ''}</div>`).join('');

    parts.push(mod(12, `${dayLabel} 시간대`,
        `시각별 세션 · 옅은 막대는 최근 ${data.daily.length}일의 시각별 하루 평균, 진한 막대는
         ${esc(dayLabel)} · 여러 시간에 걸친 세션은 시간마다 셉니다`,
        `<div class="hour-chart">${cols}</div>
         <div class="hour-ticks">${hourTicks}</div>`));

    const games = data.games || [];
    if (games.length) {
        const weekLabel = isLatest ? '최근 7일' : `${mmdd(y.date)}까지 7일`;
        const gameMax = Math.max(0, ...games.map((g) => g.start));
        const longest = (l) => (l ? `${fmt(l.minutes)}분 넘게 ${fmt(l.users)}명` : '—');
        const cell = (day, week) => `<td class="num">${day}<span class="week">/ ${week}</span></td>`;
        const gameRows = games.map((g) =>
            `<tr><td class="page bar" style="${barW(g.start, gameMax)}">` +
            `<span class="name">${esc(g.game)}</span></td>` +
            cell(fmt(g.start), fmt(g.week.start)) + cell(fmt(g.save), fmt(g.week.save)) +
            cell(fmt(g.restore), fmt(g.week.restore)) +
            cell(longest(g.longest), longest(g.week.longest)) + '</tr>').join('');
        parts.push(mod(12, `${dayLabel} 게임 플레이`,
            `${esc(dayLabel)} 시작한 사람이 많은 순 · 옅은 숫자는 ${esc(weekLabel)} ·
             사람 수는 기간 안에서 중복 제외`,
            `<div class="scroll"><table class="rank pages"><thead><tr>
                <th>게임</th><th class="num">시작</th><th class="num">세이브</th>
                <th class="num">이어하기</th><th class="num">가장 긴 플레이</th>
             </tr></thead><tbody>${gameRows}</tbody></table></div>`));
    }

    const st = data.settled;
    if (st) {
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

    const months = data.months || [];
    if (isLatest && months.length) {
        const mMax = Math.max(...months.map((m) => m.users), 0);
        const mCols = months.map((m) => {
            const h = mMax > 0 ? (m.users / mMax * 100).toFixed(1) : 0;
            return `<div class="month-col${m.partial ? ' partial' : ''}" ` +
                `title="${esc(m.month)} · 하루 평균 방문자 ${dec1(m.users)}명 · 조회 ${dec1(m.views)}회 · ` +
                `${fmt(m.days)}일${m.partial ? ' (일부)' : ''}">` +
                `<b class="val" style="bottom:${h}%">${dec1(m.users)}</b>` +
                `<span class="bar" style="height:${h}%"></span></div>`;
        }).join('');
        const mTicks = months.map((m) =>
            `<div class="collabel">${esc(m.month.slice(2).replace('-', '.'))}</div>`).join('');
        const wc = data.weekCompare;
        const diff = (a, b) => (b > 0 ? ` (${a >= b ? '+' : ''}${Math.round((a - b) / b * 100)}%)` : '');
        const wcLine = wc ? `<p class="note-line">최근 7일 하루 평균 방문자 <b>${dec1(wc.users)}명</b>` +
            `${diff(wc.users, wc.prevUsers)} · 그 전 7일 ${dec1(wc.prevUsers)}명 · ` +
            `조회 ${dec1(wc.views)}회 / ${dec1(wc.prevViews)}회</p>` : '';
        parts.push(mod(12, '긴 흐름',
            `달마다 하루 평균 방문자 · 흐린 막대는 아직 다 차지 않은 달(측정 시작 달·이번 달)`,
            `${wcLine}<div class="month-chart" style="--n:${months.length}">${mCols}</div>
             <div class="month-ticks" style="--n:${months.length}">${mTicks}</div>`));
    }

    parts.push(`<p class="meta-line span-12">GA4 속성 ${esc(data.meta.propertyId)} · ` +
        `Google Analytics Data API · GitHub Actions가 매일 아침 갱신</p>`);

    return parts.join('');
    }

    function makeCharts(data, key) {
        const at = (id) => document.getElementById(`${id}-${key}`);
        if (!at('c-trend')) return;

        if (!hasChart) {
            const box = at('c-trend').parentElement;
            box.outerHTML = '<p class="note-line">차트를 불러오지 못했습니다 — ' +
                '아래 표에 같은 값이 있습니다.</p>';
            const tv = document.querySelector(`.panel[data-key="${key}"] .table-view`);
            if (tv) tv.open = true;
            return;
        }

        const y = data.yesterday;
        const found = data.daily.findIndex((d) => d.date === (y && y.date));
        const at_ = found === -1 ? data.daily.length - 1 : found;
        lineChart(at('c-trend'), data.daily.map((d) => mmdd(d.date)), [
            { label: '방문자', data: data.daily.map((d) => d.users), fill: true,
              color: C.accent,
              pointRadius: data.daily.map((_, i) => (i === at_ ? G.pointR : 0)) },
        ], [normalBand(data.baseline && data.baseline.users)]);
    }

    views.forEach((v) => {
        v.dates = Object.keys(v.data.history || {}).sort();
    });

    function snapshotFor(viewData, wantDate) {
        const latestDate = viewData.yesterday && viewData.yesterday.date;
        if (!latestDate) return null;
        const date = wantDate || latestDate;
        if (date === latestDate) return { snap: viewData, isLatest: true, date };
        const h = viewData.history && viewData.history[date];
        if (!h) return null;
        return {
            snap: Object.assign({}, h, {
                daily: viewData.daily, meta: viewData.meta, hourPattern: viewData.hourPattern }),
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

        const idx = v.dates.indexOf(picked.date);
        const prevBtn = panel.querySelector('[data-nav="prev"]');
        if (prevBtn) prevBtn.disabled = idx <= 0;

        makeCharts(picked.snap, v.key);
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

    panelRoot.innerHTML = views.map((v, i) =>
        `<section class="panel" data-key="${esc(v.key)}"${i === 0 ? '' : ' hidden'}></section>`).join('');

    nav.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-key]');
        if (!a) return;
        e.preventDefault();
        history.replaceState(null, '', `#${a.dataset.key}`);
        showTab(a.dataset.key, null);
    });

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
