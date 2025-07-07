/**
 * @module ui
 * @description Handles all HTML rendering and UI updates.
 */

import { els } from './dom.js';
import { state, config } from './config.js';
import { generateSearchTerms } from './utils.js';
import { saveSetting, saveProgress, dbPromise } from './database.js';
import { jumpToSection, setLevel } from './handlers.js';
import { setupFuseForTab } from './handlers.js';

// --- HTML Component Creators ---

function createAccordion(title, contentHTML, searchData, titleKey) {
    return `
        <div class="search-wrapper accordion-wrapper" data-search="${searchData}">
          <div class="glass-effect rounded-2xl overflow-hidden mb-4">
            <button class="accordion-button w-full text-left font-semibold text-lg hover:bg-white/10 flex justify-between items-center transition-colors text-primary" onclick="this.classList.toggle('open')" data-section-title-key="${titleKey}">
              <span>${title}</span>
              <span class="accordion-icon text-xl transform transition-transform duration-300 text-secondary"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></span>
            </button>
            <div class="accordion-content">${contentHTML}</div>
          </div>
        </div>`;
}

function createStyledList(items) {
    const itemsHTML = items.map(item => {
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
        return `
            <div class="cell-bg rounded-lg p-3 flex flex-col justify-center text-center h-24" data-search-item="${searchData}">
                <div class="font-bold text-primary text-base sm:text-lg noto-sans">${title}</div>
                ${subtitle ? `<div class="text-secondary text-xs sm:text-sm leading-relaxed mt-1">${subtitle}</div>` : ''}
                <div class="text-secondary text-xs sm:text-sm leading-relaxed mt-1">${translation}</div>
            </div>`;
    }).join('');

    return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${itemsHTML}</div>`;
}

const createCard = (item, category, backGradient) => {
    const isLearned = state.progress[category]?.includes(item.id);
    const meaningText = item.meaning?.[state.currentLang] || item.meaning?.en || '';
    const frontContent = category === 'kanji'
        ? `<p class="text-4xl sm:text-6xl font-bold noto-sans">${item.kanji}</p>`
        : `<div class="text-center p-2"><p class="text-xl sm:text-2xl font-semibold noto-sans">${item.word}</p></div>`;
    const backContent = `
        <p class="text-lg sm:text-xl font-bold">${category === 'kanji' ? meaningText : item.reading}</p>
        <p class="text-sm">${category === 'kanji' ? `On: ${item.onyomi}<br>Kun: ${item.kunyomi || '–'}` : meaningText}</p>`;
    const searchTerms = generateSearchTerms([
        item.kanji, item.word, item.onyomi, item.kunyomi,
        item.reading, item.meaning?.en, item.meaning?.vi,
    ]);

    return `
        <div class="relative h-32 sm:h-40" data-search-item="${searchTerms}" data-item-id="${item.id}">
            <div class="learn-toggle ${isLearned ? 'learned' : ''}" onclick="toggleLearned('${category}', '${item.id}', this)">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <div class="card h-full cursor-pointer" onclick="this.classList.toggle('is-flipped')">
                <div class="card-inner">
                    <div class="card-face card-face-front p-2">${frontContent}</div>
                    <div class="card-face card-face-back" style="background: ${backGradient};">${backContent}</div>
                </div>
            </div>
        </div>`;
};

const createCardSection = (title, data, category, backGradient, titleKey) => {
    if (!data || data.length === 0) return '';
    const cardGrid = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">${data
        .map((k) => createCard(k, category, backGradient))
        .join('')}</div>`;
    const searchTermsForSection = generateSearchTerms(
        [title, ...data.flatMap(item => [item.kanji, item.word, item.meaning?.en, item.meaning?.vi])]
    );
    const accordionContent = `<div class="p-4 sm:p-5 sm:pt-0">${cardGrid}</div>`;
    return createAccordion(title, accordionContent, searchTermsForSection, titleKey);
};

const createStaticSection = (data, icon, color) => {
    if (!data) return '';
    return Object.entries(data).map(([sectionKey, sectionData]) => {
        if (!sectionData.items) return '';
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

        return `
            <div class="search-wrapper glass-effect rounded-2xl p-4 sm:p-5 mb-6" data-search="${searchTerms}">
                <h3 class="text-lg sm:text-lg font-bold mb-4 flex items-center gap-2 text-primary" data-section-title-key="${sectionKey}">
                    <span class="text-2xl">${icon}</span> ${title}
                </h3>
                ${content}
            </div>`;
    }).join('');
}

function createProgressItem(tab, title, learned, total, color, titleKey) {
    const percentage = total > 0 ? (learned / total) * 100 : 0;
    const radius = 22;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;
    const emojiMatch = title.match(/\s(.*?)$/);
    const cleanTitle = emojiMatch ? title.replace(emojiMatch[0], '') : title;
    const emoji = emojiMatch ? emojiMatch[1] : '';

    return `
        <div class="progress-item-wrapper flex items-center gap-3 p-3 rounded-xl cursor-pointer glass-effect" onclick="jumpToSection('${tab}', '${titleKey}')">
            <div class="relative w-12 h-12 flex-shrink-0">
                <svg class="w-full h-full" viewBox="0 0 50 50">
                    <circle stroke-width="4" stroke="var(--progress-track-color)" fill="transparent" r="${radius}" cx="25" cy="25" />
                    <circle class="progress-circle" stroke-width="4" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" stroke="url(#${color}-gradient)" fill="transparent" r="${radius}" cx="25" cy="25" transform="rotate(-90 25 25)" />
                </svg>
                <span class="absolute text-xs font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">${Math.round(percentage)}%</span>
            </div>
            <div>
                <p class="font-semibold text-sm">${cleanTitle} ${emoji}</p>
                <p class="text-xs text-secondary">${learned} / ${total}</p>
            </div>
        </div>`;
}

// --- Main UI Update Functions ---

export function updateLevelUI(level) {
    const levelText = level.toUpperCase();
    if (els.levelBadgeDesktop) els.levelBadgeDesktop.textContent = levelText;
    if (els.levelBadgeMobile) els.levelBadgeMobile.textContent = levelText;
}

export function updateProgressDashboard() {
    const { progressOverview, progressTab } = els;
    if (!progressOverview || !state.appData.ui) return;

    let progressHTML = `<h2 class="text-xl font-bold mb-5" data-lang-key="progressOverview">${state.appData.ui[state.currentLang]?.progressOverview || 'Progress Overview'}</h2><div class="space-y-4">`;
    const dataCategories = { kanji: 'purple', vocab: 'green' };

    for (const [categoryName, color] of Object.entries(dataCategories)) {
        if (!state.appData[categoryName]) continue;
        for (const key in state.appData[categoryName]) {
            const category = state.appData[categoryName][key];
            if (!category.items) continue;
            const total = category.items.length;
            const learned = state.progress[categoryName] ? category.items.filter(item => state.progress[categoryName].includes(item.id)).length : 0;
            progressHTML += createProgressItem(categoryName, category[state.currentLang] || category.en, learned, total, color, key);
        }
    }

    progressHTML += `</div><svg width="0" height="0"><defs>
        <linearGradient id="purple-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#A78BFA" /><stop offset="100%" stop-color="#8B5CF6" /></linearGradient>
        <linearGradient id="green-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4ADE80" /><stop offset="100%" stop-color="#22C55E" /></linearGradient>
    </defs></svg>`;

    if (progressOverview) progressOverview.innerHTML = progressHTML;
    if (progressTab) progressTab.innerHTML = progressHTML;
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
    pinButton.innerHTML = '';

    const pinSVG = `
        <svg height="24" width="24" viewBox="0 0 519.657 1024" xmlns="http://www.w3.org/2000/svg">
          <path d="M196.032 704l64 320 64-320c-20.125 2-41.344 3.188-62.281 3.188C239.22 707.188 217.47 706.312 196.032 704zM450.032 404.688c-16.188-15.625-40.312-44.375-62-84.688v-64c7.562-12.406 12.25-39.438 23.375-51.969 15.25-13.375 24-28.594 24-44.875 0-53.094-61.062-95.156-175.375-95.156-114.25 0-182.469 42.062-182.469 95.094 0 16 8.469 31.062 23.375 44.312 13.438 14.844 22.719 38 31.094 52.594v64c-32.375 62.656-82 96.188-82 96.188h0.656C18.749 437.876 0 464.126 0 492.344 0.063 566.625 101.063 640.062 260.032 640c159 0.062 259.625-73.375 259.625-147.656C519.657 458.875 493.407 428.219 450.032 404.688z"/>
        </svg>
    `;
    const wrapper = document.createElement('span');
    wrapper.innerHTML = pinSVG;
    const svg = wrapper.querySelector('svg');

    if (activeTabId && activeTabId === state.pinnedTab) {
        pinButton.classList.add('pinned');
        svg.style.fill = 'var(--pin-pinned-icon)';
    } else {
        pinButton.classList.remove('pinned');
        svg.style.fill = 'var(--pin-unpinned)';
    }

    svg.style.width = '1.25em';
    svg.style.height = '1.25em';
    pinButton.appendChild(svg);
}


export function updateSidebarPinIcons() {
    document.querySelectorAll('.sidebar-pin-btn').forEach(button => {
        const tabId = button.dataset.tabName;
        const wrapper = button.closest('.nav-item-wrapper');
        const svg = button.querySelector('svg');
        const isPinned = tabId === state.pinnedTab;

        if (wrapper) wrapper.classList.toggle('is-pinned', isPinned);
        button.classList.toggle('is-pinned', isPinned);
        if (svg) svg.style.fill = isPinned ? 'var(--pin-pinned-bg)' : 'var(--text-secondary)';
    });
}

export function closeSidebar() {
    if (els.sidebar) els.sidebar.classList.remove('open');
    if (els.overlay) els.overlay.classList.remove('active');
    document.body.classList.remove('sidebar-open');
}

function renderCardBasedSection(containerId, data, category, gradient) {
    const container = document.getElementById(containerId);
    if (!data || !container) {
        if (container) container.innerHTML = '';
        return;
    }
    let html = '';
    for (const key in data) {
        const section = data[key];
        if (!section.items) continue;
        const title = section[state.currentLang] || section['en'];
        html += createCardSection(title, section.items, category, gradient, key);
    }
    container.innerHTML = `<div class="space-y-4">${html}</div>`;
    setupFuseForTab(category);
}

export function renderContent() {
    const renderSafely = (renderFn) => {
        try { renderFn(); } catch (e) { console.error("Render error:", e); }
    };

    const prepareGojuonData = (originalData) => {
        if (!originalData) return {};
        const data = JSON.parse(JSON.stringify(originalData));
        const placeholder = { isPlaceholder: true };
        const gojuonSectionKey = Object.keys(data).find(key => data[key]?.items?.some(item => item.romaji === 'a'));
        if (gojuonSectionKey) {
            const originalItems = data[gojuonSectionKey].items;
            const findChar = (romaji) => originalItems.find(i => i.romaji === romaji);
            const getChar = (romaji) => findChar(romaji) || placeholder;
            const gridItems = [
                'a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so',
                'ta', 'chi', 'tsu', 'te', 'to', 'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho',
                'ma', 'mi', 'mu', 'me', 'mo', 'ya', null, 'yu', null, 'yo', 'ra', 'ri', 'ru', 're', 'ro',
                'wa', null, null, null, 'wo', 'n', null, null, null, null
            ].map(r => r ? getChar(r) : placeholder);
            data[gojuonSectionKey].items = gridItems.filter(item => item);
        }
        return data;
    };

    renderSafely(() => {
        if (els.hiraganaTab) {
            els.hiraganaTab.innerHTML = createStaticSection(prepareGojuonData(state.appData.hiragana), '🌸', 'var(--accent-pink)');
            setupFuseForTab('hiragana');
        }
    });

    renderSafely(() => {
        if (els.katakanaTab) {
            els.katakanaTab.innerHTML = createStaticSection(prepareGojuonData(state.appData.katakana), '🤖', 'var(--accent-blue)');
            setupFuseForTab('katakana');
        }
    });

    renderSafely(() => {
        if (!state.appData.keyPoints || !els.keyPointsTab) return;
        let keyPointsHTML = '';
        for (const key in state.appData.keyPoints) {
            const section = state.appData.keyPoints[key];
            const title = section[state.currentLang] || section['en'];
            let contentHtml = '';
            if (section.type === 'table') {
                contentHtml = createStyledList(section.content);
            } else if (section.type === 'table-grid') {
                contentHtml = `<div class="space-y-6">${section.content.map((sub) => `
                <div>
                  <h4 class="font-semibold text-md mb-3 text-primary">${sub.title[state.currentLang] || sub.title.en}</h4>
                  ${createStyledList(sub.data)}
                </div>`).join('')}</div>`;
            }
            const searchTerms = generateSearchTerms([title, JSON.stringify(section.content)]);
            keyPointsHTML += createAccordion(title, `<div class="p-4 sm:p-5 sm:pt-0">${contentHtml}</div>`, searchTerms, key);
        }
        els.keyPointsTab.innerHTML = `<div class="space-y-4">${keyPointsHTML}</div>`;
        setupFuseForTab('key_points');
    });

    renderSafely(() => {
        if (!state.appData.grammar || !els.grammarTab) {
            if (els.grammarTab) els.grammarTab.innerHTML = '';
            return;
        }
        let grammarHTML = '';
        for (const sectionKey in state.appData.grammar) {
            const sectionData = state.appData.grammar[sectionKey];
            const sectionTitle = sectionData[state.currentLang] || sectionData['en'];
            const innerContentHTML = `<div class="grammar-grid">${sectionData.items.map(item => {
                const langItem = item[state.currentLang] || item['en'];
                const itemSearchData = generateSearchTerms([langItem.title, langItem.content]);
                const content = langItem.content;
                const exampleMarkerRegex = /(<br>)?<b>(Example|Ví dụ).*?<\/b>/i;
                const match = content.match(exampleMarkerRegex);
                let description = content;
                let exampleHTML = '';
                if (match && typeof match.index === 'number') {
                    description = content.substring(0, match.index);
                    exampleHTML = content.substring(match.index).replace(/^<br>/, '');
                }
                return `
                    <div class="grammar-card cell-bg rounded-lg" data-search-item="${itemSearchData}">
                        <h4 class="font-semibold text-primary noto-sans">${langItem.title}</h4>
                        <div class="grammar-description mt-2 text-secondary leading-relaxed text-sm">${description}</div>
                        ${exampleHTML ? `<div class="grammar-example mt-3 text-sm">${exampleHTML}</div>` : ''}
                    </div>`;
            }).join('')}</div>`;
            const searchData = generateSearchTerms([sectionTitle, ...sectionData.items.flatMap(item => [item.en?.title, item.en?.content, item.vi?.title, item.vi?.content])]);
            grammarHTML += createAccordion(sectionTitle, `<div class="p-4 sm:p-5 sm:pt-0">${innerContentHTML}</div>`, searchData, sectionKey);
        }
        
        if (els.grammarTab) {
            els.grammarTab.innerHTML = `<div class="space-y-4">${grammarHTML}</div>`;
        }
        setupFuseForTab('grammar');
    });

    renderSafely(() => renderCardBasedSection('kanji', state.appData.kanji, 'kanji', 'linear-gradient(135deg, var(--accent-purple), #A78BFA)'));
    renderSafely(() => renderCardBasedSection('vocab', state.appData.vocab, 'vocab', 'linear-gradient(135deg, var(--accent-green), #4ADE80)'));
}

export function buildLevelSwitcher(remoteLevels = [], customLevels = []) {
    const sidebarSwitcher = document.getElementById('level-switcher-sidebar');
    if (!sidebarSwitcher) return;

    const allLevels = Array.from(new Set([...remoteLevels, ...customLevels]));
    state.allAvailableLevels = allLevels;

    const switcherItemsHTML = allLevels.map(level => {
        const isDefault = level === config.defaultLevel;
        const canBeDeleted = customLevels.includes(level) && !isDefault;

        const deleteButtonHTML = canBeDeleted ? `
            <button class="delete-level-btn" onclick="window.deleteLevel('${level}')" title="Delete level ${level.toUpperCase()}">
                <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" />
                </svg>
            </button>` : '';

        return `
            <div class="level-switch-item-wrapper">
                <button data-level="${level}" class="level-switch-button">${level.toUpperCase()}</button>
                ${deleteButtonHTML}
            </div>`;
    }).join('');

    sidebarSwitcher.innerHTML = switcherItemsHTML;

    sidebarSwitcher.querySelectorAll('.level-switch-button').forEach((el) => el.addEventListener('click', (e) => {
        e.preventDefault();
        setLevel(el.dataset.level);
    }));
}