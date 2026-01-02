class SceneViewer {
    constructor(stageSelector) {
        this.stage = document.querySelector(stageSelector);
        this.currentStory = null;
        this.currentSceneIndex = -1;
        this.isPlaying = false;

        // Bind input
        this.stage.addEventListener('click', () => this.handleInput());
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' || e.code === 'Enter') this.handleInput();
        });
    }

    loadStory(story) {
        this.currentStory = story;
        this.currentSceneIndex = 0;
        console.log("Loaded Story:", story.title);
        this.renderScene();
    }

    renderScene() {
        if (!this.currentStory) return;

        const scene = this.currentStory.scenes[this.currentSceneIndex];
        if (!scene) {
            console.log("End of Story");
            return; // End
        }

        console.log("Rendering Scene:", this.currentSceneIndex, scene.type);
        this.stage.innerHTML = ''; // Clear stage

        // 1. Background
        if (scene.background) {
            this.stage.style.backgroundColor = scene.background.color || '#000';
            if (scene.background.image) {
                const bgImg = document.createElement('img');
                bgImg.src = scene.background.image;
                bgImg.className = 'layer background fit-cover';
                this.stage.appendChild(bgImg);
            }
        }

        // 1.5 Visuals (Sprites or Simple Image)
        if (scene.sprites && scene.sprites.length > 0) {
            // Container for centered, layered sprites
            const centerStage = document.createElement('div');
            centerStage.className = 'center-stage layer content';

            scene.sprites.forEach(spriteDef => {
                const img = document.createElement('img');
                img.src = spriteDef.src;
                img.className = 'sprite';

                // Add optional custom classes for animation (e.g. 'shake', 'fade-in')
                if (spriteDef.classes) {
                    if (Array.isArray(spriteDef.classes)) {
                        img.classList.add(...spriteDef.classes);
                    } else {
                        img.classList.add(spriteDef.classes);
                    }
                }

                // Inline styles for fine-tuning
                if (spriteDef.style) Object.assign(img.style, spriteDef.style);

                centerStage.appendChild(img);
            });
            this.stage.appendChild(centerStage);

        } else if (scene.centerImage) {
            // Legacy/Simple support
            const cImg = document.createElement('img');
            cImg.src = scene.centerImage;
            cImg.className = 'center-image layer content';
            this.stage.appendChild(cImg);
        }

        // 2. Content based on Type
        if (scene.type === 'text' || scene.type === 'image_text') {
            this.renderTextScene(scene);
        } else if (scene.type === 'staff_roll') {
            this.renderStaffRoll(scene);
        }
    }

    renderTextScene(scene) {
        // If there's dialogue text
        if (scene.text) {
            const box = document.createElement('div');
            box.className = 'dialogue-box';
            box.innerHTML = scene.text.replace(/\n/g, '<br>'); // Support line breaks
            this.stage.appendChild(box);
        }
    }

    renderStaffRoll(scene) {
        // Container for scrolling text
        const rollContainer = document.createElement('div');
        rollContainer.className = 'staff-roll';

        // Build HTML from text content
        scene.content.forEach(section => {
            const secDiv = document.createElement('div');
            secDiv.className = 'staff-section';

            if (section.title) {
                const h = document.createElement('div');
                h.className = 'staff-title';
                h.textContent = section.title;
                secDiv.appendChild(h);
            }
            if (section.text) {
                const p = document.createElement('div');
                p.className = 'staff-name';
                p.style.whiteSpace = 'pre-wrap'; // Preserve newlines
                p.textContent = section.text;
                secDiv.appendChild(p);
            }
            rollContainer.appendChild(secDiv);
        });

        this.stage.appendChild(rollContainer);

        // Animation logic
        // Start from bottom of stage, move to top
        const startY = 600; // stage height
        const endY = -1 * (rollContainer.scrollHeight || 2000); // Approximate if not rendered yet

        // Use Web Animations API
        const anim = rollContainer.animate([
            { transform: `translateY(${startY}px)` },
            { transform: `translateY(-100%)` }
        ], {
            duration: scene.duration || 30000,
            easing: 'linear',
            fill: 'forwards'
        });

        anim.onfinish = () => {
            // Auto advance after credits
            this.nextScene();
        };
    }

    handleInput() {
        const scene = this.currentStory.scenes[this.currentSceneIndex];
        // If staff roll, maybe speed up? For now, just skip or let it finish.
        // If text scene, advance.

        if (scene.type !== 'staff_roll') {
            this.nextScene();
        }
    }

    nextScene() {
        if (this.currentSceneIndex < this.currentStory.scenes.length - 1) {
            this.currentSceneIndex++;
            this.renderScene();
        } else {
            console.log("Story Finished");
            // Optional: Show replay button
        }
    }
}

// Initialization Entry Point (from main.js)
window.addEventListener('DOMContentLoaded', () => {
    const viewer = new SceneViewer('#stage');

    // Check if Global Story is loaded
    if (typeof KaisinEndingStory !== 'undefined') {
        viewer.loadStory(KaisinEndingStory);
    } else {
        console.error("Story data not found!");
    }

    document.getElementById('btn-restart').addEventListener('click', () => {
        viewer.loadStory(KaisinEndingStory);
    });
});
