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


/**
 * Ensures that data required for calculating progress is loaded.
 * This is a fix for the on-demand loading optimization, which prevented
 * the progress dashboard from having the data it needed on initial load.
 */
async function loadRequiredDataForProgress() {
    const requiredDataTypes = ['kanji', 'vocab']; // Add other types if needed for progress
    const promises = [];
    for (const type of requiredDataTypes) {
        if (!state.appData[type]) {
            // Check if it's a default level before trying to load
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


// --- Wrapper function to handle notes logic and progress updates on tab change ---
async function changeTab(tabName, ...args) {
    // Call the original function from handlers.js to continue with tab switching logic
    await originalChangeTab(tabName, ...args);

    // FIX: If switching to the progress tab, refresh the dashboard to show latest stats.
    if (tabName === 'progress') {
        updateProgressDashboard();
    }


    // Now, handle the notes button visibility and state
    const isNoteableTab = !['progress', 'external-search'].includes(tabName);
    const notesButtons = document.querySelectorAll('.notes-header-btn');

    notesButtons.forEach(btn => {
        btn.style.display = isNoteableTab ? 'flex' : 'none';
        btn.classList.remove('has-note'); // Reset state first
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

    const template = document.getElementById('kanji-modal-template');
    if (!template) {
        console.error("Kanji modal template not found in HTML.");
        return;
    }
    const clone = template.content.cloneNode(true);

    // --- Populate Template ---
    clone.querySelector('[data-template-id="kanji-char"]').textContent = kanjiItem.kanji;
    clone.querySelector('[data-template-id="kanji-meaning"]').textContent = kanjiItem.meaning?.[state.currentLang] || kanjiItem.meaning?.en || '';

    // Examples
    const examplesSection = clone.querySelector('[data-template-id="examples-section"]');
    if (kanjiItem.examples && kanjiItem.examples.length > 0) {
        const examplesList = clone.querySelector('[data-template-id="examples-list"]');
        examplesSection.style.display = 'block';
        examplesSection.querySelector('[data-lang-key]').textContent = getUIText('modalExamples');
        kanjiItem.examples.forEach(ex => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-baseline';
            li.innerHTML = `
                <span class="font-semibold noto-sans with-furigana"><ruby>${ex.word}<rt>${ex.reading}</rt></ruby></span>
                <span class="kanji-modal-translation">${ex.meaning[state.currentLang] || ex.meaning.en}</span>`;
            examplesList.appendChild(li);
        });
    }

    // Sentence
    const sentenceSection = clone.querySelector('[data-template-id="sentence-section"]');
    const sentenceTokens = kanjiItem.sentence?.jp_tokens;
    const sentenceJP = kanjiItem.sentence?.jp;
    if (sentenceTokens || sentenceJP) {
        sentenceSection.style.display = 'block';
        let sentenceHTML = '';
        if (sentenceTokens) {
            sentenceHTML = sentenceTokens.map(token => token.r ? `<ruby>${token.w}<rt>${token.r}</rt></ruby>` : token.w).join('');
        } else {
            sentenceHTML = sentenceJP;
        }
        clone.querySelector('[data-template-id="sentence-jp"]').innerHTML = sentenceHTML;
        clone.querySelector('[data-template-id="sentence-translation"]').textContent = kanjiItem.sentence?.[state.currentLang] || kanjiItem.sentence?.en || '';
    }

    // Info section (Radical & Mnemonic)
    const mnemonicText = kanjiItem.mnemonic?.[state.currentLang] || kanjiItem.mnemonic?.en || '';
    const radicalText = kanjiItem.radical?.[state.currentLang] || kanjiItem.radical?.en || '';
    if (mnemonicText || radicalText) {
        const infoSection = clone.querySelector('[data-template-id="info-section"]');
        infoSection.style.display = 'block';
        infoSection.querySelector('[data-lang-key]').textContent = getUIText('modalInfo');

        if (radicalText) {
            const radicalSection = clone.querySelector('[data-template-id="radical-section"]');
            radicalSection.style.display = 'block';
            radicalSection.querySelector('[data-lang-key]').textContent = getUIText('modalRadical');
            radicalSection.querySelector('[data-template-id="radical-text"]').textContent = radicalText;
        }
        if (mnemonicText) {
            const mnemonicSection = clone.querySelector('[data-template-id="mnemonic-section"]');
            mnemonicSection.style.display = 'block';
            mnemonicSection.querySelector('[data-lang-key]').textContent = getUIText('modalMnemonic');
            mnemonicSection.querySelector('[data-template-id="mnemonic-text"]').textContent = mnemonicText;
        }
    }

    // --- Render to DOM ---
    els.kanjiModalContentContainer.innerHTML = '';
    els.kanjiModalContentContainer.appendChild(clone);

    const scrollContent = els.kanjiModalContentContainer.querySelector('.kanji-modal-scroll-content');
    const fadeIndicator = els.kanjiModalContentContainer.querySelector('.fade-indicator');
    if (scrollContent && fadeIndicator) {
        const checkScroll = () => {
            const isAtBottom = scrollContent.scrollHeight - scrollContent.scrollTop <= scrollContent.clientHeight + 5;
            fadeIndicator.style.opacity = isAtBottom ? '0' : '1';
        };
        scrollContent.addEventListener('scroll', checkScroll);
        setTimeout(checkScroll, 50);
    }
    
    // NEW LOGIC: Use the same pattern as other modals
    document.body.classList.add('body-no-scroll');
    els.kanjiDetailModal.classList.remove('modal-hidden');
    els.kanjiModalBackdrop.classList.add('active');
    // We now target the modal's wrapper for the animation class
    els.kanjiDetailModal.querySelector('.modal-wrapper').classList.add('active');
}

function closeKanjiDetailModal() {
    // NEW LOGIC: Use the same pattern as other modals
    document.body.classList.remove('body-no-scroll');
    els.kanjiModalBackdrop.classList.remove('active');
    els.kanjiDetailModal.querySelector('.modal-wrapper').classList.remove('active');
    
    // Hide the modal container after the animation finishes
    setTimeout(() => {
        els.kanjiDetailModal.classList.add('modal-hidden');
    }, 400); // Should match your --transition-duration
}


async function openNotesModal() {
    const tabId = state.activeTab;
    if (!tabId || ['progress', 'external-search'].includes(tabId)) return;

    const navButton = document.querySelector(`.nav-item[data-tab-name="${tabId}"] span`);
    const tabDisplayName = navButton ? navButton.textContent.trim() : tabId;

    els.notesModalTitle.textContent = getUIText('notesFor', { tabName: tabDisplayName });
    els.notesSaveBtn.textContent = getUIText('saveNotes');
    els.notesTextarea.placeholder = getUIText('notesPlaceholder');

    const note = await loadNote(state.currentLevel, tabId);
    const noteInfoDisplay = document.getElementById('note-info-display');

    let initialContent = '';

    if (note && typeof note === 'object' && note.lastModified) {
        initialContent = note.content || '';
        const d = new Date(note.lastModified);
        if (!isNaN(d.getTime())) {
            const formattedDate = d.toISOString().split('T')[0];
            noteInfoDisplay.textContent = getUIText('lastSavedOn', { date: formattedDate });
        } else {
            noteInfoDisplay.textContent = '';
        }
    } else if (typeof note === 'string') {
        initialContent = note;
        noteInfoDisplay.textContent = '';
    } else {
        initialContent = '';
        noteInfoDisplay.textContent = '';
    }

    els.notesTextarea.value = initialContent;

    state.notes.originalContent = initialContent;

    document.body.classList.add('body-no-scroll');
    els.notesModal.classList.remove('modal-hidden');
    els.notesModalBackdrop.classList.add('active');
    els.notesModalWrapper.classList.add('active');
    els.notesTextarea.focus();
}

function closeNotesModal() {
    const currentContent = els.notesTextarea.value;
    const originalContent = state.notes.originalContent;

    const doClose = () => {
        document.body.classList.remove('body-no-scroll');
        els.notesModalBackdrop.classList.remove('active');
        els.notesModalWrapper.classList.remove('active');
        setTimeout(() => els.notesModal.classList.add('modal-hidden'), 300);
        state.notes.originalContent = '';
    };

    if (currentContent !== originalContent) {
        showCustomConfirm(
            getUIText('unsavedChangesTitle', 'Unsaved Changes'),
            getUIText('unsavedChangesBody', 'You have unsaved changes. Are you sure you want to close without saving?')
        ).then(confirmed => {
            if (confirmed) {
                doClose();
            }
        });
    } else {
        doClose();
    }
}

async function saveAndCloseNotesModal() {
    const content = els.notesTextarea.value;
    await saveNote(state.currentLevel, state.activeTab, content);

    state.notes.originalContent = content;

    const notesButtons = document.querySelectorAll('.notes-header-btn');
    notesButtons.forEach(btn => {
        btn.classList.toggle('has-note', !!content.trim());
    });

    els.notesStatus.style.opacity = '1';
    setTimeout(() => {
        closeNotesModal(); 
        setTimeout(() => { els.notesStatus.style.opacity = '0'; }, 500);
    }, 1000);
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
        const target = e.target;
        const actionTarget = target.closest('[data-action]');
        if (!actionTarget) return;

        e.preventDefault(); // Prevent default link/button behavior
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
            case 'toggle-theme':
                handleThemeButtonClick();
                break;
            case 'toggle-pin':
                togglePin();
                break;
            case 'open-notes':
                openNotesModal();
                break;
            case 'close-kanji-modal':
                closeKanjiDetailModal();
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
        if (e.target === els.kanjiModalBackdrop) {
            closeKanjiDetailModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (els.kanjiDetailModal.classList.contains('active')) {
                closeKanjiDetailModal();
            } else if (!els.notesModal.classList.contains('modal-hidden')) {
                closeNotesModal();
            }
        }
    });

    els.closeNotesModalBtn?.addEventListener('click', closeNotesModal);
    els.notesSaveBtn?.addEventListener('click', saveAndCloseNotesModal);

    els.notesModalWrapper?.addEventListener('click', (e) => {
        if (e.target === els.notesModalWrapper) {
            closeNotesModal();
        }
    });

    els.notesTextarea?.addEventListener('keydown', e => {
        if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveAndCloseNotesModal();
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
        importedData = {}; // Clear previous data
        els.fileInput.value = ''; // Crucial for allowing re-selection of the same file after error
        els.fileImportArea.classList.add('state-preview');

        const supportedFileNames = ['grammar.csv', 'hiragana.csv', 'kanji.csv', 'katakana.csv', 'keyPoints.csv', 'vocab.csv'];
        const validFiles = selectedFiles.filter(file => supportedFileNames.includes(file.name));

        if (validFiles.length === 0) {
            els.fileImportArea.innerHTML = `<p class="text-red-400 text-sm">${getUIText('errorNoSupportedFiles')}</p>`;
            updateImportButtonState();
            setTimeout(resetModal, 2000); 
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
                    } else if (char === ';' && !inQuotes) {
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
                setTimeout(resetModal, 2000); 
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
            setTimeout(resetModal, 2000);
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

            showCustomAlert(getUIText('successTitle', 'Success'), getUIText('importSuccess', { levelName: levelName.toUpperCase() }));
            closeModal();
        } catch (error) {
            console.error("Failed to save imported level:", error);
            showCustomAlert(getUIText('errorTitle', 'Error'), getUIText('errorSaveImportedLevel', 'Error: Could not save the new level.'));
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

    // --- LCP FIX: Show content skeleton and hide loader ASAP ---
    // Hide loader immediately to unblock rendering
    if (els.loadingOverlay) {
        els.loadingOverlay.style.opacity = '0';
        els.loadingOverlay.addEventListener('transitionend', () => els.loadingOverlay.classList.add('hidden'), { once: true });
    }
    
    // Set initial UI texts that don't depend on async data
    setLanguage(state.currentLang, true); // `true` to skip re-rendering tabs
    document.querySelectorAll('.lang-switch').forEach(moveLangPill);
    
    // Determine the initial tab but don't load its content yet
    const params = new URLSearchParams(window.location.search);
    let initialTab = params.get('tab') || state.pinnedTab || (window.innerWidth <= 768 ? 'external-search' : 'external-search');

    // Render the initial tab with its placeholder content immediately
    await changeTab(initialTab, null, false, true);
    
    // --- Now, load the rest of the data in the background ---
    try {
        const pkgResponse = await fetch('./package.json');
        if (pkgResponse.ok) {
            const pkg = await pkgResponse.json();
            const versionElement = document.getElementById('app-version');
            if (versionElement) versionElement.textContent = `v${pkg.version}`;
        }
    } catch (error) {
        console.error("Could not load version from package.json", error);
    }

    try {
        let remoteLevels = [config.defaultLevel];
        try {
            const response = await fetch(`${config.dataPath}/levels.json`);
            if (response.ok) remoteLevels = (await response.json()).levels;
        } catch (error) {
            console.warn("Could not fetch remote levels list. Falling back to default.", error);
        }

        const db = await dbPromise;
        const customLevels = await db.getAllKeys('levels');
        state.allAvailableLevels = [...new Set([...remoteLevels, ...customLevels])];
        
        const urlLevel = params.get('level');
        if (urlLevel && state.allAvailableLevels.includes(urlLevel)) {
            state.currentLevel = urlLevel;
        }

        await loadAllData(state.currentLevel);

        // Populate dynamic UI elements now that data is loaded
        buildLevelSwitcher(remoteLevels, customLevels);
        document.querySelector(`.level-switch-button[data-level-name="${state.currentLevel}"]`)?.classList.add('active');
        scrollActiveLevelIntoView();
        
        await setupTabsForLevel(state.currentLevel);
        await loadRequiredDataForProgress();
        updateProgressDashboard();

        setLanguage(state.currentLang, true); // Re-apply language to newly created elements
        setupImportModal();
        updateSidebarPinIcons();

        const initialState = { type: 'tab', tabName: initialTab, level: state.currentLevel };
        const initialUrl = `?level=${state.currentLevel}&tab=${initialTab}`;
        history.replaceState(initialState, '', initialUrl);

    } catch (error) {
        console.error('Deferred initialization failed.', error);
        if (els.loadingOverlay) {
            showCustomAlert(
                getUIText('applicationErrorTitle', 'Application Error'),
                getUIText('applicationErrorBody', 'Something went wrong during startup. Please try refreshing the page.') + `\n\nError: ${error.message}`
            );
        }
    }
}

document.addEventListener('DOMContentLoaded', init);