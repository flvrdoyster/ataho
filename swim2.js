var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

canvas.width = 960;
canvas.height = 640;

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

var timer_idle = 0;
var timer_swim = 0;

var ataho = {
    x: 10,
    y: 200,  
    width: 120,
    height: 160,
    draw(){
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
                if (timer_idle%20 < 10){
                    ctx.drawImage(idle_r1, this.x, this.y);
                }
                else {
                    ctx.drawImage(idle_r2, this.x, this.y);
                }
            }
        }
    }
}

var goRight = false;

var goLeft = false;

document.addEventListener('keydown', function(a){
    if (a.code === 'KeyD'){
        goRight = true;
    }
})

document.addEventListener('keyup', function(b){
    if (b.code === 'KeyD'){
        goRight = false;
    }
})

document.addEventListener('keydown', function(c){
    if (c.code === 'KeyA'){
        goLeft = true;
    }
})

document.addEventListener('keyup', function(d){
    if (d.code === 'KeyA'){
        goLeft = false;
    }
})

document.addEventListener('keydown', function(e){
    if (e.code === 'Enter'){
        ataho.x = 10;
    }
})

function byFrame(){
    requestAnimationFrame(byFrame);

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

    ataho.draw();
 }

byFrame();

function left() {
    goLeft = true;
}

function right() {
    goRight = true;
}

function stop() {
    goRight = false;
    goLeft = false;
}