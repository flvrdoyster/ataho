class SceneViewer {
    static stories = {};

    static register(id, story) {
        SceneViewer.stories[id] = story;
    }

    static customRenderers = {};

    static registerRenderer(type, fn) {
        SceneViewer.customRenderers[type] = fn;
    }


    constructor(stageSelector) {
        this.stage = document.querySelector(stageSelector);
        this.currentStory = null;
        this.currentSceneIndex = -1;

        this.scrubber = document.getElementById('scene-scrubber');
        this.controls = document.getElementById('controls');

        // Bind input
        this.stage.addEventListener('click', () => {
            if (!this.choiceKeyHandler) this.handleInput();
        });
        document.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            if (e.code === 'Space' || e.code === 'Enter') {
                if (!this.choiceKeyHandler) this.handleInput();
            }
        });

        if (this.scrubber) {
            this.scrubber.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                const scene = this.currentStory?.scenes[this.currentSceneIndex];
                if (this.currentVideo && scene?.chapters) {
                    this.currentVideo.currentTime = scene.chapters[val];
                    this.currentVideo.play().catch(() => {});
                } else {
                    this.currentSceneIndex = this.checkpoints[val];
                    this.renderScene();
                }
            });
        }

        this.intervalIds = [];
        this.timeoutIds = [];
        this.lastInputTime = 0;
        this.currentVideo = null;
        this.choiceKeyHandler = null;
        this.lang = null;
        this.subLang = null;
        this.checkpoints = [];
        this.sceneToCheckpoint = new Map();
        this.chapterButtonsEl = null;
    }

    cleanup() {
        this.intervalIds.forEach(id => clearInterval(id));
        this.intervalIds = [];
        this.timeoutIds.forEach(id => clearTimeout(id));
        this.timeoutIds = [];
        if (this.currentVideo) {
            this.currentVideo.pause();
            this.currentVideo.removeAttribute('src');
            this.currentVideo.load();
            this.currentVideo = null;
        }
        if (this.choiceKeyHandler) {
            document.removeEventListener('keydown', this.choiceKeyHandler);
            this.choiceKeyHandler = null;
        }
        if (this.chapterButtonsEl) {
            this.chapterButtonsEl.remove();
            this.chapterButtonsEl = null;
        }
    }

    loadStory(story) {
        this.currentStory = story;
        this.currentSceneIndex = 0;
        this.lang = story.defaultLang || null;
        this.subLang = story.defaultSubLang || null;

        this.checkpoints = [];
        this.sceneToCheckpoint = new Map();
        const nextToCheckpointIdx = new Map();

        story.scenes.forEach((scene, i) => {
            const next = scene.next;
            if (next && nextToCheckpointIdx.has(next)) {
                this.sceneToCheckpoint.set(i, nextToCheckpointIdx.get(next));
            } else {
                const cpIdx = this.checkpoints.length;
                this.checkpoints.push(i);
                this.sceneToCheckpoint.set(i, cpIdx);
                if (next) nextToCheckpointIdx.set(next, cpIdx);
            }
        });

        if (this.scrubber) {
            this.scrubber.max = this.checkpoints.length - 1;
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

        // Sync scrubber (checkpoint mode)
        if (this.scrubber && this.checkpoints.length) {
            this.scrubber.max  = this.checkpoints.length - 1;
            this.scrubber.step = 1;
            this.scrubber.value = this.sceneToCheckpoint.get(this.currentSceneIndex) ?? 0;
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

        // 1.2 Overlay (on top of background)
        if (scene.overlay) {
            const overlayDiv = document.createElement('div');
            overlayDiv.className = 'layer scene-overlay';
            overlayDiv.style.zIndex = 5;
            this.stage.appendChild(overlayDiv);
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
        if (SceneViewer.customRenderers[scene.type]) {
            SceneViewer.customRenderers[scene.type].call(this, scene);
        } else if (scene.type === 'text' || scene.type === 'image_text') {
            this.renderTextScene(scene);
        } else if (scene.type === 'staff_roll') {
            this.renderStaffRoll(scene);
        } else if (scene.type === 'video') {
            this.renderVideoScene(scene);
        } else if (scene.type === 'choice') {
            this.renderChoiceScene(scene);
        }
    }

    renderVideoScene(scene) {
        const video = document.createElement('video');
        const langPath = (this.currentStory.langPaths && this.lang)
            ? this.currentStory.langPaths[this.lang] : '';
        const videoSrc = langPath + scene.src;
        video.src = videoSrc;
        video.className = 'scene-video';
        video.playsInline = true;
        video.loop = scene.loop || false;

        this.stage.appendChild(video);
        this.currentVideo = video;

        if (this.scrubber && scene.chapters?.length) {
            this.scrubber.max   = scene.chapters.length - 1;
            this.scrubber.step  = 1;
            this.scrubber.value = 0;

            video.addEventListener('timeupdate', () => {
                const t = video.currentTime;
                let activeIdx = 0;
                for (let i = scene.chapters.length - 1; i >= 0; i--) {
                    if (t >= scene.chapters[i]) { activeIdx = i; break; }
                }
                if (this.scrubber) this.scrubber.value = activeIdx;
                this.chapterButtonsEl?.querySelectorAll('.chapter-btn').forEach((btn, i) => {
                    btn.classList.toggle('active', i === activeIdx);
                });
            });
        }

        this.renderChapterButtons(scene);

        const subtitleEl = document.createElement('div');
        subtitleEl.className = 'subtitle-overlay';
        this.stage.appendChild(subtitleEl);

        if (this.subLang) {
            const vttSrc = videoSrc.replace(/\/([^/]+)\.[^.]+$/, `/${this.subLang}/$1.vtt`);
            // Drive subtitles ourselves instead of relying on a <track>: iOS
            // Safari never fires `cuechange` for a 'hidden' track, so the native
            // API leaves the overlay empty on mobile (works on desktop). Parsing
            // the VTT and syncing on timeupdate behaves the same on every platform.
            this.loadSubtitles(vttSrc, video, subtitleEl);
        }

        const autoAdvance = scene.autoAdvance !== false;
        if (autoAdvance && !scene.loop) {
            video.addEventListener('ended', () => this.nextScene(), { once: true });
        }

        video.play().catch(() => {});

        if (scene.text) {
            this.renderTextScene(scene);
        }
    }

    // Fetch + parse a WebVTT file and drive `overlayEl` off the video's
    // currentTime. Replaces the native <track>/cuechange path so subtitles
    // work on iOS Safari too (see renderVideoScene).
    loadSubtitles(vttSrc, video, overlayEl) {
        fetch(vttSrc)
            .then(r => (r.ok ? r.text() : Promise.reject(r.status)))
            .then(text => {
                const cues = this.parseVtt(text);
                if (!cues.length) return;
                let lastIdx = -1;
                video.addEventListener('timeupdate', () => {
                    const t = video.currentTime;
                    let idx = -1;
                    for (let i = 0; i < cues.length; i++) {
                        if (t >= cues[i].start && t < cues[i].end) { idx = i; break; }
                    }
                    if (idx === lastIdx) return; // only touch the DOM on change
                    lastIdx = idx;
                    overlayEl.textContent = idx >= 0 ? cues[idx].text : '';
                });
            })
            .catch(() => { /* no subtitle file for this scene/lang */ });
    }

    parseVtt(text) {
        const toSec = (ts) => ts.trim().split(':').reduce((acc, p) => acc * 60 + parseFloat(p), 0);
        const cues = [];
        const blocks = text.replace(/\r/g, '').split(/\n\n+/);
        for (const block of blocks) {
            const lines = block.split('\n').filter(l => l.length);
            const tIdx = lines.findIndex(l => l.includes('-->'));
            if (tIdx === -1) continue; // header / NOTE / empty block
            const [rawStart, rest] = lines[tIdx].split('-->');
            if (rest === undefined) continue;
            const start = toSec(rawStart);
            const end = toSec(rest.trim().split(/\s/)[0]); // drop cue settings after end ts
            const textLines = lines.slice(tIdx + 1);
            if (!textLines.length) continue;
            cues.push({ start, end, text: textLines.join('\n') });
        }
        return cues;
    }

    renderChapterButtons(scene) {
        if (!this.controls || !scene.chapterLabels?.length) return;

        const n = scene.chapterLabels.length;
        const container = document.createElement('div');
        container.className = 'chapter-buttons';

        scene.chapterLabels.forEach((label, i) => {
            const btn = document.createElement('button');
            btn.className = 'chapter-btn';
            if (i === 0) btn.classList.add('active');

            if (typeof label === 'string') {
                btn.textContent = label;
            } else {
                if (label.title) {
                    const t = document.createElement('span');
                    t.className = 'chapter-title';
                    t.textContent = label.title;
                    btn.appendChild(t);
                }
                if (label.body) {
                    const b = document.createElement('span');
                    b.className = 'chapter-body';
                    b.textContent = label.body;
                    btn.appendChild(b);
                }
            }

            // Align with actual scrubber thumb center (thumb ≈ 16px wide)
            const pct = n > 1 ? i / (n - 1) : 0.5;
            btn.style.left = `calc(${pct.toFixed(4)} * (100% - 16px) + 8px)`;
            if (i === 0)          btn.classList.add('chapter-btn--left');
            else if (i === n - 1) btn.classList.add('chapter-btn--right');

            btn.addEventListener('click', () => {
                if (!this.currentVideo || scene.chapters?.[i] === undefined) return;
                this.currentVideo.currentTime = scene.chapters[i];
                if (this.scrubber) this.scrubber.value = i;
                this.currentVideo.play().catch(() => {});
            });
            container.appendChild(btn);
        });

        this.controls.appendChild(container);
        this.chapterButtonsEl = container;
    }

    renderChoiceScene(scene) {
        if (scene.text) {
            this.renderTextScene(scene);
        }

        const container = document.createElement('div');
        container.className = 'choice-container';

        let focusedIndex = 0;

        const buttons = scene.choices.map((choice, i) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.label;
            if (i === 0) btn.classList.add('choice-active');

            btn.addEventListener('mouseenter', () => {
                focusedIndex = i;
                updateFocus();
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.goToScene(choice.target);
            });
            container.appendChild(btn);
            return btn;
        });

        const updateFocus = () => {
            buttons.forEach((b, i) => b.classList.toggle('choice-active', i === focusedIndex));
        };

        this.choiceKeyHandler = (e) => {
            if (e.code === 'ArrowDown') {
                e.preventDefault();
                focusedIndex = (focusedIndex + 1) % scene.choices.length;
                updateFocus();
            } else if (e.code === 'ArrowUp') {
                e.preventDefault();
                focusedIndex = (focusedIndex - 1 + scene.choices.length) % scene.choices.length;
                updateFocus();
            } else if (e.code === 'Enter' || e.code === 'Space') {
                this.goToScene(scene.choices[focusedIndex].target);
            }
        };
        document.addEventListener('keydown', this.choiceKeyHandler);

        this.stage.appendChild(container);

        if (scene.timeout) {
            const timerBar = document.createElement('div');
            timerBar.className = 'choice-timer';
            timerBar.style.width = '100%';
            this.stage.appendChild(timerBar);

            requestAnimationFrame(() => {
                timerBar.style.transitionDuration = `${scene.timeout}ms`;
                timerBar.style.width = '0%';
            });

            const timeoutId = setTimeout(() => {
                const target = scene.timeoutTarget || scene.choices[0].target;
                this.goToScene(target);
            }, scene.timeout);
            this.timeoutIds.push(timeoutId);
        }
    }

    goToScene(sceneId) {
        const index = this.currentStory.scenes.findIndex(s => s.id === sceneId);
        if (index !== -1) {
            this.currentSceneIndex = index;
            this.renderScene();
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
        const now = Date.now();
        if (this.lastInputTime && now - this.lastInputTime < 300) return;
        this.lastInputTime = now;

        const scene = this.currentStory.scenes[this.currentSceneIndex];

        if (scene.type === 'staff_roll' || scene.type === 'choice') return;
        if (scene.type === 'video') {
            if (this.currentVideo) {
                if (this.currentVideo.paused) this.currentVideo.play().catch(() => {});
                else this.currentVideo.pause();
            }
            return;
        }

        this.nextScene();
    }

    nextScene() {
        const scene = this.currentStory.scenes[this.currentSceneIndex];

        if (scene && scene.next) {
            this.goToScene(scene.next);
            return;
        }

        if (this.currentSceneIndex < this.currentStory.scenes.length - 1) {
            this.currentSceneIndex++;
            this.renderScene();
        } else {
            console.log("Story Finished");
        }
    }
}


