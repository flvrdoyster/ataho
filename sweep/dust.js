/**
 * dust.js — 술창고 먼지 레이어
 *
 * 바닥 칸(GRID_CELL_TILES 크기의 슬래브)마다 "먼지" / "깨끗함" 두 상태를 갖는다.
 * 렌더링은 engine.js의 바닥 그리기 훅(window.getFloorTileOverride)에 개입해
 * 먼지 낀 칸의 타일을 이끼 낀 변형 타일로 바꿔치기하는 방식으로 구현한다
 * (같은 돌 실루엣의 +3칸 이동한 이끼 버전 — souko_tile.png 기준).
 *
 * char_sweep.js가 한 칸 이동을 마칠 때마다 호출하는 window.onCellSwept(gx, gy)
 * 훅에서 해당 칸을 깨끗한 상태로 전환한다.
 */

// 깨끗한 바닥 타일 → 먼지 낀 변형 타일 매핑 ("tx,ty" → {tx,ty})
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

function dustCellSize() {
    return window.GRID_CELL_TILES || 1;
}

function dustCellKey(cellGx, cellGy) {
    return cellGx + ',' + cellGy;
}

function isCellWalkable(gx, gy, cell) {
    const T = CONFIG.TILE_SIZE;
    return !checkCollision(gx * T + 1, gy * T + 1, cell * T - 2, cell * T - 2);
}

// 맵의 걸을 수 있는 칸을 전부 찾아 먼지로 채운다.
// 스테이지별 먼지/장애물 배치는 Step 4에서 다룬다 — Step 3은 "바닥 전체 = 먼지"로 시작.
function initDust() {
    dustyCells = new Set();
    const org = window.GRID_ORIGIN || { x: 0, y: 0 };
    const cell = dustCellSize();
    const cols = Math.ceil(mapWidth / CONFIG.TILE_SIZE);
    const rows = Math.ceil(mapHeight / CONFIG.TILE_SIZE);

    for (let gy = org.y; gy + cell <= rows; gy += cell) {
        for (let gx = org.x; gx + cell <= cols; gx += cell) {
            if (isCellWalkable(gx, gy, cell)) dustyCells.add(dustCellKey(gx, gy));
        }
    }
}

// engine.js 바닥 그리기 훅 — 이 맵타일이 먼지 낀 칸에 속하면 대체 타일 좌표를 반환
window.getFloorTileOverride = function (gx, gy, tx, ty) {
    const org = window.GRID_ORIGIN || { x: 0, y: 0 };
    const cell = dustCellSize();
    const cellGx = org.x + Math.floor((gx - org.x) / cell) * cell;
    const cellGy = org.y + Math.floor((gy - org.y) / cell) * cell;
    if (!dustyCells.has(dustCellKey(cellGx, cellGy))) return null;
    return DUST_TILE_MAP[tx + ',' + ty] || null;
};

// char_sweep.js가 한 칸 이동을 마칠 때마다 호출 (gx,gy = 도착한 칸의 좌상단 맵타일 좌표)
window.onCellSwept = function (gx, gy) {
    dustyCells.delete(dustCellKey(gx, gy));
};

// Step 4(클리어 판정)·Step 5(HUD)에서 쓸 조회용 API
window.sweepGetDustRemaining = function () { return dustyCells.size; };

// engine.js가 collision·mapWidth/Height를 이미 준비해둔 시점(playerInit)에 초기화
window.initDust = initDust;
