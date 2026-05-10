const AniStory = {
    title: "환세 시리즈 부분 컷",
    defaultSubLang: "ko",
    scenes: [
        { id: "main", type: "video", src: "ani/ani_orig.mp4", autoAdvance: false,
          chapters: [0, 113, 130, 186, 255],
          chapterLabels: [
              { title: "그런 계절", body: "화린 ∙ 키리 ∙ 스마슈" },
              { title: "싱크로", body: "눈썹 개 ∙ 유리와카마루 ∙ 스마슈" },
              { title: "본능", body: "키리 ∙ 스마슈 ∙ 화린" },
              { title: "쿠킹 DE GO!", body: "린샹 ∙ 스마슈 ∙ 아타호(?)" },
              { title: "물가의 사랑", body: "린샹 ∙ 아타호" },
          ] },
    ]
};

SceneViewer.register('ani', AniStory);
