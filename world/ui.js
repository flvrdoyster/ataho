/**
 * ui.js — 공용 픽셀 RPG UI 동작 (balance/ 의 게임오버 패널 키보드 네비게이션을 일반화)
 *
 * HTML은 직접 작성한다(.ui-panel 안에 .ui-cursor + 버튼들). 이 파일은 그 위에
 * 화살표 키 네비게이션 + 마우스 호버 동기화만 붙인다.
 *
 * 사용 예:
 *   const menu = new UIKeyboardMenu(panelEl, cursorEl, buttons);
 *   menu.enable();   // 오버레이 열 때
 *   menu.disable();  // 오버레이 닫을 때
 */

// world/ui.js를 로드하는 페이지마다 상대 경로 깊이가 다르므로(../world/ui.js 등),
// engine.js의 window.MAP_BASE와 같은 방식으로 호스트 페이지가 지정한 접두사를 쓴다.
//   <script>window.WORLD_BASE = '../world/';</script>  (world/ 로드 위치 기준, sweep도 동일)
function resolveUiAsset(relPath) {
    return (window.WORLD_BASE || '') + relPath;
}

class UIKeyboardMenu {
    constructor(panelEl, cursorEl, buttons, opts = {}) {
        this.panel = panelEl;
        this.cursor = cursorEl;
        this.buttons = buttons;
        this.gap = opts.gap ?? 4;
        this.cursorW = opts.cursorW ?? 12;
        this.cursorH = opts.cursorH ?? 16;
        this.border = opts.border ?? 16;
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

/**
 * UITouchButton — 모바일 터치 액션 버튼(화면 하단 원형 고정 버튼).
 * 터치 기기에서만 붙인다(UITouchButton.supported로 판별). press/release 콜백을
 * 게임 입력에 연결하고, show()/hide()로 게임 상태에 따라 표시를 제어한다.
 *
 * 아이콘은 인라인 SVG 한 덩어리를 fill="currentColor"로 그려서 버튼의 CSS color를
 * 상속한다 — 크기는 SVG에 박지 않고 CSS(.ui-touch-btn svg { height: N%; width: auto })로
 * 조절하므로 버튼 크기가 바뀌어도 자동으로 맞는다. icon 생략 시 label 텍스트로 폴백.
 *
 * 사용 예:
 *   if (UITouchButton.supported) {
 *       const jump = new UITouchButton({
 *           icon: UITouchButton.ICONS.space,
 *           label: 'Space',   // aria-label (+ icon 없을 때 텍스트 폴백)
 *           onPress:   () => { inputState.space = true;  },
 *           onRelease: () => { inputState.space = false; }
 *       });
 *   }
 */
class UITouchButton {
    constructor(opts = {}) {
        const btn = document.createElement('button');
        btn.className = 'ui-touch-btn';
        if (opts.label) btn.setAttribute('aria-label', opts.label);
        if (opts.icon) btn.innerHTML = opts.icon;
        else btn.textContent = opts.label ?? '';
        this.el = btn;

        const press = (e) => {
            e.preventDefault(); e.stopPropagation();
            btn.classList.add('active');
            if (opts.onPress) opts.onPress();
        };
        const release = (e) => {
            e.preventDefault(); e.stopPropagation();
            btn.classList.remove('active');
            if (opts.onRelease) opts.onRelease();
        };
        btn.addEventListener('touchstart', press, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        // 하이브리드 기기용 마우스 이벤트
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);

        (opts.parent || document.body).appendChild(btn);
    }

    show() { this.el.style.display = 'flex'; }
    hide() { this.el.style.display = 'none'; }

    static get supported() {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }
}

// "SPACE" 워드마크 (261x45, 가로로 긴 픽셀 글리프). aria-hidden — 접근성 라벨은
// UITouchButton 생성자가 opts.label로 버튼 자체에 붙인다(중복 안내 방지).
UITouchButton.ICONS = {
    space: '<svg viewBox="0 0 261 45" fill="currentColor" aria-hidden="true">'
        + '<path d="M0,36h27v-9H0V9h9V0h36v9h-27v9h27v18h-9v9H0v-9Z"/>'
        + '<path d="M54,36V0h36v9h9v18h-9v9h-18v9h-18v-9ZM81,27V9h-9v18h9Z"/>'
        + '<path d="M108,36V9h9V0h27v9h9v36h-18v-9h-9v9h-18v-9ZM135,27V9h-9v18h9Z"/>'
        + '<path d="M162,27V9h9V0h27v9h9v9h-18v-9h-9v27h9v-9h18v9h-9v9h-27v-9h-9v-9Z"/>'
        + '<path d="M216,36V0h45v9h-27v9h18v9h-18v9h27v9h-45v-9Z"/>'
        + '</svg>'
};

/**
 * SpriteNumberFont — 숫자 전용 이미지 폰트(world/ui/num_small.png, num_big.png)로
 * 문자열을 그리는 렌더러. 각 시트는 글리프가 가로로 나열되고(0~9[, ?]),
 * 색상별로 세로로 흰/초록/노랑/빨강 4행이 쌓여 있다.
 *
 * 구두점(:, ., m, G 등)은 이 폰트에 없으므로 라벨/구분자는 별도 텍스트로 두고
 * 숫자 구간만 이 클래스로 교체해 쓴다.
 *
 * 사용 예:
 *   const t = new SpriteNumberFont({ ...SpriteNumberFont.SMALL, color: 'green', scale: 3 });
 *   container.appendChild(t.el);
 *   t.setText('42');
 */
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

        this.text = '';
        if (opts.text) this.setText(opts.text);
    }

    get el() { return this.canvas; }

    setText(text) {
        this.text = String(text);
        this._draw();
        this._loaded.then(() => this._draw());
    }

    setColor(color) {
        this.colorRow = typeof color === 'string' ? (SpriteNumberFont.COLORS[color] ?? 0) : color;
        this._draw();
    }

    _draw() {
        if (!this.img.complete || !this.img.naturalWidth) return;   // 아직 로드 전
        const chars = Array.from(this.text || '');
        const w = Math.max(1, chars.length * this.glyphW);
        const h = this.glyphH;

        this.canvas.width = w;
        this.canvas.height = h;
        this.canvas.style.width = (w * this.scale) + 'px';
        this.canvas.style.height = (h * this.scale) + 'px';

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

/**
 * UIStat — HUD 한 줄(라벨 + 숫자(이미지 폰트) + 구분자 조합, 예: "TIME 05 : 23")을
 * 통째로 조립하는 헬퍼. 문자열 조각은 고정 라벨/구분자 텍스트로, {num:true} 조각은
 * SpriteNumberFont 슬롯으로 만든다. 슬롯 값 갱신은 setNums()로 순서대로.
 *
 * 사용 예:
 *   const hudTime = new UIStat(['TIME', {num:true}, ':', {num:true}]);
 *   hudStatsEl.appendChild(hudTime.el);
 *   hudTime.setNums('05', '23');
 */
class UIStat {
    constructor(parts, opts = {}) {
        this.el = document.createElement('span');
        this.el.className = 'ui-stat';
        this.nums = [];

        const numOpts = { ...SpriteNumberFont.SMALL, color: 'white', scale: 1, ...opts.numOpts };
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
