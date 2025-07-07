/**
 * @module handlers
 * @description Contains event handlers and core application logic for the event-driven architecture.
 */

import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';
import { els } from './dom.js';
import { state, config } from './config.js';
import { debounce } from './utils.js';
import { dbPromise, saveProgress, saveSetting, loadAllData } from './database.js';
import {
    updateLevelUI,
    renderContent,
    updateProgressDashboard,
    moveLangPill,
    updatePinButtonState,
    updateSidebarPinIcons,
    closeSidebar,
    buildLevelSwitcher
} from './ui.js';


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
    const query = (isMobileView ? els.mobileSearchInput.value : els.searchInput.value).trim().toLowerCase();
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;

    const activeTabId = activeTab.id;
    if (isMobileView && els.mobileSearchBar) {
        els.mobileSearchBar.classList.toggle('visible', activeTabId !== 'progress');
    }

    const fuse = state.fuseInstances[activeTabId];
    const allItems = activeTab.querySelectorAll('[data-search-item], [data-search]');
    const allWrappers = activeTab.querySelectorAll('.search-wrapper');

    if (!query) {
        allItems.forEach(item => { item.style.display = ''; });
        allWrappers.forEach(wrapper => { wrapper.style.display = ''; });
        return;
    }

    if (!fuse) return;

    allItems.forEach(item => { item.style.display = 'none'; });
    allWrappers.forEach(wrapper => { wrapper.style.display = 'none'; });

    const results = fuse.search(query);
    results.forEach(result => {
        const itemElement = result.item.element;
        itemElement.style.display = '';

        let parent = itemElement.parentElement;
        while (parent) {
            if (parent.hasAttribute('data-search') || parent.classList.contains('search-wrapper')) {
                parent.style.display = '';
            }
            if (parent.classList.contains('accordion-wrapper')) {
                const button = parent.querySelector('.accordion-button');
                if (button && !button.classList.contains('open')) button.classList.add('open');
            }
            parent = parent.parentElement;
        }
    });
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

    if (!skipRender) {
        state.fuseInstances = {};
        renderContent();
        updateProgressDashboard();
    }
}

export function toggleTheme(event) {
    document.body.classList.add('no-transitions');

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

    setTimeout(() => {
        document.body.classList.remove('no-transitions');
    }, 100);
}

export async function setLevel(level) {
    if (level === state.currentLevel) return;

    state.currentLevel = level;
    updateLevelUI(level);
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
        changeTab(state.pinnedTab || defaultTab);

    } catch (error) {
        console.error(`Failed to load level ${level}:`, error);
        alert(`Could not load data for level ${level.toUpperCase()}.`);
    } finally {
        els.loadingOverlay?.classList.add('hidden');
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

export function changeTab(tabName, buttonElement, suppressScroll = false) {
    const mainContent = els.mainContent;

    const oldActiveTab = document.querySelector('.tab-content.active');
    if (oldActiveTab) {
        state.tabScrollPositions.set(oldActiveTab.id, mainContent.scrollTop);
    }

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const activeTab = document.getElementById(tabName);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const targetButton = buttonElement || document.querySelector(`.nav-item[data-tab-name="${tabName}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
        const isMobileView = window.innerWidth <= 768;
        if (isMobileView) {
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

    if (els.searchInput) els.searchInput.value = '';
    if (els.mobileSearchInput) els.mobileSearchInput.value = '';
    handleSearch.cancel();
    handleSearch();
    closeSidebar();

    if (!suppressScroll) {
        const newScrollY = state.tabScrollPositions.get(tabName) || 0;
        mainContent.scrollTo({
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
        const accordionContent = accordionWrapper ? accordionWrapper.querySelector('.accordion-content') : null;

        const executeScroll = () => {
            const elementTop = sectionHeader.getBoundingClientRect().top;
            const currentScrollY = window.scrollY;
            const targetY = elementTop + currentScrollY;

            let headerOffset = 0;
            const mobileHeader = document.querySelector('.mobile-header.sticky');
            if (mobileHeader && getComputedStyle(mobileHeader).position === 'sticky') {
                headerOffset = mobileHeader.offsetHeight;
            }
            
            const buffer = 20;

            window.scrollTo({
                top: targetY - headerOffset - buffer,
                behavior: 'smooth'
            });
        };

        if (accordionWrapper && sectionHeader.tagName === 'BUTTON' && !sectionHeader.classList.contains('open')) {
            accordionContent.addEventListener('transitionend', executeScroll, { once: true });
            sectionHeader.click();
        } else {
            executeScroll();
        }
    };

    if (isAlreadyOnTab) {
        scrollToAction();
    } else {
        const previousTabId = activeTab ? activeTab.id : null;
        changeTab(tabName, null, true);
        
        const isMobileView = window.innerWidth <= 768;
        const searchBarWillAnimate = isMobileView && previousTabId === 'progress' && tabName !== 'progress';
        
        if (searchBarWillAnimate && els.mobileSearchBar) {
            // This is the key: we wait for the animation to end before scrolling.
            els.mobileSearchBar.addEventListener('transitionend', scrollToAction, { once: true });
        } else {
            // For other cases, a tiny delay is enough for the DOM to update.
            setTimeout(scrollToAction, 50);
        }
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