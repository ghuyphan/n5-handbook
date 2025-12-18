import { els } from './dom.js';
import { state, config } from './config.js';
import { debounce, getUIText } from './utils.js';
import { dbPromise, saveProgress, saveSetting, loadAllData, loadTabData, deleteNotesForLevel, saveNote, loadNote, saveAccordionState } from './database.js';
import { renderContent, updateProgressDashboard, updateSearchPlaceholders, moveLangPill, updatePinButtonState, updateSidebarPinIcons, closeSidebar, buildLevelSwitcher, renderContentNotAvailable, showCustomAlert, showCustomConfirm, setupTabsForLevel, setupFuseForTab } from './ui.js';
import { handleExternalSearch } from './jotoba.js';

// Web Worker for search offloading
if (!state.searchWorker) {
    state.searchWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

    state.searchWorker.onmessage = (e) => {
        const { type, tabId, results, query } = e.data;
        if (type === 'results') {
            handleWorkerResults(tabId, results, query);
        }
    };
}

function handleWorkerResults(tabId, results, query) {
    const container = document.getElementById(tabId);
    if (!container) return;

    const resultIds = new Set(results.map(r => r.item.id));

    // Group results by sectionKey to easily identify which sections need rendering
    const sectionsWithMatches = new Set();
    const itemMatches = new Map(); // itemId -> result

    // Pass sectionKey from worker would be ideal, but if not available (old worker code), we might need to lookup.
    // I updated setupFuseForTab to pass sectionKey, so results SHOULD contain it if I update worker?
    // Wait, the worker just returns `results` which are the items I sent.
    // Yes, 'data' sent to worker has {id, searchData, sectionKey}. Fuse returns the item.
    // So 'r' in results should have 'sectionKey'.

    results.forEach(r => {
        if (r.item && r.item.sectionKey) {
            sectionsWithMatches.add(r.item.sectionKey);
        }
        itemMatches.set(r.item.id || r.id, r);
    });

    // Iterate over all section wrappers in the container
    const allWrappers = container.querySelectorAll('.search-wrapper');

    // Handle "no results" state
    let noResultsEl = container.querySelector('.search-no-results');
    if (query && results.length === 0) {
        // Show no results message
        if (!noResultsEl) {
            noResultsEl = document.createElement('div');
            noResultsEl.className = 'search-no-results text-center py-12';
            noResultsEl.innerHTML = `
                <svg class="w-16 h-16 mx-auto text-secondary opacity-50 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <p class="text-secondary text-lg">No results found for "<span class="text-accent-teal font-semibold">${query}</span>"</p>
            `;
            container.appendChild(noResultsEl);
        } else {
            // Update the query text in existing element
            const querySpan = noResultsEl.querySelector('.text-accent-teal');
            if (querySpan) querySpan.textContent = query;
            noResultsEl.style.display = '';
        }
    } else if (noResultsEl) {
        noResultsEl.style.display = 'none';
    }

    allWrappers.forEach(wrapper => {
        const titleElement = wrapper.querySelector('[data-section-title-key]');
        const sectionKey = titleElement?.dataset.sectionTitleKey;

        // If this section has matches
        if (sectionKey && sectionsWithMatches.has(sectionKey)) {
            wrapper.style.display = '';

            // LAZY RENDERING: Force render content if matches found
            if (typeof wrapper._renderContent === 'function') {
                wrapper._renderContent();
            }

            const accordionButton = wrapper.querySelector('.accordion-button');
            if (accordionButton && !accordionButton.classList.contains('open')) {
                accordionButton.classList.add('open');
            }

            // Now handle individual item visibility within this section
            const items = wrapper.querySelectorAll('[data-item-id]');
            items.forEach(el => {
                const itemId = el.dataset.itemId;
                if (resultIds.has(itemId)) {
                    el.classList.remove('search-hidden');
                    if (query) {
                        highlightMatches(el, query);
                    }
                } else {
                    el.classList.add('search-hidden');
                }
            });

        } else {
            // No matches in this section
            if (query) {
                wrapper.style.display = 'none';
            } else {
                // If query is empty strings (reset), show everything
                wrapper.style.display = '';

                // Note: we don't necessarily want to render content for Reset.
                // But if it WAS rendered, we should unhide items.
                const items = wrapper.querySelectorAll('[data-item-id]');
                items.forEach(el => el.classList.remove('search-hidden'));
            }
        }
    });
}


// --- HELPER FUNCTIONS ---

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
    const isAdding = idx === -1;

    if (isAdding) {
        arr.push(id);
        element.classList.add('learned');
    } else {
        arr.splice(idx, 1);
        element.classList.remove('learned');
    }
    saveProgress();

    // Update the hanko counter badge in the accordion header
    const cardWrapper = element.closest('[data-item-id]');
    const accordionWrapper = cardWrapper?.closest('.accordion-wrapper');
    const hankoCounter = accordionWrapper?.querySelector('.hanko-counter');

    if (hankoCounter && hankoCounter.dataset.category === category) {
        // Parse current count and update
        const [currentLearned, total] = hankoCounter.textContent.split('/').map(Number);
        const newLearned = isAdding ? currentLearned + 1 : Math.max(0, currentLearned - 1);
        hankoCounter.textContent = `${newLearned}/${total}`;

        // Update has-progress class
        hankoCounter.classList.toggle('has-progress', newLearned > 0);

        // Trigger hanko stamp pulse animation
        hankoCounter.classList.remove('hanko-pulse');
        // Force reflow to restart animation
        void hankoCounter.offsetWidth;
        hankoCounter.classList.add('hanko-pulse');

        // Remove animation class after it completes
        hankoCounter.addEventListener('animationend', () => {
            hankoCounter.classList.remove('hanko-pulse');
        }, { once: true });
    }
}

export function toggleAccordion(buttonElement) {
    const tabId = state.activeTab;
    const sectionKey = buttonElement.dataset.sectionTitleKey;

    if (!tabId || !sectionKey) return;

    // LAZY RENDERING: Ensure content is rendered before opening
    const wrapper = buttonElement.closest('.search-wrapper');
    if (wrapper && typeof wrapper._renderContent === 'function') {
        wrapper._renderContent();
    }

    const isOpen = buttonElement.classList.toggle('open');

    // Update aria-expanded for accessibility
    buttonElement.setAttribute('aria-expanded', isOpen);

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
    const itemMap = state.domItemMap[activeTabId];

    // Reset everything to default state before searching
    if (itemMap) {
        itemMap.forEach((element) => {
            element.classList.remove('search-hidden');
            const originalHTML = element.dataset.originalHtml;
            if (originalHTML) {
                element.innerHTML = originalHTML;
                element.removeAttribute('data-original-html');
            }
        });
    }

    allWrappers.forEach(wrapper => {
        wrapper.style.display = '';
        const accordionButton = wrapper.querySelector('.accordion-button');
        const tabAccordions = state.openAccordions.get(activeTabId);
        const sectionKey = accordionButton?.dataset.sectionTitleKey;
        if (accordionButton && sectionKey) {
            accordionButton.classList.toggle('open', tabAccordions?.has(sectionKey));
        }
        // Also unhide all items within this wrapper
        const items = wrapper.querySelectorAll('[data-item-id]');
        items.forEach(el => {
            el.classList.remove('search-hidden');
            // Remove search highlights
            const highlights = el.querySelectorAll('mark.search-highlight');
            highlights.forEach(mark => {
                const textNode = document.createTextNode(mark.textContent);
                mark.parentNode.replaceChild(textNode, mark);
            });
        });
    });

    if (!query) {
        return; // If query is empty, we are done after resetting.
    }

    // Offload search to worker
    state.searchWorker.postMessage({
        type: 'search',
        tabId: activeTabId,
        query: query
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
            changeTab(activeTab.id, null, true, true, true, true);
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
    document.body.style.overflow = 'hidden'; // Prevent scrolling
    // Reuse existing overlay instead of cloning (DOM optimization)
    els.loadingOverlay.innerHTML = `<div class="loader"></div>`;
    els.loadingOverlay.classList.remove('hidden');
    els.loadingOverlay.style.opacity = '1';
}

function hideLoader() {
    return new Promise(resolve => {
        if (!els.loadingOverlay || els.loadingOverlay.style.opacity === '0') {
            document.body.style.overflow = ''; // Restore scrolling
            resolve();
            return;
        }
        const onTransitionEnd = (e) => {
            if (e.target !== els.loadingOverlay) return;
            els.loadingOverlay.classList.add('hidden');
            document.body.style.overflow = ''; // Restore scrolling
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

    // Load level-specific settings
    const currentLevelSettings = levelSettings?.[state.currentLevel];
    state.pinnedTab = currentLevelSettings?.pinnedTab || null;

    // FIXED: Restore accordion state for this level
    state.openAccordions = new Map(
        (currentLevelSettings?.openAccordions || []).map(([tabId, keys]) => [tabId, new Set(keys)])
    );

    state.lastDictionaryQuery = '';
    state.notes.data = new Map();
    state.notes.originalContent = '';
    // Clear DOM map for search when loading new level
    state.domItemMap = {};
    // Tell worker to clear its cache
    if (state.searchWorker) {
        // We can't easily iterate all tabs to clear, but reloading level usually implies full reset.
        // For simplicity, we can let the worker keep old data (it's keyed by tabId) or implement a 'clearAll' message.
        // Since tabIds might reuse keys (hiragana, kanji), we SHOULD clear.
        // Sending a clear message for safety.
        // Actually, loadLevelData resets state.appData and state.domItemMap, so worker data would be stale.
        // We will just let new 'init' messages overwrite old data in worker for the same tabId.
    }
    if (state.renderedTabs) state.renderedTabs.clear();

    const db = await dbPromise;
    const isCustomLevel = !!(await db.get('levels', level));
    if (!isCustomLevel) {
        // Base tabs for all levels
        const tabsToPreload = ['kanji', 'vocab', 'grammar', 'keyPoints'];

        // Add hiragana and katakana only for non-advanced levels (e.g., N4, N5)
        if (!isAdvancedLevel(level)) {
            tabsToPreload.push('hiragana', 'katakana');
        }

        Promise.all(tabsToPreload.map(tabId => loadTabData(level, tabId).catch(err => {
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

    // Close sidebar immediately and wait for transition if on mobile
    if (els.sidebar?.classList.contains('open')) {
        closeSidebar();
        await new Promise(resolve => setTimeout(resolve, 300));
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
        // Sidebar closed at start, no need to force close here unless something went wrong
        if (state.loadingStatus === 'error') closeSidebar();
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

export async function changeTab(tabName, buttonElement, suppressScroll = false, fromHistory = false, forceRender = false, suppressSidebarClose = false) {
    const activeTabEl = document.querySelector('.tab-content.active');

    // If clicking the already active tab, just return unless forcing a re-render.
    if (activeTabEl?.id === tabName && !forceRender) {
        if (!suppressSidebarClose) closeSidebar();
        return;
    }

    state.activeTab = tabName;
    updateTabUI(tabName);
    if (!suppressSidebarClose) closeSidebar();

    const isMobile = window.innerWidth <= 768;

    // Store scroll position of the PREVIOUS tab before hiding it (desktop only)
    if (activeTabEl) {
        // Removed scroll saving logic
        activeTabEl.classList.remove('active');
    }

    const newTabContentEl = document.getElementById(tabName);
    if (!newTabContentEl) {
        console.error(`Tab container not found for tab: ${tabName}`);
        return;
    }

    // On mobile AND desktop: always scroll to top
    // We removed state.tabScrollPositions usage to ensure fresh start on tab switch
    const targetScrollY = 0;

    // CRITICAL: Reset scroll IMMEDIATELY before showing the new tab
    if (!suppressScroll) {
        window.scrollTo({ top: targetScrollY, behavior: 'instant' });
        document.body.scrollTop = targetScrollY;
        document.documentElement.scrollTop = targetScrollY;
    }

    // Show the new tab
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
        // PERFORMANCE FIX: Only render if we haven't rendered this tab yet (or forcing).
        // stored 'true' in renderedTabs means it's been rendered and DOM exists.
        if (forceRender || !state.renderedTabs.has(tabName)) {
            const loaderTemplate = document.getElementById('content-loader-template');
            // Only show loader if we are actually loading data/rendering for the first time
            if (!newTabContentEl.children.length) {
                newTabContentEl.innerHTML = loaderTemplate ? loaderTemplate.innerHTML : '<div class="loader"></div>';
            }

            try {
                if (!state.appData[tabName]) {
                    await loadTabData(state.currentLevel, tabName);
                }

                // renderContent puts the actual items into the DOM
                await renderContent(tabName);

                // Mark as rendered. We do NOT store HTML string anymore.
                state.renderedTabs.set(tabName, true);

                // Initialize Fuse only after render
                setupFuseForTab(tabName);
            } catch (error) {
                console.error(`Error loading or rendering data for tab ${tabName}:`, error);
                renderContentNotAvailable(tabName);
                state.renderedTabs.delete(tabName);
            }
        } else {
            // Tab is already rendered and in DOM. Just visibility toggle happened above.
            // Ensure Fuse is set up if it was somehow missed (though it shouldn't be)
            setupFuseForTab(tabName);
        }
    } else if (tabName === 'external-search') {
        // External search logic remains mostly same, as it's dynamic
        newTabContentEl.innerHTML = '';
        getActiveSearchInput().value = state.lastDictionaryQuery;
        handleExternalSearch(state.lastDictionaryQuery, false, true);
    } else if (tabName === 'progress') {
        updateProgressDashboard();
    }

    // Handle search input restoration
    if (isDataTab) {
        // If there was a search query, we might want to clear it or re-apply it?
        // Current behavior: clear input on tab switch to avoid confusion
        if (getActiveSearchInput().value) {
            getActiveSearchInput().value = '';
            // Cancel any pending debounced search
            handleSearch.cancel();
            // Reset the search view (unhide all items)
            handleSearch();
        }
    }

    // FINAL scroll position enforcement - after all async rendering is complete
    // This ensures the scroll is correct even if rendering caused layout shifts
    // FINAL scroll position enforcement - after all async rendering is complete
    // This ensures the scroll is correct even if rendering caused layout shifts
    if (!suppressScroll) {
        // Use multiple strategies to ensure scroll position sticks:
        const resetScroll = () => {
            window.scrollTo({ top: targetScrollY, behavior: 'instant' });
            document.body.scrollTop = targetScrollY;
            document.documentElement.scrollTop = targetScrollY;
        };

        // 1. Immediate scroll
        resetScroll();

        // 2. After next frame (after browser paints)
        requestAnimationFrame(resetScroll);

        // 3. Short delay to handle any async layout updates (especially on mobile)
        setTimeout(resetScroll, 50);
    }
}


/**
 * Jump to a specific section within a tab, opening its accordion if needed.
 * Saves accordion state when opened.
 * 
 * @param {string} tabName - The tab to navigate to
 * @param {string} sectionTitleKey - The data-section-title-key to scroll to
 */
export async function jumpToSection(tabName, sectionTitleKey) {
    // Cancellation token - if user triggers another jumpToSection, we abandon the previous one
    const token = Symbol('jumpToSection');
    state._currentJumpToken = token;
    const isCancelled = () => state._currentJumpToken !== token;

    // Step 1: Navigate to tab if not already there
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab?.id !== tabName) {
        await changeTab(tabName, null, true);
        if (isCancelled()) return;
        // Wait for tab switch to complete and DOM to update
        await new Promise(r => setTimeout(r, 100));
        if (isCancelled()) return;
    }

    // Step 2: Find the accordion button for this section
    const sectionButton = document.querySelector(`[data-section-title-key="${sectionTitleKey}"]`);
    if (!sectionButton) {
        console.warn(`jumpToSection: Could not find section "${sectionTitleKey}"`);
        return;
    }

    // Step 3: Find the scroll target (the wrapper element with scroll-margin-top)
    const scrollTarget = sectionButton.closest('.search-wrapper') ||
        sectionButton.closest('.accordion-wrapper') ||
        sectionButton;

    // Step 4: Check if accordion needs to be opened and content needs to be rendered
    const isAccordion = sectionButton.classList.contains('accordion-button');
    const needsToOpen = isAccordion && !sectionButton.classList.contains('open');

    if (needsToOpen) {
        // LAZY RENDERING: Render content before opening
        if (scrollTarget && typeof scrollTarget._renderContent === 'function') {
            scrollTarget._renderContent();
        }

        // Open the accordion
        sectionButton.classList.add('open');
        sectionButton.setAttribute('aria-expanded', 'true');

        // Save accordion state
        if (tabName && sectionTitleKey) {
            if (!state.openAccordions.has(tabName)) {
                state.openAccordions.set(tabName, new Set());
            }
            state.openAccordions.get(tabName).add(sectionTitleKey);
            saveAccordionState();
        }

        // Wait for DOM to update after rendering - use setTimeout for more reliable timing
        // requestAnimationFrame alone isn't enough for large DOM updates
        await new Promise(r => setTimeout(r, 50));
        if (isCancelled()) return;
    }

    // Step 5: Disable mobile header scroll behavior during programmatic scroll
    state._isJumpingToSection = true;

    // Step 6: Scroll to target using native scrollIntoView (respects scroll-margin-top CSS)
    scrollTarget.scrollIntoView({ behavior: 'instant', block: 'start' });

    // Step 7: Re-enable header scroll after a short delay to let scroll settle
    setTimeout(() => {
        state._isJumpingToSection = false;
    }, 300);

    // Step 8: Apply highlight animation
    scrollTarget.classList.remove('is-highlighted');
    void scrollTarget.offsetWidth; // Force reflow
    scrollTarget.classList.add('is-highlighted');
    scrollTarget.addEventListener('animationend', () => {
        scrollTarget.classList.remove('is-highlighted');
    }, { once: true });
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

export function setupMobileHeaderScroll() {
    let lastScrollY = window.scrollY;
    const header = document.querySelector('.mobile-header');

    if (!header) return;

    const onScroll = () => {
        const currentScrollY = window.scrollY;
        const isMobile = window.innerWidth <= 768;

        if (!isMobile) return;

        // Skip during programmatic jumps to prevent interfering with navigation
        if (state._isJumpingToSection) {
            lastScrollY = currentScrollY;
            return;
        }

        // If sidebar is open, do nothing (body scroll is locked usually)
        if (document.body.classList.contains('sidebar-open')) return;

        // Always show if near top or negative (overscroll)
        if (currentScrollY <= 10) {
            header.classList.remove('header-hidden');
            lastScrollY = currentScrollY;
            return;
        }

        const scrollDiff = currentScrollY - lastScrollY;

        // Lower threshold for responsiveness (3px)
        if (Math.abs(scrollDiff) < 3) return;

        if (scrollDiff > 0) {
            // Scrolling DOWN -> Hide
            header.classList.add('header-hidden');
        } else {
            // Scrolling UP -> Show
            header.classList.remove('header-hidden');
        }

        lastScrollY = currentScrollY;
    };

    let rafId = null;
    window.addEventListener('scroll', () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            onScroll();
            rafId = null;
        });
    }, { passive: true });
}