function toggleImg1() {
    document.getElementById("gif").src = "ataho_swim.gif";
}
function toggleImg2() {
    document.getElementById("gif").src = "ataho_idle.gif";
}
function moveForward() {
    var x = getComputedStyle(character).left
    document.getElementById("character").style.left = x + 10;
}