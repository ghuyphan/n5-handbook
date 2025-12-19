// js/ui.js

/**
 * @module ui
 * @description Handles all HTML rendering and UI updates using template elements.
 */

import { els } from '../utils/dom.js';
import { state, config } from '../config.js';
import { generateSearchTerms, getUIText } from '../utils/common.js';
import { dbPromise } from '../services/database.js';
import { playPronunciation } from '../services/audio.js';

// Import rendering helpers from the new module
import {
    getLangText,
    getSearchPlaceholderInnerContent,
    createAccordion,
    createCheatSheetList,
    createKosoadoGrid,
    createCard,
    createCardSection,
    createStaticSection,
    createProgressItem
} from './rendering.js';

export function setupSidebarScrollIndicators() {
    const sidebars = [
        document.querySelector('.left-sidebar'),
        document.querySelector('.right-sidebar')
    ].filter(Boolean);

    const updateIndicator = (el) => {
        requestAnimationFrame(() => {
            // Use a small buffer (5px) to account for sub-pixel rendering quirks
            const scrollBottom = Math.ceil(el.scrollTop + el.clientHeight);
            const isAtBottom = el.scrollHeight - scrollBottom <= 5;
            const hasOverflow = el.scrollHeight > el.clientHeight;

            // Only show mask if there is overflow AND we are not at the bottom
            if (hasOverflow && !isAtBottom) {
                el.classList.add('can-scroll');
            } else {
                el.classList.remove('can-scroll');
            }
        });
    };

    sidebars.forEach(sidebar => {
        // Initial check with delay
        setTimeout(() => updateIndicator(sidebar), 100);

        // Check on scroll
        sidebar.addEventListener('scroll', () => updateIndicator(sidebar), { passive: true });

        // Check on window resize
        window.addEventListener('resize', () => updateIndicator(sidebar), { passive: true });

        // Use ResizeObserver for more robust size change detection
        const resizeObserver = new ResizeObserver(() => updateIndicator(sidebar));
        resizeObserver.observe(sidebar);
        Array.from(sidebar.children).forEach(child => resizeObserver.observe(child));

        // Observer for content changes
        const observer = new MutationObserver((mutations) => {
            updateIndicator(sidebar);
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) resizeObserver.observe(node);
                });
            });
        });
        observer.observe(sidebar, { childList: true, subtree: true, characterData: true });
    });
}


export function renderContentNotAvailable(tabName) {
    const container = document.getElementById(tabName);
    if (!container) return;



    const title = getUIText('errorContentNotAvailableTitle');
    const body = getUIText('errorContentNotAvailableBody', {
        tabName: tabName,
        levelName: state.currentLevel.toUpperCase()
    });

    container.innerHTML = `
        <div class="p-6 text-center text-secondary content-anim-fade-in">
            <h3 class="font-semibold text-lg text-primary mb-2">${title}</h3>
            <p>${body}</p>
        </div>
    `;
}

export function updateProgressDashboard() {
    const containers = [els.progressOverview, els.progressTab];
    if (!state.appData.ui || !containers.every(c => c)) return;

    // Gradients are now defined globally in index.html <defs>
    const dataCategories = { kanji: 'vermilion', vocab: 'gold' };

    const progressItemsFragment = document.createDocumentFragment();

    for (const [categoryName, color] of Object.entries(dataCategories)) {
        if (!state.appData[categoryName]) continue;

        for (const key in state.appData[categoryName]) {
            const category = state.appData[categoryName][key];
            if (!category.items || category.items.length === 0) continue;

            const total = category.items.length;
            const learned = state.progress[categoryName]?.filter(id => category.items.some(item => item.id === id)).length || 0;
            const title = getLangText(category);
            const newItemFragment = createProgressItem(categoryName, title, learned, total, color, key);
            progressItemsFragment.appendChild(newItemFragment);
        }
    }

    containers.forEach(container => {
        if (!container) return;
        container.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-4';
        wrapper.id = `progress-wrapper-${container.id}`;

        wrapper.appendChild(progressItemsFragment.cloneNode(true));

        if (container.id === 'progress-overview') {
            const headerWrapper = document.createElement('div');
            headerWrapper.className = 'h-10 flex items-center mb-4';

            const overviewTitle = document.createElement('h2');
            overviewTitle.className = 'text-xl font-bold sidebar-title';
            overviewTitle.dataset.langKey = 'progressOverview';
            overviewTitle.textContent = state.appData.ui[state.currentLang]?.progressOverview || 'Progress Overview';

            headerWrapper.appendChild(overviewTitle);
            container.appendChild(headerWrapper);
            container.appendChild(wrapper);
        } else {
            container.appendChild(wrapper);
        }
    });

    // Force a check of scroll indicators after content update
    requestAnimationFrame(() => {
        // Dispatch resize to trigger observers
        window.dispatchEvent(new Event('resize'));

        // Manual check for right sidebar specifically
        const rightSidebar = document.querySelector('.right-sidebar');
        if (rightSidebar) {
            const updateRight = () => {
                const scrollBottom = Math.ceil(rightSidebar.scrollTop + rightSidebar.clientHeight);
                const isAtBottom = rightSidebar.scrollHeight - scrollBottom <= 5;
                const hasOverflow = rightSidebar.scrollHeight > rightSidebar.clientHeight;
                if (hasOverflow && !isAtBottom) {
                    rightSidebar.classList.add('can-scroll');
                } else {
                    rightSidebar.classList.remove('can-scroll');
                }
            };
            // Run immediately, then after a short delay for layout stabilization
            updateRight();
            setTimeout(updateRight, 200);
        }
    });
}

export function moveLangPill(langSwitchElement) {
    const activeBtn = langSwitchElement.querySelector('button.active');
    const pill = langSwitchElement.querySelector('.lang-switch-pill');

    if (!activeBtn || !pill) return;

    const buttonWidth = activeBtn.offsetWidth;
    const buttonOffsetLeft = activeBtn.offsetLeft;

    requestAnimationFrame(() => {
        pill.style.width = `${buttonWidth}px`;
        // Combine translateX for horizontal position with translateY(-50%) for vertical centering
        pill.style.transform = `translateX(${buttonOffsetLeft}px) translateY(-50%)`;
    });
}

export function setupTheme() {
    const isDark = document.documentElement.classList.contains('dark-mode');
    document.querySelectorAll('.theme-switch input').forEach((input) => (input.checked = isDark));
}

export function updatePinButtonState(activeTabId) {
    const pinButton = els.pinToggle;
    if (!pinButton) return;

    const pinSVG = `<svg height="24" width="24" viewBox="0 0 519.657 1024"><path d="M196.032 704l64 320 64-320c-20.125 2-41.344 3.188-62.281 3.188C239.22 707.188 217.47 706.312 196.032 704zM450.032 404.688c-16.188-15.625-40.312-44.375-62-84.688v-64c7.562-12.406 12.25-39.438 23.375-51.969 15.25-13.375 24-28.594 24-44.875 0-53.094-61.062-95.156-175.375-95.156-114.25 0-182.469 42.062-182.469 95.094 0 16 8.469 31.062 23.375 44.312 13.438 14.844 22.719 38 31.094 52.594v64c-32.375 62.656-82 96.188-82 96.188h0.656C18.749 437.876 0 464.126 0 492.344 0.063 566.625 101.063 640.062 260.032 640c159 0.062 259.625-73.375 259.625-147.656C519.657 458.875 493.407 428.219 450.032 404.688z"/></svg>`;
    pinButton.innerHTML = pinSVG;
    const svg = pinButton.querySelector('svg');

    const isPinned = activeTabId && activeTabId === state.pinnedTab;
    pinButton.classList.toggle('pinned', isPinned);
    svg.style.fill = isPinned ? 'var(--pin-color)' : 'var(--pin-unpinned)';

    svg.style.width = '1.25em';
    svg.style.height = '1.25em';
}

export function updateSidebarPinIcons() {
    document.querySelectorAll('.sidebar-pin-btn').forEach(button => {
        const tabId = button.dataset.tabName;
        const wrapper = button.closest('.nav-item-wrapper');
        const isPinned = tabId === state.pinnedTab;

        if (wrapper) wrapper.classList.toggle('is-pinned', isPinned);
        button.classList.toggle('is-pinned', isPinned);

        if (!button.querySelector('svg')) {
            button.innerHTML = `<svg viewBox="0 0 519.657 1024"><path d="M196.032 704l64 320 64-320c-20.125 2-41.344 3.188-62.281 3.188C239.22 707.188 217.47 706.312 196.032 704zM450.032 404.688c-16.188-15.625-40.312-44.375-62-84.688v-64c7.562-12.406 12.25-39.438 23.375-51.969 15.25-13.375 24-28.594 24-44.875 0-53.094-61.062-95.156-175.375-95.156-114.25 0-182.469 42.062-182.469 95.094 0 16 8.469 31.062 23.375 44.312 13.438 14.844 22.719 38 31.094 52.594v64c-32.375 62.656-82 96.188-82 96.188h0.656C18.749 437.876 0 464.126 0 492.344 0.063 566.625 101.063 640.062 260.032 640c159 0.062 259.625-73.375 259.625-147.656C519.657 458.875 493.407 428.219 450.032 404.688z"/></svg>`;
        }
        const svg = button.querySelector('svg');
        svg.style.fill = isPinned ? 'var(--pin-pinned-bg)' : 'var(--text-secondary)';
    });
}

export function closeSidebar() {
    // Get scroll position before removing fixed positioning
    const scrollY = document.body.style.top;

    els.sidebar?.classList.remove('open');
    els.overlay?.classList.remove('active');
    document.body.classList.remove('sidebar-open');

    // Restore scroll position
    document.body.style.top = '';
    if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
}

async function renderCardBasedSection(containerId, data, category, gradient) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    if (!data) {
        renderContentNotAvailable(containerId)
        return;
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-4';
    container.appendChild(wrapper);

    // Collect search data for Fuse
    const allItems = [];

    for (const key in data) {
        const section = data[key];
        if (!section.items) continue;
        allItems.push(...section.items);

        const title = getLangText(section);
        const { element } = createCardSection(title, section.items, category, gradient, key, containerId);
        wrapper.appendChild(element);
    }

    // Call setupFuse initially for available content
    // We now pass data directly to setupFuseForTab, or let it read from state.appData
    // Since setupFuseForTab reads from DOM or state, we should probably ensure it reads from state.
    // The previous implementation waited for rendering. Now we don't need to wait.
    setupFuseForTab(category);
}


function findKanjiData(kanjiCharacter) {
    if (!state.appData.kanji) return null;
    for (const key in state.appData.kanji) {
        const found = state.appData.kanji[key].items.find(item => item.kanji === kanjiCharacter);
        if (found) {
            return found;
        }
    }
    return null;
}

function findVocabData(word, reading) {
    if (!state.appData.vocab) return null;
    for (const key in state.appData.vocab) {
        const found = state.appData.vocab[key].items.find(item =>
            item.word === word || item.reading === reading || item.word === reading
        );
        if (found) {
            return found;
        }
    }
    return null;
}

/**
 * Updates the External Search tab dynamically.
 * Performs a search via Jotoba API (delegated) or displays placeholders.
 * 
 * @param {string} type - 'word', 'kanji', 'sentence', or 'names'.
 * @param {object} data - The search result data.
 * @param {boolean} isInitialLoad - Whether this is the first load (show placeholder).
 */
export function updateExternalSearchTab(type, data = {}, isInitialLoad = false) {
    if (!els.externalSearchTab) return;

    const { results, query } = data;


    const manualLoader = els.externalSearchTab.querySelector(':scope > .flex.justify-center.items-center');
    if (manualLoader) {
        manualLoader.remove();
    }

    let resultsContainer = els.externalSearchTab.querySelector('.results-container');
    if (!resultsContainer) {
        resultsContainer = document.createElement('div');
        resultsContainer.className = 'results-container';
        els.externalSearchTab.appendChild(resultsContainer);
    }

    let placeholderContainer = els.externalSearchTab.querySelector('.placeholder-container');
    if (!placeholderContainer) {
        placeholderContainer = document.createElement('div');
        placeholderContainer.className = 'placeholder-container search-placeholder-wrapper';
        placeholderContainer.innerHTML = `<div class="search-placeholder-box"></div>`;
        els.externalSearchTab.appendChild(placeholderContainer);
    }

    if (type === 'results') {
        els.externalSearchTab.innerHTML = '';
        els.externalSearchTab.appendChild(resultsContainer);
        els.externalSearchTab.appendChild(placeholderContainer);
    }


    if (type === 'results') {
        placeholderContainer.style.display = 'none';
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = ''; // Clear old results

        const contentFragment = document.createDocumentFragment();
        const hasWords = results?.words?.length > 0;
        const hasKanji = results?.kanji?.length > 0;

        if (hasWords) {
            const sectionContainer = document.createElement('div');
            sectionContainer.className = 'search-wrapper glass-effect rounded-2xl p-4 sm:p-5 mb-6';

            const vocabHeader = document.createElement('h3');
            vocabHeader.className = 'text-lg sm:text-lg font-bold mb-4 text-primary';
            vocabHeader.textContent = getUIText('vocabResults', 'Vocabulary Results');
            sectionContainer.appendChild(vocabHeader);

            const vocabGrid = document.createElement('div');
            vocabGrid.className = 'dict-grid';

            results.words.forEach(word => {
                if (!word?.reading || !word?.senses) return;
                const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
                const isJDictViJp = state.currentLang === 'vi' && !JAPANESE_REGEX.test(word.reading.kanji);

                // Get audio path from Jotoba response
                const audioPath = word.audio || null;
                const speakText = word.reading.kana || word.reading.kanji || '';

                if (isJDictViJp) {
                    word.senses.forEach(sense => {
                        const japaneseTerm = sense.glosses?.[0] || '';
                        if (!japaneseTerm) return;
                        const card = document.createElement('div');
                        card.className = 'dict-card';
                        const reading = sense.reading || '';

                        // Check if this vocab exists in current level
                        const vocabMatch = findVocabData(japaneseTerm, reading);
                        const levelBadgeHTML = vocabMatch ? `<span class="dict-level-badge">${state.currentLevel}</span>` : '';

                        const termWithClickableKanji = japaneseTerm.split('').map(char =>
                            /[\u4e00-\u9faf]/.test(char) && findKanjiData(char) ?
                                `<span class="dict-kanji-in-level" data-action="show-kanji-details" data-id="${findKanjiData(char).id}">${char}</span>` :
                                `<span>${char}</span>`
                        ).join('');
                        const speakerBtnHTML = audioPath ? `<button class="dict-speaker-btn" data-action="play-pronunciation" data-audio="${audioPath}" data-text="${japaneseTerm}" title="Play pronunciation"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z"/><path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z"/></svg></button>` : '';
                        card.innerHTML = `<div class="dict-vocab-header"><h4 class="dict-vocab-term">${termWithClickableKanji}</h4>${reading ? `<span class="dict-vocab-reading">(${reading})</span>` : ''}${levelBadgeHTML}${speakerBtnHTML}</div><div class="dict-vocab-definitions"><p>${word.reading.kanji}</p></div>`;
                        vocabGrid.appendChild(card);
                    });
                } else {
                    const card = document.createElement('div');
                    card.className = 'dict-card';
                    const term = word.reading.kanji || word.reading.kana || '';
                    const kanaReading = word.reading.kana || '';
                    const readingDisplay = kanaReading && kanaReading !== term ? `(${kanaReading})` : '';
                    if (!term) return;

                    // Check if this vocab exists in current level
                    const vocabMatch = findVocabData(term, kanaReading);
                    const levelBadgeHTML = vocabMatch ? `<span class="dict-level-badge">${state.currentLevel}</span>` : '';

                    // Kanji in level get persistent teal styling
                    const termWithClickableKanji = term.split('').map(char =>
                        /[\u4e00-\u9faf]/.test(char) && findKanjiData(char) ?
                            `<span class="dict-kanji-in-level" data-action="show-kanji-details" data-id="${findKanjiData(char).id}">${char}</span>` :
                            `<span>${char}</span>`
                    ).join('');
                    const speakerBtnHTML = audioPath ? `<button class="dict-speaker-btn" data-action="play-pronunciation" data-audio="${audioPath}" data-text="${speakText}" title="Play pronunciation"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z"/><path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z"/></svg></button>` : '';
                    const headerHTML = `<div class="dict-vocab-header"><h4 class="dict-vocab-term">${termWithClickableKanji}</h4><span class="dict-vocab-reading">${readingDisplay}</span>${levelBadgeHTML}${speakerBtnHTML}</div>`;
                    const sensesHTML = (word.senses ?? []).map(sense => {
                        const glosses = sense.glosses?.join('; ') ?? '';
                        const pos = [...new Set((sense.pos ?? []).map(p => typeof p === 'object' ? Object.keys(p)[0] : p))];
                        const posText = pos.length > 0 ? `<span class="dict-vocab-pos">[${pos.join(', ')}]</span>` : '';
                        return `<p>${glosses} ${posText}</p>`;
                    }).join('');
                    card.innerHTML = `${headerHTML}<div class="dict-vocab-definitions">${sensesHTML}</div>`;
                    vocabGrid.appendChild(card);
                }
            });
            sectionContainer.appendChild(vocabGrid);
            contentFragment.appendChild(sectionContainer);
        }

        if (hasKanji) {
            const sectionContainer = document.createElement('div');
            sectionContainer.className = 'search-wrapper glass-effect rounded-2xl p-4 sm:p-5 mb-6';

            const kanjiHeader = document.createElement('h3');
            kanjiHeader.className = 'text-lg sm:text-lg font-bold mb-4 text-primary';
            kanjiHeader.textContent = getUIText('kanjiResults', 'Kanji Results');
            sectionContainer.appendChild(kanjiHeader);

            const kanjiGrid = document.createElement('div');
            kanjiGrid.className = 'dict-grid';
            results.kanji.forEach(k => {
                if (!k?.literal) return;
                const card = document.createElement('div');
                card.className = 'dict-card';
                const onyomi = k.onyomi?.join(', ') || '–';
                const kunyomi = k.kunyomi?.join(', ') || '–';
                const meanings = k.meanings?.join('; ') || getUIText('noDefinition', 'No definition found.');
                card.innerHTML = `<div class="dict-kanji-header"><h4 class="dict-kanji-char">${k.literal}</h4><div class="dict-kanji-readings"><p><span class="reading-label">${getUIText('onyomi', "On'yomi:")}</span> ${onyomi}</p><p><span class="reading-label">${getUIText('kunyomi', "Kun'yomi:")}</span> ${kunyomi}</p></div></div><div class="dict-kanji-meanings">${meanings}</div>`;
                kanjiGrid.appendChild(card);
            });
            sectionContainer.appendChild(kanjiGrid);
            contentFragment.appendChild(sectionContainer);
        }

        const animatedWrapper = document.createElement('div');
        if (!isInitialLoad) {
            animatedWrapper.className = 'anim-fade-in';
        }
        animatedWrapper.appendChild(contentFragment);
        resultsContainer.appendChild(animatedWrapper);

    } else {
        resultsContainer.style.display = 'none';
        placeholderContainer.style.display = 'flex';

        const placeholderBox = placeholderContainer.querySelector('.search-placeholder-box');
        if (placeholderBox) {
            placeholderBox.innerHTML = '';
            placeholderBox.innerHTML = getSearchPlaceholderInnerContent(type, query);

            if (!isInitialLoad) {
                placeholderBox.classList.remove('anim-fade-in');
                void placeholderBox.offsetWidth;
                placeholderBox.classList.add('anim-fade-in');
            }
        }
    }
}

export async function setupTabsForLevel(levelName) {
    const db = await dbPromise;
    const levelData = await db.get('levels', levelName);
    const availableDataKeys = levelData ? Object.keys(levelData) : ['kanji', 'vocab', 'grammar', 'keyPoints', 'hiragana', 'katakana'];

    document.querySelectorAll('.nav-item-wrapper').forEach(wrapper => {
        const tabName = wrapper.querySelector('[data-tab-name]')?.dataset.tabName;
        if (tabName && !['progress', 'external-search'].includes(tabName)) {
            wrapper.style.display = availableDataKeys.includes(tabName) ? '' : 'none';
        }
    });

    const showKana = ['n5', 'n4'].includes(levelName);
    const hiraganaTab = document.querySelector('[data-tab-name="hiragana"]')?.parentElement;
    const katakanaTab = document.querySelector('[data-tab-name="katakana"]')?.parentElement;

    if (hiraganaTab) hiraganaTab.style.display = showKana ? '' : 'none';
    if (katakanaTab) katakanaTab.style.display = showKana ? '' : 'none';
}

export async function renderContent(tabId = null) {
    const renderSafely = async (renderFn, tabName) => {
        try {
            if (state.appData[tabName]) {
                await renderFn();
            } else {
                const db = await dbPromise;
                const isCustomLevel = await db.get('levels', state.currentLevel);
                if (isCustomLevel) {
                    renderContentNotAvailable(tabName);
                }
            }
        } catch (e) {
            console.error("Render error in tab", tabName, ":", e);
            renderContentNotAvailable(tabName);
        }
    };

    const tabsToRender = tabId ? [tabId] : Object.keys(state.appData).filter(k => !['ui', 'progress', 'external-search'].includes(k));

    const renderMap = {
        hiragana: () => renderSafely(() => {
            if (els.hiraganaTab && state.appData.hiragana) {
                els.hiraganaTab.innerHTML = '';
                els.hiraganaTab.appendChild(createStaticSection(state.appData.hiragana, '🌸', 'var(--accent-pink)'));
                setupFuseForTab('hiragana');
            }
        }, 'hiragana'),
        katakana: () => renderSafely(() => {
            if (els.katakanaTab && state.appData.katakana) {
                els.katakanaTab.innerHTML = '';
                els.katakanaTab.appendChild(createStaticSection(state.appData.katakana, '🤖', 'var(--accent-blue)'));
                setupFuseForTab('katakana');
            }
        }, 'katakana'),
        keyPoints: () => renderSafely(() => {
            if (!els.keyPointsTab || !state.appData.keyPoints) return;
            els.keyPointsTab.innerHTML = '';
            const fragment = document.createDocumentFragment();

            for (const key in state.appData.keyPoints) {
                const section = state.appData.keyPoints[key];
                const title = getLangText(section);
                let contentNode;

                if (section.type === 'table') {
                    contentNode = createCheatSheetList(section.headers, section.content);
                } else if (section.type === 'table-grid') {
                    contentNode = createKosoadoGrid(section.content, section.headers);
                }

                if (contentNode) {
                    const contentWrapper = document.createElement('div');
                    contentWrapper.className = 'p-4 sm:p-5 sm:pt-0';
                    contentWrapper.appendChild(contentNode);
                    const searchTerms = generateSearchTerms([title, JSON.stringify(section.content)]);
                    fragment.appendChild(createAccordion(title, contentWrapper, searchTerms, key, 'keyPoints'));
                }
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'space-y-4';
            wrapper.appendChild(fragment);
            els.keyPointsTab.appendChild(wrapper);
            setupFuseForTab('keyPoints');
        }, 'keyPoints'),
        grammar: () => renderSafely(() => {
            if (!els.grammarTab || !state.appData.grammar) return;
            els.grammarTab.innerHTML = '';

            const fragment = document.createDocumentFragment();

            for (const sectionKey in state.appData.grammar) {
                const sectionData = state.appData.grammar[sectionKey];
                const sectionTitle = getLangText(sectionData);
                const grid = document.createElement('div');
                grid.className = 'grammar-grid';

                sectionData.items.forEach(item => {
                    const langItem = item[state.currentLang] || item.en;
                    const itemSearchData = generateSearchTerms([langItem.title, langItem.content]);
                    const exampleMarkerRegex = /(<br>)?<b>(Example|Ví dụ).*?<\/b>/i;
                    const match = langItem.content.match(exampleMarkerRegex);
                    let description = langItem.content;
                    let exampleHTML = '';
                    if (match?.index) {
                        description = langItem.content.substring(0, match.index);
                        exampleHTML = langItem.content.substring(match.index).replace(/^<br>/, '');
                    }
                    const card = document.createElement('div');
                    card.className = 'grammar-card cell-bg rounded-lg';
                    card.dataset.searchItem = itemSearchData;
                    card.innerHTML = `<h4 class="font-semibold text-primary noto-sans">${langItem.title}</h4><div class="grammar-description mt-2 text-secondary leading-relaxed text-sm">${description}</div>${exampleHTML ? `<div class="grammar-example mt-3 text-sm">${exampleHTML}</div>` : ''}`;
                    grid.appendChild(card);
                });

                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'p-4 sm:p-5 sm:pt-0';
                contentWrapper.appendChild(grid);
                const searchData = generateSearchTerms([sectionTitle, ...sectionData.items.flatMap(item => [item.en?.title, item.en?.content, item.vi?.title, item.vi?.content])]);

                fragment.appendChild(createAccordion(sectionTitle, contentWrapper, searchData, sectionKey, 'grammar'));
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'space-y-4';
            wrapper.appendChild(fragment);
            els.grammarTab.appendChild(wrapper);
            setupFuseForTab('grammar');
        }, 'grammar'),
        kanji: () => renderSafely(() => renderCardBasedSection('kanji', state.appData.kanji, 'kanji', 'linear-gradient(135deg, #3D5A66, var(--accent-indigo))'), 'kanji'),
        vocab: () => renderSafely(() => renderCardBasedSection('vocab', state.appData.vocab, 'vocab', 'linear-gradient(135deg, #C9A83B, var(--accent-gold))'), 'vocab')
    };

    for (const tab of tabsToRender) {
        if (renderMap[tab]) {
            await renderMap[tab]();
        }
    }
}


export function buildLevelSwitcher(remoteLevels = [], customLevels = []) {
    const sidebarSwitcher = document.getElementById('level-switcher-sidebar');
    if (!sidebarSwitcher) return;

    state.allAvailableLevels = Array.from(new Set([...remoteLevels, ...customLevels]));

    const fragment = document.createDocumentFragment();
    state.allAvailableLevels.forEach(level => {
        const isDefault = level === config.defaultLevel;
        const canBeDeleted = customLevels.includes(level) && !isDefault;

        const deleteButtonHTML = canBeDeleted ? `<button class="delete-level-btn" data-action="delete-level" data-level-name="${level}" title="${getUIText('deleteLevelTitle', 'Delete level {level}').replace('{level}', level.toUpperCase())}"><svg class="w-4 h-4 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>` : '';
        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'level-switch-item-wrapper';
        itemWrapper.innerHTML = `<button data-action="set-level" data-level-name="${level}" class="level-switch-button">${level.toUpperCase()}</button>${deleteButtonHTML}`;
        fragment.appendChild(itemWrapper);
    });

    sidebarSwitcher.innerHTML = '';
    sidebarSwitcher.appendChild(fragment);
}

export function scrollActiveLevelIntoView() {
    const activeButton = document.querySelector('#level-switcher-sidebar .level-switch-button.active');
    if (activeButton) {
        setTimeout(() => {
            activeButton.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }, 100);
    }
}

export function updateSearchPlaceholders(activeTabId) {


    const isDictionaryTab = activeTabId === 'external-search';
    const isProgressTab = activeTabId === 'progress';

    const placeholderText = isDictionaryTab
        ? getUIText('dictionaryPrompt', 'Search for words...')
        : getUIText('searchPlaceholder', 'Search anything...');

    const mobilePlaceholderText = isDictionaryTab
        ? getUIText('dictionaryPrompt', 'Search for words...')
        : getUIText('searchTabPlaceholder', 'Search in this tab...');

    if (els.searchInput) {
        els.searchInput.placeholder = isProgressTab ? getUIText('searchNotAvailable') : placeholderText;
        els.searchInput.disabled = isProgressTab;
    }
    if (els.mobileSearchInput) {
        els.mobileSearchInput.placeholder = mobilePlaceholderText;
    }
}

export function showCustomDialog({ title, message, buttons, onOpen, onClose }) {
    return new Promise((resolve) => {
        if (!els.customDialogContainer) return;

        const template = document.getElementById('custom-dialog-template');
        const clone = template.content.cloneNode(true);

        const contentContainer = els.customDialogContainer.querySelector('.modal-content-container');
        if (!contentContainer) return;

        contentContainer.innerHTML = '';
        contentContainer.appendChild(clone);

        const dialogTitle = contentContainer.querySelector('#custom-dialog-title');
        const dialogMessage = contentContainer.querySelector('#custom-dialog-message');
        const dialogActions = contentContainer.querySelector('#custom-dialog-actions');
        const closeBtn = contentContainer.querySelector('#custom-dialog-close-btn');

        dialogTitle.textContent = title;
        dialogMessage.textContent = message;
        dialogActions.innerHTML = '';

        let cleanupEventListeners;

        const handleButtonClick = (action) => {
            return () => {
                cleanupEventListeners();
                closeCustomDialog();
                if (action === 'confirm') {
                    resolve('confirm');
                } else {
                    resolve('cancel');
                }
                if (onClose) onClose(action);
            };
        };

        buttons.forEach(btnConfig => {
            const button = document.createElement('button');
            button.textContent = btnConfig.text;
            button.className = `modal-button ${btnConfig.className || 'modal-button-secondary'}`;
            button.dataset.actionType = btnConfig.action;
            button.addEventListener('click', handleButtonClick(btnConfig.action));
            dialogActions.appendChild(button);
        });

        closeBtn.addEventListener('click', handleButtonClick('cancel'));

        const handleBackdropClick = (e) => {
            if (e.target === els.customDialogBackdrop || e.target === els.customDialogWrapper) {
                handleButtonClick('cancel')();
            }
        };
        els.customDialogBackdrop.addEventListener('click', handleBackdropClick);
        els.customDialogWrapper.addEventListener('click', handleBackdropClick);


        cleanupEventListeners = () => {
            els.customDialogBackdrop.removeEventListener('click', handleBackdropClick);
            els.customDialogWrapper.removeEventListener('click', handleBackdropClick);
            closeBtn.removeEventListener('click', handleButtonClick('cancel'));
            buttons.forEach(btnConfig => {
                const btn = dialogActions.querySelector(`[data-action-type="${btnConfig.action}"]`);
                if (btn) btn.removeEventListener('click', handleButtonClick(btnConfig.action));
            });
        };

        document.body.classList.add('body-no-scroll');
        els.customDialogContainer.classList.remove('modal-hidden');
        els.customDialogBackdrop.classList.add('active');
        els.customDialogWrapper.classList.add('active');

        if (onOpen) onOpen();
    });
}

export function showCustomAlert(title, message) {

    return showCustomDialog({
        title,
        message,
        buttons: [{ text: getUIText('okButton', 'OK'), className: 'modal-button-primary', action: 'confirm' }],
    }).then(() => { });
}

export function showCustomConfirm(title, message) {

    return showCustomDialog({
        title,
        message,
        buttons: [
            { text: getUIText('cancelButton', 'Cancel'), className: 'modal-button-secondary', action: 'cancel' },
            { text: getUIText('confirmButton', 'Confirm'), className: 'modal-button-primary', action: 'confirm' }
        ],
    }).then(action => action === 'confirm');
}

export function closeCustomDialog() {
    if (!els.customDialogContainer || els.customDialogContainer.classList.contains('modal-hidden')) {
        return;
    }

    const backdrop = els.customDialogBackdrop;
    const wrapper = els.customDialogWrapper;
    const container = els.customDialogContainer;

    document.body.classList.remove('body-no-scroll');
    if (backdrop) backdrop.classList.remove('active');
    if (wrapper) wrapper.classList.remove('active');

    const onTransitionEnd = (e) => {
        if (e.target !== wrapper) return;

        container.classList.add('modal-hidden');
        const contentContainer = container.querySelector('.modal-content-container');
        if (contentContainer) {
            contentContainer.innerHTML = '';
        }
        wrapper.removeEventListener('transitionend', onTransitionEnd);
    };

    if (wrapper && getComputedStyle(wrapper).transitionDuration !== '0s') {
        wrapper.addEventListener('transitionend', onTransitionEnd, { once: true });
    } else {
        container.classList.add('modal-hidden');
        const contentContainer = container.querySelector('.modal-content-container');
        if (contentContainer) {
            contentContainer.innerHTML = '';
        }
    }
}

export async function setupFuseForTab(tabId, forceReindex = false) {
    if (!state.appData[tabId]) return;

    const workerData = [];
    const tabData = state.appData[tabId];
    for (const sectionKey in tabData) {
        const section = tabData[sectionKey];
        if (section.items) {
            section.items.forEach((item, index) => {
                // Skip placeholder items (used in kana grids)
                if (item.isPlaceholder) return;

                const terms = [
                    item.kanji,
                    item.word,
                    item.onyomi,
                    item.kunyomi,
                    item.reading,
                    item.meaning?.en,
                    item.meaning?.vi,
                    item.kana,
                    item.romaji
                ].flat().filter(Boolean).join(' ').toLowerCase();

                // Use item.id if available, otherwise generate one for kana items
                const itemId = item.id || `${sectionKey}-${item.kana || item.romaji || index}`;

                workerData.push({
                    id: itemId,
                    searchData: terms,
                    sectionKey: sectionKey
                });
            });
        }
    }

    if (workerData.length === 0) return;

    // Send data to worker for indexing
    state.searchWorker.postMessage({
        type: 'init',
        tabId: tabId,
        data: workerData
    });
}