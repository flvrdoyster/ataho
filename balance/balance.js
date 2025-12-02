// 전역 변수 오염을 막기 위해 모든 코드를 즉시 실행 함수로 감쌉니다.
(function () {
    //===========================================
    // 게임 설정 및 초기화
    //===========================================
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 800;
    canvas.height = 600;

    // 🌟 [최적화 1]: 핵심 상수 정의
    const SCALE_FACTOR = 1.5;
    const ANIMATION_FPS_DIVISOR = 10;
    const BALANCE_THRESHOLD = {
        SLIGHT: 30,
        MEDIUM: 60,
        MAX: 100
    };

    // 🌟 [Physics Constants]
    const SWAY_INTENSITY_IDLE = 0.1; // Reduced from 0.5
    const SWAY_INTENSITY_WALK = 0.3;
    const PLAYER_CONTROL_FORCE = 0.5; // Reduced from 1.5
    const FRICTION = 0.92; // More damping (was 0.95)
    const MAX_VELOCITY = 2.5; // Reduced from 5

    const gameSpeed = 2;
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

    // 🌟 [최적화 3]: 상태별 프레임 매핑 테이블
    const stateToFrameMap = {
        'idle': frames.walking,
        'walking': frames.walking,
        'walking_backward': frames.walking,
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
        state: 'idle',
        balanceLevel: 0,
        balanceVelocity: 0,
        fallDirection: null,
        fallTimer: 0,
        animationTimer: 0,

        update() {
            // 1. 균형 레벨 업데이트 (Physics-based)
            let inputForce = 0;
            if (inputState.left) {
                inputForce = -PLAYER_CONTROL_FORCE;
            } else if (inputState.right) {
                inputForce = PLAYER_CONTROL_FORCE;
            }

            // Random Sway
            const currentSwayIntensity = (this.state.includes('walking')) ? SWAY_INTENSITY_WALK : SWAY_INTENSITY_IDLE;
            const swayForce = (Math.random() - 0.5) * currentSwayIntensity;

            // Update Velocity
            this.balanceVelocity += inputForce + swayForce;
            this.balanceVelocity *= FRICTION;

            // Cap Velocity
            if (this.balanceVelocity > MAX_VELOCITY) this.balanceVelocity = MAX_VELOCITY;
            if (this.balanceVelocity < -MAX_VELOCITY) this.balanceVelocity = -MAX_VELOCITY;

            // Update Position
            this.balanceLevel += this.balanceVelocity;

            // Center Recovery (Optional: slight pull to center if no input? - maybe not for "hard" mode)
            // For now, let friction handle the "stopping", but gravity/sway keeps it moving.

            // 2. 균형 초과 및 낙하 상태 체크
            if (this.balanceLevel >= BALANCE_THRESHOLD.MAX) {
                this.state = 'falling';
                this.fallDirection = 'right';
            } else if (this.balanceLevel <= -BALANCE_THRESHOLD.MAX) {
                this.state = 'falling';
                this.fallDirection = 'left';
            }

            // Character State 결정 로직
            if (this.state !== 'falling' && this.state !== 'fallen') {
                if (inputState.down || inputState.up) {
                    // 걷기 상태
                    this.state = inputState.down ? 'walking' : 'walking_backward';
                } else if (inputState.left || inputState.right) {
                    // 기울이기 상태
                    const direction = inputState.left ? 'left' : 'right';
                    const absBalance = Math.abs(this.balanceLevel);
                    let leanLevel = 'slight';

                    if (absBalance >= BALANCE_THRESHOLD.MEDIUM) {
                        leanLevel = 'large';
                    } else if (absBalance >= BALANCE_THRESHOLD.SLIGHT) {
                        leanLevel = 'medium';
                    }

                    this.state = `leaning_${direction}_${leanLevel}`;
                } else {
                    // 대기 상태
                    this.state = 'idle';
                }
            }

            // 낙하 애니메이션 타이머
            if (this.state === 'falling') {
                this.fallTimer++;
                if (this.fallTimer >= 30) { // FALL_ANIMATION_DURATION
                    this.state = 'fallen';
                    isGameOver = true;
                }
            }

            if (this.state.includes('walking')) {
                this.animationTimer++;
            }
        },

        draw() {
            let currentFrame = frames.idle;
            let finalX = this.x;
            let finalY = this.y;
            let frameIndex = 0;

            if (stateToFrameMap[this.state]) {
                currentFrame = stateToFrameMap[this.state];
            } else if (this.state === 'falling') {
                currentFrame = this.fallDirection === 'left' ? frames.falling.left : frames.falling.right;
            } else if (this.state === 'fallen') {
                currentFrame = frames.fallen;
                const fallenOffsetX = 40;
                const fallenOffsetY = 20;

                if (this.fallDirection === 'left') {
                    finalX = this.x - fallenOffsetX;
                } else {
                    finalX = this.x + fallenOffsetX;
                }
                finalY = this.y + fallenOffsetY;
            }

            // 애니메이션 프레임 인덱스 계산
            if (currentFrame.x && Array.isArray(currentFrame.x) && currentFrame.x.length > 1) {
                const sequence = walkAnimationSequence;
                const sequenceIndex = Math.floor(this.animationTimer / ANIMATION_FPS_DIVISOR) % sequence.length;
                frameIndex = sequence[sequenceIndex];
            }

            // 현재 프레임의 원본 좌표 계산
            let sourceX = Array.isArray(currentFrame.x) ? currentFrame.x[frameIndex] : currentFrame.x;
            let sourceY = Array.isArray(currentFrame.y) ? currentFrame.y[frameIndex] : currentFrame.y;

            // 이미지 그리기
            ctx.drawImage(
                images.spriteSheet,
                sourceX,
                sourceY,
                currentFrame.width,
                currentFrame.height,
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

            // 배경 스크롤 로직
            if (ataho.state === 'walking') {
                backgroundY -= gameSpeed;
            } else if (ataho.state === 'walking_backward') {
                backgroundY += gameSpeed;
            }

            if (backgroundY <= -canvas.height) {
                backgroundY = 0;
            }
            if (backgroundY >= canvas.height) {
                backgroundY = 0;
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