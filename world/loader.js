/**
 * loader_example.js
 * 
 * Interactive Map Viewer
 * - 2x Scale
 * - Camera tracking
 * - Player movement
 */

// Configuration
// Configuration Defaults
let CONFIG = {
    TILE_SIZE: 16,
    SCALE: 2,
    MOVEMENT_SPEED: 240, // pixels per second
    ANIMATION_SPEED: 0.1, // seconds per frame (approx 6-7 fps)
    MAP_ANIM_DEFAULT_SPEED: 0.2, // seconds per frame
    COLLISION_PADDING_X: 8,
    COLLISION_PADDING_Y: 0,
    CEILING_RENDER: {
        RANGE_TOP: 16,
        RANGE_BOTTOM: 32,
        RANGE_LEFT: 16,
        RANGE_RIGHT: 16
    },
    PATHS: {
        TILESET: '',
        CEILING_TILESET: '',
        ANIMATION: '',
        CHAR: '',
        IDLE: '',
        EAT: '',
        DRUNK: ''
    },
    IDLE_START_TIME: 4, // seconds before sitting
    DRUNK_DURATION: 10, // persistent drunk state duration
    HICCUP_MIN_INTERVAL: 1.0,
    HICCUP_MAX_INTERVAL: 3.0,
    HICCUP_PULSE_DURATION: 0.3, // One loop (approx 2 frames * 0.15s)
    YAWN_MIN_INTERVAL: 4, // min seconds between yawns
    YAWN_MAX_INTERVAL: 8,   // max seconds between yawns
    YAWN_DURATION: 1.0,   // duration of yawn animation
    YAWN_COUNT_LIE_DOWN: 3, // Yawns before lying down
    LIE_DOWN_ANIM_SPEED: 1.0, // seconds per frame for breathing while lying
    SLEEP_BUBBLE_ANIM_SPEED: 0.15, // seconds per frame for bubble
    SLEEP_BUBBLE_OFFSET_X: 12, // X offset relative to sprite dstX
    SLEEP_BUBBLE_OFFSET_Y: 0,   // Y offset relative to sprite dstY

    // UI Config
    SPEECH_BUBBLE_OFFSET_Y: -100 // Global offset for speech bubble (from player top)
};

let tilesetImg;
let ceilingTilesetImg;
let charImg;
let idleImg;
let eatImg;
let drunkImg;
let mapData = [];
let tileGrid = []; // Spatial Index
let mapObjects = [];
let mapCollisions = new Set();
let mapWidth = 0;
let mapHeight = 0;

const player = {
    x: 100,
    y: 100,
    width: 16,
    height: 16,
    color: 'red',
    direction: 0,
    animFrame: 0,
    isMoving: false,
    stepTimer: 0,
    idleTimer: 0,
    yawnTimer: 0,
    currentYawnInterval: 6, // Initial random value
    isIdle: false,
    isYawning: false,
    isLyingDown: false,
    yawnFrame: 0,
    yawnCount: 0,
    lieDownFrame: 0,
    lieDownTimer: 0,
    bubbleFrame: 0,
    bubbleTimer: 0,
    isEating: false,
    isDrinking: false,
    animTimer: 0,
    animFrame: 0,
    animRemaining: Infinity,
    lastAnimLoopIdx: 0,
    drinkCount: 0,
    isDrunk: false,
    drunkTimer: 0,
    isHiccuping: false,
    hiccupPulseTimer: 0,
    hiccupIntervalTimer: 0,
    lastBubbleTime: 0,
    lastAutoTriggerId: null, // To prevent re-triggering same tile
    debugMode: false,
    pendingMenuTrigger: null // For sequential Dialog -> Menu flow
};

// Helper: Get random yawn interval
function getNextYawnInterval() {
    return CONFIG.YAWN_MIN_INTERVAL + Math.random() * (CONFIG.YAWN_MAX_INTERVAL - CONFIG.YAWN_MIN_INTERVAL);
}

const WALK_SEQUENCE = [0, 1, 2, 1, 0, 3, 4, 3];
const YAWN_SEQUENCE = [0, 1, 2, 3, 2, 1]; // Sequence for yawning frames
const LIE_DOWN_SEQUENCE = [0, 1, 2, 1]; // Sequence for breathing while lying down
const BUBBLE_SEQUENCE = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]; // 7 frames for sleeping bubble
const EAT_SEQUENCE = [0, 1, 2, 3, 2, 1, 0];
const DRINK_SEQUENCE = [4, 5, 6, 7, 7, 6, 5, 4];
const HICCUP_SEQUENCE = [0, 1];

const camera = {
    x: 0,
    y: 0,
    width: 0,
    height: 0
};

const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    w: false,
    s: false,
    a: false,
    d: false
};

const touchInput = {
    active: false,
    dx: 0,
    dy: 0,
    originX: 0,
    originY: 0
};

let lastTrigger = null;
let isTouchDevice = false;

// Initialize
let triggers = [];
let activeTrigger = null;

let isModalOpen = false;
let isBubbleOpen = false; // Separate flag for bubble to allow movement
let lastTime = 0;
let bubbleTimeout = null; // Timer for speech bubble auto-close

// Initialize
async function initGame() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("Canvas element 'gameCanvas' not found!");
        return;
    }
    ctx = canvas.getContext('2d');

    // Disable smoothing for pixel art
    ctx.imageSmoothingEnabled = false;

    // Load Map Configuration
    // Helper to resolve paths relative to the specific map folder
    const resolvePath = (path) => {
        // Get map name from URL or default to 'cave'
        const urlParams = new URLSearchParams(window.location.search);
        const mapName = window.MAP_NAME || urlParams.get('map') || 'cave';

        // Determine base path to the map folder based on current page location
        let mapBase = '';
        // Check if running from world/viewer.html or world/editor.html (if it used this)
        if (window.location.pathname.indexOf('/world/') !== -1 && window.location.pathname.indexOf('/world/maps/') === -1) {
            mapBase = `maps/${mapName}/`;
        } else {
            // Assumes running from root
            mapBase = `world/maps/${mapName}/`;
        }

        // Combine base and path
        return mapBase + path;
    };

    if (window.MAP_DATA) {
        // Assets
        if (window.MAP_DATA.assets) {
            CONFIG.PATHS.TILESET = resolvePath(window.MAP_DATA.assets.tileset || '');
            CONFIG.PATHS.CEILING_TILESET = resolvePath(window.MAP_DATA.assets.ceilingTileset || '');
            CONFIG.PATHS.ANIMATION = resolvePath(window.MAP_DATA.assets.animation || '');
            CONFIG.PATHS.CHAR = resolvePath(window.MAP_DATA.assets.character || '');
            CONFIG.PATHS.IDLE = resolvePath("../../char/ataho-idle.png"); // Hardcoded for now based on file list
            CONFIG.PATHS.EAT = resolvePath("../../char/ataho-eat.png");
            CONFIG.PATHS.DRUNK = resolvePath("../../char/ataho-drunk.png");
        }

        // Map Data
        mapData = window.MAP_DATA.tiles || [];


        // Collisions
        if (window.MAP_DATA.collisions) {
            window.MAP_DATA.collisions.forEach(col => {
                mapCollisions.add(`${col.x},${col.y}`);
            });
        }

        // Let's rewrite the trigger mapping block AND the object extraction block together
        // Triggers
        if (window.MAP_DATA.triggers) {
            triggers = window.MAP_DATA.triggers.map(t => {
                const height = t.h || 1;
                // 'sprite'가 있는 경우에만 y좌표를 위로 보정 (anchor-to-top logic)
                // 'sprite'가 없는 타일 기반 트리거는 y를 상단 시작점으로 간주
                const yShift = t.sprite ? (height - 1) : 0;

                return {
                    x: t.x * CONFIG.TILE_SIZE,
                    y: (t.y - yShift) * CONFIG.TILE_SIZE,
                    anchorY: t.y * CONFIG.TILE_SIZE,
                    w: (t.w || 1) * CONFIG.TILE_SIZE,
                    h: height * CONFIG.TILE_SIZE,
                    targetId: t.targetId,
                    title: t.title,
                    id: t.id,
                    type: t.type,
                    text: t.text,
                    bubbleOffsetY: t.bubbleOffsetY,
                    items: t.items,
                    sprite: t.sprite,
                    collision: t.collision
                };
            });

            // Apply Collision for Triggers
            triggers.forEach(t => {
                // Collision Logic:
                // 1. If 'collision' is explicitly set, use it.
                // 2. If 'sprite' is present, default to true.
                // 3. Otherwise default to false.
                let hasCollision = false;
                if (t.collision !== undefined) {
                    hasCollision = t.collision;
                } else if (t.sprite) {
                    hasCollision = true;
                }

                if (hasCollision) {
                    const gw = t.w / CONFIG.TILE_SIZE;
                    const gh = t.h / CONFIG.TILE_SIZE;
                    const gx = t.x / CONFIG.TILE_SIZE;
                    const gy = t.y / CONFIG.TILE_SIZE; // Use shifted top coordinate

                    for (let dy = 0; dy < gh; dy++) {
                        for (let dx = 0; dx < gw; dx++) {
                            mapCollisions.add(`${gx + dx},${gy + dy}`);
                        }
                    }
                }
            });

            // Create objects from triggers
            mapObjects = triggers.filter(t => t.sprite).map(t => {
                const triggerSource = window.MAP_DATA.triggers.find(orig => orig.id === t.id && orig.x * CONFIG.TILE_SIZE === t.x && orig.y * CONFIG.TILE_SIZE === t.anchorY) || {};
                return {
                    x: t.x,
                    y: t.y, // shifted top
                    h: t.h, // box height
                    src: resolvePath(t.sprite),
                    img: null,
                    width: 0,
                    height: 0,
                    // Animation Props
                    frames: triggerSource.frames || 0,
                    speed: triggerSource.speed || 0,
                    animW: triggerSource.animW || 0,
                    animH: triggerSource.animH || 0
                };
            });
        }
    } else {
        console.warn("No MAP_DATA found in window");
        return;
    }

    // Apply CSS scaling
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.imageRendering = 'pixelated';

    // Handle Input
    window.addEventListener('keydown', e => {
        if (isModalOpen) {
            if (e.key === 'Escape') closeModal();
            if (e.key === 'ArrowUp') handleModalNav(-1);
            if (e.key === 'ArrowDown') handleModalNav(1);
            if (e.key === 'Enter' || e.key === ' ') handleModalAction();
            return;
        }

        if (keys.hasOwnProperty(e.key)) {
            keys[e.key] = true;
            if (!player.debugMode) player.idleTimer = 0;
        }
        if (e.code === 'Space' || e.key === 'Enter') {
            if (isBubbleOpen) {
                // Grace period to prevent immediate closing from the same keypress
                if (performance.now() - player.lastBubbleTime > 200) {
                    closeModal();
                }
            } else if (activeTrigger && e.code === 'Space') {
                // For Space only, trigger openModal (Enter is usually for links only)
                openModal(activeTrigger);
            }
        }
    });

    window.addEventListener('keyup', e => {
        if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
    });

    // Handle Touch
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Detect generic touch support
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        isTouchDevice = true;
    }

    // Detect generic touch support
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        isTouchDevice = true;
    }

    // Handle Resize
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // 1. Load Tileset
    if (CONFIG.PATHS.TILESET) {
        tilesetImg = new Image();
        tilesetImg.src = CONFIG.PATHS.TILESET;
        await new Promise((resolve, reject) => {
            tilesetImg.onload = resolve;
            tilesetImg.onerror = reject;
        });
    }

    // 1.1 Load Ceiling Tileset
    if (CONFIG.PATHS.CEILING_TILESET) {
        ceilingTilesetImg = new Image();
        ceilingTilesetImg.src = CONFIG.PATHS.CEILING_TILESET;
        await new Promise((resolve, reject) => {
            ceilingTilesetImg.onload = resolve;
            ceilingTilesetImg.onerror = () => { console.warn("Ceiling load failed"); resolve(); };
        });
    }


    // 1.6 Load Character
    if (CONFIG.PATHS.CHAR) {
        charImg = new Image();
        charImg.src = CONFIG.PATHS.CHAR;
        await new Promise((resolve, reject) => {
            charImg.onload = resolve;
            charImg.onerror = () => { console.warn("Char load failed"); resolve(); };
        });
    }

    // 1.7 Load Idle Sprite
    if (CONFIG.PATHS.IDLE) {
        idleImg = new Image();
        idleImg.src = CONFIG.PATHS.IDLE;
        await new Promise((resolve, reject) => {
            idleImg.onload = resolve;
            idleImg.onerror = () => { console.warn("Idle load failed"); resolve(); };
        });
    }

    // 1.8 Load Eat/Drink Sprite
    if (CONFIG.PATHS.EAT) {
        eatImg = new Image();
        eatImg.src = CONFIG.PATHS.EAT;
        await new Promise((resolve, reject) => {
            eatImg.onload = resolve;
            eatImg.onerror = () => { console.warn("Eat load failed"); resolve(); };
        });
    }

    // 1.8.1 Load Drunk Sprite
    if (CONFIG.PATHS.DRUNK) {
        drunkImg = new Image();
        drunkImg.src = CONFIG.PATHS.DRUNK;
        await new Promise((resolve) => {
            drunkImg.onload = resolve;
            drunkImg.onerror = () => { console.warn("Drunk load failed"); resolve(); };
        });
    }

    // 1.9 Load Object Images
    if (mapObjects.length > 0) {
        await Promise.all(mapObjects.map(obj => new Promise((resolve) => {
            const img = new Image();
            img.src = obj.src;
            img.onload = () => {
                obj.img = img;
                obj.width = img.width;
                obj.height = img.height;
                resolve();
            };
            img.onerror = () => {
                console.warn("Failed to load object image:", obj.src);
                resolve();
            };
        })));
    }

    console.log("Map Loaded:", mapData.length, "tiles");

    // Inject UI (Prompt, Modal, Speech Bubble)
    injectUI();

    // Calculate Map Bounds
    let maxGx = 0;
    let maxGy = 0;
    mapData.forEach(t => {
        if (t.gx > maxGx) maxGx = t.gx;
        if (t.gy > maxGy) maxGy = t.gy;
    });
    mapWidth = (maxGx + 1) * CONFIG.TILE_SIZE;
    mapHeight = (maxGy + 1) * CONFIG.TILE_SIZE;

    // Build Spatial Grid for O(1) Rendering
    const cols = maxGx + 1;
    const rows = maxGy + 1;
    tileGrid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []));

    mapData.forEach(t => {
        if (t.gx >= 0 && t.gx < cols && t.gy >= 0 && t.gy < rows) {
            tileGrid[t.gy][t.gx].push(t);
        }
    });

    // Set initial player position (e.g., center of map or specific start)
    player.x = mapWidth / 2;
    player.y = mapHeight / 2;

    // Start Loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);

    console.log("Game initialized!");
}

/**
 * 게임에 필요한 UI 요소(상호작용 프롬프트, 모달, 말풍선)를 동적으로 주입합니다.
 */
function injectUI() {
    // 1. UI Layer
    if (!document.getElementById('ui-layer')) {
        const uiLayer = document.createElement('div');
        uiLayer.id = 'ui-layer';
        document.body.appendChild(uiLayer);
    }
    const uiLayer = document.getElementById('ui-layer');

    // 2. Interaction Prompt
    if (!document.getElementById('interaction-prompt')) {
        const prompt = document.createElement('div');
        prompt.id = 'interaction-prompt';
        prompt.className = 'prompt hidden';
        prompt.textContent = 'Space를 누르세요.';
        uiLayer.appendChild(prompt);
    }

    // 3. Dynamic Modal
    if (!document.getElementById('dynamic-modal')) {
        const modal = document.createElement('div');
        modal.id = 'dynamic-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h2 id="modal-title"></h2>
                <ul id="modal-list"></ul>
            </div>
        `;
        uiLayer.appendChild(modal);

        // Bind closeModal to close button
        const closeBtn = modal.querySelector('.close-modal');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    // 4. Speech Bubble
    if (!document.getElementById('speech-bubble')) {
        const bubble = document.createElement('div');
        bubble.id = 'speech-bubble';
        bubble.className = 'hidden';
        document.body.appendChild(bubble);
    }
}

/**
 * 트리거 데이터를 기반으로 동적 모달을 생성하고 엽니다.
 * skipDialogue: true면 대사(text)가 있어도 건너뛰고 바로 메뉴를 엽니다.
 */
function openModal(trigger, skipDialogue = false) {
    // Handle Dialog/Menu Sequential Logic or Direct Dialog
    if (!skipDialogue && (trigger.type === 'dialog' || (trigger.type === 'menu' && trigger.text))) {
        showSpeechBubble(trigger.text, trigger.bubbleOffsetY, trigger);

        // If it's a menu trigger, queue the modal to open after bubble closes
        if (trigger.type === 'menu') {
            player.pendingMenuTrigger = trigger;
        } else {
            player.pendingMenuTrigger = null;
        }
        return;
    }

    // Default: Menu Modal
    const modal = document.getElementById('dynamic-modal');
    if (!modal || !trigger) return;

    // 제목 설정 (없으면 숨김)
    const titleEl = document.getElementById('modal-title');
    if (titleEl) {
        if (trigger.title) {
            titleEl.textContent = trigger.title;
            titleEl.style.display = 'block';
        } else {
            titleEl.style.display = 'none';
        }
    }

    const listEl = document.getElementById('modal-list');
    if (listEl) {
        listEl.innerHTML = '';

        if (trigger.items) {
            trigger.items.forEach(item => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = item.href || '#';
                a.textContent = item.label || item.text || ''; // Support new 'label' and fallback to 'text' for compatibility

                // 데이터 속성 복사 (라이트박스 캡션, 자막 등)
                if (item.data) {
                    for (const [key, val] of Object.entries(item.data)) {
                        a.setAttribute(`data-${key}`, val);
                    }
                }

                // 타겟 속성 설정 (새 창 열기 등)
                if (item.target) {
                    a.setAttribute('target', item.target);
                    // 보안 및 성능을 위한 rel 추가
                    if (item.target === '_blank') {
                        a.setAttribute('rel', 'noopener noreferrer');
                    }
                }

                // 내부 링크(해시) 클릭 시 모달 닫기 (라이트박스 연동용)
                // 단, 커스텀 액션이나 텍스트가 설정된 경우 해당 핸들러에서 처리하도록 제외
                if (a.href.includes('#') && !item.action && !item.text) {
                    a.addEventListener('click', () => {
                        setTimeout(closeModal, 10);
                    });
                }

                li.appendChild(a);
                listEl.appendChild(li);

                // Handle custom actions
                if (item.action) {
                    a.addEventListener('click', (e) => {
                        e.preventDefault();
                        handleAction(item.action, item.count);
                        closeModal();
                    });
                }

                // Handle dialogue text
                if (item.text) {
                    a.addEventListener('click', (e) => {
                        e.preventDefault();
                        closeModal();
                        showSpeechBubble(item.text, trigger.bubbleOffsetY);
                    });
                }
            });
        }
    }

    modal.classList.remove('hidden');
    isModalOpen = true;
    player.lastBubbleTime = performance.now(); // Initialize grace period for Move-to-Close logic

    // 플레이어 이동 정지 및 모든 이동 키 리셋 (WASD 포함)
    Object.keys(keys).forEach(k => keys[k] = false);
    player.isMoving = false;

    // 모달 내부 첫 번째 아이템으로 포커스 이동
    resetModalFocus(modal);
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.modal a').forEach(a => a.classList.remove('focused')); // Clear focus

    // Hide Speech Bubble
    hideSpeechBubble(true); // skipPending check here as we handle it below

    isModalOpen = false;

    // After closing bubble or modal, if there's a pending menu, open it
    if (player.pendingMenuTrigger) {
        const trig = player.pendingMenuTrigger;
        player.pendingMenuTrigger = null; // Clear first to avoid loop
        openModal(trig, true);
    }
}

/**
 * 말풍선을 표시합니다.
 * @param {string|string[]} text - 표시할 텍스트 (배열일 경우 순차 출력)
 * @param {number} offsetY - Y축 오프셋
 * @param {object} trigger - (선택) 트리거 객체 (대사 인덱스 관리용)
 */
function showSpeechBubble(text, offsetY = 0, trigger = null) {
    const bubble = document.getElementById('speech-bubble');
    if (!bubble) return;

    let textContent = text;

    // Handle Array Text (Alternating)
    if (Array.isArray(text)) {
        if (trigger) {
            if (typeof trigger.dialogIndex === 'undefined') {
                trigger.dialogIndex = 0;
            }
            textContent = text[trigger.dialogIndex];
            trigger.dialogIndex = (trigger.dialogIndex + 1) % text.length;
        } else {
            // If no trigger context, just show first or random? 
            // Let's stick to first for simple items.
            textContent = text[0];
        }
    }

    bubble.textContent = textContent || '';
    bubble.dataset.offsetY = offsetY || 0;
    bubble.classList.remove('hidden');
    isBubbleOpen = true;
    player.lastBubbleTime = performance.now();

    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    bubbleTimeout = setTimeout(hideSpeechBubble, 3000);
}

/**
 * 말풍선을 숨깁니다.
 * @param {boolean} skipPending - true면 대기 중인 메뉴를 열지 않습니다.
 */
function hideSpeechBubble(skipPending = false) {
    const bubble = document.getElementById('speech-bubble');
    if (bubble) bubble.classList.add('hidden');

    if (bubbleTimeout) {
        clearTimeout(bubbleTimeout);
        bubbleTimeout = null;
    }
    isBubbleOpen = false;

    // 말풍선이 자연스럽게 닫혔을 때(타이머 등), 대기 중인 메뉴가 있다면 레이어링을 위해 closeModal 호출
    if (!skipPending && player.pendingMenuTrigger) {
        closeModal();
    }
}

function resetModalFocus(modal) {
    const links = modal.querySelectorAll('a');
    links.forEach(l => l.classList.remove('focused'));
    if (links.length > 0) {
        links[0].classList.add('focused');
        focusedLinkIndex = 0;
    } else {
        focusedLinkIndex = -1;
    }
}

/**
 * 전역 액션(애니메이션 상태)을 처리합니다.
 * 'eat', 'drink' 등은 사용자가 움직이기 전까지 루프 애니메이션을 유지합니다.
 * 'sit', 'lie', 'yawn'은 아타호의 기존 idle 로직을 강제로 트리거합니다.
 * 
 * @param {string} actionType - 'eat', 'drink', 'sit', 'lie', 'yawn'
 * @param {number} count - (선택) 애니메이션 반복 횟수 (기본값: Infinity)
 */
function handleAction(actionType, count = Infinity) {
    player.isEating = false;
    player.isDrinking = false;

    // 플레이어 이동 정지 및 모든 이동 키 리셋 (WASD 포함)
    Object.keys(keys).forEach(k => keys[k] = false);
    player.isMoving = false;

    // Reset core idle states first to allow clean override
    player.isIdle = false;
    player.isYawning = false;
    player.isLyingDown = false;

    if (actionType === 'eat') {
        player.isEating = true;
        player.idleTimer = 0;
    } else if (actionType === 'drink') {
        player.isDrinking = true;
        player.idleTimer = 0;
        player.drinkCount++;
        // Hiccup trigger moved to loop completion in update()
    } else if (actionType === 'sit') {
        player.isIdle = true;
        player.idleTimer = CONFIG.IDLE_START_TIME;
    } else if (actionType === 'lie') {
        player.isIdle = true;
        player.isLyingDown = true;
        player.yawnCount = CONFIG.YAWN_COUNT_LIE_DOWN;
        player.idleTimer = CONFIG.IDLE_START_TIME;
    } else if (actionType === 'yawn') {
        player.isIdle = true;
        player.isYawning = true;
        player.yawnFrame = 0;
        player.yawnTimer = player.currentYawnInterval;
        player.idleTimer = CONFIG.IDLE_START_TIME;
    } else {
        player.idleTimer = 0;
    }

    player.animTimer = 0;
    player.animFrame = 0;
    player.lastAnimLoopIdx = 0;
    player.animRemaining = count || Infinity;

    console.log("State Changed:", actionType);
}

let focusedLinkIndex = -1;

function handleModalNav(direction) {
    // Find active modal
    const modal = document.querySelector('.modal:not(.hidden)');
    if (!modal) return;

    const links = Array.from(modal.querySelectorAll('a'));
    if (links.length === 0) return;

    // Clear current
    links.forEach(l => l.classList.remove('focused'));

    // Update index
    focusedLinkIndex += direction;
    if (focusedLinkIndex >= links.length) focusedLinkIndex = 0;
    if (focusedLinkIndex < 0) focusedLinkIndex = links.length - 1;

    // Set focus
    links[focusedLinkIndex].classList.add('focused');
}

function handleModalAction() {
    const modal = document.querySelector('.modal:not(.hidden)');
    if (!modal) return;
    const links = Array.from(modal.querySelectorAll('a'));
    if (focusedLinkIndex >= 0 && focusedLinkIndex < links.length) {
        links[focusedLinkIndex].click();
    }
}

function resizeCanvas() {
    // Set internal resolution to 1x (viewport / scale)
    canvas.width = Math.ceil(window.innerWidth / CONFIG.SCALE);
    canvas.height = Math.ceil(window.innerHeight / CONFIG.SCALE);

    camera.width = canvas.width;
    camera.height = canvas.height;

    // Context settings reset on resize
    if (ctx) ctx.imageSmoothingEnabled = false;
}

function handleTouchStart(e) {
    if (e.target !== canvas) return;
    e.preventDefault();
    touchInput.active = true;
    if (!player.debugMode) player.idleTimer = 0;
    updateTouchInput(e.touches[0]);
}

function handleTouchMove(e) {
    if (e.target !== canvas) return;
    e.preventDefault();
    if (touchInput.active) {
        updateTouchInput(e.touches[0]);
    }
}

/**
 * 터치 종료 이벤트를 처리합니다.
 * 1. 이동 정보를 초기화합니다.
 * 2. 모달이 닫혀 있고 activeTrigger(인접한 트리거)가 있을 때, 
 *    터치 지점이 트리거 영역 내부라면 모달을 엽니다. (Touch-to-Activate)
 */
function handleTouchEnd(e) {
    if (e.target !== canvas) return;
    e.preventDefault();

    // If it was a quick tap (not moving much), check for trigger activation
    if (touchInput.active && !isModalOpen) {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const touchX = (touch.clientX - rect.left) * scaleX + camera.x;
        const touchY = (touch.clientY - rect.top) * scaleY + camera.y;

        // Check if tap was on activeTrigger
        if (activeTrigger) {
            if (touchX >= activeTrigger.x && touchX <= activeTrigger.x + activeTrigger.w &&
                touchY >= activeTrigger.y && touchY <= activeTrigger.y + activeTrigger.h) {
                openModal(activeTrigger);
            }
        }
    }

    touchInput.active = false;
    touchInput.dx = 0;
    touchInput.dy = 0;
}

function updateTouchInput(touch) {
    // Calculate direction relative to screen center (which is where player is approximately)
    // Calculate direction relative to Player's Screen Position

    // 1. Get Player Center in Internal Canvas Coordinates
    // player.x/y are world coordinates. camera.x/y are world coordinates of top-left view.
    const pCanvasX = player.x + player.width / 2 - camera.x;
    const pCanvasY = player.y + player.height / 2 - camera.y;

    // 2. Map Touch to Internal Canvas Coordinates
    const rect = canvas.getBoundingClientRect();
    // Scale factor between CSS pixels (Display) and Internal pixels
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const touchInternalX = (touch.clientX - rect.left) * scaleX;
    const touchInternalY = (touch.clientY - rect.top) * scaleY;

    // 3. Vector from Player to Touch
    let tx = touchInternalX - pCanvasX;
    let ty = touchInternalY - pCanvasY;

    // Normalize
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len > 10) { // Deadzone in internal pixels
        touchInput.dx = tx / len;
        touchInput.dy = ty / len;
    } else {
        touchInput.dx = 0;
        touchInput.dy = 0;
    }
}

function update(dt) {
    // Player Movement
    let dx = 0;
    let dy = 0;

    if (keys.ArrowUp || keys.w) { dy -= 1; player.direction = 2; }
    if (keys.ArrowDown || keys.s) { dy += 1; player.direction = 0; }
    if (keys.ArrowLeft || keys.a) { dx -= 1; player.direction = 1; }
    if (keys.ArrowRight || keys.d) { dx += 1; player.direction = 3; }

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
        const factor = Math.SQRT1_2; // 1 / sqrt(2) approx 0.707
        dx *= factor;
        dy *= factor;
    }

    // Touch Input Overlay (if active)
    if (touchInput.active) {
        // If touch is active, it overrides or adds to keyboard? 
        // Let's have touch take priority if active, or just add.
        // Adding allows testing both.
        // But usually touch direction is normalized vector.

        // Update direction enum based on predominant touch axis
        if (Math.abs(touchInput.dx) > Math.abs(touchInput.dy)) {
            player.direction = touchInput.dx > 0 ? 3 : 1;
        } else {
            player.direction = touchInput.dy > 0 ? 0 : 2;
        }

        dx = touchInput.dx;
        dy = touchInput.dy;
    }

    // Apply Speed
    dx *= CONFIG.MOVEMENT_SPEED * dt;
    dy *= CONFIG.MOVEMENT_SPEED * dt;

    // Custom State Animation Logic
    if (player.isEating || player.isDrinking) {
        player.animTimer += dt;
        const sequence = player.isEating ? EAT_SEQUENCE : DRINK_SEQUENCE;
        const frameTime = 0.15;

        const totalFramesPassed = Math.floor(player.animTimer / frameTime);
        const currentLoopIdx = Math.floor(totalFramesPassed / sequence.length);

        if (player.isEating || player.isDrinking) {
            player.animFrame = totalFramesPassed % sequence.length;
        }

        // Loop Completion Detection (for count-based termination & Drunk trigger)
        if (currentLoopIdx > player.lastAnimLoopIdx) {
            if (player.isDrinking && player.drinkCount >= 3) {
                player.isDrunk = true;
                player.drunkTimer = CONFIG.DRUNK_DURATION;
                console.log("Status: DRUNK. Persistent for", CONFIG.DRUNK_DURATION, "s");
            }

            if (player.animRemaining !== Infinity) {
                player.animRemaining--;
                if (player.animRemaining <= 0) {
                    player.isEating = false;
                    player.isDrinking = false;
                    player.animRemaining = Infinity;
                }
            }
            player.lastAnimLoopIdx = currentLoopIdx;
        }
    }

    // Drunk State Timer Logic (Independent of actions)
    if (player.isDrunk) {
        player.drunkTimer -= dt;
        if (player.drunkTimer <= 0) {
            player.isDrunk = false;
            player.drinkCount = 0;
            player.isHiccuping = false;
            console.log("Status: SOBRE.");
        }
    }

    player.isMoving = (dx !== 0 || dy !== 0);

    // If moving and bubble or modal is open, close it (Move-to-Close)
    // Add grace period to prevent immediate closing if moving while/after interaction
    if (player.isMoving && (isBubbleOpen || isModalOpen) && performance.now() - player.lastBubbleTime > 500) {
        closeModal();
    }

    // Idle Logic
    if (player.isMoving) {
        player.idleTimer = 0;
        player.yawnTimer = 0;
        player.yawnCount = 0;
        player.isIdle = false;
        player.isYawning = false;
        player.isLyingDown = false;
        player.isEating = false;
        player.isDrinking = false;
        // player.isHiccuping = false; // PERSISTENT
        // player.drinkCount = 0;      // PERSISTENT
        player.lieDownTimer = 0;

        player.stepTimer += dt;
        if (player.stepTimer >= CONFIG.ANIMATION_SPEED) {
            player.stepTimer = 0;
            player.animFrame = (player.animFrame + 1) % WALK_SEQUENCE.length;
        }
    } else {
        if (!player.isEating && !player.isDrinking && !player.isHiccuping) {
            player.animFrame = 0; // Reset to standing
        }
        player.stepTimer = 0;

        // If Drunk and Idle, force Intermittent Hiccuping (딸꾹)
        if (player.isDrunk && !player.isEating && !player.isDrinking) {
            player.isIdle = false; // Bypass normal sit
            player.isYawning = false;
            player.isLyingDown = false;

            player.idleTimer += dt;

            // Only start timing hiccups after a short initial idle delay
            if (player.idleTimer >= 0.5) {
                if (!player.isHiccuping) {
                    player.hiccupIntervalTimer -= dt;
                    if (player.hiccupIntervalTimer <= 0) {
                        player.isHiccuping = true;
                        player.hiccupPulseTimer = CONFIG.HICCUP_PULSE_DURATION;
                        player.animTimer = 0; // Reset pulse animation
                    }
                } else {
                    player.hiccupPulseTimer -= dt;
                    if (player.hiccupPulseTimer <= 0) {
                        player.isHiccuping = false;
                        // Reset interval to random
                        player.hiccupIntervalTimer = CONFIG.HICCUP_MIN_INTERVAL + Math.random() * (CONFIG.HICCUP_MAX_INTERVAL - CONFIG.HICCUP_MIN_INTERVAL);
                    } else {
                        // Play hiccup animation during pulse
                        const sequence = HICCUP_SEQUENCE;
                        const frameTime = 0.15;
                        player.animFrame = Math.floor((CONFIG.HICCUP_PULSE_DURATION - player.hiccupPulseTimer) / frameTime) % sequence.length;
                    }
                }
            }
            return; // Skip normal idle logic
        }

        player.isHiccuping = false;
        player.hiccupIntervalTimer = 0; // Reset

        // Only increment idle timer if no modal/dialog is open
        if (!isModalOpen && !isBubbleOpen) {
            player.idleTimer += dt;
        } else {
            // Reset idle if modal opens? Or just pause?
            // "Prevent sitting while dialog is displayed" -> Pause or Reset.
            // If we just pause, they might sit immediately after.
            // Resetting is safer to prevent awkward jumps.
            player.idleTimer = 0;
            player.isIdle = false;
        }

        if (player.idleTimer >= CONFIG.IDLE_START_TIME) {
            if (!player.isIdle) {
                player.isIdle = true;
                player.currentYawnInterval = getNextYawnInterval(); // Randomize first yawn
            }

            if (player.isLyingDown) {
                // Animate breathing/sleeping
                player.lieDownTimer += dt;
                if (player.lieDownTimer >= CONFIG.LIE_DOWN_ANIM_SPEED) {
                    player.lieDownTimer = 0;
                    player.lieDownFrame = (player.lieDownFrame + 1) % LIE_DOWN_SEQUENCE.length;
                }

                // Animate Bubble
                player.bubbleTimer += dt;
                if (player.bubbleTimer >= CONFIG.SLEEP_BUBBLE_ANIM_SPEED) {
                    player.bubbleTimer = 0;
                    player.bubbleFrame = (player.bubbleFrame + 1) % BUBBLE_SEQUENCE.length;
                }
            } else {
                // Periodically Yawn or Lie Down
                player.yawnTimer += dt;
                if (player.isYawning) {
                    const totalYawnFrames = YAWN_SEQUENCE.length;
                    const frameTime = CONFIG.YAWN_DURATION / totalYawnFrames;
                    player.yawnFrame = Math.floor((player.yawnTimer - player.currentYawnInterval) / frameTime);

                    if (player.yawnFrame >= totalYawnFrames) {
                        player.isYawning = false;
                        player.yawnTimer = 0;
                        player.yawnCount++;
                        player.currentYawnInterval = getNextYawnInterval();
                    }
                } else if (player.yawnTimer >= player.currentYawnInterval) {
                    if (player.yawnCount >= CONFIG.YAWN_COUNT_LIE_DOWN) {
                        player.isLyingDown = true;
                    } else {
                        player.isYawning = true;
                        player.yawnFrame = 0;
                    }
                }
            }
        } else {
            player.isIdle = false;
            player.isYawning = false;
            player.isLyingDown = false;
            player.yawnCount = 0;
        }
    }

    // --- Idle Debug Commands ---
    window.skipToSitting = () => {
        player.idleTimer = CONFIG.IDLE_START_TIME;
        player.isMoving = false;
        console.log("Idle: Skipped to Sitting");
    };

    window.skipToLying = () => {
        player.idleTimer = CONFIG.IDLE_START_TIME;
        player.yawnCount = CONFIG.YAWN_COUNT_LIE_DOWN;
        player.isMoving = false;
        player.yawnTimer = player.currentYawnInterval; // Trigger next interval check
        console.log("Idle: Skipped to Lying Down");
    };

    window.toggleIdleDebug = () => {
        player.debugMode = !player.debugMode;
        console.log("Idle Debug Mode:", player.debugMode ? "ON (Input won't reset idle)" : "OFF");
    };

    const padX = CONFIG.COLLISION_PADDING_X || 0;
    const padY = CONFIG.COLLISION_PADDING_Y || 0;


    // Try Move X
    let nextX = player.x + dx;
    // Inflate Collision Box by padding
    if (!checkCollision(nextX - padX, player.y - padY, player.width + padX * 2, player.height + padY * 2)) {
        player.x = nextX;
    }

    // Try Move Y
    let nextY = player.y + dy;
    if (!checkCollision(player.x - padX, nextY - padY, player.width + padX * 2, player.height + padY * 2)) {
        player.y = nextY;
    }

    // Clamp Player to Map
    // Player size is unscaled pixels internally or scaled? 
    // Let's treat player.x/y as world coordinates in CONFIG.SCALED space for simplicity with scrolling
    // Clamp Player to Map
    if (player.x < 0) player.x = 0;
    if (player.y < 0) player.y = 0;
    if (player.x > mapWidth - player.width) player.x = mapWidth - player.width;
    if (player.y > mapHeight - player.height) player.y = mapHeight - player.height;

    // Camera Follow
    // Center camera on player
    // Camera Follow
    // Center camera on player
    camera.x = player.x + (player.width) / 2 - camera.width / 2;
    camera.y = player.y + (player.height) / 2 - camera.height / 2;

    // Clamp Camera to Map
    // If map is smaller than canvas, center it? Or just clamp 0?
    // Let's standard clamp
    if (camera.x < 0) camera.x = 0;
    if (camera.y < 0) camera.y = 0;
    // Don't show black space if possible (unless map is smaller than screen)
    if (mapWidth > camera.width) {
        if (camera.x > mapWidth - camera.width) camera.x = mapWidth - camera.width;
    } else {
        camera.x = -(camera.width - mapWidth) / 2; // Center horizontally
    }

    if (mapHeight > camera.height) {
        if (camera.y > mapHeight - camera.height) camera.y = mapHeight - camera.height;
    } else {
        camera.y = -(camera.height - mapHeight) / 2; // Center vertically
    }

    checkTriggers();
}

function checkTriggers() {
    if (isModalOpen) return;

    // Simple point-in-rect for now, or center-in-rect
    const prevTrigger = activeTrigger;
    activeTrigger = null;

    // 플레이어 중앙 좌표 계산
    const pCx = player.x + player.width / 2;
    const pCy = player.y + player.height / 2;

    // 캐릭터의 현재 방향 정면으로 특정 거리(reach)만큼 떨어진 지점을 체크
    let targetX = pCx;
    let targetY = pCy;
    const reach = 20; // 상호작용 가능한 거리

    // 방향에 따른 타겟 지점 보정 (0:아래, 1:왼쪽, 2:위, 3:오른쪽)
    if (player.direction === 0) targetY += reach;
    else if (player.direction === 1) targetX -= reach;
    else if (player.direction === 2) targetY -= reach;
    else if (player.direction === 3) targetX += reach;

    // 정면의 타겟 지점이 트리거 영역 안에 있는지 검사
    activeTrigger = triggers.find(t =>
        targetX >= t.x && targetX <= t.x + t.w &&
        targetY >= t.y && targetY <= t.y + t.h
    );

    // Auto-Activation for Tile-type Triggers (No sprite)
    if (activeTrigger && !activeTrigger.sprite) {
        if (activeTrigger.id !== player.lastAutoTriggerId && !isModalOpen && !isBubbleOpen) {
            player.lastAutoTriggerId = activeTrigger.id;
            openModal(activeTrigger);
        }
    } else {
        // Reset auto-trigger when leaving the area
        // Note: We only reset if NOT currently in any sprite-less trigger
        player.lastAutoTriggerId = null;
    }

    lastTrigger = activeTrigger;

    const prompt = document.getElementById('interaction-prompt');
    if (activeTrigger && activeTrigger.sprite) {
        // Only show prompt for Object-type triggers (Manual)
        if (prompt && prompt.classList.contains('hidden')) {
            prompt.classList.remove('hidden');
        }
    } else {
        if (prompt && !prompt.classList.contains('hidden')) {
            prompt.classList.add('hidden');
        }
    }
}

function draw() {
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    // Draw Visible Tiles
    // Optimization: Only iterate if needed, but for small maps, full iteration is fine.
    // However, checking visibility bounds is better practice.

    // Viewport bounds in world space
    const viewL = camera.x;
    const viewR = camera.x + camera.width;
    const viewT = camera.y;
    const viewB = camera.y + camera.height;

    // Spatial Grid Iteration
    const startCol = Math.max(0, Math.floor(viewL / CONFIG.TILE_SIZE));

    // Determine grid dimensions safely
    const gridRows = tileGrid.length;
    const gridCols = gridRows > 0 ? tileGrid[0].length : 0;

    const endCol = Math.min(gridCols, Math.ceil(viewR / CONFIG.TILE_SIZE));
    const startRow = Math.max(0, Math.floor(viewT / CONFIG.TILE_SIZE));
    const endRow = Math.min(gridRows, Math.ceil(viewB / CONFIG.TILE_SIZE));

    for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
            const cell = tileGrid[y][x];
            for (let i = 0; i < cell.length; i++) {
                const tile = cell[i];
                ctx.drawImage(
                    tilesetImg,
                    tile.tx * CONFIG.TILE_SIZE, tile.ty * CONFIG.TILE_SIZE,
                    CONFIG.TILE_SIZE, CONFIG.TILE_SIZE,
                    tile.gx * CONFIG.TILE_SIZE, tile.gy * CONFIG.TILE_SIZE,
                    CONFIG.TILE_SIZE, CONFIG.TILE_SIZE
                );
            }
        }
    }


    // Draw Entities (Player + Objects) Ordered by Y (Bottom of sprite/collision box)
    const renderList = [];

    // 1. Add Player
    renderList.push({
        type: 'player',
        ySort: player.y + player.height // Bottom of player collision box
    });

    // 2. Add Visible Objects
    mapObjects.forEach(obj => {
        if (obj.img &&
            obj.x + obj.width > viewL && obj.x < viewR &&
            obj.y + obj.height > viewT && obj.y < viewB) {

            // Sorting Y is the bottom of the map tile the object sits on
            renderList.push({
                type: 'object',
                data: obj,
                ySort: obj.y + obj.h // Bottom of interaction box
            });
        }
    });

    // 3. Sort
    renderList.sort((a, b) => a.ySort - b.ySort);

    // 4. Draw
    renderList.forEach(item => {
        if (item.type === 'player') {
            drawPlayer(ctx);
        } else {
            const obj = item.data;
            const drawX = Math.floor(obj.x);
            // Visual position: bottom aligned with interaction box bottom
            const drawY = Math.floor(obj.y + obj.h - (obj.animH || obj.height));

            if (obj.frames > 1) {
                // Animated Object
                const now = performance.now() / 1000;
                const speedInSeconds = (obj.speed || 200) / 1000;
                const frameIndex = Math.floor(now / speedInSeconds) % obj.frames;
                const srcX = frameIndex * (obj.animW || obj.width);
                ctx.drawImage(obj.img, srcX, 0, (obj.animW || obj.width), (obj.animH || obj.height), drawX, drawY, (obj.animW || obj.width), (obj.animH || obj.height));
            } else {
                // Static Object
                ctx.drawImage(obj.img, drawX, drawY);
            }
        }
    });

    // Draw Ceiling Layer (Over Player)
    if (ceilingTilesetImg) {
        // Calculate Culling Bounds based on Player Position
        const cullL = player.x - CONFIG.CEILING_RENDER.RANGE_LEFT;
        const cullR = player.x + player.width + CONFIG.CEILING_RENDER.RANGE_RIGHT;
        const cullT = player.y - CONFIG.CEILING_RENDER.RANGE_TOP;
        const cullB = player.y + player.height + CONFIG.CEILING_RENDER.RANGE_BOTTOM;

        // Spatial Grid Iteration for Ceiling
        // Determine grid dimensions safely
        const gridRows = tileGrid.length;
        const gridCols = gridRows > 0 ? tileGrid[0].length : 0;

        const cStartCol = Math.max(0, Math.floor(cullL / CONFIG.TILE_SIZE));
        const cEndCol = Math.min(gridCols, Math.ceil(cullR / CONFIG.TILE_SIZE));
        const cStartRow = Math.max(0, Math.floor(cullT / CONFIG.TILE_SIZE));
        const cEndRow = Math.min(gridRows, Math.ceil(cullB / CONFIG.TILE_SIZE));

        for (let y = cStartRow; y < cEndRow; y++) {
            for (let x = cStartCol; x < cEndCol; x++) {
                const cell = tileGrid[y][x];
                for (let i = 0; i < cell.length; i++) {
                    const tile = cell[i];
                    ctx.drawImage(
                        ceilingTilesetImg,
                        tile.tx * CONFIG.TILE_SIZE, tile.ty * CONFIG.TILE_SIZE,
                        CONFIG.TILE_SIZE, CONFIG.TILE_SIZE,
                        tile.gx * CONFIG.TILE_SIZE, tile.gy * CONFIG.TILE_SIZE,
                        CONFIG.TILE_SIZE, CONFIG.TILE_SIZE
                    );
                }
            }
        }
    }

    // Update Modal/Speech Bubble Position
    const bubble = document.getElementById('speech-bubble');
    const modal = document.getElementById('dynamic-modal');

    if ((bubble && !bubble.classList.contains('hidden')) || (modal && !modal.classList.contains('hidden'))) {
        const target = (modal && !modal.classList.contains('hidden')) ? modal : bubble;

        // getBoundingClientRect for canvas
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;

        // Player Center relative to Camera Viewport
        const pViewX = player.x + player.width / 2 - camera.x;
        const pViewY = player.y - camera.y; // Top of player

        // Screen Coordinates
        const screenX = rect.left + pViewX * scaleX;
        const screenY = rect.top + pViewY * scaleY;

        // Position above player
        const globalOffset = CONFIG.SPEECH_BUBBLE_OFFSET_Y || -50;
        // For modal, we use the activeTrigger's offset if available, otherwise 0
        const customOffset = (target === modal && activeTrigger) ? (activeTrigger.bubbleOffsetY || 0) : (parseInt(target.dataset.offsetY) || 0);
        const finalOffset = globalOffset + customOffset;

        target.style.left = `${screenX}px`;
        target.style.top = `${screenY + finalOffset}px`;
        target.style.transform = 'translate(-50%, -100%)';
    }

    ctx.restore();
}

/**
 * Renders the player sprite based on its current state (idling, walking, lying down)
 * @param {CanvasRenderingContext2D} ctx 
 */
function drawPlayer(ctx) {
    // Hiccup/Drunk has priority when NOT moving and NOT performing other specific actions
    if (player.isDrunk && !player.isMoving && !player.isEating && !player.isDrinking && drunkImg) {
        const spriteW = 48;
        const spriteH = 64;
        const sequence = HICCUP_SEQUENCE;
        // If hiccuping, animate. If just drunk idle, use frame 0.
        const frameIdx = player.isHiccuping ? (sequence[player.animFrame] || 0) : 0;

        // ataho-drunk.png top row frames
        const srcX = frameIdx * spriteW;
        const srcY = 0;

        const dstX = Math.floor(player.x + 8 - spriteW / 2);
        const dstY = Math.floor(player.y + 16 - spriteH);

        ctx.drawImage(
            drunkImg,
            srcX, srcY,
            spriteW, spriteH,
            dstX, dstY,
            spriteW, spriteH
        );
    } else if ((player.isEating || player.isDrinking) && eatImg) {
        const spriteW = 48;
        const spriteH = 64;
        const sequence = player.isEating ? EAT_SEQUENCE : DRINK_SEQUENCE;
        const frameIdx = sequence[player.animFrame] || 0;

        // ataho-eat.png is 8x1 (384x64)
        const srcX = frameIdx * spriteW;
        const srcY = 0;

        const dstX = Math.floor(player.x + 8 - spriteW / 2);
        const dstY = Math.floor(player.y + 16 - spriteH);

        ctx.drawImage(
            eatImg,
            srcX, srcY,
            spriteW, spriteH,
            dstX, dstY,
            spriteW, spriteH
        );
    } else if (player.isIdle && idleImg) {
        let srcX, srcY, spriteW, spriteH;

        if (player.isLyingDown) {
            // Draw Lying Down Sprite (Second Row: Y=54, 56x32)
            spriteW = 56;
            spriteH = 32;
            const frameIdx = LIE_DOWN_SEQUENCE[player.lieDownFrame] || 0;
            srcX = frameIdx * spriteW;
            srcY = 54;
        } else {
            // Draw Idle/Sitting/Yawning Sprite (First Row: Y=0, 48x54)
            spriteW = 48;
            spriteH = 54;
            let frameIdx = 4; // Default: Sitting
            if (player.isYawning) {
                frameIdx = YAWN_SEQUENCE[player.yawnFrame] || 0;
            }
            srcX = frameIdx * spriteW;
            srcY = 0;
        }

        const dstX = Math.floor(player.x + 8 - spriteW / 2);
        const dstY = Math.floor(player.y + 16 - spriteH);

        ctx.drawImage(
            idleImg,
            srcX, srcY,
            spriteW, spriteH,
            dstX, dstY,
            spriteW, spriteH
        );

        // Draw Sleeping Bubble Animation
        if (player.isLyingDown) {
            const bubbleW = 16;
            const bubbleH = 16;
            const bFrameIdx = BUBBLE_SEQUENCE[player.bubbleFrame] || 0;
            const bSrcX = bFrameIdx * bubbleW;
            const bSrcY = 86; // Third row offset

            ctx.drawImage(
                idleImg,
                bSrcX, bSrcY,
                bubbleW, bubbleH,
                dstX + CONFIG.SLEEP_BUBBLE_OFFSET_X,
                dstY + CONFIG.SLEEP_BUBBLE_OFFSET_Y,
                bubbleW, bubbleH
            );
        }
    } else if (charImg) {
        const spriteW = 48;
        const spriteH = 64;
        const seqIndex = WALK_SEQUENCE[player.animFrame];

        // Dynamic UV Calculation based on image width
        // Supports both 4x5 grid and 20x1 strip (or any wrapping layout)
        // Order: Down, Left, Up, Right. 5 frames each.
        const framesPerDir = 5;
        const totalFrameIndex = (player.direction * framesPerDir) + seqIndex;

        let framesPerRow = Math.floor(charImg.width / spriteW);
        if (framesPerRow < 1) framesPerRow = 1; // Safety

        const col = totalFrameIndex % framesPerRow;
        const row = Math.floor(totalFrameIndex / framesPerRow);

        const srcX = col * spriteW;
        const srcY = row * spriteH;

        // Destination: Centered on collision box
        // Collision box is 16x16 at player.x, player.y
        // We want bottom-center of sprite to match bottom-center of box.
        // Center X: player.x + 8 -> drawX = center - w/2
        // Bottom Y: player.y + 16 -> drawY = bottom - h

        const dstX = Math.floor(player.x + 8 - spriteW / 2);
        const dstY = Math.floor(player.y + 16 - spriteH);

        ctx.drawImage(
            charImg,
            srcX, srcY,
            spriteW, spriteH,
            dstX, dstY,
            spriteW, spriteH
        );
    } else {
        // Fallback
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }
}

function checkCollision(x, y, w, h) {
    // Check all corners against collision map
    // We can optimize by converting rect to grid coordinates coverage
    // Player is small (16x16), tile is 16x16.
    // Overlap test.

    const left = Math.floor(x / CONFIG.TILE_SIZE);
    const right = Math.floor((x + w - 0.1) / CONFIG.TILE_SIZE); // -0.1 to avoid edge case
    const top = Math.floor(y / CONFIG.TILE_SIZE);
    const bottom = Math.floor((y + h - 0.1) / CONFIG.TILE_SIZE);

    for (let gy = top; gy <= bottom; gy++) {
        for (let gx = left; gx <= right; gx++) {
            if (mapCollisions.has(`${gx},${gy}`)) {
                return true;
            }
        }
    }
    return false;
}

function gameLoop(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Cap dt to avoid huge jumps (e.g., if tab was inactive)
    const cappedDt = Math.min(dt, 0.1);

    update(cappedDt);
    draw();
    requestAnimationFrame(gameLoop);
}

// Start
window.onload = initGame;
