#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TRIGGERS = path.join(ROOT, 'world/maps/cave/triggers.js');
const INDEX = path.join(ROOT, 'index.html');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const BEGIN = '<!-- site-index:begin -->';
const END = '<!-- site-index:end -->';

function loadTriggers() {
    global.window = { MAP_DATA: {} };
    require(TRIGGERS);
    return window.MAP_DATA.triggers;
}

function collect(triggers) {
    const categories = new Map();
    for (const t of triggers) {
        if (t.itemsFrom || !t.items) continue;
        for (const item of t.items) {
            if (!item.href) continue;
            const name = item.group || t.title;
            if (!name) throw new Error(`분류가 없는 링크: ${t.id} → ${item.href}`);
            if (!categories.has(name)) categories.set(name, []);
            categories.get(name).push({
                href: item.href.replace(/(^|\/)index\.html$/, '$1'),
                label: item.label.replace(/\s*\n\s*/g, ' '),
            });
        }
    }
    return categories;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(categories, indent) {
    const i1 = indent, i2 = indent + '    ', i3 = indent + '        ', i4 = indent + '            ';
    const lines = [`${i1}<ul>`];
    for (const [name, links] of categories) {
        lines.push(`${i2}<li><b>${esc(name)}</b>`);
        lines.push(`${i3}<span class="links">`);
        for (const l of links) lines.push(`${i4}<a href="${esc(l.href)}" tabindex="-1">${esc(l.label)}</a>`);
        lines.push(`${i3}</span></li>`);
    }
    lines.push(`${i1}</ul>`);
    return lines.join('\n');
}

function warnSitemap(categories) {
    const sitemap = fs.readFileSync(SITEMAP, 'utf8');
    for (const links of categories.values()) {
        for (const { href } of links) {
            if (/^https?:/.test(href)) continue;
            const url = `https://atah.io/${href}`;
            if (!sitemap.includes(`<loc>${url.replace(/&/g, '&amp;')}</loc>`)) {
                console.warn(`sitemap.xml 에 없음: ${url}`);
            }
        }
    }
}

function main() {
    const check = process.argv.includes('--check');
    const categories = collect(loadTriggers());
    const html = fs.readFileSync(INDEX, 'utf8');
    const b = html.indexOf(BEGIN), e = html.indexOf(END);
    if (b < 0 || e < b) throw new Error(`index.html 에 ${BEGIN} … ${END} 표시가 없습니다`);

    const lineStart = html.lastIndexOf('\n', b) + 1;
    const indent = html.slice(lineStart, b);
    const next = html.slice(0, b + BEGIN.length) + '\n' + render(categories, indent) + '\n' + indent + html.slice(e);

    warnSitemap(categories);
    if (next === html) return;
    if (check) {
        console.error('index.html 의 "모든 페이지" 목록이 triggers.js 와 다릅니다 — node scripts/gen_site_index.js 로 갱신하세요');
        process.exit(1);
    }
    fs.writeFileSync(INDEX, next);
    console.log('index.html 의 "모든 페이지" 목록을 갱신했습니다');
}

main();
