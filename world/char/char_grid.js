/**
 * char_grid.js — Grid-based Character Controller
 * 
 * Tile-by-tile movement controller for mini-games.
 * Moves precisely one tile (16x16) at a time, aligning to the grid.
 *
 * Implements engine.js callbacks:
 *   playerInit, playerUpdate, playerDraw, playerGetState, playerOnAction
 */

// ===== Character Config =====
const CHAR_CONFIG = {
    MOVE_SPEED: 120, // Pixels per second for moving between tiles
    ANIM_SPEED: 0.15 // Walk animation speed
};

// ===== Character State =====
let charImg;

const player = {
    x: 0, y: 0,
    width: 16, height: 16,
    color: 'blue',
    direction: 0, // 0: Down, 1: Left, 2: Up, 3: Right
    animFrame: 0,
    
    // Grid movement state
    isMoving: false,
    startX: 0, startY: 0,
    targetX: 0, targetY: 0,
    moveProgress: 0,
    
    animTimer: 0
};

// ===== Animation Sequences =====
const WALK_SEQUENCE = [0, 1, 2, 1, 0, 3, 4, 3];

// ===== Engine Callbacks =====

async function playerInit(assets) {
    // Load character walk sprite
    const charPath = resolvePath(window.CHAR_ASSET || 'char/ataho-walk.png');
    if (charPath) {
        charImg = new Image();
        charImg.src = charPath;
        await new Promise((resolve) => {
            charImg.onload = resolve;
            charImg.onerror = () => { console.warn("Char load failed"); resolve(); };
        });
    }

    // Initialize position (center of map by default, snapped to grid)
    if (window.MAP_DATA && window.MAP_DATA.startPos) {
        player.x = window.MAP_DATA.startPos.x * CONFIG.TILE_SIZE;
        player.y = window.MAP_DATA.startPos.y * CONFIG.TILE_SIZE;
    } else {
        player.x = Math.floor((mapWidth / 2) / CONFIG.TILE_SIZE) * CONFIG.TILE_SIZE;
        player.y = Math.floor((mapHeight / 2) / CONFIG.TILE_SIZE) * CONFIG.TILE_SIZE;
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

function attemptMove(dirX, dirY, directionIndex) {
    if (player.isMoving) return;
    
    player.direction = directionIndex;
    
    const nextX = player.x + (dirX * CONFIG.TILE_SIZE);
    const nextY = player.y + (dirY * CONFIG.TILE_SIZE);
    
    // Boundary check
    if (nextX < 0 || nextY < 0 || nextX >= mapWidth || nextY >= mapHeight) {
        return;
    }
    
    // Collision check (pad slightly to avoid getting stuck exactly on the edge of the next tile)
    if (!checkCollision(nextX + 1, nextY + 1, player.width - 2, player.height - 2)) {
        player.isMoving = true;
        player.startX = player.x;
        player.startY = player.y;
        player.targetX = nextX;
        player.targetY = nextY;
        player.moveProgress = 0;
    }
}

function playerUpdate(dt) {
    if (!player.isMoving) {
        // --- Input Check for new move ---
        // (Wait for keys or touch input to dictate the next grid move)
        if (keys.ArrowUp || keys.w) {
            attemptMove(0, -1, 2);
        } else if (keys.ArrowDown || keys.s) {
            attemptMove(0, 1, 0);
        } else if (keys.ArrowLeft || keys.a) {
            attemptMove(-1, 0, 1);
        } else if (keys.ArrowRight || keys.d) {
            attemptMove(1, 0, 3);
        } else if (touchInput.active) {
            // Touch movement (simple 4-way direction check)
            if (Math.abs(touchInput.dx) > Math.abs(touchInput.dy)) {
                if (touchInput.dx > 0) attemptMove(1, 0, 3);
                else attemptMove(-1, 0, 1);
            } else {
                if (touchInput.dy > 0) attemptMove(0, 1, 0);
                else attemptMove(0, -1, 2);
            }
        } else {
            // Idle frame reset
            player.animFrame = 0;
            player.animTimer = 0;
        }
    }

    if (player.isMoving) {
        // --- Execute Grid Movement ---
        // moveProgress tracks pixels moved
        const moveStep = CHAR_CONFIG.MOVE_SPEED * dt;
        player.moveProgress += moveStep;
        
        if (player.moveProgress >= CONFIG.TILE_SIZE) {
            // Reached destination
            player.x = player.targetX;
            player.y = player.targetY;
            player.isMoving = false;
            
            // Auto close modals if moving
            if ((isBubbleOpen || isModalOpen) && performance.now() - lastBubbleTime > 500) {
                closeModal();
            }
        } else {
            // Interpolate position
            const ratio = player.moveProgress / CONFIG.TILE_SIZE;
            player.x = player.startX + (player.targetX - player.startX) * ratio;
            player.y = player.startY + (player.targetY - player.startY) * ratio;
        }
        
        // Walk animation
        player.animTimer += dt;
        if (player.animTimer >= CHAR_CONFIG.ANIM_SPEED) {
            player.animTimer = 0;
            player.animFrame = (player.animFrame + 1) % WALK_SEQUENCE.length;
        }
    }
}

function playerDraw(ctx) {
    if (charImg) {
        const spriteW = 48, spriteH = 64;
        const seqIndex = WALK_SEQUENCE[player.animFrame];
        const framesPerDir = 5;
        const totalFrameIndex = (player.direction * framesPerDir) + seqIndex;
        
        let framesPerRow = Math.floor(charImg.width / spriteW);
        if (framesPerRow < 1) framesPerRow = 1;
        
        const col = totalFrameIndex % framesPerRow;
        const row = Math.floor(totalFrameIndex / framesPerRow);
        
        const srcX = col * spriteW;
        const srcY = row * spriteH;
        
        const dstX = Math.floor(player.x + 8 - spriteW / 2);
        const dstY = Math.floor(player.y + 16 - spriteH);
        
        ctx.drawImage(charImg, srcX, srcY, spriteW, spriteH, dstX, dstY, spriteW, spriteH);
    } else {
        // Fallback
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }
}

function playerOnAction(actionType, count = Infinity) {
    // Basic placeholder for actions in mini-game mode
    console.log("Action Triggered:", actionType);
    player.isMoving = false;
    Object.keys(keys).forEach(k => keys[k] = false);
}
