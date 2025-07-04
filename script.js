(() => {
    // --- Database Setup ---
    const dbPromise = (() => {
        if (!'indexedDB' in window) {
            console.error("IndexedDB not supported!");
            return null;
        }
        return idb.openDB('HandbookDB', 1, {
            upgrade(db) {
                db.createObjectStore('levels');
                db.createObjectStore('progress');
                db.createObjectStore('settings');
            },
        });
    })();

    // --- App Configuration & State ---
    const config = {
        defaultLevel: 'n5',
        dataPath: './data',
    };

    let appData = {};
    let progress = { kanji: [], vocab: [] };
    let currentLang = 'en';
    let currentLevel = config.defaultLevel;
    let allAvailableLevels = [config.defaultLevel];
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

    // --- Data Persistence Functions (using IndexedDB) ---

    async function loadState() {
        if (!dbPromise) return;
        const db = await dbPromise;
        currentLang = (await db.get('settings', 'language')) || 'en';
        pinnedTab = (await db.get('settings', 'pinnedMobileTab')) || null;
        currentLevel = (await db.get('settings', 'currentLevel')) || config.defaultLevel;
        progress = (await db.get('progress', currentLevel)) || { kanji: [], vocab: [] };
    }

    async function saveProgress() {
        if (!dbPromise) return;
        const db = await dbPromise;
        await db.put('progress', progress, currentLevel);
        updateProgressDashboard();
    }

    async function saveSetting(key, value) {
        if (!dbPromise) return;
        const db = await dbPromise;
        await db.put('settings', value, key);
    }

    async function savePinnedTab(tabId) {
        await saveSetting('pinnedMobileTab', tabId || null);
        updatePinButtonState(tabId);
    }

    // --- Core Application Logic ---

    function updateLevelUI(level) {
        const levelText = level.toUpperCase();
        const desktopBadge = $('#level-badge-desktop');
        const mobileBadge = $('#level-badge-mobile');

        if (desktopBadge) desktopBadge.textContent = levelText;
        if (mobileBadge) mobileBadge.textContent = levelText;
    }

    async function setLevel(level) {
        if (level === currentLevel) return;
        currentLevel = level;
        updateLevelUI(level);
        await saveSetting('currentLevel', level);

        document.body.style.opacity = '0.5';
        document.body.style.pointerEvents = 'none';

        try {
            await loadAllData(level);
            progress = (await (await dbPromise).get('progress', currentLevel)) || { kanji: [], vocab: [] };

            fuseInstances = {};
            renderContent();
            updateProgressDashboard();
            setLanguage(currentLang, true);

            $$('.level-switch-button').forEach(btn => btn.classList.toggle('active', btn.dataset.level === level));
            changeTab('progress');
        } catch (error) {
            console.error(`Failed to load level ${level}:`, error);
            alert(`Could not load data for level ${level.toUpperCase()}.`);
        } finally {
            document.body.style.opacity = '1';
            document.body.style.pointerEvents = 'auto';
        }
    }

    /**
     * Deletes a custom level from the database and updates the UI.
     * @param {string} level The name of the level to delete.
     */
    async function deleteLevel(level) {
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

            allAvailableLevels = allAvailableLevels.filter(l => l !== level);

            // If the currently active level is the one being deleted, switch to default
            if (currentLevel === level) {
                await setLevel(config.defaultLevel);
            } else {
                // Otherwise, just rebuild the switcher and maintain the current state
                buildLevelSwitcher();
                $$('.level-switch-button').forEach(btn => btn.classList.toggle('active', btn.dataset.level === currentLevel));
            }

            alert(`Level '${level.toUpperCase()}' has been deleted.`);

        } catch (error) {
            console.error("Failed to delete level:", error);
            alert("An error occurred while trying to delete the level.");
        }
    }

    function setLanguage(lang, skipRender = false) {
        currentLang = lang;
        saveSetting('language', lang);

        const uiStrings = appData.ui;
        $$('[data-lang-key]').forEach((el) => {
            const key = el.dataset.langKey;
            if (uiStrings && uiStrings[lang] && uiStrings[lang][key]) {
                el.textContent = uiStrings[lang][key];
            } else if (uiStrings && uiStrings['en'] && uiStrings['en'][key]) {
                el.textContent = uiStrings['en'][key];
            }
        });
        $$('[data-lang-placeholder-key]').forEach((el) => {
            const key = el.dataset.langPlaceholderKey;
            if (uiStrings && uiStrings[lang] && uiStrings[lang][key]) {
                el.placeholder = uiStrings[lang][key];
            } else if (uiStrings && uiStrings['en'] && uiStrings['en'][key]) {
                el.placeholder = uiStrings['en'][key];
            }
        });
        $$('.lang-switch button').forEach((btn) =>
            btn.classList.toggle('active', btn.dataset.lang === lang)
        );
        $$('.lang-switch').forEach(moveLangPill);

        if (!skipRender) {
            fuseInstances = {};
            renderContent();
            updateProgressDashboard();
        }
    }

    function moveLangPill(switcherContainer) {
        const pill = $('.lang-switch-pill', switcherContainer);
        const activeButton = $('button.active', switcherContainer);
        if (!activeButton || !pill) return;
        pill.style.width = `${activeButton.offsetWidth}px`;
        pill.style.transform = `translateX(${activeButton.offsetLeft}px)`;
    }

    async function setupTheme() {
        const savedTheme = (await (await dbPromise)?.get('settings', 'theme'));
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = savedTheme !== undefined ? savedTheme : (prefersDark ? 'dark' : 'light');

        document.body.classList.toggle('dark-mode', initialTheme === 'dark');
        document.body.classList.toggle('light-mode', initialTheme === 'light');

        $$('.theme-switch input').forEach(
            (input) => (input.checked = initialTheme === 'dark')
        );
    }

    function toggleTheme(event) {
        const isChecked = event.target.checked;
        document.body.classList.toggle('dark-mode', isChecked);
        document.body.classList.toggle('light-mode', !isChecked);
        saveSetting('theme', isChecked ? 'dark' : 'light');
        $$('.theme-switch input').forEach((input) => {
            if (input !== event.target) input.checked = isChecked;
        });
    }

    function toggleLearned(category, id, element) {
        if (!progress[category]) progress[category] = [];
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
                (appData.ui && appData.ui[currentLang]?.[titleKey]) ||
                titleSpan?.textContent || '';
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
        const pinButton = $('#pin-toggle');

        if (pinnedTab === tabId) {
            pinButton.classList.add('unpinning');
            pinButton.addEventListener('animationend', () => {
                pinButton.classList.remove('unpinning');
            }, { once: true });
        }

        pinnedTab = (pinnedTab === tabId) ? null : tabId;
        savePinnedTab(pinnedTab);
    }

    function closeSidebar() {
        $('#sidebar')?.classList.remove('open');
        $('#overlay')?.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }

    function jumpToSection(tabName, sectionTitleKey) {
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
        if (fuseInstances[tabId] || typeof Fuse === 'undefined' || !appData[tabId]) return;

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
            const title = sectionData[currentLang] || sectionData['en'] || sectionKey;
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
    }

    function updateProgressDashboard() {
        const overviewContainer = $('#progress-overview');
        const progressTabContainer = $('#progress');
        if (!overviewContainer || !appData.ui) return;

        let progressHTML = `<h2 class="text-xl font-bold mb-5" data-lang-key="progressOverview">${appData.ui[currentLang]?.progressOverview || 'Progress Overview'}</h2><div class="space-y-4">`;
        const dataCategories = { kanji: 'purple', vocab: 'green' };

        for (const [categoryName, color] of Object.entries(dataCategories)) {
            if (!appData[categoryName]) continue;
            for (const key in appData[categoryName]) {
                const category = appData[categoryName][key];
                if (!category.items) continue;
                const total = category.items.length;
                const learned = progress[categoryName] ? category.items.filter((item) =>
                    progress[categoryName].includes(item.id)
                ).length : 0;
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

    function renderCardBasedSection(containerId, data, category, gradient) {
        if (!data) {
            $(containerId).innerHTML = '';
            return;
        }
        let html = '';
        for (const key in data) {
            const section = data[key];
            if (!section.items) continue;
            const title = section[currentLang] || section['en'];
            html += createCardSection(title, section.items, category, gradient, key);
        }
        $(containerId).innerHTML = `<div class="space-y-4">${html}</div>`;
        setupFuseForTab(category);
    }

    function renderContent() {
        const renderSafely = (renderFn) => {
            try { renderFn(); } catch (e) { console.error("Render error:", e); }
        };

        renderSafely(() => {
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
            $('#hiragana').innerHTML = createStaticSection(prepareGojuonData(appData.hiragana), '🌸', 'var(--accent-pink)');
            setupFuseForTab('hiragana');
        });

        renderSafely(() => {
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
            $('#katakana').innerHTML = createStaticSection(prepareGojuonData(appData.katakana), '🤖', 'var(--accent-blue)');
            setupFuseForTab('katakana');
        });

        renderSafely(() => {
            if (!appData.timeNumbers) return;
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
        });

        renderSafely(() => {
            if (!appData.grammar) {
                $('#grammar-container').innerHTML = '';
                return;
            }
            let grammarHTML = '';
            for (const sectionKey in appData.grammar) {
                const sectionData = appData.grammar[sectionKey];
                const sectionTitle = sectionData[currentLang] || sectionData['en'];
                const innerContentHTML = `<div class="grammar-grid">${sectionData.items.map(item => {
                    const langItem = item[currentLang] || item['en'];
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
                    return `<div class="grammar-card cell-bg rounded-lg" data-search-item="${itemSearchData}"><h4 class="font-semibold text-primary noto-sans">${langItem.title}</h4><div class="grammar-description mt-2 text-secondary leading-relaxed text-sm">${description}</div>${exampleHTML ? `<div class="grammar-example mt-3 text-sm">${exampleHTML}</div>` : ''}</div>`;
                }).join('')}</div>`;
                const searchData = generateSearchTerms([sectionTitle, ...sectionData.items.flatMap(item => [item.en?.title, item.en?.content, item.vi?.title, item.vi?.content])]);
                grammarHTML += createAccordion(sectionTitle, `<div class="p-4 sm:p-5 sm:pt-0">${innerContentHTML}</div>`, searchData, sectionKey);
            }
            $('#grammar').innerHTML = `<div class="space-y-4">${grammarHTML}</div>`;
            setupFuseForTab('grammar');
        });

        renderSafely(() => renderCardBasedSection('#kanji', appData.kanji, 'kanji', 'linear-gradient(135deg, var(--accent-purple), #A78BFA)'));
        renderSafely(() => renderCardBasedSection('#vocab', appData.vocab, 'vocab', 'linear-gradient(135deg, var(--accent-green), #4ADE80)'));
    }

    function getThemeToggleHTML() { return `<label class="theme-switch"><input type="checkbox"><span class="slider"></span></label>`; }
    function getLangSwitcherHTML() { return `<div class="lang-switch-pill"></div><button data-lang="en">EN</button><button data-lang="vi">VI</button>`; }

    function buildLevelSwitcher() {
        const sidebarSwitcher = $('#level-switcher-sidebar');
        if (!sidebarSwitcher) return;

        const switcherItemsHTML = allAvailableLevels.map(level => {
            const isDefault = level === config.defaultLevel;
            const deleteButtonHTML = isDefault ? '' : `
                <button class="delete-level-btn" onclick="deleteLevel('${level}')" title="Delete level ${level.toUpperCase()}">
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" />
                    </svg>
                </button>
            `;

            return `
                <div class="level-switch-item-wrapper">
                    <button data-level="${level}" class="level-switch-button">${level.toUpperCase()}</button>
                    ${deleteButtonHTML}
                </div>
            `;
        }).join('');

        sidebarSwitcher.innerHTML = switcherItemsHTML; // The pill div is removed

        // Attach event listeners to the newly created level buttons
        $$('.level-switch-button', sidebarSwitcher).forEach((el) => el.addEventListener('click', (e) => {
            e.preventDefault();
            setLevel(el.dataset.level);
        }));
    }

    // --- Import Modal Logic (Simplified) ---
    function setupImportModal() {
        const modalContainer = $('#import-modal');
        if (!modalContainer) return;

        const modalBackdrop = $('#import-modal-backdrop');
        const modalWrapper = $('.modal-wrapper', modalContainer);
        const openModalBtn = $('#sidebar-import-btn');
        const closeModalBtn = $('#close-modal-btn');

        const levelNameInput = $('#level-name-input');
        const levelNameError = $('#level-name-error');
        const fileImportArea = $('#file-import-area');
        const fileInput = $('#file-input');
        const importBtn = $('#import-btn');

        let importedData = {};
        let levelNameIsValid = false;

        const getUIText = (key, replacements = {}) => {
            let text = appData.ui?.[currentLang]?.[key] || appData.ui?.['en']?.[key] || `[${key}]`;
            for (const [placeholder, value] of Object.entries(replacements)) {
                text = text.replace(`{${placeholder}}`, value);
            }
            return text;
        };

        const updateModalLocale = () => {
            $$('[data-lang-key]', modalContainer).forEach(el => {
                const key = el.dataset.langKey;
                const replacements = (key === 'importButton' && importBtn.disabled) ? { status: '...' } : {};
                el.textContent = getUIText(key, replacements);
            });
            $$('[data-lang-placeholder-key]', modalContainer).forEach(el => {
                el.placeholder = getUIText(el.dataset.langPlaceholderKey);
            });
        };

        const openModal = () => {
            document.body.classList.add('body-no-scroll');
            closeSidebar();
            resetModal();
            updateModalLocale();
            modalContainer.classList.remove('modal-hidden');
            modalBackdrop.classList.add('active');
            modalWrapper.classList.add('active');
        };

        const closeModal = () => {
            document.body.classList.remove('body-no-scroll'); // <-- ADD THIS LINE
            modalBackdrop.classList.remove('active');
            modalWrapper.classList.remove('active');
            setTimeout(() => modalContainer.classList.add('modal-hidden'), 300);
        };

        const updateImportButtonState = () => {
            const levelName = levelNameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
            levelNameIsValid = false;

            if (!levelName) {
                levelNameError.textContent = getUIText('errorLevelNameRequired');
            } else if (allAvailableLevels.includes(levelName)) {
                levelNameError.textContent = getUIText('errorLevelNameExists');
            } else {
                levelNameError.textContent = "";
                levelNameIsValid = true;
            }

            const hasFiles = Object.keys(importedData).length > 0;
            const importButtonText = importBtn.querySelector('span');
            if (importButtonText) {
                importButtonText.textContent = getUIText('importButton');
            }
            importBtn.disabled = !levelNameIsValid || !hasFiles;
        };

        const resetModal = () => {
            levelNameInput.value = '';
            fileInput.value = '';
            levelNameError.textContent = '';
            importedData = {};
            levelNameIsValid = false;

            fileImportArea.classList.remove('state-preview', 'drag-active');
            fileImportArea.innerHTML = `
                <svg class="upload-icon" viewBox="0 0 24 24" stroke-width="1.5" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 15C3 17.8284 3 19.2426 3.87868 20.1213C4.75736 21 6.17157 21 9 21H15C17.8284 21 19.2426 21 20.1213 20.1213C21 19.2426 21 17.8284 21 15" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
                    <path class="arrow" d="M12 16V3M12 3L16 7M12 3L8 7" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <p class="font-semibold text-primary" data-lang-key="dropZoneTitle"></p>
                <p class="text-sm text-secondary" data-lang-key="dropZoneOrClick"></p>
            `;
            // Re-translate the newly added elements
            $$('[data-lang-key]', fileImportArea).forEach(el => el.textContent = getUIText(el.dataset.langKey));
            updateImportButtonState();
        };

        const handleFolderSelect = async (files) => {
            const selectedFiles = files ? Array.from(files) : [];
            importedData = {};
            fileImportArea.classList.add('state-preview');

            if (selectedFiles.length === 0) {
                fileImportArea.innerHTML = `<p class="text-red-400 text-sm">${getUIText('errorNoFolderSelected')}</p>`;
                updateImportButtonState();
                return;
            }

            const supportedFileNames = ['grammar.json', 'hiragana.json', 'kanji.json', 'katakana.json', 'timeNumbers.json', 'vocab.json'];
            const validFiles = selectedFiles.filter(file => supportedFileNames.includes(file.name));

            if (validFiles.length === 0) {
                fileImportArea.innerHTML = `<p class="text-red-400 text-sm">${getUIText('errorNoSupportedFiles')}</p>`;
                updateImportButtonState();
                return;
            }

            const filePromises = validFiles.map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const data = JSON.parse(e.target.result);
                            resolve({ name: file.name.replace('.json', ''), data });
                        } catch (err) {
                            reject(`Error parsing ${file.name}`);
                        }
                    };
                    reader.onerror = () => reject(`Could not read ${file.name}`);
                    reader.readAsText(file);
                });
            });

            try {
                const results = await Promise.all(filePromises);
                results.forEach(result => { importedData[result.name] = result.data; });

                let previewHtml = `<div class="w-full"><p class="text-sm font-medium mb-2 text-primary">${getUIText('filesToBeImported')}</p><div class="space-y-2">`;
                results.forEach(result => {
                    previewHtml += `<div class="preview-item"><p class="font-medium text-primary text-sm">${result.name}.json</p><span class="text-xs font-mono bg-green-500/20 text-green-300 px-2 py-1 rounded-full">✓</span></div>`;
                });
                previewHtml += '</div></div>';
                fileImportArea.innerHTML = previewHtml;

            } catch (err) {
                fileImportArea.innerHTML = `<p class="text-red-400 text-sm">${err}</p>`;
            }
            updateImportButtonState();
        };

        const handleConfirm = async () => {
            const levelName = levelNameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
            if (!dbPromise || !levelNameIsValid || Object.keys(importedData).length === 0) return;

            try {
                importBtn.disabled = true;
                importBtn.querySelector('span').textContent = getUIText('importButtonProgress');

                const db = await dbPromise;
                await db.put('levels', importedData, levelName);

                if (!allAvailableLevels.includes(levelName)) allAvailableLevels.push(levelName);

                buildLevelSwitcher();
                await setLevel(levelName);

                alert(getUIText('importSuccess', { levelName: levelName.toUpperCase() }));
                closeModal();

            } catch (error) {
                console.error("Failed to save imported level:", error);
                alert("Error: Could not save the new level.");
                importBtn.disabled = false; // Re-enable on failure
                importBtn.querySelector('span').textContent = getUIText('importButton');
            }
        };

        openModalBtn?.addEventListener('click', openModal);
        closeModalBtn?.addEventListener('click', closeModal);
        modalWrapper?.addEventListener('click', (event) => {
            if (event.target === modalWrapper) closeModal();
        });

        levelNameInput?.addEventListener('input', updateImportButtonState);
        importBtn?.addEventListener('click', handleConfirm);

        fileImportArea?.addEventListener('click', () => {
            // Only trigger click if it's in the initial state
            if (!fileImportArea.classList.contains('state-preview')) {
                fileInput.click();
            }
        });
        fileInput?.addEventListener('change', (e) => handleFolderSelect(e.target.files));

        fileImportArea?.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileImportArea.classList.add('drag-active');
        });
        fileImportArea?.addEventListener('dragleave', () => fileImportArea.classList.remove('drag-active'));
        fileImportArea?.addEventListener('drop', (e) => {
            e.preventDefault();
            fileImportArea.classList.remove('drag-active');
            handleFolderSelect(e.dataTransfer.files);
        });
    }

    function setupEventListeners() {
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="jump-to-section"]')) {
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
        $('#pin-toggle').addEventListener('click', togglePin);

        const headerLangSwitcher = $('#header-lang-switcher');
        if (headerLangSwitcher) headerLangSwitcher.innerHTML = getLangSwitcherHTML();

        const headerThemeToggle = $('#header-theme-toggle');
        if (headerThemeToggle) headerThemeToggle.innerHTML = getThemeToggleHTML();

        const sidebarControls = $('#sidebar-controls');
        if (sidebarControls) {
            sidebarControls.innerHTML = `
                <div class="sidebar-control-group">
                    <label class="sidebar-control-label" data-lang-key="level">Level</label>
                    <div id="level-switcher-sidebar" class="level-switch"></div>
                </div>
                <div class="sidebar-control-group md:hidden">
                    <label class="sidebar-control-label" data-lang-key="language">Language</label>
                    <div id="sidebar-lang-switcher" class="lang-switch">${getLangSwitcherHTML()}</div>
                </div>
                <div class="sidebar-control-group md:hidden">
                    <label class="sidebar-control-label" data-lang-key="theme">Theme</label>
                    <div class="theme-switch-wrapper">${getThemeToggleHTML()}</div>
                </div>
                <button id="sidebar-import-btn" class="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold p-3 rounded-lg transition-colors import-button">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L6.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span data-lang-key="importLevel">Import New Level</span>
                </button>
            `;
        }

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
        // Always load ui.json from the default level's path to serve as the global source.
        const uiPromise = fetch(`${config.dataPath}/${config.defaultLevel}/ui.json`)
            .then(res => res.json())
            .catch(err => {
                console.error("Fatal: Could not load the global ui.json file.", err);
                return {}; // Return empty object on failure
            });

        // Handle custom levels stored in the database
        if (level !== config.defaultLevel) {
            const db = await dbPromise;
            const savedData = await db.get('levels', level);
            if (savedData) {
                appData = savedData;
                appData.ui = await uiPromise; // Overwrite with the global UI
                return;
            }
        }

        try {
            // For network-loaded levels, load all other files from the specific level's directory
            const files = ['hiragana', 'katakana', 'kanji', 'vocab', 'grammar', 'timeNumbers'];
            const fetchPromises = files.map((file) =>
                fetch(`${config.dataPath}/${level}/${file}.json`).then((response) => {
                    if (!response.ok) throw new Error(`Failed to load ${file}.json for level ${level}`);
                    return response.json();
                })
            );

            // Wait for both the global UI and the specific level data
            const [uiData, ...levelData] = await Promise.all([uiPromise, ...fetchPromises]);

            appData = Object.fromEntries(files.map((file, i) => [file, levelData[i]]));
            appData.ui = uiData; // Add the global UI data to the app state

        } catch (error) {
            console.error('Error loading application data:', error);
            document.body.innerHTML = `<div style="text-align: center; padding: 40px; font-family: sans-serif;">
                <h2>Error Loading Data</h2>
                <p>Could not load learning data for <b>JLPT ${level.toUpperCase()}</b>.</p>
                <p>Please ensure the data files exist in <code>${config.dataPath}/${level}/</code> or have been imported correctly.</p>
            </div>`;
            throw error;
        }
    }

    async function init() {
        if (!dbPromise) {
            document.body.innerHTML = `<h2>IndexedDB is required for this application to function. Please use a modern browser.</h2>`;
            return;
        }

        try {
            const db = await dbPromise;
            const customLevels = await db.getAllKeys('levels');
            allAvailableLevels = [config.defaultLevel, ...customLevels.filter(k => k !== config.defaultLevel)];

            await loadState();
            updateLevelUI(currentLevel);

            setupEventListeners();
            buildLevelSwitcher();
            setupImportModal();

            await loadAllData(currentLevel);

            await setupTheme();

            renderContent();
            updateProgressDashboard();
            setLanguage(currentLang, true);

            setTimeout(() => {
                const activeLevelButton = $(`.level-switch button[data-level="${currentLevel}"]`);
                if (activeLevelButton) activeLevelButton.classList.add('active');
                const activeLangButton = $(`.lang-switch button[data-lang="${currentLang}"]`);
                if (activeLangButton) activeLangButton.classList.add('active');

                $$('.lang-switch').forEach(moveLangPill);

                const isMobileView = window.innerWidth <= 768;
                const defaultTab = isMobileView ? 'progress' : 'hiragana';
                changeTab(pinnedTab || defaultTab);

            }, 50);

        } catch (error) {
            console.error('Initialization failed.', error);
        }
    }

    window.toggleLearned = toggleLearned;
    window.jumpToSection = jumpToSection;
    window.changeTab = changeTab;
    window.deleteLevel = deleteLevel;

    window.onload = init;
})();