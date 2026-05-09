const AniStory = {
    title: "환세 시리즈 부분 컷",
    defaultSubLang: "ko",
    scenes: [
        { id: "main", type: "video", src: "ani/ani_orig.mp4", autoAdvance: false },
    ]
};

SceneViewer.register('ani', AniStory);
