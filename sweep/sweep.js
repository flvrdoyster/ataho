(function () {
    // 가상 타일셋 이미지(격자 패턴) 생성 함수
    function createDummyTileset() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 128;
        tempCanvas.height = 128;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.fillStyle = '#1c1917'; 
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        
        tempCtx.strokeStyle = '#2c2523'; 
        tempCtx.lineWidth = 1;
        
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                tempCtx.strokeRect(x * 16, y * 16, 16, 16);
                
                if (x === 3 && y === 0) {
                    tempCtx.fillStyle = '#342a27';
                    tempCtx.fillRect(x * 16 + 4, y * 16 + 4, 2, 2);
                    tempCtx.fillRect(x * 16 + 10, y * 16 + 10, 2, 2);
                }
                
                if (x === 1 && y === 0) {
                    tempCtx.fillStyle = '#2e2522';
                    tempCtx.fillRect(x * 16, y * 16, 16, 16);
                    tempCtx.strokeStyle = '#453530';
                    tempCtx.strokeRect(x * 16 + 1, y * 16 + 1, 14, 14);
                    tempCtx.beginPath();
                    tempCtx.moveTo(x * 16 + 2, y * 16 + 2);
                    tempCtx.lineTo(x * 16 + 14, y * 16 + 14);
                    tempCtx.stroke();
                }
            }
        }
        
        return tempCanvas.toDataURL();
    }

    // 1. 맵 데이터 전처리 및 임시 격자 맵 주입
    if (window.MAP_DATA) {
        window.MAP_DATA.assets = window.MAP_DATA.assets || {};
        
        if (!window.MAP_DATA.tiles || window.MAP_DATA.tiles.length === 0) {
            window.MAP_DATA.assets.tileset = createDummyTileset();
            window.MAP_DATA.assets.ceilingTileset = '';
            
            const mapWidthTiles = 40;
            const mapHeightTiles = 25;
            window.MAP_DATA.tiles = [];
            window.MAP_DATA.collisions = [];
            
            for (let gy = 0; gy < mapHeightTiles; gy++) {
                for (let gx = 0; gx < mapWidthTiles; gx++) {
                    let tx = 3, ty = 0;
                    
                    if (gx === 0 || gx === mapWidthTiles - 1 || gy === 0 || gy === mapHeightTiles - 1) {
                        tx = 1; ty = 0;
                        window.MAP_DATA.collisions.push({ x: gx, y: gy });
                    }
                    
                    window.MAP_DATA.tiles.push({ gx, gy, tx, ty });
                }
            }
        }
        
        if (window.MAP_DATA.startPos && window.MAP_DATA.startPos.x === 0 && window.MAP_DATA.startPos.y === 0) {
            window.MAP_DATA.startPos = { x: 20, y: 12 };
        }
    }

    // 2. 기존 엔진 로딩 완료 후, resizeCanvas 함수를 오버라이드하여 balance와 동일하게 물리 960x640 해상도 구현
    if (typeof window.resizeCanvas === 'function') {
        window.resizeCanvas = function () {
            if (!canvas) return;
            
            // [중요] 이미 크기가 960x640인 경우 다시 대입하지 않음 (컨텍스트 리셋 방지 및 새로고침 시 캔버스 떨림/깜빡임 제거)
            if (canvas.width === 960 && canvas.height === 640) return;
            
            canvas.width = 960;
            canvas.height = 640;
            
            // 2배 줌 기준으로 가상 해상도 설정
            camera.width = 480;
            camera.height = 320;
            
            if (ctx) ctx.imageSmoothingEnabled = false;
        };
    }

    // 3. 기존 엔진의 draw 루프를 scale(2, 2) 래핑하여 픽셀 깨짐 없이 아주 선명한 아웃풋 제공
    if (typeof window.draw === 'function') {
        const originalDraw = window.draw;
        window.draw = function () {
            if (!ctx) return;
            
            // [중요] 카메라 소수점 좌표 미세 지동을 정수형으로 반올림하여 2배 스케일 시 물리 픽셀 지터(떨림) 방지
            camera.x = Math.round(camera.x);
            camera.y = Math.round(camera.y);
            
            ctx.save();
            ctx.scale(2, 2); // 렌더링 요소를 2배 확대 (DPI 스케일링 효과)
            originalDraw();
            ctx.restore();
        };
    }

    // 4. 키보드 입력 최적화 (e.code 기반 가로채기 및 IME/한글 입력기 지연 방지)
    const keyMap = {
        'ArrowUp': 'ArrowUp',
        'ArrowDown': 'ArrowDown',
        'ArrowLeft': 'ArrowLeft',
        'ArrowRight': 'ArrowRight',
        'KeyW': 'w',
        'KeyS': 's',
        'KeyA': 'a',
        'KeyD': 'd'
    };

    window.addEventListener('keydown', function (e) {
        const targetKey = keyMap[e.code];
        if (targetKey && window.keys) {
            window.keys[targetKey] = true;
            e.preventDefault();
        }
    }, { capture: true });

    window.addEventListener('keyup', function (e) {
        const targetKey = keyMap[e.code];
        if (targetKey && window.keys) {
            window.keys[targetKey] = false;
            e.preventDefault();
        }
    }, { capture: true });

    // 5. 기존 엔진 구동 시작
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initGame();
    } else {
        window.addEventListener('DOMContentLoaded', initGame);
    }
})();
