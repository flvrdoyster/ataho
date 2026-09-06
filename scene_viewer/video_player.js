// 챕터(클립) 단위로 재생하는 플레이어. "장면 뷰어"(SceneViewer)는 분기·선택지·
// 스프라이트·스탭롤까지 갖춘 비주얼노벨 엔진인데, 영상만 갈아끼우며 보는
// 스토리(ani)는 그 기능을 하나도 안 쓰면서 엔진에 얹혀 있었다. 이 클래스는 그
// 경우만을 위한 것 — 챕터 탭 + 탐색바(현재 챕터 구간 기준) + ±10초 + 자막.
//
// 챕터는 { title, body, src, start=0, end?, subtitle? } 하나하나가 재생 단위다.
// 여러 챕터가 같은 src를 공유하면 start/end로 그 안의 구간을 나눈 것이고(지금의
// ani처럼 아직 영상이 안 쪼개진 상태), 서로 다른 src를 쓰면 완전히 별개의 클립이다
// (쪼개진 뒤의 상태) — 두 경우를 같은 코드로 다룬다: end를 안 주면 "다음 챕터가
// 같은 파일이면 그 시작 지점까지, 아니면(파일이 다르거나 마지막 챕터) 이 파일
// 끝까지"로 계산하므로, 영상을 쪼갠 뒤엔 각 챕터의 src만 바꾸고 start/end를
// 지우면(기본값 0 / 파일 끝) 그대로 맞는다.
//
// 자막(VTT) 파싱/동기화는 subtitles.js를 공유한다 (SceneViewer도 같은 걸 쓴다).
// 컨트롤 외형은 미니게임과 같은 공용 픽셀 UI 키트(world/ui.css)를 따르고, 음소거
// 버튼은 그 키트의 UIMuteButton(world/ui.js)을 그대로 쓴다 — 아이콘을 따로 만들지 않는다.
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
        this.seekEl = null;
        this.timeEl = null;
        this.chapterButtonsEl = null;
        this.muteBtn = null;
        this.volumeEl = null;
        this.volumeValueEl = null;
        this.audioCtx = null;
        this.gainNode = null; // WebAudio 연결에 성공했을 때만 존재 — 100% 너머 증폭용

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
        this.stage.innerHTML = '';
        this.controlsHost.innerHTML = '';

        const video = document.createElement('video');
        video.className = 'scene-video';
        video.playsInline = true;
        video.addEventListener('click', () => this.togglePlay());
        video.addEventListener('timeupdate', () => this.updateSeekUI());
        video.addEventListener('ended', () => this.onChapterEnded());
        this.stage.appendChild(video);
        this.video = video;

        this.setupAudioBoost(video);
        this.buildControls();
        this.loadChapter(0);
    }

    // <video>를 WebAudio 그래프에 물려 GainNode로 100%(원본 볼륨) 너머까지 증폭할
    // 수 있게 한다 — 원본보다 조용하게 인코딩된 클립을 볼륨 슬라이더만으로는
    // (네이티브 volume은 0~1, 즉 최대 100%가 한계라) 못 키우는 문제 대응.
    // 실패하면(구형 브라우저 등) this.gainNode가 없는 채로 그냥 <video>의 기본
    // 오디오 출력이 그대로 살아있으니, 슬라이더는 0~100%로만 동작한다.
    setupAudioBoost(video) {
        // file://로 열면 미디어가 불투명 출처로 취급돼, WebAudio 그래프를 타는 순간
        // 소리가 통째로 무음이 된다 — 예외도 안 던지므로 아래 try/catch로도 못 잡는다.
        // 이 사이트는 서버 없이 파일을 직접 열어 확인하는 걸 원칙으로 하므로, 그
        // 경우엔 증폭을 포기하고 네이티브 오디오를 그대로 쓴다(슬라이더 0~100%).
        if (window.location && window.location.protocol === 'file:') return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContextClass();
            const source = ctx.createMediaElementSource(video);
            const gain = ctx.createGain();
            source.connect(gain);
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

    // UIMuteButton이 자기 아이콘 상태를 직접 관리하므로, 여기선 <video>에만 반영한다.
    setMuted(muted) {
        if (!this.video) return;
        this.resumeAudio();
        this.video.muted = muted;
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
            this.volumeEl.style.background = `${tickLayer}, ${fillLayer}`;
        } else {
            this.volumeEl.style.background = fillLayer;
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

        if (chapter.src !== this.chapterSrc) {
            this.chapterSrc = chapter.src;
            this.video.src = chapter.src;
            this.video.load();
            this.video.addEventListener('loadedmetadata', startPlayback, { once: true });
        } else {
            startPlayback();
        }

        // <video>는 챕터가 바뀌어도 계속 재사용하므로, 이전 챕터의 자막 리스너를
        // 반드시 떼어낸다 — 안 그러면 탭을 옮길 때마다 리스너와 cue 배열이 쌓인다.
        if (this.detachSubtitles) { this.detachSubtitles(); this.detachSubtitles = null; }
        if (this.subtitleEl) this.subtitleEl.remove();
        const subtitleEl = document.createElement('div');
        // video-subtitle: 이 플레이어 전용 표시(폰트·반투명 박스). scene_viewer.css의
        // .subtitle-overlay는 kaisin/gaiden도 함께 쓰므로 거기선 건드리지 않는다.
        subtitleEl.className = 'subtitle-overlay video-subtitle';
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
        seek.addEventListener('input', () => {
            if (!this.video) return;
            const span = this.getChapterEnd() - this.chapterStart;
            if (!(span > 0)) return;
            const frac = Number(seek.value) / 1000;
            this.video.currentTime = this.chapterStart + frac * span;
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
        const pct = (pos / span) * 100;

        this.seekEl.value = Math.round((pos / span) * 1000);
        this.seekEl.style.background =
            `linear-gradient(to right, var(--bar-fill) ${pct}%, var(--bar-track) ${pct}%)`;

        this.timeEl.textContent = `${formatTime(pos)} / ${formatTime(span)}`;
    }
}

function formatTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}
