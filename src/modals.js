import { els } from './dom.js';
import { state, config } from './config.js';
import { dbPromise, saveNote, loadNote } from './database.js';
import { buildLevelSwitcher, showCustomAlert, showCustomConfirm } from './ui.js';
import { setLevel } from './handlers.js';
import { closeSidebar } from './ui.js';
import { getUIText } from './utils.js';

// Sidebar close transition duration (matches --transition-duration in CSS)
const SIDEBAR_TRANSITION_MS = 300;

// --- Scroll Locking Helpers ---
function lockBodyScroll() {
    // On mobile, we fix the body to prevent background scrolling (rubber-banding)
    if (window.innerWidth <= 768) {
        const scrollY = window.scrollY;
        document.body.style.top = `-${scrollY}px`;
    }
    document.body.classList.add('body-no-scroll');
}

function unlockBodyScroll() {
    document.body.classList.remove('body-no-scroll');
    // Restore scroll position on mobile
    if (window.innerWidth <= 768) {
        const scrollY = document.body.style.top;
        document.body.style.top = '';
        if (scrollY) {
            window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
    }
}

/**
 * Close sidebar and wait for animation to complete on mobile.
 * On desktop, returns immediately as sidebar is not modal.
 */
async function closeSidebarAndDelay() {
    const isMobile = window.innerWidth <= 768;
    const sidebarWasOpen = els.sidebar?.classList.contains('open');

    closeSidebar();

    // Only delay on mobile if sidebar was actually open
    if (isMobile && sidebarWasOpen) {
        await new Promise(resolve => setTimeout(resolve, SIDEBAR_TRANSITION_MS));
    }
}

// --- Support Modal ---
export function setupSupportModal() {
    const supportModal = document.getElementById('support-modal');
    if (!supportModal) return;

    const openBtn = document.getElementById('sidebar-support-btn');
    const closeBtn = document.getElementById('close-support-btn');
    const backdrop = document.getElementById('support-modal-backdrop');
    const wrapper = document.getElementById('support-modal-wrapper');

    const openModal = async () => {
        lockBodyScroll();
        await closeSidebarAndDelay();

        // Update locales
        supportModal.querySelectorAll('[data-lang-key]').forEach(el => {
            el.textContent = getUIText(el.dataset.langKey);
        });

        supportModal.classList.remove('modal-hidden');
        requestAnimationFrame(() => {
            backdrop.classList.add('active');
            wrapper.classList.add('active');
        });
    };

    const closeModal = () => {
        unlockBodyScroll();
        backdrop.classList.remove('active');
        wrapper.classList.remove('active');

        wrapper.addEventListener('transitionend', () => {
            supportModal.classList.add('modal-hidden');
        }, { once: true });
    };

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);

    // Also close on wrapper click if it's the target (backdrop area)
    if (wrapper) wrapper.addEventListener('click', (e) => {
        if (e.target === wrapper) closeModal();
    });
}

// --- Kanji Detail Modal ---

let closeKanjiModalWithListeners;

export function openKanjiDetailModal(kanjiId) {
    if (!els.kanjiDetailModal) {
        console.error("Kanji detail modal element not found.");
        return;
    }

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

    clone.querySelector('[data-template-id="kanji-char"]').textContent = kanjiItem.kanji;
    clone.querySelector('[data-template-id="kanji-meaning"]').textContent = kanjiItem.meaning?.[state.currentLang] || kanjiItem.meaning?.en || '';

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

    const handleClose = () => closeKanjiDetailModal();
    const handleBackdropClick = (e) => {
        if (e.target === els.kanjiModalWrapper) {
            handleClose();
        }
    };
    const handleEscKey = (e) => {
        if (e.key === 'Escape') {
            handleClose();
        }
    };

    const closeButton = els.kanjiModalContentContainer.querySelector('[data-action="close-kanji-modal"]');
    if (closeButton) {
        closeButton.addEventListener('click', handleClose);
    }

    els.kanjiModalWrapper.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleEscKey);

    closeKanjiModalWithListeners = () => {
        els.kanjiModalWrapper.removeEventListener('click', handleBackdropClick);
        document.removeEventListener('keydown', handleEscKey);
        if (closeButton) {
            closeButton.removeEventListener('click', handleClose);
        }
        closeKanjiModalWithListeners = null;
    };

    // Lock scroll with position fix
    lockBodyScroll();
    els.kanjiDetailModal.classList.remove('modal-hidden');
    requestAnimationFrame(() => {
        els.kanjiDetailModal.classList.add('active');
        els.kanjiModalBackdrop.classList.add('active');
        if (els.kanjiModalWrapper) {
            els.kanjiModalWrapper.classList.add('active');
        }
    });
}

export function closeKanjiDetailModal() {
    if (closeKanjiModalWithListeners) {
        closeKanjiModalWithListeners();
    }

    els.kanjiDetailModal.classList.remove('active');
    els.kanjiModalBackdrop.classList.remove('active');
    if (els.kanjiModalWrapper) {
        els.kanjiModalWrapper.classList.remove('active');
    }

    unlockBodyScroll();

    els.kanjiModalWrapper.addEventListener('transitionend', () => {
        els.kanjiDetailModal.classList.add('modal-hidden');
    }, { once: true });
}


// --- Notes Modal ---
let closeNotesModalWithListeners;

export async function openNotesModal() {
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

    const handleClose = () => closeNotesModal();
    const handleSave = () => saveAndCloseNotesModal();

    const handleBackdropClick = (e) => {
        if (e.target === els.notesModalWrapper) {
            handleClose();
        }
    };
    const handleEscKey = (e) => {
        if (e.key === 'Escape') {
            handleClose();
        }
    };

    els.closeNotesModalBtn.addEventListener('click', handleClose);
    els.notesSaveBtn.addEventListener('click', handleSave);
    els.notesModalWrapper.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleEscKey);

    closeNotesModalWithListeners = () => {
        els.closeNotesModalBtn.removeEventListener('click', handleClose);
        els.notesSaveBtn.removeEventListener('click', handleSave);
        els.notesModalWrapper.removeEventListener('click', handleBackdropClick);
        document.removeEventListener('keydown', handleEscKey);
        closeNotesModalWithListeners = null;
    };

    lockBodyScroll();
    els.notesModal.classList.remove('modal-hidden');

    requestAnimationFrame(() => {
        els.notesModalBackdrop.classList.add('active');
        els.notesModalWrapper.classList.add('active');
        els.notesTextarea.focus();
    });
}

function closeNotesModal() {
    const currentContent = els.notesTextarea.value;
    const originalContent = state.notes.originalContent;

    const doClose = () => {
        if (closeNotesModalWithListeners) {
            closeNotesModalWithListeners();
        }
        unlockBodyScroll();
        els.notesModalBackdrop.classList.remove('active');
        els.notesModalWrapper.classList.remove('active');

        els.notesModalWrapper.addEventListener('transitionend', () => {
            els.notesModal.classList.add('modal-hidden');
        }, { once: true });

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

    els.notesStatus.textContent = getUIText('savedStatus', 'Saved!');
    els.notesStatus.style.opacity = '1';

    setTimeout(() => {
        closeNotesModal();
        setTimeout(() => { els.notesStatus.style.opacity = '0'; }, 500);
    }, 1000);
}


// --- Import Modal ---
export function setupImportModal() {
    if (!els.importModal) return;

    let importedData = {};
    let levelNameIsValid = false;

    const updateModalLocale = () => {
        els.importModal.querySelectorAll('[data-lang-key]').forEach(el => el.textContent = getUIText(el.dataset.langKey));
        els.importModal.querySelectorAll('[data-lang-placeholder-key]').forEach(el => el.placeholder = getUIText(el.dataset.langPlaceholderKey));
    };

    const openModal = async () => {
        lockBodyScroll();
        await closeSidebarAndDelay();
        resetModal();
        updateModalLocale();
        els.importModal.classList.remove('modal-hidden');

        requestAnimationFrame(() => {
            els.importModalBackdrop.classList.add('active');
            els.modalWrapper.classList.add('active');
        });
    };

    const closeModal = () => {
        unlockBodyScroll();
        els.importModalBackdrop.classList.remove('active');
        els.modalWrapper.classList.remove('active');

        els.modalWrapper.addEventListener('transitionend', () => {
            els.importModal.classList.add('modal-hidden');
        }, { once: true });
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
        els.fileInput.value = '';
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

    const importBtn = document.getElementById('sidebar-import-btn');
    if (importBtn) {
        importBtn.addEventListener('click', openModal);
    }

    els.closeModalBtn?.addEventListener('click', closeModal);
    els.modalWrapper?.addEventListener('click', (e) => {
        if (e.target === els.modalWrapper) closeModal();
    });
    els.levelNameInput?.addEventListener('input', updateImportButtonState);
    els.importBtn?.addEventListener('click', handleConfirm);
    els.fileImportArea?.addEventListener('click', () => { if (!els.fileImportArea.classList.contains('state-preview')) els.fileInput.click(); });
    els.fileInput?.addEventListener('change', (e) => handleFileSelect(e.target.files));
    els.fileImportArea?.addEventListener('dragover', (e) => { e.preventDefault(); els.fileImportArea.classList.add('drag-active'); });
    els.fileImportArea?.addEventListener('dragleave', () => els.fileImportArea.classList.remove('drag-active'));
    els.fileImportArea?.addEventListener('drop', (e) => { e.preventDefault(); els.fileImportArea.classList.remove('drag-active'); handleFileSelect(e.dataTransfer.files); });
}