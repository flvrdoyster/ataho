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
        DESKTOP_PROMPT: { LABEL: 'Space를 누르세요.' },
        MOBILE_BUTTON: {
            LABEL: 'Space',
            WIDTH: '80px', HEIGHT: '34px',
            BOTTOM: '60px', LEFT: '50%', RIGHT: 'auto',
            BG_COLOR: '#f5f5f5', TEXT_COLOR: '#000',
            BORDER: '1px solid #d3d3d3',
            BORDER_BOTTOM: '6px solid #bebebe',
            RADIUS: '8px', FONT_SIZE: '18px',
            SHADOW: '0 4px 6px rgba(0,0,0,0.2)',
            TRANSFORM: 'translateX(-50%)',
            FONT_FAMILY: "'RasterForge', 'KoddiudOngodic', sans-serif"
        }
    }
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
let isModalOpen = false;
let isBubbleOpen = false;
let lastTime = 0;
let isTouchDevice = false;
let focusedLinkIndex = -1;
let bubbleTimeout = null;
let lastBubbleTime = 0;
let lastAutoTriggerId = null;
let pendingMenuTrigger = null;

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
        await new Promise((resolve, reject) => {
            tilesetImg.onload = resolve;
            tilesetImg.onerror = reject;
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

    // Interaction Prompt
    if (!document.getElementById('interaction-prompt')) {
        const prompt = document.createElement('div');
        prompt.id = 'interaction-prompt';
        prompt.className = 'prompt hidden';
        prompt.textContent = CONFIG.UI.DESKTOP_PROMPT.LABEL;
        uiLayer.appendChild(prompt);

        const mBtn = CONFIG.UI.MOBILE_BUTTON;
        prompt.style.setProperty('--mobile-btn-width', mBtn.WIDTH);
        prompt.style.setProperty('--mobile-btn-height', mBtn.HEIGHT);
        prompt.style.setProperty('--mobile-btn-bottom', mBtn.BOTTOM);
        prompt.style.setProperty('--mobile-btn-left', mBtn.LEFT);
        prompt.style.setProperty('--mobile-btn-right', mBtn.RIGHT);
        prompt.style.setProperty('--mobile-btn-bg', mBtn.BG_COLOR);
        prompt.style.setProperty('--mobile-btn-color', mBtn.TEXT_COLOR);
        prompt.style.setProperty('--mobile-btn-border', mBtn.BORDER);
        prompt.style.setProperty('--mobile-btn-border-bottom', mBtn.BORDER_BOTTOM);
        prompt.style.setProperty('--mobile-btn-radius', mBtn.RADIUS);
        prompt.style.setProperty('--mobile-btn-font-size', mBtn.FONT_SIZE);
        prompt.style.setProperty('--mobile-btn-shadow', mBtn.SHADOW);
        prompt.style.setProperty('--mobile-btn-transform', mBtn.TRANSFORM);
        prompt.style.setProperty('--mobile-btn-font-family', mBtn.FONT_FAMILY);

        prompt.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (activeTrigger) openModal(activeTrigger);
        });
        prompt.addEventListener('touchstart', (e) => { e.stopPropagation(); });
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

function openModal(trigger, skipDialogue = false) {
    if (!skipDialogue && (trigger.type === 'dialog' || (trigger.type === 'menu' && trigger.text))) {
        showSpeechBubble(trigger.text, trigger.bubbleOffsetY, trigger);
        if (trigger.type === 'menu') {
            pendingMenuTrigger = trigger;
        } else {
            pendingMenuTrigger = null;
        }
        return;
    }

    const modal = document.getElementById('dynamic-modal');
    if (!modal || !trigger) return;

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
                        showSpeechBubble(item.text, trigger.bubbleOffsetY);
                    });
                }
            });
        }
    }

    modal.classList.remove('hidden');
    isModalOpen = true;
    lastBubbleTime = performance.now();

    Object.keys(keys).forEach(k => keys[k] = false);
    resetModalFocus(modal);
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.modal a').forEach(a => a.classList.remove('focused'));
    hideSpeechBubble(true);
    isModalOpen = false;

    if (pendingMenuTrigger) {
        const trig = pendingMenuTrigger;
        pendingMenuTrigger = null;
        openModal(trig, true);
    }
}

function showSpeechBubble(text, offsetY = 0, trigger = null) {
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
    isBubbleOpen = true;
    lastBubbleTime = performance.now();

    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    bubbleTimeout = setTimeout(hideSpeechBubble, 3000);
}

function hideSpeechBubble(skipPending = false) {
    const bubble = document.getElementById('speech-bubble');
    if (bubble) bubble.classList.add('hidden');
    if (bubbleTimeout) { clearTimeout(bubbleTimeout); bubbleTimeout = null; }
    isBubbleOpen = false;
    if (!skipPending && pendingMenuTrigger) closeModal();
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
    if (isModalOpen) {
        if (e.key === 'Escape') closeModal();
        if (e.key === 'ArrowUp') handleModalNav(-1);
        if (e.key === 'ArrowDown') handleModalNav(1);
        if (e.key === 'Enter' || e.key === ' ') handleModalAction();
        return;
    }
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    if (e.code === 'Space' || e.key === 'Enter') {
        if (isBubbleOpen) {
            if (performance.now() - lastBubbleTime > 200) closeModal();
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

    if (touchInput.active && !isModalOpen) {
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const touchX = (touch.clientX - rect.left) * scaleX + camera.x;
        const touchY = (touch.clientY - rect.top) * scaleY + camera.y;

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
    if (isModalOpen) return;

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

    // Auto-activate for tile-type triggers (no sprite)
    if (activeTrigger && !activeTrigger.sprite) {
        if (activeTrigger.id !== lastAutoTriggerId && !isModalOpen && !isBubbleOpen) {
            lastAutoTriggerId = activeTrigger.id;
            openModal(activeTrigger);
        }
    } else {
        lastAutoTriggerId = null;
    }

    // Update interaction prompt
    const prompt = document.getElementById('interaction-prompt');
    if (activeTrigger && activeTrigger.sprite) {
        if (prompt) {
            if (isTouchDevice) {
                prompt.innerHTML = CONFIG.UI.MOBILE_BUTTON.LABEL.replace(/\\n/g, '<br>');
            } else {
                prompt.textContent = CONFIG.UI.DESKTOP_PROMPT.LABEL;
            }
            prompt.classList.remove('hidden');
        }
    } else {
        if (prompt) prompt.classList.add('hidden');
    }
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
    const bubble = document.getElementById('speech-bubble');
    const modal = document.getElementById('dynamic-modal');
    if ((bubble && !bubble.classList.contains('hidden')) || (modal && !modal.classList.contains('hidden'))) {
        const target = (modal && !modal.classList.contains('hidden')) ? modal : bubble;
        if (ps) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / canvas.width;
            const scaleY = rect.height / canvas.height;
            const pViewX = ps.x + ps.width / 2 - camera.x;
            const pViewY = ps.y - camera.y;
            const screenX = rect.left + pViewX * scaleX;
            const screenY = rect.top + pViewY * scaleY;
            const globalOffset = CONFIG.SPEECH_BUBBLE_OFFSET_Y || -50;
            const customOffset = (target === modal && activeTrigger) ? (activeTrigger.bubbleOffsetY || 0) : (parseInt(target.dataset.offsetY) || 0);
            target.style.left = `${screenX}px`;
            target.style.top = `${screenY + globalOffset + customOffset}px`;
            target.style.transform = 'translate(-50%, -100%)';
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
