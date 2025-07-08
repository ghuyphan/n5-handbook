/**
 * @module ui
 * @description Handles all HTML rendering and UI updates using template elements.
 */

import { els } from './dom.js';
import { state, config } from './config.js';
import { generateSearchTerms } from './utils.js';
import { setupFuseForTab } from './handlers.js';

// --- Template-based Component Creators ---

/**
 * Creates an accordion component from its HTML template.
 * @param {string} title - The title of the accordion.
 * @param {DocumentFragment | HTMLElement} contentNode - The DOM node or fragment to insert as content.
 * @param {string} searchData - The string of search terms for the accordion.
 * @param {string} titleKey - The language key for the title.
 * @returns {DocumentFragment} The populated accordion component.
 */
function createAccordion(title, contentNode, searchData, titleKey) {
    const template = document.getElementById('accordion-template');
    const clone = template.content.cloneNode(true);

    const wrapper = clone.querySelector('.search-wrapper');
    const button = clone.querySelector('.accordion-button');
    const titleSpan = clone.querySelector('.accordion-title');
    const contentDiv = clone.querySelector('.accordion-content');

    wrapper.dataset.search = searchData;
    button.dataset.sectionTitleKey = titleKey;
    button.dataset.action = 'toggle-accordion'; // Add this line
    titleSpan.textContent = title;
    contentDiv.appendChild(contentNode);

    return clone;
}

/**
 * Creates a styled list for Key Points sections.
 * @param {Array<Object>} items - Array of data for list items.
 * @returns {HTMLElement} A div element containing the grid of styled items.
 */
function createStyledList(items) {
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';

    items.forEach(item => {
        const title = item.Kanji || item.Reading || Object.values(item)[0];
        let subtitle = '';
        if (item.Reading && title !== item.Reading) subtitle = item.Reading;

        let translation = '';
        if (state.currentLang === 'vi' && item.vi) {
            translation = `<span style="color: var(--accent-yellow)">${item.vi}</span>`;
        } else if (state.currentLang === 'en' && (item.Number || item.en)) {
            translation = `<span style="color: var(--accent-yellow)">${item.Number || item.en}</span>`;
        }

        const searchData = generateSearchTerms([title, subtitle, item.vi, item.en, item.Number]);

        const cell = document.createElement('div');
        cell.className = 'cell-bg rounded-lg p-3 flex flex-col justify-center text-center h-24';
        cell.dataset.searchItem = searchData;
        cell.innerHTML = `
            <div class="font-bold text-primary text-base sm:text-lg noto-sans">${title}</div>
            ${subtitle ? `<div class="text-secondary text-xs sm:text-sm leading-relaxed mt-1">${subtitle}</div>` : ''}
            <div class="text-secondary text-xs sm:text-sm leading-relaxed mt-1">${translation}</div>
        `;
        grid.appendChild(cell);
    });

    return grid;
}

/**
 * Creates a flippable card component from its HTML template.
 * @param {Object} item - The data object for the card (kanji or vocab).
 * @param {string} category - The category of the card ('kanji' or 'vocab').
 * @param {string} backGradient - The CSS gradient for the card's back face.
 * @returns {DocumentFragment} The populated card component.
 */
const createCard = (item, category, backGradient) => {
    const template = document.getElementById('card-template');
    const clone = template.content.cloneNode(true);

    const root = clone.querySelector('.relative');
    const learnToggle = clone.querySelector('.learn-toggle');
    const cardFront = clone.querySelector('.card-face-front');
    const cardBack = clone.querySelector('.card-face-back');

    // Only add the details toggle for Kanji cards
    if (category === 'kanji') {
        const detailsToggle = document.createElement('div');
        detailsToggle.className = 'details-toggle'; // The new CSS class
        detailsToggle.dataset.action = 'show-kanji-details';
        detailsToggle.dataset.id = item.id;
        // A simple info icon
        detailsToggle.innerHTML = `
            <svg class="h-4 w-4 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 512" fill="currentColor">
                <path d="M48 80a48 48 0 1 1 96 0A48 48 0 1 1 48 80zM0 224c0-17.7 14.3-32 32-32l64 0c17.7 0 32 14.3 32 32l0 224 32 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 512c-17.7 0-32-14.3-32-32s14.3-32 32-32l32 0 0-192-32 0c-17.7 0-32-14.3-32-32z"/>
            </svg>
        `;
        // Prepend it to the root container. Since the checkmark is last, this will appear on the left.
        root.prepend(detailsToggle);
    }

    const isLearned = state.progress[category]?.includes(item.id);
    const meaningText = item.meaning?.[state.currentLang] || item.meaning?.en || '';

    const frontContent = category === 'kanji'
        ? `<p class="text-4xl sm:text-6xl font-bold noto-sans">${item.kanji}</p>`
        : `<div class="text-center p-2"><p class="text-xl sm:text-2xl font-semibold noto-sans">${item.word}</p></div>`;

    let backContent = '';
    if (category === 'kanji') {
        // The "View Details" button is now removed from the back.
        backContent = `
            <div class="w-full text-center">
                <p class="font-bold text-xl mb-2">${meaningText}</p>
                <div class="text-sm opacity-80">
                    <p>On: ${item.onyomi}</p>
                    <p>Kun: ${item.kunyomi || '–'}</p>
                </div>
            </div>`;
        cardBack.style.justifyContent = 'center'; // Center the text content

    } else {
        // Vocab cards remain unchanged
        backContent = `
            <p class="text-lg sm:text-xl font-bold">${item.reading}</p>
            <p class="text-sm">${meaningText}</p>`;
        cardBack.style.justifyContent = 'space-around';
    }

    const searchTerms = generateSearchTerms([
        item.kanji, item.word, item.onyomi, item.kunyomi,
        item.reading, item.meaning?.en, item.meaning?.vi,
    ]);

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
 * Creates an accordion section filled with cards.
 * @param {string} title - The title for the section's accordion header.
 * @param {Array<Object>} data - The array of items to create cards from.
 * @param {string} category - The category of the items ('kanji' or 'vocab').
 * @param {string} backGradient - The CSS gradient for the cards' back faces.
 * @param {string} titleKey - The language key for the accordion title.
 * @returns {DocumentFragment} The complete accordion section component.
 */
const createCardSection = (title, data, category, backGradient, titleKey) => {
    if (!data || data.length === 0) return document.createDocumentFragment();

    const cardGrid = document.createElement('div');
    cardGrid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4';

    const fragment = document.createDocumentFragment();
    data.forEach(item => fragment.appendChild(createCard(item, category, backGradient)));
    cardGrid.appendChild(fragment);

    const accordionContentWrapper = document.createElement('div');
    accordionContentWrapper.className = 'p-4 sm:p-5 sm:pt-0';
    accordionContentWrapper.appendChild(cardGrid);

    const searchTermsForSection = generateSearchTerms(
        [title, ...data.flatMap(item => [item.kanji, item.word, item.meaning?.en, item.meaning?.vi])]
    );

    return createAccordion(title, accordionContentWrapper, searchTermsForSection, titleKey);
};

/**
 * Creates a static section for Hiragana or Katakana.
 * @param {Object} data - The data for the static sections.
 * @param {string} icon - The emoji icon for the section header.
 * @param {string} color - The color for the kana characters.
 * @returns {DocumentFragment} A fragment containing all the static sections.
 */
const createStaticSection = (data, icon, color) => {
    const fragment = document.createDocumentFragment();
    if (!data) return fragment;

    Object.entries(data).forEach(([sectionKey, sectionData]) => {
        if (!sectionData.items) return;
        const items = sectionData.items;
        const title = sectionData[state.currentLang] || sectionData['en'] || sectionKey;
        const searchTerms = generateSearchTerms([title, ...items.flatMap(i => i.isPlaceholder ? [] : [i.kana, i.romaji])]);

        const content = `<div class="kana-grid">
          ${items.map((item) => {
            if (item.isPlaceholder) return `<div></div>`;
            const isDigraph = item.kana && item.kana.length > 1;
            const fontClass = isDigraph ? 'kana-font-digraph' : 'kana-font';
            const itemSearchData = generateSearchTerms([item.kana, item.romaji]);
            return `
                <div class="flex flex-col items-center justify-center p-2 rounded-xl h-20 sm:h-24 text-center cell-bg" data-search-item="${itemSearchData}">
                    <p class="noto-sans ${fontClass}" style="color:${color};">${item.kana}</p>
                    <p class="text-xs sm:text-sm text-secondary">${item.romaji}</p>
                </div>`;
        }).join('')}
        </div>`;

        const sectionHTML = `
            <div class="search-wrapper glass-effect rounded-2xl p-4 sm:p-5 mb-6" data-search="${searchTerms}">
                <h3 class="text-lg sm:text-lg font-bold mb-4 flex items-center gap-2 text-primary" data-section-title-key="${sectionKey}">
                    <span class="text-2xl">${icon}</span> ${title}
                </h3>
                ${content}
            </div>`;
        fragment.appendChild(document.createRange().createContextualFragment(sectionHTML));
    });

    return fragment;
}

/**
 * Creates a progress item component from its HTML template.
 * @param {string} tab - The tab ID to jump to.
 * @param {string} title - The title of the progress item.
 * @param {number} learned - The number of items learned.
 * @param {number} total - The total number of items.
 * @param {string} color - The base color for the progress circle gradient.
 * @param {string} titleKey - The language key for jumping to the section.
 * @returns {DocumentFragment} The populated progress item component.
 */
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

    fillCircle.style.strokeDasharray = circumference;
    fillCircle.style.strokeDashoffset = offset;
    fillCircle.style.stroke = `url(#${color}-gradient)`;

    percentageText.textContent = `${Math.round(percentage)}%`;
    titleP.textContent = `${cleanTitle} ${emoji}`;
    statsP.textContent = `${learned} / ${total}`;

    return clone;
}

// --- Main UI Update Functions ---

export function updateLevelUI(level) {
    // This function is no longer needed as the level badges have been replaced by the site icon.
    // const levelText = level.toUpperCase();
    // if (els.levelBadgeDesktop) els.levelBadgeDesktop.textContent = levelText;
    // if (els.levelBadgeMobile) els.levelBadgeMobile.textContent = levelText;
}

export function updateProgressDashboard() {
    const containers = [els.progressOverview, els.progressTab];
    if (!state.appData.ui) return;

    // On first load, ensure the containers are ready and have the SVG gradients
    containers.forEach(container => {
        if (container && !container.querySelector('.progress-item-wrapper')) {
            const overviewTitle = `<h2 class="text-xl font-bold mb-5" data-lang-key="progressOverview">${state.appData.ui[state.currentLang]?.progressOverview || 'Progress Overview'}</h2>`;
            const gradientsSVG = `<svg width="0" height="0"><defs>
                <linearGradient id="purple-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#A78BFA" /><stop offset="100%" stop-color="#8B5CF6" /></linearGradient>
                <linearGradient id="green-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4ADE80" /><stop offset="100%" stop-color="#22C55E" /></linearGradient>
            </defs></svg>`;
            const wrapper = document.createElement('div');
            wrapper.className = 'space-y-4';
            wrapper.id = `progress-wrapper-${container.id}`;
            container.innerHTML = overviewTitle + gradientsSVG;
            container.appendChild(wrapper);
        }
    });

    const dataCategories = { kanji: 'purple', vocab: 'green' };

    for (const [categoryName, color] of Object.entries(dataCategories)) {
        if (!state.appData[categoryName]) continue;

        for (const key in state.appData[categoryName]) {
            const category = state.appData[categoryName][key];
            if (!category.items) continue;

            const total = category.items.length;
            const learned = state.progress[categoryName]?.filter(id => category.items.some(item => item.id === id)).length || 0;

            // Find existing items in both progress containers
            const existingItems = document.querySelectorAll(`[data-section-key="${key}"]`);

            if (existingItems.length > 0) {
                // If they exist, update them
                const percentage = total > 0 ? (learned / total) * 100 : 0;
                const radius = 22;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference - (percentage / 100) * circumference;

                existingItems.forEach(item => {
                    item.querySelector('.progress-fill').style.strokeDashoffset = offset;
                    item.querySelector('.progress-percentage').textContent = `${Math.round(percentage)}%`;
                    item.querySelector('.progress-stats').textContent = `${learned} / ${total}`;
                });
            } else {
                // If they don't exist, create and append them (for initial render)
                const newItemFragment = createProgressItem(categoryName, category[state.currentLang] || category.en, learned, total, color, key);
                document.querySelectorAll('[id^="progress-wrapper-"]').forEach(wrapper => {
                    wrapper.appendChild(newItemFragment.cloneNode(true));
                });
            }
        }
    }
}

export function moveLangPill(switcherContainer) {
    const pill = switcherContainer.querySelector('.lang-switch-pill');
    const activeButton = switcherContainer.querySelector('button.active');
    if (!activeButton || !pill) return;
    pill.style.width = `${activeButton.offsetWidth}px`;
    pill.style.transform = `translateX(${activeButton.offsetLeft}px)`;
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
    svg.style.fill = isPinned ? 'var(--pin-pinned-icon)' : 'var(--pin-unpinned)';

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
    els.sidebar?.classList.remove('open');
    els.overlay?.classList.remove('active');
    document.body.classList.remove('sidebar-open');
}

function renderCardBasedSection(containerId, data, category, gradient) {
    const container = document.getElementById(containerId);
    if (!data || !container) {
        if (container) container.innerHTML = '';
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const key in data) {
        const section = data[key];
        if (!section.items) continue;

        const title = section[state.currentLang] || section.en;
        fragment.appendChild(createCardSection(title, section.items, category, gradient, key));
    }

    container.innerHTML = ''; // Clear previous content
    const wrapper = document.createElement('div');
    wrapper.className = 'space-y-4';
    wrapper.appendChild(fragment);
    container.appendChild(wrapper);

    setupFuseForTab(category);
}

export function renderContent() {
    const renderSafely = (renderFn) => {
        try { renderFn(); } catch (e) { console.error("Render error:", e); }
    };

    const prepareGojuonData = (originalData) => {
        if (!originalData) return {};
        const data = JSON.parse(JSON.stringify(originalData));
        const gojuonSectionKey = Object.keys(data).find(key => data[key]?.items?.some(item => item.romaji === 'a'));
        if (gojuonSectionKey) {
            const originalItems = data[gojuonSectionKey].items;
            const findChar = (romaji) => originalItems.find(i => i.romaji === romaji) || { isPlaceholder: true };
            const gridItems = [
                'a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so',
                'ta', 'chi', 'tsu', 'te', 'to', 'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho',
                'ma', 'mi', 'mu', 'me', 'mo', 'ya', null, 'yu', null, 'yo', 'ra', 'ri', 'ru', 're', 'ro',
                'wa', null, null, null, 'wo', 'n', null, null, null, null
            ].map(r => r ? findChar(r) : { isPlaceholder: true });
            data[gojuonSectionKey].items = gridItems;
        }
        return data;
    };

    renderSafely(() => {
        if (els.hiraganaTab) {
            els.hiraganaTab.innerHTML = '';
            els.hiraganaTab.appendChild(createStaticSection(prepareGojuonData(state.appData.hiragana), '🌸', 'var(--accent-pink)'));
            setupFuseForTab('hiragana');
        }
    });

    renderSafely(() => {
        if (els.katakanaTab) {
            els.katakanaTab.innerHTML = '';
            els.katakanaTab.appendChild(createStaticSection(prepareGojuonData(state.appData.katakana), '🤖', 'var(--accent-blue)'));
            setupFuseForTab('katakana');
        }
    });

    renderSafely(() => {
        if (!state.appData.keyPoints || !els.keyPointsTab) return;
        const fragment = document.createDocumentFragment();
        for (const key in state.appData.keyPoints) {
            const section = state.appData.keyPoints[key];
            const title = section[state.currentLang] || section.en;
            let contentNode;
            if (section.type === 'table') {
                contentNode = createStyledList(section.content);
            } else if (section.type === 'table-grid') {
                contentNode = document.createElement('div');
                contentNode.className = 'space-y-6';
                section.content.forEach(sub => {
                    const subTitle = sub.title[state.currentLang] || sub.title.en;
                    const subList = createStyledList(sub.data);
                    contentNode.innerHTML += `<div><h4 class="font-semibold text-md mb-3 text-primary">${subTitle}</h4></div>`;
                    contentNode.lastChild.appendChild(subList);
                });
            }
            if (contentNode) {
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'p-4 sm:p-5 sm:pt-0';
                contentWrapper.appendChild(contentNode);
                const searchTerms = generateSearchTerms([title, JSON.stringify(section.content)]);
                fragment.appendChild(createAccordion(title, contentWrapper, searchTerms, key));
            }
        }
        els.keyPointsTab.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-4';
        wrapper.appendChild(fragment);
        els.keyPointsTab.appendChild(wrapper);
        setupFuseForTab('key_points');
    });

    renderSafely(() => {
        const grammarTab = els.grammarTab;
        if (!state.appData.grammar || !grammarTab) {
            if (grammarTab) grammarTab.innerHTML = '';
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const sectionKey in state.appData.grammar) {
            const sectionData = state.appData.grammar[sectionKey];
            const sectionTitle = sectionData[state.currentLang] || sectionData.en;

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
                card.innerHTML = `
                    <h4 class="font-semibold text-primary noto-sans">${langItem.title}</h4>
                    <div class="grammar-description mt-2 text-secondary leading-relaxed text-sm">${description}</div>
                    ${exampleHTML ? `<div class="grammar-example mt-3 text-sm">${exampleHTML}</div>` : ''}
                `;
                grid.appendChild(card);
            });

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'p-4 sm:p-5 sm:pt-0';
            contentWrapper.appendChild(grid);
            const searchData = generateSearchTerms([sectionTitle, ...sectionData.items.flatMap(item => [item.en?.title, item.en?.content, item.vi?.title, item.vi?.content])]);
            fragment.appendChild(createAccordion(sectionTitle, contentWrapper, searchData, sectionKey));
        }

        grammarTab.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'space-y-4';
        wrapper.appendChild(fragment);
        grammarTab.appendChild(wrapper);

        setupFuseForTab('grammar');
    });

    renderSafely(() => renderCardBasedSection('kanji', state.appData.kanji, 'kanji', 'linear-gradient(135deg, var(--accent-purple), #A78BFA)'));
    renderSafely(() => renderCardBasedSection('vocab', state.appData.vocab, 'vocab', 'linear-gradient(135deg, var(--accent-green), #4ADE80)'));
}

export function buildLevelSwitcher(remoteLevels = [], customLevels = []) {
    const sidebarSwitcher = document.getElementById('level-switcher-sidebar');
    if (!sidebarSwitcher) return;

    state.allAvailableLevels = Array.from(new Set([...remoteLevels, ...customLevels]));

    const fragment = document.createDocumentFragment();
    state.allAvailableLevels.forEach(level => {
        const isDefault = level === config.defaultLevel;
        const canBeDeleted = customLevels.includes(level) && !isDefault;

        const deleteButtonHTML = canBeDeleted ? `
            <button class="delete-level-btn" data-action="delete-level" data-level-name="${level}" title="Delete level ${level.toUpperCase()}">
                <svg class="w-4 h-4 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" />
                </svg>
            </button>` : '';

        const itemWrapper = document.createElement('div');
        itemWrapper.className = 'level-switch-item-wrapper';
        itemWrapper.innerHTML = `
            <button data-action="set-level" data-level-name="${level}" class="level-switch-button">${level.toUpperCase()}</button>
            ${deleteButtonHTML}
        `;
        fragment.appendChild(itemWrapper);
    });

    sidebarSwitcher.innerHTML = '';
    sidebarSwitcher.appendChild(fragment);
}