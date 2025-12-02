// 전역 변수 오염을 막기 위해 모든 코드를 즉시 실행 함수로 감쌉니다.
(function () {
    //===========================================
    // 게임 설정 및 초기화
    //===========================================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 960;
    canvas.height = 640;

    // 🌟 [최적화 1]: 핵심 상수 정의
    const SCALE_FACTOR = 1.5;
    const ANIMATION_FPS_DIVISOR = 10;
    const BALANCE_THRESHOLD = {
        SLIGHT: 30,
        MEDIUM: 60,
        MAX: 100
    };

    // 🌟 [Physics Constants]
    const SWAY_INTENSITY_IDLE = 0.07;
    const SWAY_INTENSITY_WALK = 0.2;
    const PLAYER_CONTROL_FORCE = 0.4;
    const FRICTION = 0.90;
    const MAX_VELOCITY = 2.5;
    const INERTIA_CONSTANT = 0.003;

    // 🌟 [Jump Constants]
    const JUMP_CHARGE_TIME = 20;
    const JUMP_POWER_LEVELS = [4, 7, 11];
    const JUMP_INITIAL_VELOCITY_Y = 12;
    const GRAVITY = 0.6;

    // 🌟 [Sprite Constants]
    const SPRITE_WIDTH = 80;
    const SPRITE_HEIGHT = 96;
    const FALLEN_OFFSET_X = 40;
    const FALLEN_OFFSET_Y = 20;

    // 🌟 [Layout Constants]
    const TOUCH_DEADZONE = 0.05;
    const TOUCH_UPPER_ZONE = 0.25;
    const TOUCH_LOWER_ZONE = 0.75;
    const BUTTON_WIDTH = 200;
    const BUTTON_HEIGHT = 60;

    const gameSpeed = 2;
    let distanceTraveled = 0;
    let backgroundY = 0;
    let isGameOver = false;
    let currentRAFId = null; // 🌟 [메모리 누수 방지 1]: RAF ID 저장

    // 이미지 경로 정의
    const imagePaths = {
        spriteSheet: 'balance_char.png',
        background: 'balance_bg.png',
        beamStart: 'beam_start.png',
        beamMid: 'beam_mid.png',
        beamEnd: 'beam_end.png'
    };

    const images = {};

    // 이미지 로드 함수
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

    // 폰트 로드 함수
    function loadFonts() {
        const font = new FontFace('Raster Forge', 'url(https://fonts.cdnfonts.com/s/123917/RasterForgeRegular-XGDg9.woff)');
        return font.load().then(loadedFont => {
            document.fonts.add(loadedFont);
        });
    }

    //===========================================
    // 스프라이트 및 게임 데이터
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
        { x: frames.jumping.x[0], y: frames.jumping.y[0] },
        { x: frames.jumping.x[1], y: frames.jumping.y[1] },
        { x: frames.jumping.x[2], y: frames.jumping.y[2] }
    ];

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
        animationTimer: 0,

        jumpChargeTimer: 0,
        jumpLevel: 0,
        jumpVelocityY: 0,
        visualY: 0,

        update() {
            if (this.actionState === 'jumping') {
                this.visualY -= this.jumpVelocityY;
                this.jumpVelocityY -= GRAVITY;

                const currentJumpSpeed = JUMP_POWER_LEVELS[this.jumpLevel];
                distanceTraveled += currentJumpSpeed;
                backgroundY -= currentJumpSpeed;

                if (this.visualY >= 0) {
                    this.visualY = 0;
                    this.actionState = 'idle';
                    this.jumpVelocityY = 0;
                }
                return;
            }

            if (inputState.space) {
                if (!this.actionState.includes('jump_charging')) {
                    this.actionState = 'jump_charging';
                    this.jumpChargeTimer = 0;
                    this.jumpLevel = 0;
                } else {
                    this.jumpChargeTimer++;
                    if (this.jumpChargeTimer > JUMP_CHARGE_TIME * 2) {
                        this.jumpLevel = 2;
                    } else if (this.jumpChargeTimer > JUMP_CHARGE_TIME) {
                        this.jumpLevel = 1;
                    } else {
                        this.jumpLevel = 0;
                    }
                }
                return;
            } else if (this.actionState.includes('jump_charging')) {
                this.actionState = 'jumping';
                this.jumpVelocityY = JUMP_INITIAL_VELOCITY_Y;
                return;
            }

            let inputForce = 0;

            if (typeof inputState.touchForce === 'number' && inputState.touchForce !== 0) {
                inputForce = inputState.touchForce * PLAYER_CONTROL_FORCE * 1.5;
            }
            else if (inputState.left) {
                inputForce = -PLAYER_CONTROL_FORCE;
            } else if (inputState.right) {
                inputForce = PLAYER_CONTROL_FORCE;
            }

            const currentSwayIntensity = (this.actionState.includes('walking')) ? SWAY_INTENSITY_WALK : SWAY_INTENSITY_IDLE;
            const swayForce = (Math.random() - 0.5) * currentSwayIntensity;

            const inertiaForce = this.balanceLevel * INERTIA_CONSTANT;

            this.balanceVelocity += inputForce + swayForce + inertiaForce;
            this.balanceVelocity *= FRICTION;

            if (this.balanceVelocity > MAX_VELOCITY) this.balanceVelocity = MAX_VELOCITY;
            if (this.balanceVelocity < -MAX_VELOCITY) this.balanceVelocity = -MAX_VELOCITY;

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
                if (absBalance >= BALANCE_THRESHOLD.MEDIUM) {
                    leanLevel = 'large';
                } else if (absBalance >= BALANCE_THRESHOLD.SLIGHT) {
                    leanLevel = 'medium';
                }
                this.leanState = `leaning_${direction}_${leanLevel}`;
            }

            if (this.actionState !== 'falling' && this.actionState !== 'fallen') {
                if (inputState.down || inputState.up) {
                    this.actionState = inputState.down ? 'walking' : 'walking_backward';

                    if (this.actionState === 'walking') {
                        distanceTraveled += gameSpeed;
                        backgroundY -= gameSpeed;
                    } else if (this.actionState === 'walking_backward') {
                        distanceTraveled -= gameSpeed;
                        backgroundY += gameSpeed;
                    }
                } else {
                    this.actionState = 'idle';
                }
            }

            if (this.actionState === 'falling') {
                this.fallTimer++;
                if (this.fallTimer >= 30) {
                    this.actionState = 'fallen';
                    isGameOver = true;
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
            } else if (this.actionState === 'fallen') {
                currentFrameSet = frames.fallen;
                if (this.fallDirection === 'left') finalX -= FALLEN_OFFSET_X;
                else finalX += FALLEN_OFFSET_X;
                finalY += FALLEN_OFFSET_Y;
            } else if (this.actionState.includes('jump_charging')) {
                const currentJumpFrame = jumpChargeFrames[this.jumpLevel];
                currentFrameSet = { x: currentJumpFrame.x, y: currentJumpFrame.y, width: SPRITE_WIDTH, height: SPRITE_HEIGHT };

            } else if (this.actionState === 'jumping') {
                currentFrameSet = { x: frames.jumping.x[3], y: frames.jumping.y[3], width: SPRITE_WIDTH, height: SPRITE_HEIGHT };
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
            if (this.actionState === 'jumping' || this.actionState.includes('jump_charging')) {
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
        }
    };

    function resetGame() {
        isGameOver = false;
        ataho.balanceLevel = 0;
        ataho.balanceVelocity = 0;
        ataho.actionState = 'idle';
        ataho.leanState = 'balanced';
        ataho.fallTimer = 0;
        ataho.x = canvas.width / 2 - (frames.walking.width * SCALE_FACTOR) / 2;
        ataho.y = canvas.height / 2 - (frames.walking.height * SCALE_FACTOR) / 2;
        ataho.visualY = 0;
        ataho.jumpVelocityY = 0;
        ataho.jumpLevel = 0;
        distanceTraveled = 0;
        backgroundY = 0;

        Object.keys(inputState).forEach(key => inputState[key] = false);

        byFrame();
    }

    function isClickInsideButton(clickX, clickY, button) {
        return clickX >= button.x && clickX <= button.x + button.width &&
               clickY >= button.y && clickY <= button.y + button.height;
    }

    // 🌟 [유틸 함수]: 값 범위 제한
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // 🌟 [메모리 누수 방지 2]: 이벤트 핸들러를 변수로 저장 (재사용 가능)
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
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        if (isClickInsideButton(clickX, clickY, buttons.continue)) {
            resetGame();
        } else if (isClickInsideButton(clickX, clickY, buttons.exit)) {
            window.location.href = '../index.html';
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
            const touchX = e.touches[0].clientX - rect.left;
            const touchY = e.touches[0].clientY - rect.top;

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
        if (!isGameOver) {
            currentRAFId = requestAnimationFrame(byFrame);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!isGameOver) {
            ataho.update();

            if (backgroundY <= -canvas.height) {
                backgroundY += canvas.height;
            }
            if (backgroundY > 0) {
                backgroundY -= canvas.height;
            }
        }

        if (images.background) {
            ctx.drawImage(images.background, 0, backgroundY, canvas.width, canvas.height);
            ctx.drawImage(images.background, 0, backgroundY + canvas.height, canvas.width, canvas.height);
        }

        if (images.beamStart && images.beamMid) {
            const beamStartX = canvas.width / 2 - images.beamStart.width / 2;
            const startY = canvas.height / 2;

            let currentDrawY = startY - distanceTraveled;

            if (currentDrawY > -images.beamStart.height) {
                ctx.drawImage(images.beamStart, beamStartX, currentDrawY);
            }

            let midDrawY = currentDrawY + images.beamStart.height;

            if (midDrawY < -images.beamMid.height) {
                const skipCount = Math.ceil((-images.beamMid.height - midDrawY) / images.beamMid.height);
                midDrawY += skipCount * images.beamMid.height;
            }

            while (midDrawY < canvas.height) {
                ctx.drawImage(images.beamMid, beamStartX, midDrawY);
                midDrawY += images.beamMid.height;
            }
        }

        ataho.draw();

        ctx.font = '24px "Raster Forge", sans-serif';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Score: ${(distanceTraveled / 100).toFixed(2)}`, 20, 20);

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

    // 🌟 [메모리 누수 방지 3]: 이벤트 리스너 등록 (중복 방지, 한 번만)
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
    canvas.addEventListener('touchmove', handleTouch, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    Promise.all([loadImages(), loadFonts()]).then(() => {
        console.log('모든 이미지와 폰트 로드 완료. 게임 시작!');
        byFrame();
    }).catch(error => {
        console.error('리소스 로드 중 오류 발생:', error);
    });

})();
