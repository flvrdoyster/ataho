const KaisinEndingStory = {
    title: "환세쾌진극 엔딩",
    scenes: [
        // --- Block 1: Scene 1 Image ---
        { id: "intro_01", type: "image_text", centerImage: "kaisin/scene-1.png", background: { color: "#000" }, text: "우오오오오오오!" },
        { id: "intro_02", type: "image_text", centerImage: "kaisin/scene-1.png", background: { color: "#000" }, text: "저, 저것이..\n꿈속에서조차 보던 그..." },
        { id: "intro_03", type: "image_text", centerImage: "kaisin/scene-1.png", background: { color: "#000" }, text: "전설의 에로책!!" },

        // --- Block 2: Scene 2 Image ---
        { id: "intro_04", type: "image_text", centerImage: "kaisin/scene-2.png", background: { color: "#000" }, text: "아오~~~~우" },
        { id: "intro_05", type: "image_text", centerImage: "kaisin/scene-2.png", background: { color: "#000" }, text: "그럼...\n제가 가져가겠습니~다!" },

        // --- Block 3: Scene 3 Image ---
        { id: "intro_06", type: "image_text", centerImage: "kaisin/scene-3.png", background: { color: "#000" }, text: "....." },
        { id: "intro_07", type: "image_text", centerImage: "kaisin/scene-3.png", background: { color: "#000" }, text: "... 웃!" },
        { id: "intro_08", type: "image_text", centerImage: "kaisin/scene-3.png", background: { color: "#000" }, text: ".. 어, 어라 ..\n전혀 안 야하잖아!?" },

        // --- Block 4: Scene 4 Image ---
        { id: "intro_09", type: "image_text", centerImage: "kaisin/scene-4.png", background: { color: "#000" }, text: "....." },
        { id: "intro_10", type: "image_text", centerImage: "kaisin/scene-4.png", background: { color: "#000" }, text: ".....!!" },
        { id: "intro_11", type: "image_text", centerImage: "kaisin/scene-4.png", background: { color: "#000" }, text: "서, 설마.." },
        { id: "intro_12", type: "image_text", centerImage: "kaisin/scene-4.png", background: { color: "#000" }, text: "이건, 에로책이 아니라\n전설의..." },

        // --- Block 5: Scene 5 Image ---
        { id: "intro_13", type: "image_text", centerImage: "kaisin/scene-5.png", background: { color: "#000" }, text: "피에로책..!!" },

        // --- Scene Staff Roll ---
        {
            id: "sc_staffroll",
            type: "staff_roll",
            duration: 25000,
            background: { color: "#000" },
            spriteContainerClass: "bottom-right-stage",
            sprites: [
                // Base: 320x224
                { src: "kaisin/staffroll.png", style: { width: "320px", height: "224px", zIndex: 1 } },

                // Tail: 512x48 total. 8 frames -> 64x48 each. horizontal.
                {
                    src: "kaisin/staffroll_sp1.png",
                    sheet: { frames: 8, duration: '1s', loop: true, direction: 'horizontal' },
                    style: { width: "64px", height: "48px", zIndex: 0, top: "150px", left: "10px" }
                },

                // Lantern: 125x32 total. 5 frames -> 25x32 each. horizontal.
                {
                    src: "kaisin/staffroll_sp2.png",
                    sheet: { frames: 5, duration: '1s', loop: true, direction: 'horizontal' },
                    style: { width: "25px", height: "32px", zIndex: 2, top: "20px", left: "200px" }
                }
            ],
            content: [
                { title: "환세쾌진극", text: "" },
                { title: "STAFF", text: "" },
                { title: "프로듀서", text: "키타노 후본" },
                { title: "프로그램", text: "와카" },
                { title: "그래픽", text: "얀가 하야시\n토마스 미즈노" },
                { title: "사운드", text: "누마타 이즈호" },
                { title: "스페셜 땡스", text: "도스고이 K오카\n세뇨르 카와키타\n우에미조\n갓츠 나카마츠\n사와타리 쥬사부로\n사토 대장\n와다 스키미\nYON\n미온\n나미헤이\n토베 요시" },
                { title: "디렉터", text: "미야모토 가쓰노리 (빨강)" },
                { title: "EX 프로듀서", text: "MOO 니이타니" }
            ]
        },

        // --- Epilogue: Scene 6 Image (All lines) ---
        { id: "epi_01", type: "text", background: { color: "#000" }, text: ".. 무슨 전설의 에로책이야..\n젠장..!! 히끅.." },
        { id: "epi_02", type: "text", background: { color: "#000" }, text: "「손님, 남쪽에 있는 탑의 소문은 \n들어 봤어?」" },
        { id: "epi_03", type: "text", background: { color: "#000" }, text: "어차피 시시한 헛소문이겠지?\n귀찮게 하지 말라고!! ... 우우우" },
        { id: "epi_04", type: "text", background: { color: "#000" }, text: "「.. 그 탑에는 말이야\n뭐든 다 비쳐 보인다는 \n『투시 안경』 이라는 게 \n있다는 모양이야」" },
        { id: "epi_05", type: "text", background: { color: "#000" }, text: ".. 뭐든지 비쳐 보이는.. !?" },
        { id: "epi_06", type: "text", background: { color: "#000" }, text: "그렇다는 건.. 그것만 있으면.. \n이것도.. 저것도..\n화린쨩도..!!\n.. 므흣 .." },
        { id: "epi_07", type: "text", background: { color: "#000" }, text: "아저씨!! 남쪽 탑이라고 했지!?\n『투시 안경』 그 녀석은 \n이 스마슈님이 받아가겠다!!" },
        { id: "epi_08", type: "image_text", centerImage: "kaisin/scene-6.png", background: { color: "#000" }, text: "우오오오오~~~옷!" },
        { id: "epi_09", type: "image_text", background: { color: "#000" }, text: "...끝" } // No image for "End"?
    ]
};
