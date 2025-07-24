/**
 * @module main
 * @description Main application entry point. Initializes the app and sets up event listeners.
 */

import { els, populateEls } from './dom.js';
import { state, config } from './config.js';
import { dbPromise, loadState, loadAllData, loadTabData, saveNote, loadNote, saveSetting, loadGlobalUI } from './database.js';
import { debounce, getUIText } from './utils.js';
import { updateProgressDashboard, setupTheme, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher, scrollActiveLevelIntoView, setupTabsForLevel, showCustomAlert, showCustomConfirm } from './ui.js';
import { setLanguage, toggleTheme, handleSearch, changeTab as originalChangeTab, togglePin, toggleSidebarPin, jumpToSection, toggleLearned, deleteLevel, setLevel, toggleAccordion } from './handlers.js';

// --- PWA Installation ---
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (els.installAppBtn) {
        els.installAppBtn.style.display = 'flex';
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
    }
}

window.addEventListener('appinstalled', () => {
    if (els.installAppBtn) {
        els.installAppBtn.style.display = 'none';
    }
    deferredPrompt = null;
    console.log('PWA was installed');
});

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
            },
            'toggle-theme': () => toggleTheme(),
            'toggle-pin': () => togglePin(),
            'toggle-sidebar-pin': (e) => toggleSidebarPin(e, actionTarget.dataset.tabName),
            /* MODIFIED: This line is updated for the icon visibility fix */
            'flip-card': () => {
                actionTarget.closest('.relative').classList.toggle('is-flipped');
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
    window.addEventListener('resize', debouncedResize);

    window.addEventListener('popstate', (e) => {
        handleStateChange(e.state);
    });

    if (els.installAppBtn) {
        els.installAppBtn.addEventListener('click', handleInstallClick);
    }
}

function populateAndBindControls() {
    if (els.sidebarControls) {
        els.sidebarControls.innerHTML = `
            <div class="sidebar-control-group"><label class="sidebar-control-label" data-lang-key="level">Level</label><div id="level-switcher-sidebar" class="level-switch"></div></div>
            <div class="sidebar-control-group md:hidden"><label class="sidebar-control-label" data-lang-key="language">Language</label><div id="sidebar-lang-switcher" class="lang-switch">${getLangSwitcherHTML()}</div></div>
            <div class="sidebar-control-group md:hidden"><label class="sidebar-control-label" data-lang-key="theme">Theme</label><div class="theme-switch-wrapper">${getThemeToggleHTML()}</div></div>
            <button id="install-app-btn" class="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors import-button" style="display: none;">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1h4a1 1 0 001-1V2zm-1 5a1 1 0 011 1v10a1 1 0 11-2 0V8a1 1 0 011-1zm-4-4h2V2H5v2zM15 4h-2V2h2v2zm-2 4h-2v10h2V8z"/></svg>
                <span class="pointer-events-none">Install App</span>
            </button>
            <button id="sidebar-import-btn" class="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors import-button"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L6.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg><span data-lang-key="importLevel" class="pointer-events-none">Import New Level</span></button>`;
    }

    const headerLangSwitcher = document.getElementById('header-lang-switcher');
    if (headerLangSwitcher) {
        headerLangSwitcher.innerHTML = getLangSwitcherHTML();
    }

    document.querySelectorAll('.sidebar-control-group .theme-switch input').forEach(el => el.addEventListener('change', toggleTheme));
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
    if (urlLevel) {
        state.currentLevel = urlLevel;
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
        els.loadingOverlay.addEventListener('transitionend', () => els.loadingOverlay.classList.add('hidden'), { once: true });
    }

    try {
        populateAndBindControls();
        setupEventListeners();
        setupTheme();

        if (document.getElementById('sidebar-import-btn')) {
            import('./modals.js').then(module => module.setupImportModal());
        }

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
        
        updateProgressDashboard();
        setLanguage(state.currentLang, true);

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
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // By adding the version as a query parameter, we ensure the browser
        // fetches the new service worker file whenever the app version changes.
        const swUrl = `/sw.js?v=${process.env.APP_VERSION}`;
        navigator.serviceWorker.register(swUrl).then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}