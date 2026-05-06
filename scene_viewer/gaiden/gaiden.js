const GaidenStory = {
    title: "gaiden",
    interactive: true,
    defaultLang: "ja",
    langPaths: {
        ja: "gaiden/mov_ja/",
        ko: "gaiden/mov_ko/",
    },
    scenes: [
        { id: "title", type: "title", background: { image: "gaiden/title-bg.png" },
            idleIcon: "gaiden/title-idle.png",
            choices: [
                { icon: "gaiden/title-1.png", lang: "ja", target: "1-0", label: "일본어 음성으로 본다!!" },
                { icon: "gaiden/title-2.png", lang: "ko", target: "1-0", label: "한국어 더빙으로 볼래" },
            ]
        },

        { id: "1-0",   type: "video", src: "1-0.mp4",   next: "choice-1" },

        { id: "choice-1", type: "choice", background: { image: "gaiden/1-1-sel.png" }, overlay: true, choices: [
            { label: "곧장 나아간다",       target: "1-1-a" },
            { label: "닥치는 대로 간다", target: "1-1-b" },
        ]},

        { id: "1-1-a", type: "video", src: "1-1-a.mp4", next: "choice-2" },
        { id: "1-1-b", type: "video", src: "1-1-b.mp4", next: "choice-2" },

        { id: "choice-2", type: "choice", background: { image: "gaiden/1-2-sel.png" }, overlay: true, choices: [
            { label: "둘도 나뉘어 간다", target: "1-2-a" },
            { label: "함께 나아간다",   target: "1-2-b" },
        ]},

        { id: "1-2-a", type: "video", src: "1-2-a.mp4", next: "2-0" },
        { id: "1-2-b", type: "video", src: "1-2-b.mp4", next: "2-0" },

        { id: "2-0",   type: "video", src: "2-0.mp4",   next: "choice-3" },

        { id: "choice-3", type: "choice", background: { image: "gaiden/2-1-sel.png" }, overlay: true, choices: [
            { label: "벤다!",      target: "2-1-a" },
            { label: "멍하니 있는다", target: "2-1-b" },
        ]},

        { id: "2-1-a", type: "video", src: "2-1-a.mp4", next: "title" },
        { id: "2-1-b", type: "video", src: "2-1-b.mp4", next: "title" },
    ]
};

SceneViewer.register('gaiden', GaidenStory);

SceneViewer.registerRenderer('title', function(scene) {
    let focusedIndex = 0;
    const currentSrcs = [];

    const setSize = (img) => {
        if (img.naturalWidth) {
            img.width = img.naturalWidth * 2;
            img.height = img.naturalHeight * 2;
        }
    };

    const container = document.createElement('div');
    container.className = 'title-menu';

    const wrappers = [];
    const icons = scene.choices.map((choice, i) => {
        const src = i === focusedIndex ? choice.icon : scene.idleIcon;
        currentSrcs[i] = src;

        const wrapper = document.createElement('div');
        wrapper.className = 'title-choice' + (i === focusedIndex ? ' active' : '');
        wrappers.push(wrapper);

        const img = document.createElement('img');
        img.className = 'title-icon';
        img.src = src;
        img.addEventListener('load', () => setSize(img), { once: true });
        wrapper.appendChild(img);

        if (choice.label) {
            const label = document.createElement('span');
            label.className = 'title-label';
            label.textContent = choice.label;
            wrapper.appendChild(label);
        }

        wrapper.addEventListener('mouseenter', () => { focusedIndex = i; updateIcons(); });
        wrapper.addEventListener('click', (e) => { e.stopPropagation(); focusedIndex = i; confirm(); });
        container.appendChild(wrapper);
        return img;
    });

    this.stage.appendChild(container);

    const updateIcons = () => {
        icons.forEach((img, i) => {
            const src = i === focusedIndex ? scene.choices[i].icon : scene.idleIcon;
            if (currentSrcs[i] !== src) {
                currentSrcs[i] = src;
                img.src = src;
                img.addEventListener('load', () => setSize(img), { once: true });
            }
            wrappers[i].classList.toggle('active', i === focusedIndex);
        });
    };

    const confirm = () => {
        const choice = scene.choices[focusedIndex];
        if (choice.lang) this.lang = choice.lang;
        if (choice.target) this.goToScene(choice.target);
    };

    this.choiceKeyHandler = (e) => {
        if (e.code === 'ArrowDown') {
            e.preventDefault();
            focusedIndex = (focusedIndex + 1) % scene.choices.length;
            updateIcons();
        } else if (e.code === 'ArrowUp') {
            e.preventDefault();
            focusedIndex = (focusedIndex - 1 + scene.choices.length) % scene.choices.length;
            updateIcons();
        } else if (e.code === 'Enter' || e.code === 'Space') {
            confirm();
        }
    };
    document.addEventListener('keydown', this.choiceKeyHandler);
});
