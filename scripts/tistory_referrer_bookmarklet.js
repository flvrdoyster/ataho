(async () => {
    const HOST = 'oysterbay.tistory.com';
    const FULL = '24:00';
    const WINDOW_DAYS = 2;
    const KEEP_DAYS = 28;
    if (location.host !== HOST) {
        alert(HOST + ' 페이지에서 눌러 주세요.');
        return;
    }
    const idb = (mode, fn) => new Promise((ok, ng) => {
        const req = indexedDB.open('atah-referrer', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onerror = () => ng(req.error);
        req.onsuccess = () => {
            const tx = req.result.transaction('kv', mode);
            const q = fn(tx.objectStore('kv'));
            tx.oncomplete = () => ok(q.result);
            tx.onerror = () => ng(tx.error);
        };
    });
    const shift = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    const cleanUrl = (s) => {
        if (!s) return '';
        try {
            const u = new URL(s);
            return decodeURIComponent(u.origin + u.pathname);
        } catch (e) {
            return s.split(/[?\u0023]/)[0];
        }
    };
    const readJson = async (dir, name, fallback) => {
        try {
            const f = await (await dir.getFileHandle(name)).getFile();
            return JSON.parse(await f.text());
        } catch (e) {
            if (e.name === 'NotFoundError') return fallback;
            throw e;
        }
    };
    const writeText = async (dir, name, text) => {
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await w.write(text);
        await w.close();
    };

    let root = await idb('readonly', (s) => s.get('root'));
    if (root && await root.requestPermission({ mode: 'readwrite' }) !== 'granted') root = null;
    if (!root) {
        root = await showDirectoryPicker({ id: 'ataho', mode: 'readwrite' });
        await idb('readwrite', (s) => s.put(root, 'root'));
    }
    let archDir, dataDir;
    try {
        const dash = await root.getDirectoryHandle('dashboard');
        archDir = await dash.getDirectoryHandle('archive');
        dataDir = await dash.getDirectoryHandle('data');
    } catch (e) {
        await idb('readwrite', (s) => s.delete('root'));
        alert('ataho 저장소 폴더를 골라 주세요. 다시 누르면 폴더를 새로 고릅니다.');
        return;
    }

    let log;
    try {
        const body = await (await fetch('/manage/statistics/referrer/latest/log.json', { credentials: 'include' })).json();
        if (body.status !== 'ok') throw new Error(body.status);
        log = body.data.result;
    } catch (e) {
        alert('유입 경로를 받지 못했습니다. 티스토리 로그인 상태를 확인해 주세요. (' + e.message + ')');
        return;
    }

    const archive = await readJson(archDir, 'tistory.json', {});
    const now = new Date(Date.now() + 9 * 3600000).toISOString();
    const fday = now.slice(0, 10);
    const ftime = now.slice(11, 16);
    const entry = (d) => archive[d] || (archive[d] = { until: '00:00', rows: [] });
    for (let d = shift(fday, -WINDOW_DAYS); d <= fday; d = shift(d, 1)) {
        const e = entry(d);
        const until = d < fday ? FULL : ftime;
        if (until > e.until) e.until = until;
    }

    let added = 0;
    log.forEach((r) => {
        const ts = r.timestamp;
        const rows = entry(ts.slice(0, 10)).rows;
        const row = [ts.slice(11).split(/[+Z]/)[0], r.definedDomain || '', r.refUrlDomain || '',
            cleanUrl(r.refUrl), r.keyword || null, Number(r.pv) || 1];
        if (rows.some((x) => x[0] === row[0] && x[3] === row[3])) return;
        rows.push(row);
        added += 1;
    });

    const dates = Object.keys(archive).sort();
    dates.forEach((d) => archive[d].rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
    await writeText(archDir, 'tistory.json',
        '{\n' + dates.map((d) => JSON.stringify(d) + ':' + JSON.stringify(archive[d])).join(',\n') + '\n}\n');

    const byCount = (m) => [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const summarize = (e) => {
        const domains = new Map();
        const keywords = new Map();
        const cats = {};
        let inner = 0;
        e.rows.forEach(([, cat, dom, , kw, pv]) => {
            if (dom === HOST) {
                inner += pv;
                return;
            }
            const name = dom || '(알 수 없음)';
            domains.set(name, (domains.get(name) || 0) + pv);
            cats[name] = cat;
            if (kw) {
                keywords.set(kw + '\t' + cat, (keywords.get(kw + '\t' + cat) || 0) + pv);
            }
        });
        return {
            until: e.until,
            views: [...domains.values()].reduce((a, b) => a + b, 0),
            inner,
            domains: byCount(domains).map(([d, n]) => [d, cats[d], n]),
            keywords: byCount(keywords).map(([k, n]) => [...k.split('\t'), n]),
        };
    };
    const last = dates[dates.length - 1];
    const days = {};
    dates.slice(-KEEP_DAYS - 1).forEach((d) => {
        days[d] = summarize(archive[d]);
    });
    const data = {
        firstDay: dates[0],
        lastFetch: archive[last].until === FULL ? last : last + ' ' + archive[last].until,
        days,
    };
    await writeText(dataDir, 'tistory.js', 'window.DASHBOARD_TISTORY = ' + JSON.stringify(data, null, 1) + ';\n');

    const gaps = [];
    for (let d = dates[0]; d < last; d = shift(d, 1)) {
        if (!archive[d] || archive[d].until !== FULL) gaps.push(d);
    }
    alert('티스토리 유입 경로를 저장했습니다. 새 기록 ' + added + '건 · 보관 ' + dates.length + '일' +
        (gaps.length ? '\n빠진 날짜: ' + gaps.join(', ') : ''));
})().catch((e) => {
    if (e.name !== 'AbortError') alert('저장하지 못했습니다. (' + e.message + ')');
});
