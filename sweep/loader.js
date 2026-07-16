/**
 * loader.js — 술창고 청소 셀 상태 런타임 (먼지 + 스테이지)
 *
 * 바닥을 GRID_CELL_TILES 크기의 슬래브 칸으로 보고, 두 가지 칸 상태를 관리한다:
 *   - 먼지: 아직 안 밟은 칸(이끼 낀 타일로 표시). 밟으면 깨끗해짐.
 *   - 장애물: 스테이지가 지정한 칸(3×3 스탬프 + 충돌). 이동 불가 + 먼지 대상 제외.
 *
 * engine.js의 바닥 그리기 훅 window.getFloorTileOverride 에서
 * "장애물 → 먼지 → 원본 바닥" 순으로 타일을 합성해 그린다.
 * char_sweep.js는 window.onCellSwept / initDust / sweepGetDustRemaining / sweepStage 를 쓴다.
 */

// ===== 먼지 =====

// 깨끗한 바닥 타일 → 먼지 낀 변형 타일 매핑 ("tx,ty" → {tx,ty})
// (같은 돌 실루엣의 +3칸 이동한 이끼 버전 — souko_tile.png 기준)
const DUST_TILE_MAP = {
    '21,2': { tx: 24, ty: 2 },
    '22,2': { tx: 25, ty: 2 },
    '23,2': { tx: 26, ty: 2 },
    '24,1': { tx: 27, ty: 1 },
    '25,1': { tx: 28, ty: 1 },
    '26,1': { tx: 29, ty: 1 },
    '3,2':  { tx: 6,  ty: 2 },
    '4,2':  { tx: 7,  ty: 2 },
    '5,2':  { tx: 8,  ty: 2 }
};

let dustyCells = new Set();   // "gx,gy" — 칸의 좌상단 맵타일 좌표(cell-origin) 기준

function cellSize() {
    return window.GRID_CELL_TILES || 1;
}

function cellKey(cellGx, cellGy) {
    return cellGx + ',' + cellGy;
}

function isCellWalkable(gx, gy, cell) {
    const T = CONFIG.TILE_SIZE;
    return !checkCollision(gx * T + 1, gy * T + 1, cell * T - 2, cell * T - 2);
}

// 걸을 수 있는 칸(장애물 충돌이 이미 반영된 상태)을 전부 먼지로 채운다.
// → 반드시 applyStage() 이후에 호출해 장애물 칸이 제외되도록 한다.
function initDust() {
    dustyCells = new Set();
    const org = window.GRID_ORIGIN || { x: 0, y: 0 };
    const cell = cellSize();
    const cols = Math.ceil(mapWidth / CONFIG.TILE_SIZE);
    const rows = Math.ceil(mapHeight / CONFIG.TILE_SIZE);

    for (let gy = org.y; gy + cell <= rows; gy += cell) {
        for (let gx = org.x; gx + cell <= cols; gx += cell) {
            if (isCellWalkable(gx, gy, cell)) dustyCells.add(cellKey(gx, gy));
        }
    }
}

// 이 맵타일이 먼지 낀 칸에 속하면 대체(이끼) 타일 좌표를 반환
function dustTileAt(gx, gy, tx, ty) {
    const org = window.GRID_ORIGIN || { x: 0, y: 0 };
    const cell = cellSize();
    const cellGx = org.x + Math.floor((gx - org.x) / cell) * cell;
    const cellGy = org.y + Math.floor((gy - org.y) / cell) * cell;
    if (!dustyCells.has(cellKey(cellGx, cellGy))) return null;
    return DUST_TILE_MAP[tx + ',' + ty] || null;
}

// char_sweep.js가 한 칸 이동을 마칠 때마다 호출 (gx,gy = 도착한 칸의 좌상단 맵타일 좌표)
window.onCellSwept = function (gx, gy) {
    dustyCells.delete(cellKey(gx, gy));
};

window.initDust = initDust;
window.sweepGetDustRemaining = function () { return dustyCells.size; };

// ===== 스테이지(장애물 조합) =====

let sweepStageIndex = 0;
let obstacleTiles = {};          // "gx,gy" -> [tx,ty]
let obstacleCollisionKeys = [];  // 이 스테이지가 추가한 충돌 키(교체 시 되돌리기용)

function stageCellToTile(cx, cy) {
    const org = window.GRID_ORIGIN || { x: 0, y: 0 };
    const cell = cellSize();
    return { gx: org.x + cx * cell, gy: org.y + cy * cell };
}

// URL ?stage=N (1-based) → 0-based 인덱스. stage_editor.html의 "이 방 테스트"가 쓰는
// 파라미터라 명시되면 그대로 존중하고, 없을 때만 무작위로 시작 방을 고른다(클리어 후
// 다음 방 선택과 동일하게 방 사이 순서·난이도 설계가 없어서).
function stageIndexFromURL() {
    const n = parseInt(new URLSearchParams(location.search).get('stage'), 10);
    if (Number.isFinite(n) && n >= 1) return n - 1;
    const count = (window.SWEEP_STAGES || []).length;
    return count > 0 ? Math.floor(Math.random() * count) : 0;
}

function applyStage(index) {
    const stages = window.SWEEP_STAGES || [];
    if (!stages.length) return;
    sweepStageIndex = ((index % stages.length) + stages.length) % stages.length;
    const stage = stages[sweepStageIndex];

    // 이전 스테이지가 추가한 장애물 충돌 되돌리기
    obstacleCollisionKeys.forEach(k => mapCollisions.delete(k));
    obstacleCollisionKeys = [];
    obstacleTiles = {};
    minStepsCache = null;   // 장애물이 바뀌므로 최단 걸음 수도 다시 계산해야 함

    const cell = cellSize();
    (stage.obstacles || []).forEach(ob => {
        const def = (window.SWEEP_OBSTACLES || {})[ob.stamp];
        if (!def) return;
        const { gx, gy } = stageCellToTile(ob.cx, ob.cy);
        for (let dy = 0; dy < cell; dy++) {
            for (let dx = 0; dx < cell; dx++) {
                const t = def.tiles[dy * cell + dx];
                if (t) obstacleTiles[(gx + dx) + ',' + (gy + dy)] = t;
                if (def.block !== false) {
                    const k = (gx + dx) + ',' + (gy + dy);
                    mapCollisions.add(k);
                    obstacleCollisionKeys.push(k);
                }
            }
        }
    });
}

function getSpawnCell() {
    const stages = window.SWEEP_STAGES || [];
    const s = stages[sweepStageIndex];
    return (s && s.spawn) ? s.spawn : { cx: 0, cy: 0 };
}

window.sweepStage = {
    applyStage,
    applyFromURL: () => applyStage(stageIndexFromURL()),
    getSpawnCell,
    get index() { return sweepStageIndex; },
    get count() { return (window.SWEEP_STAGES || []).length; }
};

// ===== 최단 걸음 수 (스테이지 클리어 채점용) =====
// 걸을 수 있는 칸 그래프에서 스폰부터 모든 칸을 한 번씩 방문하는 최소 걸음 수.
// 트리 형태 그래프의 정확한 공식: 2*(칸 수-1) - (스폰에서 가장 먼 칸까지의 거리)
// — 그 가장 먼 칸에서 여정을 끝내면 그쪽 왕복 한 번을 아낄 수 있어서다. 사이클이
// 많은 방(순환 경로가 있는 방)에서는 실제 최적보다 살짝 큰 근사치가 나올 수 있지만,
// 채점 기준으로는 충분히 좋은 값. 장애물 배치가 바뀌면(스테이지 전환) 다시 계산한다.
let minStepsCache = null;

function walkableNeighbors(gx, gy, cell) {
    const deltas = [[cell, 0], [-cell, 0], [0, cell], [0, -cell]];
    const out = [];
    deltas.forEach(([dx, dy]) => {
        const nx = gx + dx, ny = gy + dy;
        if (isCellWalkable(nx, ny, cell)) out.push(nx + ',' + ny);
    });
    return out;
}

function computeMinSteps() {
    const cell = cellSize();
    const sp = getSpawnCell();
    const { gx: sgx, gy: sgy } = stageCellToTile(sp.cx, sp.cy);
    const spawnKey = sgx + ',' + sgy;

    const dist = new Map([[spawnKey, 0]]);
    const queue = [spawnKey];
    let qi = 0, farthest = 0;
    while (qi < queue.length) {
        const cur = queue[qi++];
        const [gx, gy] = cur.split(',').map(Number);
        const d = dist.get(cur);
        if (d > farthest) farthest = d;
        walkableNeighbors(gx, gy, cell).forEach(nk => {
            if (!dist.has(nk)) { dist.set(nk, d + 1); queue.push(nk); }
        });
    }
    return 2 * (dist.size - 1) - farthest;
}

window.sweepGetMinSteps = function () {
    if (minStepsCache == null) minStepsCache = computeMinSteps();
    return minStepsCache;
};

// ===== 보수 (스테이지 클리어 등급 → 번 돈) =====
// 등급은 비율이 아니라 최단 걸음 수 대비 절대 걸음 수 차이로 가른다 (레퍼런스 기준):
//   완벽: 최단 걸음 수 그대로 / 성공: 최단 걸음 수 +3 이내 / 절반 성공: 그 초과
// 완벽·성공 100G, 절반 성공 75G.
const STAGE_REWARD = { perfect: 100, success: 100, half: 75 };
const SUCCESS_STEP_MARGIN = 3;

function computeStageGrade(steps) {
    const minSteps = window.sweepGetMinSteps();
    if (steps <= minSteps) return 'perfect';
    if (steps <= minSteps + SUCCESS_STEP_MARGIN) return 'success';
    return 'half';
}

window.sweepGetStageResult = function (steps) {
    const grade = computeStageGrade(steps);
    return { grade, money: STAGE_REWARD[grade] };
};

let totalMoney = 0;
window.sweepAddMoney = function (amount) { totalMoney += amount; };
window.sweepGetTotalMoney = function () { return totalMoney; };

// ===== 미니맵용 셀 상태 그리드 =====
// 플레이필드 셀 수(11×6)는 stage_editor.html의 GW/GH와 동일 — 방마다 크기가 같다는
// 전제(베이스 맵 1장 공유)라 여기서도 고정값으로 둔다.
const PLAYFIELD_COLS = 11, PLAYFIELD_ROWS = 6;

// 미니맵(char_sweep.js)이 매 프레임 읽어 그리는 용도 — 상태를 따로 들고 있지 않고
// obstacleTiles/dustyCells를 그대로 읽어 매번 계산한다.
window.sweepGetCellGrid = function () {
    const cell = cellSize();
    const grid = [];
    for (let cy = 0; cy < PLAYFIELD_ROWS; cy++) {
        const row = [];
        for (let cx = 0; cx < PLAYFIELD_COLS; cx++) {
            const { gx, gy } = stageCellToTile(cx, cy);
            if (obstacleTiles[gx + ',' + gy] !== undefined) row.push('obstacle');
            else if (dustyCells.has(cellKey(gx, gy))) row.push('dusty');
            else if (isCellWalkable(gx, gy, cell)) row.push('clean');
            else row.push('wall');
        }
        grid.push(row);
    }
    return grid;
};

// ===== 바닥 타일 합성 훅 =====
// 장애물 먼저(그 칸은 스탬프 타일), 없으면 먼지, 없으면 원본 바닥.
window.getFloorTileOverride = function (gx, gy, tx, ty) {
    const o = obstacleTiles[gx + ',' + gy];
    if (o) return { tx: o[0], ty: o[1] };
    return dustTileAt(gx, gy, tx, ty);
};
