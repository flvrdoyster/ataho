(function () {
    if (window.ATAHO_BALANCE_GAME_LOADED) return;
    window.ATAHO_BALANCE_GAME_LOADED = true;
    //===========================================
    // CANVAS SETUP
    //===========================================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 960;
    canvas.height = 640;

    // Disable smoothing AFTER sizing (sizing resets context)
    ctx.imageSmoothingEnabled = false;

    //===========================================
    // GAME CONFIGURATION
    //===========================================

    // PHYSICS & DIFFICULTY
    const CONFIG = {
        PHYSICS: {
            SWAY_INTENSITY_IDLE: 0.008,   // Intensity of random sway when standing still (higher = harder)
            SWAY_INTENSITY_WALK: 0.005,   // Intensity of random sway when walking (lower than idle for stability)
            PLAYER_CONTROL_FORCE: 0.8,   // Force applied by player input (Left/Right arrows or touch)
            FRICTION: 0.90,              // Damping factor for balance velocity (lower = slippery, higher = sticky)
            MAX_VELOCITY: 3.5,           // Maximum speed the character can tilt
            INERTIA_CONSTANT: 0.0008,    // Force added based on current tilt (makes it harder to recover from large tilts)
            GRAVITY: 0.4,                // Gravity applied during jumps
            EDGE_THRESHOLD: 0,           // Tilt threshold where "edge resistance" kicks in (0 = disabled)
            EDGE_RESISTANCE: 0.02,       // Force pushing back against the tilt at extreme angles (helper)
            FATIGUE_RATE: 0.005          // Rate at which sway intensity increases over time if perfectly balanced
        },
        JUMP: {
            CHARGE_TIME: 60,             // Frames required to charge each jump level (hold space)
            JUMP_COOLDOWN: 20,           // Frames to wait before jumping again
            DISTANCES: [28, 46, 58],     // Forward distance traveled for each jump level [Level 1, Level 2, Level 3]
            VELOCITIES: [2, 3, 4],       // Vertical jump velocity (height) for each level
            LANDING_PENALTIES: [5, 10, 15] // Instability added to balance upon landing for each level
        },
        OBSTACLES: {
            START_DELAY: 66,            // Initial distance before the first obstacle appears
            MIN_GAP: 22,                 // Minimum gap between obstacle groups
            PATTERNS: [                  // Array of obstacle generation patterns
                { type: 'SINGLE', groups: [{ count: 1, gap: 0 }] },
                { type: 'DOUBLE_TIGHT', groups: [{ count: 2, gap: 0 }] },
                { type: 'DOUBLE_LOOSE', groups: [{ count: 2, gap: 22 }] },
                { type: 'TRIPLE', groups: [{ count: 3, gap: 0 }] },
                { type: 'COMBO_2_2', groups: [{ count: 2, gap: 0 }, { count: 2, gap: 0 }], groupGap: 22 },
                { type: 'COMBO_1_2', groups: [{ count: 1, gap: 0 }, { count: 2, gap: 0 }], groupGap: 22 },
                { type: 'COMBO_3_1', groups: [{ count: 3, gap: 0 }, { count: 1, gap: 0 }], groupGap: 22 },
                { type: 'COMBO_3_2', groups: [{ count: 3, gap: 0 }, { count: 2, gap: 0 }], groupGap: 22 },
                { type: 'COMBO_3_3', groups: [{ count: 3, gap: 0 }, { count: 3, gap: 0 }], groupGap: 22 }
            ]
        },
        HITBOXES: {
            CHAR: { x: 34, y: 64, w: 12, h: 12 }, // Character hitbox relative to sprite [x, y, width, height]
            OBS: { x: 26, y: 0, w: 16, h: 16 }    // Obstacle hitbox relative to sprite [x, y, width, height]
        },
        SPEED: {
            GAME: 2                      // Global game speed (pixels per frame)
        },
        DEBUG: {
            SHOW_HITBOX: false,           // Toggle to show/hide debug hitboxes (red/blue rectangles)
            FORCE_MOBILE_MODE: true      // Force mobile mode (UI, controls, score) for debugging
        }
    };

    // CORE CONSTANTS
    const SCALE_FACTOR = 1.0;
    const ANIMATION_FPS_DIVISOR = 10;
    const BALANCE_THRESHOLD = { SLIGHT: 20, MEDIUM: 55, LARGE: 80, MAX: 100 };

    // SPRITE CONSTANTS
    const SPRITE_WIDTH = 80;
    const SPRITE_HEIGHT = 96;
    const FALLEN_OFFSET_X = 47;
    const FALLING_OFFSET_X = 20;
    const FALLEN_OFFSET_Y = 13;

    // LAYOUT CONSTANTS
    const TOUCH_DEADZONE = 0.05;
    const TOUCH_UPPER_ZONE = 0.25;
    const TOUCH_LOWER_ZONE = 0.75;
    const BUTTON_WIDTH = 200;
    const BUTTON_HEIGHT = 60;

    //===========================================
    // GAME STATE
    //===========================================
    let distanceTraveled = 0;
    let backgroundY = 0;
    let isGameOver = false;
    let currentRAFId = null;

    let obstacles = [];
    let nextObstacleY = CONFIG.OBSTACLES.START_DELAY;

    let bgm = null;
    let overBgm = null;

    // Image Paths
    const imagePaths = {
        spriteSheet: 'balance_char.png',
        background: 'balance_bg.png',
        beamStart: 'beam_start.png',
        beamMid: 'beam_mid.png',
        beamEnd: 'beam_end.png',
        beamSpike: 'beam_spike.png'
    };

    const images = {};

    // Image Loading
    function loadImages() {
        const promises = Object.keys(imagePaths).map(key => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    images[key] = img;
                    resolve();
                };
                img.onerror = reject;
                img.src = imagePaths[key];
            });
        });
        return Promise.all(promises);
    }

    // Font Loading
    function loadFonts() {
        const font = new FontFace('Raster Forge', 'url(https://fonts.cdnfonts.com/s/123917/RasterForgeRegular-XGDg9.woff)');
        return font.load().then(loadedFont => {
            document.fonts.add(loadedFont);
        });
    }

    // Audio Loading
    function loadAudio() {
        const bgmPromise = new Promise((resolve, reject) => {
            bgm = new Audio('duel.mp3');
            bgm.loop = true;
            bgm.volume = 0.5;
            bgm.addEventListener('canplaythrough', () => resolve(), { once: true });
            bgm.addEventListener('error', (e) => reject(e));
            bgm.load();
        });

        const overBgmPromise = new Promise((resolve, reject) => {
            overBgm = new Audio('over.mp3');
            overBgm.loop = false; // Game Over music usually plays once or loops, user didn't specify, but usually looping is fine or once. Let's loop for now as requested "background music".
            overBgm.loop = true;
            overBgm.volume = 0.5;
            overBgm.addEventListener('canplaythrough', () => resolve(), { once: true });
            overBgm.addEventListener('error', (e) => reject(e));
            overBgm.load();
        });

        return Promise.all([bgmPromise, overBgmPromise]);
    }

    // Helper: Check if mobile device
    function isMobile() {
        return CONFIG.DEBUG.FORCE_MOBILE_MODE || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    //===========================================
    // SPRITES & GAME DATA
    //===========================================
    const frames = {
        walking: { x: [0, 80, 160], y: 0, width: 80, height: 96 },
        jumping: { x: [240, 480, 480, 320], y: [0, 192, 288, 0], width: 80, height: 96 },
        falling: { left: { x: 400, y: 0, width: 80, height: 96 }, right: { x: 480, y: 0, width: 80, height: 96 } },
        fallen: { x: 480, y: 96, width: 80, height: 96 },
        leaning_left_slight: { x: [0, 80, 160], y: 96, width: 80, height: 96 },
        leaning_left_medium: { x: [0, 80, 160], y: 192, width: 80, height: 96 },
        leaning_left_large: { x: [0, 80, 160], y: 288, width: 80, height: 96 },
        leaning_right_slight: { x: [240, 320, 400], y: 96, width: 80, height: 96 },
        leaning_right_medium: { x: [240, 320, 400], y: 192, width: 80, height: 96 },
        leaning_right_large: { x: [240, 320, 400], y: 288, width: 80, height: 96 }
    };

    const leanStateToFrameMap = {
        'balanced': frames.walking,
        'leaning_left_slight': frames.leaning_left_slight,
        'leaning_left_medium': frames.leaning_left_medium,
        'leaning_left_large': frames.leaning_left_large,
        'leaning_right_slight': frames.leaning_right_slight,
        'leaning_right_medium': frames.leaning_right_medium,
        'leaning_right_large': frames.leaning_right_large,
    };

    const jumpChargeFrames = [
        { x: frames.jumping.x[0], y: frames.jumping.y[0], width: SPRITE_WIDTH, height: SPRITE_HEIGHT },
        { x: frames.jumping.x[1], y: frames.jumping.y[1], width: SPRITE_WIDTH, height: SPRITE_HEIGHT },
        { x: frames.jumping.x[2], y: frames.jumping.y[2], width: SPRITE_WIDTH, height: SPRITE_HEIGHT }
    ];

    // Pre-allocate jumping frame object to avoid GC
    const jumpingFrame = { x: frames.jumping.x[3], y: frames.jumping.y[3], width: SPRITE_WIDTH, height: SPRITE_HEIGHT };

    const walkAnimationSequence = [0, 1, 2, 1];
    const inputState = {};

    const ataho = {
        x: canvas.width / 2 - (frames.walking.width * SCALE_FACTOR) / 2,
        y: canvas.height / 2 - (frames.walking.height * SCALE_FACTOR) / 2,
        width: frames.walking.width * SCALE_FACTOR,
        height: frames.walking.height * SCALE_FACTOR,

        actionState: 'idle',
        leanState: 'balanced',

        balanceLevel: 0,
        balanceVelocity: 0,
        fallDirection: null,
        fallTimer: 0,
        balanceTimer: 0,
        animationTimer: 0,

        jumpChargeTimer: 0,
        jumpCooldown: 0,
        jumpLevel: 0,
        jumpVelocityY: 0,
        visualY: 0,

        update() {
            if (this.actionState === 'jumping') {
                this.visualY -= this.jumpVelocityY;
                this.jumpVelocityY -= CONFIG.PHYSICS.GRAVITY;

                // Calculate required speed to hit target distance
                // Air Time = (2 * InitialVelocity) / Gravity
                const airTime = (2 * CONFIG.JUMP.VELOCITIES[this.jumpLevel]) / CONFIG.PHYSICS.GRAVITY;
                const currentJumpSpeed = CONFIG.JUMP.DISTANCES[this.jumpLevel] / airTime;

                distanceTraveled += currentJumpSpeed;
                backgroundY -= currentJumpSpeed;

                if (this.visualY >= 0) {
                    this.visualY = 0;
                    this.actionState = 'idle';
                    this.jumpVelocityY = 0;
                    this.jumpCooldown = CONFIG.JUMP.JUMP_COOLDOWN;

                    // Prevent auto-walking upon landing (require fresh input)
                    inputState.down = false;
                    inputState.up = false;

                    // Landing Instability
                    const penalty = CONFIG.JUMP.LANDING_PENALTIES[this.jumpLevel];
                    const direction = Math.random() < 0.5 ? -1 : 1;
                    this.balanceLevel += penalty * direction;
                    this.balanceVelocity += (penalty * direction) * 0.1; // Add some momentum

                    // Obstacle Landing Collision
                    // Check if feet (ataho.y + ataho.height) are inside any obstacle in SCREEN SPACE
                    // Player Feet Y is constant: ataho.y + ataho.height
                    // Obstacle Screen Y: startY - distanceTraveled + obs.y

                    const playerFeetY = this.y + this.height;
                    const startY = canvas.height / 2;

                    const landedOnObstacle = obstacles.some(obs => {
                        // Ignore obstacles behind us
                        if (distanceTraveled > obs.y + obs.height) return false;

                        const obsScreenY = startY - distanceTraveled + obs.y;

                        // Tight Hitbox Collision - Landing
                        const playerHitboxTop = this.y + CONFIG.HITBOXES.CHAR.y;
                        const playerHitboxBottom = this.y + CONFIG.HITBOXES.CHAR.y + CONFIG.HITBOXES.CHAR.h;

                        const obsHitboxTop = obsScreenY + CONFIG.HITBOXES.OBS.y;
                        const obsHitboxBottom = obsScreenY + CONFIG.HITBOXES.OBS.y + CONFIG.HITBOXES.OBS.h;

                        // We land if our feet (hitbox vertical range) overlaps the obstacle's vertical range
                        // AABB Overlap: (Range1.Start < Range2.End) && (Range1.End > Range2.Start)
                        const isHit = playerHitboxTop < obsHitboxBottom && playerHitboxBottom > obsHitboxTop;
                        if (isHit) {
                            obs.causedDeath = true;
                        }
                        return isHit;
                    });

                    if (landedOnObstacle) {
                        this.actionState = 'falling';
                        // Fall towards the tilt, or random if perfectly balanced
                        if (this.balanceLevel !== 0) {
                            this.fallDirection = this.balanceLevel > 0 ? 'right' : 'left';
                        } else {
                            this.fallDirection = Math.random() < 0.5 ? 'right' : 'left';
                        }
                    }
                }
                return;
            }

            if (this.jumpCooldown > 0) {
                this.jumpCooldown--;
            }

            if (inputState.space && this.jumpCooldown <= 0 && !this.actionState.includes('fall')) {
                if (!this.actionState.includes('jump_charging')) {
                    this.actionState = 'jump_charging';
                    this.jumpChargeTimer = 0;
                    this.jumpLevel = 0;
                } else {
                    this.jumpChargeTimer++;
                    const cycleTime = CONFIG.JUMP.CHARGE_TIME * 3;
                    const effectiveTimer = this.jumpChargeTimer % cycleTime;

                    if (effectiveTimer >= CONFIG.JUMP.CHARGE_TIME * 2) {
                        this.jumpLevel = 2;
                    } else if (effectiveTimer >= CONFIG.JUMP.CHARGE_TIME) {
                        this.jumpLevel = 1;
                    } else {
                        this.jumpLevel = 0;
                    }
                }
                return;
            } else if (this.actionState.includes('jump_charging')) {
                this.actionState = 'jumping';
                this.jumpVelocityY = CONFIG.JUMP.VELOCITIES[this.jumpLevel];
                return;
            }

            let inputForce = 0;

            if (typeof inputState.touchForce === 'number' && inputState.touchForce !== 0) {
                inputForce = inputState.touchForce * CONFIG.PHYSICS.PLAYER_CONTROL_FORCE * 1.5;
            }
            else if (inputState.left) {
                inputForce = -CONFIG.PHYSICS.PLAYER_CONTROL_FORCE;
            } else if (inputState.right) {
                inputForce = CONFIG.PHYSICS.PLAYER_CONTROL_FORCE;
            }

            const currentSwayIntensity = (this.actionState.includes('walking')) ? CONFIG.PHYSICS.SWAY_INTENSITY_WALK : CONFIG.PHYSICS.SWAY_INTENSITY_IDLE;

            // Balance Fatigue: Increase sway if staying balanced for too long
            if (Math.abs(this.balanceLevel) < BALANCE_THRESHOLD.SLIGHT) {
                this.balanceTimer++;
            } else {
                this.balanceTimer = 0;
            }

            const instabilityMultiplier = 1 + (this.balanceTimer * CONFIG.PHYSICS.FATIGUE_RATE);
            const swayForce = (Math.random() - 0.5) * currentSwayIntensity * instabilityMultiplier;

            const inertiaForce = this.balanceLevel * CONFIG.PHYSICS.INERTIA_CONSTANT;

            // Edge Resistance (Reverse Acceleration)
            let edgeForce = 0;
            if (Math.abs(this.balanceLevel) > CONFIG.PHYSICS.EDGE_THRESHOLD) {
                const sign = this.balanceLevel > 0 ? 1 : -1;
                edgeForce = -sign * CONFIG.PHYSICS.EDGE_RESISTANCE;
            }

            this.balanceVelocity += inputForce + swayForce + inertiaForce + edgeForce;
            this.balanceVelocity *= CONFIG.PHYSICS.FRICTION;

            if (this.balanceVelocity > CONFIG.PHYSICS.MAX_VELOCITY) this.balanceVelocity = CONFIG.PHYSICS.MAX_VELOCITY;
            if (this.balanceVelocity < -CONFIG.PHYSICS.MAX_VELOCITY) this.balanceVelocity = -CONFIG.PHYSICS.MAX_VELOCITY;

            this.balanceLevel += this.balanceVelocity;

            if (this.balanceLevel >= BALANCE_THRESHOLD.MAX) {
                this.actionState = 'falling';
                this.fallDirection = 'right';
            } else if (this.balanceLevel <= -BALANCE_THRESHOLD.MAX) {
                this.actionState = 'falling';
                this.fallDirection = 'left';
            } else if (distanceTraveled < -20) {
                this.actionState = 'falling';
                this.fallDirection = this.balanceLevel >= 0 ? 'right' : 'left';
            }

            const absBalance = Math.abs(this.balanceLevel);
            const direction = this.balanceLevel < 0 ? 'left' : 'right';

            if (absBalance < BALANCE_THRESHOLD.SLIGHT) {
                this.leanState = 'balanced';
            } else {
                let leanLevel = 'slight';
                if (absBalance >= BALANCE_THRESHOLD.LARGE) {
                    leanLevel = 'large';
                } else if (absBalance >= BALANCE_THRESHOLD.MEDIUM) {
                    leanLevel = 'medium';
                }
                this.leanState = `leaning_${direction}_${leanLevel}`;
            }

            if (this.actionState !== 'falling' && this.actionState !== 'fallen') {
                // Control Fix: Down = Forward
                if (inputState.down) {
                    this.actionState = 'walking';
                } else {
                    this.actionState = 'idle';
                }

                if (this.actionState === 'walking') {
                    const nextDist = distanceTraveled + CONFIG.SPEED.GAME;

                    // Obstacle Walking Collision
                    const startY = canvas.height / 2;

                    const blocked = obstacles.some(obs => {
                        // Ignore obstacles behind us
                        if (distanceTraveled > obs.y + obs.height) return false;

                        const obsScreenY = startY - nextDist + obs.y;

                        // Tight Hitbox Collision - Walking
                        const playerTop = this.y + CONFIG.HITBOXES.CHAR.y;
                        const playerBottom = this.y + CONFIG.HITBOXES.CHAR.y + CONFIG.HITBOXES.CHAR.h;

                        const obsTop = obsScreenY + CONFIG.HITBOXES.OBS.y;
                        const obsBottom = obsScreenY + CONFIG.HITBOXES.OBS.y + CONFIG.HITBOXES.OBS.h;

                        // Standard AABB overlap check
                        const isOverlapping = (playerTop < obsBottom && playerBottom > obsTop);
                        return isOverlapping;
                    });

                    if (!blocked) {
                        distanceTraveled += CONFIG.SPEED.GAME;
                        backgroundY -= CONFIG.SPEED.GAME;
                    }
                    // If blocked, we don't move, but animation continues (feet shuffling)
                }
            }

            if (this.actionState === 'falling') {
                this.fallTimer++;
                if (this.fallTimer >= 30) {
                    this.actionState = 'fallen';
                    isGameOver = true;
                    if (bgm) {
                        bgm.pause();
                        bgm.currentTime = 0;
                    }
                    if (overBgm) {
                        overBgm.currentTime = 0;
                        overBgm.play().catch(e => console.log('Over BGM play failed', e));
                    }
                }
            }

            if (this.actionState.includes('walking')) {
                this.animationTimer++;
            }
        },

        draw() {
            let currentFrameSet = frames.walking;
            let finalX = this.x;
            let finalY = this.y;
            let frameIndex = 0;

            if (this.actionState === 'falling') {
                currentFrameSet = this.fallDirection === 'left' ? frames.falling.left : frames.falling.right;
                if (this.fallDirection === 'left') finalX -= FALLING_OFFSET_X;
                else finalX += FALLING_OFFSET_X / 2;
            } else if (this.actionState === 'fallen') {
                currentFrameSet = frames.fallen;
                if (this.fallDirection === 'left') finalX -= FALLEN_OFFSET_X;
                else finalX += FALLEN_OFFSET_X;
                finalY += FALLEN_OFFSET_Y;
            } else if (this.actionState.includes('jump_charging')) {
                currentFrameSet = jumpChargeFrames[this.jumpLevel];

            } else if (this.actionState === 'jumping') {
                currentFrameSet = jumpingFrame;
            } else {
                if (leanStateToFrameMap[this.leanState]) {
                    currentFrameSet = leanStateToFrameMap[this.leanState];
                }
            }

            finalY += this.visualY;

            if (this.actionState.includes('walking')) {
                if (currentFrameSet.x && Array.isArray(currentFrameSet.x) && currentFrameSet.x.length > 1) {
                    const sequence = walkAnimationSequence;
                    const sequenceIndex = Math.floor(this.animationTimer / ANIMATION_FPS_DIVISOR) % sequence.length;
                    frameIndex = sequence[sequenceIndex];
                }
            } else {
                frameIndex = 0;
            }

            let sourceX = Array.isArray(currentFrameSet.x) ? currentFrameSet.x[frameIndex] : currentFrameSet.x;
            let sourceY = Array.isArray(currentFrameSet.y) ? currentFrameSet.y[frameIndex] : currentFrameSet.y;

            let rotationAngle = 0;
            if (this.actionState === 'jumping') {
                rotationAngle = (this.balanceLevel / BALANCE_THRESHOLD.MAX) * 0.5;
            }

            if (rotationAngle !== 0) {
                ctx.save();
                const pivotX = finalX + this.width / 2;
                const pivotY = finalY + this.height;
                ctx.translate(pivotX, pivotY);
                ctx.rotate(rotationAngle);
                ctx.translate(-pivotX, -pivotY);
            }

            ctx.drawImage(
                images.spriteSheet,
                sourceX,
                sourceY,
                currentFrameSet.width,
                currentFrameSet.height,
                finalX,
                finalY,
                this.width,
                this.height
            );

            if (rotationAngle !== 0) {
                ctx.restore();
            }

            // Debug Hitbox
            if (CONFIG.DEBUG.SHOW_HITBOX) {
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    finalX + CONFIG.HITBOXES.CHAR.x,
                    finalY + CONFIG.HITBOXES.CHAR.y,
                    CONFIG.HITBOXES.CHAR.w,
                    CONFIG.HITBOXES.CHAR.h
                );
            }
        }
    };

    function resetGame() {
        isGameOver = false;
        if (overBgm) {
            overBgm.pause();
            overBgm.currentTime = 0;
        }
        if (bgm) {
            bgm.currentTime = 0;
            bgm.play().catch(e => console.log('BGM play failed', e));
        }
        ataho.balanceLevel = 0;
        ataho.balanceVelocity = 0;
        ataho.actionState = 'idle';
        ataho.leanState = 'balanced';

        ataho.fallTimer = 0;
        ataho.balanceTimer = 0;
        ataho.x = canvas.width / 2 - (frames.walking.width * SCALE_FACTOR) / 2;
        ataho.y = canvas.height / 2 - (frames.walking.height * SCALE_FACTOR) / 2;
        ataho.visualY = 0;
        ataho.jumpVelocityY = 0;
        ataho.jumpLevel = 0;
        distanceTraveled = 0;
        backgroundY = 0;

        obstacles = [];
        nextObstacleY = CONFIG.OBSTACLES.START_DELAY;

        Object.keys(inputState).forEach(key => inputState[key] = false);
        inputState.touchForce = 0;

        // byFrame() is already running continuously, so we don't need to call it here.
        // Calling it would create a duplicate loop (double speed).
    }

    function isClickInsideButton(clickX, clickY, button) {
        return clickX >= button.x && clickX <= button.x + button.width &&
            clickY >= button.y && clickY <= button.y + button.height;
    }

    // Utility: Clamp value
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Event Handlers
    const handleKeyDown = (e) => {
        if (e.repeat || isGameOver) return;
        switch (e.code) {
            case 'KeyS':
            case 'ArrowDown':
                inputState.down = true;
                break;
            case 'KeyW':
            case 'ArrowUp':
                inputState.up = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                inputState.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                inputState.right = true;
                break;
            case 'Space':
                inputState.space = true;
                break;
        }
    };

    const handleKeyUp = (e) => {
        if (isGameOver) return;
        switch (e.code) {
            case 'KeyS':
            case 'ArrowDown':
                inputState.down = false;
                break;
            case 'KeyW':
            case 'ArrowUp':
                inputState.up = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                inputState.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                inputState.right = false;
                break;
            case 'Space':
                inputState.space = false;
                break;
        }
    };

    const handleCanvasClick = (e) => {
        if (!isGameOver) return;

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;

        console.log('Click:', clickX, clickY, 'Btn:', buttons.continue);

        if (isClickInsideButton(clickX, clickY, buttons.continue)) {
            resetGame();
        } else if (isClickInsideButton(clickX, clickY, buttons.exit)) {
            window.location.href = '../index.html';
        }
    };

    const handleMouseMove = (e) => {
        if (!isGameOver) {
            canvas.style.cursor = 'default';
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        if (isClickInsideButton(mouseX, mouseY, buttons.continue) ||
            isClickInsideButton(mouseX, mouseY, buttons.exit)) {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'default';
        }
    };

    const handleTouchEnd = (e) => {
        e.preventDefault();
        inputState.touchForce = 0;
        inputState.up = false;
        inputState.down = false;
    };

    const handleTouch = (e) => {
        e.preventDefault();

        if (isGameOver && e.type === 'touchstart') {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const touchX = (e.touches[0].clientX - rect.left) * scaleX;
            const touchY = (e.touches[0].clientY - rect.top) * scaleY;

            if (isClickInsideButton(touchX, touchY, buttons.continue)) {
                resetGame();
            } else if (isClickInsideButton(touchX, touchY, buttons.exit)) {
                window.location.href = '../index.html';
            }
            return;
        }

        if (isGameOver) return;

        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const maxDistX = window.innerWidth / 2;
        let distRatio = clamp((touchX - centerX) / maxDistX, -1, 1);

        if (Math.abs(distRatio) < TOUCH_DEADZONE) distRatio = 0;

        inputState.touchForce = distRatio;

        const screenHeight = window.innerHeight;

        inputState.up = false;
        inputState.down = false;

        if (touchY < screenHeight * TOUCH_UPPER_ZONE) {
            inputState.up = true;
        } else if (touchY > screenHeight * TOUCH_LOWER_ZONE) {
            inputState.down = true;
        }
    };

    const buttons = {
        continue: { x: 0, y: 0, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, text: 'Continue?' },
        exit: { x: 0, y: 0, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, text: 'Exit' }
    };

    function byFrame() {
        currentRAFId = requestAnimationFrame(byFrame);

        // Reset transform to identity to prevent accumulation from errors
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Save context for camera zoom
        ctx.save();
        try {
            // Translate to center, scale, translate back
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(2, 2);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);

            if (!isGameOver) {
                ataho.update();

                if (backgroundY <= -canvas.height) {
                    backgroundY += canvas.height;
                }
                if (backgroundY > 0) {
                    backgroundY -= canvas.height;
                }

                // Obstacle Generation
                if (images.beamSpike) {
                    const generateHorizon = distanceTraveled + canvas.height * 2;
                    while (nextObstacleY < generateHorizon) {
                        const spikeHeight = images.beamSpike.height;

                        // Pick a random pattern
                        const pattern = CONFIG.OBSTACLES.PATTERNS[Math.floor(Math.random() * CONFIG.OBSTACLES.PATTERNS.length)];

                        if (pattern.groups) {
                            pattern.groups.forEach((group, index) => {
                                for (let i = 0; i < group.count; i++) {
                                    obstacles.push({
                                        y: nextObstacleY,
                                        height: spikeHeight
                                    });
                                    nextObstacleY += spikeHeight + group.gap;
                                }
                                // Add group gap if not the last group
                                if (index < pattern.groups.length - 1) {
                                    nextObstacleY += pattern.groupGap;
                                }
                            });
                        } else {
                            // Fallback for old patterns (just in case)
                            for (let i = 0; i < pattern.count; i++) {
                                obstacles.push({
                                    y: nextObstacleY,
                                    height: spikeHeight
                                });
                                nextObstacleY += spikeHeight + pattern.gap;
                            }
                        }

                        // Add gap before next sequence
                        nextObstacleY += CONFIG.OBSTACLES.MIN_GAP + (Math.random() * 120);
                    }

                    // Cleanup old obstacles
                    if (obstacles.length > 0) {
                        // Remove if completely off-screen (top)
                        // Screen Y = startY - distanceTraveled + obs.y
                        // If Screen Y + height < 0, it's gone.
                        const startY = canvas.height / 2;
                        const firstObsScreenY = startY - distanceTraveled + obstacles[0].y;
                        if (firstObsScreenY + obstacles[0].height < -100) {
                            obstacles.shift();
                        }
                    }
                }
            }

            if (images.background) {
                const bgY = Math.floor(backgroundY);
                ctx.drawImage(images.background, 0, bgY, canvas.width, canvas.height);
                ctx.drawImage(images.background, 0, bgY + canvas.height, canvas.width, canvas.height);
            }

            if (images.beamStart && images.beamMid) {
                const beamStartX = canvas.width / 2 - images.beamStart.width / 2;
                const startY = canvas.height / 2;

                let currentDrawY = startY - distanceTraveled;

                if (currentDrawY > -images.beamStart.height) {
                    ctx.drawImage(images.beamStart, beamStartX, Math.floor(currentDrawY));
                }

                let midDrawY = currentDrawY + images.beamStart.height;

                if (images.beamMidPattern) {
                    ctx.save();
                    ctx.translate(beamStartX, Math.floor(midDrawY));
                    ctx.fillStyle = images.beamMidPattern;
                    const heightNeeded = canvas.height - midDrawY;
                    if (heightNeeded > 0) {
                        ctx.fillRect(0, 0, images.beamMid.width, heightNeeded);
                    }
                    ctx.restore();
                } else {
                    while (midDrawY < canvas.height) {
                        ctx.drawImage(images.beamMid, beamStartX, Math.floor(midDrawY));
                        midDrawY += images.beamMid.height;
                    }
                }
            }

            // Draw Obstacles
            if (images.beamSpike) {
                const beamStartX = canvas.width / 2 - images.beamStart.width / 2; // Assuming spike has same width/center logic
                // User said "same width as beam". beamStart.width should be used for centering if spike is same width.
                // But we should use spike's width to be safe.
                const spikeX = canvas.width / 2 - images.beamSpike.width / 2;
                const startY = canvas.height / 2;

                obstacles.forEach(obs => {
                    // Calculate screen Y
                    // Beam logic: currentDrawY = startY - distanceTraveled
                    // Obstacle at obs.y is at: startY - distanceTraveled + obs.y
                    const drawY = startY - distanceTraveled + obs.y;

                    if (drawY > -images.beamSpike.height && drawY < canvas.height) {
                        let spriteToDraw = images.beamSpike;
                        if (obs.causedDeath && images.beamSpikeRed) {
                            spriteToDraw = images.beamSpikeRed;
                        }

                        ctx.drawImage(spriteToDraw, spikeX, drawY);

                        // Debug Hitbox
                        if (CONFIG.DEBUG.SHOW_HITBOX) {
                            ctx.strokeStyle = obs.causedDeath ? 'blue' : 'red';
                            ctx.lineWidth = 2;
                            ctx.strokeRect(
                                spikeX + CONFIG.HITBOXES.OBS.x,
                                drawY + CONFIG.HITBOXES.OBS.y,
                                CONFIG.HITBOXES.OBS.w,
                                CONFIG.HITBOXES.OBS.h
                            );
                        }
                    }
                });
            }

            ataho.draw();
        } catch (e) {
            console.error("Error in render loop:", e);
        } finally {
            // Restore context to remove zoom for UI
            ctx.restore();
        }

        ctx.font = '24px "Raster Forge", sans-serif';
        ctx.textBaseline = 'top';

        if (isMobile()) {
            const scoreText = `Score: ${(distanceTraveled / 100).toFixed(2)}`;
            const textWidth = ctx.measureText(scoreText).width;
            const padding = 10;
            const bgX = (canvas.width / 2) - (textWidth / 2) - padding;
            const bgY = 10;
            const bgWidth = textWidth + (padding * 2);
            const bgHeight = 30; // Approx height for 24px font

            // Draw Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 5);
            ctx.fill();

            // Draw Text
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText(scoreText, canvas.width / 2, bgY + padding / 2); // Adjust Y for padding
        } else {
            ctx.fillStyle = 'white';
            ctx.textAlign = 'left';
            ctx.fillText(`Score: ${(distanceTraveled / 100).toFixed(2)}`, 20, 20);
        }

        if (isGameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = '48px "Raster Forge", sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 80);

            ctx.font = '36px "Raster Forge", sans-serif';
            ctx.fillStyle = '#FFD700';
            ctx.fillText(`Score: ${(distanceTraveled / 100).toFixed(2)}`, canvas.width / 2, canvas.height / 2 - 20);

            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            buttons.continue.x = centerX - buttons.continue.width / 2;
            buttons.continue.y = centerY + 20;

            buttons.exit.x = centerX - buttons.exit.width / 2;
            buttons.exit.y = centerY + 100;

            function drawButton(btn) {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);

                ctx.font = '24px "Raster Forge", sans-serif';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(btn.text, btn.x + btn.width / 2, btn.y + btn.height / 2);
            }

            drawButton(buttons.continue);
            drawButton(buttons.exit);
        }
    }

    // Event Listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    canvas.addEventListener('touchmove', handleTouch, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    canvas.addEventListener('touchend', handleTouchEnd);

    // Mobile Jump Button Injection
    if (isMobile()) {
        const jumpBtn = document.createElement('button');
        jumpBtn.id = 'mobile-jump-btn';
        jumpBtn.innerText = 'JUMP';
        jumpBtn.style.display = 'block'; // Show only on touch devices
        document.body.appendChild(jumpBtn);

        const handleJumpStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            inputState.space = true;
        };

        const handleJumpEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();
            inputState.space = false;
        };

        jumpBtn.addEventListener('touchstart', handleJumpStart, { passive: false });
        jumpBtn.addEventListener('touchend', handleJumpEnd, { passive: false });

        // For desktop testing
        jumpBtn.addEventListener('mousedown', handleJumpStart);
        jumpBtn.addEventListener('mouseup', handleJumpEnd);
        jumpBtn.addEventListener('mouseleave', handleJumpEnd);
    }

    Promise.all([loadImages(), loadFonts(), loadAudio()]).then(() => {
        // Optimization: Pre-render Red Spike
        if (images.beamSpike) {
            const offCanvas = document.createElement('canvas');
            offCanvas.width = images.beamSpike.width;
            offCanvas.height = images.beamSpike.height;
            const offCtx = offCanvas.getContext('2d');
            offCtx.filter = 'sepia(1) hue-rotate(-50deg) saturate(5) brightness(0.8)';
            offCtx.drawImage(images.beamSpike, 0, 0);
            images.beamSpikeRed = offCanvas;
        }

        // Optimization: Create Beam Pattern
        if (images.beamMid) {
            images.beamMidPattern = ctx.createPattern(images.beamMid, 'repeat-y');
        }

        console.log('모든 이미지, 폰트, 오디오 로드 완료. 게임 시작!');

        // Try to play music immediately
        bgm.play().catch(e => {
            console.log('Autoplay prevented. Waiting for user interaction.', e);
            const playOnInteraction = () => {
                bgm.play();
                ['keydown', 'touchstart', 'click'].forEach(evt =>
                    document.removeEventListener(evt, playOnInteraction)
                );
            };
            ['keydown', 'touchstart', 'click'].forEach(evt =>
                document.addEventListener(evt, playOnInteraction, { once: true })
            );
        });

        byFrame();
    }).catch(error => {
        console.error('리소스 로드 중 오류 발생:', error);
    });

})();

