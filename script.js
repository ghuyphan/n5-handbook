(() => {
    // I'll keep the app's configuration right at the top for easy access.
    const config = {
        level: 'n5', // Change to 'n4', 'n3' etc. to load different data sets
        dataPath: './data',
    };

    let appData = {};
    let progress = { kanji: [], vocab: [] };
    let currentLang = 'vi';
    let pinnedTab = null;

    let fuseInstances = {};

    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

    const debounce = (func, delay) => {
        let timeout;
        const debounced = (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
        debounced.cancel = () => clearTimeout(timeout);
        return debounced;
    };
    
    const generateSearchTerms = (texts = []) => {
        if (typeof wanakana === 'undefined') {
            return texts.filter(Boolean).join(' ').toLowerCase();
        }
        const termsSet = new Set();
        texts.filter(Boolean).forEach(text => {
            const lowerText = String(text).toLowerCase();
            const parts = lowerText.split(/\s+/).filter(Boolean);
            parts.forEach(part => {
                termsSet.add(part);
                termsSet.add(wanakana.toRomaji(part));
                termsSet.add(wanakana.toHiragana(part));
                termsSet.add(wanakana.toKatakana(part));
            });
        });
        return Array.from(termsSet).join(' ');
    };

    function loadState() {
        progress =
            JSON.parse(
                localStorage.getItem(`jlptN${config.level.toUpperCase()}Progress`)
            ) || { kanji: [], vocab: [] };
        currentLang = localStorage.getItem('n5HandbookLang') || 'en';
        pinnedTab = localStorage.getItem('pinnedMobileTab');
    }

    function saveProgress() {
        localStorage.setItem(
            `jlptN${config.level.toUpperCase()}Progress`,
            JSON.stringify(progress)
        );
        updateProgressDashboard();
    }

    function savePinnedTab(tabId) {
        if (tabId) {
            localStorage.setItem('pinnedMobileTab', tabId);
        } else {
            localStorage.removeItem('pinnedMobileTab');
        }
        updatePinButtonState(tabId);
    }

    function setLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('n5HandbookLang', lang);

        const uiStrings = appData.ui;
        $$('[data-lang-key]').forEach((el) => {
            const key = el.dataset.langKey;
            el.textContent = uiStrings[lang]?.[key] || '';
        });
        $$('[data-lang-placeholder-key]').forEach((el) => {
            const key = el.dataset.langPlaceholderKey;
            el.placeholder = uiStrings[lang]?.[key] || '';
        });
        $$('.lang-switch button').forEach((btn) =>
            btn.classList.toggle('active', btn.dataset.lang === lang)
        );
        $$('.lang-switch').forEach(moveLangPill);
        
        fuseInstances = {};
        renderContent();
        updateProgressDashboard();
    }

    function moveLangPill(switcherContainer) {
        const activeButton = $('button.active', switcherContainer);
        const pill = $('.lang-switch-pill', switcherContainer);
        if (!activeButton || !pill) return;
        pill.style.width = `${activeButton.offsetWidth}px`;
        pill.style.transform = `translateX(${activeButton.offsetLeft}px)`;
    }

    function setupTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
        document.body.classList.toggle('dark-mode', initialTheme === 'dark');
        $$('.theme-switch input').forEach(
            (input) => (input.checked = initialTheme === 'dark')
        );
    }

    function toggleTheme(event) {
        const isChecked = event.target.checked;
        document.body.classList.toggle('dark-mode', isChecked);
        localStorage.setItem('theme', isChecked ? 'dark' : 'light');
        $$('.theme-switch input').forEach((input) => {
            if (input !== event.target) input.checked = isChecked;
        });
    }

    function toggleLearned(category, id, element) {
        const arr = progress[category];
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

    function changeTab(tabName, buttonElement) {
        $$('.tab-content').forEach((c) => c.classList.remove('active'));
        $(`#${tabName}`)?.classList.add('active');
        $$('.nav-item').forEach((b) => b.classList.remove('active'));

        const targetButton =
            buttonElement ||
            $(`.nav-item[onclick*="'${tabName}'"]`);
        if (targetButton) targetButton.classList.add('active');

        const isMobileView = window.innerWidth <= 768;
        if (isMobileView) {
            const titleSpan = $('span', targetButton);
            const titleKey = titleSpan?.dataset.langKey;
            const titleText =
                (titleKey && appData.ui[currentLang]?.[titleKey]) ||
                titleSpan?.textContent ||
                '';
            $('#mobile-header-title').textContent = titleText;
            $('#pin-toggle').style.display = 'block';
            updatePinButtonState(tabName);
        } else {
            $('#pin-toggle').style.display = 'none';
        }

        $('#search-input').value = '';
        $('#mobile-search-input').value = '';
        handleSearch.cancel();
        handleSearch();
        closeSidebar();
    }

    function updatePinButtonState(activeTabId) {
        const pinButton = document.getElementById('pin-toggle');
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

        if (activeTabId === pinnedTab) {
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
    
    function togglePin() {
        const activeTab = $('.tab-content.active');
        if (!activeTab) return;

        const tabId = activeTab.id;
        pinnedTab = (pinnedTab === tabId) ? null : tabId;
        savePinnedTab(pinnedTab);
        updatePinButtonState(tabId);
    }

    function closeSidebar() {
        $('#sidebar')?.classList.remove('open');
        $('#overlay')?.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }

    function jumpToSection(tabName, sectionTitleKey) {
        $('#search-input').value = '';
        $('#mobile-search-input').value = '';
        handleSearch.cancel();
        handleSearch();

        changeTab(tabName);
        setTimeout(() => {
            const sectionHeader = $(`[data-section-title-key="${sectionTitleKey}"]`);
            if (sectionHeader) {
                if (
                    sectionHeader.tagName === 'BUTTON' &&
                    !sectionHeader.classList.contains('open')
                ) {
                    sectionHeader.click();
                }
                sectionHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }
    
    function setupFuseForTab(tabId) {
        if (fuseInstances[tabId] || typeof Fuse === 'undefined') return;

        const container = $(`#${tabId}`);
        if (!container) return;

        const searchableElements = $$('[data-search-item], [data-search]', container);
        const collection = searchableElements.map((el, index) => ({
            id: el.dataset.itemId || `${tabId}-${index}`,
            element: el,
            searchData: el.dataset.searchItem || el.dataset.search
        }));
        
        if (collection.length > 0) {
            fuseInstances[tabId] = new Fuse(collection, {
                keys: ['searchData'],
                includeScore: true,
                threshold: 0.4,
                ignoreLocation: true,
            });
        }
    }

    const handleSearch = debounce(() => {
        const isMobileView = window.innerWidth <= 768;
        const query = (isMobileView ? $('#mobile-search-input').value : $('#search-input').value).trim();

        const activeTab = $('.tab-content.active');
        if (!activeTab) return;
        const activeTabId = activeTab.id;

        // FIXED: Only manage the mobile search bar's visibility on mobile views.
        if (isMobileView) {
            const mobileSearch = $('.mobile-search-bar');
            if (mobileSearch) {
                mobileSearch.style.display = activeTabId === 'progress' ? 'none' : 'block';
            }
        }
        
        const fuse = fuseInstances[activeTabId];
        const allWrappers = $$('.search-wrapper', activeTab);
        const allItems = $$('[data-search-item]', activeTab);
        
        if (!query) {
            // OPTIMIZED: Removed redundant DOM query. 'allWrappers' already includes accordions.
            allItems.forEach(item => { item.style.display = ''; });
            allWrappers.forEach(wrapper => { wrapper.style.display = ''; });
            return;
        }

        if (!fuse) return;
        
        allItems.forEach(item => { item.style.display = 'none'; });
        allWrappers.forEach(wrapper => { wrapper.style.display = 'none'; });
        
        const queryLower = query.toLowerCase();
        let queryVariants = [queryLower];
        if (typeof wanakana !== 'undefined') {
            queryVariants = Array.from(new Set([
                queryLower,
                wanakana.toRomaji(queryLower),
                wanakana.toHiragana(queryLower),
                wanakana.toKatakana(queryLower)
            ]));
        }

        const searchPattern = queryVariants.map(variant => ({ searchData: variant }));
        const results = fuse.search({ $or: searchPattern });

        results.forEach(result => {
            const itemElement = result.item.element;
            itemElement.style.display = '';
            const wrapper = itemElement.closest('.search-wrapper');
            if (wrapper) {
                wrapper.style.display = '';
            }
        });
    }, 300);

    function createAccordion(title, contentHTML, searchData, titleKey) {
        return `<div class="search-wrapper accordion-wrapper" data-search="${searchData}">
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
        let content = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">`;
        content += items.map(item => {
            const title = item.Kanji || item.Reading || Object.values(item)[0];
            let subtitle = '';
            if (item.Reading && title !== item.Reading) subtitle = item.Reading;
            let translation = '';
            if (currentLang === 'vi' && item.vi) {
                translation = `<span style="color: var(--accent-yellow)">${item.vi}</span>`;
            } else if (currentLang === 'en' && (item.Number || item.en)) {
                translation = `<span style="color: var(--accent-yellow)">${item.Number || item.en}</span>`;
            }
            const searchData = generateSearchTerms(Object.values(item));
            return `<div class="cell-bg rounded-lg p-3 flex flex-col justify-center text-center h-24" data-search-item="${searchData}">
                    <div class="font-bold text-primary text-base sm:text-lg noto-sans">${title}</div>
                    ${subtitle ? `<div class="text-secondary text-xs sm:text-sm leading-relaxed mt-1">${subtitle}</div>` : ''}
                    <div class="text-secondary text-xs sm:text-sm leading-relaxed mt-1">${translation}</div>
                </div>`;
        }).join('');
        content += '</div>';
        return content;
    }

    const createCard = (item, category, backGradient) => {
        const isLearned = progress[category]?.includes(item.id);
        const meaningText = item.meaning?.[currentLang] || item.meaning?.en || '';
        const frontContent = category === 'kanji'
                ? `<p class="text-4xl sm:text-6xl font-bold noto-sans">${item.kanji}</p>`
                : `<div class="text-center p-2"><p class="text-xl sm:text-2xl font-semibold noto-sans">${item.word}</p></div>`;
        const backContent = `<p class="text-lg sm:text-xl font-bold">${category === 'kanji' ? meaningText : item.reading
            }</p><p class="text-sm">${category === 'kanji'
                ? `On: ${item.onyomi}<br>Kun: ${item.kunyomi || '–'}`
                : meaningText
            }</p>`;
        const searchTerms = generateSearchTerms([
            item.kanji, item.word, item.onyomi, item.kunyomi,
            item.reading, item.meaning?.en, item.meaning?.vi,
        ]);
        
        return `<div class="relative h-32 sm:h-40" data-search-item="${searchTerms}" data-item-id="${item.id}">
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
        const cardGrid = `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">${data
            .map((k) => createCard(k, category, backGradient))
            .join('')}</div>`;
        const searchTermsForSection = generateSearchTerms(
             [title, ...data.flatMap(item => [item.kanji, item.word, item.meaning?.en, item.meaning?.vi])]
        );
        const accordionContent = `<div class="p-4 sm:p-5 sm:pt-0">${cardGrid}</div>`;
        return createAccordion(title, accordionContent, searchTermsForSection, titleKey);
    };

    const createStaticSection = (data, icon, color) =>
        Object.entries(data).map(([sectionKey, sectionData]) => {
            const items = sectionData.items;
            const title = sectionData[currentLang] || sectionData['en'] || sectionKey;
            if (!Array.isArray(items)) return '';
            const searchTerms = generateSearchTerms([title, ...items.flatMap(i => i.isPlaceholder ? [] : [i.kana, i.romaji])]);

            const content = `<div class="kana-grid">
              ${items.map((item) => {
                    if (item.isPlaceholder) return `<div></div>`;
                    const isDigraph = item.kana && item.kana.length > 1;
                    const fontClass = isDigraph ? 'kana-font-digraph' : 'kana-font';
                    const itemSearchData = generateSearchTerms([item.kana, item.romaji]);
                    return `<div class="flex flex-col items-center justify-center p-2 rounded-xl h-20 sm:h-24 text-center cell-bg" data-search-item="${itemSearchData}">
                          <p class="noto-sans ${fontClass}" style="color:${color};">${item.kana}</p>
                          <p class="text-xs sm:text-sm text-secondary">${item.romaji}</p>
                        </div>`;
                }).join('')}
            </div>`;

            return `<div class="search-wrapper glass-effect rounded-2xl p-4 sm:p-5 mb-6" data-search="${searchTerms}">
              <h3 class="text-lg sm:text-lg font-bold mb-4 flex items-center gap-2 text-primary" data-section-title-key="${sectionKey}">
                <span class="text-2xl">${icon}</span> ${title}
              </h3>
              ${content}
            </div>`;
        }).join('');

    function updateProgressDashboard() {
        const overviewContainer = $('#progress-overview');
        const progressTabContainer = $('#progress');
        if (!overviewContainer || !appData.ui) return;

        let progressHTML = `<h2 class="text-xl font-bold mb-5" data-lang-key="progressOverview">${appData.ui[currentLang]?.progressOverview || 'Progress Overview'}</h2><div class="space-y-4">`;
        const dataCategories = { kanji: 'purple', vocab: 'green' };

        for (const [categoryName, color] of Object.entries(dataCategories)) {
            for (const key in appData[categoryName]) {
                const category = appData[categoryName][key];
                const total = category.items.length;
                const learned = category.items.filter((item) =>
                    progress[categoryName]?.includes(item.id)
                ).length;
                progressHTML += createProgressItem(
                    categoryName,
                    category[currentLang] || category.en,
                    learned,
                    total,
                    color,
                    key
                );
            }
        }

        progressHTML += `</div><svg width="0" height="0"><defs>
      <linearGradient id="purple-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#A78BFA" /><stop offset="100%" stop-color="#8B5CF6" /></linearGradient>
      <linearGradient id="green-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#4ADE80" /><stop offset="100%" stop-color="#22C55E" /></linearGradient>
    </defs></svg>`;
        if (overviewContainer) overviewContainer.innerHTML = progressHTML;
        if (progressTabContainer) progressTabContainer.innerHTML = progressHTML;
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
    
    // OPTIMIZED: Reusable function to render Kanji and Vocab sections
    function renderCardBasedSection(containerId, data, category, gradient, color) {
        let html = '';
        for (const key in data) {
            const section = data[key];
            const title = section[currentLang] || section['en'];
            html += createCardSection(title, section.items, category, gradient, key);
        }
        $(containerId).innerHTML = `<div class="space-y-4">${html}</div>`;
        setupFuseForTab(category);
    }

    function renderContent() {
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
                    'a', 'i', 'u', 'e', 'o',
                    'ka', 'ki', 'ku', 'ke', 'ko',
                    'sa', 'shi', 'su', 'se', 'so',
                    'ta', 'chi', 'tsu', 'te', 'to',
                    'na', 'ni', 'nu', 'ne', 'no',
                    'ha', 'hi', 'fu', 'he', 'ho',
                    'ma', 'mi', 'mu', 'me', 'mo',
                    'ya', null, 'yu', null, 'yo',
                    'ra', 'ri', 'ru', 're', 'ro',
                    'wa', null, null, null, 'wo',
                    'n', null, null, null, null
                ].map(r => r ? getChar(r) : placeholder);
                data[gojuonSectionKey].items = gridItems.filter(item => item);
            }
            return data;
        };

        const hiraganaGridData = prepareGojuonData(appData.hiragana);
        $('#hiragana').innerHTML = createStaticSection(hiraganaGridData, '🌸', 'var(--accent-pink)');
        setupFuseForTab('hiragana');

        const katakanaGridData = prepareGojuonData(appData.katakana);
        $('#katakana').innerHTML = createStaticSection(katakanaGridData, '🤖', 'var(--accent-blue)');
        setupFuseForTab('katakana');

        let timeNumbersHTML = '';
        for (const key in appData.timeNumbers) {
            const section = appData.timeNumbers[key];
            const title = section[currentLang] || section['en'];
            let contentHtml = '';
            if (section.type === 'table') {
                contentHtml = createStyledList(section.content);
            } else if (section.type === 'table-grid') {
                contentHtml = `<div class="space-y-6">${section.content.map((sub) => `
                <div>
                  <h4 class="font-semibold text-md mb-3 text-primary">${sub.title[currentLang] || sub.title.en}</h4>
                  ${createStyledList(sub.data)}
                </div>`).join('')}</div>`;
            }
            const searchTerms = generateSearchTerms([title, JSON.stringify(section.content)]);
            timeNumbersHTML += createAccordion(title, `<div class="p-4 sm:p-5 sm:pt-0">${contentHtml}</div>`, searchTerms, key);
        }
        $('#time_numbers').innerHTML = `<div class="space-y-4">${timeNumbersHTML}</div>`;
        setupFuseForTab('time_numbers');

        let grammarHTML = '';
        for (const sectionKey in appData.grammar) {
            const sectionData = appData.grammar[sectionKey];
            const sectionTitle = sectionData[currentLang] || sectionData['en'];
            const innerContentHTML = `<div class="grammar-grid">
                ${sectionData.items.map(item => {
                const langItem = item[currentLang] || item['en'];
                const itemSearchData = generateSearchTerms([langItem.title, langItem.content]);
                return `<div class="grammar-card cell-bg rounded-lg p-4" data-search-item="${itemSearchData}">
                            <h4 class="font-semibold text-primary noto-sans">${langItem.title}</h4>
                            <div class="mt-2 text-secondary leading-relaxed text-sm">${langItem.content}</div>
                        </div>`;
            }).join('')}
            </div>`;
            const searchData = generateSearchTerms([sectionTitle, ...sectionData.items.flatMap(item => [item.en?.title, item.en?.content, item.vi?.title, item.vi?.content])]);
            grammarHTML += createAccordion(sectionTitle, `<div class="p-4 sm:p-5 sm:pt-0">${innerContentHTML}</div>`, searchData, sectionKey);
        }
        $('#grammar-container').innerHTML = `<div class="space-y-4">${grammarHTML}</div>`;
        setupFuseForTab('grammar');

        // OPTIMIZED: Use the new reusable function for Kanji and Vocab
        renderCardBasedSection('#kanji', appData.kanji, 'kanji', 'linear-gradient(135deg, var(--accent-purple), #A78BFA)');
        renderCardBasedSection('#vocab', appData.vocab, 'vocab', 'linear-gradient(135deg, var(--accent-green), #4ADE80)');
    }

    const getThemeToggleHTML = () => `<label class="theme-switch"><input type="checkbox"><span class="slider"></span></label>`;
    const getLangSwitcherHTML = () => `<div class="lang-switch-pill"></div><button data-lang="en">EN</button><button data-lang="vi">VI</button>`;

    function setupEventListeners() {
        document.body.addEventListener('click', (e) => {
            if(e.target.closest('[data-action="jump-to-section"]')) {
                const el = e.target.closest('[data-action="jump-to-section"]');
                jumpToSection(el.dataset.tabName, el.dataset.sectionKey);
            }
        });
        
        $('#menu-toggle').addEventListener('click', () => {
            $('#sidebar').classList.add('open');
            $('#overlay').classList.add('active');
            document.body.classList.add('sidebar-open');
        });

        $('#overlay').addEventListener('click', closeSidebar);
        $('#header-theme-toggle').innerHTML = getThemeToggleHTML();
        $('#lang-switcher-desktop').innerHTML = getLangSwitcherHTML();
        $('#pin-toggle').addEventListener('click', togglePin);

        $('#sidebar-controls').innerHTML = `
            <div class="theme-switch-wrapper py-2"><span class="font-semibold text-sm text-secondary" data-lang-key="theme"></span>${getThemeToggleHTML()}</div>
            <div class="theme-switch-wrapper py-2"><span class="font-semibold text-sm text-secondary" data-lang-key="language"></span><div class="lang-switch">${getLangSwitcherHTML()}</div></div>
        `;

        $$('.theme-switch input').forEach((el) => el.addEventListener('change', toggleTheme));
        $$('.lang-switch button').forEach((el) => el.addEventListener('click', (e) => {
            e.preventDefault();
            setLanguage(el.dataset.lang);
        }));

        $('#search-input').addEventListener('input', handleSearch);
        $('#mobile-search-input').addEventListener('input', handleSearch);

        const debouncedResize = debounce(() => {
            $$('.lang-switch').forEach(moveLangPill);
            const isMobileView = window.innerWidth <= 768;
            $('#pin-toggle').style.display = isMobileView ? 'block' : 'none';
            if (isMobileView) {
                const activeTab = $('.tab-content.active');
                if (activeTab) updatePinButtonState(activeTab.id);
            }
        }, 100);
        window.addEventListener('resize', debouncedResize);
    }

    async function loadAllData(level) {
        try {
            const files = ['ui', 'hiragana', 'katakana', 'kanji', 'vocab', 'grammar', 'timeNumbers'];
            const fetchPromises = files.map((file) =>
                fetch(`${config.dataPath}/${level}/${file}.json`).then((response) => {
                    if (!response.ok) throw new Error(`Failed to load ${file}.json`);
                    return response.json();
                })
            );
            const data = await Promise.all(fetchPromises);
            appData = Object.fromEntries(files.map((file, i) => [file, data[i]]));
        } catch (error) {
            console.error('Error loading application data:', error);
            document.body.innerHTML = `<div style="text-align: center; padding: 40px; font-family: sans-serif;">
                <h2>Error Loading Data</h2>
                <p>Could not load learning data for <b>JLPT ${config.level.toUpperCase()}</b>.</p>
                <p>Please ensure the data files exist in <code>${config.dataPath}/${config.level}/</code></p>
            </div>`;
            throw error;
        }
    }

    async function init() {
        try {
            await loadAllData(config.level);
            loadState();
            setupEventListeners();
            setupTheme();
            setLanguage(currentLang);

            setTimeout(() => {
                const isMobileView = window.innerWidth <= 768;
                let initialTab = 'hiragana'; // Default for desktop
                if (isMobileView) {
                    initialTab = pinnedTab || 'progress'; // Pinned tab or default for mobile
                }
                changeTab(initialTab);
                $$('.lang-switch').forEach(moveLangPill);
            }, 50);
        } catch (error) {
            console.error('Initialization failed.', error);
        }
    }

    window.toggleLearned = toggleLearned;
    window.jumpToSection = jumpToSection;
    window.changeTab = changeTab;

    window.onload = init;
})();