/**
 * @module handlers
 * @description Contains event handlers and core application logic for the event-driven architecture.
 */

import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';
import { els } from './dom.js';
import { state, config } from './config.js';
import { debounce } from './utils.js';
import { dbPromise, saveProgress, saveSetting, loadAllData, loadTabData } from './database.js';
import { renderContent, updateProgressDashboard, updateSearchPlaceholders, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher } from './ui.js';
import { handleExternalSearch } from './jotoba.js';

function removeHighlights(container) {
    const marks = Array.from(container.querySelectorAll('mark.search-highlight'));
    marks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        }
    });
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
    const isMobileView = window.innerWidth <= 768;
    const query = (isMobileView ? els.mobileSearchInput.value : els.searchInput.value).trim();
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;

    const activeTabId = activeTab.id;

    if (activeTabId === 'external-search') {
        handleExternalSearch(query);
    } else {
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
    }
}, 300);

export function setLanguage(lang, skipRender = false) {
    state.currentLang = lang;
    saveSetting('language', lang);
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
    if (activeNavButton) {
        const titleSpan = activeNavButton.querySelector('span');
        const titleKey = titleSpan?.dataset.langKey;
        if (titleKey && els.mobileHeaderTitle) {
            els.mobileHeaderTitle.textContent = processText(titleKey);
        } else if (titleSpan && els.mobileHeaderTitle) {
            els.mobileHeaderTitle.textContent = titleSpan.textContent;
        }
    }

    if (!skipRender) {
        state.fuseInstances = {};
        // Re-render all currently loaded tabs with the new language
        Object.keys(state.appData).forEach(tabId => {
            if (tabId !== 'ui' && document.getElementById(tabId)?.innerHTML) {
                renderContent(tabId);
            }
        });
        updateProgressDashboard();
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'external-search') {
            handleExternalSearch(state.lastDictionaryQuery, true);
        }
    }
    updateSearchPlaceholders(state.activeTab);
}

export function toggleTheme(event) {
    const isChecked = event.target.checked;
    document.documentElement.classList.toggle('dark-mode', isChecked);
    try {
        localStorage.setItem('theme', isChecked ? 'dark' : 'light');
    } catch (e) {
        console.warn("Could not save theme to localStorage.", e);
    }
    document.querySelectorAll('.theme-switch input').forEach(input => {
        if (input !== event.target) input.checked = isChecked;
    });
}

/**
 * Shows the loading overlay with a fade-in effect.
 * Clones the overlay element to clear any lingering event listeners from previous,
 * potentially interrupted, level switches. This is a key step to prevent race conditions.
 */
function showLoader() {
    if (!els.loadingOverlay) return;

    // Clone the node to remove all old event listeners.
    const newOverlay = els.loadingOverlay.cloneNode(true);
    els.loadingOverlay.parentNode.replaceChild(newOverlay, els.loadingOverlay);
    els.loadingOverlay = newOverlay; // Update the reference in our DOM cache.
    els.loadingOverlay.innerHTML = `<div class="loader"></div>`; // Ensure default content

    els.loadingOverlay.classList.remove('hidden');
    
    // Using requestAnimationFrame ensures the browser has processed the class removal 
    // before we trigger the opacity transition, guaranteeing a smooth animation.
    requestAnimationFrame(() => {
        els.loadingOverlay.style.opacity = '1';
    });
}

/**
 * Hides the loading overlay and returns a promise that resolves when the
 * fade-out transition is complete.
 * @returns {Promise<void>} A promise that resolves when the loader is fully hidden.
 */
function hideLoader() {
    return new Promise(resolve => {
        if (!els.loadingOverlay || els.loadingOverlay.style.opacity === '0') {
            resolve();
            return;
        }

        const onTransitionEnd = () => {
            els.loadingOverlay.classList.add('hidden');
            els.loadingOverlay.removeEventListener('transitionend', onTransitionEnd);
            resolve();
        };

        els.loadingOverlay.addEventListener('transitionend', onTransitionEnd);
        els.loadingOverlay.style.opacity = '0';

        // Safety fallback: If the transitionend event doesn't fire for any reason,
        // resolve the promise after a timeout to prevent the app from getting stuck.
        setTimeout(() => {
            // This will only run if onTransitionEnd hasn't already resolved the promise.
            console.warn("Loader transitionend fallback triggered.");
            onTransitionEnd();
        }, 500); // Should be slightly longer than your CSS transition duration (400ms).
    });
}

/**
 * Fetches all necessary data for the given level and updates the application state.
 * This includes level-specific content, user progress, and settings.
 * @param {string} level - The level identifier to load data for.
 */
async function loadLevelData(level) {
    state.currentLevel = level;
    await saveSetting('currentLevel', level);

    // Fetch core data concurrently for performance.
    const dataPromises = [
        loadAllData(level), // Loads UI and custom level data. Modifies state.appData directly.
        dbPromise.then(db => db.get('progress', state.currentLevel)),
        dbPromise.then(db => db.get('settings', 'levelSettings'))
    ];

    // The result of loadAllData is not used here because it operates via side effects on `state.appData`.
    const [_, progressData, levelSettings] = await Promise.all(dataPromises);

    // Preload tabs for default levels (non-critical, can fail gracefully).
    const db = await dbPromise;
    const isCustomLevel = !!(await db.get('levels', level));
    if (!isCustomLevel) {
        const tabsToPreload = ['kanji', 'vocab', 'hiragana', 'katakana', 'grammar', 'keyPoints'];
        await Promise.all(
            tabsToPreload.map(tabId => loadTabData(level, tabId).catch(err => {
                console.warn(`Could not pre-load tab '${tabId}' for level '${level}'.`, err);
            }))
        );
    }
    
    // Update the rest of the state after all data is successfully fetched.
    state.progress = progressData || { kanji: [], vocab: [] };
    state.pinnedTab = levelSettings?.[state.currentLevel]?.pinnedTab || null;
    state.fuseInstances = {};
    state.lastDictionaryQuery = '';
}

/**
 * Renders the UI components after new level data has been loaded.
 * @param {string} level - The newly set level.
 * @param {boolean} fromHistory - If the change was triggered by a history (back/forward) event.
 */
async function renderLevelUI(level, fromHistory) {
    document.querySelectorAll('.tab-content').forEach(c => { c.innerHTML = ''; });
    updateProgressDashboard();
    setLanguage(state.currentLang, true); // Re-apply language without re-rendering content yet.
    document.querySelectorAll('.level-switch-button').forEach(btn => btn.classList.toggle('active', btn.dataset.levelName === level));
    updateSidebarPinIcons();

    const isMobileView = window.innerWidth <= 768;
    const defaultTab = isMobileView ? 'progress' : 'hiragana';
    const targetTab = state.pinnedTab || defaultTab;
    
    await changeTab(targetTab, null, false, fromHistory, true);
}


/**
 * Orchestrates the entire process of switching to a new level.
 * Ensures a smooth user experience with a loading overlay and robust error handling.
 * @param {string} level The level to switch to.
 * @param {boolean} [fromHistory=false] - True if triggered by browser history navigation.
 */
export async function setLevel(level, fromHistory = false) {
    if (state.isSwitchingLevel || level === state.currentLevel) {
        if (level === state.currentLevel) closeSidebar();
        return;
    }

    state.isSwitchingLevel = true; // Engage the master lock.
    state.loadingStatus = 'loading';
    
    // Create a promise that enforces a minimum display time for the loader.
    // This prevents a jarring "flash" if the data loads very quickly.
    const minimumDisplayTimePromise = new Promise(resolve => setTimeout(resolve, 500));

    showLoader();

    try {
        // Run data loading and the minimum display timer concurrently.
        // The code will only proceed once BOTH are complete.
        await Promise.all([
            loadLevelData(level),
            minimumDisplayTimePromise
        ]);

        // Once data is ready, render the UI.
        await renderLevelUI(level, fromHistory);
        state.loadingStatus = 'idle';

    } catch (error) {
        console.error(`Failed to load level ${level}:`, error);
        state.loadingStatus = 'error';
        if (els.loadingOverlay) {
            els.loadingOverlay.innerHTML = `
                <div class="text-center p-4">
                    <h3 class="text-xl font-semibold text-white mb-2">Failed to Load Level</h3>
                    <p class="text-red-300">${error.message}</p>
                    <p class="text-gray-300 mt-4">Please try refreshing or select another level.</p>
                </div>`;
        }
        // IMPORTANT: We do not proceed to the 'finally' block's hiding logic on error.
        // The lock remains engaged to prevent interaction with a broken app state.
        return; 
    } finally {
        // This block runs only if the `try` block completed without a critical, unhandled error.
        if (state.loadingStatus !== 'error') {
            await hideLoader(); // Wait for the fade-out to complete.
            state.isSwitchingLevel = false; // NOW it's safe to release the lock.
        }
        closeSidebar();
    }
}

async function savePinnedTab(tabId) {
    try {
        const db = await dbPromise;
        let levelSettings = (await db.get('settings', 'levelSettings')) || {};
        if (!levelSettings[state.currentLevel]) {
            levelSettings[state.currentLevel] = {};
        }
        levelSettings[state.currentLevel].pinnedTab = tabId || null;
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

export async function changeTab(tabName, buttonElement, suppressScroll = false, fromHistory = false, forceRender = false) {
    const activeTabEl = document.querySelector('.tab-content.active');

    if (activeTabEl && activeTabEl.id === tabName && !fromHistory && !forceRender) {
        closeSidebar();
        return;
    }

    if (!fromHistory) {
        const url = `?level=${state.currentLevel}&tab=${tabName}`;
        history.pushState({ type: 'tab', tabName: tabName, level: state.currentLevel }, '', url);
    }

    const oldActiveTab = document.querySelector('.tab-content.active');
    if (oldActiveTab) {
        state.tabScrollPositions.set(oldActiveTab.id, window.scrollY);
        if (oldActiveTab.id === 'external-search') {
            const searchInput = window.innerWidth <= 768 ? els.mobileSearchInput : els.searchInput;
            state.lastDictionaryQuery = searchInput.value.trim();
        }
    }

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const activeTab = document.getElementById(tabName);
    if (activeTab) {
        const isDataTab = !['external-search', 'progress'].includes(tabName);
        let isDataMissing = isDataTab && !state.appData[tabName];

        activeTab.classList.add('active');

        if (isDataMissing) {
            try {
                await loadTabData(state.currentLevel, tabName);
                isDataMissing = false;
            } catch (error) {
                closeSidebar();
                return;
            }
        }

        if (isDataTab && !isDataMissing) {
            renderContent(tabName);
        }

        if (tabName === 'external-search') {
            const searchInput = window.innerWidth <= 768 ? els.mobileSearchInput : els.searchInput;
            searchInput.value = state.lastDictionaryQuery;
            handleExternalSearch(state.lastDictionaryQuery);
        } else {
            if (els.searchInput) els.searchInput.value = '';
            if (els.mobileSearchInput) els.mobileSearchInput.value = '';
            handleSearch();
        }
    }

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const targetButton = buttonElement || document.querySelector(`.nav-item[data-tab-name="${tabName}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
        const isMobileView = window.innerWidth <= 768;
        if (isMobileView) {
            if (els.mobileSearchBar) {
                const isSearchableTab = tabName !== 'progress';
                els.mobileSearchBar.classList.toggle('visible', isSearchableTab);
            }

            const titleSpan = targetButton.querySelector('span');
            const titleKey = titleSpan?.dataset.langKey;
            const titleText = (state.appData.ui?.[state.currentLang]?.[titleKey]) || titleSpan?.textContent || '';
            if (els.mobileHeaderTitle) els.mobileHeaderTitle.textContent = titleText;
            if (els.pinToggle) els.pinToggle.style.display = 'block';
            updatePinButtonState(tabName);
        } else {
            if (els.pinToggle) {
                els.pinToggle.style.display = 'none';
            }
        }
    }

    updateSearchPlaceholders(tabName);
    closeSidebar();

    if (!suppressScroll) {
        const newScrollY = state.tabScrollPositions.get(tabName) || 0;
        window.scrollTo({
            top: newScrollY,
            behavior: 'instant'
        });
    }
}

export function jumpToSection(tabName, sectionTitleKey) {
    const activeTab = document.querySelector('.tab-content.active');
    const isAlreadyOnTab = activeTab && activeTab.id === tabName;
    const scrollToAction = () => {
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
            const headerOffset = (mobileHeader && getComputedStyle(mobileHeader).position === 'sticky') ? mobileHeader.offsetHeight : 0;
            const buffer = 20;

            window.scrollTo({
                top: absoluteElementTop - headerOffset - buffer,
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
    };

    if (isAlreadyOnTab) {
        scrollToAction();
    } else {
        changeTab(tabName, null, true).then(scrollToAction);
    }
}

export async function deleteLevel(level) {
    if (level === config.defaultLevel) {
        alert("The default level cannot be deleted.");
        return;
    }
    if (!confirm(`Are you sure you want to permanently delete the '${level.toUpperCase()}' level and all its progress? This action cannot be undone.`)) {
        return;
    }
    try {
        const db = await dbPromise;
        await db.delete('levels', level);
        await db.delete('progress', level);
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
        alert(`Level '${level.toUpperCase()}' has been deleted.`);
    } catch (error) {
        console.error("Failed to delete level:", error);
        alert("An error occurred while trying to delete the level.");
    }
}