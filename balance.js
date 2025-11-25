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

const gameSpeed = 2;
let backgroundY = 0;
let isGameOver = false;

// 이미지 로드
const spriteSheet = new Image();
spriteSheet.src = 'balance.png';
const background = new Image();
background.src = 'balance_beam.png';

//===========================================
// 스프라이트 및 게임 데이터
//===========================================
const frames = {
    walk: { x: [0, 80, 160], y: 0, width: 80, height: 96 },
    jump: { x: [240, 480, 480, 320], y: [0, 192, 288, 0], width: 80, height: 96 },
    fall: { left: { x: 400, y: 0, width: 80, height: 96 }, right: { x: 480, y: 0, width: 80, height: 96 } },
    fallen: { x: 480, y: 96, width: 80, height: 96 },
    lean_slight_left: { x: [0, 80, 160], y: 96, width: 80, height: 96 },
    lean_slight_right: { x: [240, 320, 400], y: 96, width: 80, height: 96 },
    lean_medium_left: { x: [0, 80, 160], y: 192, width: 80, height: 96 },
    lean_medium_right: { x: [240, 320, 400], y: 192, width: 80, height: 96 },
    lean_large_left: { x: [0, 80, 160], y: 288, width: 80, height: 96 },
    lean_large_right: { x: [240, 320, 400], y: 288, width: 80, height: 96 },
    idle: { x: 0, y: 0, width: 80, height: 96 } // idle은 고정 스프라이트 (walk 마지막 프레임 사용)
};

// 🌟 [최적화 1 적용]: SCALE_FACTOR 사용
const cara = {
    x: canvas.width / 2 - (frames.walk.width * SCALE_FACTOR) / 2,
    y: canvas.height / 2 - (frames.walk.height * SCALE_FACTOR) / 2,
    width: frames.walk.width * SCALE_FACTOR,
    height: frames.walk.height * SCALE_FACTOR,
};

const walkAnimationSequence = [0, 1, 2, 1]; 
const leanAnimationSequence = [0, 1, 2];

// 게임 상태 변수
const inputState = {};
let characterState = 'idle';
let balanceLevel = 0;
const BALANCE_CHANGE_RATE = 1;
const BALANCE_RECOVERY_RATE = 0.5;
let fallDirection = null;
let fallTimer = 0;
const FALL_ANIMATION_DURATION = 30;
let animationTimer = 0;

const fallenOffsetX = 40;
const fallenOffsetY = 20;

// 걷기 상태 종료 시 마지막 프레임의 좌표를 저장할 변수
let lastWalkSourceX = frames.idle.x; 
let lastWalkSourceY = frames.idle.y;

// 🌟 [최적화 3]: 상태별 프레임 매핑 테이블 (그리기 로직 간소화용)
const stateToFrameMap = {
    'walking': frames.walk,
    'walking_backward': frames.walk,
    'leaning_slight_left': frames.lean_slight_left,
    'leaning_medium_left': frames.lean_medium_left,
    'leaning_large_left': frames.lean_large_left,
    'leaning_slight_right': frames.lean_slight_right,
    'leaning_medium_right': frames.lean_medium_right,
    'leaning_large_right': frames.lean_large_right,
};

//===========================================
// 메인 게임 루프
//===========================================
Promise.all([
    new Promise((resolve, reject) => {
        spriteSheet.onload = () => { console.log('Sprite Sheet loaded.'); resolve(); };
        spriteSheet.onerror = () => { console.error('Error loading sprite sheet.'); reject(); };
    }),
    new Promise((resolve, reject) => {
        background.onload = () => { console.log('Background loaded.'); resolve(); };
        background.onerror = () => { console.error('Error loading background.'); reject(); };
    })
]).then(() => {
    console.log('모든 이미지 로드 완료. 게임 시작!');
    gameLoop();
}).catch(error => {
    console.error('이미지 로드 중 오류 발생:', error);
});

function gameLoop() {
    requestAnimationFrame(gameLoop);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isGameOver) {
        // 1. 균형 레벨 업데이트
        if (inputState.left) {
            balanceLevel -= BALANCE_CHANGE_RATE;
        } else if (inputState.right) {
            balanceLevel += BALANCE_CHANGE_RATE;
        } else {
            // 균형 회복 로직
            if (balanceLevel > 0) {
                balanceLevel -= BALANCE_RECOVERY_RATE;
            } else if (balanceLevel < 0) {
                balanceLevel += BALANCE_RECOVERY_RATE;
            }
            if (Math.abs(balanceLevel) < BALANCE_RECOVERY_RATE) {
                balanceLevel = 0;
            }
        }
        
        // 2. 균형 초과 및 낙하 상태 체크 (BALANCE_THRESHOLD.MAX 사용)
        if (balanceLevel >= BALANCE_THRESHOLD.MAX) {
            characterState = 'falling';
            fallDirection = 'right';
        } else if (balanceLevel <= -BALANCE_THRESHOLD.MAX) {
            characterState = 'falling';
            fallDirection = 'left';
        }

        // 🌟 [최적화 2]: Character State 결정 로직 간소화
        if (characterState !== 'falling' && characterState !== 'fallen') {
            if (inputState.down || inputState.up) {
                // 걷기 상태
                characterState = inputState.down ? 'walking' : 'walking_backward';
            } else if (inputState.left || inputState.right) {
                // 기울이기 상태 (BALANCE_THRESHOLD 사용)
                const direction = inputState.left ? 'left' : 'right';
                const absBalance = Math.abs(balanceLevel);
                let leanLevel = 'slight';

                if (absBalance >= BALANCE_THRESHOLD.MEDIUM) {
                    leanLevel = 'large';
                } else if (absBalance >= BALANCE_THRESHOLD.SLIGHT) {
                    leanLevel = 'medium';
                }
                
                characterState = `leaning_${leanLevel}_${direction}`;
            } else {
                // 대기 상태
                characterState = 'idle';
            }
        }
    
        // 3. 배경 스크롤 로직
        if (characterState === 'walking') {
            backgroundY -= gameSpeed;
        } else if (characterState === 'walking_backward') {
            backgroundY += gameSpeed;
        }
    
        if (backgroundY <= -canvas.height) {
            backgroundY = 0;
        }
        if (backgroundY >= canvas.height) {
            backgroundY = 0;
        }
    }
    
    // 4. 낙하 애니메이션 타이머
    if (characterState === 'falling') {
        fallTimer++;
        if (fallTimer >= FALL_ANIMATION_DURATION) {
            characterState = 'fallen';
            isGameOver = true;
        }
    }

    // 애니메이션 연속성을 위해 타이머 상시 증가
    animationTimer++;
    
    // 배경 그리기
    ctx.drawImage(background, 0, backgroundY, canvas.width, canvas.height);
    ctx.drawImage(background, 0, backgroundY + canvas.height, canvas.width, canvas.height);
    
    let currentFrame = frames.idle; 
    let finalX = cara.x;
    let finalY = cara.y;
    let frameIndex = 0;

    // 🌟 [최적화 3 적용]: Map/Object을 이용한 currentFrame 선택
    if (stateToFrameMap[characterState]) {
        currentFrame = stateToFrameMap[characterState];
    } else if (characterState === 'falling') {
        currentFrame = fallDirection === 'left' ? frames.fall.left : frames.fall.right;
    } else if (characterState === 'fallen') {
        currentFrame = frames.fallen;
        
        if (fallDirection === 'left') {
            finalX = cara.x - fallenOffsetX;
        } else {
            finalX = cara.x + fallenOffsetX;
        }
        finalY = cara.y + fallenOffsetY;
    }

    // 애니메이션 프레임 인덱스 계산 (다중 프레임인 경우에만)
    if (currentFrame.x && Array.isArray(currentFrame.x) && currentFrame.x.length > 1) {
        
        const sequence = characterState.includes('walking') 
            ? walkAnimationSequence 
            : leanAnimationSequence;
                
        // 🌟 [최적화 4 적용]: ANIMATION_FPS_DIVISOR 사용
        const sequenceIndex = Math.floor(animationTimer / ANIMATION_FPS_DIVISOR) % sequence.length;
        
        frameIndex = sequence[sequenceIndex];
    }
    
    // 현재 프레임의 원본 좌표 계산
    let currentSourceX = Array.isArray(currentFrame.x) ? currentFrame.x[frameIndex] : currentFrame.x;
    let currentSourceY = Array.isArray(currentFrame.y) ? currentFrame.y[frameIndex] : currentFrame.y;

    // 걷기 상태일 때 마지막 스프라이트 좌표 저장
    if (characterState.includes('walking')) {
        lastWalkSourceX = currentSourceX;
        lastWalkSourceY = currentSourceY;
    }

    // idle 상태일 경우 저장된 마지막 걷기 스프라이트를 사용
    const sourceX = (characterState === 'idle') ? lastWalkSourceX : currentSourceX;
    const sourceY = (characterState === 'idle') ? lastWalkSourceY : currentSourceY;

    // 이미지 그리기
    ctx.drawImage(
        spriteSheet, 
        sourceX,
        sourceY, 
        currentFrame.width,
        currentFrame.height,
        finalX,
        finalY,
        cara.width,
        cara.height
    );

    if (isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = '48px Arial';
        ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2);
    }
}

// 이벤트 리스너는 그대로 유지하여 입력 처리
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