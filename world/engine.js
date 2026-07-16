/**
 * engine.js — Map Rendering Engine
 * 
 * Reusable core for tile-based map games.
 * Provides: tile rendering, camera, collision, triggers, UI, game loop.
 * 
 * Expects the following globals to be defined by a character module:
 *   playerInit(assets)    — async, load character sprites
 *   playerUpdate(dt)      — update character state each frame
 *   playerDraw(ctx)       — render character sprite
 *   playerGetState()      — returns { x, y, width, height, direction }
 *   playerOnAction(type, count) — handle action from trigger menu
 * 
 * Host page must set:
 *   window.MAP_NAME  — map identifier (e.g. 'cave')
 *   window.MAP_BASE  — path prefix ('world/' from root, '' from world/)
 */

// ===== Configuration =====
let CONFIG = {
    TILE_SIZE: 16,
    SCALE: 2,
    MAP_ANIM_DEFAULT_SPEED: 0.2,
    CEILING_RENDER: {
        RANGE_TOP: 16,
        RANGE_BOTTOM: 32,
        RANGE_LEFT: 16,
        RANGE_RIGHT: 16
    },
    PATHS: {},
    SPEECH_BUBBLE_OFFSET_Y: -100,
    UI: {
        // Single interaction control shown on all platforms (click or tap).
        // 라벨은 텍스트(웹폰트) 대신 인라인 SVG 아이콘으로 그린다 — ACTION_ICONS 참고.
        ACTION_BUTTON: {
            LABEL: 'Space',
            WIDTH: '80px', HEIGHT: '34px',
            BOTTOM: '20vh', LEFT: '50%', RIGHT: 'auto',
            BG_COLOR: '#f5f5f5', TEXT_COLOR: '#000',
            BORDER: '1px solid #d3d3d3',
            BORDER_BOTTOM: '6px solid #bebebe',
            RADIUS: '8px', FONT_SIZE: '18px',
            SHADOW: '0 4px 6px rgba(0,0,0,0.2)',
            TRANSFORM: 'translateX(-50%)'
        }
    }
};

// action-btn/esc-btn 아이콘 — 웹폰트(RasterForge) 텍스트 대신 인라인 SVG.
// fill="currentColor"로 버튼의 --action-btn-color를 그대로 상속한다.
const ACTION_ICONS = {
    space: '<svg viewBox="0 0 261 45" fill="currentColor" aria-hidden="true">'
        + '<path d="M0,36h27v-9H0V9h9V0h36v9h-27v9h27v18h-9v9H0v-9Z"/>'
        + '<path d="M54,36V0h36v9h9v18h-9v9h-18v9h-18v-9ZM81,27V9h-9v18h9Z"/>'
        + '<path d="M108,36V9h9V0h27v9h9v36h-18v-9h-9v9h-18v-9ZM135,27V9h-9v18h9Z"/>'
        + '<path d="M162,27V9h9V0h27v9h9v9h-18v-9h-9v27h9v-9h18v9h-9v9h-27v-9h-9v-9Z"/>'
        + '<path d="M216,36V0h45v9h-27v9h18v9h-18v9h27v9h-45v-9Z"/>'
        + '</svg>',
    esc: '<svg viewBox="0 0 148.75 43.75" fill="currentColor" aria-hidden="true">'
        + '<path d="M0,35V0h43.75v8.75h-26.25v8.75h17.5v8.75h-17.5v8.75h26.25v8.75H0v-8.75Z"/>'
        + '<path d="M52.5,35h26.25v-8.75h-26.25V8.75h8.75V0h35v8.75h-26.25v8.75h26.25v17.5h-8.75v8.75h-35v-8.75Z"/>'
        + '<path d="M105,26.25V8.75h8.75V0h26.25v8.75h8.75v8.75h-17.5v-8.75h-8.75v26.25h8.75v-8.75h17.5v8.75h-8.75v8.75h-26.25v-8.75h-8.75v-8.75Z"/>'
        + '</svg>'
};

// ===== State =====
let canvas, ctx;
let tilesetImg, ceilingTilesetImg;
let mapData = [];
let tileGrid = [];
let mapObjects = [];
let mapCollisions = new Set();
let mapWidth = 0, mapHeight = 0;

const camera = { x: 0, y: 0, width: 0, height: 0 };

const keys = {
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    w: false, s: false, a: false, d: false
};

const touchInput = { active: false, dx: 0, dy: 0 };

let triggers = [];
let activeTrigger = null;
let lastTime = 0;
let isTouchDevice = false;
let focusedLinkIndex = -1;
let bubbleTimeout = null;
let lastBubbleTime = 0;

// Interaction state machine — single source of truth for "a bubble or menu is open".
// (see openModal/enterDialogue/enterMenu/closeModal). Character modules read only
// isInteracting(); the engine freezes player input while it is true.
let interactionState = 'NONE';   // 'NONE' | 'DIALOGUE' | 'MENU'
let activeMenuTrigger = null;    // trigger whose menu opens when a dialogue advances
let lastAutoTriggerId = null;    // latch so an auto-firing tile trigger fires once per entry
const DIALOGUE_AUTO_MS = 3000;   // bubble auto-advances after this delay

function isInteracting() { return interactionState !== 'NONE'; }

// ===== Path Resolution =====
function resolvePath(path) {
    if (!path) return '';
    if (path.startsWith('http') || path.startsWith('/')) return path;
    const base = window.MAP_BASE || '';
    return base + path;
}

// ===== Initialization =====
async function initGame() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) { console.error("Canvas 'gameCanvas' not found!"); return; }
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const mapName = window.MAP_NAME || 'cave';

    if (!window.MAP_DATA) { console.warn("No MAP_DATA found"); return; }

    // Load asset paths
    if (window.MAP_DATA.assets) {
        CONFIG.PATHS.TILESET = resolvePath(window.MAP_DATA.assets.tileset || '');
        CONFIG.PATHS.CEILING_TILESET = resolvePath(window.MAP_DATA.assets.ceilingTileset || '');
        CONFIG.PATHS.ANIMATION = resolvePath(window.MAP_DATA.assets.animation || '');
    }

    // Map tiles
    mapData = window.MAP_DATA.tiles || [];

    // Collisions
    if (window.MAP_DATA.collisions) {
        window.MAP_DATA.collisions.forEach(col => {
            mapCollisions.add(`${col.x},${col.y}`);
        });
    }

    // Triggers with itemsFrom: load menu items from a generated image manifest
    // (global set by a <script> tag, e.g. window.RESOURCE_IMG_MANIFEST — an object
    // keyed by filename under resource/img/, see scripts/gen-img-manifest.js)
    // instead of hardcoding them in triggers.js. Read from window[...] rather
    // than fetch() so this still works when the page is opened directly via
    // file:// (no server).
    const IMG_MODIFIED_LABELS = ['원본', '업스케일', '재구성', '기타'];
    if (window.MAP_DATA.triggers) {
        for (const t of window.MAP_DATA.triggers) {
            if (t.itemsFrom) {
                const manifest = window[t.itemsFrom];
                if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
                    t.items = Object.keys(manifest).map(file => {
                        const meta = manifest[file] || {};
                        return {
                            label: meta.caption || file,
                            href: '#resource/img/' + file,
                            data: {
                                caption: meta.caption || file,
                                source: meta.source || '',
                                modified: IMG_MODIFIED_LABELS[meta.modified] || IMG_MODIFIED_LABELS[0]
                            }
                        };
                    });
                } else {
                    console.error(`itemsFrom global '${t.itemsFrom}' not found or not an object`);
                }
            }
        }
    }

    // Triggers (convert tile coords → pixel coords)
    if (window.MAP_DATA.triggers) {
        triggers = window.MAP_DATA.triggers.map(t => {
            const height = t.h || 1;
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

        // Apply trigger collisions
        triggers.forEach(t => {
            let hasCollision = false;
            if (t.collision !== undefined) hasCollision = t.collision;
            else if (t.sprite) hasCollision = true;

            if (hasCollision) {
                const gw = t.w / CONFIG.TILE_SIZE;
                const gh = t.h / CONFIG.TILE_SIZE;
                const gx = t.x / CONFIG.TILE_SIZE;
                const gy = t.y / CONFIG.TILE_SIZE;
                for (let dy = 0; dy < gh; dy++) {
                    for (let dx = 0; dx < gw; dx++) {
                        mapCollisions.add(`${gx + dx},${gy + dy}`);
                    }
                }
            }
        });

        // Create renderable objects from sprite triggers
        mapObjects = triggers.filter(t => t.sprite).map(t => {
            const triggerSource = window.MAP_DATA.triggers.find(orig =>
                orig.id === t.id && orig.x * CONFIG.TILE_SIZE === t.x && orig.y * CONFIG.TILE_SIZE === t.anchorY
            ) || {};
            return {
                x: t.x, y: t.y, h: t.h,
                src: resolvePath(t.sprite),
                img: null, width: 0, height: 0,
                frames: triggerSource.frames || 0,
                speed: triggerSource.speed || 0,
                animW: triggerSource.animW || 0,
                animH: triggerSource.animH || 0
            };
        });
    }

    // CSS scaling
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.imageRendering = 'pixelated';

    // Input
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        isTouchDevice = true;
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Load tileset
    if (CONFIG.PATHS.TILESET) {
        tilesetImg = new Image();
        tilesetImg.src = CONFIG.PATHS.TILESET;
        await new Promise((resolve) => {
            tilesetImg.onload = resolve;
            tilesetImg.onerror = () => { console.warn("Tileset load failed:", CONFIG.PATHS.TILESET); resolve(); };
        });
    }

    // Load ceiling tileset
    if (CONFIG.PATHS.CEILING_TILESET) {
        ceilingTilesetImg = new Image();
        ceilingTilesetImg.src = CONFIG.PATHS.CEILING_TILESET;
        await new Promise((resolve) => {
            ceilingTilesetImg.onload = resolve;
            ceilingTilesetImg.onerror = () => { console.warn("Ceiling load failed"); resolve(); };
        });
    }

    // Load object images
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

    // Calculate map bounds
    let maxGx = 0, maxGy = 0;
    mapData.forEach(t => {
        if (t.gx > maxGx) maxGx = t.gx;
        if (t.gy > maxGy) maxGy = t.gy;
    });
    mapWidth = (maxGx + 1) * CONFIG.TILE_SIZE;
    mapHeight = (maxGy + 1) * CONFIG.TILE_SIZE;

    // Character init (provided by char module)
    if (typeof playerInit === 'function') {
        await playerInit(window.MAP_DATA.assets || {});
    }

    // Build spatial grid
    const cols = maxGx + 1;
    const rows = maxGy + 1;
    tileGrid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []));
    mapData.forEach(t => {
        if (t.gx >= 0 && t.gx < cols && t.gy >= 0 && t.gy < rows) {
            tileGrid[t.gy][t.gx].push(t);
        }
    });

    // Inject UI elements
    injectUI();

    // Start loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
    console.log("Engine initialized!");
}

// ===== UI System =====
function injectUI() {
    if (!document.getElementById('ui-layer')) {
        const uiLayer = document.createElement('div');
        uiLayer.id = 'ui-layer';
        document.body.appendChild(uiLayer);
    }
    const uiLayer = document.getElementById('ui-layer');

    // Action Button — single interaction control for all platforms (click or tap).
    if (!document.getElementById('action-btn')) {
        const btn = document.createElement('div');
        btn.id = 'action-btn';
        btn.className = 'hidden';
        const cfg = CONFIG.UI.ACTION_BUTTON;
        btn.innerHTML = ACTION_ICONS.space;
        btn.setAttribute('aria-label', cfg.LABEL || '');
        uiLayer.appendChild(btn);

        btn.style.setProperty('--action-btn-width', cfg.WIDTH);
        btn.style.setProperty('--action-btn-height', cfg.HEIGHT);
        btn.style.setProperty('--action-btn-bottom', cfg.BOTTOM);
        btn.style.setProperty('--action-btn-left', cfg.LEFT);
        btn.style.setProperty('--action-btn-right', cfg.RIGHT);
        btn.style.setProperty('--action-btn-bg', cfg.BG_COLOR);
        btn.style.setProperty('--action-btn-color', cfg.TEXT_COLOR);
        btn.style.setProperty('--action-btn-border', cfg.BORDER);
        btn.style.setProperty('--action-btn-border-bottom', cfg.BORDER_BOTTOM);
        btn.style.setProperty('--action-btn-radius', cfg.RADIUS);
        btn.style.setProperty('--action-btn-font-size', cfg.FONT_SIZE);
        btn.style.setProperty('--action-btn-shadow', cfg.SHADOW);
        btn.style.setProperty('--action-btn-transform', cfg.TRANSFORM);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            activateOrAdvance();
        });
        btn.addEventListener('touchstart', (e) => { e.stopPropagation(); });
    }

    // ESC Button — closes an open menu modal (mobile has no keyboard). Same look as the
    // action button; shown only while a menu is open (see enterMenu/closeModal).
    if (!document.getElementById('esc-btn')) {
        const escBtn = document.createElement('div');
        escBtn.id = 'esc-btn';
        escBtn.className = 'hidden';
        const cfg = CONFIG.UI.ACTION_BUTTON; // share the action button's look
        escBtn.innerHTML = ACTION_ICONS.esc;
        escBtn.setAttribute('aria-label', 'ESC');
        uiLayer.appendChild(escBtn);

        escBtn.style.setProperty('--action-btn-width', cfg.WIDTH);
        escBtn.style.setProperty('--action-btn-height', cfg.HEIGHT);
        escBtn.style.setProperty('--action-btn-bottom', cfg.BOTTOM);
        escBtn.style.setProperty('--action-btn-left', cfg.LEFT);
        escBtn.style.setProperty('--action-btn-right', cfg.RIGHT);
        escBtn.style.setProperty('--action-btn-bg', cfg.BG_COLOR);
        escBtn.style.setProperty('--action-btn-color', cfg.TEXT_COLOR);
        escBtn.style.setProperty('--action-btn-border', cfg.BORDER);
        escBtn.style.setProperty('--action-btn-border-bottom', cfg.BORDER_BOTTOM);
        escBtn.style.setProperty('--action-btn-radius', cfg.RADIUS);
        escBtn.style.setProperty('--action-btn-font-size', cfg.FONT_SIZE);
        escBtn.style.setProperty('--action-btn-shadow', cfg.SHADOW);
        escBtn.style.setProperty('--action-btn-transform', cfg.TRANSFORM);

        escBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
        });
        escBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); });
    }

    // Dynamic Modal
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
        modal.querySelector('.close-modal').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    }

    // Speech Bubble
    if (!document.getElementById('speech-bubble')) {
        const bubble = document.createElement('div');
        bubble.id = 'speech-bubble';
        bubble.className = 'hidden';
        document.body.appendChild(bubble);
    }
}

// ===== Interaction State Machine: NONE → DIALOGUE → MENU =====
// A trigger with text first shows a speech bubble (DIALOGUE); confirming it or
// letting it time out *advances* to the menu (MENU) when one exists, otherwise
// it *closes*. "advance" and "close" are kept as distinct actions instead of
// overloading closeModal(), which is also the public "dismiss everything" call
// used by the character modules when the player walks away.

// Entry point: begin interacting with a trigger.
function openModal(trigger, skipDialogue = false) {
    if (!trigger) return;
    const hasDialogue = (trigger.type === 'dialog' || (trigger.type === 'menu' && trigger.text));
    if (!skipDialogue && hasDialogue) {
        const menuFollows = (trigger.type === 'menu');
        enterDialogue(trigger.text, trigger.bubbleOffsetY, trigger, menuFollows ? trigger : null);
    } else {
        enterMenu(trigger);
    }
}

// Pointer entry: a tap/click on the prompt pill or mobile action button. Advances
// an open dialogue (mirroring the Space key) instead of restarting it; otherwise
// begins interacting with the reachable trigger.
function activateOrAdvance() {
    if (interactionState === 'DIALOGUE') {
        if (performance.now() - lastBubbleTime > 200) advanceInteraction();
    } else if (interactionState === 'NONE' && activeTrigger) {
        openModal(activeTrigger);
    }
}

// DIALOGUE: show a speech bubble. If menuTrigger is set, advancing opens its menu.
function enterDialogue(text, offsetY, dialogTrigger, menuTrigger) {
    interactionState = 'DIALOGUE';
    activeMenuTrigger = menuTrigger || null;
    renderBubble(text, offsetY, dialogTrigger);
    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    bubbleTimeout = setTimeout(advanceInteraction, DIALOGUE_AUTO_MS);
}

// Leave a dialogue: open the pending menu if there is one, else close out.
function advanceInteraction() {
    if (bubbleTimeout) { clearTimeout(bubbleTimeout); bubbleTimeout = null; }
    if (interactionState === 'DIALOGUE' && activeMenuTrigger) {
        enterMenu(activeMenuTrigger);
    } else {
        closeModal();
    }
}

// MENU: build and show the choice modal for a trigger.
function enterMenu(trigger) {
    const modal = document.getElementById('dynamic-modal');
    if (!modal || !trigger) return;

    // The bubble (if any) is replaced by the menu.
    const bubble = document.getElementById('speech-bubble');
    if (bubble) bubble.classList.add('hidden');
    if (bubbleTimeout) { clearTimeout(bubbleTimeout); bubbleTimeout = null; }

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
                a.textContent = item.label || item.text || '';

                if (item.data) {
                    for (const [key, val] of Object.entries(item.data)) {
                        a.setAttribute(`data-${key}`, val);
                    }
                }
                if (item.target) {
                    a.setAttribute('target', item.target);
                    if (item.target === '_blank') a.setAttribute('rel', 'noopener noreferrer');
                }
                if (a.href.includes('#') && !item.action && !item.text) {
                    a.addEventListener('click', () => { setTimeout(closeModal, 10); });
                }

                li.appendChild(a);
                listEl.appendChild(li);

                if (item.action) {
                    a.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (typeof playerOnAction === 'function') {
                            playerOnAction(item.action, item.count);
                        }
                        closeModal();
                    });
                }
                if (item.text) {
                    a.addEventListener('click', (e) => {
                        e.preventDefault();
                        closeModal();
                        showResultBubble(item.text, trigger.bubbleOffsetY);
                    });
                }
            });
        }
    }

    modal.classList.remove('hidden');
    interactionState = 'MENU';

    // Mobile close affordance: surface ESC, hide the action button (Space is inert here).
    const escBtn = document.getElementById('esc-btn');
    if (escBtn) escBtn.classList.remove('hidden');
    const actBtn = document.getElementById('action-btn');
    if (actBtn) actBtn.classList.add('hidden');

    activeMenuTrigger = null; // consumed
    lastBubbleTime = performance.now();

    Object.keys(keys).forEach(k => keys[k] = false);
    resetModalFocus(modal);
}

// Close the whole interaction. Public dismiss used by Escape, the close button,
// backdrop clicks, and picking an item.
function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.modal a').forEach(a => a.classList.remove('focused'));
    const escBtn = document.getElementById('esc-btn');
    if (escBtn) escBtn.classList.add('hidden');
    const bubble = document.getElementById('speech-bubble');
    if (bubble) bubble.classList.add('hidden');
    if (bubbleTimeout) { clearTimeout(bubbleTimeout); bubbleTimeout = null; }
    interactionState = 'NONE';
    activeMenuTrigger = null;
}

// A one-off result bubble (e.g. choosing "참는다") — no menu follows it.
function showResultBubble(text, offsetY) {
    enterDialogue(text, offsetY, null, null);
}

// Pure render of the speech bubble; interactionState is set by the caller.
function renderBubble(text, offsetY = 0, trigger = null) {
    const bubble = document.getElementById('speech-bubble');
    if (!bubble) return;

    let textContent = text;
    if (Array.isArray(text)) {
        if (trigger) {
            if (typeof trigger.dialogIndex === 'undefined') trigger.dialogIndex = 0;
            textContent = text[trigger.dialogIndex];
            trigger.dialogIndex = (trigger.dialogIndex + 1) % text.length;
        } else {
            textContent = text[0];
        }
    }

    bubble.textContent = textContent || '';
    bubble.dataset.offsetY = offsetY || 0;
    bubble.classList.remove('hidden');
    lastBubbleTime = performance.now();
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

function handleModalNav(direction) {
    const modal = document.querySelector('.modal:not(.hidden)');
    if (!modal) return;
    const links = Array.from(modal.querySelectorAll('a'));
    if (links.length === 0) return;
    links.forEach(l => l.classList.remove('focused'));
    focusedLinkIndex += direction;
    if (focusedLinkIndex >= links.length) focusedLinkIndex = 0;
    if (focusedLinkIndex < 0) focusedLinkIndex = links.length - 1;
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

// ===== Canvas =====
function resizeCanvas() {
    canvas.width = Math.ceil(window.innerWidth / CONFIG.SCALE);
    canvas.height = Math.ceil(window.innerHeight / CONFIG.SCALE);
    camera.width = canvas.width;
    camera.height = canvas.height;
    if (ctx) ctx.imageSmoothingEnabled = false;
}

// ===== Input =====
function onKeyDown(e) {
    if (interactionState === 'MENU') {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'ArrowUp') handleModalNav(-1);
        if (e.key === 'ArrowDown') handleModalNav(1);
        if (e.key === 'Enter' || e.key === ' ') handleModalAction();
        return;
    }
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    if (e.code === 'Space' || e.key === 'Enter' || e.key.startsWith('Arrow')) {
        if (interactionState === 'DIALOGUE') {
            // e.repeat 무시: 키를 누르고 있는 중(OS 키 리핏)에 뜬 대사가 다음 리핏
            // 이벤트에 바로 넘어가버리는 사고 방지 (sweep처럼 이동 중 자동으로 대사가
            // 뜨는 경우). 새로 누르는 키로는 여전히 수동으로 넘길 수 있다.
            if (!e.repeat && performance.now() - lastBubbleTime > 200) advanceInteraction();
        } else if (activeTrigger && e.code === 'Space') {
            openModal(activeTrigger);
        }
    }
}

function onKeyUp(e) {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
}

function handleTouchStart(e) {
    if (e.target !== canvas) return;
    e.preventDefault();
    touchInput.active = true;
    updateTouchInput(e.touches[0]);
}

function handleTouchMove(e) {
    if (e.target !== canvas) return;
    e.preventDefault();
    if (touchInput.active) updateTouchInput(e.touches[0]);
}

function handleTouchEnd(e) {
    if (e.target !== canvas) return;
    e.preventDefault();

    if (touchInput.active && interactionState !== 'MENU') {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const touchX = (touch.clientX - rect.left) * scaleX + camera.x;
        const touchY = (touch.clientY - rect.top) * scaleY + camera.y;

        if (activeTrigger) {
            if (touchX >= activeTrigger.x && touchX <= activeTrigger.x + activeTrigger.w &&
                touchY >= activeTrigger.y && touchY <= activeTrigger.y + activeTrigger.h) {
                activateOrAdvance();
            }
        }
    }

    touchInput.active = false;
    touchInput.dx = 0;
    touchInput.dy = 0;
}

function updateTouchInput(touch) {
    const ps = (typeof playerGetState === 'function') ? playerGetState() : { x: 0, y: 0, width: 16, height: 16 };
    const pCanvasX = ps.x + ps.width / 2 - camera.x;
    const pCanvasY = ps.y + ps.height / 2 - camera.y;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const touchInternalX = (touch.clientX - rect.left) * scaleX;
    const touchInternalY = (touch.clientY - rect.top) * scaleY;

    let tx = touchInternalX - pCanvasX;
    let ty = touchInternalY - pCanvasY;
    const len = Math.sqrt(tx * tx + ty * ty);
    if (len > 10) {
        touchInput.dx = tx / len;
        touchInput.dy = ty / len;
    } else {
        touchInput.dx = 0;
        touchInput.dy = 0;
    }
}

// ===== Update =====
function update(dt) {
    // Freeze player input while a bubble or menu is open. Done once here so every
    // character module stops uniformly — no per-module interaction handling.
    if (isInteracting()) {
        for (const k in keys) keys[k] = false;
        touchInput.active = false;
        touchInput.dx = 0;
        touchInput.dy = 0;
    }

    // Character update
    if (typeof playerUpdate === 'function') playerUpdate(dt);

    // Camera follow
    const ps = (typeof playerGetState === 'function') ? playerGetState() : null;
    if (ps) {
        camera.x = ps.x + ps.width / 2 - camera.width / 2;
        camera.y = ps.y + ps.height / 2 - camera.height / 2;
    }

    // Clamp camera
    if (camera.x < 0) camera.x = 0;
    if (camera.y < 0) camera.y = 0;
    if (mapWidth > camera.width) {
        if (camera.x > mapWidth - camera.width) camera.x = mapWidth - camera.width;
    } else {
        camera.x = -(camera.width - mapWidth) / 2;
    }
    if (mapHeight > camera.height) {
        if (camera.y > mapHeight - camera.height) camera.y = mapHeight - camera.height;
    } else {
        camera.y = -(camera.height - mapHeight) / 2;
    }

    checkTriggers();
}

// ===== Triggers =====
function checkTriggers() {
    if (interactionState === 'MENU') return;

    const ps = (typeof playerGetState === 'function') ? playerGetState() : null;
    if (!ps) return;

    activeTrigger = null;
    const pCx = ps.x + ps.width / 2;
    const pCy = ps.y + ps.height / 2;

    let targetX = pCx, targetY = pCy;
    const reach = 20;
    if (ps.direction === 0) targetY += reach;
    else if (ps.direction === 1) targetX -= reach;
    else if (ps.direction === 2) targetY -= reach;
    else if (ps.direction === 3) targetX += reach;

    activeTrigger = triggers.find(t =>
        targetX >= t.x && targetX <= t.x + t.w &&
        targetY >= t.y && targetY <= t.y + t.h
    );

    // Auto-activate tile-type triggers (no sprite): these mark map exits / zones
    // that fire on entry by design. Latch on id so each fires once per entry.
    if (activeTrigger && !activeTrigger.sprite) {
        if (activeTrigger.id !== lastAutoTriggerId && interactionState === 'NONE') {
            lastAutoTriggerId = activeTrigger.id;
            openModal(activeTrigger);
        }
    } else {
        lastAutoTriggerId = null;
    }

    // Action button is only for sprite-object triggers (tile zones auto-fire above).
    const btn = document.getElementById('action-btn');
    if (btn) btn.classList.toggle('hidden', !(activeTrigger && activeTrigger.sprite));
}

// 화면에 떠 있는 조작 버튼(esc/action) 중 가장 위 모서리의 뷰포트 Y를 반환.
// 말풍선/모달이 이 선 아래로 내려가지 않게 클램프하는 데 쓴다(둘 다 하단 중앙 고정이라
// 캐릭터를 따라다니는 모달과 겹칠 수 있음). 표시된 버튼이 없으면 Infinity.
function uiButtonsSafeTop() {
    let top = Infinity;
    ['esc-btn', 'action-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) {
            const r = el.getBoundingClientRect();
            if (r.height > 0) top = Math.min(top, r.top);
        }
    });
    return top;
}

// ===== Rendering =====
function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    // Viewport bounds
    const viewL = camera.x, viewR = camera.x + camera.width;
    const viewT = camera.y, viewB = camera.y + camera.height;

    // Draw floor tiles
    const gridRows = tileGrid.length;
    const gridCols = gridRows > 0 ? tileGrid[0].length : 0;
    const startCol = Math.max(0, Math.floor(viewL / CONFIG.TILE_SIZE));
    const endCol = Math.min(gridCols, Math.ceil(viewR / CONFIG.TILE_SIZE));
    const startRow = Math.max(0, Math.floor(viewT / CONFIG.TILE_SIZE));
    const endRow = Math.min(gridRows, Math.ceil(viewB / CONFIG.TILE_SIZE));

    // Skip floor tiles if the tileset failed to load (avoids drawImage throwing each frame)
    if (tilesetImg && tilesetImg.naturalWidth > 0)
    for (let y = startRow; y < endRow; y++) {
        for (let x = startCol; x < endCol; x++) {
            const cell = tileGrid[y][x];
            for (let i = 0; i < cell.length; i++) {
                const tile = cell[i];
                let tx = tile.tx, ty = tile.ty;
                // Optional per-tile override hook (e.g. sweep 미니게임의 먼지 레이어).
                // 미정의 시 기존 동작과 완전히 동일.
                if (typeof window.getFloorTileOverride === 'function') {
                    const o = window.getFloorTileOverride(tile.gx, tile.gy, tx, ty);
                    if (o) { tx = o.tx; ty = o.ty; }
                }
                ctx.drawImage(
                    tilesetImg,
                    tx * CONFIG.TILE_SIZE, ty * CONFIG.TILE_SIZE,
                    CONFIG.TILE_SIZE, CONFIG.TILE_SIZE,
                    tile.gx * CONFIG.TILE_SIZE, tile.gy * CONFIG.TILE_SIZE,
                    CONFIG.TILE_SIZE, CONFIG.TILE_SIZE
                );
            }
        }
    }

    // Y-sorted entity rendering (player + objects)
    const ps = (typeof playerGetState === 'function') ? playerGetState() : null;
    const renderList = [];

    if (ps) {
        renderList.push({ type: 'player', ySort: ps.y + ps.height });
    }

    mapObjects.forEach(obj => {
        if (obj.img &&
            obj.x + obj.width > viewL && obj.x < viewR &&
            obj.y + obj.height > viewT && obj.y < viewB) {
            renderList.push({ type: 'object', data: obj, ySort: obj.y + obj.h });
        }
    });

    renderList.sort((a, b) => a.ySort - b.ySort);

    renderList.forEach(item => {
        if (item.type === 'player') {
            if (typeof playerDraw === 'function') playerDraw(ctx);
        } else {
            const obj = item.data;
            const drawX = Math.floor(obj.x);
            const drawY = Math.floor(obj.y + obj.h - (obj.animH || obj.height));
            if (obj.frames > 1) {
                const now = performance.now() / 1000;
                const speedInSeconds = (obj.speed || 200) / 1000;
                const frameIndex = Math.floor(now / speedInSeconds) % obj.frames;
                const srcX = frameIndex * (obj.animW || obj.width);
                ctx.drawImage(obj.img, srcX, 0,
                    (obj.animW || obj.width), (obj.animH || obj.height),
                    drawX, drawY,
                    (obj.animW || obj.width), (obj.animH || obj.height));
            } else {
                ctx.drawImage(obj.img, drawX, drawY);
            }
        }
    });

    // Ceiling layer
    if (ceilingTilesetImg && ps) {
        const cullL = ps.x - CONFIG.CEILING_RENDER.RANGE_LEFT;
        const cullR = ps.x + ps.width + CONFIG.CEILING_RENDER.RANGE_RIGHT;
        const cullT = ps.y - CONFIG.CEILING_RENDER.RANGE_TOP;
        const cullB = ps.y + ps.height + CONFIG.CEILING_RENDER.RANGE_BOTTOM;

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

    // Update Speech Bubble / Modal position
    // window.getBubbleAnchor 훅: 말풍선을 플레이어가 아닌 다른 대상(NPC 등)에 붙일 때
    // {x, y, width, height}(월드 좌표)를 반환하면 그쪽을 앵커로 쓴다 (sweep 술집주인 대사용).
    const bubble = document.getElementById('speech-bubble');
    const modal = document.getElementById('dynamic-modal');
    if ((bubble && !bubble.classList.contains('hidden')) || (modal && !modal.classList.contains('hidden'))) {
        const target = (modal && !modal.classList.contains('hidden')) ? modal : bubble;
        const anchor = (typeof window.getBubbleAnchor === 'function' && window.getBubbleAnchor()) || ps;
        if (anchor) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;
            const pViewX = anchor.x + anchor.width / 2 - camera.x;
            const pViewY = anchor.y - camera.y;
            const screenX = rect.left + pViewX * scaleX;
            const screenY = rect.top + pViewY * scaleY;
            const globalOffset = CONFIG.SPEECH_BUBBLE_OFFSET_Y || -50;
            const customOffset = (target === modal && activeTrigger) ? (activeTrigger.bubbleOffsetY || 0) : (parseInt(target.dataset.offsetY) || 0);
            const h = target.offsetHeight;

            // 가로: 화자 중심에 붙이되, 뷰포트(브라우저 화면)를 벗어나면 안으로 클램프 —
            // 모바일 세로 화면은 캔버스 좌우가 잘려 있어 화자(문 앞 술집주인 등)가 화면
            // 밖일 수 있는데, 말풍선만큼은 잘리지 않고 보여야 한다.
            const halfW = target.offsetWidth / 2;
            const viewLeft = Math.max(rect.left, 0) + 8;
            const viewRight = Math.min(rect.right, window.innerWidth) - 8;
            const clampedX = Math.max(viewLeft + halfW, Math.min(viewRight - halfW, screenX));
            target.style.left = `${clampedX}px`;
            target.style.transform = 'translateX(-50%)';   // 세로 위치는 top(=topEdge)으로만 제어

            // 꼬리(▼)는 말풍선이 클램프돼도 화자를 가리키게 — 화자 화면 X를 말풍선 내부
            // 좌표로 환산해 CSS 변수로 전달 (style.css의 ::before/::after가 사용).
            // 둥근 모서리를 침범하지 않도록 양끝 14px 안쪽으로 제한.
            const tailX = Math.max(14, Math.min(halfW * 2 - 14, halfW + (screenX - clampedX)));
            target.style.setProperty('--bubble-tail-x', `${tailX}px`);

            // 기본: 캐릭터 머리 위로 띄운다(말풍선 하단이 bottomAnchor). 위로 띄우면 캔버스
            // 상단을 벗어나는 경우(캐릭터가 맵 최상단) 캐릭터 아래로 뒤집는다.
            const bottomAnchor = screenY + globalOffset + customOffset;
            let topEdge;
            if (bottomAnchor - h < rect.top + 8) {
                const charBottomY = rect.top + (anchor.y + anchor.height - camera.y) * scaleY;
                target.classList.add('flip-below');
                topEdge = charBottomY + 16 + customOffset;
            } else {
                target.classList.remove('flip-below');
                topEdge = bottomAnchor - h;
            }

            // 하단 조작 버튼(esc/action) 위로 밀어 올려 겹침 방지. 버튼과 8px 간격 확보.
            const safeTop = uiButtonsSafeTop();
            if (isFinite(safeTop) && topEdge + h > safeTop - 8) topEdge = safeTop - 8 - h;
            // 위로 밀다가 캔버스 상단을 벗어나면 상단에 고정
            if (topEdge < rect.top + 8) topEdge = rect.top + 8;

            target.style.top = `${topEdge}px`;
        }
    }

    ctx.restore();
}

// ===== Collision =====
function checkCollision(x, y, w, h) {
    const left = Math.floor(x / CONFIG.TILE_SIZE);
    const right = Math.floor((x + w - 0.1) / CONFIG.TILE_SIZE);
    const top = Math.floor(y / CONFIG.TILE_SIZE);
    const bottom = Math.floor((y + h - 0.1) / CONFIG.TILE_SIZE);
    for (let gy = top; gy <= bottom; gy++) {
        for (let gx = left; gx <= right; gx++) {
            if (mapCollisions.has(`${gx},${gy}`)) return true;
        }
    }
    return false;
}

// ===== Game Loop =====
function gameLoop(currentTime) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    const cappedDt = Math.min(dt, 0.1);
    update(cappedDt);
    draw();
    requestAnimationFrame(gameLoop);
}

// Engine exposes initGame globally.
// Host pages should call it after all scripts (data, triggers, char module) are loaded.
// For static script tags: use window.onload = initGame in the host page.
// For dynamic loading: call initGame() after all scripts load.
