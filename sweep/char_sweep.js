/**
 * char_sweep.js — 술창고 청소 캐릭터 컨트롤러
 *
 * 한 칸(GRID_CELL_TILES 맵타일 = 32px) 단위 이동.
 * 한 칸 이동을 마칠 때마다 빗자루질 모션을 1회 재생하고 효과음을 낸다
 * (먼지 유무와 무관 — 이동해 왔으면 무조건 1회).
 *
 * 타이밍은 레퍼런스 영상 실측값 기준:
 *   게임 틱 20Hz / 이동 24px(원본) = 8px×3틱 ≈ 0.18s
 *   빗자루질 4틱 ≈ 0.27s / 키 홀드 시 한 칸당 ≈ 0.45s 주기
 *
 * Implements engine.js callbacks:
 *   playerInit, playerUpdate, playerDraw, playerGetState, playerOnAction
 */

// ===== Config =====
const CHAR_CONFIG = {
    MOVE_DURATION: 0.18,    // 한 칸 이동 시간 (s)
    SWEEP_DURATION: 0.27,   // 빗자루질 1회 시간 (s), 3프레임 + 복귀
    WALK_ANIM_SPEED: 0.09,  // 걷기 애니메이션 프레임 간격 (s)
    SFX_SRC: 'sweep.mp3',   // 페이지(sweep/) 기준 상대 경로
    SFX_VOLUME: 0.9,
    SFX_POOL: 3,            // 연속 재생용 오디오 풀 크기
    SPRITE_OFFSET_Y: -16,   // 스프라이트를 판석보다 한 타일 위로 (발 위치 보정)
    STAGE_CLEAR_DELAY: 0.8  // 방 클리어 후 다음 방으로 넘어가기까지 대기(s)
};

// ===== State =====
let walkImg, sweepImg;
let sfxPool = [], sfxIndex = 0;
let hudMoney, hudSteps;

const player = {
    x: 0, y: 0,
    width: 32, height: 32,     // playerInit에서 셀 크기로 재설정
    direction: 0,              // 0: Down, 1: Left, 2: Up, 3: Right
    state: 'idle',             // 'idle' | 'moving' | 'sweeping' | 'cleared'
    startX: 0, startY: 0,
    targetX: 0, targetY: 0,
    moveT: 0,                  // 이동 경과 시간
    sweepT: 0,                 // 빗자루질 경과 시간
    clearT: 0,                 // 스테이지 클리어 후 경과 시간
    stepCount: 0,              // 이번 스테이지에서 실제로 이동한 걸음 수 (채점용)
    animFrame: 0,
    animTimer: 0
};

// ===== Animation Sequences =====
const WALK_SEQUENCE = [0, 1, 2, 1, 0, 3, 4, 3];
const SWEEP_FRAMES = 3;        // ataho-sweep.png: 48x64 x 3프레임 (정면)

function cellPx() {
    return CONFIG.TILE_SIZE * (window.GRID_CELL_TILES || 1);
}

// ===== Engine Callbacks =====

async function playerInit(assets) {
    const loadImg = (src) => new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => { console.warn('Sprite load failed:', src); resolve(img); };
    });

    walkImg = await loadImg(resolvePath('char/ataho-walk.png'));
    sweepImg = await loadImg(resolvePath('char/ataho-sweep.png'));

    // 효과음 풀 (빠른 연속 재생 대응)
    for (let i = 0; i < CHAR_CONFIG.SFX_POOL; i++) {
        const a = new Audio(CHAR_CONFIG.SFX_SRC);
        a.volume = CHAR_CONFIG.SFX_VOLUME;
        a.preload = 'auto';
        sfxPool.push(a);
    }

    player.width = cellPx();
    player.height = cellPx();

    setupHUD();

    // 스테이지(장애물 조합) 적용 후 그 위에서 먼지/스폰을 세팅
    if (window.sweepStage) window.sweepStage.applyFromURL();
    loadStage();
}

// HUD 조립은 world/ui.js의 UIStat이 담당 (balance와 동일한 패턴).
// #hud는 index.html에서 visibility:hidden으로 시작 — 빈 껍데기가 잠깐 보이는 걸 막는다.
function setupHUD() {
    const statsEl = document.getElementById('hud-stats');
    if (!statsEl || typeof UIStat === 'undefined') return;
    hudMoney = new UIStat(['번 돈 ', { num: true }, 'G']);
    hudSteps = new UIStat(['걸음 수 ', { num: true }]);
    statsEl.appendChild(hudMoney.el);
    statsEl.appendChild(hudSteps.el);
    document.getElementById('hud').style.visibility = 'visible';
}

function updateHUD() {
    if (!hudMoney || !hudSteps) return;
    const money = (typeof window.sweepGetTotalMoney === 'function') ? window.sweepGetTotalMoney() : 0;
    hudMoney.setNums(String(money));
    hudSteps.setNums(String(player.stepCount));
}

// 현재 스테이지 기준으로 스폰 배치 + 먼지 초기화. 스테이지 전환 시에도 재사용.
function loadStage() {
    const org = window.GRID_ORIGIN || { x: 0, y: 0 };
    const cell = cellPx();
    const cellTiles = window.GRID_CELL_TILES || 1;

    // 스폰: 스테이지 데이터(셀 좌표) 우선, 없으면 MAP_DATA.startPos
    if (window.sweepStage && window.sweepStage.count > 0) {
        const c = window.sweepStage.getSpawnCell();
        player.x = (org.x + c.cx * cellTiles) * CONFIG.TILE_SIZE;
        player.y = (org.y + c.cy * cellTiles) * CONFIG.TILE_SIZE;
    } else if (window.MAP_DATA && window.MAP_DATA.startPos) {
        player.x = window.MAP_DATA.startPos.x * CONFIG.TILE_SIZE;
        player.y = window.MAP_DATA.startPos.y * CONFIG.TILE_SIZE;
    } else {
        player.x = Math.floor((mapWidth / 2) / cell) * cell;
        player.y = Math.floor((mapHeight / 2) / cell) * cell;
    }

    // 격자에서 어긋나 있으면 가장 가까운 빈 칸에 스냅
    const orgX = org.x * CONFIG.TILE_SIZE, orgY = org.y * CONFIG.TILE_SIZE;
    const snap = (v, o) => o + Math.round((v - o) / cell) * cell;
    const free = (x, y) => !checkCollision(x + 1, y + 1, cell - 2, cell - 2);
    let sx = snap(player.x, orgX), sy = snap(player.y, orgY);
    if (!free(sx, sy)) {
        sx = orgX + Math.floor((player.x - orgX) / cell) * cell;
        sy = orgY + Math.floor((player.y - orgY) / cell) * cell;
    }
    if (free(sx, sy)) { player.x = sx; player.y = sy; }
    else console.warn('스폰을 격자에 스냅하지 못했습니다:', player.x, player.y);

    player.state = 'idle';
    player.stepCount = 0;

    // 먼지 레이어 초기화 (장애물 충돌이 이미 반영된 시점)
    if (typeof window.initDust === 'function') window.initDust();
    // 시작 칸은 밟고 시작하는 것으로 간주해 바로 깨끗한 상태로 시작
    if (typeof window.onCellSwept === 'function') {
        window.onCellSwept(player.x / CONFIG.TILE_SIZE, player.y / CONFIG.TILE_SIZE);
    }
}

function playerGetState() {
    return {
        x: player.x,
        y: player.y,
        width: player.width,
        height: player.height,
        direction: player.direction
    };
}

function playSweepSfx() {
    const a = sfxPool[sfxIndex];
    if (!a) return;
    sfxIndex = (sfxIndex + 1) % sfxPool.length;
    a.currentTime = 0;
    a.play().catch(() => { /* 자동재생 정책으로 첫 재생이 막히면 무시 */ });
}

function readInput() {
    if (keys.ArrowUp || keys.w) return { dx: 0, dy: -1, dir: 2 };
    if (keys.ArrowDown || keys.s) return { dx: 0, dy: 1, dir: 0 };
    if (keys.ArrowLeft || keys.a) return { dx: -1, dy: 0, dir: 1 };
    if (keys.ArrowRight || keys.d) return { dx: 1, dy: 0, dir: 3 };
    if (touchInput.active) {
        if (Math.abs(touchInput.dx) > Math.abs(touchInput.dy)) {
            return touchInput.dx > 0 ? { dx: 1, dy: 0, dir: 3 } : { dx: -1, dy: 0, dir: 1 };
        }
        return touchInput.dy > 0 ? { dx: 0, dy: 1, dir: 0 } : { dx: 0, dy: -1, dir: 2 };
    }
    return null;
}

function tryStep(input) {
    player.direction = input.dir;   // 막혀도 바라보는 방향은 바뀐다

    const cell = cellPx();
    const nextX = player.x + input.dx * cell;
    const nextY = player.y + input.dy * cell;

    if (nextX < 0 || nextY < 0 || nextX + cell > mapWidth || nextY + cell > mapHeight) return;
    if (checkCollision(nextX + 1, nextY + 1, cell - 2, cell - 2)) return;

    player.state = 'moving';
    player.startX = player.x;
    player.startY = player.y;
    player.targetX = nextX;
    player.targetY = nextY;
    player.moveT = 0;
    player.animFrame = 0;
    player.animTimer = 0;
    player.stepCount++;
}

function playerUpdate(dt) {
    updateHUD();

    if (player.state === 'idle') {
        const input = readInput();
        if (input && !isInteracting()) tryStep(input);
        if (player.state === 'idle') {
            player.animFrame = 0;
            player.animTimer = 0;
            return;
        }
    }

    if (player.state === 'moving') {
        player.moveT += dt;

        // 걷기 애니메이션
        player.animTimer += dt;
        if (player.animTimer >= CHAR_CONFIG.WALK_ANIM_SPEED) {
            player.animTimer = 0;
            player.animFrame = (player.animFrame + 1) % WALK_SEQUENCE.length;
        }

        if (player.moveT >= CHAR_CONFIG.MOVE_DURATION) {
            // 도착 → 빗자루질 (이동해 왔으면 무조건 1회 + 효과음)
            player.x = player.targetX;
            player.y = player.targetY;
            player.state = 'sweeping';
            player.sweepT = 0;
            playSweepSfx();
            // 먼지 시스템(Step 3) 연결 지점: 도착한 칸의 맵타일 좌표 전달
            if (typeof window.onCellSwept === 'function') {
                window.onCellSwept(player.x / CONFIG.TILE_SIZE, player.y / CONFIG.TILE_SIZE);
            }
        } else {
            const ratio = player.moveT / CHAR_CONFIG.MOVE_DURATION;
            player.x = player.startX + (player.targetX - player.startX) * ratio;
            player.y = player.startY + (player.targetY - player.startY) * ratio;
        }
        return;
    }

    if (player.state === 'sweeping') {
        player.sweepT += dt;
        if (player.sweepT >= CHAR_CONFIG.SWEEP_DURATION) {
            // 먼지를 전부 지웠으면 스테이지 클리어
            const cleared = (typeof window.sweepGetDustRemaining === 'function') &&
                window.sweepGetDustRemaining() === 0 &&
                window.sweepStage && window.sweepStage.count > 0;
            if (cleared) {
                player.state = 'cleared';
                player.clearT = 0;
                if (typeof window.sweepGetStageResult === 'function') {
                    player.lastResult = window.sweepGetStageResult(player.stepCount);
                    if (typeof window.sweepAddMoney === 'function') {
                        window.sweepAddMoney(player.lastResult.money);
                    }
                }
                return;
            }
            player.state = 'idle';
            // 키를 계속 누르고 있으면 다음 칸으로 바로 이어간다
            const input = readInput();
            if (input && !isInteracting()) tryStep(input);
        }
        return;
    }

    if (player.state === 'cleared') {
        // 다음 방으로 (연출·문 열림은 Step 6). 마지막 방이면 처음으로 순환.
        player.clearT += dt;
        if (player.clearT >= CHAR_CONFIG.STAGE_CLEAR_DELAY) {
            const st = window.sweepStage;
            const next = (st.index + 1 < st.count) ? st.index + 1 : 0;
            st.applyStage(next);
            loadStage();
        }
    }
}

function playerDraw(ctx) {
    const spriteW = 48, spriteH = 64;
    const dstX = Math.floor(player.x + player.width / 2 - spriteW / 2);
    const dstY = Math.floor(player.y + player.height - spriteH + CHAR_CONFIG.SPRITE_OFFSET_Y);

    if (player.state === 'sweeping' && sweepImg && sweepImg.naturalWidth > 0) {
        const idx = Math.min(SWEEP_FRAMES - 1,
            Math.floor(player.sweepT / (CHAR_CONFIG.SWEEP_DURATION / SWEEP_FRAMES)));
        ctx.drawImage(sweepImg, idx * spriteW, 0, spriteW, spriteH, dstX, dstY, spriteW, spriteH);
        return;
    }

    if (walkImg && walkImg.naturalWidth > 0) {
        const seqIndex = (player.state === 'moving') ? WALK_SEQUENCE[player.animFrame] : 0;
        const framesPerDir = 5;
        const totalFrameIndex = (player.direction * framesPerDir) + seqIndex;
        let framesPerRow = Math.floor(walkImg.width / spriteW);
        if (framesPerRow < 1) framesPerRow = 1;
        const col = totalFrameIndex % framesPerRow;
        const row = Math.floor(totalFrameIndex / framesPerRow);
        ctx.drawImage(walkImg, col * spriteW, row * spriteH, spriteW, spriteH, dstX, dstY, spriteW, spriteH);
    } else {
        ctx.fillStyle = 'blue';
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }
}

function playerOnAction(actionType, count = Infinity) {
    // 트리거 메뉴 액션 (미니게임에서는 리셋만)
    player.state = 'idle';
    Object.keys(keys).forEach(k => keys[k] = false);
}

window.sweepGetStepCount = function () { return player.stepCount; };
