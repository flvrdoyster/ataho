
const UI_CONFIG = {
    FONT_SIZE: 20,

    NUM_PRESET: 'BIG',      // 'SMALL'(8px, num_small.png) | 'BIG'(16px, num_big.png)
    NUM_SCALE: 1,
    NUM_COLOR: 'white',     // 'white' | 'green' | 'yellow' | 'red' (num_small/big.png 4색 행)

    CURSOR_WIDTH: 12,
    CURSOR_HEIGHT: 16,
    CURSOR_GAP: 4,
    PANEL_BORDER: 16
};

{
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--ui-font-size', UI_CONFIG.FONT_SIZE + 'px');
    rootStyle.setProperty('--ui-cursor-width', UI_CONFIG.CURSOR_WIDTH + 'px');
    rootStyle.setProperty('--ui-cursor-height', UI_CONFIG.CURSOR_HEIGHT + 'px');
    rootStyle.setProperty('--ui-panel-border', UI_CONFIG.PANEL_BORDER + 'px');
}

if (window.WORLD_BASE === undefined) console.warn('ui.js: window.WORLD_BASE가 정의되지 않았습니다. ui.js보다 먼저 지정해야 숫자 폰트 이미지를 찾습니다.');
if (!getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim()) console.warn('ui.js: world/ui.css가 로드되지 않았습니다.');

function resolveUiAsset(relPath) {
    return (window.WORLD_BASE || '') + relPath;
}

class UIKeyboardMenu {
    constructor(panelEl, cursorEl, buttons, opts = {}) {
        this.panel = panelEl;
        this.cursor = cursorEl;
        this.buttons = buttons;
        this.gap = opts.gap ?? UI_CONFIG.CURSOR_GAP;
        this.cursorW = opts.cursorW ?? UI_CONFIG.CURSOR_WIDTH;
        this.cursorH = opts.cursorH ?? UI_CONFIG.CURSOR_HEIGHT;
        this.border = opts.border ?? UI_CONFIG.PANEL_BORDER;
        this.idx = -1;
        this.active = false;

        this._onKeydown = this._onKeydown.bind(this);
        buttons.forEach((btn, i) => {
            btn.addEventListener('mouseenter', () => { this.idx = i; this._place(btn); });
            btn.addEventListener('mouseleave', () => { this.idx = -1; this._hide(); });
        });
    }

    enable() {
        if (this.active) return;
        this.active = true;
        document.addEventListener('keydown', this._onKeydown);
    }

    disable() {
        this.active = false;
        document.removeEventListener('keydown', this._onKeydown);
        this.idx = -1;
        this._hide();
    }

    selectFirst() {
        if (!this.buttons.length) return;
        this.idx = 0;
        this._place(this.buttons[0]);
    }

    _place(btn) {
        const pr = this.panel.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        this.cursor.style.left = (br.left - pr.left - this.border - this.gap - this.cursorW) + 'px';
        this.cursor.style.top = (br.top - pr.top - this.border + (br.height - this.cursorH) / 2) + 'px';
        this.cursor.hidden = false;
    }

    _hide() {
        this.cursor.hidden = true;
    }

    _onKeydown(e) {
        if (!this.buttons.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            this.idx = this.idx < 0 ? 0 : (this.idx + 1) % this.buttons.length;
            this._place(this.buttons[this.idx]);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            this.idx = this.idx < 0 ? this.buttons.length - 1 : (this.idx - 1 + this.buttons.length) % this.buttons.length;
            this._place(this.buttons[this.idx]);
        } else if ((e.key === 'Enter' || e.key === ' ') && this.idx >= 0) {
            e.preventDefault();
            this.buttons[this.idx].click();
        }
    }
}

class UITouchButton {
    constructor(opts = {}) {
        const btn = document.createElement('button');
        btn.className = 'ui-touch-btn' + (opts.wideIcon ? ' ui-touch-btn--wide-icon' : '');
        if (opts.label) btn.setAttribute('aria-label', opts.label);
        if (opts.icon) btn.innerHTML = opts.icon;
        else btn.textContent = opts.label ?? '';
        this.el = btn;

        let pressed = false;
        const press = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (pressed) return;
            pressed = true;
            btn.classList.add('active');
            if (opts.onPress) opts.onPress();
        };
        const release = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (!pressed) return;
            pressed = false;
            btn.classList.remove('active');
            if (opts.onRelease) opts.onRelease();
        };
        btn.addEventListener('touchstart', press, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);

        (opts.parent || document.body).appendChild(btn);
    }

    show() { this.el.style.display = 'flex'; }
    hide() { this.el.style.display = 'none'; }

    static get supported() {
        if (new URLSearchParams(location.search).has('gamepad')) return true;
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }
}

UITouchButton.ICONS = {
    space: '<svg viewBox="0 0 38.33 10.95" fill="currentColor" aria-hidden="true">'
        + '<polygon points="32.86 0 32.86 5.48 27.38 5.48 21.9 5.48 16.43 5.48 10.95 5.48 5.48 5.48 5.48 0 0 0 0 5.48 0 10.95 5.48 10.95 10.95 10.95 16.43 10.95 21.9 10.95 27.38 10.95 32.86 10.95 38.33 10.95 38.33 5.48 38.33 0 32.86 0"/>'
        + '</svg>'
};

class UIMuteButton {
    constructor(opts = {}) {
        const btn = document.createElement('button');
        btn.className = 'ui-icon-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Toggle sound');
        this.el = btn;
        this.onToggle = opts.onToggle || null;
        this.muted = !!opts.initialMuted;
        this._render();

        btn.addEventListener('click', () => this.toggle());

        (opts.parent || document.body).appendChild(btn);
    }

    _render() {
        this.el.innerHTML = this.muted ? UIMuteButton.ICON_OFF : UIMuteButton.ICON_ON;
    }

    toggle() {
        this.muted = !this.muted;
        this._render();
        if (this.onToggle) this.onToggle(this.muted);
    }
}

UIMuteButton.ICON_ON = '<svg viewBox="0 0 49.13 70.14" fill="currentColor" aria-hidden="true">'
    + '<path d="M7.43,68.29c-2.31-1.26-4.13-3.01-5.45-5.25s-1.98-4.77-1.98-7.58.65-5.41,1.96-7.62c1.3-2.21,3.12-3.93,5.45-5.14,'
    + '2.33-1.22,4.96-1.82,7.89-1.82s5.45.59,7.73,1.76l-.09-42.63h26.19v14.77h-18.72v40.69c0,2.81-.65,5.34-1.96,7.58-1.3,2.24-3.1,'
    + '3.99-5.38,5.25s-4.88,1.87-7.78,1.85c-2.93.03-5.55-.59-7.87-1.85Z"/></svg>';
UIMuteButton.ICON_OFF = '<svg viewBox="0 0 56.02 70.14" fill="currentColor" aria-hidden="true">'
    + '<rect x="26.51" y="-3.04" width="3" height="76.23" transform="translate(-16.59 30.08) rotate(-45)"/>'
    + '<polygon points="33.86 35.68 33.86 14.77 52.58 14.77 52.58 0 26.38 0 26.44 28.27 33.86 35.68"/>'
    + '<path d="M26.47,42.63c-2.29-1.17-4.86-1.76-7.73-1.76s-5.56.61-7.89,1.82c-2.33,1.22-4.15,2.93-5.45,5.14-1.3,2.21-1.96,4.75-1.96,'
    + '7.62s.66,5.34,1.98,7.58,3.13,3.99,5.45,5.25c2.31,1.26,4.94,1.87,7.87,1.85,2.9.03,5.49-.59,7.78-1.85s4.08-3.01,5.38-5.25c1.3-2.24,'
    + '1.96-4.77,1.96-7.58v-9.12l-7.39-7.39v3.68Z"/></svg>';

class SpriteNumberFont {
    constructor(opts = {}) {
        this.glyphW = opts.glyphW;
        this.glyphH = opts.glyphH;
        this.scale = opts.scale ?? 1;
        this.charMap = opts.charMap || SpriteNumberFont.DIGIT_CHARS;
        this.colorRow = typeof opts.color === 'string'
            ? (SpriteNumberFont.COLORS[opts.color] ?? 0)
            : (opts.color ?? 0);

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'ui-pixel-text';
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;

        this.img = new Image();
        this._loaded = new Promise((resolve) => {
            this.img.onload = resolve;
            this.img.onerror = resolve;
        });
        this.img.src = opts.src;

        this._loaded.then(() => this._draw());

        this.text = '';
        if (opts.text) this.setText(opts.text);
    }

    get el() { return this.canvas; }

    setText(text) {
        text = String(text);
        if (text === this.text) return;
        this.text = text;
        this._draw();
    }

    setColor(color) {
        this.colorRow = typeof color === 'string' ? (SpriteNumberFont.COLORS[color] ?? 0) : color;
        this._draw();
    }

    _draw() {
        if (!this.img.complete || !this.img.naturalWidth) return;
        const chars = Array.from(this.text || '');
        const w = Math.max(1, chars.length * this.glyphW);
        const h = this.glyphH;

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.canvas.style.width = (w * this.scale) + 'px';
            this.canvas.style.height = (h * this.scale) + 'px';
        }

        const ctx = this.ctx;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, w, h);
        chars.forEach((ch, i) => {
            const col = this.charMap[ch];
            if (col == null) return;
            ctx.drawImage(this.img,
                col * this.glyphW, this.colorRow * this.glyphH, this.glyphW, this.glyphH,
                i * this.glyphW, 0, this.glyphW, this.glyphH);
        });
    }
}

SpriteNumberFont.DIGIT_CHARS = { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9 };
SpriteNumberFont.DIGIT_CHARS_Q = { ...SpriteNumberFont.DIGIT_CHARS, '?': 10 };   // num_small 전용(11번째 글리프)
SpriteNumberFont.COLORS = { white: 0, green: 1, yellow: 2, red: 3 };
SpriteNumberFont.SMALL = { src: resolveUiAsset('ui/num_small.png'), glyphW: 8, glyphH: 8, charMap: SpriteNumberFont.DIGIT_CHARS_Q };
SpriteNumberFont.BIG = { src: resolveUiAsset('ui/num_big.png'), glyphW: 16, glyphH: 16 };

class UIStat {
    constructor(parts, opts = {}) {
        this.el = document.createElement('span');
        this.el.className = 'ui-stat';
        this.nums = [];

        const basePreset = SpriteNumberFont[UI_CONFIG.NUM_PRESET] || SpriteNumberFont.SMALL;
        const numOpts = { ...basePreset, color: UI_CONFIG.NUM_COLOR, scale: UI_CONFIG.NUM_SCALE, ...opts.numOpts };
        parts.forEach(part => {
            if (typeof part === 'string') {
                const span = document.createElement('span');
                span.textContent = part;
                this.el.appendChild(span);
            } else {
                const sf = new SpriteNumberFont({ ...numOpts, ...part });
                this.nums.push(sf);
                this.el.appendChild(sf.el);
            }
        });
    }

    setNums(...values) {
        values.forEach((v, i) => { if (this.nums[i]) this.nums[i].setText(v); });
    }
}
