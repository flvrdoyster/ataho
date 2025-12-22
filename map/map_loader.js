/**
 * loader_example.js
 * 
 * Interactive Map Viewer
 * - 2x Scale
 * - Camera tracking
 * - Player movement
 */

// Configuration
const TILE_SIZE = 16;
const SCALE = 2;
// const SCALED_TILE_SIZE = TILE_SIZE * SCALE; // Removed, we render at 1x
const TILESET_PATH = 'assets/cave/cave_tile.png'; // Corrected path
const ANIMATION_PATH = 'assets/cave/cave_tile_irori.png';
const MOVEMENT_SPEED = 4; // Pixels per frame (1x scale)

let tilesetImg;
let animationImg;
let mapData = [];
let mapAnimations = []; // Store loaded animations
let mapCollisions = new Set(); // Store "gx,gy" of solid tiles
let mapWidth = 0;
let mapHeight = 0;

const player = {
    x: 100,
    y: 100,
    width: 16,
    height: 16,
    color: 'red'
};

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

// Animation Config
// Loaded from Map Data now.
// const ANIMATIONS = [...] // Removed


// Initialize
async function initGame() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    // Disable smoothing for pixel art
    ctx.imageSmoothingEnabled = false;

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
    tilesetImg = new Image();
    tilesetImg.src = TILESET_PATH;
    await new Promise((resolve, reject) => {
        tilesetImg.onload = resolve;
        tilesetImg.onerror = reject;
    });

    // 1.5 Load Animation
    animationImg = new Image();
    animationImg.src = ANIMATION_PATH;
    // Don't modify await chain too much, just let it load async or await it if critical
    // Let's await to prevent pop-in
    await new Promise((resolve, reject) => {
        animationImg.onload = resolve;
        // If it fails, log but continue?
        animationImg.onerror = () => { console.warn("Anim load failed"); resolve(); };
    });


    // 2. Load Map Data
    if (window.MAP_DATA) {
        if (Array.isArray(window.MAP_DATA)) {
            // Legacy support (just tiles)
            mapData = window.MAP_DATA;
            // Add default/legacy animations if needed, or leave empty
        } else {
            // New Object format
            mapData = window.MAP_DATA.tiles || [];

            // Transform saved animations to runtime format
            if (window.MAP_DATA.animations) {
                window.MAP_DATA.animations.forEach(animDef => {
                    // Enrich definition with runtime props if needed
                    mapAnimations.push({
                        x: animDef.x,
                        y: animDef.y,
                        w: animDef.w || 64,
                        h: animDef.h || 48,
                        frames: animDef.frames || 5, // 320 / 64 = 5 frames
                        speed: animDef.speed || 200
                    });
                });
            }

            // Load Collisions
            if (window.MAP_DATA.collisions) {
                window.MAP_DATA.collisions.forEach(col => {
                    mapCollisions.add(`${col.x},${col.y}`);
                });
            }
        }
    } else {
        // Fallback or fetch if needed
        console.warn("No MAP_DATA found in window");
        return;
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
    mapWidth = (maxGx + 1) * TILE_SIZE;
    mapHeight = (maxGy + 1) * TILE_SIZE;

    // Set initial player position (e.g., center of map or specific start)
    player.x = mapWidth / 2;
    player.y = mapHeight / 2;

    // Start Loop
    requestAnimationFrame(gameLoop);
    console.log("Game initialized!");
}

function resizeCanvas() {
    // Set internal resolution to 1x (viewport / scale)
    canvas.width = Math.ceil(window.innerWidth / SCALE);
    canvas.height = Math.ceil(window.innerHeight / SCALE);

    camera.width = canvas.width;
    camera.height = canvas.height;

    // Context settings reset on resize
    if (ctx) ctx.imageSmoothingEnabled = false;
}

function update() {
    // Player Movement
    let dx = 0;
    let dy = 0;

    if (keys.ArrowUp || keys.w) dy -= MOVEMENT_SPEED;
    if (keys.ArrowDown || keys.s) dy += MOVEMENT_SPEED;
    if (keys.ArrowLeft || keys.a) dx -= MOVEMENT_SPEED;
    if (keys.ArrowRight || keys.d) dx += MOVEMENT_SPEED;

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
    // Let's treat player.x/y as world coordinates in SCALED space for simplicity with scrolling
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
    ctx.fillStyle = '#111';
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
        const dstX = tile.gx * TILE_SIZE;
        const dstY = tile.gy * TILE_SIZE;

        // Simple AABB test
        if (dstX + TILE_SIZE > viewL && dstX < viewR &&
            dstY + TILE_SIZE > viewT && dstY < viewB) {

            ctx.drawImage(
                tilesetImg,
                tile.tx * TILE_SIZE, tile.ty * TILE_SIZE,
                TILE_SIZE, TILE_SIZE,
                dstX, dstY,
                TILE_SIZE, TILE_SIZE
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
    ctx.fillStyle = player.color;
    ctx.fillRect(
        player.x,
        player.y,
        player.width,
        player.height
    );

    ctx.restore();
    ctx.restore();
}

function checkCollision(x, y, w, h) {
    // Check all corners against collision map
    // We can optimize by converting rect to grid coordinates coverage
    // Player is small (16x16), tile is 16x16.
    // Overlap test.

    const left = Math.floor(x / TILE_SIZE);
    const right = Math.floor((x + w - 0.1) / TILE_SIZE); // -0.1 to avoid edge case
    const top = Math.floor(y / TILE_SIZE);
    const bottom = Math.floor((y + h - 0.1) / TILE_SIZE);

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
