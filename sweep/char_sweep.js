/**
 * char_sweep.js — 술창고 청소 캐릭터 컨트롤러
 *
 * 한 칸(GRID_CELL_TILES=3 맵타일 = 48px) 단위 이동.
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
    CLEAR_SFX: {            // 방 클리어 시 등급별 효과음
        perfect: 'success.mp3',
        success: 'success.mp3',
        half: 'failure.mp3'
    },
    BGM_SRC: 'bgm.mp3',     // 배경음악 (계속 루프)
    BGM_VOLUME: 0.5,
    SPRITE_OFFSET_Y: -16,   // 스프라이트를 판석보다 한 타일 위로 (발 위치 보정)
    STAGE_CLEAR_DELAY: 0.8, // 방 클리어 후 다음 방으로 넘어가기까지 대기(s)
    STAGE_FADE_DURATION: 0.3, // 스테이지 전환 페이드 인/아웃 각각 걸리는 시간(s)
    MONEY_GOAL: 1000,       // 외상 술값 — 전환 대사(DIALOGUE.next) 분기 기준.
                            // 정식 클리어 조건/선택지는 Step 7에서 확정 예정
    MASTER_SRC: 'master_all.png',  // 페이지(sweep/) 기준 상대 경로, 32x64 2프레임(정면/뒷모습) 가로 배치
    MASTER_LEAVE_DELAY: 0.6,       // 뒷모습으로 돌아선 뒤 사라지기까지 대기(s)
    DOOR_SFX: 'door.mp3',          // 술집주인 등장/퇴장 공용 효과음

    // 대사 타이밍 — 그 방의 최단 걸음 수(minSteps) 기준 상대 걸음(±)에 도달하면 발동
    MASTER_OVERSHOOT_STEPS: 2,     // 술집주인 등장 + 재촉(overshoot) 대사: 최단 +2걸음
    HALF_WARNING_STEPS: 4          // 절반 성공 경고(halfWarning) 대사: 최단 +4걸음
                                   // = 등급이 half로 떨어지는 지점(최단+SUCCESS_STEP_MARGIN 초과).
                                   // loader.js의 SUCCESS_STEP_MARGIN(3)을 바꾸면 여기도 맞출 것
};

// 미니맵 — 카메라가 플레이어를 따라다녀 방 전체가 화면 밖으로 나갈 수 있어(특히 모바일
// 세로 화면) 우측 상단에 작은 격자로 먼지·장애물·플레이어 위치를 보여준다.
const MINIMAP_CONFIG = {
    CELL_PX: 5,   // 미니맵 내부 캔버스에서 한 칸이 차지하는 raw 픽셀 크기(칸 4px + 여백 1px)
    GAP: 1,
    SCALE: 1.5,   // CSS 표시 배율 (image-rendering: pixelated로 또렷하게)
    HUD_GAP: 4,   // HUD 바로 아래 간격(px) — 크기를 줄인 뒤로 HUD 쪽에 더 붙임
    COLORS: {
        obstacle: '#4a3a2a',
        wall: '#4a3a2a',
        dusty: '#8a7a4a',
        clean: '#d8cfa8',
        player: '#e0503a'
    }
};

// ===== 대사 데이터 =====
// 원작 번역(suiko-web-v2 kr-patch) 기준. speaker: 'master'(문 앞 술집주인) | 'ataho'(플레이어)
const DIALOGUE = {
    intro: [
        { text: '마루바닥에 먼지가 잔뜩 묻어있지? 그걸 전부 치워야 해', speaker: 'master' },
        { text: '방 하나에 100G씩 주지! 대신 빨리빨리 해야 해', speaker: 'master' },
        { text: '하지만 멍청하게 같은 곳을 여러 번 치우면 방 하나에 75G로 줄이겠어', speaker: 'master' },
        { text: '같은 곳을 여러 번 지나치지 않고 모든 방을 청소하면 되는 거잖아!', speaker: 'ataho' },
        { text: '…쳇, 별 거 아니구만', speaker: 'ataho' }
    ],
    overshoot: [
        { text: '뭐야? 아직 못 끝냈어? 빨리 안 끝내면 75G야!', speaker: 'master' },
        { text: '알았어, 알았다구', speaker: 'ataho' }
    ],
    halfWarning: [
        { text: '이봐 아직 멀었어? 요령이 좋아야지!!', speaker: 'master' },
        { text: '…제길, 왜 내가 이런 일을 해야만 하지?', speaker: 'ataho' }
    ],
    // 각 줄의 sfx: 그 줄이 뜨는 시점에 재생할 효과음('door' | CLEAR_SFX 등급명). 생략 가능.
    clear: {
        perfect: [
            { text: '호오… 벌써 끝냈나? 꽤 잘하는구만', speaker: 'master', sfx: 'perfect' },
            { text: '이런 거야 식은 죽 먹기지', speaker: 'ataho' }
        ],
        success: [
            { text: '겨우 끝냈군, 어쨌든 합격일세!', speaker: 'master', sfx: 'success' },
            { text: '조금만 분발했으면 최단 루트로도 가능했는데', speaker: 'ataho' }
        ],
        half: [
            { text: '겨우 끝냈군', speaker: 'master' },
            { text: '시간을 초과했으니 유감이네만 청소비는 75G네!', speaker: 'master', sfx: 'half' },
            { text: '뭐라구!?', speaker: 'ataho' }
        ]
    },
    // 클리어 대사가 끝난 뒤, 다음 방으로 넘어가기 직전 — 누적 번 돈 기준 분기
    next: {
        under: [   // 아직 외상 술값(MONEY_GOAL) 미달
            { text: '외상 술값만큼 일하려면 멀었어, 다른 방으로 가세!', speaker: 'master' },
            { text: '휴우… 아직도 멀었군', speaker: 'ataho' }
        ],
        over: [    // 목표 달성 — 선택지("계속할텐가?")는 Step 7에서, 지금은 대사만 하고 무한 계속
            { text: '이제 외상 술값만큼의 일은 끝났네!', speaker: 'master' },
            { text: '자, 청소도 끝났으니 돌아가세', speaker: 'master' },
            { text: '계속할텐가? 좋을 대로 하게', speaker: 'master' }
        ]
    }
};

// ===== State =====
let walkImg, sweepImg, masterImg;
let bgm = null;
let hudMoney, hudSteps;
let minimapCanvas, minimapCtx, minimapWrap;
let masterVisible = false;   // 술집주인이 이번 방 문 앞에 나타났는지
let masterFrame = 0;         // 0: 정면, 1: 뒷모습(퇴장 중) — master_all.png의 가로 프레임 인덱스
let masterLeaveT = null;     // null이면 퇴장 시퀀스 아님, 숫자면 뒷모습 전환 후 경과 시간(s)
let introPending = false;    // true면 playerUpdate 첫 프레임에 인트로 대사 시작
let transitionSaid = false;  // 이번 클리어의 전환 대사(DIALOGUE.next)를 이미 띄웠는지
let moneyAwarded = false;    // 이번 클리어의 보수를 이미 지급했는지 (이중/누락 지급 방지)
let fadeEl = null;
let fadePhase = 'none';      // 'none' | 'out' | 'in' — 스테이지 전환 화면 페이드
let fadeT = 0;
let pendingStageIndex = null;

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

function setFadeOpacity(v) {
    if (fadeEl) fadeEl.style.opacity = String(v);
}

// 문(스폰 칸 바로 아래) 월드 픽셀 좌표 — 술집주인이 서는 자리.
function doorWorldPos() {
    const org = window.GRID_ORIGIN || { x: 0, y: 0 };
    const cellTiles = window.GRID_CELL_TILES || 1;
    const cell = cellPx();
    const spawn = (window.sweepStage && window.sweepStage.getSpawnCell) ? window.sweepStage.getSpawnCell() : { cx: 5, cy: 5 };
    return {
        x: (org.x + spawn.cx * cellTiles) * CONFIG.TILE_SIZE + cell / 2,
        y: (org.y + (spawn.cy + 1) * cellTiles) * CONFIG.TILE_SIZE
    };
}

// 술집주인 스프라이트의 월드 사각형 — 그리기(drawMaster)와 말풍선 앵커(getBubbleAnchor)가
// 같은 값을 써야 말풍선이 스프라이트 위에 정확히 붙는다.
// 그리기용 — 실제 스프라이트가 찍히는 픽셀 사각형(발 위치 보정 포함).
function masterRect() {
    const w = 32, h = 64;
    const door = doorWorldPos();
    return {
        x: door.x - w / 2,
        y: door.y + cellPx() - h + CHAR_CONFIG.SPRITE_OFFSET_Y,
        width: w,
        height: h
    };
}

// 말풍선 앵커용 — playerGetState()와 같은 "칸(cell)" 의미의 사각형(칸 상단 y, 칸 높이).
// 엔진의 말풍선 위치 계산(SPEECH_BUBBLE_OFFSET_Y)은 이 칸 기준으로 튜닝돼 있어서,
// masterRect()(스프라이트 보정이 이미 들어간 좌표)를 그대로 쓰면 오프셋이 이중으로
// 적용돼 말풍선이 머리 위로 너무 멀리 뜬다.
function masterAnchorRect() {
    const door = doorWorldPos();
    const cell = cellPx();
    return { x: door.x - cell / 2, y: door.y, width: cell, height: cell };
}

// 술집주인 등장 판정 — 최단 걸음 수를 넘기면 그 뒤로 MASTER_OVERSHOOT_STEPS만큼 더
// 걸었을 때 문 앞에 등장(그 뒤로는 방을 마칠 때까지 계속 그 자리). 넘기지 않고
// 클리어하면(완벽/거의 완벽) 클리어 시점에 등장 — playerUpdate의 cleared 분기에서 처리.
function checkMasterTrigger() {
    if (masterVisible) return;
    const minSteps = (typeof window.sweepGetMinSteps === 'function') ? window.sweepGetMinSteps() : null;
    if (minSteps == null) return;
    if (player.stepCount >= minSteps + CHAR_CONFIG.MASTER_OVERSHOOT_STEPS) {
        masterVisible = true;
        playDoorSfx();
        queueSay(DIALOGUE.overshoot);
    }
}

// 절반 성공 경고 — HALF_WARNING_STEPS 지점에 도달한 첫 순간(딱 한 번) 재촉 대사.
// checkMasterTrigger로 이미 등장한 뒤라야 자연스러워서 masterVisible을 전제로 한다
// (MASTER_OVERSHOOT_STEPS < HALF_WARNING_STEPS라 항상 성립).
let halfWarningShown = false;

function checkHalfWarning() {
    if (halfWarningShown || !masterVisible) return;
    const minSteps = (typeof window.sweepGetMinSteps === 'function') ? window.sweepGetMinSteps() : null;
    if (minSteps == null) return;
    if (player.stepCount < minSteps + CHAR_CONFIG.HALF_WARNING_STEPS) return;
    halfWarningShown = true;
    queueSay(DIALOGUE.halfWarning);
}

// ===== 대사 큐 =====
// 말풍선 하나가 닫혀야(자동 닫힘 또는 수동 스킵) 다음 줄이 뜨는 순차 재생.
// queueSay([{text, speaker}, ...], onComplete?) — 첫 줄은 즉시, 나머지는 playerUpdate에서
// 자동 진행. onComplete는 마지막 줄까지 닫히고 나면 한 번 호출된다.
let dialogueQueue = [];
let dialogueOnComplete = null;

function queueSay(lines, onComplete) {
    if (!lines || !lines.length) return;
    dialogueQueue = lines.slice(1);
    dialogueOnComplete = onComplete || null;
    playLineSfx(lines[0].sfx);
    window.sweepSay(lines[0].text, lines[0].speaker);
}

function advanceDialogueQueue() {
    if (isInteracting()) return;
    if (dialogueQueue.length > 0) {
        const next = dialogueQueue.shift();
        playLineSfx(next.sfx);
        window.sweepSay(next.text, next.speaker);
    } else if (dialogueOnComplete) {
        const cb = dialogueOnComplete;
        dialogueOnComplete = null;
        cb();
    }
}

// 인트로 대사가 끝난 뒤 술집주인이 뒤돌아서 퇴장하는 연출 시작
function startMasterLeave() {
    masterFrame = 1;
    masterLeaveT = 0;
    playDoorSfx();
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
    masterImg = await loadImg(CHAR_CONFIG.MASTER_SRC);

    setupSfx();
    setupBgm();

    player.width = cellPx();
    player.height = cellPx();

    setupHUD();
    setupMinimap();
    fadeEl = document.getElementById('stage-fade');

    // 스테이지(장애물 조합) 적용 후 그 위에서 먼지/스폰을 세팅
    if (window.sweepStage) window.sweepStage.applyFromURL();
    loadStage();

    // 술집주인 첫 등장(인트로) 시작은 playerUpdate 첫 프레임으로 미룬다 — 지금(playerInit
    // 도중)은 engine.js가 아직 injectUI()를 안 돌려서 #speech-bubble이 DOM에 없다.
    // 여기서 바로 queueSay하면 첫 줄이 조용히 씹히고(대사 상태만 잡혀 자동 타임아웃),
    // 두 번째 줄부터 보이는 버그가 났었다.
    introPending = true;
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
    if (typeof UIMuteButton !== 'undefined') {
        new UIMuteButton({
            parent: document.getElementById('hud'),
            onToggle: setAudioMuted
        });
    }
    document.getElementById('hud').style.visibility = 'visible';
}

function updateHUD() {
    if (!hudMoney || !hudSteps) return;
    const money = (typeof window.sweepGetTotalMoney === 'function') ? window.sweepGetTotalMoney() : 0;
    hudMoney.setNums(String(money));
    hudSteps.setNums(String(player.stepCount));
}

// 미니맵 캔버스는 실제 표시 크기보다 작게 그리고 CSS로 확대한다(SpriteNumberFont와 같은
// 픽셀아트 확대 관례) — #minimap-wrap은 index.html에서 visibility:hidden으로 시작.
function setupMinimap() {
    minimapCanvas = document.getElementById('minimap');
    minimapWrap = document.getElementById('minimap-wrap');
    if (!minimapCanvas || !minimapWrap) return;
    minimapCtx = minimapCanvas.getContext('2d');
    minimapCtx.imageSmoothingEnabled = false;

    const c = MINIMAP_CONFIG;
    const cols = 11, rows = 6; // loader.js sweepGetCellGrid()와 동일한 플레이필드 크기
    minimapCanvas.width = cols * (c.CELL_PX + c.GAP) - c.GAP;
    minimapCanvas.height = rows * (c.CELL_PX + c.GAP) - c.GAP;
    minimapCanvas.style.width = (minimapCanvas.width * c.SCALE) + 'px';
    minimapCanvas.style.height = (minimapCanvas.height * c.SCALE) + 'px';

    minimapWrap.style.visibility = 'visible';

    // #hud 실제 높이 아래로 붙인다 — 좁은 화면에서 "걸음 수"가 줄바꿈되는 등
    // HUD 높이가 화면폭에 따라 달라져서 sweep.css의 고정 top 값만으로는 못 맞춘다.
    positionMinimap();
    window.addEventListener('resize', positionMinimap);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(positionMinimap);
}

function positionMinimap() {
    const hud = document.getElementById('hud');
    if (!hud || !minimapWrap) return;
    minimapWrap.style.top = (hud.getBoundingClientRect().bottom + MINIMAP_CONFIG.HUD_GAP) + 'px';
}

// 화면(canvas)이 맵 전체를 담을 만큼 크면 카메라가 스크롤할 일이 없어 미니맵이
// 불필요하다 — canvas.width/height는 이미 브라우저 뷰포트 크기 기준(resizeCanvas)이라
// mapWidth/mapHeight와 그대로 비교하면 된다.
function minimapNeeded() {
    return canvas.width < mapWidth || canvas.height < mapHeight;
}

function updateMinimap() {
    if (!minimapCtx) return;

    const needed = minimapNeeded();
    minimapWrap.style.display = needed ? '' : 'none';
    if (!needed) return;

    const c = MINIMAP_CONFIG;
    const step = c.CELL_PX + c.GAP;
    const grid = window.sweepGetCellGrid();

    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    for (let cy = 0; cy < grid.length; cy++) {
        for (let cx = 0; cx < grid[cy].length; cx++) {
            minimapCtx.fillStyle = c.COLORS[grid[cy][cx]] || c.COLORS.wall;
            minimapCtx.fillRect(cx * step, cy * step, c.CELL_PX, c.CELL_PX);
        }
    }

    const org = window.GRID_ORIGIN || { x: 0, y: 0 };
    const cellTiles = window.GRID_CELL_TILES || 1;
    const pcx = Math.round((player.x / CONFIG.TILE_SIZE - org.x) / cellTiles);
    const pcy = Math.round((player.y / CONFIG.TILE_SIZE - org.y) / cellTiles);
    minimapCtx.fillStyle = c.COLORS.player;
    minimapCtx.fillRect(pcx * step, pcy * step, c.CELL_PX, c.CELL_PX);
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
    masterVisible = false;
    masterFrame = 0;
    masterLeaveT = null;
    halfWarningShown = false;
    transitionSaid = false;
    moneyAwarded = false;

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

// ===== 효과음 (WebAudio) =====
// HTMLAudioElement 풀 대신 AudioBuffer + BufferSource를 쓴다 — 이유(및 겪었던 증상)는
// feedback_minigame_sfx_webaudio 메모리 참고. 요약: HTMLAudio는 (1) iOS가 요소별로 첫
// 재생을 사용자 제스처 안에서 요구해 미리 만들어둔 여러 개를 전부 그 안에서 play()해야
// 하고, (2) 겹쳐 재생하려면 풀을 직접 관리해야 하며, (3) currentTime=0 재사용이 로드
// 타이밍에 따라 씹힐 수 있다 — 세 문제 다 sweep에서 실제로 재생 누락으로 나타났었다.
// BufferSource는 매번 새로 만들어 겹침이 공짜고, AudioContext 하나만 resume()하면 끝난다.
let audioCtx = null;
let sfxGain = null;
const sfxBuffers = {};   // src -> Promise<AudioBuffer|null> (playerInit에서 미리 디코딩 시작)

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sfxGain = audioCtx.createGain();
        sfxGain.gain.value = CHAR_CONFIG.SFX_VOLUME;
        sfxGain.connect(audioCtx.destination);
    }
    return audioCtx;
}

function loadSfxBuffer(src) {
    if (sfxBuffers[src]) return sfxBuffers[src];
    const ctx = getAudioContext();
    sfxBuffers[src] = fetch(src)
        .then(res => res.arrayBuffer())
        .then(data => ctx.decodeAudioData(data))
        .catch(() => null);
    return sfxBuffers[src];
}

function playSfxBuffer(src) {
    const ctx = getAudioContext();
    Promise.resolve(loadSfxBuffer(src)).then(buffer => {
        if (!buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(sfxGain);
        source.start(0);
    });
}

// 디코딩은 제스처 없이도 진행되지만, 실제 재생(context.resume())은 제스처가 필요하다 —
// setupBgm()의 제스처 핸들러가 BGM과 함께 이 컨텍스트도 같이 resume한다.
function setupSfx() {
    loadSfxBuffer(CHAR_CONFIG.SFX_SRC);
    Object.values(CHAR_CONFIG.CLEAR_SFX).forEach(loadSfxBuffer);
    loadSfxBuffer(CHAR_CONFIG.DOOR_SFX);
}

function playSweepSfx() { playSfxBuffer(CHAR_CONFIG.SFX_SRC); }

function playClearSfx(grade) {
    const src = CHAR_CONFIG.CLEAR_SFX[grade];
    if (src) playSfxBuffer(src);
}

function playDoorSfx() { playSfxBuffer(CHAR_CONFIG.DOOR_SFX); }

// 대사 줄의 sfx 속성 처리 — DIALOGUE 테이블에서 어느 줄이 뜰 때 효과음이 나올지 지정.
// 'door' 또는 CLEAR_SFX 등급명('perfect'/'success'/'half')을 받는다. 등급명일 때는 그
// 효과음 타이밍에 맞춰 번 돈도 함께 반영한다(HUD 숫자가 소리 없이 먼저 올라가지 않게).
function playLineSfx(name) {
    if (!name) return;
    if (name === 'door') { playDoorSfx(); return; }
    if (!CHAR_CONFIG.CLEAR_SFX[name]) return;
    playClearSfx(name);
    awardStageMoney();
}

// 보수 지급 — 기본적으로 등급 sfx가 재생되는 대사 줄에서 소리와 함께 반영되지만,
// 대사 편집으로 sfx 속성이 빠지거나 중복돼도 정확히 한 번만 지급되도록 플래그로 방어.
// (전환 대사 직전에도 한 번 더 호출해 누락 케이스를 잡는다)
function awardStageMoney() {
    if (moneyAwarded || !player.lastResult) return;
    if (typeof window.sweepAddMoney !== 'function') return;
    moneyAwarded = true;
    window.sweepAddMoney(player.lastResult.money);
}

// ===== 음소거 =====
// UIMuteButton(world/ui.js)의 onToggle에서 호출. BGM은 pause/play, 효과음은 AudioContext
// 자체를 suspend/resume — 개별 SFX 재생 코드는 손댈 필요가 없다.
let audioMuted = false;

function setAudioMuted(muted) {
    audioMuted = muted;
    if (muted) {
        if (bgm) bgm.pause();
        if (audioCtx) audioCtx.suspend().catch(() => { });
    } else {
        if (bgm) bgm.play().catch(() => { });
        if (audioCtx) audioCtx.resume().catch(() => { });
    }
}

// ===== BGM =====
// 계속 루프 재생. 오디오가 죽는 상황 방어는 haiyuki(assets.js)와 같은 전략:
//   - 자동재생 정책: 첫 play()가 거부되면 이후 사용자 제스처마다 재시도
//   - iOS 화면 잠금/앱 전환: 복귀 신호(visibilitychange/focus/pageshow)에서 재개
//   - 핸들러는 once 없이 유지 — iOS는 언제든 오디오를 끊을 수 있어 일회성으론 부족
// 단, 사용자가 직접 음소거했으면(audioMuted) 이 신호들이 되살리지 않게 막는다.
function setupBgm() {
    bgm = new Audio(CHAR_CONFIG.BGM_SRC);
    bgm.loop = true;
    bgm.volume = CHAR_CONFIG.BGM_VOLUME;
    bgm.preload = 'auto';

    // BGM + 효과음용 AudioContext 둘 다 같은 제스처 신호로 복구한다.
    const resume = () => {
        if (audioMuted) return;
        if (bgm && bgm.paused) bgm.play().catch(() => { });
        if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => { });
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resume();
    });
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);   // bfcache 복원 (iOS Safari)
    window.addEventListener('pointerdown', resume, { passive: true });
    window.addEventListener('touchstart', resume, { passive: true });
    window.addEventListener('keydown', resume);

    resume();   // 제스처 전이라 대부분 거부되지만, 정책상 허용된 환경이면 바로 시작
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
    checkMasterTrigger();
    checkHalfWarning();
}

function playerUpdate(dt) {
    if (introPending) {
        introPending = false;
        masterVisible = true;
        playDoorSfx();
        queueSay(DIALOGUE.intro, startMasterLeave);
    }

    updateHUD();
    updateMinimap();
    advanceDialogueQueue();

    if (masterLeaveT !== null) {
        masterLeaveT += dt;
        if (masterLeaveT >= CHAR_CONFIG.MASTER_LEAVE_DELAY) {
            masterVisible = false;
            masterFrame = 0;
            masterLeaveT = null;
        }
    }

    // 스테이지 전환 페이드 — player.state와 무관하게 여기서 전부 처리하고, 진행 중엔
    // 다른 로직(이동 등)이 안 끼어들게 그대로 리턴한다.
    if (fadePhase === 'out') {
        fadeT += dt;
        const t = Math.min(1, fadeT / CHAR_CONFIG.STAGE_FADE_DURATION);
        setFadeOpacity(t);
        if (t >= 1) {
            window.sweepStage.applyStage(pendingStageIndex);
            loadStage();
            fadePhase = 'in';
            fadeT = 0;
        }
        return;
    }
    if (fadePhase === 'in') {
        fadeT += dt;
        const t = Math.min(1, fadeT / CHAR_CONFIG.STAGE_FADE_DURATION);
        setFadeOpacity(1 - t);
        if (t >= 1) fadePhase = 'none';
        return;
    }

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
                if (!masterVisible) playDoorSfx();   // 이미 등장해 있었으면(넘긴 경우) 다시 들어오는 게 아님
                masterVisible = true;   // 넘기지 않고 클리어했으면 이 시점에 등장
                if (typeof window.sweepGetStageResult === 'function') {
                    // 번 돈 반영은 여기서 하지 않는다 — 해당 등급 sfx가 재생되는 대사 줄
                    // (playLineSfx)에서 소리와 함께 올라가야 자연스럽다.
                    player.lastResult = window.sweepGetStageResult(player.stepCount);
                    queueSay(DIALOGUE.clear[player.lastResult.grade] || DIALOGUE.clear.half);
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
        // 말풍선(평가 대사)이 떠 있는 동안은 대기 — 닫힌 뒤부터 전환 딜레이를 센다
        if (isInteracting()) { player.clearT = 0; return; }
        // 평가 대사가 끝나면 전환 대사(누적 번 돈 기준 분기)를 한 번 띄우고,
        // 그것까지 닫힌 뒤에야 아래 전환 딜레이로 넘어간다
        if (!transitionSaid) {
            transitionSaid = true;
            awardStageMoney();   // 평가 대사에 등급 sfx 줄이 없었어도 여기서 반드시 지급
            const money = (typeof window.sweepGetTotalMoney === 'function') ? window.sweepGetTotalMoney() : 0;
            queueSay(money >= CHAR_CONFIG.MONEY_GOAL ? DIALOGUE.next.over : DIALOGUE.next.under);
            return;
        }
        // 다음 방은 무작위 — 방 사이에 난이도·순서가 없고, 직전 방만 후보에서 제외
        player.clearT += dt;
        if (player.clearT >= CHAR_CONFIG.STAGE_CLEAR_DELAY) {
            const st = window.sweepStage;
            let next = st.index;
            if (st.count > 1) {
                while (next === st.index) next = Math.floor(Math.random() * st.count);
            }
            pendingStageIndex = next;
            fadePhase = 'out';
            fadeT = 0;
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
    } else if (walkImg && walkImg.naturalWidth > 0) {
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

    // 술집주인은 플레이어보다 아래(남쪽) 칸이라 톱다운 원근상 플레이어를 가리는 쪽이
    // 맞다 — 항상 플레이어 다음에 그린다. 매 프레임 그려야 하므로 위 분기들은
    // early return 없이 여기로 흘러와야 한다 (return으로 빠지면 깜빡임).
    drawMaster(ctx);
}

function drawMaster(ctx) {
    if (!masterVisible || !masterImg || !masterImg.naturalWidth) return;
    const r = masterRect();
    ctx.drawImage(masterImg, masterFrame * r.width, 0, r.width, r.height,
        Math.floor(r.x), Math.floor(r.y), r.width, r.height);
}

function playerOnAction(actionType, count = Infinity) {
    // 트리거 메뉴 액션 (미니게임에서는 리셋만)
    player.state = 'idle';
    Object.keys(keys).forEach(k => keys[k] = false);
}

window.sweepGetStepCount = function () { return player.stepCount; };

// ===== 대사 (엔진 말풍선 재활용) =====
// window.sweepSay(text, speaker): index와 같은 말풍선을 띄운다.
//   speaker: 'master'면 문 앞 술집주인 머리 위에, 생략/그 외엔 아타호 머리 위에.
let bubbleAnchorMaster = false;

window.getBubbleAnchor = function () {
    if (!bubbleAnchorMaster || !masterVisible) return null;   // null이면 엔진이 플레이어에 붙임
    return masterAnchorRect();
};

window.sweepSay = function (text, speaker) {
    bubbleAnchorMaster = (speaker === 'master');
    showResultBubble(text);
};
