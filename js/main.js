/**
 * @module main
 * @description Main application entry point. Initializes the app and sets up event listeners.
 */

import { els, populateEls } from './dom.js';
import { state, config } from './config.js';
import { dbPromise, loadState, loadAllData } from './database.js';
import { debounce } from './utils.js';
import { renderContent, updateProgressDashboard, setupTheme, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher, scrollActiveLevelIntoView } from './ui.js';
import { setLanguage, toggleTheme, handleSearch, changeTab, togglePin, toggleSidebarPin, jumpToSection, toggleLearned, deleteLevel, setLevel } from './handlers.js';
import { handleExternalSearch } from './jotoba.js'; // Use the Jotoba handler

function getThemeToggleHTML() { return `<label class="theme-switch"><input type="checkbox"><span class="slider"></span></label>`; }
function getLangSwitcherHTML() { return `<div class="lang-switch-pill"></div><button data-lang="en">EN</button><button data-lang="vi">VI</button>`; }

function handleStateChange(stateObj) {
    if (!stateObj) return;

    if (stateObj.level !== state.currentLevel) {
        setLevel(stateObj.level, true);
    } else {
        changeTab(stateObj.tabName, null, false, true);
    }
}

function openKanjiDetailModal(kanjiId) {
    let kanjiItem = null;
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

    const getUIText = (key) => state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;
    const meaning = kanjiItem.meaning?.[state.currentLang] || kanjiItem.meaning?.en || '';
    const mnemonicText = kanjiItem.mnemonic?.[state.currentLang] || kanjiItem.mnemonic?.en || '';
    const radicalText = kanjiItem.radical?.[state.currentLang] || kanjiItem.radical?.en || '';
    const sentenceTokens = kanjiItem.sentence?.jp_tokens;
    const sentenceJP = kanjiItem.sentence?.jp;
    const sentenceTranslation = kanjiItem.sentence?.[state.currentLang] || kanjiItem.sentence?.en || '';
    let sentenceHTML = '';
    if (sentenceTokens) {
        sentenceHTML = sentenceTokens.map(token => token.r ? `<ruby>${token.w}<rt>${token.r}</rt></ruby>` : token.w).join('');
    } else if (sentenceJP) {
        sentenceHTML = sentenceJP;
    }

    els.kanjiModalContentContainer.innerHTML = `
        <div class="glass-effect rounded-2xl overflow-hidden">
            <div class="p-6 pb-0">
                <button id="close-kanji-modal-btn" class="modal-close-btn absolute top-4 right-4">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <div class="text-center mb-6">
                    <h1 class="text-6xl font-bold noto-sans text-primary mb-2">${kanjiItem.kanji}</h1>
                    <p class="text-xl text-secondary">${meaning}</p>
                </div>
            </div>
            <div class="relative">
                <div class="kanji-modal-scroll-content space-y-6 text-sm max-h-[50vh] overflow-y-auto px-6 pb-6">
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
                <div class="fade-indicator"></div>
            </div>
        </div>
    `;

    const scrollContent = els.kanjiModalContentContainer.querySelector('.kanji-modal-scroll-content');
    const fadeIndicator = els.kanjiModalContentContainer.querySelector('.fade-indicator');

    if (scrollContent && fadeIndicator) {
        const checkScroll = () => {
            const isAtBottom = scrollContent.scrollHeight - scrollContent.scrollTop <= scrollContent.clientHeight + 5; // Added a 5px buffer
            fadeIndicator.style.opacity = isAtBottom ? '0' : '1';
        };
        scrollContent.addEventListener('scroll', checkScroll);
        setTimeout(checkScroll, 50); // Initial check after layout settles
    }
    els.kanjiDetailModal.classList.add('active');
    document.body.classList.add('body-no-scroll');
}

function closeKanjiDetailModal() {
    els.kanjiDetailModal.classList.remove('active');
    document.body.classList.remove('body-no-scroll');
}

function setupEventListeners() {
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

    els.kanjiDetailModal.addEventListener('click', (e) => {
        if (e.target === els.kanjiModalBackdrop || e.target.closest('#close-kanji-modal-btn')) {
            closeKanjiDetailModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && els.kanjiDetailModal.classList.contains('active')) {
            closeKanjiDetailModal();
        }
    });

    window.addEventListener('popstate', (e) => {
        handleStateChange(e.state);
    });
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

            const splitLine = (line) => {
                const values = [];
                let current = '';
                let inQuotes = false;
                for (const char of line) {
                    if (char === '"' && (current.length === 0 || !inQuotes)) {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        values.push(current);
                        current = '';
                    } else {
                        current += char;
                    }
                }
                values.push(current);
                return values.map(v => v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);
            };

            const header = splitLine(lines[0]).map(h => h.trim());

            return lines.slice(1).map(line => {
                const values = splitLine(line);
                if (values.length !== header.length) {
                    console.warn("Skipping malformed CSV line:", line);
                    return null;
                }
                return header.reduce((obj, h, i) => {
                    obj[h] = (values[i] || '').trim();
                    return obj;
                }, {});
            }).filter(Boolean);
        };
        const transformToJSON = (key, data) => {
            const groupKey = `user_created_${key}`;
            const groupName = {
                en: `User ${key.charAt(0).toUpperCase() + key.slice(1)}`,
                vi: `${key.charAt(0).toUpperCase() + key.slice(1)} người dùng`
            };

            const items = data.map((row, index) => {
                const transformedRow = {
                    id: `${key}_user_${index}`
                };

                for (const colHeader in row) {
                    if (Object.prototype.hasOwnProperty.call(row, colHeader)) {
                        const value = row[colHeader];
                        const langMatch = colHeader.match(/_(en|vi)$/);

                        if (langMatch) {
                            const baseKey = colHeader.replace(/_(en|vi)$/, '');
                            const lang = langMatch[1];
                            if (!transformedRow[baseKey]) {
                                transformedRow[baseKey] = {};
                            }
                            transformedRow[baseKey][lang] = value;
                        } else {
                            transformedRow[colHeader] = value;
                        }
                    }
                }

                if (key === 'kanji') {
                    if (!transformedRow.examples) transformedRow.examples = [];
                    if (!transformedRow.sentence) transformedRow.sentence = {};
                }

                return transformedRow;
            });

            return {
                [groupKey]: {
                    ...groupName,
                    items: items
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
                        if (parsedData.length === 0) {
                            console.warn(`CSV file '${file.name}' is empty or invalid. Skipping.`);
                            resolve(null);
                            return;
                        }
                        const jsonData = transformToJSON(key, parsedData);
                        resolve({ name: key, data: jsonData });
                    } catch (err) {
                        console.error(`Error processing ${file.name}:`, err);
                        reject(`Error parsing ${file.name}`);
                    }
                };
                reader.onerror = () => reject(`Could not read ${file.name}`);
                reader.readAsText(file);
            });
        });

        try {
            const results = (await Promise.all(filePromises)).filter(Boolean);
            if (results.length === 0) {
                els.fileImportArea.innerHTML = `<p class="text-red-400 text-sm">${getUIText('errorNoValidData')}</p>`;
                updateImportButtonState();
                return;
            }

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

            const uiData = {
                "en": { "userCreated": "User Created" },
                "vi": { "userCreated": "Người dùng tạo" }
            };
            importedData['ui'] = uiData;

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

function populateAndBindControls() {
    if (els.sidebarControls) {
        els.sidebarControls.innerHTML = `
            <div class="sidebar-control-group"><label class="sidebar-control-label" data-lang-key="level">Level</label><div id="level-switcher-sidebar" class="level-switch"></div></div>
            <div class="sidebar-control-group md:hidden"><label class="sidebar-control-label" data-lang-key="language">Language</label><div id="sidebar-lang-switcher" class="lang-switch">${getLangSwitcherHTML()}</div></div>
            <div class="sidebar-control-group md:hidden"><label class="sidebar-control-label" data-lang-key="theme">Theme</label><div class="theme-switch-wrapper">${getThemeToggleHTML()}</div></div>
            <button id="sidebar-import-btn" class="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors import-button"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L6.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg><span data-lang-key="importLevel" class="pointer-events-none">Import New Level</span></button>`;
    }

    const headerLangSwitcher = document.getElementById('header-lang-switcher');
    if (headerLangSwitcher) {
        headerLangSwitcher.innerHTML = getLangSwitcherHTML();
    }
    const headerThemeToggle = document.getElementById('header-theme-toggle');
    if (headerThemeToggle) {
        headerThemeToggle.innerHTML = getThemeToggleHTML();
    }

    document.querySelectorAll('.theme-switch input').forEach(el => el.addEventListener('change', toggleTheme));
    document.querySelectorAll('.lang-switch button').forEach(el => el.addEventListener('click', (e) => {
        e.preventDefault();
        setLanguage(e.currentTarget.dataset.lang);
    }));
}

async function init() {
    populateEls();
    
    try {
        populateAndBindControls();
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

        const params = new URLSearchParams(window.location.search);
        const urlLevel = params.get('level');
        const urlTab = params.get('tab');
        if (urlLevel) {
            state.currentLevel = urlLevel;
        }

        // We are no longer using the old externalSearch.js
        // The new logic is self-contained in jotoba.js and triggered by handleSearch
        
        setupEventListeners();
        buildLevelSwitcher(remoteLevels, customLevels);
        setupImportModal();
        await loadAllData(state.currentLevel);
        setupTheme();
        renderContent();
        updateProgressDashboard();
        setLanguage(state.currentLang, true);

        if (els.loadingOverlay) {
            els.loadingOverlay.style.opacity = '0';
            els.loadingOverlay.addEventListener('transitionend', () => els.loadingOverlay.classList.add('hidden'), { once: true });
        }

        document.querySelector(`.level-switch-button[data-level-name="${state.currentLevel}"]`)?.classList.add('active');
        scrollActiveLevelIntoView();
        document.querySelectorAll('.lang-switch').forEach(moveLangPill);

        const isMobileView = window.innerWidth <= 768;
        const defaultTab = isMobileView ? 'external-search' : 'external-search';
        const initialTab = urlTab || state.pinnedTab || defaultTab;
        changeTab(initialTab, null, false, true);
        updateSidebarPinIcons();

        const initialState = { type: 'tab', tabName: initialTab, level: state.currentLevel };
        const initialUrl = `?level=${state.currentLevel}&tab=${initialTab}`;
        history.replaceState(initialState, '', initialUrl);

    } catch (error) {
        console.error('Initialization failed.', error);
        if (els.loadingOverlay) {
            els.loadingOverlay.classList.add('hidden');
        }
        document.body.innerHTML = `<div style="text-align: center; padding: 40px; font-family: sans-serif;"><h2>Application Error</h2><p>Something went wrong during startup. Please try refreshing the page.</p></div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);