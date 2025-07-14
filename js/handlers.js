/**
 * @module handlers
 * @description Contains event handlers and core application logic for the event-driven architecture.
 */

import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';
import { els } from './dom.js';
import { state, config } from './config.js';
import { debounce } from './utils.js';
import { dbPromise, saveProgress, saveSetting, loadAllData } from './database.js';
import { renderContent, updateProgressDashboard, updateSearchPlaceholders, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher, createSearchPlaceholder } from './ui.js';
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
        // This now correctly handles the transition from results back to the prompt
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
        renderContent();
        updateProgressDashboard();
        // Re-render search results if the search tab is active
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id === 'external-search') {
            handleExternalSearch(state.lastDictionaryQuery, true); // Force refresh with new language
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

export async function setLevel(level, fromHistory = false) {
    if (level === state.currentLevel) {
        closeSidebar();
        return;
    }
    state.currentLevel = level;
    state.lastDictionaryQuery = '';
    await saveSetting('currentLevel', level);
    els.loadingOverlay?.classList.remove('hidden');

    try {
        await loadAllData(level);
        const db = await dbPromise;
        state.progress = (await db.get('progress', state.currentLevel)) || { kanji: [], vocab: [] };
        const levelSettings = await db.get('settings', 'levelSettings') || {};
        const currentLevelSettings = levelSettings[state.currentLevel];
        state.pinnedTab = currentLevelSettings?.pinnedTab || null;
        updateSidebarPinIcons();
        state.fuseInstances = {};
        renderContent();
        updateProgressDashboard();
        setLanguage(state.currentLang, true);
        document.querySelectorAll('.level-switch-button').forEach(btn => btn.classList.toggle('active', btn.dataset.levelName === level));

        const isMobileView = window.innerWidth <= 768;
        const defaultTab = isMobileView ? 'progress' : 'hiragana';
        const targetTab = state.pinnedTab || defaultTab;
        changeTab(targetTab, null, false, fromHistory);
    } catch (error) {
        console.error(`Failed to load level ${level}:`, error);
        alert(`Could not load data for level ${level.toUpperCase()}.`);
    } finally {
        els.loadingOverlay?.classList.add('hidden');
        closeSidebar();
    }
}

async function savePinnedTab(tabId) {
    try {
        const db = await dbPromise;
        let levelSettings = (await db.get('settings', 'levelSettings')) || {};
        if (!levelSettings[state.currentLevel]) levelSettings[state.currentLevel] = {};
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

export function changeTab(tabName, buttonElement, suppressScroll = false, fromHistory = false) {
    const activeTabEl = document.querySelector('.tab-content.active');
    if (activeTabEl && activeTabEl.id === tabName && !fromHistory) {
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
        activeTab.classList.add('active');
        if (tabName === 'external-search') {
            const searchInput = window.innerWidth <= 768 ? els.mobileSearchInput : els.searchInput;
            searchInput.value = state.lastDictionaryQuery;
            if (activeTab.innerHTML.trim() === '') {
                activeTab.innerHTML = createSearchPlaceholder('prompt');
            }
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
            // FIX: Add this logic to control the mobile search bar's visibility
            if (els.mobileSearchBar) {
                els.mobileSearchBar.classList.toggle('visible', tabName === 'external-search' || tabName !== 'progress');
            }

            const titleSpan = targetButton.querySelector('span');
            const titleKey = titleSpan?.dataset.langKey;
            const titleText = (state.appData.ui?.[state.currentLang]?.[titleKey]) || titleSpan?.textContent || '';
            if (els.mobileHeaderTitle) els.mobileHeaderTitle.textContent = titleText;
            if (els.pinToggle) els.pinToggle.style.display = 'block';
            updatePinButtonState(tabName);
        } else {
            if (els.pinToggle) els.pinToggle.style.display = 'none';
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
        }, 100); // Small delay to allow accordion to open
    };

    if (isAlreadyOnTab) {
        scrollToAction();
    } else {
        changeTab(tabName, null, true);
        setTimeout(scrollToAction, 50); // Delay to allow tab to become visible
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