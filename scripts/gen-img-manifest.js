#!/usr/bin/env node
/**
 * resource/img/manifest.js는 이미지 갤러리의 유일한 데이터 파일이다.
 * (파일명 -> { caption, source, modified }) 객체를 담고 있으며, 손으로 직접 편집한다.
 *
 * modified는 숫자 코드: 0=원본, 1=업스케일, 2=재구성, 3=기타.
 *
 * 이 이미지들은 유저가 만든 게 아니라 개발사 원본 자료 제공이 목적이므로,
 * 각 항목의 source/modified를 채워 출처와 수정 여부를 명시할 것.
 *
 * 이 스크립트는 resource/img/ 를 스캔해서, manifest.js에 아직 없는 새 이미지가
 * 있으면 채워 넣기 편하도록 빈 자리 항목(caption은 파일명에서 자동 추출, source: '',
 * modified: 0)만 추가한다. 기존 항목은 절대 건드리지 않는다. 이미지가 삭제돼도
 * 남은 항목은 자동으로 지우지 않는다.
 *
 * 갤러리(모달/라이트박스) 노출 순서 = manifest.js에 적힌 항목 순서 그대로.
 * 새 이미지는 맨 끝에 추가되며, 순서를 바꾸고 싶으면 manifest.js에서 항목을
 * 직접 옮기면 된다 (이 스크립트는 기존 순서를 절대 재정렬하지 않는다).
 *
 * JSON이 아니라 <script> 태그로 로드되는 전역 변수 window.RESOURCE_IMG_MANIFEST로
 * 저장하는 이유: index.html을 서버 없이 file://로 직접 열었을 때 fetch()가 CORS로
 * 막히는 것을 피하기 위함 (데스크톱 확인은 서버 없이 하는 것이 원칙 —
 * data.js/triggers.js와 같은 방식).
 *
 * 실행: node scripts/gen-img-manifest.js
 * (git pre-commit 훅이 이미지 파일 추가/삭제 시 자동으로 이 스크립트를 실행한다)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'resource', 'img');
const MANIFEST_PATH = path.join(IMG_DIR, 'manifest.js');
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif']);
const MODIFIED_LABELS = ['원본', '업스케일', '재구성', '기타'];

function deriveCaption(filename) {
    const base = filename.replace(/\.[^.]+$/, '');
    const words = base.split(/[-_]+/).filter(Boolean);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function readExistingManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) return {};
    const text = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const match = text.match(/window\.RESOURCE_IMG_MANIFEST\s*=\s*(\{[\s\S]*\});?\s*$/);
    if (!match) return {};
    // 손으로 편집한 파일이라 trailing comma 등 JSON.parse가 거부하는 문법이 섞일 수 있으니
    // (JSON이 아니라) JS 객체 리터럴로 평가한다.
    return new Function(`return (${match[1]});`)();
}

function main() {
    const manifest = readExistingManifest();

    const files = fs.readdirSync(IMG_DIR)
        .filter(f => IMAGE_EXT.has(path.extname(f).toLowerCase()))
        .sort();

    let changed = false;
    for (const file of files) {
        if (!(file in manifest)) {
            manifest[file] = { caption: deriveCaption(file), source: '', modified: 0 };
            changed = true;
        }
    }

    for (const file of Object.keys(manifest)) {
        const modified = manifest[file].modified;
        if (MODIFIED_LABELS[modified] === undefined) {
            console.warn(`warning: ${file}의 modified 값 '${modified}'은(는) 알 수 없는 코드입니다. (0=원본, 1=업스케일, 2=재구성, 3=기타 중 하나여야 함)`);
        }
    }

    // 기존 항목 순서는 그대로 유지하고(재정렬 없음), 새 항목만 끝에 추가된 상태다.
    const js = `// resource/img/ 이미지 갤러리 데이터. caption/source/modified는 직접 편집한다.\n` +
        `// 새 이미지의 빈 자리 항목은 scripts/gen-img-manifest.js가 맨 끝에 자동으로 추가한다.\n` +
        `// 노출 순서 = 아래 나열된 순서 그대로. 순서를 바꾸려면 항목을 직접 옮길 것.\n` +
        `// modified: 0=원본, 1=업스케일, 2=재구성, 3=기타\n` +
        `window.RESOURCE_IMG_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`;
    fs.writeFileSync(MANIFEST_PATH, js);

    if (changed) {
        console.log(`Added missing entries; wrote ${Object.keys(manifest).length} entries to ${path.relative(ROOT, MANIFEST_PATH)}`);
    } else {
        console.log(`No new images; ${Object.keys(manifest).length} entries in ${path.relative(ROOT, MANIFEST_PATH)}`);
    }
}

main();
