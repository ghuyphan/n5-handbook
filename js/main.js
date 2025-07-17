/**
 * @module main
 * @description Main application entry point. Initializes the app and sets up event listeners.
 */

import { els, populateEls } from './dom.js';
import { state, config } from './config.js';
import { dbPromise, loadState, loadAllData, loadTabData, saveNote, loadNote, saveSetting } from './database.js';
import { debounce } from './utils.js';
import { updateProgressDashboard, setupTheme, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher, scrollActiveLevelIntoView, setupTabsForLevel, showCustomAlert, showCustomConfirm } from './ui.js';
import { setLanguage, toggleTheme as toggleThemeSlider, handleSearch, changeTab as originalChangeTab, togglePin, toggleSidebarPin, jumpToSection, toggleLearned, deleteLevel, setLevel } from './handlers.js';

// --- PWA Installation ---
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI to notify the user they can install the PWA
  const installButton = document.getElementById('install-app-btn');
  if (installButton) {
    installButton.style.display = 'flex';
  }
});

async function handleInstallClick() {
    if (deferredPrompt) {
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;
        // Hide the install button
        const installButton = document.getElementById('install-app-btn');
        if (installButton) {
            installButton.style.display = 'none';
        }
    }
}

// Listen for the appinstalled event
window.addEventListener('appinstalled', () => {
  // Hide the install button
  const installButton = document.getElementById('install-app-btn');
  if (installButton) {
    installButton.style.display = 'none';
  }
  // Clear the deferredPrompt so it can be garbage collected
  deferredPrompt = null;
  // Optionally, send analytics event to indicate successful install
  console.log('PWA was installed');
});


// Helper function to get UI text, now accessible throughout the module
const getUIText = (key, replacements = {}) => {
    let text = state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;
    if (key === 'lastSavedOn' && !state.appData.ui?.[state.currentLang]?.[key]) {
        text = `Last saved: {date}`;
    }
    for (const [placeholder, value] of Object.entries(replacements)) {
        text = text.replace(`{${placeholder}}`, value);
    }
    return text;
};

async function loadRequiredDataForProgress() {
    const requiredDataTypes = ['kanji', 'vocab']; // Add other types if needed for progress
    const promises = [];
    for (const type of requiredDataTypes) {
        if (!state.appData[type]) {
            const db = await dbPromise;
            const isCustomLevel = await db.get('levels', state.currentLevel);
            if (!isCustomLevel) {
                promises.push(loadTabData(state.currentLevel, type));
            }
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
        btn.style.display = isNoteableTab ? 'flex' : 'none';
        btn.classList.remove('has-note');
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

function handleThemeButtonClick() {
    const isDark = document.documentElement.classList.toggle('dark-mode');
    const newTheme = isDark ? 'dark' : 'light';
    if (els.themeEmoji) {
        els.themeEmoji.textContent = isDark ? '🌙' : '☀️';
    }
    const mobileThemeInput = document.querySelector('#sidebar-controls .theme-switch input');
    if (mobileThemeInput) {
        mobileThemeInput.checked = isDark;
    }
    saveSetting('theme', newTheme);
    try {
        localStorage.setItem('theme', newTheme);
    } catch (e) {
        console.warn("Could not save theme to localStorage.", e);
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
            'toggle-theme': () => handleThemeButtonClick(),
            'toggle-pin': () => togglePin(),
            'toggle-sidebar-pin': () => toggleSidebarPin(e, actionTarget.dataset.tabName),
            'flip-card': () => {
                if (!e.target.closest('[data-action="show-kanji-details"]')) {
                    actionTarget.closest('.card').classList.toggle('is-flipped');
                }
            },
            'toggle-learned': () => toggleLearned(actionTarget.dataset.category, actionTarget.dataset.id, actionTarget),
            'jump-to-section': () => jumpToSection(actionTarget.dataset.tabName, actionTarget.dataset.sectionKey),
            'delete-level': () => deleteLevel(actionTarget.dataset.levelName),
            'set-level': () => setLevel(actionTarget.dataset.levelName),
            'toggle-accordion': () => {
                const tabId = state.activeTab;
                const key = actionTarget.dataset.sectionTitleKey;
                const isOpen = actionTarget.classList.toggle('open');
                
                if (!state.openAccordions.has(tabId)) {
                    state.openAccordions.set(tabId, new Set());
                }
                
                const openSet = state.openAccordions.get(tabId);
                if (isOpen) {
                    openSet.add(key);
                } else {
                    openSet.delete(key);
                }
                
                if (!state.levelSettings[state.currentLevel]) {
                    state.levelSettings[state.currentLevel] = {};
                }

                state.levelSettings[state.currentLevel].openAccordions = Array.from(state.openAccordions.entries()).map(([tab, set]) => [tab, Array.from(set)]);
                saveSetting('levelSettings', state.levelSettings);
            }
        };

        if (immediateActions[action]) {
            e.preventDefault();
            immediateActions[action]();
        }

        // Dynamically import modal logic on demand
        if (action === 'open-notes') {
            e.preventDefault();
            import('./modals.js').then(module => module.openNotesModal());
        }
        if (action === 'show-kanji-details') {
            e.preventDefault();
            import('./modals.js').then(module => module.openKanjiDetailModal(actionTarget.dataset.id));
        }
        if (action === 'close-kanji-modal') {
            e.preventDefault();
            import('./modals.js').then(module => module.closeKanjiDetailModal());
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

    // Keyboard shortcuts for modals are now handled inside the modal logic if needed,
    // or can be handled by a dynamically imported module.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!els.kanjiDetailModal.classList.contains('modal-hidden')) {
                import('./modals.js').then(module => module.closeKanjiDetailModal());
            } else if (!els.notesModal.classList.contains('modal-hidden')) {
                // Since closeNotesModal is not exported, we can keep its event listener here
                // or refactor to have it callable from the modals module. For now, let's assume
                // the close button is the primary way and ESC is a nice-to-have.
            }
        }
    });
    
    window.addEventListener('popstate', (e) => {
        handleStateChange(e.state);
    });

    const installButton = document.getElementById('install-app-btn');
    if(installButton) {
        installButton.addEventListener('click', handleInstallClick);
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

    document.querySelectorAll('.sidebar-control-group .theme-switch input').forEach(el => el.addEventListener('change', toggleThemeSlider));
    document.querySelectorAll('.lang-switch button').forEach(el => el.addEventListener('click', (e) => {
        e.preventDefault();
        setLanguage(e.currentTarget.dataset.lang);
    }));
}

async function init() {
    populateEls();
    await loadState();

    populateAndBindControls();
    setupEventListeners();
    setupTheme();

    // Dynamically set up the import modal logic
    if (document.getElementById('sidebar-import-btn')) {
        import('./modals.js').then(module => module.setupImportModal());
    }

    if (els.loadingOverlay) {
        els.loadingOverlay.style.opacity = '0';
        els.loadingOverlay.addEventListener('transitionend', () => els.loadingOverlay.classList.add('hidden'), { once: true });
    }

    setLanguage(state.currentLang, true);
    document.querySelectorAll('.lang-switch').forEach(moveLangPill);

    const params = new URLSearchParams(window.location.search);
    let initialTab = params.get('tab') || state.pinnedTab || (window.innerWidth <= 768 ? 'external-search' : 'external-search');

    try {
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

        const urlLevel = params.get('level');
        if (urlLevel && state.allAvailableLevels.includes(urlLevel)) {
            state.currentLevel = urlLevel;
        }
        await loadAllData(state.currentLevel);

        buildLevelSwitcher(remoteLevels, customLevels);
        document.querySelector(`.level-switch-button[data-level-name="${state.currentLevel}"]`)?.classList.add('active');
        scrollActiveLevelIntoView();

        await setupTabsForLevel(state.currentLevel);
        await loadRequiredDataForProgress();
        updateProgressDashboard();
        
        setLanguage(state.currentLang, true);
        updateSidebarPinIcons();

        await changeTab(initialTab, null, false, true);

        const versionElement = document.getElementById('app-version');
        if(versionElement) versionElement.textContent = 'v1.0.0'; 

        const initialState = { type: 'tab', tabName: initialTab, level: state.currentLevel };
        const initialUrl = `?level=${state.currentLevel}&tab=${initialTab}`;
        history.replaceState(initialState, '', initialUrl);

    } catch (error) {
        console.error('Initialization failed.', error);
        if (els.loadingOverlay) {
            showCustomAlert(
                getUIText('applicationErrorTitle', 'Application Error'),
                getUIText('applicationErrorBody', 'Something went wrong during startup. Please try refreshing the page.') + `\n\nError: ${error.message}`
            );
        }
    }
}

document.addEventListener('DOMContentLoaded', init);