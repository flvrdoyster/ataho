// 전역 변수 오염을 막기 위해 모든 코드를 즉시 실행 함수로 감쌉니다.
(function() {
    // 캔버스와 2D 렌더링 컨텍스트를 정의합니다.
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 960;
    canvas.height = 640;

    // ✨ 캐릭터의 움직임 속도를 한 번에 조절하는 변수입니다. 원하는 값으로 변경해 보세요.
    const movementSpeed = 2; 

    // 이미지 경로를 배열로 관리하여 코드를 간결하게 만듭니다.
    const imagePaths = [
        'idle_r1.png', 'idle_r2.png', 'swim_r1.png', 'swim_r2.png', 'swim_r3.png',
        'swim_r4.png', 'swim_l1.png', 'swim_l2.png', 'swim_l3.png', 'swim_l4.png',
        'drown_1.png', 'drown_2.png', 'drown_3.png', 'drown_4.png', 'whirlpool_2x.png'
    ];

    const images = {};
    let imagesLoaded = 0;

    // 모든 이미지가 로드될 때까지 기다리는 비동기 함수입니다.
    function loadImages() {
        return new Promise(resolve => {
            imagePaths.forEach(path => {
                const img = new Image();
                img.onload = () => {
                    imagesLoaded++;
                    if (imagesLoaded === imagePaths.length) {
                        resolve();
                    }
                };
                img.src = path;
                const fileName = path.split('.')[0];
                images[fileName] = img;
            });
        });
    }

    // 아타호 캐릭터 객체
    const ataho = {
        x: 10,
        y: 250,
        width: 120,
        height: 80,
        state: 'idle_right',
        draw() {
            const animationFrames = {
                'idle': [images.idle_r1, images.idle_r2],
                'swim_right': [images.swim_r1, images.swim_r2, images.swim_r3, images.swim_r4],
                'swim_left': [images.swim_l1, images.swim_l2, images.swim_l3, images.swim_l4],
                'drown': [images.drown_1, images.drown_2, images.drown_3, images.drown_4]
            };
            
            let frames = animationFrames.idle;
            let frameIndex = 0;

            if (this.state.includes('swim_right')) {
                frames = animationFrames.swim_right;
                frameIndex = Math.floor(timer.swim / 2) % frames.length;
            } else if (this.state.includes('swim_left')) {
                frames = animationFrames.swim_left;
                frameIndex = Math.floor(timer.swim / 2) % frames.length;
            } else if (this.state === 'drown') {
                frames = animationFrames.drown;
                frameIndex = Math.floor(timer.drown / 6) % frames.length;
            } else {
                frames = animationFrames.idle;
                frameIndex = Math.floor(timer.idle / 12) % frames.length;
            }

            ctx.drawImage(frames[frameIndex], this.x, this.y);
        }
    };

    // 소용돌이 객체
    const whirlpool = {
        x: 800,
        y: 250,
        width: 120,
        height: 200,
        draw() {
            ctx.drawImage(images.whirlpool_2x, this.x, this.y);
        }
    };

    // 게임 상태와 타이머 변수
    let isDrowned = false;
    // ✨ 키보드와 터치 입력 상태를 모두 관리하는 객체
    const inputState = {}; 
    const timer = {
        idle: 0,
        swim: 0,
        drown: 0
    };
    let drownStartTime = null;

    // 게임 루프 (`byFrame`): 매 프레임마다 호출됩니다.
    function byFrame() {
        requestAnimationFrame(byFrame);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isDrowned) {
            ataho.state = 'drown';
            timer.drown++;

            if (Date.now() - drownStartTime >= 5000) {
                resetCharacter();
            }
        } else {
            // ✨ inputState 객체를 확인하여 캐릭터를 움직입니다.
            if (inputState.up) {
                ataho.y -= movementSpeed;
            }
            if (inputState.down) {
                ataho.y += movementSpeed;
            }
            if (inputState.right) {
                ataho.x += movementSpeed;
                ataho.state = 'swim_right';
                timer.swim++;
            } else if (inputState.left) {
                ataho.x -= movementSpeed;
                ataho.state = 'swim_left';
                timer.swim++;
            } else {
                ataho.state = 'idle_right';
                timer.idle++;
            }
        }

        whirlpool.draw();
        ataho.draw();
        
        checkCollision(ataho, whirlpool);
    }

    // 충돌 체크 함수
    function checkCollision(player, obstacle) {
        const playerRight = player.x + player.width;
        const playerBottom = player.y + player.height;
        const obstacleRight = obstacle.x + obstacle.width;
        const obstacleBottom = obstacle.y + obstacle.height;

        const isCollidingX = playerRight > obstacle.x && player.x < obstacleRight;
        const isCollidingY = playerBottom > obstacle.y && player.y < obstacleBottom;

        if (isCollidingX && isCollidingY) {
            if (!isDrowned) {
                isDrowned = true;
                drownStartTime = Date.now();
            }
        } else {
            isDrowned = false;
        }
    }
    
    // ✨ 키보드 이벤트 리스너 추가 (이전 코드에서 복구)
    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (isDrowned) return;

        // 눌린 키에 따라 inputState를 업데이트
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                inputState.up = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                inputState.down = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                inputState.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                inputState.right = true;
                break;
            case 'Enter':
                resetCharacter();
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                inputState.up = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                inputState.down = false;
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

    // ✨ 터치 이벤트 리스너 추가
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        if (isDrowned) return;

        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;

        const characterCenterX = ataho.x + ataho.width / 2;
        const characterCenterY = ataho.y + ataho.height / 2;
        
        const dx = touchX - characterCenterX;
        const dy = touchY - characterCenterY;
        
        // 키보드 상태를 초기화
        Object.keys(inputState).forEach(key => inputState[key] = false);

        if (Math.abs(dx) > Math.abs(dy)) {
            inputState.right = dx > 0;
            inputState.left = dx < 0;
        } else {
            inputState.up = dy < 0;
            inputState.down = dy > 0;
        }
    });

    canvas.addEventListener('touchend', (e) => {
        // 손을 떼면 모든 방향 상태를 초기화하여 움직임을 멈춥니다.
        Object.keys(inputState).forEach(key => inputState[key] = false);
    });
    
    // 캐릭터 위치와 상태를 초기화하는 함수
    function resetCharacter() {
        ataho.x = 10;
        ataho.y = 250;
        isDrowned = false;
        drownStartTime = null;
        // ✨ 입력 상태를 모두 초기화합니다.
        Object.keys(inputState).forEach(key => inputState[key] = false);
    }

    // 모든 이미지 로드가 완료되면 게임을 시작합니다.
    loadImages().then(() => {
        byFrame();
    });

})();