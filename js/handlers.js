import Fuse from 'fuse.js';
import { els } from './dom.js';
import { state, config } from './config.js';
import { debounce } from './utils.js';
import { dbPromise, saveProgress, saveSetting, loadAllData, loadTabData, deleteNotesForLevel, saveNote, loadNote } from './database.js';
import { renderContent, updateProgressDashboard, updateSearchPlaceholders, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher, renderContentNotAvailable, showCustomAlert, showCustomConfirm, setupTabsForLevel } from './ui.js';
import { handleExternalSearch } from './jotoba.js';

// --- OPTIMIZATION: Cache for searchable items and their original state ---
const searchCache = new Map();

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

// --- OPTIMIZED DOM MANIPULATION -- -

function clearAllHighlights(activeTabId) {
    if (!searchCache.has(activeTabId)) return;

    const cachedItems = searchCache.get(activeTabId);
    for (const item of cachedItems) {
        if (item.originalHTML) {
            item.element.innerHTML = item.originalHTML;
            delete item.originalHTML; // Clean up cache
        }
    }
}

function highlightMatches(element, query) {
    if (!query) return;

    const cacheEntry = searchCache.get(state.activeTab)?.find(item => item.element === element);
    if (cacheEntry && !cacheEntry.originalHTML) {
        cacheEntry.originalHTML = element.innerHTML; // Store original state only once
    }

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

export function setupFuseForTab(tabId) {
    if (state.fuseInstances[tabId] || !state.appData[tabId]) return;

    const container = document.getElementById(tabId);
    if (!container) return;

    // OPTIMIZATION: Cache searchable elements to avoid re-querying the DOM
    const searchableElements = Array.from(container.querySelectorAll('[data-search-item], [data-search]'));
    searchCache.set(tabId, searchableElements.map(el => ({ element: el })));

    const fuseCollection = searchableElements.map((el, index) => ({
        id: el.dataset.itemId || `${tabId}-${index}`,
        element: el,
        searchData: el.dataset.searchItem || el.dataset.search
    }));

    if (fuseCollection.length > 0) {
        state.fuseInstances[tabId] = new Fuse(fuseCollection, {
            keys: ['searchData'],
            includeScore: true,
            threshold: 0.3,
            ignoreLocation: true,
        });
    }
}


export const handleSearch = debounce(() => {
    const query = getActiveSearchInput().value.trim();
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;

    const activeTabId = activeTab.id;
    if (activeTabId === 'external-search') {
        handleExternalSearch(query);
        return;
    }
    
    const allItems = searchCache.get(activeTabId)?.map(item => item.element) || [];
    const allWrappers = activeTab.querySelectorAll('.search-wrapper');

    clearAllHighlights(activeTabId);

    if (!query) {
        allItems.forEach(item => { item.style.display = ''; });
        allWrappers.forEach(wrapper => { wrapper.style.display = ''; });
        return;
    }

    const fuse = state.fuseInstances[activeTabId];
    if (!fuse) return;
    
    allItems.forEach(item => { item.style.display = 'none'; });
    allWrappers.forEach(wrapper => { wrapper.style.display = 'none'; });
    
    const results = fuse.search(query);
    results.forEach(result => {
        const itemElement = result.item.element;
        itemElement.style.display = '';
        highlightMatches(itemElement, query);
        
        const parentWrapper = itemElement.closest('.search-wrapper');
        if (parentWrapper) parentWrapper.style.display = '';

        const accordion = itemElement.closest('.accordion-wrapper');
        if (accordion) {
            const button = accordion.querySelector('.accordion-button');
            if (button && !button.classList.contains('open')) button.classList.add('open');
        }
    });
}, 300);

export function setLanguage(lang, skipRender = false) {
    state.currentLang = lang;
    saveSetting('language', lang);
    
    // MODIFIED: Clear the renderedTabs cache since it will be stale
    if (state.renderedTabs) state.renderedTabs.clear();
    searchCache.clear();

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

export function toggleTheme(event) {
    const isChecked = event.target.checked;
    const theme = isChecked ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark-mode', isChecked);
    // Save to both IndexedDB and LocalStorage to fix the refresh bug
    saveSetting('theme', theme);
    try {
        localStorage.setItem('theme', theme);
    } catch (e) {
        console.warn("Could not save theme to localStorage.", e);
    }


    document.querySelectorAll('.theme-switch input').forEach(input => {
        if (input !== event.target) input.checked = isChecked;
    });

    const desktopEmojiSpan = document.getElementById('theme-emoji');
    if (desktopEmojiSpan) {
        desktopEmojiSpan.textContent = isChecked ? '🌙' : '☀️';
    }
}

function showLoader() {
    if (!els.loadingOverlay) return;
    const newOverlay = els.loadingOverlay.cloneNode(true);
    els.loadingOverlay.parentNode.replaceChild(newOverlay, els.loadingOverlay);
    els.loadingOverlay.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 3000" class="h-24 w-24 app-loader-logo"><rect width="3000" height="3000" rx="660" ry="660" fill="#2998ff" /><path d="M1326 2670 c-182 -76 -299 -241 -301 -422 0 -38 0 -68 0 -68 0 0 -27 9 -60 19 -96 30 -152 34 -235 17 -113 -24 -174 -58 -267 -151 l-82 -82 18 -48 19 -49 -46 -29 -45 -28 6 -73 c13 -145 73 -266 172 -347 46 -36 171 -99 198 -99 17 0 16 -3 -8 -31 -122 -146 -138 -388 -36 -574 l38 -70 60 2 60 3 12 -60 12 -59 64 -20 c135 -42 240 -36 362 19 68 31 183 132 211 185 l15 30 21 -29 c62 -87 145 -156 238 -198 94 -43 219 -46 343 -7 l64 19 6 48 c4 26 8 52 9 57 2 6 29 10 62 10 59 0 59 0 90 46 49 74 77 174 77 282 0 53 -7 113 -16 143 -19 63 -63 152 -90 182 -20 21 -20 22 -1 22 36 1 131 47 191 93 105 81 162 192 181 355 l8 73 -47 26 -47 27 15 44 c20 56 12 72 -78 156 -78 74 -146 110 -248 132 -81 16 -165 9 -250 -21 -55 -19 -52 -19 -46 8 11 41 -15 160 -50 235 -57 120 -166 212 -302 252 -40 12 -43 12 -83 -20 l-41 -33 -44 32 c-24 17 -47 31 -52 30 -4 0 -39 -13 -77 -29z m386 -63 c148 -86 239 -269 221 -440 l-6 -58 34 20 c91 52 244 69 351 37 71 -20 168 -86 221 -148 l39 -47 -16 -47 c-9 -26 -16 -51 -16 -56 0 -5 20 -18 45 -30 42 -21 45 -24 45 -62 0 -61 -27 -163 -57 -218 -54 -99 -180 -190 -305 -219 l-56 -13 39 -44 c69 -78 119 -211 119 -315 0 -67 -26 -161 -63 -232 l-32 -60 -65 0 -64 0 -11 -60 c-12 -70 -25 -80 -131 -97 -87 -15 -187 1 -268 41 -72 35 -172 131 -207 196 -13 25 -27 45 -30 45 -3 0 -22 -26 -42 -58 -117 -189 -340 -274 -540 -206 l-45 15 -9 62 -8 62 -64 0 c-61 0 -64 1 -87 35 -66 95 -92 263 -59 375 23 79 58 147 102 196 20 22 34 41 32 42 -2 2 -31 11 -64 21 -214 64 -345 230 -345 435 0 34 4 39 45 59 25 12 45 26 45 31 0 4 -7 28 -15 51 -8 24 -13 51 -10 61 11 32 128 132 191 161 135 63 246 59 427 -17 17 -7 18 -3 12 51 -20 175 84 362 245 443 78 38 96 39 146 2 l39 -29 45 33 c43 32 45 33 87 20 23 -7 62 -24 85 -38z" fill="none" stroke="#ffffff" stroke-width="75" stroke-linejoin="round" transform="translate(0, 3000) scale(1, -1)"></path><text x="1500" y="1450" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" text-anchor="middle" fill="#ffffff"><tspan font-size="480" font-weight="bold" class="loader-text-jlpt">JLPT</tspan><tspan x="1500" dy="330" font-size="210" font-weight="500" letter-spacing="7.5" class="loader-text-handbook">HANDBOOK</tspan></text></svg>`;
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
    
    // MODIFIED: Also load the accordion state for the new level
    const currentLevelSettings = levelSettings?.[state.currentLevel];
    state.pinnedTab = currentLevelSettings?.pinnedTab || null;
    state.openAccordions = new Map(
        (currentLevelSettings?.openAccordions || []).map(([tabId, keys]) => [tabId, new Set(keys)])
    );
    
    state.fuseInstances = {};
    state.lastDictionaryQuery = '';
    state.notes.data = new Map();
    state.notes.originalContent = '';
    // MODIFIED: Clear the renderedTabs cache since it will be stale
    if (state.renderedTabs) state.renderedTabs.clear(); 
    searchCache.clear();

    const db = await dbPromise;
    const isCustomLevel = !!(await db.get('levels', level));
    if (!isCustomLevel) {
        const allTabs = ['kanji', 'vocab', 'hiragana', 'katakana', 'grammar', 'keyPoints'];
        Promise.all(allTabs.map(tabId => loadTabData(level, tabId).catch(err => {
            console.warn(`Non-critical preload of tab '${tabId}' failed.`, err);
        }))).then(() => console.log(`Pre-loading for level ${level} complete.`));
    }
}


async function renderLevelUI(level, fromHistory) {
    document.querySelectorAll('.tab-content').forEach(c => { c.innerHTML = ''; });
    updateProgressDashboard();
    setLanguage(state.currentLang, true);
    document.querySelectorAll('.level-switch-button').forEach(btn => btn.classList.toggle('active', btn.dataset.levelName === level));
    updateSidebarPinIcons();

    await setupTabsForLevel(level);

    const isN4OrN5 = ['n4', 'n5'].includes(level);
    const isMobileView = window.innerWidth <= 768;
    const defaultTab = isMobileView ? 'external-search' : (isN4OrN5 ? 'hiragana' : 'keyPoints');

    let targetTab = state.pinnedTab || defaultTab;
    if (!isN4OrN5 && (targetTab === 'hiragana' || targetTab === 'katakana')) {
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
    const hasData = state.appData[tabName];

    if (isDataTab) {
        if (hasData) {
            renderContent(tabName);
        } else {
            const db = await dbPromise;
            const isCustomLevel = await db.get('levels', state.currentLevel);
            if (isCustomLevel) {
                renderContentNotAvailable(tabName);
            } else {
                const loaderTemplate = document.getElementById('content-loader-template');
                newTabContentEl.innerHTML = loaderTemplate ? loaderTemplate.innerHTML : '<div class="loader"></div>';
                try {
                    await loadTabData(state.currentLevel, tabName);
                    renderContent(tabName);
                } catch (error) {
                    console.error(`Error loading data for tab ${tabName}:`, error);
                    const title = getUIText('errorLoadContentTitle');
                    const body = getUIText('errorLoadContentBody');
                    showCustomAlert(title, `${error.message}\n\n${body}`);
                }
            }
        }
    }

    if (tabName === 'external-search') {
        getActiveSearchInput().value = state.lastDictionaryQuery;
        handleExternalSearch(state.lastDictionaryQuery, false, true);
    } else if (tabName === 'progress') {
        updateProgressDashboard();
    } else {
        const searchInput = getActiveSearchInput();
        if(searchInput.value) {
            searchInput.value = '';
            handleSearch();
        }
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