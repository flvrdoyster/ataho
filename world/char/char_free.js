/**
 * char_free.js — Free Movement Character Controller
 * 
 * Pixel-based free movement with the Ataho character.
 * Provides idle state machine (sit → yawn → lie → sleep),
 * eat/drink/drunk states, and sprite rendering.
 * 
 * Implements engine.js callbacks:
 *   playerInit, playerUpdate, playerDraw, playerGetState, playerOnAction
 */

// ===== Character Config =====
const CHAR_CONFIG = {
    MOVEMENT_SPEED: 240,
    ANIMATION_SPEED: 0.1,
    COLLISION_PADDING_X: 8,
    COLLISION_PADDING_Y: 0,
    IDLE_START_TIME: 4,
    DRUNK_DURATION: 10,
    HICCUP_MIN_INTERVAL: 1.0,
    HICCUP_MAX_INTERVAL: 3.0,
    HICCUP_PULSE_DURATION: 0.3,
    YAWN_MIN_INTERVAL: 4,
    YAWN_MAX_INTERVAL: 8,
    YAWN_DURATION: 1.0,
    YAWN_COUNT_LIE_DOWN: 3,
    LIE_DOWN_ANIM_SPEED: 1.0,
    SLEEP_BUBBLE_ANIM_SPEED: 0.15,
    SLEEP_BUBBLE_OFFSET_X: 12,
    SLEEP_BUBBLE_OFFSET_Y: 0
};

// ===== Character State =====
let charImg, idleImg, eatImg, drunkImg;

const player = {
    x: 100, y: 100,
    width: 16, height: 16,
    color: 'red',
    direction: 0,
    animFrame: 0,
    isMoving: false,
    stepTimer: 0,
    idleTimer: 0,
    yawnTimer: 0,
    currentYawnInterval: 6,
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
    animRemaining: Infinity,
    lastAnimLoopIdx: 0,
    drinkCount: 0,
    isDrunk: false,
    drunkTimer: 0,
    isHiccuping: false,
    hiccupPulseTimer: 0,
    hiccupIntervalTimer: 0,
    debugMode: false
};

// ===== Animation Sequences =====
const WALK_SEQUENCE = [0, 1, 2, 1, 0, 3, 4, 3];
const YAWN_SEQUENCE = [0, 1, 2, 3, 2, 1];
const LIE_DOWN_SEQUENCE = [0, 1, 2, 1];
const BUBBLE_SEQUENCE = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
const EAT_SEQUENCE = [0, 1, 2, 3, 2, 1, 0];
const DRINK_SEQUENCE = [4, 5, 6, 7, 7, 6, 5, 4];
const HICCUP_SEQUENCE = [0, 1];

function getNextYawnInterval() {
    return CHAR_CONFIG.YAWN_MIN_INTERVAL + Math.random() * (CHAR_CONFIG.YAWN_MAX_INTERVAL - CHAR_CONFIG.YAWN_MIN_INTERVAL);
}

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

    // Load idle sprite
    const idlePath = resolvePath('char/ataho-idle.png');
    idleImg = new Image();
    idleImg.src = idlePath;
    await new Promise((resolve) => {
        idleImg.onload = resolve;
        idleImg.onerror = () => { console.warn("Idle load failed"); resolve(); };
    });

    // Load eat/drink sprite
    const eatPath = resolvePath('char/ataho-eat.png');
    eatImg = new Image();
    eatImg.src = eatPath;
    await new Promise((resolve) => {
        eatImg.onload = resolve;
        eatImg.onerror = () => { console.warn("Eat load failed"); resolve(); };
    });

    // Load drunk sprite
    const drunkPath = resolvePath('char/ataho-drunk.png');
    drunkImg = new Image();
    drunkImg.src = drunkPath;
    await new Promise((resolve) => {
        drunkImg.onload = resolve;
        drunkImg.onerror = () => { console.warn("Drunk load failed"); resolve(); };
    });

    // Set initial position
    if (window.MAP_DATA && window.MAP_DATA.startPos) {
        player.x = window.MAP_DATA.startPos.x * CONFIG.TILE_SIZE;
        player.y = window.MAP_DATA.startPos.y * CONFIG.TILE_SIZE;
    } else {
        player.x = mapWidth / 2;
        player.y = mapHeight / 2;
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

function playerUpdate(dt) {
    // --- Movement Input ---
    let dx = 0, dy = 0;

    if (keys.ArrowUp || keys.w) { dy -= 1; player.direction = 2; }
    if (keys.ArrowDown || keys.s) { dy += 1; player.direction = 0; }
    if (keys.ArrowLeft || keys.a) { dx -= 1; player.direction = 1; }
    if (keys.ArrowRight || keys.d) { dx += 1; player.direction = 3; }

    if (dx !== 0 && dy !== 0) {
        const factor = Math.SQRT1_2;
        dx *= factor;
        dy *= factor;
    }

    // Touch override
    if (touchInput.active) {
        if (Math.abs(touchInput.dx) > Math.abs(touchInput.dy)) {
            player.direction = touchInput.dx > 0 ? 3 : 1;
        } else {
            player.direction = touchInput.dy > 0 ? 0 : 2;
        }
        dx = touchInput.dx;
        dy = touchInput.dy;
    }

    dx *= CHAR_CONFIG.MOVEMENT_SPEED * dt;
    dy *= CHAR_CONFIG.MOVEMENT_SPEED * dt;

    // --- Eat/Drink Animation ---
    if (player.isEating || player.isDrinking) {
        player.animTimer += dt;
        const sequence = player.isEating ? EAT_SEQUENCE : DRINK_SEQUENCE;
        const frameTime = 0.15;
        const totalFramesPassed = Math.floor(player.animTimer / frameTime);
        const currentLoopIdx = Math.floor(totalFramesPassed / sequence.length);
        player.animFrame = totalFramesPassed % sequence.length;

        if (currentLoopIdx > player.lastAnimLoopIdx) {
            if (player.isDrinking && player.drinkCount >= 3) {
                player.isDrunk = true;
                player.drunkTimer = CHAR_CONFIG.DRUNK_DURATION;
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

    // --- Drunk Timer ---
    if (player.isDrunk) {
        player.drunkTimer -= dt;
        if (player.drunkTimer <= 0) {
            player.isDrunk = false;
            player.drinkCount = 0;
            player.isHiccuping = false;
        }
    }

    player.isMoving = (dx !== 0 || dy !== 0);

    // Move-to-close modal/bubble
    if (player.isMoving && (isBubbleOpen || isModalOpen) && performance.now() - lastBubbleTime > 500) {
        closeModal();
    }

    // --- Idle State Machine ---
    if (player.isMoving) {
        player.idleTimer = 0;
        player.yawnTimer = 0;
        player.yawnCount = 0;
        player.isIdle = false;
        player.isYawning = false;
        player.isLyingDown = false;
        player.isEating = false;
        player.isDrinking = false;
        player.lieDownTimer = 0;

        player.stepTimer += dt;
        if (player.stepTimer >= CHAR_CONFIG.ANIMATION_SPEED) {
            player.stepTimer = 0;
            player.animFrame = (player.animFrame + 1) % WALK_SEQUENCE.length;
        }
    } else {
        if (!player.isEating && !player.isDrinking && !player.isHiccuping) {
            player.animFrame = 0;
        }
        player.stepTimer = 0;

        // Drunk idle → hiccup
        if (player.isDrunk && !player.isEating && !player.isDrinking) {
            player.isIdle = false;
            player.isYawning = false;
            player.isLyingDown = false;
            player.idleTimer += dt;

            if (player.idleTimer >= 0.5) {
                if (!player.isHiccuping) {
                    player.hiccupIntervalTimer -= dt;
                    if (player.hiccupIntervalTimer <= 0) {
                        player.isHiccuping = true;
                        player.hiccupPulseTimer = CHAR_CONFIG.HICCUP_PULSE_DURATION;
                        player.animTimer = 0;
                    }
                } else {
                    player.hiccupPulseTimer -= dt;
                    if (player.hiccupPulseTimer <= 0) {
                        player.isHiccuping = false;
                        player.hiccupIntervalTimer = CHAR_CONFIG.HICCUP_MIN_INTERVAL + Math.random() * (CHAR_CONFIG.HICCUP_MAX_INTERVAL - CHAR_CONFIG.HICCUP_MIN_INTERVAL);
                    } else {
                        const sequence = HICCUP_SEQUENCE;
                        const frameTime = 0.15;
                        player.animFrame = Math.floor((CHAR_CONFIG.HICCUP_PULSE_DURATION - player.hiccupPulseTimer) / frameTime) % sequence.length;
                    }
                }
            }
            // Skip normal idle
        } else {
            player.isHiccuping = false;
            player.hiccupIntervalTimer = 0;

            if (!isModalOpen && !isBubbleOpen) {
                player.idleTimer += dt;
            } else {
                player.idleTimer = 0;
                player.isIdle = false;
            }

            if (player.idleTimer >= CHAR_CONFIG.IDLE_START_TIME) {
                if (!player.isIdle) {
                    player.isIdle = true;
                    player.currentYawnInterval = getNextYawnInterval();
                }

                if (player.isLyingDown) {
                    player.lieDownTimer += dt;
                    if (player.lieDownTimer >= CHAR_CONFIG.LIE_DOWN_ANIM_SPEED) {
                        player.lieDownTimer = 0;
                        player.lieDownFrame = (player.lieDownFrame + 1) % LIE_DOWN_SEQUENCE.length;
                    }
                    player.bubbleTimer += dt;
                    if (player.bubbleTimer >= CHAR_CONFIG.SLEEP_BUBBLE_ANIM_SPEED) {
                        player.bubbleTimer = 0;
                        player.bubbleFrame = (player.bubbleFrame + 1) % BUBBLE_SEQUENCE.length;
                    }
                } else {
                    player.yawnTimer += dt;
                    if (player.isYawning) {
                        const totalYawnFrames = YAWN_SEQUENCE.length;
                        const frameTime = CHAR_CONFIG.YAWN_DURATION / totalYawnFrames;
                        player.yawnFrame = Math.floor((player.yawnTimer - player.currentYawnInterval) / frameTime);
                        if (player.yawnFrame >= totalYawnFrames) {
                            player.isYawning = false;
                            player.yawnTimer = 0;
                            player.yawnCount++;
                            player.currentYawnInterval = getNextYawnInterval();
                        }
                    } else if (player.yawnTimer >= player.currentYawnInterval) {
                        if (player.yawnCount >= CHAR_CONFIG.YAWN_COUNT_LIE_DOWN) {
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
    }

    // --- Collision & Movement ---
    const padX = CHAR_CONFIG.COLLISION_PADDING_X;
    const padY = CHAR_CONFIG.COLLISION_PADDING_Y;

    let nextX = player.x + dx;
    if (!checkCollision(nextX - padX, player.y - padY, player.width + padX * 2, player.height + padY * 2)) {
        player.x = nextX;
    }

    let nextY = player.y + dy;
    if (!checkCollision(player.x - padX, nextY - padY, player.width + padX * 2, player.height + padY * 2)) {
        player.y = nextY;
    }

    // Clamp to map
    if (player.x < 0) player.x = 0;
    if (player.y < 0) player.y = 0;
    if (player.x > mapWidth - player.width) player.x = mapWidth - player.width;
    if (player.y > mapHeight - player.height) player.y = mapHeight - player.height;
}

function playerDraw(ctx) {
    // Drunk state (priority when idle)
    if (player.isDrunk && !player.isMoving && !player.isEating && !player.isDrinking && drunkImg) {
        const spriteW = 48, spriteH = 64;
        const sequence = HICCUP_SEQUENCE;
        const frameIdx = player.isHiccuping ? (sequence[player.animFrame] || 0) : 0;
        const srcX = frameIdx * spriteW;
        const dstX = Math.floor(player.x + 8 - spriteW / 2);
        const dstY = Math.floor(player.y + 16 - spriteH);
        ctx.drawImage(drunkImg, srcX, 0, spriteW, spriteH, dstX, dstY, spriteW, spriteH);
    }
    // Eating / Drinking
    else if ((player.isEating || player.isDrinking) && eatImg) {
        const spriteW = 48, spriteH = 64;
        const sequence = player.isEating ? EAT_SEQUENCE : DRINK_SEQUENCE;
        const frameIdx = sequence[player.animFrame] || 0;
        const srcX = frameIdx * spriteW;
        const dstX = Math.floor(player.x + 8 - spriteW / 2);
        const dstY = Math.floor(player.y + 16 - spriteH);
        ctx.drawImage(eatImg, srcX, 0, spriteW, spriteH, dstX, dstY, spriteW, spriteH);
    }
    // Idle (sitting / yawning / lying)
    else if (player.isIdle && idleImg) {
        let srcX, srcY, spriteW, spriteH;
        if (player.isLyingDown) {
            spriteW = 56; spriteH = 32;
            const frameIdx = LIE_DOWN_SEQUENCE[player.lieDownFrame] || 0;
            srcX = frameIdx * spriteW;
            srcY = 54;
        } else {
            spriteW = 48; spriteH = 54;
            let frameIdx = 4; // Sitting default
            if (player.isYawning) frameIdx = YAWN_SEQUENCE[player.yawnFrame] || 0;
            srcX = frameIdx * spriteW;
            srcY = 0;
        }
        const dstX = Math.floor(player.x + 8 - spriteW / 2);
        const dstY = Math.floor(player.y + 16 - spriteH);
        ctx.drawImage(idleImg, srcX, srcY, spriteW, spriteH, dstX, dstY, spriteW, spriteH);

        // Sleep bubble
        if (player.isLyingDown) {
            const bubbleW = 16, bubbleH = 16;
            const bFrameIdx = BUBBLE_SEQUENCE[player.bubbleFrame] || 0;
            ctx.drawImage(idleImg,
                bFrameIdx * bubbleW, 86, bubbleW, bubbleH,
                dstX + CHAR_CONFIG.SLEEP_BUBBLE_OFFSET_X,
                dstY + CHAR_CONFIG.SLEEP_BUBBLE_OFFSET_Y,
                bubbleW, bubbleH);
        }
    }
    // Walking / Standing
    else if (charImg) {
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
    }
    // Fallback
    else {
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }
}

function playerOnAction(actionType, count = Infinity) {
    player.isEating = false;
    player.isDrinking = false;

    Object.keys(keys).forEach(k => keys[k] = false);
    player.isMoving = false;
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
    } else if (actionType === 'sit') {
        player.isIdle = true;
        player.idleTimer = CHAR_CONFIG.IDLE_START_TIME;
    } else if (actionType === 'lie') {
        player.isIdle = true;
        player.isLyingDown = true;
        player.yawnCount = CHAR_CONFIG.YAWN_COUNT_LIE_DOWN;
        player.idleTimer = CHAR_CONFIG.IDLE_START_TIME;
    } else if (actionType === 'yawn') {
        player.isIdle = true;
        player.isYawning = true;
        player.yawnFrame = 0;
        player.yawnTimer = player.currentYawnInterval;
        player.idleTimer = CHAR_CONFIG.IDLE_START_TIME;
    } else {
        player.idleTimer = 0;
    }

    player.animTimer = 0;
    player.animFrame = 0;
    player.lastAnimLoopIdx = 0;
    player.animRemaining = count || Infinity;
}

// ===== Debug Commands =====
window.skipToSitting = () => {
    player.idleTimer = CHAR_CONFIG.IDLE_START_TIME;
    player.isMoving = false;
};

window.skipToLying = () => {
    player.idleTimer = CHAR_CONFIG.IDLE_START_TIME;
    player.yawnCount = CHAR_CONFIG.YAWN_COUNT_LIE_DOWN;
    player.isMoving = false;
    player.yawnTimer = player.currentYawnInterval;
};

window.toggleIdleDebug = () => {
    player.debugMode = !player.debugMode;
    console.log("Idle Debug Mode:", player.debugMode ? "ON" : "OFF");
};
