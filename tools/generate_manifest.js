const fs = require('fs');
const path = require('path');

const RESOURCE_DIR = path.join(__dirname, '../resource');
const OUTPUT_FILE = path.join(RESOURCE_DIR, 'manifest.js');

// Valid image extensions
const VALID_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.mp3', '.wav', '.ogg', '.mid'];

function scanDirectory(dir, fileList = [], relativePath = '') {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        const relativeFilePath = path.join(relativePath, file);

        if (stat.isDirectory()) {
            scanDirectory(fullPath, fileList, relativeFilePath);
        } else {
            const ext = path.extname(file).toLowerCase();
            if (VALID_EXTENSIONS.includes(ext)) {
                // Ensure forward slashes for web compatibility
                fileList.push(relativeFilePath.split(path.sep).join('/'));
            }
        }
    });

    return fileList;
}

try {
    if (!fs.existsSync(RESOURCE_DIR)) {
        console.error(`Error: Resource directory not found at ${RESOURCE_DIR}`);
        process.exit(1);
    }

    console.log(`Scanning ${RESOURCE_DIR}...`);
    const images = scanDirectory(RESOURCE_DIR);

    const jsContent = `const RESOURCE_MANIFEST = ${JSON.stringify(images, null, 2)};`;

    fs.writeFileSync(OUTPUT_FILE, jsContent);
    console.log(`Successfully generated manifest.js with ${images.length} images at ${OUTPUT_FILE}`);

} catch (error) {
    console.error('Error generating manifest:', error);
    process.exit(1);
}
