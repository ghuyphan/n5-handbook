import Fuse from 'fuse.js';
import { els } from './dom.js';
import { state, config } from './config.js';
import { debounce } from './utils.js';
import { dbPromise, saveProgress, saveSetting, loadAllData, loadTabData, deleteNotesForLevel, saveNote, loadNote, saveAccordionState } from './database.js';
import { renderContent, updateProgressDashboard, updateSearchPlaceholders, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher, renderContentNotAvailable, showCustomAlert, showCustomConfirm, setupTabsForLevel } from './ui.js';
import { handleExternalSearch } from './jotoba.js';

// --- HELPER FUNCTIONS ---

function getUIText(key, replacements = {}) {
    let text = state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;
    for (const [placeholder, value] of Object.entries(replacements)) {
        text = text.replace(`{${placeholder}}`, value);
    }
    return text;
}

function getActiveSearchInput() {
    return window.innerWidth <= 768 ? els.mobileSearchInput : els.searchInput;
}

/**
 * Checks if the given level is considered advanced (N3, N2, N1).
 * @param {string} level The level identifier (e.g., 'n3').
 * @returns {boolean} True if the level is N3 or higher.
 */
function isAdvancedLevel(level) {
    if (!level || !level.startsWith('n')) return false; // Not a standard JLPT level
    const levelNum = parseInt(level.substring(1), 10);
    return !isNaN(levelNum) && levelNum <= 3;
}


function highlightMatches(element, query) {
    if (!query) return;

    const regex = new RegExp(`(${query.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1")})`, 'gi');
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const nodesToModify = [];
    let currentNode;

    while (currentNode = walker.nextNode()) {
        if (regex.test(currentNode.nodeValue)) {
            nodesToModify.push(currentNode);
        }
    }

    nodesToModify.forEach(node => {
        const fragment = document.createDocumentFragment();
        node.nodeValue.split(regex).forEach(part => {
            if (part.toLowerCase() === query.toLowerCase()) {
                const mark = document.createElement('mark');
                mark.className = 'search-highlight';
                mark.textContent = part;
                fragment.appendChild(mark);
            } else {
                fragment.appendChild(document.createTextNode(part));
            }
        });
        node.parentNode?.replaceChild(fragment, node);
    });
}


// --- CORE HANDLERS ---

export function toggleLearned(category, id, element) {
    if (!state.progress[category]) state.progress[category] = [];
    const arr = state.progress[category];
    const idx = arr.indexOf(id);
    if (idx > -1) {
        arr.splice(idx, 1);
        element.classList.remove('learned');
    } else {
        arr.push(id);
        element.classList.add('learned');
    }
    saveProgress();
}

export function toggleAccordion(buttonElement) {
    const tabId = state.activeTab;
    const sectionKey = buttonElement.dataset.sectionTitleKey;

    if (!tabId || !sectionKey) return;

    const isOpen = buttonElement.classList.toggle('open');

    if (!state.openAccordions.has(tabId)) {
        state.openAccordions.set(tabId, new Set());
    }

    const tabAccordions = state.openAccordions.get(tabId);
    if (isOpen) {
        tabAccordions.add(sectionKey);
    } else {
        tabAccordions.delete(sectionKey);
    }
    saveAccordionState();
}

export function setupFuseForTab(tabId) {
    if (state.fuseInstances[tabId] || !state.appData[tabId]) return;

    const container = document.getElementById(tabId);
    if (!container) return;
    
    const searchableElements = Array.from(container.querySelectorAll('[data-search-item]'));
    
    const fuseCollection = searchableElements.map((el) => {
        const itemId = el.dataset.itemId || el.closest('[data-item-id]')?.dataset.itemId || el.textContent.trim();
        return {
            id: itemId,
            element: el,
            searchData: el.dataset.searchItem
        }
    });

    if (fuseCollection.length > 0) {
        state.fuseInstances[tabId] = new Fuse(fuseCollection, {
            keys: ['searchData'],
            includeScore: true,
            threshold: 0.3,
            ignoreLocation: true,
            useExtendedSearch: true,
        });
    }
}

export const handleSearch = debounce(() => {
    const query = getActiveSearchInput().value.trim().toLowerCase();
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;

    const activeTabId = activeTab.id;
    if (activeTabId === 'external-search') {
        handleExternalSearch(query);
        return;
    }

    const allWrappers = activeTab.querySelectorAll('.search-wrapper');
    const allItems = activeTab.querySelectorAll('[data-search-item]');
    
    // First, reset everything to its default state
    allItems.forEach(item => {
        item.classList.remove('search-hidden');
        const originalHTML = item.dataset.originalHtml;
        if (originalHTML) {
            item.innerHTML = originalHTML;
            item.removeAttribute('data-original-html');
        }
    });

    allWrappers.forEach(wrapper => {
        wrapper.style.display = '';
        const accordionButton = wrapper.querySelector('.accordion-button');
        const tabAccordions = state.openAccordions.get(activeTabId);
        const sectionKey = accordionButton?.dataset.sectionTitleKey;
        if (accordionButton && sectionKey) {
            accordionButton.classList.toggle('open', tabAccordions?.has(sectionKey));
        }
    });

    if (!query) {
        return; // If query is empty, we are done after resetting.
    }

    const fuse = state.fuseInstances[activeTabId];
    if (!fuse) return;
    
    const results = fuse.search(query);
    const matchedItemElements = new Set(results.map(result => result.item.element));
    const matchedWrapperElements = new Set();

    // Hide non-matching items and highlight matching ones
    allItems.forEach(item => {
        if (!matchedItemElements.has(item)) {
            item.classList.add('search-hidden');
        } else {
            if (!item.dataset.originalHtml) {
                item.dataset.originalHtml = item.innerHTML;
            }
            highlightMatches(item, query);
            const parentWrapper = item.closest('.search-wrapper');
            if (parentWrapper) {
                matchedWrapperElements.add(parentWrapper);
            }
        }
    });

    // Hide entire wrappers if they contain no matched items
    allWrappers.forEach(wrapper => {
        if (!matchedWrapperElements.has(wrapper)) {
            wrapper.style.display = 'none';
        } else {
            // If a wrapper has matches, ensure its accordion is open
            const accordionButton = wrapper.querySelector('.accordion-button');
            if (accordionButton && !accordionButton.classList.contains('open')) {
                accordionButton.classList.add('open');
            }
        }
    });
}, 300);

export function setLanguage(lang, skipRender = false) {
    state.currentLang = lang;
    saveSetting('language', lang);
    
    if (state.renderedTabs) state.renderedTabs.clear();

    const uiStrings = state.appData.ui;
    const processText = (textKey) => {
        let text = uiStrings?.[lang]?.[textKey] || uiStrings?.['en']?.[textKey] || `[${textKey}]`;
        return text.replace('{level}', state.currentLevel.toUpperCase());
    };

    document.querySelectorAll('[data-lang-key]').forEach(el => {
        el.textContent = processText(el.dataset.langKey);
    });
    document.querySelectorAll('[data-lang-placeholder-key]').forEach(el => {
        el.placeholder = processText(el.dataset.langPlaceholderKey);
    });
    document.querySelectorAll('.lang-switch button').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
    document.querySelectorAll('.lang-switch').forEach(moveLangPill);

    const activeNavButton = document.querySelector('.nav-item.active');
    if (activeNavButton && els.mobileHeaderTitle) {
        const titleSpan = activeNavButton.querySelector('span');
        const titleKey = titleSpan?.dataset.langKey;
        els.mobileHeaderTitle.textContent = titleKey ? processText(titleKey) : (titleSpan?.textContent || '');
    }

    if (!skipRender) {
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) {
            changeTab(activeTab.id, null, true, true, true);
        }
        updateProgressDashboard();
    }
    updateSearchPlaceholders(state.activeTab);
}

export function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark-mode');
    const newTheme = isDark ? 'dark' : 'light';

    saveSetting('theme', newTheme);
    try {
        localStorage.setItem('theme', newTheme);
    } catch (e) {
        console.warn("Could not save theme to localStorage.", e);
    }
    
    // Sync emoji button
    if (els.themeEmoji) {
        els.themeEmoji.textContent = isDark ? '🌙' : '☀️';
    }

    // Sync all toggle switches
    document.querySelectorAll('.theme-switch input').forEach(input => {
        input.checked = isDark;
    });
}


function showLoader() {
    if (!els.loadingOverlay) return;
    const newOverlay = els.loadingOverlay.cloneNode(true);
    els.loadingOverlay.parentNode.replaceChild(newOverlay, els.loadingOverlay);
    els.loadingOverlay = newOverlay;
    els.loadingOverlay.innerHTML = `<div class="loader"></div>`;
    els.loadingOverlay.classList.remove('hidden');
    requestAnimationFrame(() => {
        els.loadingOverlay.style.opacity = '1';
    });
}

function hideLoader() {
    return new Promise(resolve => {
        if (!els.loadingOverlay || els.loadingOverlay.style.opacity === '0') {
            resolve();
            return;
        }
        const onTransitionEnd = (e) => {
            if (e.target !== els.loadingOverlay) return;
            els.loadingOverlay.classList.add('hidden');
            els.loadingOverlay.removeEventListener('transitionend', onTransitionEnd);
            resolve();
        };
        els.loadingOverlay.addEventListener('transitionend', onTransitionEnd);
        els.loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            onTransitionEnd({ target: els.loadingOverlay });
        }, 500);
    });
}

async function loadLevelData(level) {
    state.currentLevel = level;
    await saveSetting('currentLevel', level);

    const dataPromises = [
        loadAllData(level),
        dbPromise.then(db => db.get('progress', state.currentLevel)),
        dbPromise.then(db => db.get('settings', 'levelSettings'))
    ];
    const [_, progressData, levelSettings] = await Promise.all(dataPromises);

    state.progress = progressData || { kanji: [], vocab: [] };
    state.pinnedTab = levelSettings?.[state.currentLevel]?.pinnedTab || null;
    
    state.fuseInstances = {};
    state.lastDictionaryQuery = '';
    state.notes.data = new Map();
    state.notes.originalContent = '';
    if (state.renderedTabs) state.renderedTabs.clear();

    const db = await dbPromise;
    const isCustomLevel = !!(await db.get('levels', level));
    if (!isCustomLevel) {
        // --- MODIFICATION START ---
        // Base tabs for all levels
        const tabsToPreload = ['kanji', 'vocab', 'grammar', 'keyPoints'];

        // Add hiragana and katakana only for non-advanced levels (e.g., N4, N5)
        if (!isAdvancedLevel(level)) {
            tabsToPreload.push('hiragana', 'katakana');
        }

        Promise.all(tabsToPreload.map(tabId => loadTabData(level, tabId).catch(err => {
            console.warn(`Non-critical preload of tab '${tabId}' failed.`, err);
        }))).then(() => console.log(`Pre-loading for level ${level} complete.`));
        // --- MODIFICATION END ---
    }
}

async function renderLevelUI(level, fromHistory) {
    document.querySelectorAll('.tab-content').forEach(c => { c.innerHTML = ''; });
    updateProgressDashboard();
    setLanguage(state.currentLang, true);
    document.querySelectorAll('.level-switch-button').forEach(btn => btn.classList.toggle('active', btn.dataset.levelName === level));
    updateSidebarPinIcons();

    await setupTabsForLevel(level);

    const isFoundationLevel = !isAdvancedLevel(level); // True for N4, N5, custom levels
    const isMobileView = window.innerWidth <= 768;
    const defaultTab = isMobileView ? 'external-search' : (isFoundationLevel ? 'hiragana' : 'keyPoints');

    let targetTab = state.pinnedTab || defaultTab;
    // If a high level is loaded but an old 'hiragana' tab pin exists, reset it.
    if (isAdvancedLevel(level) && (targetTab === 'hiragana' || targetTab === 'katakana')) {
        targetTab = 'keyPoints';
        state.pinnedTab = null;
        await savePinnedTab(null);
    }

    await changeTab(targetTab, null, false, fromHistory, true);
}

export async function setLevel(level, fromHistory = false) {
    if (state.isSwitchingLevel || level === state.currentLevel) {
        if (level === state.currentLevel) closeSidebar();
        return;
    }

    state.isSwitchingLevel = true;
    state.loadingStatus = 'loading';
    const minimumDisplayTimePromise = new Promise(resolve => setTimeout(resolve, 500));
    showLoader();

    try {
        await Promise.all([
            loadLevelData(level),
            minimumDisplayTimePromise
        ]);
        await renderLevelUI(level, fromHistory);
        state.loadingStatus = 'idle';
    } catch (error) {
        console.error(`Failed to load level ${level}:`, error);
        state.loadingStatus = 'error';
        if (els.loadingOverlay) {
            const title = getUIText('errorLoadLevelTitle');
            const body = getUIText('errorLoadLevelBody');
            showCustomAlert(title, `${error.message}\n\n${body}`);
        }
        return; 
    } finally {
        state.isSwitchingLevel = false;
        if (state.loadingStatus !== 'error') {
            await hideLoader();
        }
        closeSidebar();
    }
}

async function savePinnedTab(tabId) {
    try {
        const db = await dbPromise;
        let levelSettings = (await db.get('settings', 'levelSettings')) || {};
        levelSettings[state.currentLevel] = { ...levelSettings[state.currentLevel], pinnedTab: tabId || null };
        await saveSetting('levelSettings', levelSettings);
        updatePinButtonState(tabId);
        updateSidebarPinIcons();
    } catch (error) {
        console.error("Error saving pinned tab setting:", error);
    }
}

export function togglePin() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    const tabId = activeTab.id;
    if (state.pinnedTab === tabId) {
        els.pinToggle.classList.add('unpinning');
        els.pinToggle.addEventListener('animationend', () => els.pinToggle.classList.remove('unpinning'), { once: true });
    }
    state.pinnedTab = (state.pinnedTab === tabId) ? null : tabId;
    savePinnedTab(state.pinnedTab);
}

export function toggleSidebarPin(event, tabId) {
    event.stopPropagation();
    state.pinnedTab = (state.pinnedTab === tabId) ? null : tabId;
    savePinnedTab(state.pinnedTab);
}

function updateTabUI(tabName) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tabName === tabName));
    const targetButton = document.querySelector(`.nav-item[data-tab-name="${tabName}"]`);
    
    const isMobileView = window.innerWidth <= 768;
    if (isMobileView) {
        if (els.mobileSearchBar) els.mobileSearchBar.classList.toggle('visible', tabName !== 'progress');
        if (targetButton && els.mobileHeaderTitle) {
            const titleSpan = targetButton.querySelector('span');
            const titleKey = titleSpan?.dataset.langKey;
            els.mobileHeaderTitle.textContent = titleKey ? getUIText(titleKey) : (titleSpan?.textContent || '');
        }
    }
    
    if (els.pinToggle) {
        els.pinToggle.style.display = isMobileView ? 'block' : 'none';
        updatePinButtonState(tabName);
    }

    const isNotesEligible = !['progress', 'external-search'].includes(tabName);
    const displayStyle = isNotesEligible ? 'flex' : 'none';
    if (els.desktopNotesBtn) els.desktopNotesBtn.style.display = displayStyle;
    if (els.mobileNotesBtn) els.mobileNotesBtn.style.display = displayStyle;
    
    updateSearchPlaceholders(tabName);
}

export async function changeTab(tabName, buttonElement, suppressScroll = false, fromHistory = false, forceRender = false) {
    const activeTabEl = document.querySelector('.tab-content.active');
    if (activeTabEl?.id === tabName && !forceRender) {
        closeSidebar();
        return;
    }

    state.activeTab = tabName;
    updateTabUI(tabName);
    closeSidebar();

    if (activeTabEl) {
        state.tabScrollPositions.set(activeTabEl.id, window.scrollY);
        activeTabEl.classList.remove('active');
    }
    const newTabContentEl = document.getElementById(tabName);
    if (!newTabContentEl) {
        console.error(`Tab container not found for tab: ${tabName}`);
        return;
    }
    newTabContentEl.classList.add('active');

    if (!fromHistory) {
        const url = `?level=${state.currentLevel}&tab=${tabName}`;
        history.pushState({ type: 'tab', tabName, level: state.currentLevel }, '', url);
    }

    if (activeTabEl?.id === 'external-search') {
        state.lastDictionaryQuery = getActiveSearchInput().value.trim();
    }

    const isDataTab = !['external-search', 'progress'].includes(tabName);

    if (isDataTab) {
        if (forceRender || !state.renderedTabs.has(tabName)) {
            const loaderTemplate = document.getElementById('content-loader-template');
            newTabContentEl.innerHTML = loaderTemplate ? loaderTemplate.innerHTML : '<div class="loader"></div>';
            
            try {
                if (!state.appData[tabName]) {
                    await loadTabData(state.currentLevel, tabName);
                }
                
                await renderContent(tabName);
                state.renderedTabs.set(tabName, newTabContentEl.innerHTML);
            } catch (error) {
                console.error(`Error loading or rendering data for tab ${tabName}:`, error);
                renderContentNotAvailable(tabName);
                state.renderedTabs.delete(tabName);
            }
        } else {
            newTabContentEl.innerHTML = state.renderedTabs.get(tabName);
            setupFuseForTab(tabName);
        }
    } else if (tabName === 'external-search') {
        newTabContentEl.innerHTML = '';
        getActiveSearchInput().value = state.lastDictionaryQuery;
        handleExternalSearch(state.lastDictionaryQuery, false, true);
    } else if (tabName === 'progress') {
        updateProgressDashboard();
    }

    if (isDataTab && getActiveSearchInput().value) {
        getActiveSearchInput().value = '';
        handleSearch.cancel(); 
        handleSearch(); 
    }

    if (!suppressScroll) {
        window.scrollTo({ top: state.tabScrollPositions.get(tabName) || 0, behavior: 'instant' });
    }
}


export function jumpToSection(tabName, sectionTitleKey) {
    const activeTab = document.querySelector('.tab-content.active');
    const isAlreadyOnTab = activeTab?.id === tabName;
    
    const scrollToAction = () => {
        requestAnimationFrame(() => {
            const sectionHeader = document.querySelector(`[data-section-title-key="${sectionTitleKey}"]`);
            if (!sectionHeader) return;

            const accordionWrapper = sectionHeader.closest('.accordion-wrapper');
            if (accordionWrapper && sectionHeader.tagName === 'BUTTON' && !sectionHeader.classList.contains('open')) {
                sectionHeader.click();
            }

            setTimeout(() => {
                const elementRect = sectionHeader.getBoundingClientRect();
                const absoluteElementTop = elementRect.top + window.scrollY;
                const mobileHeader = document.querySelector('.mobile-header.sticky');
                const headerOffset = (mobileHeader?.isConnected && getComputedStyle(mobileHeader).position === 'sticky') ? mobileHeader.offsetHeight : 0;
                
                window.scrollTo({
                    top: absoluteElementTop - headerOffset - 20,
                    behavior: 'smooth'
                });

                const itemToHighlight = sectionHeader.closest('.progress-item-wrapper, .search-wrapper, .accordion-wrapper');
                if (itemToHighlight) {
                    itemToHighlight.classList.add('is-highlighted');
                    itemToHighlight.addEventListener('animationend', () => {
                        itemToHighlight.classList.remove('is-highlighted');
                    }, { once: true });
                }
            }, 100);
        });
    };

    if (isAlreadyOnTab) {
        scrollToAction();
    } else {
        changeTab(tabName, null, true).then(scrollToAction);
    }
}

export async function deleteLevel(level) {
    if (level === config.defaultLevel) {
        showCustomAlert(getUIText('errorTitle', 'Error'), getUIText('errorDeleteDefaultLevel'));
        return;
    }

    const confirmed = await showCustomConfirm(
        getUIText('confirmDeleteLevelTitle', 'Confirm Deletion'),
        getUIText('confirmDeleteLevel', { level: level.toUpperCase() })
    );

    if (!confirmed) {
        return;
    }
    
    try {
        const db = await dbPromise;
        await Promise.all([
            db.delete('levels', level),
            db.delete('progress', level),
            deleteNotesForLevel(level)
        ]);
        
        state.allAvailableLevels = state.allAvailableLevels.filter(l => l !== level);
        if (state.currentLevel === level) {
            await setLevel(config.defaultLevel);
        } else {
            const remoteResponse = await fetch(`${config.dataPath}/levels.json`);
            const remoteData = remoteResponse.ok ? await remoteResponse.json() : { levels: [] };
            const customLevels = await db.getAllKeys('levels');
            buildLevelSwitcher(remoteData.levels || [config.defaultLevel], customLevels);
            document.querySelectorAll('.level-switch-button').forEach(btn => btn.classList.toggle('active', btn.dataset.levelName === state.currentLevel));
        }
        showCustomAlert(getUIText('successTitle', 'Success'), getUIText('successDeleteLevel', { level: level.toUpperCase() }));
    } catch (error) {
        console.error("Failed to delete level:", error);
        showCustomAlert(getUIText('errorTitle', 'Error'), getUIText('errorDeleteLevel'));
    }
}