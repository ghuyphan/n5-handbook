/**
 * @module handlers
 * @description Contains event handlers and core application logic for the event-driven architecture.
 */

import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';
import { els } from './dom.js';
import { state, config } from './config.js';
import { debounce } from './utils.js';
import { dbPromise, saveProgress, saveSetting, loadAllData, loadTabData, deleteNotesForLevel } from './database.js';
import { renderContent, updateProgressDashboard, updateSearchPlaceholders, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher } from './ui.js';
import { handleExternalSearch } from './jotoba.js';

// --- HELPER FUNCTIONS ---

function getUIText(key, replacements = {}) {
    let text = state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;
    for (const [placeholder, value] of Object.entries(replacements)) {
        text = text.replace(`{${placeholder}}`, value);
    }
    return text;
}

// REFINED: Added a helper to get the currently relevant search input element.
// This avoids repeating the same ternary logic (DRY principle).
function getActiveSearchInput() {
    return window.innerWidth <= 768 ? els.mobileSearchInput : els.searchInput;
}

// --- DOM MANIPULATION ---

function removeHighlights(container) {
    const marks = Array.from(container.querySelectorAll('mark.search-highlight'));
    marks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize(); // Merges adjacent text nodes for a clean DOM.
        }
    });
}

function highlightMatches(element, query) {
    if (!query) return;
    const regex = new RegExp(`(${query.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1")})`, 'gi');
    
    // Using TreeWalker is more performant than recursing through childNodes for deep trees.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const nodesToModify = [];
    let currentNode;
    while (currentNode = walker.nextNode()) {
        if (regex.test(currentNode.nodeValue)) {
            nodesToModify.push(currentNode);
        }
    }
    
    // Batching modifications reduces layout thrashing.
    nodesToModify.forEach(node => {
        const fragment = document.createDocumentFragment();
        const parts = node.nodeValue.split(regex);
        parts.forEach(part => {
            if (part.toLowerCase() === query.toLowerCase()) {
                const mark = document.createElement('mark');
                mark.className = 'search-highlight';
                mark.textContent = part;
                fragment.appendChild(mark);
            } else {
                fragment.appendChild(document.createTextNode(part));
            }
        });
        if (node.parentNode) {
            node.parentNode.replaceChild(fragment, node);
        }
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
    const searchableElements = container.querySelectorAll('[data-search-item], [data-search]');
    const collection = Array.from(searchableElements).map((el, index) => ({
        id: el.dataset.itemId || `${tabId}-${index}`,
        element: el,
        searchData: el.dataset.searchItem || el.dataset.search
    }));
    if (collection.length > 0) {
        state.fuseInstances[tabId] = new Fuse(collection, {
            keys: ['searchData'],
            includeScore: true,
            threshold: 0.3,
            ignoreLocation: true,
        });
    }
}

export const handleSearch = debounce(() => {
    const query = getActiveSearchInput().value.trim(); // REFINED: Use helper function
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;

    const activeTabId = activeTab.id;
    if (activeTabId === 'external-search') {
        handleExternalSearch(query);
        return;
    }
    
    removeHighlights(activeTab);
    const fuse = state.fuseInstances[activeTabId];
    const allItems = activeTab.querySelectorAll('[data-search-item], [data-search]');
    
    if (!query) {
        allItems.forEach(item => { item.style.display = ''; });
        activeTab.querySelectorAll('.search-wrapper').forEach(wrapper => { wrapper.style.display = ''; });
        return;
    }

    if (!fuse) return;
    allItems.forEach(item => { item.style.display = 'none'; });
    activeTab.querySelectorAll('.search-wrapper').forEach(wrapper => { wrapper.style.display = 'none'; });
    
    const results = fuse.search(query);
    results.forEach(result => {
        const itemElement = result.item.element;
        itemElement.style.display = '';
        highlightMatches(itemElement, query);
        let parent = itemElement.closest('.search-wrapper');
        if (parent) parent.style.display = '';
        let accordion = itemElement.closest('.accordion-wrapper');
        if (accordion) {
            const button = accordion.querySelector('.accordion-button');
            if (button && !button.classList.contains('open')) button.classList.add('open');
        }
    });
}, 300);

export function setLanguage(lang, skipRender = false) {
    state.currentLang = lang;
    saveSetting('language', lang);
    
    // OPTIMIZED: Invalidate the rendered tab cache as all text content is now stale.
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
        // OPTIMIZED: Instead of re-rendering all tabs, just force re-render the active one.
        // Others will be re-rendered on-demand when switched to, using the now-empty cache.
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab) {
            changeTab(activeTab.id, null, true, true, true);
        }
        updateProgressDashboard();
    }
    updateSearchPlaceholders(state.activeTab);
}

// In handlers.js

export function toggleTheme(event) {
    const isChecked = event.target.checked;
    const theme = isChecked ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark-mode', isChecked);

    try {
        localStorage.setItem('theme', theme);
    } catch (e) {
        console.warn("Could not save theme to localStorage.", e);
    }
    saveSetting('theme', theme);
    document.querySelectorAll('.theme-switch input').forEach(input => {
        if (input !== event.target) input.checked = isChecked;
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
        setTimeout(() => { // Fallback in case the event doesn't fire.
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
    
    // OPTIMIZED: Clear all caches for the new level in one place.
    state.fuseInstances = {};
    state.lastDictionaryQuery = '';
    state.notes.clear();
    if (state.renderedTabs) state.renderedTabs.clear();

    const db = await dbPromise;
    const isCustomLevel = !!(await db.get('levels', level));
    if (!isCustomLevel) {
        // OPTIMIZED: Pre-load data for all tabs in parallel (fire-and-forget).
        // This makes subsequent tab switches feel instant as data is already in memory.
        const allTabs = ['kanji', 'vocab', 'hiragana', 'katakana', 'grammar', 'keyPoints'];
        Promise.all(allTabs.map(tabId => loadTabData(level, tabId).catch(err => {
            console.warn(`Non-critical preload of tab '${tabId}' failed.`, err);
        }))).then(() => console.log(`Pre-loading for level ${level} complete.`));
    }
}

async function renderLevelUI(level, fromHistory) {
    document.querySelectorAll('.tab-content').forEach(c => { c.innerHTML = ''; });
    updateProgressDashboard();
    setLanguage(state.currentLang, true); // Update UI text without re-rendering content yet
    document.querySelectorAll('.level-switch-button').forEach(btn => btn.classList.toggle('active', btn.dataset.levelName === level));
    updateSidebarPinIcons();
    const isMobileView = window.innerWidth <= 768;
    const defaultTab = isMobileView ? 'external-search' : 'hiragana';
    const targetTab = state.pinnedTab || defaultTab;
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
        state.loadingSßßtatus = 'error';
        if (els.loadingOverlay) {
            const title = getUIText('errorLoadLevelTitle');
            const body = getUIText('errorLoadLevelBody');
            els.loadingOverlay.innerHTML = `<div class="text-center p-4"><h3 class="text-xl font-semibold text-white mb-2">${title}</h3><p class="text-red-300">${error.message}</p><p class="text-gray-300 mt-4">${body}</p></div>`;
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

/**
 * REFINED: Updates the UI elements (buttons, headers, etc.) related to a tab switch.
 * @param {string} tabName The name of the tab being activated.
 */
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
    if (!fromHistory) {
        const url = `?level=${state.currentLevel}&tab=${tabName}`;
        history.pushState({ type: 'tab', tabName, level: state.currentLevel }, '', url);
    }

    // Immediately update the main UI components for a responsive feel.
    // This happens *before* any data is awaited.
    updateTabUI(tabName);

    if (activeTabEl) {
        state.tabScrollPositions.set(activeTabEl.id, window.scrollY);
        if (activeTabEl.id === 'external-search') {
            state.lastDictionaryQuery = getActiveSearchInput().value.trim();
        }
    }

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const activeTab = document.getElementById(tabName);
    if (!activeTab) {
        console.error(`Tab container not found for tab: ${tabName}`);
        return;
    }
    activeTab.classList.add('active');

    const isDataTab = !['external-search', 'progress'].includes(tabName);

    // OPTIMIZED: Caching logic for data-heavy tabs
    if (isDataTab) {
        if (state.renderedTabs.has(tabName) && !forceRender) {
            activeTab.innerHTML = state.renderedTabs.get(tabName);
        } else {
            const isDataMissing = !state.appData[tabName];
            if (isDataMissing) {
                const loaderTemplate = document.getElementById('content-loader-template');
                activeTab.innerHTML = '';
                if (loaderTemplate) activeTab.appendChild(loaderTemplate.content.cloneNode(true));

                try {
                    await loadTabData(state.currentLevel, tabName);
                    renderContent(tabName);
                    state.renderedTabs.set(tabName, activeTab.innerHTML); // Cache the result
                } catch (error) {
                    console.error(`Error loading data for tab ${tabName}:`, error);
                    const title = getUIText('errorLoadContentTitle');
                    const body = getUIText('errorLoadContentBody');
                    activeTab.innerHTML = `<div class="p-6 text-center text-secondary"><h3 class="font-semibold text-lg text-primary mb-2">${title}</h3><p class="text-red-400">${error.message}</p><p class="mt-2">${body}</p></div>`;
                }
            } else {
                renderContent(tabName);
                state.renderedTabs.set(tabName, activeTab.innerHTML); // Cache the result
            }
        }
    }

    if (tabName === 'external-search') {
        getActiveSearchInput().value = state.lastDictionaryQuery;
        handleExternalSearch(state.lastDictionaryQuery);
    } else if (tabName === 'progress') {
        updateProgressDashboard(); // Always update progress dashboard on view
    } else {
        const searchInput = getActiveSearchInput();
        if(searchInput.value) {
            searchInput.value = '';
            handleSearch();
        }
    }
    
    closeSidebar();

    if (!suppressScroll) {
        window.scrollTo({ top: state.tabScrollPositions.get(tabName) || 0, behavior: 'instant' });
    }
}

export function jumpToSection(tabName, sectionTitleKey) {
    const activeTab = document.querySelector('.tab-content.active');
    const isAlreadyOnTab = activeTab?.id === tabName;
    
    const scrollToAction = () => {
        // REFINED: Use requestAnimationFrame to ensure the element exists before we try to scroll.
        requestAnimationFrame(() => {
            const sectionHeader = document.querySelector(`[data-section-title-key="${sectionTitleKey}"]`);
            if (!sectionHeader) return;

            const accordionWrapper = sectionHeader.closest('.accordion-wrapper');
            if (accordionWrapper && sectionHeader.tagName === 'BUTTON' && !sectionHeader.classList.contains('open')) {
                sectionHeader.click();
            }

            setTimeout(() => { // Timeout allows accordion to animate open.
                const elementRect = sectionHeader.getBoundingClientRect();
                const absoluteElementTop = elementRect.top + window.scrollY;
                const mobileHeader = document.querySelector('.mobile-header.sticky');
                const headerOffset = (mobileHeader?.isConnected && getComputedStyle(mobileHeader).position === 'sticky') ? mobileHeader.offsetHeight : 0;
                
                window.scrollTo({
                    top: absoluteElementTop - headerOffset - 20, // 20px buffer
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
    // REFINED: Use getUIText for translatable user-facing messages.
    if (level === config.defaultLevel) {
        alert(getUIText('errorDeleteDefaultLevel'));
        return;
    }
    if (!confirm(getUIText('confirmDeleteLevel', { level: level.toUpperCase() }))) {
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
        alert(getUIText('successDeleteLevel', { level: level.toUpperCase() }));
    } catch (error) {
        console.error("Failed to delete level:", error);
        alert(getUIText('errorDeleteLevel'));
    }
}