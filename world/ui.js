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

// ===== Config — 직접 보면서 조정하는 값은 여기 모아둠 =====
const UI_CONFIG = {
    // 기본 텍스트 크기 — world/ui.css의 --ui-font-size로 내려가서 .ui-hud, .ui-touch-btn,
    // .ui-panel-title, .ui-panel-actions button 등 전부 이 값 하나로 통일된다.
    FONT_SIZE: 20,

    // UIStat이 만드는 숫자(이미지 폰트, SpriteNumberFont) 슬롯 기본값
    NUM_PRESET: 'BIG',      // 'SMALL'(8px, num_small.png) | 'BIG'(16px, num_big.png)
    NUM_SCALE: 1,           // 원본 글리프 배율 (정수배 권장 — 픽셀 확대가 고르게 나옴)
    NUM_COLOR: 'white',     // 'white' | 'green' | 'yellow' | 'red' (num_small/big.png 4색 행)

    // UIKeyboardMenu 커서(.ui-cursor) 위치 계산용 — world/ui.css 값과 맞춰야 함
    CURSOR_WIDTH: 12,       // .ui-cursor { width }
    CURSOR_HEIGHT: 16,      // .ui-cursor { height }
    CURSOR_GAP: 4,          // 커서와 버튼 사이 간격(px)
    PANEL_BORDER: 16        // .frame-box { border-width } — 패널 안쪽 좌표 보정용
};

// UI_CONFIG 값을 world/ui.css의 CSS 변수로 반영 (CSS 쪽엔 폴백값만 두고, 실제 값은
// 여기 하나에서 관리 — 스크립트가 이 시점에 이미 <head>/<body>에 걸려 있어야 함).
// CURSOR_WIDTH/HEIGHT·PANEL_BORDER는 JS(커서 위치 계산)와 CSS(테두리 두께·커서 크기)
// 양쪽에서 같은 값을 써야 어긋나지 않는다 — 이 연결이 빠지면 숫자만 바꿔서는 시각적으로
// 반영이 안 되는 버그가 남는다.
const root = document.documentElement.style;
root.setProperty('--ui-font-size', UI_CONFIG.FONT_SIZE + 'px');
root.setProperty('--ui-cursor-width', UI_CONFIG.CURSOR_WIDTH + 'px');
root.setProperty('--ui-cursor-height', UI_CONFIG.CURSOR_HEIGHT + 'px');
root.setProperty('--ui-panel-border', UI_CONFIG.PANEL_BORDER + 'px');

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

/**
 * UITouchButton — 모바일 터치 액션 버튼(화면 하단 고정, gensei-pc98 가상 게임패드 키캡 스타일).
 * 터치 기기에서만 붙인다(UITouchButton.supported로 판별. URL에 ?gamepad가 있으면
 * 데스크톱에서도 강제 표시). press/release 콜백을 게임 입력에 연결하고, show()/hide()로
 * 게임 상태에 따라 표시를 제어한다.
 *
 * 아이콘은 인라인 SVG 한 덩어리를 fill="currentColor"로 그려서 버튼의 CSS color를
 * 상속한다 — 크기는 SVG에 박지 않고 CSS(.ui-touch-btn svg { height: N%; width: auto })로
 * 조절하므로 버튼 크기가 바뀌어도 자동으로 맞는다. icon 생략 시 label 텍스트로 폴백.
 * 가로로 넓은 글리프(스페이스바 등)는 opts.wideIcon: true로 가로 기준 스케일로 전환한다
 * (세로 기준으로 맞추면 폭이 비율대로 과하게 커짐).
 *
 * 사용 예:
 *   if (UITouchButton.supported) {
 *       const jump = new UITouchButton({
 *           icon: UITouchButton.ICONS.space,
 *           wideIcon: true,
 *           label: 'Space',   // aria-label (+ icon 없을 때 텍스트 폴백)
 *           onPress:   () => { inputState.space = true;  },
 *           onRelease: () => { inputState.space = false; }
 *       });
 *   }
 */
class UITouchButton {
    constructor(opts = {}) {
        const btn = document.createElement('button');
        btn.className = 'ui-touch-btn' + (opts.wideIcon ? ' ui-touch-btn--wide-icon' : '');
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
        // ?gamepad 로 데스크톱에서도 강제 표시 (다른 웹 에뮬레이터들과 동일한 관례)
        if (new URLSearchParams(location.search).has('gamepad')) return true;
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }
}

// 스페이스바 글리프 (38.33x10.95) — ESC/Enter/화살표와 같은 5.48 그리드.
// aria-hidden — 접근성 라벨은 UITouchButton 생성자가 opts.label로 버튼 자체에 붙인다(중복 안내 방지).
UITouchButton.ICONS = {
    space: '<svg viewBox="0 0 38.33 10.95" fill="currentColor" aria-hidden="true">'
        + '<polygon points="32.86 0 32.86 5.48 27.38 5.48 21.9 5.48 16.43 5.48 10.95 5.48 5.48 5.48 5.48 0 0 0 0 5.48 0 10.95 5.48 10.95 10.95 10.95 16.43 10.95 21.9 10.95 27.38 10.95 32.86 10.95 38.33 10.95 38.33 5.48 38.33 0 32.86 0"/>'
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
 * 숫자 프리셋(SMALL 8px / BIG 16px)은 기본으로 UI_CONFIG.NUM_PRESET을 따르고,
 * 필요하면 인스턴스별로 opts.numOpts에서 SpriteNumberFont.SMALL/BIG을 직접 펼쳐 덮어쓴다.
 *
 * 사용 예:
 *   const hudTime = new UIStat(['TIME', {num:true}, ':', {num:true}]);
 *   hudStatsEl.appendChild(hudTime.el);
 *   hudTime.setNums('05', '23');
 *
 *   // 이 줄만 SMALL로 강제
 *   const small = new UIStat(['MONEY', {num:true}], { numOpts: { ...SpriteNumberFont.SMALL } });
 */
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
