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
    COLLISION_PADDING: 4,
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
        CHAR: ''
    }
};

let tilesetImg;
let ceilingTilesetImg;
let animationImg;
let charImg;
let mapData = [];
let tileGrid = []; // Spatial Index
let mapAnimations = [];
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
    stepTimer: 0
};

const WALK_SEQUENCE = [0, 1, 2, 1, 0, 3, 4, 3];

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
let lastTime = 0;

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
        }

        // Map Data
        mapData = window.MAP_DATA.tiles || [];

        // Animations
        if (window.MAP_DATA.animations) {
            window.MAP_DATA.animations.forEach(animDef => {
                mapAnimations.push({
                    x: animDef.x,
                    y: animDef.y,
                    w: animDef.w || 64,
                    h: animDef.h || 48,
                    frames: animDef.frames || 5,
                    speed: animDef.speed || CONFIG.MAP_ANIM_DEFAULT_SPEED
                });
            });
        }

        // Collisions
        if (window.MAP_DATA.collisions) {
            window.MAP_DATA.collisions.forEach(col => {
                mapCollisions.add(`${col.x},${col.y}`);
            });
        }

        // Triggers
        if (window.MAP_DATA.triggers) {
            triggers = window.MAP_DATA.triggers.map(t => ({
                x: t.x * CONFIG.TILE_SIZE,
                y: t.y * CONFIG.TILE_SIZE,
                w: (t.w || 1) * CONFIG.TILE_SIZE,
                h: (t.h || 1) * CONFIG.TILE_SIZE,
                targetId: t.targetId
            }));
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

        if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
        if (e.code === 'Space' && activeTrigger) {
            openModal(activeTrigger.targetId);
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

    // Close modal on click outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        const closeBtn = modal.querySelector('.close-modal');
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
    });

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

    // 1.5 Load Animation
    if (CONFIG.PATHS.ANIMATION) {
        animationImg = new Image();
        animationImg.src = CONFIG.PATHS.ANIMATION;
        await new Promise((resolve, reject) => {
            animationImg.onload = resolve;
            animationImg.onerror = () => { console.warn("Anim load failed"); resolve(); };
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

    console.log("Map Loaded:", mapData.length, "tiles");
    console.log("Animations:", mapAnimations);

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

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        isModalOpen = true;

        // Stop player movement
        keys.ArrowUp = false;
        keys.ArrowDown = false;
        keys.ArrowLeft = false;
        keys.ArrowRight = false;
        player.isMoving = false; // Assuming currentSpeed is player.isMoving or similar

        // Position Logic - ALWAYS CENTERED (Default CSS)
        // We ensure any previous manual positioning is cleared
        const content = modal.querySelector('.modal-content');
        if (content) {
            content.style.position = '';
            content.style.left = '';
            content.style.top = '';
            content.style.transform = '';
            content.style.margin = '';
        }

        // Auto-focus first link
        resetModalFocus(modal);
    }
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('.modal a').forEach(a => a.classList.remove('focused')); // Clear focus
    isModalOpen = false;
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
    updateTouchInput(e.touches[0]);
}

function handleTouchMove(e) {
    if (e.target !== canvas) return;
    e.preventDefault();
    if (touchInput.active) {
        updateTouchInput(e.touches[0]);
    }
}

function handleTouchEnd(e) {
    if (e.target !== canvas) return;
    e.preventDefault();
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

    player.isMoving = (dx !== 0 || dy !== 0);

    if (player.isMoving) {
        player.stepTimer += dt;
        if (player.stepTimer >= CONFIG.ANIMATION_SPEED) {
            player.stepTimer = 0;
            player.animFrame = (player.animFrame + 1) % WALK_SEQUENCE.length;
        }
    } else {
        player.animFrame = 0; // Reset to standing
        player.stepTimer = 0;
    }

    const pad = CONFIG.COLLISION_PADDING || 0;

    // Try Move X
    let nextX = player.x + dx;
    // Inflate Collision Box by padding
    if (!checkCollision(nextX - pad, player.y - pad, player.width + pad * 2, player.height + pad * 2)) {
        player.x = nextX;
    }

    // Try Move Y
    let nextY = player.y + dy;
    if (!checkCollision(player.x - pad, nextY - pad, player.width + pad * 2, player.height + pad * 2)) {
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

    const pCx = player.x + player.width / 2;
    const pCy = player.y + player.height / 2;

    // Simple point-in-rect for now, or center-in-rect
    const prevTrigger = activeTrigger;
    activeTrigger = null;

    // Facing Logic Interaction
    // Instead of checking center point, we check a point in front of the player
    let targetX = pCx;
    let targetY = pCy;
    const reach = 16; // Interaction range

    // Direction: 0=Down, 1=Left, 2=Up, 3=Right
    if (player.direction === 0) targetY += reach;
    else if (player.direction === 1) targetX -= reach;
    else if (player.direction === 2) targetY -= reach;
    else if (player.direction === 3) targetX += reach;

    for (let t of triggers) {
        // Facing Logic: Check if point in front of player is inside trigger
        if (targetX >= t.x && targetX <= t.x + t.w &&
            targetY >= t.y && targetY <= t.y + t.h) {
            activeTrigger = t;
            break;
        }
    }

    // Auto-Open for Touch Devices (Mobile)
    // Rule: Open only on *entry* to avoid infinite loop after closing.
    // If we are on the same trigger as last frame, do nothing.
    if (isTouchDevice) {
        if (activeTrigger && activeTrigger !== lastTrigger) {
            openModal(activeTrigger.targetId);
        }
    }

    lastTrigger = activeTrigger;

    const prompt = document.getElementById('interaction-prompt');
    if (activeTrigger) {
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
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Save context for camera offset
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

    // Draw Animations
    if (animationImg && mapAnimations.length > 0) {
        const now = performance.now() / 1000; // Use seconds
        mapAnimations.forEach(anim => {
            // Check visibility (simplified AABB)
            if (anim.x + anim.w > viewL && anim.x < viewR &&
                anim.y + anim.h > viewT && anim.y < viewB) {

                // Calculate Frame
                // Original speed was in ms, let's assume it was intended as ms per frame
                const speedInSeconds = anim.speed / 1000;
                const frameIndex = Math.floor(now / speedInSeconds) % anim.frames;
                const srcX = frameIndex * anim.w;

                ctx.drawImage(
                    animationImg,
                    srcX, 0,
                    anim.w, anim.h,
                    anim.x, anim.y,
                    anim.w, anim.h
                );
            }
        });
    }

    // Draw Player
    if (charImg) {
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

        // Debug: Show collision box
        // ctx.strokeStyle = 'red';
        // ctx.strokeRect(player.x, player.y, player.width, player.height);

    } else {
        // Fallback
        ctx.fillStyle = player.color;
        ctx.fillRect(
            player.x,
            player.y,
            player.width,
            player.height
        );
    }

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

        const startCol = Math.max(0, Math.floor(cullL / CONFIG.TILE_SIZE));
        const endCol = Math.min(gridCols, Math.ceil(cullR / CONFIG.TILE_SIZE));
        const startRow = Math.max(0, Math.floor(cullT / CONFIG.TILE_SIZE));
        const endRow = Math.min(gridRows, Math.ceil(cullB / CONFIG.TILE_SIZE));

        for (let y = startRow; y < endRow; y++) {
            for (let x = startCol; x < endCol; x++) {
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

    ctx.restore();
    ctx.restore();
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
