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
    const SWAY_INTENSITY_IDLE = 0.1;
    const SWAY_INTENSITY_WALK = 0.3;
    const PLAYER_CONTROL_FORCE = 0.5;
    const FRICTION = 0.92;
    const MAX_VELOCITY = 2.5;
    const INERTIA_CONSTANT = 0.005; // ✨ 관성 상수 (기울어질수록 더 빠르게 기울어짐)

    // 🌟 [Jump Constants]
    const JUMP_CHARGE_TIME = 20;
    const JUMP_POWER_LEVELS = [4, 7, 11];
    const JUMP_INITIAL_VELOCITY_Y = 12;
    const GRAVITY = 0.6;

    const gameSpeed = 2;
    let distanceTraveled = 0;
    let backgroundY = 0;
    let isGameOver = false;

    // 이미지 경로 정의
    const imagePaths = {
        spriteSheet: 'balance.png',
        background: 'balance_beam.png'
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

    // 🌟 [최적화 3]: 상태별 프레임 매핑 테이블 (기울기 상태 기준)
    const leanStateToFrameMap = {
        'balanced': frames.walking,
        'leaning_left_slight': frames.leaning_left_slight,
        'leaning_left_medium': frames.leaning_left_medium,
        'leaning_left_large': frames.leaning_left_large,
        'leaning_right_slight': frames.leaning_right_slight,
        'leaning_right_medium': frames.leaning_right_medium,
        'leaning_right_large': frames.leaning_right_large,
    };

    const walkAnimationSequence = [0, 1, 2, 1];

    // 게임 상태 변수
    const inputState = {};

    // 캐릭터 객체
    const ataho = {
        x: canvas.width / 2 - (frames.walking.width * SCALE_FACTOR) / 2,
        y: canvas.height / 2 - (frames.walking.height * SCALE_FACTOR) / 2,
        width: frames.walking.width * SCALE_FACTOR,
        height: frames.walking.height * SCALE_FACTOR,

        // ✨ 상태 분리
        actionState: 'idle', // idle, walking, walking_backward, jumping, jump_charging, falling, fallen
        leanState: 'balanced', // balanced, leaning_left_slight, ...

        balanceLevel: 0,
        balanceVelocity: 0,
        fallDirection: null,
        fallTimer: 0,
        animationTimer: 0,

        // ✨ 점프 관련 변수
        jumpChargeTimer: 0,
        jumpLevel: 0,
        jumpVelocityY: 0,
        visualY: 0,

        update() {
            // 0. 점프 및 충전 로직
            if (this.actionState === 'jumping') {
                // 점프 중 물리 처리
                this.visualY -= this.jumpVelocityY;
                this.jumpVelocityY -= GRAVITY;

                // 전진 (점프 파워에 따라)
                const currentJumpSpeed = JUMP_POWER_LEVELS[this.jumpLevel];
                distanceTraveled += currentJumpSpeed;
                backgroundY -= currentJumpSpeed;

                // 착지 체크
                if (this.visualY >= 0) {
                    this.visualY = 0;
                    this.actionState = 'idle';
                    this.jumpVelocityY = 0;
                }
                return; // 점프 중에는 다른 상태 업데이트 건너뜀
            }

            if (inputState.space) {
                if (!this.actionState.includes('jump_charging')) {
                    // 충전 시작
                    this.actionState = 'jump_charging';
                    this.jumpChargeTimer = 0;
                    this.jumpLevel = 0;
                } else {
                    // 충전 중
                    this.jumpChargeTimer++;
                    if (this.jumpChargeTimer > JUMP_CHARGE_TIME * 2) {
                        this.jumpLevel = 2;
                    } else if (this.jumpChargeTimer > JUMP_CHARGE_TIME) {
                        this.jumpLevel = 1;
                    } else {
                        this.jumpLevel = 0;
                    }
                }
                return; // 충전 중에는 이동 불가
            } else if (this.actionState.includes('jump_charging')) {
                // 스페이스바 뗌 -> 점프 시작
                this.actionState = 'jumping';
                this.jumpVelocityY = JUMP_INITIAL_VELOCITY_Y;
                return;
            }

            // 1. 균형 레벨 업데이트 (Physics-based)
            let inputForce = 0;
            if (inputState.left) {
                inputForce = -PLAYER_CONTROL_FORCE;
            } else if (inputState.right) {
                inputForce = PLAYER_CONTROL_FORCE;
            }

            // Random Sway
            const currentSwayIntensity = (this.actionState.includes('walking')) ? SWAY_INTENSITY_WALK : SWAY_INTENSITY_IDLE;
            const swayForce = (Math.random() - 0.5) * currentSwayIntensity;

            // ✨ Inertia (관성): 기울어진 방향으로 가속도 추가
            const inertiaForce = this.balanceLevel * INERTIA_CONSTANT;

            // Update Velocity
            this.balanceVelocity += inputForce + swayForce + inertiaForce;
            this.balanceVelocity *= FRICTION;

            // Cap Velocity
            if (this.balanceVelocity > MAX_VELOCITY) this.balanceVelocity = MAX_VELOCITY;
            if (this.balanceVelocity < -MAX_VELOCITY) this.balanceVelocity = -MAX_VELOCITY;

            // Update Position
            this.balanceLevel += this.balanceVelocity;

            // 2. 균형 초과 및 낙하 상태 체크
            if (this.balanceLevel >= BALANCE_THRESHOLD.MAX) {
                this.actionState = 'falling';
                this.fallDirection = 'right';
            } else if (this.balanceLevel <= -BALANCE_THRESHOLD.MAX) {
                this.actionState = 'falling';
                this.fallDirection = 'left';
            }

            // 3. Lean State 결정 (Visual)
            const absBalance = Math.abs(this.balanceLevel);
            const direction = this.balanceLevel < 0 ? 'left' : 'right';

            if (absBalance < BALANCE_THRESHOLD.SLIGHT) {
                this.leanState = 'balanced';
            } else {
                let leanLevel = 'slight';
                if (absBalance >= BALANCE_THRESHOLD.MEDIUM) {
                    leanLevel = 'medium';
                }
                if (absBalance >= BALANCE_THRESHOLD.MAX * 0.8) { // MAX에 가까워지면 large (조정 가능)
                    leanLevel = 'large';
                }
                // 기존 로직 유지
                if (absBalance >= BALANCE_THRESHOLD.MEDIUM) {
                    leanLevel = 'large'; // 기존 로직상 60 이상이면 large였음.
                } else if (absBalance >= BALANCE_THRESHOLD.SLIGHT) {
                    leanLevel = 'medium'; // 30 이상이면 medium
                }

                // 수정: large는 정말 위험할 때만 나오게 하거나, 기존대로 하거나.
                // 기존 frames 정의에 따르면 slight, medium, large가 있음.
                // slight: 30~60
                // medium: 60~100 (원래 로직)
                // large: ??? 원래 로직에 large가 있었나?
                // 원래 로직:
                // if (absBalance >= BALANCE_THRESHOLD.MEDIUM) leanLevel = 'large';
                // else if (absBalance >= BALANCE_THRESHOLD.SLIGHT) leanLevel = 'medium';
                // else leanLevel = 'slight'; (이건 else에 걸려서 slight가 됨)

                // 다시 정리:
                if (absBalance >= BALANCE_THRESHOLD.MEDIUM) {
                    leanLevel = 'large';
                } else if (absBalance >= BALANCE_THRESHOLD.SLIGHT) {
                    leanLevel = 'medium';
                } else {
                    leanLevel = 'slight';
                }

                this.leanState = `leaning_${direction}_${leanLevel}`;
            }


            // 4. Action State 결정 (Input)
            if (this.actionState !== 'falling' && this.actionState !== 'fallen') {
                if (inputState.down || inputState.up) {
                    // 걷기 상태
                    this.actionState = inputState.down ? 'walking' : 'walking_backward';

                    // ✨ 걷기 시 거리 업데이트
                    if (this.actionState === 'walking') {
                        distanceTraveled += gameSpeed;
                        backgroundY -= gameSpeed;
                    } else if (this.actionState === 'walking_backward') {
                        distanceTraveled -= gameSpeed;
                        backgroundY += gameSpeed;
                    }
                } else {
                    // 대기 상태 (하지만 균형은 계속 잡아야 함)
                    this.actionState = 'idle';
                }
            }

            // 낙하 애니메이션 타이머
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
            let currentFrameSet = frames.walking; // Default
            let finalX = this.x;
            let finalY = this.y;
            let frameIndex = 0;

            // 1. Determine Frame Set based on State
            if (this.actionState === 'falling') {
                currentFrameSet = this.fallDirection === 'left' ? frames.falling.left : frames.falling.right;
            } else if (this.actionState === 'fallen') {
                currentFrameSet = frames.fallen;
                const fallenOffsetX = 40;
                const fallenOffsetY = 20;
                if (this.fallDirection === 'left') finalX -= fallenOffsetX;
                else finalX += fallenOffsetX;
                finalY += fallenOffsetY;
            } else if (this.actionState.includes('jump_charging')) {
                // 점프 충전 중
                const chargeFrameKey = `jump_charging_${this.jumpLevel}`;
                // stateToFrameMap 대신 직접 frames.jumping 사용
                // 기존 stateToFrameMap에 있던 로직을 가져옴
                const jumpFrames = [
                    { x: frames.jumping.x[0], y: frames.jumping.y[0] },
                    { x: frames.jumping.x[1], y: frames.jumping.y[1] },
                    { x: frames.jumping.x[2], y: frames.jumping.y[2] }
                ];
                const currentJumpFrame = jumpFrames[this.jumpLevel];
                currentFrameSet = { x: currentJumpFrame.x, y: currentJumpFrame.y, width: 80, height: 96 };

            } else if (this.actionState === 'jumping') {
                currentFrameSet = { x: frames.jumping.x[3], y: frames.jumping.y[3], width: 80, height: 96 };
            } else {
                // Idle or Walking -> Use Lean State
                if (leanStateToFrameMap[this.leanState]) {
                    currentFrameSet = leanStateToFrameMap[this.leanState];
                }
            }

            // ✨ 점프 높이 적용
            finalY += this.visualY;

            // 2. Determine Frame Index (Animation)
            // 걷는 중이거나, 뒤로 걷는 중일 때만 애니메이션 재생
            if (this.actionState.includes('walking')) {
                if (currentFrameSet.x && Array.isArray(currentFrameSet.x) && currentFrameSet.x.length > 1) {
                    const sequence = walkAnimationSequence;
                    const sequenceIndex = Math.floor(this.animationTimer / ANIMATION_FPS_DIVISOR) % sequence.length;
                    frameIndex = sequence[sequenceIndex];
                }
            } else {
                // Idle 상태면 첫 번째 프레임 (멈춰있는 상태)
                frameIndex = 0;
            }

            // 현재 프레임의 원본 좌표 계산
            let sourceX = Array.isArray(currentFrameSet.x) ? currentFrameSet.x[frameIndex] : currentFrameSet.x;
            let sourceY = Array.isArray(currentFrameSet.y) ? currentFrameSet.y[frameIndex] : currentFrameSet.y;

            // 이미지 그리기
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
        }
    };

    //===========================================
    // 메인 게임 루프
    //===========================================
    function byFrame() {
        requestAnimationFrame(byFrame);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!isGameOver) {
            ataho.update();

            if (backgroundY <= -canvas.height) {
                backgroundY += canvas.height;
            }
            if (backgroundY >= canvas.height) {
                backgroundY -= canvas.height;
            }
        } else {
            // 게임 오버 상태에서도 애니메이션 타이머는 계속 돌려야 할 수도 있음 (필요시)
            // 현재는 멈춤
        }

        // 배경 그리기
        if (images.background) {
            ctx.drawImage(images.background, 0, backgroundY, canvas.width, canvas.height);
            ctx.drawImage(images.background, 0, backgroundY + canvas.height, canvas.width, canvas.height);
        }

        ataho.draw();

        if (isGameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = '48px "Raster Forge", sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
        }
    }

    //===========================================
    // 입력 처리
    //===========================================
    document.addEventListener('keydown', (e) => {
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
    });

    document.addEventListener('keyup', (e) => {
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
    });

    // 터치 이벤트 리스너
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (isGameOver) return;

        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;

        // 화면 중앙 기준 좌우 판별
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // 초기화
        Object.keys(inputState).forEach(key => inputState[key] = false);

        // 간단한 터치 컨트롤: 화면 왼쪽/오른쪽 터치로 균형 잡기
        // 상하 이동은 화면 위/아래 터치로 구현

        // X축 컨트롤
        if (touchX < centerX - 50) {
            inputState.left = true;
        } else if (touchX > centerX + 50) {
            inputState.right = true;
        }

        // Y축 컨트롤 (옵션: 걷기)
        if (touchY < centerY - 50) {
            inputState.up = true;
        } else if (touchY > centerY + 50) {
            inputState.down = true;
        }
    });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        Object.keys(inputState).forEach(key => inputState[key] = false);
    });

    //===========================================
    // 게임 시작
    //===========================================
    Promise.all([loadImages(), loadFonts()]).then(() => {
        console.log('모든 이미지와 폰트 로드 완료. 게임 시작!');
        byFrame();
    }).catch(error => {
        console.error('리소스 로드 중 오류 발생:', error);
    });

})();