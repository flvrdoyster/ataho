const mapData = require('../map/data/map_data.js'); // Wait, this is window.MAP_DATA in file.

// We need to parse the file since it's not a valid CommonJS module.
const fs = require('fs');
const content = fs.readFileSync('../map/data/map_data.js', 'utf8');
const jsonContent = content.replace('window.MAP_DATA = ', '');
const tiles = JSON.parse(jsonContent);

let maxX = 0;
let maxY = 0;
tiles.forEach(t => {
    if (t.gx > maxX) maxX = t.gx;
    if (t.gy > maxY) maxY = t.gy;
});

const grid = Array(maxY + 1).fill().map(() => Array(maxX + 1).fill('   '));

tiles.forEach(t => {
    // We can just print tx,ty
    // grid[t.gy][t.gx] = `${t.tx},${t.ty}`;
    grid[t.gy][t.gx] = `[${t.tx},${t.ty}]`;
});

// Print in chunks
console.log(`Map Size: ${maxX + 1} x ${maxY + 1}`);
for (let y = 0; y <= maxY; y++) {
    // console.log(grid[y].join(''));
    // Simplify: look for unique tiles.
    // Assume floor is 1,0 or 22,0.
    let row = '';
    for (let x = 0; x <= maxX; x++) {
        const t = tiles.find(tile => tile.gx === x && tile.gy === y);
        if (!t) { row += ' ... '; continue; }
        if (t.tx === 1 && t.ty === 0) row += ' . ';
        else if (t.tx === 22 && t.ty === 0) row += ' # ';
        else row += `[${t.tx},${t.ty}]`; // Mark interesting tiles
    }
    console.log(`${y}: ${row}`);
}
