/**
 * @module rendering
 * @description UI component rendering helpers - cards, accordions, kana grids, etc.
 */

import { state } from './config.js';
import { generateSearchTerms } from './utils.js';

/**
 * Centralized helper function to get localized text safely.
 * @param {object} source - The data source object
 * @param {string} key - Optional key to access within source
 * @returns {string} The localized text
 */
export function getLangText(source, key) {
    if (!source) return '';
    const target = key ? source[key] : source;
    if (target && typeof target === 'object' && !Array.isArray(target)) {
        return target[state.currentLang] || target.en || '';
    }
    return target || '';
}

/**
 * Generate search placeholder inner content based on type
 * @param {string} type - 'searching', 'no-results', 'error', or 'prompt'
 * @param {string} query - The search query (for display)
 * @returns {string} HTML content for the placeholder
 */
export function getSearchPlaceholderInnerContent(type, query = '') {
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

/**
 * Create an accordion component with lazy rendering support
 * @param {string} title - The accordion title
 * @param {HTMLElement} contentNode - The content to display when opened
 * @param {string} searchData - Search terms for filtering
 * @param {string} titleKey - Localization key for the title
 * @param {string} tabId - The tab this accordion belongs to
 * @param {string|null} category - Category for progress tracking (e.g., 'kanji', 'vocab')
 * @param {number} totalCount - Total items count for progress display
 * @returns {DocumentFragment} The accordion element
 */
export function createAccordion(title, contentNode, searchData, titleKey, tabId, category = null, totalCount = 0) {
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

/**
 * Create a cheatsheet list layout
 * @param {object} headers - Header configuration object
 * @param {Array} content - Array of content items
 * @returns {DocumentFragment} The cheatsheet list element
 */
export function createCheatSheetList(headers, content) {
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

/**
 * Create a kosoado grid layout
 * @param {Array} content - Array of content groups
 * @param {object} headers - Header configuration object
 * @returns {HTMLElement} The grid container element
 */
export function createKosoadoGrid(content, headers) {
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

/**
 * Create a flashcard element
 * @param {object} item - The card data
 * @param {string} category - The category ('kanji' or 'vocab')
 * @param {string} backGradient - CSS gradient for card back
 * @returns {DocumentFragment} The card element
 */
export function createCard(item, category, backGradient) {
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
}

/**
 * Creates a section of cards (e.g., Grammar, Vocab) dynamically.
 * Uses Accordion-Level Lazy Rendering: The content is NOT rendered until the accordion is opened.
 * 
 * @param {string} title - The section title.
 * @param {Array} data - Array of data items to render.
 * @param {string} category - Category identifier (e.g., 'vocab').
 * @param {string} backGradient - CSS class or value for card back gradient.
 * @param {string} titleKey - Localization key for the title.
 * @param {string} tabId - The ID of the tab this section belongs to.
 * @returns {object} { element: HTMLElement }
 */
export function createCardSection(title, data, category, backGradient, titleKey, tabId) {
    const accordionContentWrapper = document.createElement('div');
    accordionContentWrapper.className = 'p-4 sm:p-5 sm:pt-0';

    // Note: We don't create the grid children yet.
    const cardGrid = document.createElement('div');
    cardGrid.className = 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6';
    accordionContentWrapper.appendChild(cardGrid);

    // Generate search terms for the whole section to help filtering
    const searchTermsForSection = generateSearchTerms([title, ...data.flatMap(item => [item.kanji, item.word, item.meaning?.en, item.meaning?.vi])]);

    const accordionFragment = createAccordion(title, accordionContentWrapper, searchTermsForSection, titleKey, tabId, category, data.length);
    const accordionWrapper = accordionFragment.querySelector('.search-wrapper');

    // Attach the rendering logic to the wrapper element
    if (accordionWrapper) {
        accordionWrapper._isRendered = false;
        accordionWrapper._renderContent = () => {
            if (accordionWrapper._isRendered) return;

            const fragment = document.createDocumentFragment();
            data.forEach(item => {
                const cardClone = createCard(item, category, backGradient);
                fragment.appendChild(cardClone);
            });
            cardGrid.appendChild(fragment);
            accordionWrapper._isRendered = true;
        };

        // If the accordion is already open (persisted state), render content immediately
        if (state.openAccordions.get(tabId)?.has(titleKey)) {
            accordionWrapper._renderContent();
        }
    }

    return { element: accordionFragment };
}

/**
 * Create a static section for kana display
 * @param {object} data - The kana data object
 * @param {string} icon - Emoji icon for the section
 * @param {string} color - CSS color for the kana text
 * @returns {DocumentFragment} The section elements
 */
export function createStaticSection(data, icon, color) {
    const fragment = document.createDocumentFragment();
    if (!data) return fragment;

    Object.entries(data).forEach(([sectionKey, sectionData]) => {
        // Static sections (kana) are usually small enough to not need chunking
        if (!sectionData.items) return;
        const items = sectionData.items;
        const title = getLangText(sectionData);
        const searchTerms = generateSearchTerms([title, ...items.flatMap(i => i.isPlaceholder ? [] : [i.kana, i.romaji])]);

        const content = `<div class="kana-grid">${items.map((item, index) => {
            if (item.isPlaceholder) return `<div></div>`;
            const isDigraph = item.kana && item.kana.length > 1;
            const fontClass = isDigraph ? 'kana-font-digraph' : 'kana-font';
            const itemSearchData = generateSearchTerms([item.kana, item.romaji]);
            // Generate matching ID for search filtering
            const itemId = `${sectionKey}-${item.kana || item.romaji || index}`;
            return `<div class="flex flex-col items-center justify-center p-2 rounded-xl h-20 sm:h-24 text-center cell-bg" data-search-item="${itemSearchData}" data-item-id="${itemId}"><p class="noto-sans ${fontClass}" style="color:${color};">${item.kana}</p><p class="text-xs sm:text-sm text-secondary">${item.romaji}</p></div>`;
        }).join('')}</div>`;

        const sectionHTML = `<div class="search-wrapper glass-effect rounded-2xl p-4 sm:p-5 mb-6" data-search="${searchTerms}"><h3 class="text-lg sm:text-lg font-bold mb-4 flex items-center gap-2 text-primary" data-section-title-key="${sectionKey}"><span class="text-2xl">${icon}</span> ${title}</h3>${content}</div>`;
        fragment.appendChild(document.createRange().createContextualFragment(sectionHTML));
    });

    return fragment;
}

/**
 * Create a progress item for the dashboard
 * @param {string} tab - The tab name
 * @param {string} title - The section title
 * @param {number} learned - Number of learned items
 * @param {number} total - Total number of items
 * @param {string} color - Gradient color name
 * @param {string} titleKey - The section key for navigation
 * @returns {DocumentFragment} The progress item element
 */
export function createProgressItem(tab, title, learned, total, color, titleKey) {
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

/**
 * Prepare kana data with proper grid layout
 * @param {object} originalData - The original kana data
 * @returns {object} The transformed data with proper layout
 */
export function prepareKanaData(originalData) {
    if (!originalData) return {};
    const data = JSON.parse(JSON.stringify(originalData));

    const LAYOUTS = {
        gojuon: ['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so', 'ta', 'chi', 'tsu', 'te', 'to', 'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho', 'ma', 'mi', 'mu', 'me', 'mo', 'ya', null, 'yu', null, 'yo', 'ra', 'ri', 'ru', 're', 'ro', 'wa', null, null, null, 'wo', 'n', null, null, null, null],
        dakuten: ['ga', 'gi', 'gu', 'ge', 'go', 'za', 'ji', 'zu', 'ze', 'zo', 'da', 'di', 'dzu', 'de', 'do', 'ba', 'bi', 'bu', 'be', 'bo', 'pa', 'pi', 'pu', 'pe', 'po'],
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
