var canvas = document.getElementById('canvas');
var ctx = canvas.gerContext('2d');

canvas.width = window.innerWidth - 100;
canvas.height = window.innerHeight - 100;

ctx.fillStyle = 'green';
ctx.fillRect(10, 10, 100, 100);