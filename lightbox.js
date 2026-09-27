(function () {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxMeta = document.getElementById('lightbox-meta');
    const closeBtn = document.querySelector('#lightbox .close');
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');

    function galleryFiles() {
        const manifest = window.RESOURCE_IMG_MANIFEST || {};
        return Object.keys(manifest);
    }

    function galleryIndex(hash) {
        const file = hash.replace(/^resource\/img\//, '');
        return galleryFiles().indexOf(file);
    }

    function navigateGallery(delta) {
        const files = galleryFiles();
        const idx = galleryIndex(window.location.hash.substring(1));
        if (idx === -1 || files.length === 0) return;
        const nextIdx = (idx + delta + files.length) % files.length;
        window.location.hash = 'resource/img/' + files[nextIdx];
    }

    function updateView() {
        const hash = window.location.hash.substring(1);
        if (hash && hash.startsWith('resource/img/') &&
            (hash.endsWith('.png') || hash.endsWith('.jpg') || hash.endsWith('.gif'))) {
            const activeLink = document.querySelector(`a[href="#${hash}"]`);
            lightboxImg.src = hash;
            lightboxCaption.textContent = activeLink ? activeLink.getAttribute('data-caption') : hash.split('/').pop();

            if (activeLink && activeLink.hasAttribute('data-source')) {
                const source = activeLink.getAttribute('data-source');
                const modified = activeLink.getAttribute('data-modified');
                const metaParts = [];
                if (source) metaParts.push(`출처: ${source}`);
                if (modified) metaParts.push(modified);
                lightboxMeta.textContent = metaParts.join(' · ');
            } else {
                lightboxMeta.textContent = '';
            }

            const showNav = galleryFiles().length > 1 && galleryIndex(hash) !== -1;
            prevBtn.classList.toggle('hidden', !showNav);
            nextBtn.classList.toggle('hidden', !showNav);

            lightbox.classList.add('active');
        } else {
            lightbox.classList.remove('active');
        }
    }

    function closeLightbox() {
        history.pushState("", document.title, window.location.pathname + window.location.search);
        updateView();
    }

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
    if (prevBtn) prevBtn.addEventListener('click', () => navigateGallery(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => navigateGallery(1));
    if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') navigateGallery(-1);
        if (e.key === 'ArrowRight') navigateGallery(1);
    });
    window.addEventListener('hashchange', updateView);
    window.addEventListener('DOMContentLoaded', updateView);
    updateView();
})();
