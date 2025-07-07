/**
 * @module main
 * @description Main application entry point. Initializes the app and sets up event listeners.
 */

import { els } from './dom.js';
import { state, config } from './config.js';
import { dbPromise, loadState, loadAllData } from './database.js';
import { debounce } from './utils.js';
import {
    renderContent,
    updateProgressDashboard,
    setupTheme,
    moveLangPill,
    updatePinButtonState,
    updateSidebarPinIcons,
    closeSidebar,
    buildLevelSwitcher,
    updateLevelUI
} from './ui.js';
import {
    setLanguage,
    toggleTheme,
    handleSearch,
    changeTab,
    togglePin,
    toggleSidebarPin,
    jumpToSection,
    toggleLearned,
    deleteLevel,
    setLevel
} from './handlers.js';

function getThemeToggleHTML() { return `<label class="theme-switch"><input type="checkbox"><span class="slider"></span></label>`; }
function getLangSwitcherHTML() { return `<div class="lang-switch-pill"></div><button data-lang="en">EN</button><button data-lang="vi">VI</button>`; }

function setupEventListeners() {
    // Centralized event listener for all actions
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        const actionTarget = target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;

        switch (action) {
            case 'change-tab':
                changeTab(actionTarget.dataset.tabName, actionTarget);
                break;
            case 'toggle-sidebar':
                els.sidebar?.classList.add('open');
                els.overlay?.classList.add('active');
                document.body.classList.add('sidebar-open');
                break;
            case 'toggle-pin':
                togglePin();
                break;
            case 'toggle-sidebar-pin':
                toggleSidebarPin(e, actionTarget.dataset.tabName);
                break;
            case 'flip-card':
                actionTarget.closest('.card').classList.toggle('is-flipped');
                break;
            case 'toggle-learned':
                toggleLearned(actionTarget.dataset.category, actionTarget.dataset.id, actionTarget);
                break;
            case 'jump-to-section':
                jumpToSection(actionTarget.dataset.tabName, actionTarget.dataset.sectionKey);
                break;
            case 'delete-level':
                deleteLevel(actionTarget.dataset.levelName);
                break;
            case 'set-level':
                setLevel(actionTarget.dataset.levelName);
                break;
            case 'toggle-accordion':
                actionTarget.classList.toggle('open');
                break;
        }
    });

    // Listeners that don't fit the data-action pattern
    els.overlay?.addEventListener('click', closeSidebar);
    els.searchInput?.addEventListener('input', handleSearch);
    els.mobileSearchInput?.addEventListener('input', handleSearch);

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
}

function setupImportModal() {
    if (!els.importModal) return;

    let importedData = {};
    let levelNameIsValid = false;

    const getUIText = (key, replacements = {}) => {
        let text = state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;
        for (const [placeholder, value] of Object.entries(replacements)) {
            text = text.replace(`{${placeholder}}`, value);
        }
        return text;
    };

    const updateModalLocale = () => {
        els.importModal.querySelectorAll('[data-lang-key]').forEach(el => el.textContent = getUIText(el.dataset.langKey));
        els.importModal.querySelectorAll('[data-lang-placeholder-key]').forEach(el => el.placeholder = getUIText(el.dataset.langPlaceholderKey));
    };

    const openModal = () => {
        document.body.classList.add('body-no-scroll');
        closeSidebar();
        resetModal();
        updateModalLocale();
        els.importModal.classList.remove('modal-hidden');
        els.importModalBackdrop.classList.add('active');
        els.modalWrapper.classList.add('active');
    };

    const closeModal = () => {
        document.body.classList.remove('body-no-scroll');
        els.importModalBackdrop.classList.remove('active');
        els.modalWrapper.classList.remove('active');
        setTimeout(() => els.importModal.classList.add('modal-hidden'), 300);
    };

    const updateImportButtonState = () => {
        const levelName = els.levelNameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        levelNameIsValid = false;

        if (!levelName) {
            els.levelNameError.textContent = getUIText('errorLevelNameRequired');
        } else if (state.allAvailableLevels.includes(levelName)) {
            els.levelNameError.textContent = getUIText('errorLevelNameExists');
        } else {
            els.levelNameError.textContent = "";
            levelNameIsValid = true;
        }

        const hasFiles = Object.keys(importedData).length > 0;
        els.importBtn.disabled = !levelNameIsValid || !hasFiles;
    };

    const resetModal = () => {
        els.levelNameInput.value = '';
        els.fileInput.value = '';
        els.levelNameError.textContent = '';
        importedData = {};
        levelNameIsValid = false;

        els.fileImportArea.classList.remove('state-preview', 'drag-active');
        els.fileImportArea.innerHTML = `
            <svg class="upload-icon" viewBox="0 0 24 24"><path d="M3 15C3 17.8284 3 19.2426 3.87868 20.1213C4.75736 21 6.17157 21 9 21H15C17.8284 21 19.2426 21 20.1213 20.1213C21 19.2426 21 17.8284 21 15" stroke="currentColor"/><path class="arrow" d="M12 16V3M12 3L16 7M12 3L8 7" stroke="currentColor"/></svg>
            <p class="font-semibold text-primary" data-lang-key="dropZoneTitle"></p>
            <p class="text-sm text-secondary" data-lang-key="dropZoneOrClick"></p>`;
        els.fileImportArea.querySelectorAll('[data-lang-key]').forEach(el => el.textContent = getUIText(el.dataset.langKey));
        updateImportButtonState();
    };

    const handleFolderSelect = async (files) => {
        const selectedFiles = files ? Array.from(files) : [];
        importedData = {};
        els.fileImportArea.classList.add('state-preview');

        const supportedFileNames = ['grammar.json', 'hiragana.json', 'kanji.json', 'katakana.json', 'keyPoints.json', 'vocab.json'];
        const validFiles = selectedFiles.filter(file => supportedFileNames.includes(file.name));

        if (validFiles.length === 0) {
            els.fileImportArea.innerHTML = `<p class="text-red-400 text-sm">${getUIText('errorNoSupportedFiles')}</p>`;
            updateImportButtonState();
            return;
        }

        const filePromises = validFiles.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => {
                    try { resolve({ name: file.name.replace('.json', ''), data: JSON.parse(e.target.result) }); }
                    catch (err) { reject(`Error parsing ${file.name}`); }
                };
                reader.onerror = () => reject(`Could not read ${file.name}`);
                reader.readAsText(file);
            });
        });

        try {
            const results = await Promise.all(filePromises);
            results.forEach(result => { importedData[result.name] = result.data; });

            let previewHtml = `<div class="w-full"><p class="text-sm font-medium mb-2 text-primary">${getUIText('filesToBeImported')}</p><div class="space-y-2">`;
            results.forEach(result => {
                previewHtml += `<div class="preview-item"><p class="font-medium text-primary text-sm">${result.name}.json</p><span class="text-xs font-mono bg-green-500/20 text-green-300 px-2 py-1 rounded-full">✓</span></div>`;
            });
            previewHtml += '</div></div>';
            els.fileImportArea.innerHTML = previewHtml;

        } catch (err) {
            els.fileImportArea.innerHTML = `<p class="text-red-400 text-sm">${err}</p>`;
        }
        updateImportButtonState();
    };

    const handleConfirm = async () => {
        const levelName = els.levelNameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!levelNameIsValid || Object.keys(importedData).length === 0) return;

        try {
            els.importBtn.disabled = true;
            els.importBtn.querySelector('span').textContent = getUIText('importButtonProgress');

            const db = await dbPromise;
            await db.put('levels', importedData, levelName);

            const remoteResponse = await fetch(`${config.dataPath}/levels.json`);
            const remoteData = remoteResponse.ok ? await remoteResponse.json() : { levels: [] };
            const customLevels = await db.getAllKeys('levels');
            buildLevelSwitcher(remoteData.levels, customLevels);

            await setLevel(levelName);

            alert(getUIText('importSuccess', { levelName: levelName.toUpperCase() }));
            closeModal();

        } catch (error) {
            console.error("Failed to save imported level:", error);
            alert("Error: Could not save the new level.");
        } finally {
             els.importBtn.disabled = false;
             els.importBtn.querySelector('span').textContent = getUIText('importButton');
        }
    };

    // Modal-specific event listeners
    document.getElementById('sidebar-import-btn')?.addEventListener('click', openModal);
    els.closeModalBtn?.addEventListener('click', closeModal);
    els.modalWrapper?.addEventListener('click', (e) => { if (e.target === els.modalWrapper) closeModal(); });
    els.levelNameInput?.addEventListener('input', updateImportButtonState);
    els.importBtn?.addEventListener('click', handleConfirm);
    els.fileImportArea?.addEventListener('click', () => { if (!els.fileImportArea.classList.contains('state-preview')) els.fileInput.click(); });
    els.fileInput?.addEventListener('change', (e) => handleFolderSelect(e.target.files));
    els.fileImportArea?.addEventListener('dragover', (e) => { e.preventDefault(); els.fileImportArea.classList.add('drag-active'); });
    els.fileImportArea?.addEventListener('dragleave', () => els.fileImportArea.classList.remove('drag-active'));
    els.fileImportArea?.addEventListener('drop', (e) => { e.preventDefault(); els.fileImportArea.classList.remove('drag-active'); handleFolderSelect(e.dataTransfer.files); });
}

function populateAndBindControls() {
    if (els.sidebarControls) {
        els.sidebarControls.innerHTML = `
            <div class="sidebar-control-group">
                <label class="sidebar-control-label" data-lang-key="level">Level</label>
                <div id="level-switcher-sidebar" class="level-switch"></div>
            </div>
            <div class="sidebar-control-group md:hidden">
                <label class="sidebar-control-label" data-lang-key="language">Language</label>
                <div id="sidebar-lang-switcher" class="lang-switch">${getLangSwitcherHTML()}</div>
            </div>
            <div class="sidebar-control-group md:hidden">
                <label class="sidebar-control-label" data-lang-key="theme">Theme</label>
                <div class="theme-switch-wrapper">${getThemeToggleHTML()}</div>
            </div>
            <button id="sidebar-import-btn" class="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors import-button">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L6.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                </svg>
                <span data-lang-key="importLevel" class="pointer-events-none">Import New Level</span>
            </button>`;
    }
    const headerLangSwitcher = document.getElementById('header-lang-switcher');
    if (headerLangSwitcher) headerLangSwitcher.innerHTML = getLangSwitcherHTML();

    const headerThemeToggle = document.getElementById('header-theme-toggle');
    if (headerThemeToggle) headerThemeToggle.innerHTML = getThemeToggleHTML();
    
    // Bind listeners to all theme/language switchers after they are created
    document.querySelectorAll('.theme-switch input').forEach(el => el.addEventListener('change', toggleTheme));
    document.querySelectorAll('.lang-switch button').forEach(el => el.addEventListener('click', (e) => {
        e.preventDefault();
        setLanguage(el.dataset.lang);
    }));
}

async function init() {
    try {
        populateAndBindControls(); // Populate controls and bind their specific listeners first

        let remoteLevels = [];
        try {
            const response = await fetch(`${config.dataPath}/levels.json`);
            remoteLevels = response.ok ? (await response.json()).levels : [config.defaultLevel];
        } catch (error) {
            console.warn("Could not fetch remote levels list. Falling back to default.", error);
            remoteLevels = [config.defaultLevel];
        }

        const db = await dbPromise;
        const customLevels = await db.getAllKeys('levels');

        await loadState();
        updateLevelUI(state.currentLevel); // FIX: Update UI with loaded level

        setupEventListeners(); // Setup global, delegated event listeners
        buildLevelSwitcher(remoteLevels, customLevels);
        setupImportModal();

        await loadAllData(state.currentLevel);

        setupTheme();
        renderContent();
        updateProgressDashboard();
        setLanguage(state.currentLang, true);

        setTimeout(() => {
            document.querySelector(`.level-switch-button[data-level-name="${state.currentLevel}"]`)?.classList.add('active');
            document.querySelectorAll('.lang-switch').forEach(moveLangPill);

            const isMobileView = window.innerWidth <= 768;
            const defaultTab = isMobileView ? 'progress' : 'hiragana';
            changeTab(state.pinnedTab || defaultTab);
            updateSidebarPinIcons();

            els.loadingOverlay?.classList.add('hidden');
        }, 50);

    } catch (error) {
        console.error('Initialization failed.', error);
        els.loadingOverlay?.classList.add('hidden');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', init);