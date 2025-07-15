/**
 * @module main
 * @description Main application entry point. Initializes the app and sets up event listeners.
 */

import { els, populateEls } from './dom.js';
import { state, config } from './config.js';
import { dbPromise, loadState, loadAllData, loadTabData, saveNote, loadNote, saveSetting } from './database.js';
import { debounce } from './utils.js';
import { updateProgressDashboard, setupTheme, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher, scrollActiveLevelIntoView, renderContent } from './ui.js';
import { setLanguage, toggleTheme as toggleThemeSlider, handleSearch, changeTab as originalChangeTab, togglePin, toggleSidebarPin, jumpToSection, toggleLearned, deleteLevel, setLevel } from './handlers.js';

// --- Wrapper function to handle notes logic on tab change ---
async function changeTab(tabName, ...args) {
    const isDataTab = !['progress', 'external-search'].includes(tabName);

    // OPTIMIZATION: If data for this tab isn't loaded yet, fetch it on demand.
    if (isDataTab && !state.appData[tabName]) {
        const activeTab = document.getElementById(tabName);
        if (activeTab) {
            activeTab.innerHTML = `<div class="content-loader-wrapper"><div class="loader"></div></div>`;
        }
        try {
            await loadTabData(state.currentLevel, tabName);
        } catch (error) {
            console.error(`Failed to load content for ${tabName}:`, error);
            if (activeTab) {
                activeTab.innerHTML = `<p class="text-center p-4 text-red-400">Failed to load content.</p>`;
            }
            return; // Stop execution if data loading fails
        }
    }

    // Call the original function from handlers.js to continue with tab switching logic
    await originalChangeTab(tabName, ...args);

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

    const getUIText = (key) => state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;

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

    els.kanjiDetailModal.classList.add('active');
    document.body.classList.add('body-no-scroll');
}

function closeKanjiDetailModal() {
    els.kanjiDetailModal.classList.remove('active');
    document.body.classList.remove('body-no-scroll');
}

async function openNotesModal() {
    const tabId = state.activeTab;
    if (!tabId || ['progress', 'external-search'].includes(tabId)) return;

    const getUIText = (key, replacements = {}) => {
        let text = state.appData.ui?.[state.currentLang]?.[key] || `[${key}]`;
        if (key === 'lastSavedOn' && !state.appData.ui?.[state.currentLang]?.[key]) {
             text = `Last saved: {date}`;
        }
        for (const [placeholder, value] of Object.entries(replacements)) {
            text = text.replace(`{${placeholder}}`, value);
        }
        return text;
    };
    
    const navButton = document.querySelector(`.nav-item[data-tab-name="${tabId}"] span`);
    const tabDisplayName = navButton ? navButton.textContent.trim() : tabId;
    
    els.notesModalTitle.textContent = getUIText('notesFor', { tabName: tabDisplayName });
    els.notesSaveBtn.textContent = getUIText('saveNotes');
    els.notesTextarea.placeholder = getUIText('notesPlaceholder');
    
    const note = await loadNote(state.currentLevel, tabId);
    const noteInfoDisplay = document.getElementById('note-info-display');

    if (note && typeof note === 'object' && note.lastModified) {
        els.notesTextarea.value = note.content || '';
        const d = new Date(note.lastModified);
        if (!isNaN(d.getTime())) {
            const formattedDate = d.toISOString().split('T')[0];
            noteInfoDisplay.textContent = getUIText('lastSavedOn', { date: formattedDate });
        } else {
            noteInfoDisplay.textContent = '';
        }
    } else if (typeof note === 'string') {
        els.notesTextarea.value = note;
        noteInfoDisplay.textContent = '';
    } else {
        els.notesTextarea.value = '';
        noteInfoDisplay.textContent = '';
    }
    
    state.notes.set(tabId, els.notesTextarea.value);
    
    document.body.classList.add('body-no-scroll');
    els.notesModal.classList.remove('modal-hidden');
    els.notesModalBackdrop.classList.add('active');
    els.notesModalWrapper.classList.add('active');
    els.notesTextarea.focus();
}

function closeNotesModal() {
    document.body.classList.remove('body-no-scroll');
    els.notesModalBackdrop.classList.remove('active');
    els.notesModalWrapper.classList.remove('active');
    setTimeout(() => els.notesModal.classList.add('modal-hidden'), 300);
}

async function saveAndCloseNotesModal() {
    const content = els.notesTextarea.value;
    await saveNote(state.currentLevel, state.activeTab, content);
    state.notes.set(state.activeTab, content);

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
    // This function remains unchanged as it was already well-structured.
    // ... (paste the entire setupImportModal function here) ...
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

    try {
        let remoteLevels = [config.defaultLevel];
        try {
            const response = await fetch(`${config.dataPath}/levels.json`);
            if (response.ok) {
                remoteLevels = (await response.json()).levels;
            }
        } catch (error) {
            console.warn("Could not fetch remote levels list. Falling back to default.", error);
        }
        
        const db = await dbPromise;
        const customLevels = await db.getAllKeys('levels');
        state.allAvailableLevels = [...new Set([...remoteLevels, ...customLevels])];
        buildLevelSwitcher(remoteLevels, customLevels);

        const params = new URLSearchParams(window.location.search);
        const urlLevel = params.get('level');
        if (urlLevel && state.allAvailableLevels.includes(urlLevel)) {
            state.currentLevel = urlLevel;
        }

        // OPTIMIZATION: Removed eager loading of kanji and vocab data.
        // It will now be loaded on-demand when the user clicks the tab.
        await loadAllData(state.currentLevel);

        updateProgressDashboard();
        setLanguage(state.currentLang, true);
        setupImportModal(); // setupImportModal needs to be defined or pasted back in

        if (els.loadingOverlay) {
            els.loadingOverlay.style.opacity = '0';
            els.loadingOverlay.addEventListener('transitionend', () => els.loadingOverlay.classList.add('hidden'), { once: true });
        }

        document.querySelector(`.level-switch-button[data-level-name="${state.currentLevel}"]`)?.classList.add('active');
        scrollActiveLevelIntoView();
        document.querySelectorAll('.lang-switch').forEach(moveLangPill);
        
        const urlTab = params.get('tab');
        const isMobileView = window.innerWidth <= 768;
        const defaultTab = isMobileView ? 'external-search' : 'external-search';
        const initialTab = urlTab || state.pinnedTab || defaultTab;
        
        await changeTab(initialTab, null, false, true); 
        
        updateSidebarPinIcons();

        const initialState = { type: 'tab', tabName: initialTab, level: state.currentLevel };
        const initialUrl = `?level=${state.currentLevel}&tab=${initialTab}`;
        history.replaceState(initialState, '', initialUrl);

    } catch (error) {
        console.error('Initialization failed.', error);
        if (els.loadingOverlay) {
            els.loadingOverlay.innerHTML = `<div style="text-align: center; padding: 40px; font-family: sans-serif; color: white;"><h2>Application Error</h2><p>Something went wrong during startup. Please try refreshing the page.</p><p style="color: #ff8a8a;">${error.message}</p></div>`;
        }
    }
}

// NOTE: You need to have the `setupImportModal` function defined in this file.
// I have removed it for brevity, but you should paste your existing one back in.
document.addEventListener('DOMContentLoaded', init);