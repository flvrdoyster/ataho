/**
 * loader_example.js
 * 
 * This is an example of how to load the exported JSON data and
 * "stamp" the tiles onto an HTML5 Canvas.
 * 
 * Usage:
 * 1. Export JSON from editor.html
 * 2. Save it as 'map_data.json' in 'data/' folder
 * 3. Open index.html (implied) in browser
 */

// Configuration
const TILE_SIZE = 16;
const TILESET_PATH = 'assets/cave_tile.png';
const MAP_DATA_PATH = 'data/map_data.json';

async function initGame() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // 1. Load Tileset Image
    const tilesetImg = new Image();
    tilesetImg.src = TILESET_PATH;
    await new Promise(resolve => tilesetImg.onload = resolve);

    // 2. Load Map Data (JSON or Global)
    let mapData;
    if (window.MAP_DATA) {
        mapData = window.MAP_DATA;
    } else {
        const response = await fetch(MAP_DATA_PATH);
        mapData = await response.json();
    }

    // 3. Render Map
    // Find map bounds
    let maxX = 0, maxY = 0;
    mapData.forEach(t => {
        if (t.gx > maxX) maxX = t.gx;
        if (t.gy > maxY) maxY = t.gy;
    });

    canvas.width = (maxX + 1) * TILE_SIZE;
    canvas.height = (maxY + 1) * TILE_SIZE;

    // "Stamp" tiles
    mapData.forEach(tile => {
        // tile.gx/gy = Grid position in the map
        // tile.tx/ty = Grid position in the tileset source

        ctx.drawImage(
            tilesetImg,
            tile.tx * TILE_SIZE, tile.ty * TILE_SIZE, // Source X, Y
            TILE_SIZE, TILE_SIZE,                     // Source W, H
            tile.gx * TILE_SIZE, tile.gy * TILE_SIZE, // Dest X, Y
            TILE_SIZE, TILE_SIZE                      // Dest W, H
        );
    });

    console.log("Map rendered successfully!");
}

// Start
window.onload = initGame;
