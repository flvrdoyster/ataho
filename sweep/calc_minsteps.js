/**
 * calc_minsteps.js — 스테이지별 정확한 최단 걸음 수 계산 (저작 도구, Node 실행)
 *
 *   node calc_minsteps.js
 *
 * 스폰에서 시작해 모든 걸을 수 있는 칸을 밟는 최소 걸음 수를 완전 탐색으로 구해
 * stages.js에 적을 minSteps 값을 출력한다. 방 배치(장애물·스폰)를 고치면 다시 돌려서
 * stages.js의 minSteps를 갱신할 것.
 *
 * 이 문제(커버링 워크)는 일반적으로는 공식이 없다 — 한 번씩만 밟는 경로(해밀턴 경로)의
 * 존재 자체가 NP-완전이라 반복 심화 탐색으로 푼다: 걸음 수 한도를 (칸수-1)+α,
 * α=0,1,2,...로 늘려가며 DFS. 여유(=허용 되밟기 수) α가 작을수록 탐색이 강하게
 * 조여져서 현재 방 크기(칸 50~55개)에서는 수십 ms면 확정된다.
 */
const fs = require('fs');
const path = require('path');

const window = {};
eval(fs.readFileSync(path.join(__dirname, '../world/maps/souko/data.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, 'stages.js'), 'utf8'));

const collisions = new Set(window.MAP_DATA.collisions.map(c => c[0] + ',' + c[1]));
// index.html의 GRID_CELL_TILES / GRID_ORIGIN, stage_editor.html의 GW/GH와 동일해야 한다
const CELL = 3, ORG = { x: 2, y: 2 }, COLS = 11, ROWS = 6;
const NODE_LIMIT = 500_000_000;   // 탐색 안전장치 (방이 훨씬 커지면 상향)

function cellWalkable(cx, cy, obstacleCells) {
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return false;
    if (obstacleCells.has(cx + ',' + cy)) return false;
    const gx = ORG.x + cx * CELL, gy = ORG.y + cy * CELL;
    for (let dy = 0; dy < CELL; dy++)
        for (let dx = 0; dx < CELL; dx++)
            if (collisions.has((gx + dx) + ',' + (gy + dy))) return false;
    return true;
}

function solveStage(st) {
    const obstacleCells = new Set((st.obstacles || []).map(o => o.cx + ',' + o.cy));
    const idOf = new Map(); const cells = [];
    for (let cy = 0; cy < ROWS; cy++)
        for (let cx = 0; cx < COLS; cx++)
            if (cellWalkable(cx, cy, obstacleCells)) {
                idOf.set(cx + ',' + cy, cells.length);
                cells.push([cx, cy]);
            }
    const n = cells.length;
    const adj = cells.map(([cx, cy]) =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .map(([dx, dy]) => idOf.get((cx + dx) + ',' + (cy + dy)))
            .filter(v => v !== undefined));
    const isBlack = cells.map(([cx, cy]) => (cx + cy) % 2 === 0);
    const start = idOf.get(st.spawn.cx + ',' + st.spawn.cy);
    if (start === undefined) return { error: '스폰 칸이 walkable하지 않음' };

    // 연결성 체크 — 장애물 배치 실수로 스폰에서 못 가는 칸이 있으면(고립된 구역) 아래
    // 반복 심화가 답을 못 찾고 α만 계속 키우다 NODE_LIMIT까지 가서야 실패하므로, 미리
    // 잡아서 바로 알려준다.
    {
        const seen = new Uint8Array(n);
        const stack = [start]; seen[start] = 1; let count = 1;
        while (stack.length) {
            const c = stack.pop();
            for (const nb of adj[c]) if (!seen[nb]) { seen[nb] = 1; count++; stack.push(nb); }
        }
        if (count < n) return { error: `스폰에서 못 가는 칸 ${n - count}개 있음(고립 구역) — 장애물 배치 확인 필요` };
    }

    const visited = new Uint8Array(n);
    let nodes = 0;

    // 색 균형 하한: 격자는 체스판 이분 그래프라 걸음마다 색이 바뀐다 — 남은 k걸음 동안
    // 현재 색과 다른 색 칸은 ceil(k/2)개, 같은 색 칸은 floor(k/2)개까지만 새로 밟을 수 있다.
    function colorBoundOK(cur, k) {
        let b = 0, w = 0;
        for (let i = 0; i < n; i++) if (!visited[i]) (isBlack[i] ? b++ : w++);
        const same = isBlack[cur] ? b : w;
        const diff = isBlack[cur] ? w : b;
        return same <= Math.floor(k / 2) && diff <= Math.ceil(k / 2);
    }

    // 남은(미방문) 부분그래프가 여전히 하나로 연결돼 있고, 막다른 칸(미방문 이웃 차수
    // ≤1)이 현재 위치 옆이 아니고서야 2개 이상 생기지 않는지 확인 — 두 개 이상이면
    // 한 번의 행차로는 둘 다 끝점으로 못 삼으니 이 시점에서 이미 실패가 확정된다.
    function feasible(cur, remaining) {
        if (remaining === 0) return true;
        const seen = new Uint8Array(n);
        const stack = []; let found = 0;
        for (const nb of adj[cur]) if (!visited[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
        if (stack.length === 0) return false;
        while (stack.length) {
            const c = stack.pop(); found++;
            for (const nb of adj[c]) if (!visited[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
        }
        if (found !== remaining) return false;
        let deadEnds = 0;
        for (let i = 0; i < n; i++) {
            if (visited[i]) continue;
            let deg = 0, nextToCur = false;
            for (const nb of adj[i]) {
                if (!visited[nb]) deg++;
                if (nb === cur) nextToCur = true;
            }
            if (deg === 0 && !nextToCur) return false;
            if (deg <= 1 && !nextToCur && ++deadEnds > 1) return false;
        }
        return true;
    }

    function dfs(cur, budget, remaining) {
        if (remaining === 0) return true;
        if (budget < remaining) return false;          // 걸음마다 새 칸은 최대 1개
        if (++nodes > NODE_LIMIT) throw new Error('limit');
        if (!colorBoundOK(cur, budget)) return false;
        if (!feasible(cur, remaining)) return false;
        // 새 칸(미방문) 이웃 먼저, 그중에서도 차수 낮은 순 (Warnsdorff 휴리스틱)
        const nbs = adj[cur].slice().sort((a, b) => {
            if (visited[a] !== visited[b]) return visited[a] - visited[b];
            return adj[a].filter(x => !visited[x]).length - adj[b].filter(x => !visited[x]).length;
        });
        for (const nb of nbs) {
            const isNew = !visited[nb];
            if (!isNew && budget === remaining) continue;   // 여유 없으면 되밟기 금지
            if (isNew) visited[nb] = 1;
            if (dfs(nb, budget - 1, remaining - (isNew ? 1 : 0))) return true;
            if (isNew) visited[nb] = 0;
        }
        return false;
    }

    for (let alpha = 0; ; alpha++) {
        visited.fill(0);
        visited[start] = 1;
        nodes = 0;
        try {
            if (dfs(start, (n - 1) + alpha, n - 1)) {
                return { n, minSteps: (n - 1) + alpha, alpha, hamiltonian: alpha === 0 };
            }
        } catch (e) {
            return { n, error: `α=${alpha}에서 탐색 한도 초과` };
        }
    }
}

window.SWEEP_STAGES.forEach((st, i) => {
    const label = st.id ? `${st.id} (방 ${i + 1})` : `방 ${i + 1}`;
    const t0 = Date.now();
    const r = solveStage(st);
    if (r.error) {
        console.log(`${label}: 오류 — ${r.error}`);
        return;
    }
    const stepsStale = st.minSteps !== r.minSteps ? `  ← stages.js의 minSteps(${st.minSteps ?? '없음'}) 갱신 필요!` : '';
    const hamStale = st.hamiltonian !== r.hamiltonian ? `  ← stages.js의 hamiltonian(${st.hamiltonian ?? '없음'}) 갱신 필요!` : '';
    console.log(`${label}: 칸수 ${r.n}, minSteps: ${r.minSteps} (되밟기 ${r.alpha}회, 해밀턴 경로: ${r.hamiltonian}, ${Date.now() - t0}ms)${stepsStale}${hamStale}`);
});
