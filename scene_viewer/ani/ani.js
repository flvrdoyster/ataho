// 챕터별로 쪼개진 영상. src마다 파일이 다르니 start는 필요 없고(기본값 0),
// 자막도 subLang 관례(<dir>/<lang>/<file>.vtt)로 그대로 유도된다 — video_player.js 참고.
VideoPlayer.register('ani', {
    title: "환세 시리즈 부분 컷",
    subLang: "ko",
    chapters: [
        { title: "그런 계절",     body: "화린 · 키리 · 스마슈",          src: "ani/01_sonna_kisetsu.mp4" },
        { title: "싱크로",        body: "눈썹 개 · 유리와카마루 · 스마슈", src: "ani/02_synchro.mp4" },
        { title: "본능",          body: "키리 · 스마슈 · 화린",          src: "ani/03_honnou.mp4" },
        { title: "쿠킹 DE GO!",   body: "린샹 · 스마슈 · 아타호(?)",     src: "ani/04_cooking_de_go.mp4" },
        { title: "물가의 사랑",   body: "린샹 · 아타호",                src: "ani/05_mizugiwa_no_koi.mp4" },
    ],
});
