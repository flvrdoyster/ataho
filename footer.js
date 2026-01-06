(function () {
    const footerHTML = `
        <p>
            <span class="desktop-only">
                Code magic by <a href="https://antigravity.google/">Google Antigravity</a> <span class="footer-sep">|</span>
                Everything else by <a href="https://github.com/flvrdoyster">flvrdoyster</a> <span class="footer-sep">|</span>
            </span>
            Visual and audio assets © original creators.
        </p>
    `;

    function injectFooter() {
        let footer = document.getElementById('footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.id = 'footer';

            // Try to find a good place to append
            const mainWrapper = document.getElementById('main-wrapper') ||
                document.querySelector('.container') ||
                document.getElementById('app');

            if (mainWrapper && document.body.classList.contains('footer-static')) {
                mainWrapper.appendChild(footer);
            } else {
                document.body.appendChild(footer);
            }
        }
        footer.innerHTML = footerHTML;
    }

    // Auto-inject when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFooter);
    } else {
        injectFooter();
    }
})();
