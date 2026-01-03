const KaisinEndingStory = {
    title: "환세쾌진극 엔딩",
    scenes: [

        // 텍스트 속성 (Text Properties):
        // - 크기(textSize): 'large' (기본값은 보통)
        // - 가로 정렬(textAlign): 'left', 'center', 'right' (기본값 center)
        // - 세로 위치(verticalAlign): 'top', 'center', 'bottom' (기본값 bottom)
        // - 줄간격(lineHeight): 숫자 또는 문자열 (예: 1.5, '200%')
        // - 스프라이트 애니메이션(classes): 'anim-pulse', 'anim-bounce', 'anim-float', 'anim-move', 'anim-fall' 등 추가 가능
        // - 이동 애니메이션: 'anim-move' 사용 시 style에 --move-x, --move-y, --move-duration 지정
        // - 떨어지는 애니메이션: 'anim-fall' 사용 시 style에 --fall-x, --fall-y, --fall-duration, --fall-rotation 지정
        // - 다중 이미지 애니메이션: src에 이미지 경로 배열 입력 시 순차 표시 (fps로 속도 조절 가능)
        // - 여러 스프라이트: sprites 배열에 객체를 여러 개 추가하면 레이어처럼 쌓이며, style에 zIndex 지정도 가능합니다.
        // - 클리핑(clipSprites, clipHeight): 스프라이트가 특정 높이에서 사라지게 처리 (intro_13 참고)
        // - 표시 지연(spriteDelay): 스프라이트가 화면에 나타나는 시간(ms) 지연 (sc_staffroll 참고)
        // - 레이아웃 튜닝: padding, textAlign, verticalAlign 등을 통해 텍스트 위치 세밀 조정 가능

        {
            id: "intro_01", type: "image_text", centerImage: "kaisin/scene-1.png", imageOffset: { x: -32, y: 0 }, background: { color: "#000" }, text: "우오오오오오오!",
            sprites: [
                { src: "kaisin/ero-book.png", style: { top: "40px", left: "148px" }, classes: "anim-bounce" },
                {
                    src: ["kaisin/walk-1.png", "kaisin/walk-2.png"],
                    fps: 4,
                    classes: "anim-move",
                    style: {
                        top: "0px",
                        left: "256px",
                        "--move-x": "-10px",
                        "--move-y": "18px",
                        "--move-duration": "3s",
                        "--move-timing": "linear"
                    }
                }
            ]
        },
        {
            id: "intro_02", type: "image_text", centerImage: "kaisin/scene-1.png", imageOffset: { x: -32, y: 0 }, background: { color: "#000" }, text: [
                { text: "저, 저것이..", textAlign: "left" }, { text: "꿈속에서조차 보던 그...", textAlign: "right" }],
            sprites: [
                { src: "kaisin/ero-book.png", style: { top: "40px", left: "148px" }, classes: "anim-bounce" },
                {
                    src: ["kaisin/hooray-1.png", "kaisin/hooray-2.png"],
                    fps: 4,
                    classes: "anim-move",
                    style: {
                        top: "18px",
                        left: "246px",
                    }
                }
            ]
        },
        {
            id: "intro_03", type: "image_text", centerImage: "kaisin/scene-1.png", imageOffset: { x: -32, y: 0 }, background: { color: "#000" },
            sprites: [
                { src: "kaisin/wow.png", style: { width: "160px", top: "120px", left: "240px" } },
                { src: "kaisin/ero-book.png", style: { top: "40px", left: "148px" }, classes: "anim-bounce" },
                {
                    src: ["kaisin/hooray-1.png", "kaisin/hooray-2.png"],
                    fps: 4,
                    classes: "anim-move",
                    style: {
                        top: "18px",
                        left: "246px",
                    }
                }
            ],
            text: [
                { text: "전설의 에로책!!", textSize: "large" }
            ]
        },

        { id: "intro_04", type: "image_text", centerImage: "kaisin/scene-2.png", background: { color: "#000" }, text: "아오~~~~우" },

        { id: "intro_05", type: "image_text", centerImage: "kaisin/scene-3.png", background: { color: "#000" }, text: "그럼...\n제가 가져가겠습니~다!" },

        { id: "intro_06", type: "text", background: { color: "#000" }, text: [{ text: ". . . . .", textSize: "large", verticalAlign: "center" }] },
        { id: "intro_07", type: "text", background: { color: "#000" }, text: [{ text: ". . . 웃!", textSize: "large", verticalAlign: "center" }] },

        { id: "intro_08", type: "image_text", centerImage: "kaisin/scene-4.png", background: { color: "#000" }, text: ".. 어, 어라 ..\n전혀 야하지 않잖아!?" },
        { id: "intro_09", type: "image_text", centerImage: "kaisin/scene-4.png", background: { color: "#000" }, text: "....." },
        { id: "intro_10", type: "image_text", centerImage: "kaisin/scene-4.png", background: { color: "#000" }, text: ".....!!" },

        { id: "intro_11", type: "text", background: { color: "#000" }, text: [{ text: "서, 설마..", verticalAlign: "bottom" }] },
        { id: "intro_12", type: "text", background: { color: "#000" }, text: [{ text: "이건, 에로책이 아니라\n전설의...", verticalAlign: "bottom" }] },

        {
            id: "intro_13", type: "image_text", centerImage: "kaisin/scene-5.png", background: { color: "#000" }, text: "피에로책..!!",
            clipSprites: true,
            clipHeight: "240px", // Limits the container height so sprites disappear lower
            sprites: [
                {
                    src: "kaisin/ero-book-fall.png",
                    classes: "anim-fall",
                    style: {
                        top: "140px",
                        left: "120px",
                        "--fall-duration": "4s",
                        "--fall-y": "150px"
                    }
                }
            ]
        },

        {
            id: "sc_staffroll",
            type: "staff_roll",
            duration: 30000,
            spriteDelay: 4000,
            padding: "0 280px",
            background: { color: "#000" },
            spriteContainerClass: "custom-stage",
            containerStyle: {
                width: "320px",
                height: "224px",
                bottom: "50px",
                right: "50px"
            },
            zIndex: 100, // Text Layer Z-Index
            sprites: [
                // Base: 320x224
                { src: "kaisin/staffroll.png", style: { width: "100%", height: "100%", zIndex: 1 } },

                // Tail Sprite (16 frames)
                {
                    src: "kaisin/staffroll_sp1.png",
                    sheet: { frames: 16, fps: 6 },
                    style: {
                        width: "32px", height: "48px",
                        backgroundSize: "512px 48px",
                        zIndex: 2,
                        top: "124px", left: "160px"
                    }
                },
                // Lantern Sprite (4 frames)
                {
                    src: "kaisin/staffroll_sp2.png",
                    sheet: { frames: 4, fps: 2 },
                    style: {
                        width: "30px", height: "32px",
                        backgroundSize: "120px 32px",
                        zIndex: 3,
                        top: "80px", left: "42px"
                    }
                }
            ],
            labelAlign: "left",
            content: [
                { title: "환세쾌진극", text: "" },
                { text: "STAFF" },
                { label: "프로듀서", text: "키타노 후본" },
                { label: "프로그램", text: "와카" },
                { label: "그래픽", text: "얀가 하야시\n토마스 미즈노" },
                { label: "사운드", text: "누마타 이즈호" },
                { label: "스페셜 땡스", text: "도스고이 K오카\n세뇨르 카와키타\n우에미조\n갓츠 나카마츠\n사와타리 쥬사부로\n사토 대장\n와다 스키미\nYON\n미온\n나미헤이\n토베 요시" },
                { label: "디렉터", text: "미야모토 가쓰노리 (빨강)" },
                { label: "EX 프로듀서", text: "MOO 니이타니" }
            ]
        },


        { id: "epi_01", type: "text", background: { color: "#000" }, text: ".. 무슨 전설의 에로책이야..\n젠장..!! 히끅.." },
        { id: "epi_02", type: "text", background: { color: "#000" }, text: "「손님, 남쪽에 있는 탑의 소문은 \n들어 봤어?」" },
        { id: "epi_03", type: "text", background: { color: "#000" }, text: "어차피 시시한 헛소문이겠지?\n귀찮게 하지 말라고!! ... 우우우" },
        { id: "epi_04", type: "text", background: { color: "#000" }, text: "「.. 그 탑에는 말이야\n뭐든 다 비쳐 보인다는 \n『투시 안경』 이라는 게 \n있다는 모양이야」" },
        { id: "epi_05", type: "text", background: { color: "#000" }, text: ".. 뭐든지 비쳐 보이는.. !?" },
        { id: "epi_06", type: "text", background: { color: "#000" }, text: "그렇다는 건.. 그것만 있으면.. \n이것도.. 저것도..\n화린쨩도..!!\n.. 므흣 .." },
        { id: "epi_07", type: "text", background: { color: "#000" }, text: "아저씨!! 남쪽 탑이라고 했지!?\n『투시 안경』 그 녀석은 \n이 스마슈님이 받아가겠다!!" },
        { id: "epi_08", type: "image_text", centerImage: "kaisin/scene-6.png", background: { color: "#000" }, text: "우오오오오~~~옷!" },
        { id: "epi_09", type: "image_text", centerImage: "kaisin/scene-6.png", background: { color: "#000" }, text: "...끝" }
    ]
};

/**
 * Kaisin Story Initialization
 * Connects the general SceneViewer to the KaisinEndingStory data.
 */
window.addEventListener('DOMContentLoaded', () => {
    const viewer = new SceneViewer('#stage');

    // Check if Global Story is loaded
    if (typeof KaisinEndingStory !== 'undefined') {
        viewer.loadStory(KaisinEndingStory);
    } else {
        console.error("Story data not found!");
    }

});
