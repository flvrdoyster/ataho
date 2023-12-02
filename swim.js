var x = getComputedStyle(character).left + 10

function toggleImg1() {
    document.getElementById("gif").src = "ataho_swim.gif";
}
function toggleImg2() {
    document.getElementById("gif").src = "ataho_idle.gif";
}
function moveForward() {
    document.getElementById("character").style.left = x;
}