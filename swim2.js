var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

canvas.width = 960;
canvas.height = 640;

var img1 = new Image();
img1.src = 'idle1.png';

var img2 = new Image();
img2.src = 'idle2.png';

var img3 = new Image();
img3.src = 'swim1.png';

var img4 = new Image();
img4.src = 'swim2.png';

var img5 = new Image();
img5.src = 'swim3.png';

var img6 = new Image();
img6.src = 'swim4.png';

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
                ctx.drawImage(img3, this.x, this.y);
            }
            else {
                if (timer_swim%8 < 4){
                    ctx.drawImage(img4, this.x, this.y);
                }
                else {
                    if (timer_swim%8 < 6){
                        ctx.drawImage(img5, this.x, this.y);
                    }
                    else {
                        ctx.drawImage(img6, this.x, this.y);
                    }
                }

            }   
        }
        else {
            if (timer_idle%20 < 10){
                ctx.drawImage(img1, this.x, this.y);
            }
            else {
                ctx.drawImage(img2, this.x, this.y);
            }
        }
    }
}

var goLeft = false;

document.addEventListener('keydown', function(a){
    if (a.code === 'Space'){
        goLeft = true;
    }
})

document.addEventListener('keyup', function(b){
    if (b.code === 'Space'){
        goLeft = false;
    }
})

document.addEventListener('keydown', function(c){
    if (c.code === 'Enter'){
        ataho.x = 10;
    }
})

function byFrame(){
    requestAnimationFrame(byFrame);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (goLeft == false){
        timer_idle+= 1
    }    

    if (goLeft == true){
        ataho.x += 2;
        timer_swim+= 1
    }
    ataho.draw();
 }

byFrame();

function swimLeft() {
    goLeft = true;
}

function stop() {
    goLeft = false;
}