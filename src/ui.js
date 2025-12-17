// js/ui.js

/**
 * @module ui
 * @description Handles all HTML rendering and UI updates using template elements.
 */

import { els } from './dom.js';
import { state, config } from './config.js';
import { generateSearchTerms } from './utils.js';
import { setupFuseForTab } from './handlers.js';
import { dbPromise } from './database.js';

// --- Shared Intersection Observer for Lazy Loading ---
let sharedCardObserver = null;

function getSharedCardObserver() {
    if (!sharedCardObserver) {
        sharedCardObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const skeleton = entry.target;
                    // Call the attached hydration function
                    if (typeof skeleton._hydrate === 'function') {
                        skeleton._hydrate();
                    }
                    observer.unobserve(skeleton);
                }
            });
        }, {
            rootMargin: '150% 0px', // Pre-load cards 1.5 screens ahead (reduced from 300% for memory efficiency)
            threshold: 0
        });
    }
    return sharedCardObserver;
}


// Centralized helper function to get localized text safely.
function getLangText(source, key) {
    if (!source) return '';
    const target = key ? source[key] : source;
    if (target && typeof target === 'object' && !Array.isArray(target)) {
        return target[state.currentLang] || target.en || '';
    }
    return target || '';
}


function getSearchPlaceholderInnerContent(type, query = '') {
    const getUIText = (key) => state.appData.ui?.[state.currentLang]?.[key] || `[${key}]`;
    let innerContent = '';

    switch (type) {
        case 'searching':
            innerContent = `<div class="loader"></div>`;
            break;
        case 'no-results':
            const noResultsIcon = `<svg class="w-16 h-16 text-secondary opacity-50 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>`;
            const noResultsTitle = `${getUIText('noResults')} "<b class="text-accent-teal">${query}</b>"`;
            const noResultsSubtitle = getUIText('noResultsSubtitle');
            innerContent = `
                ${noResultsIcon}
                <h3 class="text-xl font-semibold text-primary">${noResultsTitle}</h3>
                <p class="text-secondary text-base mt-1 max-w-md">${noResultsSubtitle}</p>
            `;
            break;
        case 'error':
            const errorIcon = `<svg class="w-16 h-16 text-accent-red opacity-60 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>`;
            const errorTitle = getUIText('searchErrorTitle');
            const errorSubtitle = getUIText('searchError');
            innerContent = `
                ${errorIcon}
                <h3 class="text-xl font-semibold text-primary">${errorTitle}</h3>
                <p class="text-secondary text-base mt-1 max-w-md">${errorSubtitle}</p>
                <button data-action="retry-search" data-query="${query}">${getUIText('retryButton')}</button>
            `;
            break;
        case 'prompt':
        default:
            const promptIcon = `<svg class="w-16 h-16 text-secondary opacity-50 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>`;
            const promptSubtitle = getUIText('dictionarySubtitle');
            const notice = `<div class="search-placeholder-notice">${getUIText('dictionaryNotice')}</div>`;
            innerContent = `
                ${promptIcon}
                <h3 class="text-xl font-semibold text-primary">${promptSubtitle}</h3>
                ${notice}
            `;
            break;
    }
    return innerContent;
}

export function renderContentNotAvailable(tabName) {
    const container = document.getElementById(tabName);
    if (!container) return;

    const getUIText = (key, replacements = {}) => {
        let text = state.appData.ui?.[state.currentLang]?.[key] || `[${key}]`;
        for (const [placeholder, value] of Object.entries(replacements)) {
            text = text.replace(`{${placeholder}}`, value);
        }
        return text;
    };

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

function createAccordion(title, contentNode, searchData, titleKey, tabId, category = null, totalCount = 0) {
    const template = document.getElementById('accordion-template');
    const clone = template.content.cloneNode(true);

    const wrapper = clone.querySelector('.search-wrapper');
    const button = clone.querySelector('.accordion-button');
    const titleSpan = clone.querySelector('.accordion-title');
    const hankoCounter = clone.querySelector('.hanko-counter');
    const contentDiv = clone.querySelector('.accordion-content');

    const tabAccordions = state.openAccordions.get(tabId);
    if (tabAccordions && tabAccordions.has(titleKey)) {
        button.classList.add('open');
    }

    wrapper.dataset.search = searchData;
    button.dataset.sectionTitleKey = titleKey;
    button.dataset.action = 'toggle-accordion';
    titleSpan.textContent = title;
    contentDiv.appendChild(contentNode);

    // Add hanko-style progress counter for card-based sections (kanji, vocab)
    if (category && totalCount > 0 && hankoCounter) {
        const learnedCount = state.progress[category]?.filter(id => {
            // Find items in the current section
            const sectionData = state.appData[category]?.[titleKey];
            return sectionData?.items?.some(item => item.id === id);
        }).length || 0;

        hankoCounter.textContent = `${learnedCount}/${totalCount}`;
        hankoCounter.style.display = '';
        hankoCounter.dataset.category = category;
        hankoCounter.dataset.sectionKey = titleKey;

        // Add pulse animation class if recently updated
        if (learnedCount > 0) {
            hankoCounter.classList.add('has-progress');
        }
    }

    return clone;
}


function createCheatSheetList(headers, content) {
    const fragment = document.createDocumentFragment();

    content.forEach(item => {
        const card = document.createElement('div');
        card.className = 'cheatsheet-card';

        const searchTermsForRow = Object.keys(headers).map(key => getLangText(item, key));
        card.dataset.searchItem = generateSearchTerms(searchTermsForRow);

        const mainContent = document.createElement('div');
        mainContent.className = 'cheatsheet-main';

        const particles = document.createElement('h4');
        particles.className = 'cheatsheet-particles';
        particles.textContent = getLangText(item, Object.keys(headers)[0]);

        const usage = document.createElement('p');
        usage.className = 'cheatsheet-usage';
        usage.textContent = getLangText(item, Object.keys(headers)[1]);

        mainContent.appendChild(particles);
        mainContent.appendChild(usage);

        const exampleContent = document.createElement('div');
        exampleContent.className = 'cheatsheet-example';
        exampleContent.innerHTML = getLangText(item, Object.keys(headers)[2]).replace(/\n/g, '<br>');

        card.appendChild(mainContent);
        card.appendChild(exampleContent);
        fragment.appendChild(card);
    });

    return fragment;
}


function createKosoadoGrid(content, headers) {
    const container = document.createElement('div');
    container.className = 'space-y-6';

    const headerKeys = Object.keys(headers);

    content.forEach(group => {
        const groupEl = document.createElement('div');
        const groupTitle = document.createElement('h4');
        groupTitle.className = 'font-semibold text-md mb-3 text-primary';
        groupTitle.textContent = getLangText(group, 'title');
        groupEl.appendChild(groupTitle);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';

        group.data.forEach(item => {
            const cell = document.createElement('div');
            cell.className = 'cell-bg rounded-lg p-3 flex flex-col justify-center text-center h-24';

            let primaryText = '';
            let secondaryText = '';

            if (item.reading) {
                primaryText = item.reading;
                secondaryText = getLangText(item, 'meaning');
            } else {
                primaryText = getLangText(item, headerKeys[0]);
                secondaryText = getLangText(item, headerKeys[1]);
            }

            const searchData = generateSearchTerms([primaryText, secondaryText]);
            cell.dataset.searchItem = searchData;

            cell.innerHTML = `
                <div class="font-bold text-primary text-base sm:text-lg noto-sans">${primaryText}</div>
                <div class="text-secondary text-xs sm:text-sm leading-relaxed mt-1" style="color: var(--accent-yellow)">${secondaryText}</div>
            `;
            grid.appendChild(cell);
        });

        groupEl.appendChild(grid);
        container.appendChild(groupEl);
    });

    return container;
}


const createCard = (item, category, backGradient) => {
    const template = document.getElementById('card-template');
    const clone = template.content.cloneNode(true);

    const root = clone.querySelector('.relative');
    const learnToggle = clone.querySelector('.learn-toggle');
    const cardFront = clone.querySelector('.card-face-front');
    const cardBack = clone.querySelector('.card-face-back');
    const cardElement = clone.querySelector('.card');

    if (cardElement) {
        cardElement.dataset.action = 'flip-card';
    }

    if (category === 'kanji') {
        const detailsToggle = document.createElement('div');
        detailsToggle.className = 'details-toggle';
        detailsToggle.dataset.action = 'show-kanji-details';
        detailsToggle.dataset.id = item.id;
        detailsToggle.innerHTML = `<svg class="h-4 w-4 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 512" fill="currentColor"><path d="M48 80a48 48 0 1 1 96 0A48 48 0 1 1 48 80zM0 224c0-17.7 14.3-32 32-32l64 0c17.7 0 32 14.3 32 32l0 224 32 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 512c-17.7 0-32-14.3-32-32s14.3-32 32-32l32 0 0-192-32 0c-17.7 0-32-14.3-32-32z"/></svg>`;
        root.prepend(detailsToggle);
    }

    const isLearned = state.progress[category]?.includes(item.id);
    const meaningText = getLangText(item, 'meaning');

    const frontContent = category === 'kanji'
        ? `<p class="text-4xl sm:text-6xl font-bold noto-sans">${item.kanji}</p>`
        : `<div class="text-center p-2"><p class="text-xl sm:text-2xl font-semibold noto-sans">${item.word}</p></div>`;

    let backContent = '';
    if (category === 'kanji') {
        backContent = `<div class="w-full text-center"><p class="font-bold text-xl mb-2">${meaningText}</p><div class="text-sm opacity-80"><p>On: ${item.onyomi}</p><p>Kun: ${item.kunyomi || '–'}</p></div></div>`;
        cardBack.style.justifyContent = 'center';
    } else {
        backContent = `<p class="text-lg sm:text-xl font-bold">${item.reading}</p><p class="text-sm">${meaningText}</p>`;
        cardBack.style.justifyContent = 'space-around';
    }

    const searchTerms = generateSearchTerms([item.kanji, item.word, item.onyomi, item.kunyomi, item.reading, item.meaning?.en, item.meaning?.vi]);
    root.dataset.searchItem = searchTerms;
    root.dataset.itemId = item.id;

    learnToggle.classList.toggle('learned', isLearned);
    learnToggle.dataset.category = category;
    learnToggle.dataset.id = item.id;

    cardFront.innerHTML = frontContent;
    cardBack.innerHTML = backContent;
    cardBack.style.background = backGradient;

    return clone;
};

/**
 * Creates a section of cards (e.g., Grammar, Vocab) dynamically.
 * Uses skeleton loading for performance - renders lightweight placeholders first,
 * then hydrates them to real cards when they enter the viewport.
 * 
 * @param {string} title - The section title.
 * @param {Array} data - Array of data items to render.
 * @param {string} category - Category identifier (e.g., 'vocab').
 * @param {string} backGradient - CSS class or value for card back gradient.
 * @param {string} titleKey - Localization key for the title.
 * @param {string} tabId - The ID of the tab this section belongs to.
 * @returns {HTMLElement} The constructed section element.
 */
// Helper for chunked rendering to avoid blocking main thread
// Helper for chunked rendering to avoid blocking main thread
function renderChunks(items, renderFn, container, initialChunkSize = 48, chunkSize = 100) {
    return new Promise((resolve) => {
        let index = 0;
        const total = items.length;

        // Optimization: Reduce initial sync chunk on mobile to unblock main thread faster
        const isMobile = window.innerWidth <= 768;
        const effectiveInitialSize = isMobile ? Math.min(initialChunkSize, 30) : initialChunkSize;

        const renderBlock = () => {
            const start = performance.now();
            const fragment = document.createDocumentFragment();
            // 8ms budget to maintain ~60fps
            const timeBudget = 8;
            let count = 0;

            while (index < total) {
                fragment.appendChild(renderFn(items[index], index));
                index++;
                count++;

                // Check budget every 5 items to minimize overhead
                if (count % 5 === 0) {
                    if (count >= chunkSize || (performance.now() - start > timeBudget)) {
                        break;
                    }
                }
            }
            container.appendChild(fragment);

            if (index < total) {
                requestAnimationFrame(renderBlock);
            } else {
                resolve();
            }
        };

        // First chunk sync
        if (effectiveInitialSize > 0 && index < total) {
            const fragment = document.createDocumentFragment();
            const end = Math.min(index + effectiveInitialSize, total);
            for (; index < end; index++) {
                fragment.appendChild(renderFn(items[index], index));
            }
            container.appendChild(fragment);
        }

        if (index < total) {
            requestAnimationFrame(renderBlock);
        } else {
            resolve();
        }
    });
}

/**
 * Creates a section of cards (e.g., Grammar, Vocab) dynamically.
 * Uses skeleton loading for performance - renders lightweight placeholders first,
 * then hydrates them to real cards when they enter the viewport.
 * 
 * @param {string} title - The section title.
 * @param {Array} data - Array of data items to render.
 * @param {string} category - Category identifier (e.g., 'vocab').
 * @param {string} backGradient - CSS class or value for card back gradient.
 * @param {string} titleKey - Localization key for the title.
 * @param {string} tabId - The ID of the tab this section belongs to.
 * @returns {object} { element: HTMLElement, renderPromise: Promise }
 */
function createCardSection(title, data, category, backGradient, titleKey, tabId) {
    const cardGrid = document.createElement('div');
    // Using 2-column grid on mobile, scaling up on larger screens
    cardGrid.className = 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6';

    // Create skeleton placeholder cards - lightweight placeholders that match real card dimensions
    const createSkeletonCard = (item, index) => {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-card';
        skeleton.innerHTML = `
            <div class="skeleton-card-inner">
                <div class="skeleton-line skeleton-line-lg"></div>
                <div class="skeleton-line skeleton-line-sm"></div>
            </div>
        `;

        // Tag the skeleton so the shared observer knows how to hydration it
        skeleton._hydrate = () => {
            if (!skeleton.isConnected || skeleton.classList.contains('skeleton-hydrated')) return;

            const realCard = createCard(item, category, backGradient);
            const cardElement = realCard.firstElementChild;
            cardElement.classList.add('skeleton-hydrated');
            skeleton.replaceWith(cardElement);
        };

        // Use requestIdleCallback for non-critical observation setup
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => getSharedCardObserver().observe(skeleton), { timeout: 100 });
        } else {
            setTimeout(() => getSharedCardObserver().observe(skeleton), 0);
        }

        return skeleton;
    };

    // Use chunked rendering for the skeletons
    const renderPromise = renderChunks(data, createSkeletonCard, cardGrid, 48, 100);

    const accordionContentWrapper = document.createElement('div');
    accordionContentWrapper.className = 'p-4 sm:p-5 sm:pt-0';
    accordionContentWrapper.appendChild(cardGrid);

    // Generate search terms for the whole section to help filtering
    const searchTermsForSection = generateSearchTerms([title, ...data.flatMap(item => [item.kanji, item.word, item.meaning?.en, item.meaning?.vi])]);

    const accordion = createAccordion(title, accordionContentWrapper, searchTermsForSection, titleKey, tabId, category, data.length);

    return { element: accordion, renderPromise };
}


const createStaticSection = (data, icon, color) => {
    const fragment = document.createDocumentFragment();
    if (!data) return fragment;

    Object.entries(data).forEach(([sectionKey, sectionData]) => {
        // Static sections (kana) are usually small enough to not need chunking
        if (!sectionData.items) return;
        const items = sectionData.items;
        const title = getLangText(sectionData);
        const searchTerms = generateSearchTerms([title, ...items.flatMap(i => i.isPlaceholder ? [] : [i.kana, i.romaji])]);

        const content = `<div class="kana-grid">${items.map((item) => {
            if (item.isPlaceholder) return `<div></div>`;
            const isDigraph = item.kana && item.kana.length > 1;
            const fontClass = isDigraph ? 'kana-font-digraph' : 'kana-font';
            const itemSearchData = generateSearchTerms([item.kana, item.romaji]);
            return `<div class="flex flex-col items-center justify-center p-2 rounded-xl h-20 sm:h-24 text-center cell-bg" data-search-item="${itemSearchData}"><p class="noto-sans ${fontClass}" style="color:${color};">${item.kana}</p><p class="text-xs sm:text-sm text-secondary">${item.romaji}</p></div>`;
        }).join('')}</div>`;

        const sectionHTML = `<div class="search-wrapper glass-effect rounded-2xl p-4 sm:p-5 mb-6" data-search="${searchTerms}"><h3 class="text-lg sm:text-lg font-bold mb-4 flex items-center gap-2 text-primary" data-section-title-key="${sectionKey}"><span class="text-2xl">${icon}</span> ${title}</h3>${content}</div>`;
        fragment.appendChild(document.createRange().createContextualFragment(sectionHTML));
    });

    return fragment;
}

function createProgressItem(tab, title, learned, total, color, titleKey) {
    const template = document.getElementById('progress-item-template');
    const clone = template.content.cloneNode(true);

    const wrapper = clone.querySelector('.progress-item-wrapper');
    const fillCircle = clone.querySelector('.progress-fill');
    const percentageText = clone.querySelector('.progress-percentage');
    const titleP = clone.querySelector('.progress-title');
    const statsP = clone.querySelector('.progress-stats');

    const percentage = total > 0 ? (learned / total) * 100 : 0;
    const radius = 22;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    const emojiMatch = title.match(/\s(.*?)$/);
    const cleanTitle = emojiMatch ? title.replace(emojiMatch[0], '') : title;
    const emoji = emojiMatch ? emojiMatch[1] : '';

    wrapper.dataset.tabName = tab;
    wrapper.dataset.sectionKey = titleKey;
    wrapper.dataset.action = 'jump-to-section';

    fillCircle.style.strokeDasharray = circumference;
    fillCircle.style.strokeDashoffset = offset;
    fillCircle.style.stroke = `url(#${color}-gradient)`;

    percentageText.textContent = `${Math.round(percentage)}%`;
    titleP.textContent = `${cleanTitle} ${emoji}`;
    statsP.textContent = `${learned} / ${total}`;

    return clone;
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

    const renderPromises = [];

    for (const key in data) {
        const section = data[key];
        if (!section.items) continue;

        const title = getLangText(section);
        const { element, renderPromise } = createCardSection(title, section.items, category, gradient, key, containerId);
        wrapper.appendChild(element);
        renderPromises.push(renderPromise);
    }

    // Call setupFuse initially for available content
    setupFuseForTab(category);

    // Re-index Fuse when all chunks are loaded to ensure everything is searchable
    // This runs in the background
    Promise.all(renderPromises).then(() => {
        setupFuseForTab(category, true);
    });
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
    const getUIText = (key, fallback) => state.appData.ui?.[state.currentLang]?.[key] || fallback;

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

                if (isJDictViJp) {
                    word.senses.forEach(sense => {
                        const japaneseTerm = sense.glosses?.[0] || '';
                        if (!japaneseTerm) return;
                        const card = document.createElement('div');
                        card.className = 'dict-card';
                        const reading = sense.reading || '';
                        const termWithClickableKanji = japaneseTerm.split('').map(char =>
                            /[\u4e00-\u9faf]/.test(char) && findKanjiData(char) ?
                                `<span class="hover:text-accent-teal cursor-pointer transition-colors" data-action="show-kanji-details" data-id="${findKanjiData(char).id}">${char}</span>` :
                                `<span>${char}</span>`
                        ).join('');
                        card.innerHTML = `<div class="dict-vocab-header"><h4 class="dict-vocab-term">${termWithClickableKanji}</h4>${reading ? `<span class="dict-vocab-reading">(${reading})</span>` : ''}</div><div class="dict-vocab-definitions"><p>${word.reading.kanji}</p></div>`;
                        vocabGrid.appendChild(card);
                    });
                } else {
                    const card = document.createElement('div');
                    card.className = 'dict-card';
                    const term = word.reading.kanji || word.reading.kana || '';
                    const reading = word.reading.kana && word.reading.kana !== term ? `(${word.reading.kana})` : '';
                    if (!term) return;
                    const termWithClickableKanji = term.split('').map(char =>
                        /[\u4e00-\u9faf]/.test(char) && findKanjiData(char) ?
                            `<span class="hover:text-accent-teal cursor-pointer transition-colors" data-action="show-kanji-details" data-id="${findKanjiData(char).id}">${char}</span>` :
                            `<span>${char}</span>`
                    ).join('');
                    const headerHTML = `<div class="dict-vocab-header"><h4 class="dict-vocab-term">${termWithClickableKanji}</h4><span class="dict-vocab-reading">${reading}</span></div>`;
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

function prepareKanaData(originalData) {
    if (!originalData) return {};
    const data = JSON.parse(JSON.stringify(originalData));

    const LAYOUTS = {
        gojuon: ['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so', 'ta', 'chi', 'tsu', 'te', 'to', 'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho', 'ma', 'mi', 'mu', 'me', 'mo', 'ya', null, 'yu', null, 'yo', 'ra', 'ri', 'ru', 're', 'ro', 'wa', null, null, null, 'wo', 'n', null, null, null, null],
        dakuten: ['ga', 'gi', 'gu', 'ge', 'go', 'za', 'ji', 'zu', 'ze', 'zo', 'da', 'di', 'dzu', 'de', 'do', 'ba', 'bi', 'bu', 'be', 'bo'],
        handakuten: ['pa', 'pi', 'pu', 'pe', 'po'],
        youon: ['kya', null, 'kyu', null, 'kyo', 'sha', null, 'shu', null, 'sho', 'cha', null, 'chu', null, 'cho', 'nya', null, 'nyu', null, 'nyo', 'hya', null, 'hyu', null, 'hyo', 'mya', null, 'myu', null, 'myo', 'rya', null, 'ryu', null, 'ryo', 'gya', null, 'gyu', null, 'gyo', 'ja', null, 'ju', null, 'jo', 'bya', null, 'byu', null, 'byo', 'pya', null, 'pyu', null, 'pyo']
    };

    for (const sectionKey in data) {
        const section = data[sectionKey];
        if (!section?.items?.length) continue;

        const originalItems = section.items;
        const romajiSet = new Set(originalItems.map(item => item.romaji));

        const findChar = (romaji) => originalItems.find(i => i.romaji === romaji) || { isPlaceholder: true };

        let layoutToApply = null;

        if (romajiSet.has('kya') || romajiSet.has('gya')) {
            layoutToApply = LAYOUTS.youon;
        } else if (romajiSet.has('ga') || romajiSet.has('za')) {
            layoutToApply = LAYOUTS.dakuten;
        } else if (romajiSet.has('pa')) {
            layoutToApply = LAYOUTS.handakuten;
        } else if (romajiSet.has('a')) {
            layoutToApply = LAYOUTS.gojuon;
        }

        if (layoutToApply) {
            section.items = layoutToApply.map(r => r ? findChar(r) : { isPlaceholder: true });
        }
    }
    return data;
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
                els.hiraganaTab.appendChild(createStaticSection(prepareKanaData(state.appData.hiragana), '🌸', 'var(--accent-pink)'));
                setupFuseForTab('hiragana');
            }
        }, 'hiragana'),
        katakana: () => renderSafely(() => {
            if (els.katakanaTab && state.appData.katakana) {
                els.katakanaTab.innerHTML = '';
                els.katakanaTab.appendChild(createStaticSection(prepareKanaData(state.appData.katakana), '🤖', 'var(--accent-blue)'));
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
        grammar: () => renderSafely(async () => {
            if (!els.grammarTab || !state.appData.grammar) return;
            els.grammarTab.innerHTML = '';

            const wrapper = document.createElement('div');
            wrapper.className = 'space-y-4';
            els.grammarTab.appendChild(wrapper);

            const sections = Object.keys(state.appData.grammar);

            const renderSection = (sectionKey) => {
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

                return createAccordion(sectionTitle, contentWrapper, searchData, sectionKey, 'grammar');
            };

            // Use chunked rendering for grammar sections
            await renderChunks(sections, renderSection, wrapper, 5, 20);

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

        const deleteButtonHTML = canBeDeleted ? `<button class="delete-level-btn" data-action="delete-level" data-level-name="${level}" title="Delete level ${level.toUpperCase()}"><svg class="w-4 h-4 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg></button>` : '';
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
    const getUIText = (key, fallback = '') => state.appData.ui?.[state.currentLang]?.[key] || fallback;

    const isDictionaryTab = activeTabId === 'external-search';
    const isProgressTab = activeTabId === 'progress';

    const placeholderText = isDictionaryTab
        ? getUIText('dictionaryPrompt', 'Search for words...')
        : getUIText('searchPlaceholder', 'Search anything...');

    const mobilePlaceholderText = isDictionaryTab
        ? getUIText('dictionaryPrompt', 'Search for words...')
        : getUIText('searchTabPlaceholder', 'Search in this tab...');

    if (els.searchInput) {
        els.searchInput.placeholder = isProgressTab ? "Search not available in Progress tab" : placeholderText;
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
    const getUIText = (key) => state.appData.ui?.[state.currentLang]?.[key] || `[${key}]`;
    return showCustomDialog({
        title,
        message,
        buttons: [{ text: getUIText('okButton', 'OK'), className: 'modal-button-primary', action: 'confirm' }],
    }).then(() => { });
}

export function showCustomConfirm(title, message) {
    const getUIText = (key) => state.appData.ui?.[state.currentLang]?.[key] || `[${key}]`;
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