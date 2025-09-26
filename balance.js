// 캔버스 설정
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

// 게임 속도를 조절하는 변수
const gameSpeed = 2;

// 이미지 로드
const spriteSheet = new Image();
spriteSheet.src = 'cara_at3.cns.bmp';

// 평균대 배경 이미지 (파일을 준비해주세요)
const background = new Image();
background.src = 'balance_beam.png';

// 스프라이트 시트 내의 각 프레임 좌표 정의
const frames = {
    // 걷는 동작 (앞으로 걷는 모습)
    walk: {
        x: [0, 60, 120, 180, 240], // 5개의 프레임 x 좌표
        y: 0,
        width: 60,
        height: 80
    },
    // 좌우로 몸을 기울이는 동작
    lean_right: {
        x: 300,
        y: 0,
        width: 60,
        height: 80
    },
    lean_left: {
        x: 360,
        y: 0,
        width: 60,
        height: 80
    },
    // IDLE 동작 (기본 상태)
    idle: {
        x: 0,
        y: 0,
        width: 60,
        height: 80
    }
};

// 캐릭터 객체 (위치 고정)
const cara = {
    x: canvas.width / 2 - frames.walk.width / 2, // 캔버스 중앙에 고정
    y: canvas.height / 2 - frames.walk.height / 2,
    width: frames.walk.width,
    height: frames.walk.height,
};

// 게임 상태 및 입력 변수
const inputState = {};
let backgroundY = 0;
let frameIndex = 0;
let animationTimer = 0;

// 이미지 로드가 모두 완료되면 게임 시작
Promise.all([
    new Promise(resolve => spriteSheet.onload = resolve),
    new Promise(resolve => background.onload = resolve)
]).then(() => {
    gameLoop();
});

// 게임 루프
function gameLoop() {
    requestAnimationFrame(gameLoop);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ✨ 입력 상태에 따라 배경 위치와 애니메이션 업데이트
    const isWalkingForward = inputState.down; // 'S' 또는 'ArrowDown'
    const isWalkingBackward = inputState.up; // 'W' 또는 'ArrowUp'
    
    // 배경 이동 로직
    if (isWalkingForward) {
        backgroundY -= gameSpeed;
    } else if (isWalkingBackward) {
        backgroundY += gameSpeed;
    }

    // 배경이 화면 밖으로 나가면 다시 맨 아래로 이동
    if (backgroundY <= -canvas.height) {
        backgroundY = 0;
    }
    // 배경이 맨 위로 올라오면 다시 맨 아래로 이동 (뒤로 갈 때)
    if (backgroundY >= canvas.height) {
        backgroundY = 0;
    }

    // ✨ 애니메이션 로직
    if (isWalkingForward || isWalkingBackward) {
        animationTimer++;
        if (animationTimer % 6 === 0) {
            frameIndex = (frameIndex + 1) % frames.walk.x.length;
        }
    } else {
        frameIndex = 0; // 걷지 않을 때는 첫 번째 프레임으로
    }

    // 배경 그리기 (캐릭터가 걷는 것처럼 보이게)
    ctx.drawImage(background, 0, backgroundY, canvas.width, canvas.height);
    ctx.drawImage(background, 0, backgroundY + canvas.height, canvas.width, canvas.height);
    
    // 캐릭터 스프라이트 선택 및 그리기
    let currentFrameX = frames.walk.x[frameIndex];
    let currentFrameY = frames.walk.y;

    if (inputState.left) {
        currentFrameX = frames.lean_left.x;
        currentFrameY = frames.lean_left.y;
    } else if (inputState.right) {
        currentFrameX = frames.lean_right.x;
        currentFrameY = frames.lean_right.y;
    } else if (!isWalkingForward && !isWalkingBackward) {
        currentFrameX = frames.idle.x;
        currentFrameY = frames.idle.y;
    }
    
    ctx.drawImage(
        spriteSheet, 
        currentFrameX, 
        currentFrameY, 
        frames.walk.width, 
        frames.walk.height, 
        cara.x, 
        cara.y, 
        cara.width, 
        cara.height
    );
}

// ✨ 키보드 이벤트 리스너: 위/아래 화살표 키와 WASD를 모두 처리
document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
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