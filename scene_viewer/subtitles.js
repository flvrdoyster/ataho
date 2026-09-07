// SceneViewer(분기 비주얼노벨 엔진)와 VideoPlayer(단일 영상 플레이어)가 함께 쓰는
// 자막 처리. <track>에 기대지 않고 VTT를 직접 파싱해 timeupdate로 동기화한다 —
// iOS Safari는 'hidden' 트랙에서 cuechange를 아예 쏘지 않아 데스크탑에선 되는
// 네이티브 방식이 모바일에서만 자막이 안 뜨는 문제가 있다.

function parseVtt(text) {
    const toSec = (ts) => ts.trim().split(':').reduce((acc, p) => acc * 60 + parseFloat(p), 0);
    const cues = [];
    const blocks = text.replace(/\r/g, '').split(/\n\n+/);
    for (const block of blocks) {
        const lines = block.split('\n').filter(l => l.length);
        const tIdx = lines.findIndex(l => l.includes('-->'));
        if (tIdx === -1) continue; // header / NOTE / empty block
        const [rawStart, rest] = lines[tIdx].split('-->');
        if (rest === undefined) continue;
        const start = toSec(rawStart);
        const end = toSec(rest.trim().split(/\s/)[0]); // drop cue settings after end ts
        const textLines = lines.slice(tIdx + 1);
        if (!textLines.length) continue;
        cues.push({ start, end, text: textLines.join('\n') });
    }
    return cues;
}

// 관례: "<dir>/<file>.<ext>" 영상의 <lang> 자막은 "<dir>/<lang>/<file>.vtt"에 있다.
function deriveSubtitleSrc(videoSrc, lang) {
    return videoSrc.replace(/\/([^/]+)\.[^.]+$/, `/${lang}/$1.vtt`);
}

// VTT를 가져와 파싱한 뒤, video의 currentTime을 기준으로 overlayEl의 텍스트를 갱신한다.
// getOffset: cue 시간이 영상의 currentTime과 어긋나 있을 때(예: 여러 챕터가 파일 하나를
// 공유하고 자막은 각 챕터 0초부터 시작하는 상대시간인 경우) currentTime에서 뺄 값을
// 반환하는 함수 — 생략하면 0(자막이 영상 전체의 절대시간을 그대로 따르는 기본 경우).
// 반환값은 해제 함수 — 같은 <video>에 자막을 갈아끼우는 쪽(VideoPlayer의 챕터
// 전환)은 이걸 호출해야 이전 자막의 timeupdate 리스너와 cue 배열이 남지 않는다.
// 씬마다 <video>를 새로 만드는 SceneViewer는 그냥 무시해도 된다.
function driveSubtitles(video, vttSrc, overlayEl, getOffset) {
    let handler = null;
    let cancelled = false;

    fetch(vttSrc)
        .then(r => (r.ok ? r.text() : Promise.reject(r.status)))
        .then(text => {
            if (cancelled) return;
            const cues = parseVtt(text);
            if (!cues.length) return;
            let lastIdx = -1;
            handler = () => {
                const t = video.currentTime - (getOffset ? getOffset() : 0);
                let idx = -1;
                for (let i = 0; i < cues.length; i++) {
                    if (t >= cues[i].start && t < cues[i].end) { idx = i; break; }
                }
                if (idx === lastIdx) return; // 바뀔 때만 DOM 건드림
                lastIdx = idx;
                overlayEl.textContent = idx >= 0 ? cues[idx].text : '';
            };
            video.addEventListener('timeupdate', handler);
        })
        .catch(() => { /* 해당 씬/언어에 자막 파일이 없음 */ });

    return () => {
        cancelled = true;   // 아직 fetch 중이면 리스너를 붙이지 않게
        if (handler) {
            video.removeEventListener('timeupdate', handler);
            handler = null;
        }
    };
}
