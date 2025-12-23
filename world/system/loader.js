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
    MOVEMENT_SPEED: 8,
    ANIMATION_SPEED: 40,
    MAP_ANIM_DEFAULT_SPEED: 200,
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
        // Note: For index.html, we might not have a map param, but we default to cave for now.
        // Ideally index.html should explicitly set a global MAP_NAME variable if it's not 'cave'.
        const mapName = window.MAP_NAME || urlParams.get('map') || 'cave';

        // Determine base path to the map folder based on current page location
        let mapBase = '';
        if (window.location.pathname.includes('/world/system/')) {
            mapBase = `../maps/${mapName}/`;
        } else {
            // Assumes running from root
            mapBase = `world/maps/${mapName}/`;
        }

        // Combine base and path
        // Browser handles "folder/../other" resolution automatically in src attributes
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
        if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    });
    window.addEventListener('keyup', e => {
        if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
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

    // Set initial player position (e.g., center of map or specific start)
    player.x = mapWidth / 2;
    player.y = mapHeight / 2;

    // Start Loop
    requestAnimationFrame(gameLoop);
    console.log("Game initialized!");
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

function update() {
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

    // Apply Speed
    dx *= CONFIG.MOVEMENT_SPEED;
    dy *= CONFIG.MOVEMENT_SPEED;

    player.isMoving = (dx !== 0 || dy !== 0);

    if (player.isMoving) {
        player.stepTimer += 16; // approx 60fps -> 16ms
        if (player.stepTimer >= CONFIG.ANIMATION_SPEED) {
            player.stepTimer = 0;
            player.animFrame = (player.animFrame + 1) % WALK_SEQUENCE.length;
        }
    } else {
        player.animFrame = 0; // Reset to standing
        player.stepTimer = 0;
    }

    // Try Move X
    let nextX = player.x + dx;
    if (!checkCollision(nextX, player.y, player.width, player.height)) {
        player.x = nextX;
    }

    // Try Move Y
    let nextY = player.y + dy;
    if (!checkCollision(player.x, nextY, player.width, player.height)) {
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

    mapData.forEach(tile => {
        // Tile dest rect in world space
        const dstX = tile.gx * CONFIG.TILE_SIZE;
        const dstY = tile.gy * CONFIG.TILE_SIZE;

        // Simple AABB test
        if (dstX + CONFIG.TILE_SIZE > viewL && dstX < viewR &&
            dstY + CONFIG.TILE_SIZE > viewT && dstY < viewB) {

            ctx.drawImage(
                tilesetImg,
                tile.tx * CONFIG.TILE_SIZE, tile.ty * CONFIG.TILE_SIZE,
                CONFIG.TILE_SIZE, CONFIG.TILE_SIZE,
                dstX, dstY,
                CONFIG.TILE_SIZE, CONFIG.TILE_SIZE
            );
        }
    });

    // Draw Animations
    if (animationImg && mapAnimations.length > 0) {
        const now = Date.now();
        mapAnimations.forEach(anim => {
            // Check visibility (simplified AABB)
            if (anim.x + anim.w > viewL && anim.x < viewR &&
                anim.y + anim.h > viewT && anim.y < viewB) {

                // Calculate Frame
                const frameIndex = Math.floor(now / anim.speed) % anim.frames;
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

        mapData.forEach(tile => {
            // Tile dest rect in world space
            const dstX = tile.gx * CONFIG.TILE_SIZE;
            const dstY = tile.gy * CONFIG.TILE_SIZE;

            // Strict checking against local culling box
            // We only draw if the tile is within the "Ceiling Visibility Box"
            if (dstX + CONFIG.TILE_SIZE > cullL && dstX < cullR &&
                dstY + CONFIG.TILE_SIZE > cullT && dstY < cullB) {

                ctx.drawImage(
                    ceilingTilesetImg,
                    tile.tx * CONFIG.TILE_SIZE, tile.ty * CONFIG.TILE_SIZE,
                    CONFIG.TILE_SIZE, CONFIG.TILE_SIZE,
                    dstX, dstY,
                    CONFIG.TILE_SIZE, CONFIG.TILE_SIZE
                );
            }
        });
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

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start
window.onload = initGame;
