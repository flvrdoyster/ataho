const AniStory = {
    title: "환세 시리즈 부분 컷",
    defaultSubLang: "ko",
    scenes: [
        { id: "main", type: "video", src: "ani/ani_orig.mp4", autoAdvance: false,
          chapters: [0, 113, 130, 186, 255] },
    ]
};

SceneViewer.register('ani', AniStory);
