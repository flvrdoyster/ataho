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

// URL ?stage=N (1-based) → 0-based 인덱스. 없으면 0.
function stageIndexFromURL() {
    const n = parseInt(new URLSearchParams(location.search).get('stage'), 10);
    return (Number.isFinite(n) && n >= 1) ? n - 1 : 0;
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

// ===== 바닥 타일 합성 훅 =====
// 장애물 먼저(그 칸은 스탬프 타일), 없으면 먼지, 없으면 원본 바닥.
window.getFloorTileOverride = function (gx, gy, tx, ty) {
    const o = obstacleTiles[gx + ',' + gy];
    if (o) return { tx: o[0], ty: o[1] };
    return dustTileAt(gx, gy, tx, ty);
};
