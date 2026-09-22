// 챕터(클립) 단위로 재생하는 플레이어. "장면 뷰어"(SceneViewer)는 분기·선택지·
// 스프라이트·스탭롤까지 갖춘 비주얼노벨 엔진인데, 영상만 갈아끼우며 보는
// 스토리(ani)는 그 기능을 하나도 안 쓰면서 엔진에 얹혀 있었다. 이 클래스는 그
// 경우만을 위한 것 — 챕터 탭 + 탐색바(현재 챕터 구간 기준) + ±10초 + 자막.
//
// 챕터는 { title, body, src, start=0, end?, subtitle?, dub? } 하나하나가 재생 단위다.
// 여러 챕터가 같은 src를 공유하면 start/end로 그 안의 구간을 나눈 것이고(지금의
// ani처럼 아직 영상이 안 쪼개진 상태), 서로 다른 src를 쓰면 완전히 별개의 클립이다
// (쪼개진 뒤의 상태) — 두 경우를 같은 코드로 다룬다: end를 안 주면 "다음 챕터가
// 같은 파일이면 그 시작 지점까지, 아니면(파일이 다르거나 마지막 챕터) 이 파일
// 끝까지"로 계산하므로, 영상을 쪼갠 뒤엔 각 챕터의 src만 바꾸고 start/end를
// 지우면(기본값 0 / 파일 끝) 그대로 맞는다.
//
// 자막(VTT) 파싱/동기화는 subtitles.js를 공유한다 (SceneViewer도 같은 걸 쓴다).
//
// 더빙 음원은 영상과 별개의 <audio>로 같이 돌린다 — mp4에 오디오 트랙을 하나 더
// 심어 고르는 audioTracks API는 사파리 말고는 못 쓴다. 더빙이 켜지면 <video>는
// 음소거하고 <audio>가 소리를 내며, 시각은 항상 <video>를 기준으로 맞춘다
// (play/pause/seek를 따라가고, 흘러가다 어긋나면 되돌린다). 음원 파일은 영상과
// 길이를 똑같이 맞춰 두는 게 전제다. 경로는 자막처럼 audioLang 관례로 유도한다
// (dub: true) — 챕터에 dub: "경로"를 직접 줄 수도 있다(subtitle과 같은 방식).
//
// 컨트롤 외형은 미니게임과 같은 공용 픽셀 UI 키트(world/ui.css)를 따르고, 음소거
// 버튼은 그 키트의 UIMuteButton(world/ui.js)을 그대로 쓴다 — 아이콘을 따로 만들지 않는다.
// 재생/일시정지 아이콘은 사이트 어디에도 관례가 없어 여기서 새로 두되, 다른
// 아이콘들과 같은 방식(인라인 SVG, fill="currentColor")으로 맞춘다.
const PLAY_PAUSE_ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="7,4 20,12 7,20"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
        + '<rect x="5" y="4" width="5" height="16"/><rect x="14" y="4" width="5" height="16"/></svg>',
};

class VideoPlayer {
    static players = {};

    static register(id, config) {
        VideoPlayer.players[id] = config;
    }

    constructor(stageSelector, controlsSelector) {
        this.stage = document.querySelector(stageSelector);
        this.controlsHost = document.querySelector(controlsSelector);
        this.video = null;
        this.chapters = [];
        this.subLang = null;
        this.chapterIndex = 0;
        this.chapterSrc = null;   // 현재 <video>에 물려 있는 src — 챕터 전환 시 바뀌었는지 판단
        this.chapterStart = 0;
        this.subtitleEl = null;
        this.detachSubtitles = null;
        this.subtitleBtn = null;
        this.subtitlesOn = true;   // 챕터를 넘어가도 유지되는 자막 표시 여부
        this.audioLang = null;
        this.dubAudio = null;      // 더빙 음원용 <audio> — 더빙 챕터가 하나라도 있을 때만 만든다
        this.dubOn = false;        // 더빙 켜짐 여부 — 자막처럼 챕터를 넘어가도 유지
        this.dubAvailable = false; // 현재 챕터에 더빙 음원이 있는지
        this.dubBtn = null;
        this.userMuted = false;    // 뮤트 버튼 상태 — video.muted는 더빙 때문에 따로 켜질 수 있어 분리
        this.seekEl = null;
        this.seeking = false;   // 재생 바를 잡고 있는 중인지
        this.timeEl = null;
        this.chapterButtonsEl = null;
        this.muteBtn = null;
        this.volumeEl = null;
        this.volumeValueEl = null;
        this.audioCtx = null;
        this.gainNode = null; // WebAudio 연결에 성공했을 때만 존재 — 100% 너머 증폭용
        this.playOverlayBtn = null;

        this.onKeydown = (e) => {
            if (e.repeat) return;
            // 버튼·슬라이더에 포커스가 있을 땐 스페이스/엔터가 그 요소를 눌러야 한다.
            // 여기서 무조건 preventDefault하면 키보드로는 챕터 탭·자막·음소거를
            // 누를 수 없고 영상 재생만 토글돼 버린다.
            const t = e.target;
            if (t && typeof t.closest === 'function'
                && t.closest('button, input, select, textarea, a[href], [tabindex]')) return;
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                this.togglePlay();
            }
        };
        document.addEventListener('keydown', this.onKeydown);
    }

    load(config) {
        this.chapters = config.chapters || [];
        this.subLang = config.subLang || null;
        this.audioLang = config.audioLang || null;
        this.stage.innerHTML = '';
        this.controlsHost.innerHTML = '';

        const video = document.createElement('video');
        video.className = 'scene-video';
        video.playsInline = true;
        video.addEventListener('click', () => this.togglePlay());
        video.addEventListener('timeupdate', () => this.updateSeekUI());
        video.addEventListener('ended', () => this.onChapterEnded());
        video.addEventListener('play', () => this.updatePlayOverlay());
        video.addEventListener('pause', () => this.updatePlayOverlay());
        this.stage.appendChild(video);
        this.video = video;

        if (this.hasDub()) {
            const audio = document.createElement('audio');
            audio.preload = 'auto';
            this.stage.appendChild(audio);
            this.dubAudio = audio;
            // <video>가 시계다 — 재생/정지/탐색을 그대로 따라가고, 재생 중 어긋나면
            // (버퍼링으로 영상만 멈췄다 풀리는 경우 등) 되돌린다. 0.1초는 timeupdate
            // 간격보다 짧고 귀로는 못 잡는 수준.
            video.addEventListener('play', () => this.applyDub());
            video.addEventListener('pause', () => this.applyDub());
            video.addEventListener('seeking', () => this.syncDub(true));
            video.addEventListener('timeupdate', () => this.syncDub(false));
        }

        // 마우스를 올리거나(데스크탑) 일시정지 상태일 때(항상) 뜨는 재생/일시정지
        // 버튼. 켜짐/꺼짐 표시는 CSS(.stage:hover, .paused)가 맡고, 여기선 아이콘과
        // 클릭만 담당한다. 영상 위가 아니라 스테이지의 별도 요소라 클릭이 video의
        // 자체 토글 리스너와 안 겹친다.
        const playOverlay = document.createElement('button');
        playOverlay.className = 'video-play-overlay paused';
        playOverlay.innerHTML = PLAY_PAUSE_ICONS.play;
        playOverlay.setAttribute('aria-label', '재생/일시정지');
        playOverlay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePlay();
        });
        this.stage.appendChild(playOverlay);
        this.playOverlayBtn = playOverlay;

        this.setupAudioBoost(video, this.dubAudio);
        this.buildControls();
        this.loadChapter(0);
    }

    updatePlayOverlay() {
        if (!this.playOverlayBtn || !this.video) return;
        const paused = this.video.paused;
        this.playOverlayBtn.classList.toggle('paused', paused);
        this.playOverlayBtn.innerHTML = paused ? PLAY_PAUSE_ICONS.play : PLAY_PAUSE_ICONS.pause;
    }

    // <video>를 WebAudio 그래프에 물려 GainNode로 100%(원본 볼륨) 너머까지 증폭할
    // 수 있게 한다 — 원본보다 조용하게 인코딩된 클립을 볼륨 슬라이더만으로는
    // (네이티브 volume은 0~1, 즉 최대 100%가 한계라) 못 키우는 문제 대응.
    // 실패하면(구형 브라우저 등) this.gainNode가 없는 채로 그냥 <video>의 기본
    // 오디오 출력이 그대로 살아있으니, 슬라이더는 0~100%로만 동작한다.
    setupAudioBoost(video, audio) {
        // file://로 열면 미디어가 불투명 출처로 취급돼, WebAudio 그래프를 타는 순간
        // 소리가 통째로 무음이 된다 — 예외도 안 던지므로 아래 try/catch로도 못 잡는다.
        // 이 사이트는 서버 없이 파일을 직접 열어 확인하는 걸 원칙으로 하므로, 그
        // 경우엔 증폭을 포기하고 네이티브 오디오를 그대로 쓴다(슬라이더 0~100%).
        if (window.location && window.location.protocol === 'file:') return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContextClass();
            const gain = ctx.createGain();
            ctx.createMediaElementSource(video).connect(gain);
            // 더빙 <audio>도 같은 GainNode를 타야 볼륨 슬라이더·증폭이 똑같이 먹는다
            if (audio) ctx.createMediaElementSource(audio).connect(gain);
            gain.connect(ctx.destination);
            this.audioCtx = ctx;
            this.gainNode = gain;
        } catch (e) {
            this.audioCtx = null;
            this.gainNode = null;
        }
    }

    // 브라우저 자동재생 정책상 AudioContext는 사용자 제스처 전까진 suspended
    // 상태일 수 있다 — 실제 사용자 조작(재생/음소거/볼륨) 핸들러 초입에서 부른다.
    resumeAudio() {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
    }

    togglePlay() {
        if (!this.video) return;
        this.resumeAudio();
        if (this.video.paused) this.video.play().catch(() => {});
        else this.video.pause();
    }

    // UIMuteButton이 자기 아이콘 상태를 직접 관리하므로, 여기선 미디어에만 반영한다.
    // <video>의 muted는 더빙이 켜져 있어도 참이라 applyDub가 한꺼번에 계산한다.
    setMuted(muted) {
        if (!this.video) return;
        this.resumeAudio();
        this.userMuted = muted;
        this.applyDub();
    }

    // 더빙 챕터가 하나도 없으면 <audio>도 버튼도 만들 이유가 없다.
    hasDub() {
        return this.chapters.some(ch => ch.dub);
    }

    toggleDub() {
        this.resumeAudio();
        this.dubOn = !this.dubOn;
        this.updateDubButton();
        this.applyDub();
    }

    // 음원이 없는 챕터에서는 버튼을 감춘다 — 흐리게만 두면 "끈 상태"와 구분이 안 된다.
    // 자리는 남겨 둬야(.empty = visibility: hidden) 챕터를 넘길 때 재생 바 폭이 안 바뀐다.
    // 켜둔 상태(dubOn)는 그대로 남아, 더빙 있는 챕터로 돌아오면 켜진 채로 다시 나타난다.
    updateDubButton() {
        if (!this.dubBtn) return;
        this.dubBtn.classList.toggle('active', this.dubOn);
        this.dubBtn.setAttribute('aria-pressed', String(this.dubOn));
        this.dubBtn.classList.toggle('empty', !this.dubAvailable);
        this.dubBtn.disabled = !this.dubAvailable;   // 안 보이는 버튼이 탭 이동·클릭에 안 걸리게
    }

    // 더빙 켜짐·현재 챕터 음원 유무·뮤트를 합쳐 두 미디어의 소리 상태를 결정한다.
    // 더빙이 실제로 나갈 때만 <video>를 음소거하고 <audio>를 영상에 맞춰 돌린다.
    applyDub() {
        if (!this.video) return;
        const active = this.dubOn && this.dubAvailable && !!this.dubAudio;
        this.video.muted = this.userMuted || active;
        if (!this.dubAudio) return;
        this.dubAudio.muted = this.userMuted;
        if (active && !this.video.paused) {
            this.syncDub(true);
            this.dubAudio.play().catch(() => {});
        } else {
            this.dubAudio.pause();
        }
    }

    // force: 탐색처럼 무조건 맞춰야 할 때. 아니면 재생 중 어긋난 경우에만 되돌린다 —
    // currentTime을 매번 쓰면 그때마다 소리가 살짝 끊긴다.
    syncDub(force) {
        const audio = this.dubAudio;
        if (!audio || !this.video || (audio.paused && !force)) return;
        const drift = Math.abs(audio.currentTime - this.video.currentTime);
        if (force || drift > 0.1) audio.currentTime = this.video.currentTime;
    }

    // 챕터가 파일별로 쪼개지면 각 클립이 따로 끝나므로, 다음 챕터로 이어 재생한다 —
    // 쪼개기 전 통짜 파일이 다섯 편을 연달아 틀어주던 동작을 유지하기 위함.
    // 마지막 챕터에서는 그대로 멈춘다.
    onChapterEnded() {
        if (this.chapterIndex < this.chapters.length - 1) {
            this.loadChapter(this.chapterIndex + 1);
        }
    }

    toggleSubtitles() {
        this.subtitlesOn = !this.subtitlesOn;
        if (this.subtitleEl) this.subtitleEl.hidden = !this.subtitlesOn;
        if (this.subtitleBtn) {
            this.subtitleBtn.classList.toggle('active', this.subtitlesOn);
            this.subtitleBtn.setAttribute('aria-pressed', String(this.subtitlesOn));
        }
    }

    // 자막을 아예 안 쓰는 영상이면 토글 버튼을 만들 이유가 없다.
    hasSubtitles() {
        return !!this.subLang || this.chapters.some(ch => ch.subtitle);
    }

    // 사용자가 슬라이더/버튼을 조작했을 때 호출 — 유효한 제스처이므로 resume도 같이 시도.
    setVolume(pct) {
        if (!this.video) return;
        this.resumeAudio();
        this.applyVolume(pct);
    }

    // pct: 0~100(증폭 불가 시) 또는 0~200(증폭 가능 시). gainNode가 있으면 그
    // 값만 조절하고 video.volume은 1로 고정 — 없으면 video.volume을 직접 쓴다.
    // resumeAudio를 부르지 않는다 — 초기화(buildControls)에서도 이 값 그대로 쓰이는데,
    // 그 시점은 사용자 제스처가 아니라 불필요하게 resume을 시도하게 된다.
    applyVolume(pct) {
        const max = this.gainNode ? 200 : 100;
        const clamped = Math.min(Math.max(pct, 0), max);
        if (this.gainNode) {
            this.video.volume = 1;
            this.gainNode.gain.value = clamped / 100;
        } else {
            this.video.volume = clamped / 100;
            if (this.dubAudio) this.dubAudio.volume = clamped / 100;
        }
        if (this.volumeEl) this.volumeEl.value = clamped;
        this.updateVolumeUI(clamped, max);
    }

    // 볼륨 바도 탐색바처럼 채워진 부분을 칠하고, 현재 값을 숫자로 보여준다.
    // 증폭이 가능한(0~200%) 경우엔 100%(원본 그대로)가 어디인지 눈금을 겹쳐 그린다 —
    // 기준점이 없으면 지금 얼마나 키운 건지 알 수가 없다. 눈금은 채움 위에 와야 해서
    // 배경 레이어를 둘로 쌓는다(앞 레이어가 위에 그려짐).
    updateVolumeUI(pct, max) {
        if (!this.volumeEl) return;
        const fillPct = (pct / max) * 100;
        const fillLayer = `linear-gradient(to right, var(--bar-fill) ${fillPct}%, var(--bar-track) ${fillPct}%)`;

        if (max > 100) {
            const tickPct = (100 / max) * 100;
            const tickLayer = 'linear-gradient(to right,'
                + ` transparent calc(${tickPct}% - 1px),`
                + ` var(--bar-tick) calc(${tickPct}% - 1px), var(--bar-tick) ${tickPct}%,`
                + ` transparent ${tickPct}%)`;
            this.volumeEl.style.backgroundImage = `${tickLayer}, ${fillLayer}`;
        } else {
            this.volumeEl.style.backgroundImage = fillLayer;
        }

        if (this.volumeValueEl) this.volumeValueEl.textContent = `${Math.round(pct)}%`;
    }

    seekBy(deltaSeconds) {
        if (!this.video) return;
        const end = this.getChapterEnd();
        this.video.currentTime = Math.min(Math.max(this.video.currentTime + deltaSeconds, this.chapterStart), end);
    }

    // load()가 첫 챕터를 자동으로 여는 호출까지 포함하므로, resumeAudio()는 여기가
    // 아니라 실제 사용자 제스처인 탭 클릭 핸들러 쪽에서 부른다 (buildControls 참고).
    loadChapter(index) {
        const chapter = this.chapters[index];
        if (!chapter) return;
        this.chapterIndex = index;
        this.chapterStart = chapter.start || 0;

        const startPlayback = () => {
            this.video.currentTime = this.chapterStart;
            this.video.play().catch(() => {});
            this.updateSeekUI();
        };

        // 더빙 음원은 챕터(=파일)마다 다르니 src가 바뀔 때 같이 갈아끼운다. 없는
        // 챕터에서는 src를 비워 두고 버튼을 자리만 남긴 채 감춘다 — 켜둔 상태(dubOn)는 남긴다.
        const dubSrc = typeof chapter.dub === 'string' ? chapter.dub
            : (chapter.dub && this.audioLang ? deriveDubSrc(chapter.src, this.audioLang) : null);
        this.dubAvailable = !!dubSrc;
        if (this.dubAudio && dubSrc !== this.dubAudio.getAttribute('src')) {
            this.dubAudio.pause();
            if (dubSrc) {
                this.dubAudio.src = dubSrc;
                this.dubAudio.load();
            } else {
                this.dubAudio.removeAttribute('src');
            }
        }
        this.updateDubButton();

        if (chapter.src !== this.chapterSrc) {
            this.chapterSrc = chapter.src;
            this.video.src = chapter.src;
            this.video.load();
            this.video.addEventListener('loadedmetadata', startPlayback, { once: true });
        } else {
            startPlayback();
        }
        // play 이벤트가 오면 applyDub가 다시 불리지만, 그 전(정지 상태)의 muted도
        // 이 챕터 기준으로 맞춰 둔다 — 더빙 없는 챕터로 넘어오면 <video> 소리가 바로 살아야 한다.
        this.applyDub();

        // <video>는 챕터가 바뀌어도 계속 재사용하므로, 이전 챕터의 자막 리스너를
        // 반드시 떼어낸다 — 안 그러면 탭을 옮길 때마다 리스너와 cue 배열이 쌓인다.
        if (this.detachSubtitles) { this.detachSubtitles(); this.detachSubtitles = null; }
        if (this.subtitleEl) this.subtitleEl.remove();
        const subtitleEl = document.createElement('div');
        subtitleEl.className = 'video-subtitle';
        subtitleEl.hidden = !this.subtitlesOn;   // 챕터를 넘어가도 껐던 상태를 유지
        this.stage.appendChild(subtitleEl);
        this.subtitleEl = subtitleEl;

        const subtitleSrc = chapter.subtitle
            || (this.subLang ? deriveSubtitleSrc(chapter.src, this.subLang) : null);
        if (subtitleSrc) {
            this.detachSubtitles =
                driveSubtitles(this.video, subtitleSrc, subtitleEl, () => this.chapterStart);
        }

        this.chapterButtonsEl?.querySelectorAll('.chapter-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
        });
    }

    // 같은 파일을 공유하는 챕터들 사이에서 "이 챕터가 어디서 끝나는가"를 계산한다.
    getChapterEnd() {
        const chapter = this.chapters[this.chapterIndex];
        if (!chapter) return this.video?.duration || 0;   // chapters가 비어 있는 설정 방어
        if (chapter.end != null) return chapter.end;
        const next = this.chapters[this.chapterIndex + 1];
        if (next && next.src === chapter.src) return next.start || 0;
        return this.video.duration || Infinity;
    }

    buildControls() {
        // 미니게임과 같은 픽셀 프레임 패널(.frame-box) 안에 컨트롤을 담는다.
        const panel = document.createElement('div');
        panel.className = 'frame-box video-controls';

        const row = document.createElement('div');
        row.className = 'video-controls-row';

        const backBtn = document.createElement('button');
        backBtn.className = 'video-skip-btn video-jump-btn';
        backBtn.textContent = '-10';
        backBtn.setAttribute('aria-label', '10초 뒤로');
        backBtn.addEventListener('click', () => this.seekBy(-10));

        const seek = document.createElement('input');
        seek.type = 'range';
        seek.className = 'video-seek';
        // 정수 스텝 고정 해상도(0~1000) — 챕터 구간 길이를 그대로 max로 쓰면 초
        // 단위 step에 맞물려 탐색 입자가 거칠어지므로, 항상 이 스케일로 환산한다.
        seek.min = 0;
        seek.max = 1000;
        seek.value = 0;
        // 잡고 있는 동안 timeupdate가 손잡이를 되돌리지 못하게 표시해 둔다.
        // 놓는 지점이 슬라이더 밖일 수 있어 해제는 window에서 받는다.
        seek.addEventListener('pointerdown', () => { this.seeking = true; });
        window.addEventListener('pointerup', () => { this.seeking = false; });
        seek.addEventListener('change', () => { this.seeking = false; });

        seek.addEventListener('input', () => {
            if (!this.video) return;
            const span = this.getChapterEnd() - this.chapterStart;
            if (!(span > 0)) return;
            const frac = Number(seek.value) / 1000;
            this.video.currentTime = this.chapterStart + frac * span;
            this.updateSeekUI();   // 탐색이 끝나기 전에도 막대가 즉시 따라오게
        });
        this.seekEl = seek;

        const fwdBtn = document.createElement('button');
        fwdBtn.className = 'video-skip-btn video-jump-btn';
        fwdBtn.textContent = '+10';
        fwdBtn.setAttribute('aria-label', '10초 앞으로');
        fwdBtn.addEventListener('click', () => this.seekBy(10));

        const time = document.createElement('span');
        time.className = 'video-time';
        time.textContent = '0:00 / 0:00';
        this.timeEl = time;

        row.append(backBtn, seek, fwdBtn, time);

        // 볼륨 묶음: 뮤트 버튼(공용 UIMuteButton) + 볼륨 바 + 현재 값(%)
        const volumeGroup = document.createElement('div');
        volumeGroup.className = 'video-volume-group';

        // 미니게임(balance)과 동일한 공용 버튼 — 아이콘/토글 상태를 스스로 관리한다.
        this.muteBtn = new UIMuteButton({
            parent: volumeGroup,
            onToggle: (muted) => this.setMuted(muted),
        });

        const volume = document.createElement('input');
        volume.type = 'range';
        volume.className = 'video-volume';
        volume.min = 0;
        // gainNode가 없으면(WebAudio 연결 실패) 100%가 한계 — 있으면 200%까지 증폭.
        volume.max = this.gainNode ? 200 : 100;
        volume.value = 100;
        volume.setAttribute('aria-label', '음량');
        volume.addEventListener('input', () => this.setVolume(Number(volume.value)));
        this.volumeEl = volume;

        const volumeValue = document.createElement('span');
        volumeValue.className = 'video-volume-value';
        this.volumeValueEl = volumeValue;

        volumeGroup.append(volume, volumeValue);
        row.appendChild(volumeGroup);

        // 자막 켜기/끄기. 키트에 자막 아이콘이 없어 글자 버튼으로 두고, 켜진 상태를
        // 챕터 탭과 같은 .active 표시로 알린다.
        if (this.hasSubtitles()) {
            const subBtn = document.createElement('button');
            subBtn.className = 'video-skip-btn video-subtitle-btn active';
            subBtn.textContent = '자막';
            subBtn.setAttribute('aria-label', '자막 켜기/끄기');
            subBtn.setAttribute('aria-pressed', 'true');
            subBtn.addEventListener('click', () => this.toggleSubtitles());
            this.subtitleBtn = subBtn;
            row.appendChild(subBtn);
        }

        // 더빙 켜기/끄기. 자막 버튼과 같은 글자 토글. 음원이 없는 챕터에서는 자리만 남기고 감춘다.
        if (this.hasDub()) {
            const dubBtn = document.createElement('button');
            dubBtn.className = 'video-skip-btn video-dub-btn';
            dubBtn.textContent = '더빙';
            dubBtn.setAttribute('aria-label', '더빙 켜기/끄기');
            dubBtn.setAttribute('aria-pressed', 'false');
            dubBtn.addEventListener('click', () => this.toggleDub());
            this.dubBtn = dubBtn;
            row.appendChild(dubBtn);
        }

        panel.appendChild(row);
        this.controlsHost.appendChild(panel);
        this.applyVolume(100); // 초기 상태 동기화 — 사용자 제스처가 아니므로 resume은 안 부름

        if (this.chapters.length > 1) {
            const tabs = document.createElement('div');
            tabs.className = 'chapter-tabs';

            this.chapters.forEach((ch, i) => {
                const btn = document.createElement('button');
                btn.className = 'chapter-btn';
                if (i === 0) btn.classList.add('active');

                if (ch.title) {
                    const t = document.createElement('span');
                    t.className = 'chapter-title';
                    t.textContent = ch.title;
                    btn.appendChild(t);
                }
                if (ch.body) {
                    const b = document.createElement('span');
                    b.className = 'chapter-body';
                    b.textContent = ch.body;
                    btn.appendChild(b);
                }

                btn.addEventListener('click', () => { this.resumeAudio(); this.loadChapter(i); });
                tabs.appendChild(btn);
            });

            panel.appendChild(tabs);
            this.chapterButtonsEl = tabs;
        }
    }

    updateSeekUI() {
        if (!this.video || !this.video.duration) return;
        const span = this.getChapterEnd() - this.chapterStart;
        if (!(span > 0)) return;

        const pos = Math.min(Math.max(this.video.currentTime - this.chapterStart, 0), span);

        // 잡고 있는 동안엔 손잡이를 사용자가 둔 자리에 그대로 둔다 — 탐색이 끝나기
        // 전에 timeupdate가 먼저 오면 이전 위치로 되돌려서 손잡이가 튕긴다.
        if (!this.seeking) this.seekEl.value = Math.round((pos / span) * 1000);

        const pct = (Number(this.seekEl.value) / 1000) * 100;
        this.seekEl.style.backgroundImage =
            `linear-gradient(to right, var(--bar-fill) ${pct}%, var(--bar-track) ${pct}%)`;

        this.timeEl.textContent = `${formatTime(pos)} / ${formatTime(span)}`;
    }
}

// 관례: "<dir>/<file>.<ext>" 영상의 <lang> 더빙 음원은 "<dir>/<lang>/<file>.m4a"에 있다
// (자막의 deriveSubtitleSrc와 같은 규칙, 확장자만 다름).
function deriveDubSrc(videoSrc, lang) {
    return videoSrc.replace(/\/([^/]+)\.[^.]+$/, `/${lang}/$1.m4a`);
}

function formatTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}
