(function () {
    if (window.ATAHO_BALANCE_GAME_LOADED) return;
    window.ATAHO_BALANCE_GAME_LOADED = true;

    // --- 캔버스 ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 960;
    canvas.height = 640;

    // Disable smoothing AFTER sizing (sizing resets context)
    ctx.imageSmoothingEnabled = false;

    // --- 상수 ---
    const TILE_SIZE = 16;
    const KEY_REPEAT_DELAY = 18;    // dt frames before auto-repeat begins
    const KEY_REPEAT_INTERVAL = 6;  // dt frames between repeated steps

    // — CONFIG: 게임 수치 조정은 여기서 —
    const CONFIG = {
        // 밸런스 물리
        BALANCE: {
            INPUT_FORCE: 0.8,        // 좌우 입력 시 가해지는 힘
            DAMPING: 0.92,           // 속도 감쇠율 (낮을수록 빠르게 멈춤 / 높을수록 관성이 강함)
            MAX_SPEED: 3.5,          // 기울기 속도 상한
            THRESHOLDS: { SLIGHT: 20, MEDIUM: 55, LARGE: 75, MAX: 100 }
        },
        // 외력(스웨이)
        SWAY: {
            INTENSITY_IDLE: 0.15,    // 정지 시 스웨이 강도
            INTENSITY_WALK: 0.15,    // 걷는 중 스웨이 강도
            LERP_SPEED: 0.035,       // 목표 방향 추종 속도 (높을수록 방향 전환이 즉각적)
            CHANGE_PROB: 0.5,        // 방향 전환 확률 (인터벌 경과 후 매 프레임 시도)
            INTERVAL_MIN: 40,        // 방향 전환 최소 주기 (프레임)
            INTERVAL_MAX: 120,       // 방향 전환 최대 주기 (프레임)
            JITTER: 0.015            // 미세 랜덤 떨림 (매 프레임 ±JITTER/2)
        },
        // 거리 기반 난이도 상승
        DIFFICULTY: {
            RAMP: 0.001,             // 이동 거리(px)당 스웨이 배율 증가량
            CAP: 2.5                 // 스웨이 배율 상한 (1.0에서 시작)
        },
        // 점프
        JUMP: {
            GRAVITY: 0.4,            // 중력 가속도
            CHARGE_TIME: 30,         // 점프 레벨당 차징 시간 (프레임, 길게 누를수록 레벨 상승)
            COOLDOWN: 20,            // 착지 후 다음 점프까지 대기 시간 (프레임)
            DISTANCES: [2 * TILE_SIZE, 3 * TILE_SIZE, 4 * TILE_SIZE], // 점프 레벨별 전진 거리 (px)
            VELOCITIES: [2, 3, 4],   // 점프 레벨별 초기 수직 속도
            LANDING_PENALTIES: [5, 10, 15] // 착지 시 밸런스 충격 (레벨별)
        },
        // 장애물 생성
        OBSTACLES: {
            START_DELAY: 4 * TILE_SIZE,  // 게임 시작 후 첫 장애물까지의 거리 (px)
            MIN_GAP: 2 * TILE_SIZE,          // 장애물 그룹 간 최소 간격
            PATTERNS: [
                [1],
                [1, 1],
                [1, 1, 1],
                [2],
                [2, 2],
                [2, 2, 2],
                [1, 2],
                [2, 1, 2],
                [3],
                [3, 1],
                [3, 2],
                [3, 3],
            ]
        },
        HITBOXES: {
            CHAR: { x: 34, y: 64, w: 12, h: 12 },
            OBS:  { x: 26, y: 0,  w: 16, h: 16 }
        },
        SPEED: {
            GAME: 2                  // 게임 스크롤 속도 (px/프레임)
        },
        DEBUG: {
            SHOW_HITBOX: false,
            SHOW_STATS: false,
            MUTE: false
        }
    };

    // BALANCE_THRESHOLD는 기존 코드 호환용 alias
    const BALANCE_THRESHOLD = CONFIG.BALANCE.THRESHOLDS;

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

    const TOUCH_DEADZONE = 0.05;
    const TOUCH_UPPER_ZONE = 0.25;
    const TOUCH_LOWER_ZONE = 0.75;

    const GAME_OVER_SCREEN_DELAY = 90; // 프레임 수 (60fps 기준 1초)

    // --- 게임 상태 ---
    let distanceTraveled = 0;
    let isGameOver = false;
    let soundEnabled = true;
    let gameOverScreenTimer = 0;      // isGameOver 후 화면 표시까지의 딜레이 카운터
    let startTime = 0;
    let elapsedTime = 0; // in milliseconds
    let lastTimestamp = 0;
    let obstacles = [];
    let nextObstacleY = CONFIG.OBSTACLES.START_DELAY;
    let isMouseDown = false;

    // --- 에셋 ---
    const imagePaths = {
        spriteSheet: 'balance_char.png',
        tileset: '../world/maps/abyss/assets/abyss_tile.png',
        beamStart: 'beam_start.png',
        beamMid: 'beam_mid.png',
        beamSpike: 'beam_spike.png'
    };

    const images = {};
    let mapTileGrid = [];

    // --- 오디오 ---
    let fallenSfx = null;  // HTMLAudioElement (1회성, file:// 환경 호환)
    const sfxRaw = {};     // id -> ArrayBuffer (XHR로 받은 원본, 제스처 전)
    const sfxBuffers = {}; // id -> AudioBuffer  (decode 완료, 재생 가능)

    // Web Audio API BGM state
    let activeBgmSource = null;
    let activeBgmGain = null;
    let activeBgmId = null;

    // AudioContext — created once, unlocked on first user gesture
    let audioContext = null;
    let _audioUnlocked = false;
    let _bgmPending = false; // 로드 완료 후 제스처 전이면 true → unlock 시 재생

    // --- 입력 상태 ---
    const inputState = {};

    // --- 유틸 ---
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // --- 에셋 로딩 ---
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

    // --- 오디오 시스템 ---
    function getAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioContext;
    }

    // Audio Loading — loadeddata + timeout fallback
    // canplaythrough는 모바일에서 네트워크 상태에 따라 매우 늦게 발화하거나 안 됨
    function loadAudioFile(src, loop, volume) {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.loop = loop;
            audio.volume = volume;
            audio.muted = true;
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
        const promises = Object.entries(sfxRaw).map(([id, buf]) => {
            if (sfxBuffers[id]) return Promise.resolve();
            return new Promise((resolve) => {
                ctx.decodeAudioData(
                    buf.slice(0), // slice: detach 방지
                    (decoded) => { sfxBuffers[id] = decoded; resolve(); },
                    (e) => { console.warn(`SFX decode failed: ${id}`, e); resolve(); }
                );
            });
        });
        return Promise.all(promises);
    }

    function unlockAudio() {
        if (_audioUnlocked) return;
        _audioUnlocked = true;
        const actx = getAudioContext();
        // iOS: resume() must be called synchronously inside gesture handler
        const resumePromise = (actx.state !== 'running') ? actx.resume() : Promise.resolve();
        // Pre-warm HTMLAudioElements so iOS unblocks them
        resumePromise.then(() => {
            if (fallenSfx) fallenSfx.play().then(() => fallenSfx.pause()).catch(() => { });
        });
        
        // 제스처 이후 SFX 디코딩 실행
        _decodePending().then(() => {
            // 로드 완료 후 제스처를 기다리던 경우 BGM 재생
            if (_bgmPending) {
                _bgmPending = false;
                playMusic('bgm');
            }
        });
    }

    const hudTime = document.getElementById('hud-time');
    const hudDist = document.getElementById('hud-dist');
    const gameOverOverlay = document.getElementById('game-over-overlay');

    const gameOverPanel = document.getElementById('game-over-panel');
    const gameOverCursorEl = document.getElementById('game-over-cursor');
    const gameOverBtns = [
        document.getElementById('btn-continue'),
        document.getElementById('btn-home')
    ];
    const soundBtn = document.getElementById('sound-btn');

    function toggleSound() {
        soundEnabled = !soundEnabled;
        const muted = !soundEnabled;
        if (fallenSfx) fallenSfx.muted = muted;
        if (activeBgmGain) {
            activeBgmGain.gain.value = muted ? 0 : 0.5;
        }
        const soundImg = soundBtn.querySelector('img');
        if (soundImg) {
            soundImg.src = muted ? 'sound_mute.png' : 'sound.png';
        }
    }

    function playSfx(id) {
        if (!soundEnabled) return;
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

    function playMusic(id, volume = 0.5) {
        stopMusic(); // Ensure any previous BGM is stopped

        const buffer = sfxBuffers[id];
        if (!buffer) return;

        activeBgmId = id;
        const ctx = getAudioContext();
        activeBgmGain = ctx.createGain();
        activeBgmGain.gain.value = soundEnabled ? volume : 0;
        activeBgmGain.connect(ctx.destination);

        activeBgmSource = ctx.createBufferSource();
        activeBgmSource.buffer = buffer;
        activeBgmSource.loop = true;
        activeBgmSource.connect(activeBgmGain);

        const play = () => {
            activeBgmSource.start(0);
        };

        if (ctx.state === 'running') play();
        else ctx.resume().then(play);
    }

    function stopMusic() {
        if (activeBgmSource) {
            try { activeBgmSource.stop(); } catch (e) {}
            activeBgmSource.disconnect();
            activeBgmSource = null;
        }
        if (activeBgmGain) {
            activeBgmGain.disconnect();
            activeBgmGain = null;
        }
        activeBgmId = null;
    }

    async function loadAudio() {
        await Promise.all([
            loadSfxFile('bgm', 'showdown_cut.mp3'),
            loadSfxFile('overBgm', 'over.mp3')
        ]);
        fallenSfx = await loadAudioFile('fallen.mp3', false, 1.0);
    }

    // --- 맵 ---
    function buildMapGrid() {
        if (!window.MAP_DATA || !window.MAP_DATA.tiles) return;
        mapTileGrid = [];
        window.MAP_DATA.tiles.forEach(({ gx, gy, tx, ty }) => {
            if (!mapTileGrid[gy]) mapTileGrid[gy] = [];
            mapTileGrid[gy][gx] = { tx, ty };
        });
    }

    // --- 플레이어 ---
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
        swayChangeInterval: 80, // Frames between potential sway direction changes

        fallDirection: null,
        fallTimer: 0,

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
            this.jumpVelocityY -= CONFIG.JUMP.GRAVITY * dt;

            const airTime = (2 * CONFIG.JUMP.VELOCITIES[this.jumpLevel]) / CONFIG.JUMP.GRAVITY;
            const currentJumpSpeed = CONFIG.JUMP.DISTANCES[this.jumpLevel] / airTime;

            distanceTraveled += currentJumpSpeed * dt;

            if (this.visualY >= 0) {
                this.visualY = 0;
                this.actionState = STATE.IDLE;
                this.jumpVelocityY = 0;
                this.jumpCooldown = CONFIG.JUMP.COOLDOWN;

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
                inputForce = inputState.touchForce * CONFIG.BALANCE.INPUT_FORCE * 1.5;
            } else if (inputState.left) {
                inputForce = -CONFIG.BALANCE.INPUT_FORCE;
            } else if (inputState.right) {
                inputForce = CONFIG.BALANCE.INPUT_FORCE;
            }

            const instabilityMultiplier = Math.min(
                1 + (Math.max(0, distanceTraveled) * CONFIG.DIFFICULTY.RAMP),
                CONFIG.DIFFICULTY.CAP
            );
            const baseSwayIntensity = (this.actionState === STATE.WALKING) ? CONFIG.SWAY.INTENSITY_WALK : CONFIG.SWAY.INTENSITY_IDLE;

            this.swayTimer += dt;
            if (this.swayTimer > this.swayChangeInterval) {
                if (Math.random() < CONFIG.SWAY.CHANGE_PROB) {
                    this.swayTarget = (Math.random() - 0.5) * 2;
                    this.swayChangeInterval = CONFIG.SWAY.INTERVAL_MIN + Math.random() * (CONFIG.SWAY.INTERVAL_MAX - CONFIG.SWAY.INTERVAL_MIN);
                    this.swayTimer = 0;
                }
            }
            this.swayCurrent += (this.swayTarget - this.swayCurrent) * CONFIG.SWAY.LERP_SPEED * dt;

            const directionalSway = this.swayCurrent * baseSwayIntensity * instabilityMultiplier;
            const randomJitter = (Math.random() - 0.5) * CONFIG.SWAY.JITTER;

            this._inputForce = inputForce;
            this._swayForce = directionalSway;

            // Apply Forces (scale additive forces by dt; friction uses pow for correct per-dt decay)
            this.balanceVelocity += (inputForce + directionalSway + randomJitter) * dt;
            this.balanceVelocity *= Math.pow(CONFIG.BALANCE.DAMPING, dt);

            this.balanceVelocity = Math.max(-CONFIG.BALANCE.MAX_SPEED, Math.min(CONFIG.BALANCE.MAX_SPEED, this.balanceVelocity));

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
            stopMusic();
            if (fallenSfx && soundEnabled) {
                fallenSfx.muted = false;
                fallenSfx.currentTime = 0;
                fallenSfx._playToken = (fallenSfx._playToken || 0) + 1;
                const sfxToken = fallenSfx._playToken;
                getAudioContext().resume().then(() => {
                    if (fallenSfx._playToken === sfxToken) fallenSfx.play().catch(() => { });
                });
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

    // --- 게임 로직 ---
    function resetGame() {
        isGameOver = false;
        gameOverScreenTimer = 0;
        stopMusic();
        if (fallenSfx) fallenSfx._playToken = (fallenSfx._playToken || 0) + 1;
        playMusic('bgm');
        startTime = Date.now();
        elapsedTime = 0;
        lastTimestamp = 0;

        ataho.balanceLevel = 0;
        ataho.balanceVelocity = 0;
        ataho.actionState = STATE.IDLE;
        ataho.leanState = 'balanced';

        ataho.fallTimer = 0;
        ataho.swayTarget = 0;
        ataho.swayCurrent = 0;
        ataho.swayTimer = 0;
        ataho.swayChangeInterval = 80;
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

        gameOverOverlay.hidden = true;
        kbCursorIdx = -1;
        clearGameOverCursor();

        const jumpBtn = document.getElementById('mobile-jump-btn');
        if (jumpBtn) jumpBtn.style.display = 'block';
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

    // --- 렌더링 ---
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

    // --- HUD / UI ---
    function buildStats() {
        const totalSeconds = Math.floor(elapsedTime / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return {
            timeText: `Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
            distanceText: `Dist: ${(distanceTraveled / 100).toFixed(1)}m`
        };
    }

    function updateHUD(timeText, distanceText) {
        hudTime.textContent = timeText;
        hudDist.textContent = distanceText;
    }

    // --- 디버그 패널 ---
    let _debugPanel = null;

    function createDebugPanel() {
        _debugPanel = document.createElement('pre');
        _debugPanel.id = 'debug-stats';
        Object.assign(_debugPanel.style, {
            position: 'fixed',
            top: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.75)',
            color: '#0f0',
            font: '12px/1.6 monospace',
            padding: '10px 14px',
            borderRadius: '6px',
            pointerEvents: 'none',
            zIndex: '9999',
            whiteSpace: 'pre',
            minWidth: '220px'
        });
        document.body.appendChild(_debugPanel);
    }

    function updateDebugPanel() {
        if (!_debugPanel) return;
        const instability = Math.min(
            1 + (Math.max(0, distanceTraveled) * CONFIG.DIFFICULTY.RAMP),
            CONFIG.DIFFICULTY.CAP
        ).toFixed(3);

        const bar = (val, max, width = 20) => {
            const pct = Math.abs(val) / max;
            const filled = Math.round(pct * width);
            const dir = val >= 0 ? '>' : '<';
            return dir.repeat(filled).padEnd(width, '·');
        };

        const lines = [
            `state        ${ataho.actionState}`,
            `lean         ${ataho.leanState}`,
            ``,
            `balance      ${ataho.balanceLevel.toFixed(2).padStart(7)} / ${CONFIG.BALANCE.THRESHOLDS.MAX}`,
            `             [${bar(ataho.balanceLevel, CONFIG.BALANCE.THRESHOLDS.MAX)}]`,
            `velocity     ${ataho.balanceVelocity.toFixed(3).padStart(7)}`,
            ``,
            `inputForce   ${(ataho._inputForce ?? 0).toFixed(3).padStart(7)}`,
            `swayForce    ${(ataho._swayForce ?? 0).toFixed(4).padStart(7)}`,
            `swayCurrent  ${ataho.swayCurrent.toFixed(3).padStart(7)}`,
            `swayTarget   ${ataho.swayTarget.toFixed(3).padStart(7)}`,
            `swayNext     ${Math.max(0, ataho.swayChangeInterval - ataho.swayTimer).toFixed(0).padStart(4)}f`,
            ``,
            `instability  ${instability}x`,
            `distance     ${(distanceTraveled / 100).toFixed(1)}m`,
        ];

        if (ataho.actionState === STATE.FALLING) {
            lines.push(`fallTimer    ${ataho.fallTimer.toFixed(1).padStart(4)} / 30`);
        }
        if (ataho.actionState === STATE.JUMP_CHARGING) {
            lines.push(`chargeTimer  ${ataho.jumpChargeTimer.toFixed(0).padStart(4)}f  lv${ataho.jumpLevel}`);
        }
        if (ataho.actionState === STATE.JUMPING) {
            lines.push(`jumpVelY     ${ataho.jumpVelocityY.toFixed(3).padStart(7)}`);
            lines.push(`visualY      ${ataho.visualY.toFixed(1).padStart(7)}`);
        }
        if (ataho.jumpCooldown > 0) {
            lines.push(`jumpCooldown ${ataho.jumpCooldown.toFixed(0).padStart(4)}f`);
        }

        _debugPanel.textContent = lines.join('\n');
    }

    // --- 입력 핸들러 ---
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

    // --- 게임 루프 ---
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
                if (activeBgmId !== 'overBgm') playMusic('overBgm');
            }
        }

        const { timeText, distanceText } = buildStats();
        updateHUD(timeText, distanceText);
        if (isGameOver && gameOverScreenTimer >= GAME_OVER_SCREEN_DELAY && gameOverOverlay.hidden) {
            gameOverOverlay.hidden = false;
            kbCursorIdx = 0;
            setGameOverCursor(gameOverBtns[0]);
        }
        if (CONFIG.DEBUG.SHOW_STATS) updateDebugPanel();
    }

    // --- 초기화 ---
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    const soundBtnElement = document.getElementById('sound-btn');
    soundBtnElement.addEventListener('click', toggleSound);
    soundBtnElement.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
            e.preventDefault();
        }
    });
    const CURSOR_W = 12, CURSOR_H = 16, CURSOR_GAP = 4;
    const PANEL_BORDER = 16;
    let kbCursorIdx = -1;

    function setGameOverCursor(btn) {
        const pr = gameOverPanel.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        gameOverCursorEl.style.left = (br.left - pr.left - PANEL_BORDER - CURSOR_GAP - CURSOR_W) + 'px';
        gameOverCursorEl.style.top = (br.top - pr.top - PANEL_BORDER + (br.height - CURSOR_H) / 2) + 'px';
        gameOverCursorEl.hidden = false;
    }

    function clearGameOverCursor() {
        gameOverCursorEl.hidden = true;
    }

    gameOverBtns.forEach((btn, i) => {
        btn.addEventListener('mouseenter', () => {
            kbCursorIdx = i;
            setGameOverCursor(btn);
        });
        btn.addEventListener('mouseleave', () => {
            kbCursorIdx = -1;
            clearGameOverCursor();
        });
    });

    document.addEventListener('keydown', (e) => {
        if (gameOverOverlay.hidden) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            kbCursorIdx = kbCursorIdx < 0 ? 0 : (kbCursorIdx + 1) % gameOverBtns.length;
            setGameOverCursor(gameOverBtns[kbCursorIdx]);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            kbCursorIdx = kbCursorIdx < 0 ? gameOverBtns.length - 1 : (kbCursorIdx - 1 + gameOverBtns.length) % gameOverBtns.length;
            setGameOverCursor(gameOverBtns[kbCursorIdx]);
        } else if ((e.key === 'Enter' || e.key === ' ') && kbCursorIdx >= 0) {
            e.preventDefault();
            gameOverBtns[kbCursorIdx].click();
        }
    });

    document.getElementById('btn-continue').addEventListener('click', resetGame);
    document.getElementById('btn-home').addEventListener('click', () => { window.location.href = '../index.html'; });

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

    if (CONFIG.DEBUG.SHOW_STATS) createDebugPanel();

    window.debug = {
        toggleStats() {
            CONFIG.DEBUG.SHOW_STATS = !CONFIG.DEBUG.SHOW_STATS;
            if (CONFIG.DEBUG.SHOW_STATS) {
                if (!_debugPanel) createDebugPanel();
                else _debugPanel.style.display = 'block';
            } else if (_debugPanel) {
                _debugPanel.style.display = 'none';
            }
        },
        toggleHitbox() { CONFIG.DEBUG.SHOW_HITBOX = !CONFIG.DEBUG.SHOW_HITBOX; },
        toggleMute()   { toggleSound(); },
    };

    console.log(
        '%c[디버그 명령어]%c\n' +
        '  debug.toggleStats()   — 수치 패널 ON/OFF\n' +
        '  debug.toggleHitbox()  — 히트박스 ON/OFF\n' +
        '  debug.toggleMute()    — 오디오 ON/OFF',
        'color:#000;font-weight:bold', 'color:inherit'
    );

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
            playMusic('bgm');
        } else {
            _bgmPending = true;
        }

        byFrame();
    }).catch(error => {
        console.error('리소스 로드 중 오류 발생:', error);
    });

})();
