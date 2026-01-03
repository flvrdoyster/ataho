// 라이트박스(이미지/비디오 레이어) 관련 요소들
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxVideo = document.getElementById('lightbox-video');
const lightboxTrack = document.getElementById('lightbox-track');
const lightboxCaption = document.getElementById('lightbox-caption');
const closeBtn = document.querySelector('#lightbox .close');

/**
 * 브라우저 해시 값에 따라 라이트박스 내용을 업데이트
 */
const hash = window.location.hash.substring(1);
// Simple security/validation: allow resource/img and resource/mov paths
if (hash && (hash.startsWith('resource/img/') || hash.startsWith('resource/mov/'))) {
    const isVideo = hash.endsWith('.mp4');

    // Determine caption text: Try to find a link with this hash and get its data-caption
    const activeLink = document.querySelector(`a[href="#${hash}"]`);
    const captionText = activeLink ? activeLink.getAttribute('data-caption') : hash.split('/').pop();

    if (isVideo) {
        // Video Mode
        lightboxImg.style.display = 'none';
        lightboxVideo.style.display = 'block';
        lightboxVideo.src = hash;

        // Subtitle handling (Blob for CORS safety)
        let vttContent = null;
        const subtitleKey = activeLink ? activeLink.getAttribute('data-subtitle') : null;

        if (subtitleKey) {
            // 1. Try specified subtitle key
            vttContent = window.SUBTITLES ? window.SUBTITLES[subtitleKey] : null;
        }

        if (!vttContent) {
            // 2. Generic fallback: try replacing extension
            const vttName = hash.replace('.mp4', '.vtt').split('/').pop();
            vttContent = window.SUBTITLES ? window.SUBTITLES[vttName] : null;
        }

        if (vttContent) {
            const blob = new Blob([vttContent], { type: 'text/vtt' });
            lightboxTrack.src = URL.createObjectURL(blob);
        } else {
            // Fallback to file path just in case
            if (subtitleKey) {
                lightboxTrack.src = 'resource/mov/' + subtitleKey; // Assumption: subtitles are in same dir roughly or relative
            } else {
                lightboxTrack.src = hash.replace('.mp4', '.vtt');
            }
        }

        // 자막 트랙 설정
        const setupTrack = () => {
            if (lightboxTrack.track) {
                lightboxTrack.track.mode = 'showing';

                // 자막 끄기 방지 (보여짐 상태 강제)
                lightboxTrack.track.addEventListener('modechange', () => {
                    if (lightboxTrack.track.mode !== 'showing') {
                        lightboxTrack.track.mode = 'showing';
                    }
                });

                // 트랙 리스트 변경 시에도 체크
                lightboxVideo.textTracks.onchange = () => {
                    if (lightboxTrack.track.mode !== 'showing') {
                        lightboxTrack.track.mode = 'showing';
                    }
                };
            }
        };
        lightboxVideo.addEventListener('loadedmetadata', setupTrack, { once: true });
        if (lightboxTrack.track) setupTrack();

        lightboxCaption.textContent = hash.split('/').pop();
        lightbox.classList.add('active');

        // Optional: Auto-play if desired, but controls are safer
        // lightboxVideo.play();
    } else if (hash.endsWith('.png') || hash.endsWith('.jpg') || hash.endsWith('.gif')) {
        // Image Mode
        lightboxVideo.style.display = 'none';
        lightboxImg.style.display = 'block';
        lightboxVideo.pause();

        lightboxImg.src = hash;
        lightboxCaption.textContent = hash.split('/').pop();
        lightbox.classList.add('active');
    } else {
        lightbox.classList.remove('active');
        lightboxVideo.pause();
    }
} else {
    lightbox.classList.remove('active');
    lightboxVideo.pause();
}

/**
 * 라이트박스 닫기
 */
function closeLightbox() {
    // 해시 제거 및 뷰 업데이트
    history.pushState("", document.title, window.location.pathname + window.location.search);
    updateView();
}

// 이벤트 리스너 등록
if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
if (lightbox) {
    lightbox.addEventListener('click', (e) => {
        // 배경 클릭 시 닫기
        if (e.target === lightbox) closeLightbox();
    });
}
document.addEventListener('keydown', (e) => {
    // ESC 키로 닫기
    if (e.key === 'Escape') closeLightbox();
});

// 해시 변경 및 로드 시 초기화
window.addEventListener('hashchange', updateView);
window.addEventListener('DOMContentLoaded', updateView);
