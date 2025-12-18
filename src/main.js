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
import { setLanguage, toggleTheme, handleSearch, changeTab as originalChangeTab, togglePin, toggleSidebarPin, jumpToSection, toggleLearned, deleteLevel, setLevel, toggleAccordion, setupMobileHeaderScroll } from './handlers.js';
import { initPWAListeners, setupPWAInstallBanner, shouldShowPWAInstallPrompt, openPWAInstallBanner } from './pwa.js';

// Initialize PWA event listeners early
initPWAListeners();


/**
 * Load required data for the progress dashboard
 */
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

/**
 * Enhanced changeTab wrapper with additional UI handling
 * @param {string} tabName - The tab to switch to
 * @param {...any} args - Additional arguments to pass to originalChangeTab
 */
async function changeTab(tabName, ...args) {
    await originalChangeTab(tabName, ...args);

    if (tabName === 'progress') {
        updateProgressDashboard();
    }

    const mobileHeader = document.querySelector('.mobile-header');
    const searchToggle = document.getElementById('mobile-search-toggle');

    // Search visibility logic:
    // - progress: No search needed
    // - external-search: Search IS the feature, auto-expand it
    // - other tabs: Show toggle for optional filtering, close search when switching
    if (tabName === 'progress') {
        if (searchToggle) searchToggle.style.display = 'none';
        if (mobileHeader?.classList.contains('search-active')) {
            mobileHeader.classList.remove('search-active');
            els.mobileSearchInput?.blur();
        }
        document.body.classList.remove('dictionary-active');
    } else if (tabName === 'external-search') {
        if (searchToggle) searchToggle.style.display = 'none';
        if (mobileHeader && !mobileHeader.classList.contains('search-active')) {
            mobileHeader.classList.add('search-active');
        }
        document.body.classList.add('dictionary-active');
    } else {
        if (searchToggle) searchToggle.style.display = '';
        if (mobileHeader?.classList.contains('search-active')) {
            mobileHeader.classList.remove('search-active');
            els.mobileSearchInput?.blur();
            if (els.mobileSearchInput) els.mobileSearchInput.value = '';
        }
        document.body.classList.remove('dictionary-active');
    }

    // Update notes button visibility
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

/**
 * Generate HTML for theme toggle switch
 * @returns {string}
 */
function getThemeToggleHTML() {
    return `<label class="theme-switch"><input type="checkbox" aria-label="Theme toggle"><span class="slider"></span></label>`;
}

/**
 * Generate HTML for language switcher
 * @returns {string}
 */
function getLangSwitcherHTML() {
    return `<div class="lang-switch-pill"></div><button data-lang="en">EN</button><button data-lang="vi">VI</button>`;
}

/**
 * Handle browser history state changes
 * @param {object} stateObj - The history state object
 */
function handleStateChange(stateObj) {
    if (!stateObj) return;
    if (stateObj.level !== state.currentLevel) {
        setLevel(stateObj.level, true);
    } else {
        changeTab(stateObj.tabName, null, false, true);
    }
}

/**
 * Set up all event listeners for the application
 */
function setupEventListeners() {
    // Delegated click handler for data-action attributes
    document.body.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;

        const immediateActions = {
            'change-tab': () => changeTab(actionTarget.dataset.tabName, actionTarget),
            'toggle-sidebar': () => {
                document.body.style.top = `-${window.scrollY}px`;
                els.sidebar?.classList.add('open');
                els.overlay?.classList.add('active');
                document.body.classList.add('sidebar-open');
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

        // Lazy-loaded modal actions
        if (action === 'open-notes') {
            import('./modals.js').then(module => module.openNotesModal());
        }
        if (action === 'show-kanji-details') {
            import('./modals.js').then(module => module.openKanjiDetailModal(actionTarget.dataset.id));
        }
    });

    // Sidebar and search event listeners
    els.overlay?.addEventListener('click', closeSidebar);
    els.searchInput?.addEventListener('input', handleSearch);
    els.mobileSearchInput?.addEventListener('input', handleSearch);
    els.closeSidebarBtn?.addEventListener('click', closeSidebar);

    // Mobile header expandable search
    const mobileHeader = document.querySelector('.mobile-header');
    const mobileSearchToggle = document.getElementById('mobile-search-toggle');
    const mobileSearchClose = document.getElementById('mobile-search-close');

    function openMobileSearch() {
        if (mobileHeader) {
            mobileHeader.classList.add('search-active');
            setTimeout(() => {
                els.mobileSearchInput?.focus();
            }, 50);
        }
    }

    function closeMobileSearch() {
        if (mobileHeader) {
            mobileHeader.classList.remove('search-active');
            els.mobileSearchInput?.blur();
            // Also clear the search and reset results
            if (els.mobileSearchInput && els.mobileSearchInput.value) {
                els.mobileSearchInput.value = '';
                els.mobileSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    mobileSearchToggle?.addEventListener('click', openMobileSearch);
    mobileSearchClose?.addEventListener('click', closeMobileSearch);

    els.mobileSearchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMobileSearch();
        }
    });

    // Resize handler
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

    // Browser history navigation
    window.addEventListener('popstate', (e) => {
        handleStateChange(e.state);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

        // '/' to focus search
        if (e.key === '/' && !isTyping) {
            e.preventDefault();
            const searchInput = window.innerWidth <= 768 ? els.mobileSearchInput : els.searchInput;
            searchInput?.focus();
        }

        // Escape to close sidebar
        if (e.key === 'Escape') {
            if (els.sidebar?.classList.contains('open')) {
                closeSidebar();
            }
        }
    });

    // Mobile header scroll-aware hide/show
    setupMobileHeaderScroll();
}



/**
 * Populate sidebar controls and bind their event handlers
 */
function populateAndBindControls() {
    if (els.sidebarControls) {
        els.sidebarControls.innerHTML = `
            <div class="sidebar-control-group">
                <label class="sidebar-control-label" data-lang-key="level">Level</label>
                <div id="level-switcher-sidebar" class="level-switch"></div>
            </div>
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
            <button id="sidebar-import-btn" class="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors import-button">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L6.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                </svg>
                <span data-lang-key="importLevel" class="pointer-events-none">Import New Level</span>
            </button>
            <button id="sidebar-support-btn" class="w-full mt-2 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors support-button group">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none text-accent-vermilion group-hover:scale-110 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6H16a2 2 0 110 4h-5V9a1 1 0 10-2 0v1H4a2 2 0 110-4h1.17C5.06 5.687 5 5.35 5 5zm4 1V5a1 1 0 10-1 1h1zm3 0a1 1 0 10-1-1v1h1z" clip-rule="evenodd" />
                    <path d="M9 11H3v5a2 2 0 002 2h4v-7zM11 18h4a2 2 0 002-2v-5h-6v7z" />
                </svg>
                <span data-lang-key="supportLabel" class="pointer-events-none text-accent-vermilion">Support</span>
            </button>`;
    }

    // Header language switcher
    const headerLangSwitcher = document.getElementById('header-lang-switcher');
    if (headerLangSwitcher) {
        headerLangSwitcher.innerHTML = getLangSwitcherHTML();
    }

    // Bind theme toggle events
    document.querySelectorAll('.theme-switch input').forEach(el => {
        el.addEventListener('change', toggleTheme);
    });

    // Bind language switch events
    document.querySelectorAll('.lang-switch button').forEach(el => {
        el.addEventListener('click', (e) => {
            setLanguage(e.currentTarget.dataset.lang);
        });
    });

    // RE-BIND DOM ELEMENTS that were just injected
    els.openModalBtn = document.getElementById('sidebar-import-btn'); // Matches dom.js naming (sidebar-import-btn)
}

/**
 * Main application initialization
 */
async function init() {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    populateEls();
    await loadGlobalUI();
    await loadState();

    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    let initialTab = params.get('tab') || state.pinnedTab || (window.innerWidth <= 768 ? 'external-search' : 'hiragana');
    const urlLevel = params.get('level');

    if (urlLevel && urlLevel !== state.currentLevel) {
        state.currentLevel = urlLevel;
        // Reload level-specific settings for the URL-specified level
        const db = await dbPromise;
        const levelSettings = await db.get('settings', 'levelSettings');
        const currentLevelSettings = levelSettings?.[state.currentLevel];
        state.pinnedTab = currentLevelSettings?.pinnedTab || null;
        state.openAccordions = new Map(
            (currentLevelSettings?.openAccordions || []).map(([tabId, keys]) => [tabId, new Set(keys)])
        );
        if (!params.get('tab') && state.pinnedTab) {
            initialTab = state.pinnedTab;
        }
    }

    // Show initial loader for the target tab
    const initialTabEl = document.getElementById(initialTab);
    const loaderTemplate = document.getElementById('content-loader-template');

    if (initialTabEl && loaderTemplate) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        initialTabEl.classList.add('active');
        initialTabEl.innerHTML = loaderTemplate.innerHTML;
    }

    // Fade out loading overlay
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

        // Lazy load modals
        if (document.getElementById('sidebar-import-btn')) {
            import('./modals.js').then(module => {
                module.setupImportModal();
                module.setupSupportModal();
            });
        }

        setupPWAInstallBanner();

        // Enable transitions after initial render
        requestAnimationFrame(() => {
            document.body.classList.remove('preload');
        });

        const db = await dbPromise;

        // Fetch available levels
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

        // Validate current level exists
        if (!state.allAvailableLevels.includes(state.currentLevel)) {
            state.currentLevel = config.defaultLevel;
            initialTab = state.pinnedTab || (window.innerWidth <= 768 ? 'external-search' : 'hiragana');
        }

        await loadAllData(state.currentLevel);

        // Build level switcher UI
        buildLevelSwitcher(remoteLevels, customLevels);
        document.querySelector(`.level-switch-button[data-level-name="${state.currentLevel}"]`)?.classList.add('active');
        scrollActiveLevelIntoView();

        // Setup tabs and load initial content
        await setupTabsForLevel(state.currentLevel);
        await loadRequiredDataForProgress();
        await changeTab(initialTab, null, false, true, true);

        updateProgressDashboard();
        setLanguage(state.currentLang, true);
        updateSidebarPinIcons();

        // Show PWA install prompt on mobile after a short delay
        setTimeout(() => {
            if (shouldShowPWAInstallPrompt()) {
                openPWAInstallBanner();
            }
        }, 2000);

        // Display app version
        const versionElement = document.getElementById('app-version');
        if (versionElement) {
            versionElement.textContent = `v${process.env.APP_VERSION}`;
        }

        // Set initial history state
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

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// --- SERVICE WORKER REGISTRATION ---
// Managed automatically by vite-plugin-pwa via 'registerType: autoUpdate'

// --- SCROLL POSITION PERSISTENCE ---
// Removed to force top scroll on reload as per user request
// window.addEventListener('beforeunload', () => { ... });