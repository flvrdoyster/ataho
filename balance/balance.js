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

    const TILE_SIZE = 16;
    const KEY_REPEAT_DELAY = 18;    // dt frames before auto-repeat begins
    const KEY_REPEAT_INTERVAL = 6;  // dt frames between repeated steps

    // PHYSICS & DIFFICULTY
    const CONFIG = {
        PHYSICS: {
            SWAY_INTENSITY_IDLE: 0.02,   // Base intensity of directional sway
            SWAY_INTENSITY_WALK: 0.01,   // Reduced sway when walking
            PLAYER_CONTROL_FORCE: 0.8,   // Force applied by player input
            FRICTION: 0.92,              // Damping factor (higher = more slippery/momentum)
            MAX_VELOCITY: 3.5,           // Maximum speed the character can tilt
            INERTIA_CONSTANT: 0.001,     // Force added based on current tilt
            GRAVITY: 0.4,                // Gravity applied during jumps
            FATIGUE_RATE: 0.002          // Rate at which instability increases
        },
        JUMP: {
            CHARGE_TIME: 30,             // Frames required to charge each jump level (hold space)
            JUMP_COOLDOWN: 20,           // Frames to wait before jumping again
            DISTANCES: [2 * TILE_SIZE, 3 * TILE_SIZE, 4 * TILE_SIZE], // Forward distance per jump level
            VELOCITIES: [2, 3, 4],       // Vertical jump velocity (height) for each level
            LANDING_PENALTIES: [5, 10, 15] // Instability added to balance upon landing
        },
        OBSTACLES: {
            START_DELAY: 4 * TILE_SIZE,  // Initial distance before the first obstacle appears
            MIN_GAP: TILE_SIZE,           // Minimum gap between obstacle groups
            // Each pattern is an array of group sizes. Groups are tight (no intra-gap).
            // A 1T gap is inserted between groups automatically.
            PATTERNS: [
                [1],
                [2],
                [1, 1],
                [3],
                [2, 2],
                [1, 2],
                [3, 1],
                [3, 2],
                [3, 3],
            ]
        },
        HITBOXES: {
            CHAR: { x: 34, y: 64, w: 12, h: 12 }, // Character hitbox relative to sprite
            OBS: { x: 26, y: 0, w: 16, h: 16 }    // Obstacle hitbox relative to sprite
        },
        SPEED: {
            GAME: 2                      // Global game speed (pixels per frame)
        },
        DEBUG: {
            SHOW_HITBOX: false,          // Toggle to show/hide debug hitboxes
            MUTE: false                  // Toggle to mute all audio
        }
    };

    const BALANCE_THRESHOLD = { SLIGHT: 20, MEDIUM: 55, LARGE: 80, MAX: 100 };

    const STATE = {
        IDLE: 'idle',
        WALKING: 'walking',
        JUMP_CHARGING: 'jump_charging',
        JUMPING: 'jumping',
        FALLING: 'falling',
        FALLEN: 'fallen'
    };

    const SPRITE_WIDTH = 80;
    const SPRITE_HEIGHT = 96;
    const FALLEN_OFFSET_X = 47;
    const FALLING_OFFSET_X = 20;
    const FALLEN_OFFSET_Y = 13;

    const TOUCH_DEADZONE = 0.05;
    const TOUCH_UPPER_ZONE = 0.25;
    const TOUCH_LOWER_ZONE = 0.75;
    const BUTTON_WIDTH = 200;
    const BUTTON_HEIGHT = 60;

    //===========================================
    // GAME STATE
    //===========================================
    let distanceTraveled = 0;
    let isGameOver = false;
    let gameOverScreenTimer = 0;      // isGameOver 후 화면 표시까지의 딜레이 카운터
    const GAME_OVER_SCREEN_DELAY = 90; // 프레임 수 (60fps 기준 1초)

    let startTime = 0;
    let elapsedTime = 0; // in milliseconds
    let lastTimestamp = 0;

    let obstacles = [];
    let nextObstacleY = CONFIG.OBSTACLES.START_DELAY;

    let bgm = null;
    let overBgm = null;
    let fallenSfx = null;  // HTMLAudioElement (1회성, file:// 환경 호환)
    const sfxRaw = {};     // id -> ArrayBuffer (XHR로 받은 원본, 제스처 전)
    const sfxBuffers = {}; // id -> AudioBuffer  (decode 완료, 재생 가능)

    // AudioContext — created once, unlocked on first user gesture
    let audioContext = null;
    let _audioUnlocked = false;
    let _bgmPending = false; // 로드 완료 후 제스처 전이면 true → unlock 시 재생

    function getAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioContext;
    }

    function unlockAudio() {
        if (_audioUnlocked) return;
        _audioUnlocked = true;
        const actx = getAudioContext();
        // iOS: resume() must be called synchronously inside gesture handler
        const resumePromise = (actx.state !== 'running') ? actx.resume() : Promise.resolve();
        // Pre-warm audio elements so iOS unblocks them
        resumePromise.then(() => {
            [bgm, overBgm, fallenSfx].forEach(el => {
                if (el) el.play().then(() => el.pause()).catch(() => { });
            });
            // 로드 완료 후 제스처를 기다리던 경우 BGM 재생
            if (_bgmPending) {
                _bgmPending = false;
                playMusic(bgm);
            }
        });
        // 제스처 이후 SFX 디코딩 실행
        _decodePending();
    }

    const imagePaths = {
        spriteSheet: 'balance_char.png',
        tileset: '../world/maps/abyss/assets/abyss_tile.png',
        beamStart: 'beam_start.png',
        beamMid: 'beam_mid.png',
        beamSpike: 'beam_spike.png'
    };

    let mapTileGrid = [];

    const images = {};

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

    function loadFonts() {
        const font = new FontFace('Raster Forge', 'url(https://fonts.cdnfonts.com/s/123917/RasterForgeRegular-XGDg9.woff)');
        return font.load().then(loadedFont => {
            document.fonts.add(loadedFont);
        });
    }

    // Audio Loading — loadeddata + timeout fallback
    // canplaythrough는 모바일에서 네트워크 상태에 따라 매우 늦게 발화하거나 안 됨
    function loadAudioFile(src, loop, volume) {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.loop = loop;
            audio.volume = volume;
            audio.preload = 'auto';

            let resolved = false;
            const done = () => {
                if (resolved) return;
                resolved = true;
                resolve(audio);
            };

            audio.addEventListener('loadeddata', done, { once: true });
            audio.addEventListener('error', () => {
                console.warn(`Audio load failed: ${src}`);
                if (!resolved) { resolved = true; resolve(null); }
            }, { once: true });

            audio.src = src;
            audio.load();

            // Fallback: resolve after 3s regardless (모바일 느린 네트워크 대응)
            setTimeout(() => {
                if (!resolved) {
                    console.warn(`Audio load timeout, continuing: ${src}`);
                    done();
                }
            }, 3000);
        });
    }

    // SFX Loading — XHR로 ArrayBuffer만 받아 저장, decode는 unlock 이후
    function loadSfxFile(id, src) {
        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', src, true);
            xhr.responseType = 'arraybuffer';
            xhr.onload = () => {
                if ((xhr.status === 200 || xhr.status === 0) && xhr.response) {
                    sfxRaw[id] = xhr.response;
                } else {
                    console.warn(`SFX fetch failed (${xhr.status}): ${src}`);
                }
                resolve();
            };
            xhr.onerror = () => { console.warn(`SFX network error: ${src}`); resolve(); };
            xhr.send();
        });
    }

    // 유저 제스처 이후 호출 — AudioContext가 running 상태일 때 디코딩
    function _decodePending() {
        const ctx = getAudioContext();
        Object.entries(sfxRaw).forEach(([id, buf]) => {
            if (sfxBuffers[id]) return;
            ctx.decodeAudioData(
                buf.slice(0), // slice: detach 방지
                (decoded) => { sfxBuffers[id] = decoded; },
                (e) => { console.warn(`SFX decode failed: ${id}`, e); }
            );
        });
    }

    function playSfx(id) {
        if (CONFIG.DEBUG.MUTE) return;
        const buffer = sfxBuffers[id];
        if (!buffer) return;
        const ctx = getAudioContext();
        const play = () => {
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
        };
        if (ctx.state === 'running') play();
        else ctx.resume().then(play);
    }

    function playMusic(audio) {
        if (!audio || CONFIG.DEBUG.MUTE) return;
        audio.currentTime = 0;
        getAudioContext().resume().then(() => {
            audio.play().catch(e => console.log('BGM play failed:', e));
        });
    }

    function stopMusic(audio) {
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
    }

    async function loadAudio() {
        [bgm, overBgm, fallenSfx] = await Promise.all([
            loadAudioFile('duel.mp3', true, 0.5),
            loadAudioFile('over.mp3', true, 0.5),
            loadAudioFile('fallen.mp3', false, 1.0)
        ]);
    }

    //===========================================
    // SPRITES & GAME DATA
    //===========================================
    // Each animation is an array of {x, y} frame objects (sprite sheet coordinates).
    // jumping_charge is indexed by jumpLevel [0..2].
    const ANIMATIONS = {
        balanced: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 160, y: 0 }],
        jumping_charge: [[{ x: 240, y: 0 }], [{ x: 480, y: 192 }], [{ x: 480, y: 288 }]],
        jumping: [{ x: 320, y: 0 }],
        falling_left: [{ x: 400, y: 0 }],
        falling_right: [{ x: 480, y: 0 }],
        fallen: [{ x: 480, y: 96 }],
        leaning_left_slight: [{ x: 0, y: 96 }, { x: 80, y: 96 }, { x: 160, y: 96 }],
        leaning_left_medium: [{ x: 0, y: 192 }, { x: 80, y: 192 }, { x: 160, y: 192 }],
        leaning_left_large: [{ x: 0, y: 288 }, { x: 80, y: 288 }, { x: 160, y: 288 }],
        leaning_right_slight: [{ x: 240, y: 96 }, { x: 320, y: 96 }, { x: 400, y: 96 }],
        leaning_right_medium: [{ x: 240, y: 192 }, { x: 320, y: 192 }, { x: 400, y: 192 }],
        leaning_right_large: [{ x: 240, y: 288 }, { x: 320, y: 288 }, { x: 400, y: 288 }],
    };

    const walkAnimationSequence = [0, 1, 2, 1];
    const inputState = {};

    const ataho = {
        x: canvas.width / 2 - (SPRITE_WIDTH) / 2,
        y: canvas.height / 2 - (SPRITE_HEIGHT) / 2,
        width: SPRITE_WIDTH,
        height: SPRITE_HEIGHT,

        actionState: STATE.IDLE,
        leanState: 'balanced',

        balanceLevel: 0,
        balanceVelocity: 0,

        swayCurrent: 0,
        swayTarget: 0,
        swayTimer: 0,
        swayChangeInterval: 120, // Frames between potential sway direction changes

        fallDirection: null,
        fallTimer: 0,
        balanceTimer: 0,

        stepRemaining: 0,
        keyRepeatTimer: 0,
        jumpStartDist: 0,

        jumpChargeTimer: 0,
        jumpCooldown: 0,
        jumpLevel: 0,
        jumpVelocityY: 0,
        visualY: 0,

        update(dt) {
            if (this.actionState === STATE.JUMPING) {
                this.updateJump(dt);
                return;
            }

            this.handleJumpInput(dt);
            if (this.actionState === STATE.JUMP_CHARGING || this.actionState === STATE.JUMPING) return;

            this.updatePhysics(dt);

            if (this.actionState !== STATE.FALLING && this.actionState !== STATE.FALLEN) {
                this.updateMovement(dt);
            }

            if (this.actionState === STATE.FALLING) {
                this.fallTimer += dt;
                if (this.fallTimer >= 30) {
                    this.triggerGameOver();
                }
            }

        },

        updateJump(dt) {
            this.visualY -= this.jumpVelocityY * dt;
            this.jumpVelocityY -= CONFIG.PHYSICS.GRAVITY * dt;

            const airTime = (2 * CONFIG.JUMP.VELOCITIES[this.jumpLevel]) / CONFIG.PHYSICS.GRAVITY;
            const currentJumpSpeed = CONFIG.JUMP.DISTANCES[this.jumpLevel] / airTime;

            distanceTraveled += currentJumpSpeed * dt;

            if (this.visualY >= 0) {
                this.visualY = 0;
                this.actionState = STATE.IDLE;
                this.jumpVelocityY = 0;
                this.jumpCooldown = CONFIG.JUMP.JUMP_COOLDOWN;

                // Snap to exact tile distance — decouples collision from floating point drift in physics
                const exactDist = this.jumpStartDist + CONFIG.JUMP.DISTANCES[this.jumpLevel];
                distanceTraveled = exactDist;

                inputState.down = false;
                inputState.downHeld = false;
                inputState.up = false;
                this.keyRepeatTimer = 0;

                const penalty = CONFIG.JUMP.LANDING_PENALTIES[this.jumpLevel];
                const direction = Math.random() < 0.5 ? -1 : 1;
                this.balanceLevel += penalty * direction;
                this.balanceVelocity += (penalty * direction) * 0.1;

                this.checkLandingCollision();
            }
        },

        handleJumpInput(dt) {
            if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

            const isFalling = this.actionState === STATE.FALLING || this.actionState === STATE.FALLEN;
            if (inputState.space && this.jumpCooldown <= 0 && !isFalling) {
                if (this.actionState !== STATE.JUMP_CHARGING) {
                    this.actionState = STATE.JUMP_CHARGING;
                    this.jumpChargeTimer = 0;
                    this.jumpLevel = 0;
                    inputState.down = false;
                    inputState.downHeld = false;
                    this.stepRemaining = 0;
                    this.keyRepeatTimer = 0;
                } else {
                    this.jumpChargeTimer += dt;
                    const cycleTime = CONFIG.JUMP.CHARGE_TIME * 3;
                    const effectiveTimer = this.jumpChargeTimer % cycleTime;
                    if (effectiveTimer >= CONFIG.JUMP.CHARGE_TIME * 2) this.jumpLevel = 2;
                    else if (effectiveTimer >= CONFIG.JUMP.CHARGE_TIME) this.jumpLevel = 1;
                    else this.jumpLevel = 0;
                }
            } else if (this.actionState === STATE.JUMP_CHARGING) {
                this.actionState = STATE.JUMPING;
                this.jumpVelocityY = CONFIG.JUMP.VELOCITIES[this.jumpLevel];
                this.jumpStartDist = distanceTraveled;
            }
        },

        updatePhysics(dt) {
            let inputForce = 0;
            if (typeof inputState.touchForce === 'number' && inputState.touchForce !== 0) {
                inputForce = inputState.touchForce * CONFIG.PHYSICS.PLAYER_CONTROL_FORCE * 1.5;
            } else if (inputState.left) {
                inputForce = -CONFIG.PHYSICS.PLAYER_CONTROL_FORCE;
            } else if (inputState.right) {
                inputForce = CONFIG.PHYSICS.PLAYER_CONTROL_FORCE;
            }

            if (Math.abs(this.balanceLevel) < BALANCE_THRESHOLD.SLIGHT) {
                this.balanceTimer += dt;
            } else {
                this.balanceTimer = Math.max(0, this.balanceTimer - 2 * dt);
            }

            const instabilityMultiplier = 1 + (this.balanceTimer * CONFIG.PHYSICS.FATIGUE_RATE);
            const baseSwayIntensity = (this.actionState === STATE.WALKING) ? CONFIG.PHYSICS.SWAY_INTENSITY_WALK : CONFIG.PHYSICS.SWAY_INTENSITY_IDLE;

            this.swayTimer += dt;
            if (this.swayTimer > this.swayChangeInterval) {
                if (Math.random() < 0.3) {
                    this.swayTarget = (Math.random() - 0.5) * 2;
                    this.swayChangeInterval = 60 + Math.random() * 120;
                    this.swayTimer = 0;
                }
            }
            this.swayCurrent += (this.swayTarget - this.swayCurrent) * 0.02 * dt;

            const directionalSway = this.swayCurrent * baseSwayIntensity * instabilityMultiplier;
            const randomJitter = (Math.random() - 0.5) * 0.005;

            const inertiaForce = this.balanceLevel * CONFIG.PHYSICS.INERTIA_CONSTANT;

            // Apply Forces (scale additive forces by dt; friction uses pow for correct per-dt decay)
            this.balanceVelocity += (inputForce + directionalSway + randomJitter + inertiaForce) * dt;
            this.balanceVelocity *= Math.pow(CONFIG.PHYSICS.FRICTION, dt);

            this.balanceVelocity = Math.max(-CONFIG.PHYSICS.MAX_VELOCITY, Math.min(CONFIG.PHYSICS.MAX_VELOCITY, this.balanceVelocity));

            this.balanceLevel += this.balanceVelocity * dt;

            if (this.balanceLevel >= BALANCE_THRESHOLD.MAX) {
                this.startFalling('right');
            } else if (this.balanceLevel <= -BALANCE_THRESHOLD.MAX) {
                this.startFalling('left');
            } else if (distanceTraveled < -20) {
                this.startFalling(this.balanceLevel >= 0 ? 'right' : 'left');
            }

            const absBalance = Math.abs(this.balanceLevel);
            const direction = this.balanceLevel < 0 ? 'left' : 'right';

            if (absBalance < BALANCE_THRESHOLD.SLIGHT) {
                this.leanState = 'balanced';
            } else {
                let leanLevel = 'slight';
                if (absBalance >= BALANCE_THRESHOLD.LARGE) leanLevel = 'large';
                else if (absBalance >= BALANCE_THRESHOLD.MEDIUM) leanLevel = 'medium';
                this.leanState = `leaning_${direction}_${leanLevel}`;
            }
        },

        updateMovement(dt) {
            // Initial press: fire a step immediately and reset the DAS timer.
            if (inputState.down && this.stepRemaining <= 0) {
                this.stepRemaining = TILE_SIZE;
                inputState.down = false;
                this.keyRepeatTimer = 0;
            }

            // DAS: once the initial step finishes, count up and re-fire at repeat interval.
            if (inputState.downHeld && this.stepRemaining <= 0) {
                this.keyRepeatTimer += dt;
                if (this.keyRepeatTimer >= KEY_REPEAT_DELAY) {
                    this.stepRemaining = TILE_SIZE;
                    this.keyRepeatTimer -= KEY_REPEAT_INTERVAL;
                }
            } else if (!inputState.downHeld) {
                this.keyRepeatTimer = 0;
            }

            if (this.stepRemaining > 0) {
                this.actionState = STATE.WALKING;
                const move = Math.min(CONFIG.SPEED.GAME * dt, this.stepRemaining);
                const nextDist = distanceTraveled + move;
                if (!this.checkObstacleCollision(nextDist)) {
                    distanceTraveled += move;
                    this.stepRemaining -= move;
                } else {
                    this.stepRemaining = 0;
                }
            } else {
                this.actionState = STATE.IDLE;
            }
        },

        startFalling(direction) {
            this.actionState = STATE.FALLING;
            this.fallDirection = direction;
        },

        triggerGameOver() {
            this.actionState = STATE.FALLEN;
            isGameOver = true;
            gameOverScreenTimer = 0;
            stopMusic(bgm);
            if (fallenSfx && !CONFIG.DEBUG.MUTE) {
                fallenSfx.currentTime = 0;
                getAudioContext().resume().then(() => fallenSfx.play().catch(() => { }));
            }
            const jumpBtn = document.getElementById('mobile-jump-btn');
            if (jumpBtn) jumpBtn.style.display = 'none';
        },

        checkLandingCollision() {
            const startY = canvas.height / 2;
            const landedOnObstacle = obstacles.some(obs => {
                if (distanceTraveled > obs.y + obs.height) return false;
                const obsScreenY = startY - distanceTraveled + obs.y;
                const obsTop = obsScreenY + CONFIG.HITBOXES.OBS.y;
                const obsBottom = obsScreenY + CONFIG.HITBOXES.OBS.y + CONFIG.HITBOXES.OBS.h;

                const playerTop = this.y + CONFIG.HITBOXES.CHAR.y;
                const playerBottom = this.y + CONFIG.HITBOXES.CHAR.y + CONFIG.HITBOXES.CHAR.h;
                const overlap = playerTop < obsBottom && playerBottom > obsTop;

                if (overlap) obs.causedDeath = true;
                return overlap;
            });

            if (landedOnObstacle) {
                this.startFalling(this.balanceLevel >= 0 || Math.random() < 0.5 ? 'right' : 'left');
            }
        },

        checkObstacleCollision(nextDist) {
            const startY = canvas.height / 2;
            return obstacles.some(obs => {
                if (distanceTraveled > obs.y + obs.height) return false;
                const obsScreenY = startY - nextDist + obs.y;

                const playerTop = this.y + CONFIG.HITBOXES.CHAR.y;
                const playerBottom = this.y + CONFIG.HITBOXES.CHAR.y + CONFIG.HITBOXES.CHAR.h;
                const obsTop = obsScreenY + CONFIG.HITBOXES.OBS.y;
                const obsBottom = obsScreenY + CONFIG.HITBOXES.OBS.y + CONFIG.HITBOXES.OBS.h;

                return (playerTop < obsBottom && playerBottom > obsTop);
            });
        },


        draw() {
            let anim = ANIMATIONS.balanced;
            let frameIndex = 0;
            let finalX = this.x;
            let finalY = this.y;

            switch (this.actionState) {
                case STATE.FALLING:
                    anim = this.fallDirection === 'left' ? ANIMATIONS.falling_left : ANIMATIONS.falling_right;
                    finalX += this.fallDirection === 'left' ? -FALLING_OFFSET_X : FALLING_OFFSET_X / 2;
                    break;
                case STATE.FALLEN:
                    anim = ANIMATIONS.fallen;
                    finalX += this.fallDirection === 'left' ? -FALLEN_OFFSET_X : FALLEN_OFFSET_X;
                    finalY += FALLEN_OFFSET_Y;
                    break;
                case STATE.JUMP_CHARGING:
                    anim = ANIMATIONS.jumping_charge[this.jumpLevel];
                    break;
                case STATE.JUMPING:
                    anim = ANIMATIONS.jumping;
                    break;
                default:
                    anim = ANIMATIONS[this.leanState] ?? ANIMATIONS.balanced;
                    if (this.actionState === STATE.WALKING) {
                        const seqIdx = Math.floor(distanceTraveled / TILE_SIZE) % walkAnimationSequence.length;
                        frameIndex = walkAnimationSequence[seqIdx];
                    }
            }

            finalY += this.visualY;

            const frame = anim[frameIndex] ?? anim[0];

            let rotationAngle = 0;
            if (this.actionState === STATE.JUMPING) {
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
                frame.x, frame.y,
                SPRITE_WIDTH, SPRITE_HEIGHT,
                finalX, finalY,
                this.width, this.height
            );

            if (rotationAngle !== 0) ctx.restore();

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
        gameOverScreenTimer = 0;
        stopMusic(overBgm);
        playMusic(bgm);
        startTime = Date.now();
        elapsedTime = 0;
        lastTimestamp = 0;

        ataho.balanceLevel = 0;
        ataho.balanceVelocity = 0;
        ataho.actionState = STATE.IDLE;
        ataho.leanState = 'balanced';

        ataho.fallTimer = 0;
        ataho.balanceTimer = 0;
        ataho.swayTarget = 0;
        ataho.swayCurrent = 0;
        ataho.swayTimer = 0;
        ataho.swayChangeInterval = 120;
        ataho.visualY = 0;
        ataho.stepRemaining = 0;
        ataho.keyRepeatTimer = 0;
        ataho.jumpStartDist = 0;
        ataho.jumpVelocityY = 0;
        ataho.jumpLevel = 0;
        distanceTraveled = 0;

        obstacles = [];
        nextObstacleY = CONFIG.OBSTACLES.START_DELAY;

        Object.keys(inputState).forEach(key => inputState[key] = false);
        inputState.touchForce = 0;

        // byFrame() is already running continuously, so we don't need to call it here.
        // Calling it would create a duplicate loop (double speed).

        const jumpBtn = document.getElementById('mobile-jump-btn');
        if (jumpBtn) jumpBtn.style.display = 'block';
    }

    function isClickInsideButton(clickX, clickY, button) {
        return clickX >= button.x && clickX <= button.x + button.width &&
            clickY >= button.y && clickY <= button.y + button.height;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    const handleKeyDown = (e) => {
        if (e.repeat || isGameOver) return;
        switch (e.code) {
            case 'KeyS':
            case 'ArrowDown':
                inputState.down = true;
                inputState.downHeld = true;
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
                inputState.downHeld = false;
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
        inputState.downHeld = false;
    };

    const handleTouch = (e) => {
        e.preventDefault();

        // touches 배열이 비어있으면 (touchend/touchcancel 오발) 무시
        if (!e.touches || e.touches.length === 0) return;

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
        const maxDistX = window.innerWidth / 2;
        let distRatio = clamp((touchX - centerX) / maxDistX, -1, 1);

        if (Math.abs(distRatio) < TOUCH_DEADZONE) distRatio = 0;

        inputState.touchForce = distRatio;

        const screenHeight = window.innerHeight;

        inputState.up = false;
        inputState.down = false;
        inputState.downHeld = false;

        if (touchY < screenHeight * TOUCH_UPPER_ZONE) {
            inputState.up = true;
        } else if (touchY > screenHeight * TOUCH_LOWER_ZONE) {
            inputState.downHeld = true;
            if (e.type === 'touchstart') inputState.down = true;
        }
    };

    let isMouseDown = false;

    const handleMouseDown = (e) => {
        isMouseDown = true;
        handleTouch(e);
    };

    const handleMouseUp = (e) => {
        isMouseDown = false;
        handleTouchEnd(e);
    };

    const handleMouseMoveTouch = (e) => {
        if (!isMouseDown) return;
        handleTouch(e);
    };

    const buttons = {
        continue: { x: 0, y: 0, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, text: 'Continue?' },
        exit: { x: 0, y: 0, width: BUTTON_WIDTH, height: BUTTON_HEIGHT, text: 'Exit' }
    };

    //===========================================
    // RENDER HELPERS
    //===========================================

    function buildMapGrid() {
        if (!window.MAP_DATA || !window.MAP_DATA.tiles) return;
        mapTileGrid = [];
        window.MAP_DATA.tiles.forEach(({ gx, gy, tx, ty }) => {
            if (!mapTileGrid[gy]) mapTileGrid[gy] = [];
            mapTileGrid[gy][gx] = { tx, ty };
        });
    }

    function drawBackgroundTiles() {
        if (!images.tileset || !mapTileGrid.length) return;

        const mapH = mapTileGrid.length;
        const mapW = 30;
        const T = TILE_SIZE;
        const originX = canvas.width / 4;   // 240 — map left edge in 2x game coords
        const originY = canvas.height / 2;  // 320 — camera center

        const firstRow = Math.floor((canvas.height / 4 - originY + distanceTraveled) / T);
        const lastRow = Math.ceil((3 * canvas.height / 4 - originY + distanceTraveled) / T);

        for (let row = firstRow; row <= lastRow; row++) {
            const mapRow = ((row % mapH) + mapH) % mapH;
            const tileRow = mapTileGrid[mapRow];
            if (!tileRow) continue;

            const drawY = originY - distanceTraveled + row * T;
            for (let col = 0; col < mapW; col++) {
                const tile = tileRow[col];
                if (!tile || (tile.tx === 1 && tile.ty === 0)) continue;
                ctx.drawImage(
                    images.tileset,
                    tile.tx * T, tile.ty * T, T, T,
                    originX + col * T, drawY, T, T
                );
            }
        }
    }

    function generateObstacles() {
        if (!images.beamSpike) return;
        const spikeHeight = images.beamSpike.height;
        const generateHorizon = distanceTraveled + canvas.height * 2;
        while (nextObstacleY < generateHorizon) {
            const pattern = CONFIG.OBSTACLES.PATTERNS[Math.floor(Math.random() * CONFIG.OBSTACLES.PATTERNS.length)];
            pattern.forEach((groupCount, groupIdx) => {
                for (let i = 0; i < groupCount; i++) {
                    obstacles.push({ y: nextObstacleY, height: spikeHeight });
                    nextObstacleY += spikeHeight;
                }
                if (groupIdx < pattern.length - 1) nextObstacleY += TILE_SIZE;
            });
            nextObstacleY += CONFIG.OBSTACLES.MIN_GAP + Math.floor(Math.random() * 8) * TILE_SIZE;
        }

        if (obstacles.length > 0) {
            const firstScreenY = canvas.height / 2 - distanceTraveled + obstacles[0].y;
            if (firstScreenY + obstacles[0].height < -100) obstacles.shift();
        }
    }

    function gameUpdate(dt) {
        ataho.update(dt);
        generateObstacles();
    }

    function drawBeam() {
        if (!images.beamStart || !images.beamMid) return;
        const beamX = canvas.width / 2 - images.beamStart.width / 2;
        let currentDrawY = canvas.height / 2 - distanceTraveled;

        if (currentDrawY > -images.beamStart.height) {
            ctx.drawImage(images.beamStart, beamX, Math.floor(currentDrawY));
        }

        let midDrawY = currentDrawY + images.beamStart.height;
        if (images.beamMidPattern) {
            ctx.save();
            ctx.translate(beamX, Math.floor(midDrawY));
            ctx.fillStyle = images.beamMidPattern;
            const heightNeeded = canvas.height - midDrawY;
            if (heightNeeded > 0) ctx.fillRect(0, 0, images.beamMid.width, heightNeeded);
            ctx.restore();
        } else {
            while (midDrawY < canvas.height) {
                ctx.drawImage(images.beamMid, beamX, Math.floor(midDrawY));
                midDrawY += images.beamMid.height;
            }
        }
    }

    function drawObstacles() {
        if (!images.beamSpike) return;
        const spikeX = canvas.width / 2 - images.beamSpike.width / 2;
        const originY = canvas.height / 2;
        obstacles.forEach(obs => {
            const drawY = originY - distanceTraveled + obs.y;
            if (drawY <= -images.beamSpike.height || drawY >= canvas.height) return;

            const sprite = (obs.causedDeath && images.beamSpikeRed) ? images.beamSpikeRed : images.beamSpike;
            ctx.drawImage(sprite, spikeX, drawY);

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
        });
    }

    function renderWorld() {
        ctx.save();
        try {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(2, 2);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);
            drawBackgroundTiles();
            drawBeam();
            drawObstacles();
            ataho.draw();
        } catch (e) {
            console.error('Error in render loop:', e);
        } finally {
            ctx.restore();
        }
    }

    function buildStats() {
        const totalSeconds = Math.floor(elapsedTime / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return {
            timeText: `Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
            distanceText: `Dist: ${(distanceTraveled / 100).toFixed(1)}m`
        };
    }

    function renderHUD(timeText, distanceText) {
        const boxWidth = 220;
        const boxHeight = 70;
        const boxX = canvas.width / 2 - boxWidth / 2;
        const boxY = 10;
        const padding = 10;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 5);
        ctx.fill();

        ctx.font = '24px "Raster Forge", sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(timeText, canvas.width / 2, boxY + padding);
        ctx.fillText(distanceText, canvas.width / 2, boxY + padding + 30);
    }

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

    function renderGameOver(timeText, distanceText) {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = '48px "Raster Forge", sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', cx, cy - 140);

        ctx.font = '36px "Raster Forge", sans-serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(timeText, cx, cy - 80);
        ctx.fillText(distanceText, cx, cy - 30);

        buttons.continue.x = cx - buttons.continue.width / 2;
        buttons.continue.y = cy + 30;
        buttons.exit.x = cx - buttons.exit.width / 2;
        buttons.exit.y = cy + 110;

        drawButton(buttons.continue);
        drawButton(buttons.exit);
    }

    //===========================================
    // MAIN LOOP
    //===========================================

    function byFrame(timestamp) {
        requestAnimationFrame(byFrame);

        // Normalize dt to 60fps. Cap at 3 to prevent spiral-of-death after tab focus.
        // Use (> 0) guard because the first manual byFrame() call has timestamp=undefined.
        const dt = (lastTimestamp > 0 && timestamp > 0)
            ? Math.min((timestamp - lastTimestamp) / (1000 / 60), 3)
            : 1;
        lastTimestamp = timestamp || 0;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!isGameOver) gameUpdate(dt);
        renderWorld();

        if (!isGameOver) elapsedTime = Date.now() - startTime;
        if (isGameOver) {
            const wasBelow = gameOverScreenTimer < GAME_OVER_SCREEN_DELAY;
            gameOverScreenTimer += dt;
            if (wasBelow && gameOverScreenTimer >= GAME_OVER_SCREEN_DELAY) {
                playMusic(overBgm);
            }
        }

        const { timeText, distanceText } = buildStats();
        renderHUD(timeText, distanceText);
        if (isGameOver && gameOverScreenTimer >= GAME_OVER_SCREEN_DELAY) renderGameOver(timeText, distanceText);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleMouseMove); // For cursor style

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMoveTouch); // For controls
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    canvas.addEventListener('touchmove', handleTouch, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    // touchcancel: 시스템이 강제 취소 (전화, 알림 등) → 입력 상태 초기화
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    // AudioContext unlock — iOS/Android requires user gesture
    // passive: false 필수 — 제스처 핸들러 내에서 AudioContext.resume()을 동기적으로 호출해야 iOS에서 작동
    ['touchstart', 'click', 'keydown'].forEach(evt =>
        window.addEventListener(evt, unlockAudio, { once: true, passive: false })
    );

    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    if (isTouchDevice) {
        const jumpBtn = document.createElement('button');
        jumpBtn.id = 'mobile-jump-btn';
        jumpBtn.innerText = 'JUMP';
        jumpBtn.style.display = 'block';
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

        // Mouse events for hybrid devices
        jumpBtn.addEventListener('mousedown', handleJumpStart);
        jumpBtn.addEventListener('mouseup', handleJumpEnd);
        jumpBtn.addEventListener('mouseleave', handleJumpEnd);
    }

    buildMapGrid();

    // canvas에 touch-action:none 설정 — 브라우저 기본 스크롤/핀치줌 방지
    canvas.style.touchAction = 'none';

    Promise.all([loadImages(), loadFonts(), loadAudio()]).then(() => {
        // Pre-render red spike variant into offscreen canvas to avoid per-frame filter cost
        if (images.beamSpike) {
            const offCanvas = document.createElement('canvas');
            offCanvas.width = images.beamSpike.width;
            offCanvas.height = images.beamSpike.height;
            const offCtx = offCanvas.getContext('2d');
            offCtx.filter = 'sepia(1) hue-rotate(-50deg) saturate(5) brightness(0.8)';
            offCtx.drawImage(images.beamSpike, 0, 0);
            images.beamSpikeRed = offCanvas;
        }

        // Cache beam mid-section as a repeating pattern to avoid per-tile drawImage calls
        if (images.beamMid) {
            images.beamMidPattern = ctx.createPattern(images.beamMid, 'repeat-y');
        }

        console.log('모든 이미지, 폰트, 오디오 로드 완료. 게임 시작!');

        startTime = Date.now();

        // 유저 제스처가 이미 있었으면 즉시 재생, 없으면 unlock 시점에 재생
        if (_audioUnlocked) {
            playMusic(bgm);
        } else {
            _bgmPending = true;
        }

        byFrame();
    }).catch(error => {
        console.error('리소스 로드 중 오류 발생:', error);
    });

})();

