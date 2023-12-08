// 캔버스 정의

var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

canvas.width = 960;
canvas.height = 640;


// 이미지 불러오기

var idle_r1 = new Image();
idle_r1.src = 'idle_r1.png';

var idle_r2 = new Image();
idle_r2.src = 'idle_r2.png';

var swim_r1 = new Image();
swim_r1.src = 'swim_r1.png';

var swim_r2 = new Image();
swim_r2.src = 'swim_r2.png';

var swim_r3 = new Image();
swim_r3.src = 'swim_r3.png';

var swim_r4 = new Image();
swim_r4.src = 'swim_r4.png';

var swim_l1 = new Image();
swim_l1.src = 'swim_l1.png';

var swim_l2 = new Image();
swim_l2.src = 'swim_l2.png';

var swim_l3 = new Image();
swim_l3.src = 'swim_l3.png';

var swim_l4 = new Image();
swim_l4.src = 'swim_l4.png';

var drown1 = new Image();
drown1.src = 'drown_1.png';

var drown2 = new Image();
drown2.src = 'drown_2.png';

var drown3 = new Image();
drown3.src = 'drown_3.png';

var drown4 = new Image();
drown4.src = 'drown_4.png';

var whirlpool1 = new Image();
whirlpool1.src = 'whirlpool_2x.png';

// 아타호 오브젝트

var ataho = {
    x: 10,
    y: 250,  
    width: 120,
    height: 80,
    draw(){

        if (drown == false){
            if (goLeft == true){
                if (timer_swim%8 < 2){
                    ctx.drawImage(swim_l1, this.x, this.y);
                }
                else {
                    if (timer_swim%8 < 4){
                        ctx.drawImage(swim_l2, this.x, this.y);
                    }
                    else {
                        if (timer_swim%8 < 6){
                            ctx.drawImage(swim_l3, this.x, this.y);
                        }
                        else {
                            ctx.drawImage(swim_l4, this.x, this.y);
                        }
                    }
                }   
            }
            else {
                if (goRight == true){
                    if (timer_swim%8 < 2){
                        ctx.drawImage(swim_r1, this.x, this.y);
                    }
                    else {
                        if (timer_swim%8 < 4){
                            ctx.drawImage(swim_r2, this.x, this.y);
                        }
                        else {
                            if (timer_swim%8 < 6){
                                ctx.drawImage(swim_r3, this.x, this.y);
                            }
                            else {
                                ctx.drawImage(swim_r4, this.x, this.y);
                            }
                        }
                    }   
                }
                else {
                    if (timer_idle%24 < 12){
                        ctx.drawImage(idle_r1, this.x, this.y);
                    }
                    else {
                        ctx.drawImage(idle_r2, this.x, this.y);
                    }
                }
            }    
        }
        else {
            if (timer_idle%24 < 6){
                ctx.drawImage(drown1, this.x, this.y);
            }
            else {
                if (timer_idle%24 < 12){
                    ctx.drawImage(drown2, this.x, this.y);
                }
                else {
                    if (timer_idle%24 < 18){
                        ctx.drawImage(drown3, this.x, this.y);
                    }
                    else {
                        ctx.drawImage(drown4, this.x, this.y);
                    }
                }

            }   
        }
    }
}


// 소용돌이 오브젝트

var whirlpool = {
    x: 800,
    y: 250,  
    width: 120,
    height: 200,
    draw(){
        ctx.drawImage(whirlpool1, this.x, this.y);
    }
}


// 타이머

var timer_idle = 0;

var timer_swim = 0;


// 움직임 상태 값

var drown = false;

var goRight = false;

var goLeft = false;

var goUp = false;

var goDown = false;

var animation1;

var animation2;


// 프레임 그려주기

function byFrame(){
    animation1 = requestAnimationFrame(byFrame);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (goRight == true){
        ataho.x += 2;
        timer_swim+= 1
    }
    else {
        if (goLeft == true){
            ataho.x -= 2;
            timer_swim+= 1
        }
        else {
            timer_idle+= 1
        }
    }

    if (goUp == true){
        ataho.y -= 2;
    }

    if (goDown == true){
        ataho.y += 2;
    }

    if (drown == true){
        goRight = false;
        goLeft = false;
        goUp = false;
        goDown = false;
    }

    whirlpool.draw();

    ataho.draw();

    collision(ataho, whirlpool);
 }

byFrame();


// 충돌 체크

function collision(ataho, whirlpool){
    var xCheck = whirlpool.x - (ataho.x+ataho.width);
    var yCheck1 = whirlpool.y - (ataho.y+ataho.height);
    if (xCheck < 0 && yCheck1 < 0){
        if (whirlpool.y < ataho.y-ataho.height){
            drown = false;
        }
        else {
            drown = true;
        }
    }
}


// 키보드 이벤트

document.addEventListener('keydown', function(a){
    if (drown == false) {
        if (a.code === 'KeyD'){
            goRight = true;
        }
    }
})

document.addEventListener('keyup', function(b){
    if (b.code === 'KeyD'){
        goRight = false;
    }
})

document.addEventListener('keydown', function(c){
    if (drown == false) {
        if (c.code === 'KeyA'){
                goLeft = true;
        }
    }
})

document.addEventListener('keyup', function(d){
    if (d.code === 'KeyA'){
        goLeft = false;
    }
})

document.addEventListener('keydown', function(e){
    if (drown == false) {
        if (e.code === 'KeyW'){
            goUp = true;
        }
    }
})

document.addEventListener('keyup', function(f){
    if (f.code === 'KeyW'){
        goUp = false;
    }
})

document.addEventListener('keydown', function(g){
    if (drown == false) {
        if (g.code === 'KeyS'){
            goDown = true;
        }
    }
})

document.addEventListener('keyup', function(h){
    if (h.code === 'KeyS'){
        goDown = false;
    }
})

document.addEventListener('keydown', function(i){
    if (i.code === 'Enter'){
        ataho.x = 10;
        ataho.y = 250;
    }
})


// 버튼 이벤트

function buttonLeft() {
    goLeft = true;
    goRight = false;
}

function buttonRight() {
    goRight = true;
    goLeft = false;
}

function buttonUp() {
    goUp = true;
    goDown = false;
}

function buttonDown() {
    goUp = false;
    goDown = true;
}

function buttonStop() {
    goRight = false;
    goLeft = false;
    goUp = false;
    goDown = false;
}

function buttonReset() {
    goRight = false;
    goLeft = false;
    goUp = false;
    goDown = false;
    drown = false;
    ataho.x = 10;
    ataho.y = 250;
}