//===========================================
// 게임 설정 및 초기화
//===========================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

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
    idle: { x: 0, y: 0, width: 80, height: 96 }
};

// [변경] cara 객체의 너비/높이를 2배로 설정하고, 위치를 새 크기에 맞춰 중앙 정렬합니다.
const cara = {
    // 캔버스 중앙에서 (캐릭터 폭 * 2)의 절반만큼 빼서 중앙 정렬
    x: canvas.width / 2 - (frames.walk.width * 2) / 2,
    y: canvas.height / 2 - (frames.walk.height * 2) / 2,
    width: frames.walk.width * 2,  // 🌟 2배 크기 적용
    height: frames.walk.height * 2, // 🌟 2배 크기 적용
};

const walkAnimationSequence = [0, 1, 0, 2];
const leanAnimationSequence = [0, 1, 2];

// 게임 상태 변수
const inputState = {};
let characterState = 'idle';
let balanceLevel = 0;
const BALANCE_CHANGE_RATE = 1;
const BALANCE_RECOVERY_RATE = 0.5;
const MAX_BALANCE_LEVEL = 100;
let fallDirection = null;
let fallTimer = 0;
const FALL_ANIMATION_DURATION = 30;
let animationTimer = 0;

const fallenOffsetX = 40;
const fallenOffsetY = 20;

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

    let previousState = characterState;

    if (!isGameOver) {
        if (inputState.left) {
            balanceLevel -= BALANCE_CHANGE_RATE;
        } else if (inputState.right) {
            balanceLevel += BALANCE_CHANGE_RATE;
        } else {
            if (balanceLevel > 0) {
                balanceLevel -= BALANCE_RECOVERY_RATE;
            } else if (balanceLevel < 0) {
                balanceLevel += BALANCE_RECOVERY_RATE;
            }
            if (Math.abs(balanceLevel) < BALANCE_RECOVERY_RATE) {
                balanceLevel = 0;
            }
        }
        
        if (balanceLevel >= MAX_BALANCE_LEVEL) {
            characterState = 'falling';
            fallDirection = 'right';
        } else if (balanceLevel <= -MAX_BALANCE_LEVEL) {
            characterState = 'falling';
            fallDirection = 'left';
        }

        if (characterState !== 'falling' && characterState !== 'fallen') {
            if (inputState.left) {
                if (balanceLevel <= -60) {
                    characterState = 'leaning_large_left';
                } else if (balanceLevel <= -30) {
                    characterState = 'leaning_medium_left';
                } else {
                    characterState = 'leaning_slight_left';
                }
            } else if (inputState.right) {
                if (balanceLevel >= 60) {
                    characterState = 'leaning_large_right';
                } else if (balanceLevel >= 30) {
                    characterState = 'leaning_medium_right';
                } else {
                    characterState = 'leaning_slight_right';
                }
            } else if (inputState.down) {
                characterState = 'walking';
            } else if (inputState.up) {
                characterState = 'walking_backward';
            } else {
                characterState = 'idle';
            }
        }
    
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
    
    if (characterState === 'falling') {
        fallTimer++;
        if (fallTimer >= FALL_ANIMATION_DURATION) {
            characterState = 'fallen';
            isGameOver = true;
        }
    }

    if (characterState !== previousState) {
        animationTimer = 0;
    } else {
        animationTimer++;
    }
    
    ctx.drawImage(background, 0, backgroundY, canvas.width, canvas.height);
    ctx.drawImage(background, 0, backgroundY + canvas.height, canvas.width, canvas.height);
    
    let currentFrame = frames.idle;
    let finalX = cara.x;
    let finalY = cara.y;

    if (characterState === 'walking') {
        currentFrame = frames.walk;
    } else if (characterState === 'walking_backward') {
        currentFrame = frames.walk;
    } else if (characterState === 'leaning_slight_left') {
        currentFrame = frames.lean_slight_left;
    } else if (characterState === 'leaning_medium_left') {
        currentFrame = frames.lean_medium_left;
    } else if (characterState === 'leaning_large_left') {
        currentFrame = frames.lean_large_left;
    } else if (characterState === 'leaning_slight_right') {
        currentFrame = frames.lean_slight_right;
    } else if (characterState === 'leaning_medium_right') {
        currentFrame = frames.lean_medium_right;
    } else if (characterState === 'leaning_large_right') {
        currentFrame = frames.lean_large_right;
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

    let frameIndex = 0;
    if (currentFrame.x && currentFrame.x.length > 1) {
        const sequence = characterState.includes('walking') ? walkAnimationSequence : leanAnimationSequence;
        const sequenceIndex = Math.floor(animationTimer / 6) % sequence.length;
        frameIndex = sequence[sequenceIndex];
    }
    
    const sourceX = Array.isArray(currentFrame.x) ? currentFrame.x[frameIndex] : currentFrame.x;
    const sourceY = Array.isArray(currentFrame.y) ? currentFrame.y[frameIndex] : currentFrame.y;

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