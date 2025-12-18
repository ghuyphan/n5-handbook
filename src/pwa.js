/**
 * @module pwa
 * @description PWA installation logic and banner management.
 */

import { getUIText } from './utils.js';

// --- PWA State ---
let deferredPrompt = null;
let pwaInstallModalShown = false;

/**
 * Detect the user's platform for PWA install hints
 * @returns {'ios' | 'android' | 'other'}
 */
export function getPlatform() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'other';
}

/**
 * Check if the app is running as a standalone PWA
 * @returns {boolean}
 */
export function isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://');
}

/**
 * Check if the device is mobile
 * @returns {boolean}
 */
export function isMobileDevice() {
    return window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Check if PWA install prompt was dismissed recently (within 7 days)
 * @returns {boolean}
 */
export function wasPWAPromptDismissed() {
    const dismissedAt = localStorage.getItem('pwaPromptDismissedAt');
    if (!dismissedAt) return false;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - parseInt(dismissedAt, 10)) < sevenDays;
}

/**
 * Mark PWA prompt as dismissed
 */
export function dismissPWAPrompt() {
    localStorage.setItem('pwaPromptDismissedAt', Date.now().toString());
}

/**
 * Handle the install button click
 */
export async function handleInstallClick() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
        closePWAInstallBanner();
    } else {
        // No native prompt available - show guidance message
        const platform = getPlatform();
        let message = '';
        if (platform === 'ios') {
            message = getUIText('installHintIOS') || 'Tap Share ⬆ then "Add to Home Screen"';
        } else if (platform === 'android') {
            message = getUIText('installHintAndroid') || 'Tap menu ⋮ then "Install app"';
        }
        if (message) {
            import('./ui.js').then(module => {
                module.showCustomAlert(getUIText('installAppTitle') || 'Install App', message);
            });
        }
        closePWAInstallBanner();
    }
}

/**
 * Open the PWA install banner
 */
export function openPWAInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;

    // Update locale texts
    banner.querySelectorAll('[data-lang-key]').forEach(el => {
        el.textContent = getUIText(el.dataset.langKey) || el.textContent;
    });

    requestAnimationFrame(() => {
        // Clear inline styles (opacity: 0, visibility: hidden, transform) that were set in HTML to prevent flash
        banner.style.opacity = '';
        banner.style.visibility = '';
        banner.style.transform = '';

        banner.classList.add('active');
    });

    pwaInstallModalShown = true;
}

/**
 * Close the PWA install banner
 */
export function closePWAInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (!banner) return;
    banner.classList.remove('active');
}

/**
 * Set up PWA install banner event listeners
 */
export function setupPWAInstallBanner() {
    const installBtn = document.getElementById('pwa-banner-install-btn');
    const dismissBtn = document.getElementById('pwa-banner-dismiss-btn');

    if (installBtn) installBtn.addEventListener('click', handleInstallClick);
    if (dismissBtn) dismissBtn.addEventListener('click', () => {
        dismissPWAPrompt();
        closePWAInstallBanner();
    });
}

/**
 * Determine if we should show the PWA install prompt
 * @returns {boolean}
 */
export function shouldShowPWAInstallPrompt() {
    if (isStandalonePWA()) return false;
    if (!isMobileDevice()) return false;
    if (wasPWAPromptDismissed()) return false;
    if (pwaInstallModalShown) return false;
    return true;
}

/**
 * Initialize PWA event listeners (beforeinstallprompt and appinstalled)
 */
export function initPWAListeners() {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });

    // Handle successful app installation
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        pwaInstallModalShown = true;
        closePWAInstallBanner();
        console.log('PWA was installed');
    });
}
