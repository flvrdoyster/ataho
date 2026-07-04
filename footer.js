(function () {
    const emulatorScript = document.querySelector('script[data-emulator]');
    const emulatorType = emulatorScript ? emulatorScript.getAttribute('data-emulator') : null;

    const emulatorCredits = {
        '': 'Emulator by <a href="https://github.com/AZO234/NP2kai">NP2kai</a>',
        'pc98': 'Emulator by <a href="https://github.com/AZO234/NP2kai">NP2kai</a>',
        'dos': 'Emulator by <a href="https://github.com/nbarkhina/DosWasmX">DosWasmX</a>',
    };

    const items = [
        emulatorType !== null ? (emulatorCredits[emulatorType] || null) : null,
        '<span class="desktop-only">Code magic by AI</span>',
        '<span class="desktop-only">Rest by <a href="https://github.com/flvrdoyster">flvrdoyster</a></span>',
    ].filter(Boolean);

    const credits = items.map((item, i) => {
        if (i === 0) return item;
        const sepClass = item.includes('desktop-only') ? ' desktop-only' : '';
        return `<span class="footer-sep${sepClass}"> · </span>${item}`;
    }).join('');

    const footerHTML = `
        <p>© COMPILE / D4 Enterprise. All rights reserved.</p>
        <p class="footer-credits">${credits}</p>
    `;

    function injectFooter() {
        let footer = document.getElementById('footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.id = 'footer';

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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectFooter);
    } else {
        injectFooter();
    }
})();