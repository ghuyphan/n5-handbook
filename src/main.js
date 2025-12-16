/**
 * @module main
 * @description Main application entry point. Initializes the app and sets up event listeners.
 */

import './css/main.css';
import './css/deferred.css';

import { els, populateEls } from './dom.js';
import { state, config } from './config.js';
import { dbPromise, loadState, loadAllData, loadTabData, saveNote, loadNote, saveSetting, loadGlobalUI } from './database.js';
import { debounce, getUIText } from './utils.js';
import { updateProgressDashboard, setupTheme, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher, scrollActiveLevelIntoView, setupTabsForLevel, showCustomAlert, showCustomConfirm } from './ui.js';
import { setLanguage, toggleTheme, handleSearch, changeTab as originalChangeTab, togglePin, toggleSidebarPin, jumpToSection, toggleLearned, deleteLevel, setLevel, toggleAccordion } from './handlers.js';

// --- PWA Installation ---
let deferredPrompt;
let pwaInstallModalShown = false;

// Detect platform
function getPlatform() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
    if (/android/i.test(ua)) return 'android';
    return 'other';
}

// Check if running as standalone PWA
function isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://');
}

// Check if mobile device
function isMobileDevice() {
    return window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Check if PWA install prompt was dismissed recently
function wasPWAPromptDismissed() {
    const dismissedAt = localStorage.getItem('pwaPromptDismissedAt');
    if (!dismissedAt) return false;
    // Show again after 7 days
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - parseInt(dismissedAt, 10)) < sevenDays;
}

function dismissPWAPrompt() {
    localStorage.setItem('pwaPromptDismissedAt', Date.now().toString());
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (els.installAppBtn) {
        els.installAppBtn.style.display = 'flex';
    }
    // Show native install button in modal if available
    const nativeBtn = document.getElementById('pwa-native-install-btn');
    if (nativeBtn) {
        nativeBtn.style.display = 'flex';
    }
});

async function handleInstallClick() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
        if (els.installAppBtn) {
            els.installAppBtn.style.display = 'none';
        }
        closePWAInstallModal();
    }
}

window.addEventListener('appinstalled', () => {
    if (els.installAppBtn) {
        els.installAppBtn.style.display = 'none';
    }
    deferredPrompt = null;
    pwaInstallModalShown = true;
    closePWAInstallModal();
    console.log('PWA was installed');
});

// --- PWA Install Modal ---
function openPWAInstallModal() {
    const modal = document.getElementById('pwa-install-modal');
    const backdrop = document.getElementById('pwa-install-backdrop');
    const wrapper = document.getElementById('pwa-install-wrapper');
    const iosInstructions = document.getElementById('pwa-ios-instructions');
    const androidInstructions = document.getElementById('pwa-android-instructions');
    const nativeBtn = document.getElementById('pwa-native-install-btn');

    if (!modal) return;

    const platform = getPlatform();

    // Update locale texts
    modal.querySelectorAll('[data-lang-key]').forEach(el => {
        el.innerHTML = getUIText(el.dataset.langKey) || el.innerHTML;
    });

    // Show platform-specific instructions
    if (iosInstructions) iosInstructions.style.display = platform === 'ios' ? 'block' : 'none';
    if (androidInstructions) androidInstructions.style.display = platform === 'android' ? 'block' : 'none';

    // Show native install button only if deferredPrompt is available
    if (nativeBtn) {
        nativeBtn.style.display = deferredPrompt ? 'flex' : 'none';
    }

    document.body.classList.add('body-no-scroll');
    modal.classList.remove('modal-hidden');
    modal.style.display = 'block';

    requestAnimationFrame(() => {
        backdrop.classList.add('active');
        wrapper.classList.add('active');
    });

    pwaInstallModalShown = true;
}

function closePWAInstallModal() {
    const modal = document.getElementById('pwa-install-modal');
    const backdrop = document.getElementById('pwa-install-backdrop');
    const wrapper = document.getElementById('pwa-install-wrapper');

    if (!modal) return;

    document.body.classList.remove('body-no-scroll');
    backdrop.classList.remove('active');
    wrapper.classList.remove('active');

    wrapper.addEventListener('transitionend', () => {
        modal.classList.add('modal-hidden');
        modal.style.display = 'none';
    }, { once: true });
}

function setupPWAInstallModal() {
    const closeBtn = document.getElementById('close-pwa-install-btn');
    const dismissBtn = document.getElementById('pwa-install-dismiss-btn');
    const nativeBtn = document.getElementById('pwa-native-install-btn');
    const backdrop = document.getElementById('pwa-install-backdrop');
    const wrapper = document.getElementById('pwa-install-wrapper');

    if (closeBtn) closeBtn.addEventListener('click', closePWAInstallModal);
    if (dismissBtn) dismissBtn.addEventListener('click', () => {
        dismissPWAPrompt();
        closePWAInstallModal();
    });
    if (nativeBtn) nativeBtn.addEventListener('click', handleInstallClick);
    if (backdrop) backdrop.addEventListener('click', closePWAInstallModal);
    if (wrapper) wrapper.addEventListener('click', (e) => {
        if (e.target === wrapper) closePWAInstallModal();
    });
}

function shouldShowPWAInstallPrompt() {
    // Don't show if already in standalone mode
    if (isStandalonePWA()) return false;
    // Don't show if not on mobile
    if (!isMobileDevice()) return false;
    // Don't show if user dismissed recently
    if (wasPWAPromptDismissed()) return false;
    // Don't show if modal was already shown this session
    if (pwaInstallModalShown) return false;
    return true;
}

async function loadRequiredDataForProgress() {
    const requiredDataTypes = ['kanji', 'vocab'];
    const promises = [];
    for (const type of requiredDataTypes) {
        if (!state.appData[type]) {
            promises.push(loadTabData(state.currentLevel, type));
        }
    }
    if (promises.length > 0) {
        try {
            await Promise.all(promises);
        } catch (error) {
            console.error("Failed to load required data for progress dashboard:", error);
        }
    }
}

async function changeTab(tabName, ...args) {
    await originalChangeTab(tabName, ...args);
    if (tabName === 'progress') {
        updateProgressDashboard();
    }
    const isNoteableTab = !['progress', 'external-search'].includes(tabName);
    const notesButtons = document.querySelectorAll('.notes-header-btn');
    notesButtons.forEach(btn => {
        btn.classList.toggle('visible', isNoteableTab);
    });

    if (isNoteableTab) {
        const note = await loadNote(state.currentLevel, tabName);
        const hasContent = (note && typeof note === 'object') ? !!note.content?.trim() : !!note?.trim();
        notesButtons.forEach(btn => {
            btn.classList.toggle('has-note', hasContent);
        });
    }
}

function getThemeToggleHTML() {
    return `<label class="theme-switch"><input type="checkbox" aria-label="Theme toggle"><span class="slider"></span></label>`;
}

function getLangSwitcherHTML() {
    return `<div class="lang-switch-pill"></div><button data-lang="en">EN</button><button data-lang="vi">VI</button>`;
}

function handleStateChange(stateObj) {
    if (!stateObj) return;
    if (stateObj.level !== state.currentLevel) {
        setLevel(stateObj.level, true);
    } else {
        changeTab(stateObj.tabName, null, false, true);
    }
}

function setupEventListeners() {
    document.body.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        const immediateActions = {
            'change-tab': () => changeTab(actionTarget.dataset.tabName, actionTarget),
            'toggle-sidebar': () => {
                els.sidebar?.classList.add('open');
                els.overlay?.classList.add('active');
                document.body.classList.add('sidebar-open');
                // Force update language pill position in case of layout shifts
                requestAnimationFrame(() => {
                    document.querySelectorAll('.lang-switch').forEach(moveLangPill);
                });
            },
            'toggle-theme': () => toggleTheme(),
            'toggle-pin': () => togglePin(),
            'toggle-sidebar-pin': (e) => toggleSidebarPin(e, actionTarget.dataset.tabName),
            'flip-card': () => {
                actionTarget.closest('.card').classList.toggle('is-flipped');
            },
            'toggle-learned': () => toggleLearned(actionTarget.dataset.category, actionTarget.dataset.id, actionTarget),
            'jump-to-section': () => jumpToSection(actionTarget.dataset.tabName, actionTarget.dataset.sectionKey),
            'delete-level': () => deleteLevel(actionTarget.dataset.levelName),
            'set-level': () => setLevel(actionTarget.dataset.levelName),
            'toggle-accordion': () => toggleAccordion(actionTarget),
            'clear-search': () => {
                const targetSelector = actionTarget.dataset.target;
                if (targetSelector) {
                    const inputElement = document.querySelector(targetSelector);
                    if (inputElement) {
                        inputElement.value = '';
                        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        };

        if (immediateActions[action]) {
            if (action === 'toggle-sidebar-pin') {
                immediateActions[action](e);
            } else {
                immediateActions[action]();
            }
        }

        if (action === 'open-notes') {
            import('./modals.js').then(module => module.openNotesModal());
        }
        if (action === 'show-kanji-details') {
            import('./modals.js').then(module => module.openKanjiDetailModal(actionTarget.dataset.id));
        }
    });

    els.overlay?.addEventListener('click', closeSidebar);
    els.searchInput?.addEventListener('input', handleSearch);
    els.mobileSearchInput?.addEventListener('input', handleSearch);
    els.closeSidebarBtn?.addEventListener('click', closeSidebar);

    const debouncedResize = debounce(() => {
        document.querySelectorAll('.lang-switch').forEach(moveLangPill);
        const isMobileView = window.innerWidth <= 768;
        if (els.pinToggle) {
            els.pinToggle.style.display = isMobileView ? 'block' : 'none';
            if (isMobileView) {
                const activeTab = document.querySelector('.tab-content.active');
                if (activeTab) updatePinButtonState(activeTab.id);
            }
        }
    }, 100);
    window.addEventListener('resize', debouncedResize, { passive: true });

    window.addEventListener('popstate', (e) => {
        handleStateChange(e.state);
    });

    if (els.installAppBtn) {
        els.installAppBtn.addEventListener('click', handleInstallClick);
    }

    // Keyboard shortcuts for accessibility and power users
    document.addEventListener('keydown', (e) => {
        // Skip if user is typing in an input/textarea
        const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

        // '/' to focus search (common pattern: GitHub, Reddit, YouTube)
        if (e.key === '/' && !isTyping) {
            e.preventDefault();
            const searchInput = window.innerWidth <= 768 ? els.mobileSearchInput : els.searchInput;
            searchInput?.focus();
        }

        // Escape to close sidebar on mobile
        if (e.key === 'Escape') {
            if (els.sidebar?.classList.contains('open')) {
                closeSidebar();
            }
        }
    });
}

function populateAndBindControls() {
    if (els.sidebarControls) {
        els.sidebarControls.innerHTML = `
            <div class="sidebar-control-group"><label class="sidebar-control-label" data-lang-key="level">Level</label><div id="level-switcher-sidebar" class="level-switch"></div></div>
            <div class="flex items-end gap-4 mt-4 md:hidden">
                <div class="flex-1">
                    <label class="sidebar-control-label mb-2 block" data-lang-key="language">Language</label>
                    <div id="sidebar-lang-switcher" class="lang-switch w-full justify-center">${getLangSwitcherHTML()}</div>
                </div>
                <div class="flex-1">
                     <label class="sidebar-control-label mb-2 block" data-lang-key="theme">Theme</label>
                     <div class="theme-switch-container">${getThemeToggleHTML()}</div>
                </div>
            </div>
            <button id="install-app-btn" class="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors import-button" style="display: none;">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1h4a1 1 0 001-1V2zm-1 5a1 1 0 011 1v10a1 1 0 11-2 0V8a1 1 0 011-1zm-4-4h2V2H5v2zM15 4h-2V2h2v2zm-2 4h-2v10h2V8z"/></svg>
                <span class="pointer-events-none">Install App</span>
            </button>
            <button id="sidebar-import-btn" class="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors import-button"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L6.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg><span data-lang-key="importLevel" class="pointer-events-none">Import New Level</span></button>
            <button id="sidebar-support-btn" class="w-full mt-2 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors support-button group">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none text-accent-vermilion group-hover:scale-110 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6H16a2 2 0 110 4h-5V9a1 1 0 10-2 0v1H4a2 2 0 110-4h1.17C5.06 5.687 5 5.35 5 5zm4 1V5a1 1 0 10-1 1h1zm3 0a1 1 0 10-1-1v1h1z" clip-rule="evenodd" />
                    <path d="M9 11H3v5a2 2 0 002 2h4v-7zM11 18h4a2 2 0 002-2v-5h-6v7z" />
                </svg>
                <span data-lang-key="supportLabel" class="pointer-events-none text-accent-vermilion">Support</span>
            </button>`;
    }

    const headerLangSwitcher = document.getElementById('header-lang-switcher');
    if (headerLangSwitcher) {
        headerLangSwitcher.innerHTML = getLangSwitcherHTML();
    }

    document.querySelectorAll('.theme-switch input').forEach(el => el.addEventListener('change', toggleTheme));
    document.querySelectorAll('.lang-switch button').forEach(el => el.addEventListener('click', (e) => {
        setLanguage(e.currentTarget.dataset.lang);
    }));
}

async function init() {
    populateEls();
    await loadGlobalUI();
    await loadState();

    const params = new URLSearchParams(window.location.search);
    let initialTab = params.get('tab') || state.pinnedTab || (window.innerWidth <= 768 ? 'external-search' : 'hiragana');
    const urlLevel = params.get('level');
    if (urlLevel && urlLevel !== state.currentLevel) {
        state.currentLevel = urlLevel;
        // Reload level-specific settings (including accordion state) for the URL-specified level
        const db = await dbPromise;
        const levelSettings = await db.get('settings', 'levelSettings');
        const currentLevelSettings = levelSettings?.[state.currentLevel];
        state.pinnedTab = currentLevelSettings?.pinnedTab || null;
        state.openAccordions = new Map(
            (currentLevelSettings?.openAccordions || []).map(([tabId, keys]) => [tabId, new Set(keys)])
        );
        // Update initialTab if there's a pinned tab for this level
        if (!params.get('tab') && state.pinnedTab) {
            initialTab = state.pinnedTab;
        }
    }

    const initialTabEl = document.getElementById(initialTab);
    const loaderTemplate = document.getElementById('content-loader-template');

    if (initialTabEl && loaderTemplate) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        initialTabEl.classList.add('active');
        initialTabEl.innerHTML = loaderTemplate.innerHTML;
    }

    if (els.loadingOverlay) {
        els.loadingOverlay.style.opacity = '0';
        els.loadingOverlay.addEventListener('transitionend', () => {
            els.loadingOverlay.classList.add('hidden');
            document.body.classList.remove('preload');
        }, { once: true });
    }

    try {
        populateAndBindControls();
        setupEventListeners();
        setupTheme();

        if (document.getElementById('sidebar-import-btn')) {
            import('./modals.js').then(module => {
                module.setupImportModal();
                module.setupSupportModal();
            });
        }

        // Setup PWA install modal
        setupPWAInstallModal();

        // Enable transitions after initial render
        requestAnimationFrame(() => {
            document.body.classList.remove('preload');
        });

        const db = await dbPromise;
        const remoteLevelsPromise = fetch(`${config.dataPath}/levels.json`)
            .then(res => res.ok ? res.json() : { levels: [] })
            .catch(err => {
                console.warn("Could not fetch remote levels list. Falling back to default.", err);
                return { levels: [config.defaultLevel] };
            });

        const customLevelsPromise = db.getAllKeys('levels');

        const [remoteData, customLevels] = await Promise.all([remoteLevelsPromise, customLevelsPromise]);

        const remoteLevels = remoteData.levels || [config.defaultLevel];
        state.allAvailableLevels = [...new Set([...remoteLevels, ...customLevels])];

        if (!state.allAvailableLevels.includes(state.currentLevel)) {
            state.currentLevel = config.defaultLevel;
            initialTab = state.pinnedTab || (window.innerWidth <= 768 ? 'external-search' : 'hiragana');
        }

        await loadAllData(state.currentLevel);

        buildLevelSwitcher(remoteLevels, customLevels);
        document.querySelector(`.level-switch-button[data-level-name="${state.currentLevel}"]`)?.classList.add('active');
        scrollActiveLevelIntoView();

        await setupTabsForLevel(state.currentLevel);
        await loadRequiredDataForProgress();

        await changeTab(initialTab, null, false, true, true);

        // Restore scroll position from sessionStorage
        const scrollKey = `scroll_${state.currentLevel}_${initialTab}`;
        const savedScrollY = sessionStorage.getItem(scrollKey);
        if (savedScrollY) {
            // Use requestAnimationFrame to ensure DOM is ready
            requestAnimationFrame(() => {
                window.scrollTo({ top: parseInt(savedScrollY, 10), behavior: 'instant' });
            });
        }

        updateProgressDashboard();
        setLanguage(state.currentLang, true);

        // THIS IS THE FIX: Explicitly update the sidebar pin icons after all state is loaded.
        updateSidebarPinIcons();

        // Show PWA install prompt on mobile after a short delay
        setTimeout(() => {
            if (shouldShowPWAInstallPrompt()) {
                openPWAInstallModal();
            }
        }, 2000);

        const versionElement = document.getElementById('app-version');
        if (versionElement) {
            versionElement.textContent = `v${process.env.APP_VERSION}`;
        }

        const initialState = { type: 'tab', tabName: initialTab, level: state.currentLevel };
        const initialUrl = `?level=${state.currentLevel}&tab=${initialTab}`;
        history.replaceState(initialState, '', initialUrl);

    } catch (error) {
        console.error('Deferred initialization failed.', error);
        if (els.loadingOverlay) {
            showCustomAlert(
                getUIText('applicationErrorTitle'),
                getUIText('applicationErrorBody') + `\n\nError: ${error.message}`
            );
        }
    }
}

document.addEventListener('DOMContentLoaded', init);

// --- SERVICE WORKER REGISTRATION ---
// Managed automatically by vite-plugin-pwa via 'registerType: autoUpdate'

// --- SCROLL POSITION PERSISTENCE ---
window.addEventListener('beforeunload', () => {
    // Save current scroll position for the active level+tab combo
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && state.currentLevel) {
        const scrollKey = `scroll_${state.currentLevel}_${activeTab.id}`;
        sessionStorage.setItem(scrollKey, window.scrollY.toString());
    }
});