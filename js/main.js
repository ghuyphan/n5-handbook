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
    scrollActiveLevelIntoView
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

/**
 * Handles state restoration when user clicks back/forward browser buttons.
 * @param {object} stateObj - The state object from the history event.
 */
function handleStateChange(stateObj) {
    if (!stateObj) return;

    if (stateObj.level !== state.currentLevel) {
        setLevel(stateObj.level, true); // Pass true to indicate it's from a history event
    } else {
        changeTab(stateObj.tabName, null, false, true); // Pass true for history event
    }
}

/**
 * Populates and opens the Kanji Detail Modal.
 * @param {string} kanjiId - The ID of the kanji to display.
 */
function openKanjiDetailModal(kanjiId) {
    let kanjiItem = null;
    // Find the kanji item across all sections in the current level's data
    for (const key in state.appData.kanji) {
        const found = state.appData.kanji[key].items.find(item => item.id === kanjiId);
        if (found) {
            kanjiItem = found;
            break;
        }
    }

    if (!kanjiItem) {
        console.error("Kanji item not found:", kanjiId);
        return;
    }

    // Helper to get UI text safely
    const getUIText = (key) => state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;

    const meaning = kanjiItem.meaning?.[state.currentLang] || kanjiItem.meaning?.en || '';
    const mnemonicText = kanjiItem.mnemonic?.[state.currentLang] || kanjiItem.mnemonic?.en || '';
    const radicalText = kanjiItem.radical?.[state.currentLang] || kanjiItem.radical?.en || '';
    const sentenceTokens = kanjiItem.sentence?.jp_tokens;
    const sentenceJP = kanjiItem.sentence?.jp;
    const sentenceTranslation = kanjiItem.sentence?.[state.currentLang] || kanjiItem.sentence?.en || '';

    // Build sentence with furigana if available
    let sentenceHTML = '';
    if (sentenceTokens) {
        sentenceHTML = sentenceTokens.map(token => token.r ? `<ruby>${token.w}<rt>${token.r}</rt></ruby>` : token.w).join('');
    } else if (sentenceJP) {
        sentenceHTML = sentenceJP;
    }

    // Populate the modal content
    els.kanjiModalContentContainer.innerHTML = `
        <div class="glass-effect p-6 rounded-2xl">
            <button id="close-kanji-modal-btn" class="modal-close-btn absolute top-4 right-4">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            <div class="text-center mb-6">
                <h1 class="text-6xl font-bold noto-sans text-primary mb-2">${kanjiItem.kanji}</h1>
                <p class="text-xl text-secondary">${meaning}</p>
            </div>
            <div class="space-y-6 text-sm max-h-[50vh] overflow-y-auto pr-2 kanji-modal-scroll-content">
                
                ${kanjiItem.examples && kanjiItem.examples.length > 0 ? `
                <div>
                    <h3 class="font-semibold text-secondary mb-3">${getUIText('modalExamples')}</h3>
                    <ul class="space-y-2 text-primary">
                        ${kanjiItem.examples.map(ex => `
                            <li class="flex justify-between items-baseline">
                                <span class="font-semibold noto-sans with-furigana"><ruby>${ex.word}<rt>${ex.reading}</rt></ruby></span>
                                <span class="kanji-modal-translation">${ex.meaning[state.currentLang] || ex.meaning.en}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>` : ''}
                
                ${sentenceHTML ? `
                <div>
                    <p class="noto-sans text-primary with-furigana">${sentenceHTML}</p>
                    <p class="kanji-modal-translation mt-1">${sentenceTranslation}</p>
                </div>` : ''}

                ${mnemonicText || radicalText ? `
                 <div class="pt-5 border-t border-glass-border">
                    <h3 class="font-semibold text-secondary mb-3">${getUIText('modalInfo')}</h3>
                    <div class="space-y-4 text-xs text-secondary">
                        ${radicalText ? `
                        <div>
                            <p class="font-semibold text-primary mb-1">${getUIText('modalRadical')}</p>
                            <p>${radicalText}</p>
                        </div>` : ''}
                        ${mnemonicText ? `
                        <div>
                            <p class="font-semibold text-primary mb-1">${getUIText('modalMnemonic')}</p>
                            <p>${mnemonicText}</p>
                        </div>` : ''}
                    </div>
                </div>` : ''}
            </div>
        </div>
    `;

    // Add scroll fade effect logic
    const scrollContent = els.kanjiModalContentContainer.querySelector('.kanji-modal-scroll-content');
    if (scrollContent) {
        const checkScroll = () => {
            const isAtBottom = scrollContent.scrollHeight - scrollContent.scrollTop <= scrollContent.clientHeight + 1; // +1 for pixel precision
            scrollContent.classList.toggle('scrolled-to-bottom', isAtBottom);
        };
        scrollContent.addEventListener('scroll', checkScroll);
        checkScroll(); // Initial check
    }

    els.kanjiDetailModal.classList.add('active');
    document.body.classList.add('body-no-scroll');
}

/**
 * Closes the Kanji Detail Modal.
 */
function closeKanjiDetailModal() {
    els.kanjiDetailModal.classList.remove('active');
    document.body.classList.remove('body-no-scroll');
}

/**
 * Sets up all global event listeners for the application.
 */
function setupEventListeners() {
    // Use a single delegated event listener on the body for performance.
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
                // Prevent flipping if the details button within the card was clicked.
                if (!e.target.closest('[data-action="show-kanji-details"]')) {
                    actionTarget.closest('.card').classList.toggle('is-flipped');
                }
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
            case 'show-kanji-details':
                openKanjiDetailModal(actionTarget.dataset.id);
                break;
        }
    });

    // Listeners for specific elements
    els.overlay?.addEventListener('click', closeSidebar);
    els.searchInput?.addEventListener('input', handleSearch);
    els.mobileSearchInput?.addEventListener('input', handleSearch);
    els.closeSidebarBtn?.addEventListener('click', closeSidebar);

    // Debounced resize handler for performance
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

    // Kanji modal specific listeners
    els.kanjiDetailModal.addEventListener('click', (e) => {
        if (e.target === els.kanjiModalBackdrop || e.target.closest('#close-kanji-modal-btn')) {
            closeKanjiDetailModal();
        }
    });

    // Keyboard accessibility
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.kanjiDetailModal.classList.contains('active')) {
            closeKanjiDetailModal();
        }
    });

    // Browser history navigation
    window.addEventListener('popstate', (e) => {
        handleStateChange(e.state);
    });
}

/**
 * Initializes the import modal and its event listeners.
 */
function setupImportModal() {
    if (!els.importModal) return;

    let importedData = {};
    let levelNameIsValid = false;

    // Helper to get UI text safely
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

    // **UPDATED**: Stricter validation prevents overwriting existing levels.
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
        els.fileImportArea.innerHTML = `<svg class="upload-icon" viewBox="0 0 24 24"><path d="M3 15C3 17.8284 3 19.2426 3.87868 20.1213C4.75736 21 6.17157 21 9 21H15C17.8284 21 19.2426 21 20.1213 20.1213C21 19.2426 21 17.8284 21 15" fill="none" stroke="currentColor"/><path class="arrow" d="M12 16V3M12 3L16 7M12 3L8 7" stroke="currentColor"/></svg><p class="font-semibold text-primary" data-lang-key="dropZoneTitle"></p><p class="text-sm text-secondary" data-lang-key="dropZoneOrClick"></p>`;
        els.fileImportArea.querySelectorAll('[data-lang-key]').forEach(el => el.textContent = getUIText(el.dataset.langKey));
        updateImportButtonState();
    };

    const handleFileSelect = async (files) => {
        const selectedFiles = files ? Array.from(files) : [];
        importedData = {};
        els.fileImportArea.classList.add('state-preview');

        const supportedFileNames = ['grammar.csv', 'hiragana.csv', 'kanji.csv', 'katakana.csv', 'keyPoints.csv', 'vocab.csv'];
        const validFiles = selectedFiles.filter(file => supportedFileNames.includes(file.name));

        if (validFiles.length === 0) {
            els.fileImportArea.innerHTML = `<p class="text-red-400 text-sm">${getUIText('errorNoSupportedFiles')}</p>`;
            updateImportButtonState();
            return;
        }

        const parseCSV = (content) => {
            const lines = content.replace(/\r/g, "").split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) return [];
            const header = lines[0].split(',').map(h => h.trim());
            return lines.slice(1).map(line => {
                const values = line.split(',');
                return header.reduce((obj, h, i) => {
                    obj[h] = (values[i] || '').trim();
                    return obj;
                }, {});
            });
        };

        const transformToJSON = (key, data) => {
            const groupKey = `user_created_${key}`;
            const groupName = {
                en: `User ${key.charAt(0).toUpperCase() + key.slice(1)}`,
                vi: `${key.charAt(0).toUpperCase() + key.slice(1)} người dùng`
            };
            
            if (key === 'kanji') {
                return {
                    [groupKey]: {
                        ...groupName,
                        items: data.map((row, index) => ({
                            id: `${key}_user_${index}`,
                            kanji: row.kanji || '',
                            onyomi: row.onyomi || '',
                            kunyomi: row.kunyomi || '',
                            meaning: { en: row.meaning_en || '', vi: row.meaning_vi || '' },
                            radical: { en: row.radical_en || '', vi: row.radical_vi || '' },
                            mnemonic: { en: row.mnemonic_en || '', vi: row.mnemonic_vi || '' },
                            examples: [],
                            sentence: {}
                        }))
                    }
                };
            }
            return {
                [groupKey]: {
                    ...groupName,
                    items: data
                }
            };
        };

        const filePromises = validFiles.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => {
                    try {
                        const content = e.target.result;
                        const key = file.name.replace('.csv', '');
                        const parsedData = parseCSV(content);
                        const jsonData = transformToJSON(key, parsedData);
                        resolve({ name: key, data: jsonData });
                    } catch (err) {
                        reject(`Error parsing ${file.name}`);
                    }
                };
                reader.onerror = () => reject(`Could not read ${file.name}`);
                reader.readAsText(file);
            });
        });

        try {
            const results = await Promise.all(filePromises);
            results.forEach(result => {
                importedData[result.name] = result.data;
            });
            let previewHtml = `<div class="w-full"><p class="text-sm font-medium mb-2 text-primary">${getUIText('filesToBeImported')}</p><div class="space-y-2">`;
            validFiles.forEach(file => {
                previewHtml += `<div class="preview-item"><p class="font-medium text-primary text-sm">${file.name}</p><span class="text-xs font-mono bg-green-500/20 text-green-300 px-2 py-1 rounded-full">✓</span></div>`;
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
            
            // Save the structured data to IndexedDB.
            await db.put('levels', importedData, levelName);

            // Refresh the level switcher with the new level list.
            const remoteResponse = await fetch(`${config.dataPath}/levels.json`);
            const remoteData = remoteResponse.ok ? await remoteResponse.json() : { levels: [] };
            const customLevels = await db.getAllKeys('levels');
            buildLevelSwitcher(remoteData.levels, customLevels);
            
            // Switch to the newly imported level.
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

    // Bind all event listeners for the modal
    document.getElementById('sidebar-import-btn')?.addEventListener('click', openModal);
    els.closeModalBtn?.addEventListener('click', closeModal);
    els.modalWrapper?.addEventListener('click', (e) => { if (e.target === els.modalWrapper) closeModal(); });
    els.levelNameInput?.addEventListener('input', updateImportButtonState);
    els.importBtn?.addEventListener('click', handleConfirm);
    els.fileImportArea?.addEventListener('click', () => { if (!els.fileImportArea.classList.contains('state-preview')) els.fileInput.click(); });
    els.fileInput?.addEventListener('change', (e) => handleFileSelect(e.target.files));
    els.fileImportArea?.addEventListener('dragover', (e) => { e.preventDefault(); els.fileImportArea.classList.add('drag-active'); });
    els.fileImportArea?.addEventListener('dragleave', () => els.fileImportArea.classList.remove('drag-active'));
    els.fileImportArea?.addEventListener('drop', (e) => { e.preventDefault(); els.fileImportArea.classList.remove('drag-active'); handleFileSelect(e.dataTransfer.files); });
}

/**
 * Populates the control elements (theme/language switchers) and binds their events.
 */
function populateAndBindControls() {
    // This part remains the same
    if (els.sidebarControls) {
        els.sidebarControls.innerHTML = `
            <div class="sidebar-control-group"><label class="sidebar-control-label" data-lang-key="level">Level</label><div id="level-switcher-sidebar" class="level-switch"></div></div>
            <div class="sidebar-control-group md:hidden"><label class="sidebar-control-label" data-lang-key="language">Language</label><div id="sidebar-lang-switcher" class="lang-switch">${getLangSwitcherHTML()}</div></div>
            <div class="sidebar-control-group md:hidden"><label class="sidebar-control-label" data-lang-key="theme">Theme</label><div class="theme-switch-wrapper">${getThemeToggleHTML()}</div></div>
            <button id="sidebar-import-btn" class="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors import-button"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L6.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg><span data-lang-key="importLevel" class="pointer-events-none">Import New Level</span></button>`;
    }

    // Use the helper functions for the header controls as well
    const headerLangSwitcher = document.getElementById('header-lang-switcher');
    if (headerLangSwitcher) {
        headerLangSwitcher.innerHTML = getLangSwitcherHTML();
    }
    const headerThemeToggle = document.getElementById('header-theme-toggle');
    if (headerThemeToggle) {
        headerThemeToggle.innerHTML = getThemeToggleHTML();
    }

    // This part remains the same
    document.querySelectorAll('.theme-switch input').forEach(el => el.addEventListener('change', toggleTheme));
    document.querySelectorAll('.lang-switch button').forEach(el => el.addEventListener('click', (e) => {
        e.preventDefault();
        setLanguage(e.currentTarget.dataset.lang);
    }));
}

/**
 * Main application initialization function.
 */
async function init() {
    try {
        populateAndBindControls();
        let remoteLevels = [];
        // Fetch the list of official levels, falling back to just 'n5' on failure.
        try {
            const response = await fetch(`${config.dataPath}/levels.json`);
            remoteLevels = response.ok ? (await response.json()).levels : [config.defaultLevel];
        } catch (error) {
            console.warn("Could not fetch remote levels list. Falling back to default.", error);
            remoteLevels = [config.defaultLevel];
        }
        
        const db = await dbPromise;
        const customLevels = await db.getAllKeys('levels');
        await loadState(); // Load user settings and progress from IndexedDB

        const params = new URLSearchParams(window.location.search);
        const urlLevel = params.get('level');
        const urlTab = params.get('tab');
        if (urlLevel) {
            state.currentLevel = urlLevel;
        }

        setupEventListeners();
        buildLevelSwitcher(remoteLevels, customLevels);
        setupImportModal();
        await loadAllData(state.currentLevel);
        setupTheme();
        renderContent();
        updateProgressDashboard();
        setLanguage(state.currentLang, true); // Set language without re-rendering

        // Hide loading overlay once everything is ready
        if (els.loadingOverlay) {
            els.loadingOverlay.style.opacity = '0';
            els.loadingOverlay.addEventListener('transitionend', () => els.loadingOverlay.classList.add('hidden'), { once: true });
        }

        // Set the active level and language switchers correctly
        document.querySelector(`.level-switch-button[data-level-name="${state.currentLevel}"]`)?.classList.add('active');
        scrollActiveLevelIntoView();
        document.querySelectorAll('.lang-switch').forEach(moveLangPill);

        // Determine and set the initial tab to show
        const isMobileView = window.innerWidth <= 768;
        const defaultTab = isMobileView ? 'progress' : 'hiragana';
        const initialTab = urlTab || state.pinnedTab || defaultTab;
        changeTab(initialTab, null, false, true); // Set tab without creating history entry
        updateSidebarPinIcons();

        // Set the initial state in the browser's history API for back/forward navigation
        const initialState = { type: 'tab', tabName: initialTab, level: state.currentLevel };
        const initialUrl = `?level=${state.currentLevel}&tab=${initialTab}`;
        history.replaceState(initialState, '', initialUrl);

    } catch (error) {
        console.error('Initialization failed.', error);
        if (els.loadingOverlay) {
            els.loadingOverlay.classList.add('hidden');
        }
        // Optionally, display a user-friendly error message on the page
        document.body.innerHTML = `<div style="text-align: center; padding: 40px; font-family: sans-serif;"><h2>Application Error</h2><p>Something went wrong during startup. Please try refreshing the page.</p></div>`;
    }
}

// Start the application once the DOM is ready
document.addEventListener('DOMContentLoaded', init);