class SceneViewer {
    constructor(stageSelector) {
        this.stage = document.querySelector(stageSelector);
        this.currentStory = null;
        this.currentSceneIndex = -1;

        this.scrubber = document.getElementById('scene-scrubber');

        // Bind input
        this.stage.addEventListener('click', () => this.handleInput());
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return; // Prevent key repeat
            if (e.code === 'Space' || e.code === 'Enter') this.handleInput();
        });

        if (this.scrubber) {
            this.scrubber.addEventListener('input', (e) => {
                this.currentSceneIndex = parseInt(e.target.value, 10);
                this.renderScene();
            });
        }

        this.intervalIds = [];
        this.timeoutIds = [];
        this.lastInputTime = 0;
    }

    cleanup() {
        this.intervalIds.forEach(id => clearInterval(id));
        this.intervalIds = [];
        this.timeoutIds.forEach(id => clearTimeout(id));
        this.timeoutIds = [];
    }

    loadStory(story) {
        this.currentStory = story;
        this.currentSceneIndex = 0;

        if (this.scrubber) {
            this.scrubber.max = story.scenes.length - 1;
            this.scrubber.value = 0;
        }

        console.log("Loaded Story:", story.title);
        this.renderScene();
    }

    #applySpriteStyles(el, spriteDef) {
        if (!spriteDef.style) return;
        for (const [key, value] of Object.entries(spriteDef.style)) {
            if (key.startsWith('--')) el.style.setProperty(key, value);
            else el.style[key] = value;
        }
    }

    renderScene() {
        this.cleanup();
        if (!this.currentStory) return;

        // Sync scrubber
        if (this.scrubber) {
            this.scrubber.value = this.currentSceneIndex;
        }

        const scene = this.currentStory.scenes[this.currentSceneIndex];
        if (!scene) {
            console.log("End of Story");
            return; // End
        }

        console.log("Rendering Scene:", this.currentSceneIndex, scene.id, scene.type);
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

        // 1.5 Visuals (Base Image)
        if (scene.centerImage) {
            const cImg = document.createElement('img');
            cImg.src = scene.centerImage;
            cImg.className = 'center-image layer content';
            if (scene.imageOffset) {
                const x = scene.imageOffset.x || 0;
                const y = scene.imageOffset.y || 0;
                cImg.style.transform = `translate(calc(-50% + ${x}px), ${y}px)`;
            }
            this.stage.appendChild(cImg);
        }

        // 1.6 Visuals (Layered Sprites)
        if (scene.sprites && scene.sprites.length > 0) {
            // Container for centered, layered sprites
            const centerStage = document.createElement('div');
            centerStage.className = 'center-stage layer content';

            // Sprite Delay Handling
            if (scene.spriteDelay) {
                centerStage.style.visibility = 'hidden';
                const timeout = setTimeout(() => {
                    centerStage.style.visibility = 'visible';
                }, scene.spriteDelay);
                this.timeoutIds.push(timeout);
            }
            if (scene.spriteContainerClass) {
                centerStage.className = scene.spriteContainerClass + ' content';
            }
            if (scene.clipSprites) {
                centerStage.classList.add('clip-sprites');
            }
            if (scene.clipHeight) {
                centerStage.style.height = typeof scene.clipHeight === 'number' ? `${scene.clipHeight}px` : scene.clipHeight;
                // If explicit height is set, we might need to disable the default 50% from CSS or ensure it's overridden
                centerStage.style.maxHeight = 'none';
            }
            if (scene.containerStyle) {
                Object.assign(centerStage.style, scene.containerStyle);
            }

            scene.sprites.forEach(spriteDef => {
                let el;

                // 2. Sprite Sheet (Animated)
                if (spriteDef.sheet) {
                    el = document.createElement('div');
                    el.className = 'sprite sprite-sheet';

                    // Essential Styles
                    el.style.backgroundImage = `url('${spriteDef.src}')`;
                    el.style.backgroundRepeat = 'no-repeat';
                    el.style.imageRendering = 'pixelated';

                    // Apply styles
                    this.#applySpriteStyles(el, spriteDef);

                    // CSS Animation Setup
                    const frames = spriteDef.sheet.frames || 1;

                    // Duration: FPS takes priority, otherwise explicit duration, default 1000ms
                    let durationMs = 1000;
                    if (spriteDef.sheet.fps) {
                        durationMs = (frames / spriteDef.sheet.fps) * 1000;
                    } else if (spriteDef.sheet.duration) {
                        const d = spriteDef.sheet.duration;
                        durationMs = typeof d === 'string' ? parseFloat(d) : d;
                    }

                    const durationSeconds = durationMs / 1000;

                    const frameWidth = parseInt(el.style.width, 10);
                    const frameHeight = parseInt(el.style.height, 10);

                    if (!isNaN(frameWidth)) {
                        const totalWidth = frameWidth * frames;

                        // Ensure background size covers full strip
                        if (!el.style.backgroundSize) {
                            el.style.backgroundSize = `${totalWidth}px ${frameHeight || 'auto'}px`;
                        }

                        // Set CSS custom properties for the animation
                        el.style.setProperty('--sheet-frames', frames);
                        el.style.setProperty('--sheet-duration', `${durationSeconds}s`);
                        el.style.setProperty('--sheet-end-pos', `-${totalWidth}px`);

                        el.classList.add('sheet-anim');
                    }
                } else if (Array.isArray(spriteDef.src)) {
                    // 3. Image Sequence (Multi-file)
                    el = document.createElement('img');
                    el.src = spriteDef.src[0];
                    el.className = 'sprite';
                    el.style.imageRendering = 'pixelated';

                    // Sequence Animation
                    if (spriteDef.src.length > 1) {
                        let frameIndex = 0;
                        const fps = spriteDef.fps || 2; // Default 2 FPS
                        const interval = setInterval(() => {
                            frameIndex = (frameIndex + 1) % spriteDef.src.length;
                            el.src = spriteDef.src[frameIndex];
                        }, 1000 / fps);
                        this.intervalIds.push(interval);
                    }

                    // Inline styles (including CSS Variables)
                    this.#applySpriteStyles(el, spriteDef);
                } else {
                    // 1. Static Image
                    el = document.createElement('img');
                    el.src = spriteDef.src;
                    el.className = 'sprite';
                    el.style.imageRendering = 'pixelated';

                    // Inline styles (including CSS Variables)
                    if (spriteDef.style) {
                        for (const [key, value] of Object.entries(spriteDef.style)) {
                            if (key.startsWith('--')) el.style.setProperty(key, value);
                            else el.style[key] = value;
                        }
                    }
                }

                // Add optional custom classes
                if (spriteDef.classes) {
                    const classes = Array.isArray(spriteDef.classes) ? spriteDef.classes : [spriteDef.classes];
                    el.classList.add(...classes);
                }

                centerStage.appendChild(el);
            });
            this.stage.appendChild(centerStage);

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

            // Helper to create a positioned box
            const createBox = (vAlign) => {
                const box = document.createElement('div');
                box.className = 'dialogue-box';

                // If text-only scene, allow full area usage
                if (scene.type === 'text') {
                    box.classList.add('full-area');
                }

                // Vertical Alignment check
                const align = vAlign || scene.verticalAlign;
                if (align) box.classList.add(`pos-${align}`);
                else if (scene.type !== 'text') box.classList.add('pos-bottom'); // Default for image_text

                // Apply scene-level text styles as defaults (can be overridden by children)
                if (scene.textSize === 'large') box.classList.add('text-lg');

                // Horizontal Alignment (Default to center if not specified)
                if (scene.textAlign) box.classList.add(`text-${scene.textAlign}`);
                else box.classList.add('text-center');

                if (scene.lineHeight) box.style.lineHeight = scene.lineHeight;

                return box;
            };

            // Helper to create segment element
            const createSegmentDiv = (segment) => {
                const segDiv = document.createElement('div');
                const isObj = typeof segment !== 'string';
                const text = isObj ? (segment.text || '') : segment;
                segDiv.innerHTML = text.replace(/\n/g, '<br>');

                if (isObj) {
                    if (segment.textSize === 'large') segDiv.classList.add('text-lg');
                    if (segment.textAlign) segDiv.classList.add(`text-${segment.textAlign}`);
                    if (segment.lineHeight) segDiv.style.lineHeight = segment.lineHeight;
                    if (segment.style) Object.assign(segDiv.style, segment.style);
                }
                return segDiv;
            };

            // Processing
            if (Array.isArray(scene.text)) {
                let flowBox = null;

                scene.text.forEach(segment => {
                    const isObj = typeof segment !== 'string';
                    // If segment has explicit verticalAlign, it needs its own box
                    if (isObj && segment.verticalAlign) {
                        const isoBox = createBox(segment.verticalAlign);
                        isoBox.appendChild(createSegmentDiv(segment));
                        this.stage.appendChild(isoBox);
                    } else {
                        // Add to main flow
                        if (!flowBox) {
                            flowBox = createBox(null); // Use scene default
                            this.stage.appendChild(flowBox);
                        }
                        flowBox.appendChild(createSegmentDiv(segment));
                    }
                });
            } else {
                // Legacy String
                const box = createBox(null);
                box.innerHTML = scene.text.replace(/\n/g, '<br>');
                this.stage.appendChild(box);
            }
        }
    }
    renderStaffRoll(scene) {
        // Container for scrolling text
        const rollContainer = document.createElement('div');
        rollContainer.className = 'staff-roll';

        if (scene.padding) {
            rollContainer.style.padding = scene.padding;
            rollContainer.style.boxSizing = 'border-box';
        }

        if (scene.zIndex) {
            rollContainer.style.zIndex = scene.zIndex;
        }

        // Build HTML from text content
        scene.content.forEach(section => {
            const secDiv = document.createElement('div');
            secDiv.className = 'staff-section';

            if (section.title) {
                const h = document.createElement('div');
                h.className = 'staff-title';
                h.textContent = section.title;
                if (section.titleAlign) h.style.textAlign = section.titleAlign;
                else if (scene.titleAlign) h.style.textAlign = scene.titleAlign;
                secDiv.appendChild(h);
            }

            if (section.label) {
                const l = document.createElement('div');
                l.className = 'staff-name'; // Use text style
                l.textContent = section.label;
                if (section.labelAlign) l.style.textAlign = section.labelAlign;
                else if (scene.labelAlign) l.style.textAlign = scene.labelAlign;
                secDiv.appendChild(l);
            }

            if (section.text) {
                const p = document.createElement('div');
                p.className = 'staff-name';
                p.style.whiteSpace = 'pre-wrap'; // Preserve newlines
                p.textContent = section.text;
                if (section.textAlign) p.style.textAlign = section.textAlign;
                else if (scene.textAlign) p.style.textAlign = scene.textAlign;
                secDiv.appendChild(p);
            }
            rollContainer.appendChild(secDiv);
        });

        this.stage.appendChild(rollContainer);

        // Animation logic
        // Start from bottom of stage, move up
        const startY = this.stage.offsetHeight || 600;

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
        // Cooldown to prevent accidental double-skips
        const now = Date.now();
        if (this.lastInputTime && now - this.lastInputTime < 300) return;
        this.lastInputTime = now;

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


