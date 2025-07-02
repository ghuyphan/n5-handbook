// --- JLPT Handbook App (Optimized) ---
(() => {
    // --- CONFIGURATION ---
    const config = {
        level: 'n5', // Change to 'n4', 'n3' etc. to load different data sets
        dataPath: './data', // Base path for data files
    };

    // --- GLOBAL STATE & APP DATA ---
    let appData = {};
    let progress = { kanji: [], vocab: [] };
    let currentLang = 'en';
    let pinnedTab = null; // New state variable for pinned tab

    // --- UTILS ---
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

    // --- STATE ---
    function loadState() {
        progress =
            JSON.parse(
                localStorage.getItem(`jlptN${config.level.toUpperCase()}Progress`)
            ) || progress;
        currentLang = localStorage.getItem('n5HandbookLang') || 'en';
        pinnedTab = localStorage.getItem('pinnedMobileTab'); // Load pinned tab
    }

    function saveProgress() {
        localStorage.setItem(
            `jlptN${config.level.toUpperCase()}Progress`,
            JSON.stringify(progress)
        );
        updateProgressDashboard();
    }

    // New: Save Pinned Tab
    function savePinnedTab(tabId) {
        if (tabId) {
            localStorage.setItem('pinnedMobileTab', tabId);
        } else {
            localStorage.removeItem('pinnedMobileTab');
        }
        updatePinButtonState(tabId);
    }

    // --- LANGUAGE ---
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

    // --- THEME ---
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

    // --- PROGRESS ---
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

    // --- TABS & NAVIGATION ---
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

            // Show pin button and update its state
            $('#pin-toggle').style.display = 'block';
            updatePinButtonState(tabName);
        } else {
            // Hide pin button on desktop
            $('#pin-toggle').style.display = 'none';
        }


        $('#search-input').value = '';
        $('#mobile-search-input').value = '';
        handleSearch.cancel();
        handleSearch();
        closeSidebar();
    }

    // New: Update Pin Button UI
    function updatePinButtonState(activeTabId) {
        const pinButton = $('#pin-toggle');
        if (!pinButton) return;

        const pinIcon = pinButton.querySelector('svg');
        if (activeTabId === pinnedTab) {
            pinIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />`; // Pinned icon
            pinIcon.classList.add('text-blue-500'); // Or any other color for active state
            pinIcon.classList.remove('text-gray-500');
        } else {
            pinIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />`; // Unpinned icon (same for now, could be different)
            pinIcon.classList.remove('text-blue-500');
            pinIcon.classList.add('text-gray-500');
        }
    }

    // New: Toggle Pin
    function togglePin() {
        const activeTab = $('.tab-content.active');
        if (!activeTab) return;

        const tabId = activeTab.id;
        if (pinnedTab === tabId) {
            pinnedTab = null;
            savePinnedTab(null);
        } else {
            pinnedTab = tabId;
            savePinnedTab(tabId);
        }
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

    // --- SEARCH ---
    const handleSearch = debounce(() => {
        const query = (
            window.innerWidth <= 768
                ? $('#mobile-search-input').value
                : $('#search-input').value
        )
            .toLowerCase()
            .trim();
        const activeTab = $('.tab-content.active');
        if (!activeTab) return;

        const mobileSearch = $('.mobile-search-bar');
        if (mobileSearch)
            mobileSearch.style.display = activeTab.id === 'progress' ? 'none' : '';

        $$('.search-wrapper', activeTab).forEach((wrapper) => {
            const items = $$('[data-search-item]', wrapper);
            let wrapperHasVisibleItem = false;

            if (items.length) {
                items.forEach((item) => {
                    const isVisible = item.dataset.searchItem.includes(query);
                    item.style.display = isVisible ? '' : 'none';
                    if (isVisible) wrapperHasVisibleItem = true;
                });
                if (wrapper.classList.contains('accordion-wrapper')) {
                    wrapper.style.display = wrapperHasVisibleItem ? '' : 'none';
                }
            } else {
                wrapperHasVisibleItem = wrapper.dataset.search.includes(query);
                wrapper.style.display = wrapperHasVisibleItem ? '' : 'none';
            }
        });
    }, 250);

    // --- RENDERING ---
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
        return `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      ${items
                .map((item) => {
                    const title = item.Kanji || item.Reading || Object.values(item)[0];
                    const subtitle =
                        item.Reading && title !== item.Reading ? item.Reading : '';
                    let translation = '';
                    if (currentLang === 'vi' && item.vi) {
                        translation = `<span style="color: var(--accent-yellow)">${item.vi}</span>`;
                    } else if (currentLang === 'en' && item.en) {
                        translation = `<span style="color: var(--accent-yellow)">${item.en}</span>`;
                    }
                    return `<div class="cell-bg rounded-lg p-3 flex flex-col justify-center text-center h-24" data-search-item="${Object.values(item).join(' ').toLowerCase()}">
            <div class="font-bold text-primary text-base sm:text-lg noto-sans">${title}</div>
            ${subtitle ? `<div class="text-secondary text-xs sm:text-sm leading-relaxed mt-1">${subtitle}</div>` : ''}
            <div class="text-secondary text-xs sm:text-sm leading-relaxed mt-1">${translation}</div>
          </div>`;
                })
                .join('')}
    </div>`;
    }

    const createCard = (item, category, backGradient) => {
        const isLearned = progress[category]?.includes(item.id);
        const meaningText = item.meaning?.[currentLang] || item.meaning?.en || '';
        const frontContent =
            category === 'kanji'
                ? `<p class="text-4xl sm:text-6xl font-bold noto-sans">${item.kanji}</p>`
                : `<div class="text-center p-2"><p class="text-xl sm:text-2xl font-semibold noto-sans">${item.word}</p></div>`;
        const backContent = `<p class="text-lg sm:text-xl font-bold">${category === 'kanji' ? meaningText : item.reading
            }</p><p class="text-sm">${category === 'kanji'
                ? `On: ${item.onyomi}<br>Kun: ${item.kunyomi || '–'}`
                : meaningText
            }</p>`;
        const enMeaning = item.meaning?.en || '';
        const viMeaning = item.meaning?.vi || '';
        const searchTerms = `${item.kanji || item.word} ${item.onyomi || ''} ${item.kunyomi || ''
            } ${item.reading || ''} ${enMeaning} ${viMeaning}`.toLowerCase();

        return `<div class="relative h-32 sm:h-40" data-search-item="${searchTerms}">
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
        const searchTerms = `${title.toLowerCase()} ${data
            .map(
                (item) =>
                    `${item.kanji || item.word} ${item.meaning?.en || ''
                        } ${item.meaning?.vi || ''}`.toLowerCase()
            )
            .join(' ')}`;
        const accordionContent = `<div class="p-4 sm:p-5 sm:pt-0">${cardGrid}</div>`;
        return createAccordion(title, accordionContent, searchTerms, titleKey);
    };

    const createStaticSection = (data, icon, color) =>
        Object.entries(data)
            .map(([section, items]) => {
                const searchTerms = `${section.toLowerCase()} ${items
                    .map((i) => `${i.kana} ${i.romaji}`)
                    .join(' ')}`;
                const content = `<div class="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3">
          ${items
                        .map(
                            (item) => `
            <div class="flex flex-col items-center justify-center p-2 rounded-xl h-20 sm:h-24 text-center cell-bg">
              <p class="text-3xl sm:text-4xl noto-sans" style="color:${color};">${item.kana}</p>
              <p class="text-xs sm:text-sm text-secondary">${item.romaji}</p>
            </div>`
                        )
                        .join('')}
        </div>`;
                return `<div class="search-wrapper glass-effect rounded-2xl p-4 sm:p-5 mb-6" data-search="${searchTerms}">
          <h3 class="text-lg sm:text-lg font-bold mb-4 flex items-center gap-2 text-primary" data-section-title-key="${section}">
            <span class="text-2xl">${icon}</span> ${section}
          </h3>
          ${content}
        </div>`;
            })
            .join('');

    function updateProgressDashboard() {
        const overviewContainer = $('#progress-overview');
        const progressTabContainer = $('#progress');
        if (!overviewContainer || !appData.ui) return;

        let progressHTML = `<h2 class="text-xl font-bold mb-5" data-lang-key="progressOverview">${appData.ui[currentLang]?.progressOverview || 'Progress Overview'}</h2><div class="space-y-4">`;

        for (const key in appData.kanji) {
            const category = appData.kanji[key];
            const total = category.items.length;
            const learned = category.items.filter((item) =>
                progress.kanji.includes(item.id)
            ).length;
            progressHTML += createProgressItem(
                'kanji',
                category[currentLang] || category.en,
                learned,
                total,
                'purple',
                key
            );
        }

        for (const key in appData.vocab) {
            const category = appData.vocab[key];
            const total = category.items.length;
            const learned = category.items.filter((item) =>
                progress.vocab.includes(item.id)
            ).length;
            progressHTML += createProgressItem(
                'vocab',
                category[currentLang] || category.en,
                learned,
                total,
                'green',
                key
            );
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
      <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-500/10 cursor-pointer glass-effect" onclick="jumpToSection('${tab}', '${titleKey}')">
        <div class="relative w-12 h-12 flex-shrink-0">
          <svg class="w-full h-full" viewBox="0 0 50 50">
            <circle stroke-width="4" stroke="var(--progress-track-color)" fill="transparent" r="${radius}" cx="25" cy="25" />
            <circle class="progress-circle" stroke-width="4" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
              stroke-linecap="round" stroke="url(#${color}-gradient)" fill="transparent" r="${radius}" cx="25" cy="25" transform="rotate(-90 25 25)" />
          </svg>
          <span class="absolute text-xs font-bold top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">${Math.round(
            percentage
        )}%</span>
        </div>
        <div>
          <p class="font-semibold text-sm">${cleanTitle} ${emoji}</p>
          <p class="text-xs text-secondary">${learned} / ${total}</p>
        </div>
      </div>`;
    }

    function renderContent() {
        $('#hiragana').innerHTML = createStaticSection(
            appData.hiragana,
            '🌸',
            'var(--accent-pink)'
        );
        $('#katakana').innerHTML = createStaticSection(
            appData.katakana,
            '🤖',
            'var(--accent-blue)'
        );

        let timeNumbersHTML = '';
        for (const key in appData.timeNumbers) {
            const section = appData.timeNumbers[key];
            const title = section[currentLang] || section['en'];
            let contentHtml = '';
            if (section.type === 'table') {
                contentHtml = createStyledList(section.content);
            } else if (section.type === 'table-grid') {
                contentHtml = `<div class="space-y-6">${section.content
                    .map(
                        (sub) => `
            <div>
              <h4 class="font-semibold text-md mb-3 text-primary">${sub.title[currentLang] || sub.title.en
                            }</h4>
              ${createStyledList(sub.data)}
            </div>`
                    )
                    .join('')}</div>`;
            }
            const searchTerms = `${title.toLowerCase()} ${JSON.stringify(
                section.content
            )
                .replace(/"|{|}|\[|\]/g, ' ')
                .toLowerCase()}`;
            timeNumbersHTML += createAccordion(
                title,
                `<div class="p-4 sm:p-5 sm:pt-0">${contentHtml}</div>`,
                searchTerms,
                key
            );
        }
        $('#time_numbers').innerHTML = `<div class="space-y-4">${timeNumbersHTML}</div>`;

        const grammarContainer = $('#grammar-container');
        grammarContainer.innerHTML = appData.grammar
            .map((item) => {
                const langItem = item[currentLang] || item['en'];
                const searchTerms = `${langItem.title} ${langItem.content.replace(
                    /<[^>]*>?/gm,
                    ''
                )}`.toLowerCase();
                const content = `<div class="leading-relaxed text-secondary">${langItem.content}</div>`;
                return createAccordion(
                    langItem.title,
                    `<div class="p-5 pt-0">${content}</div>`,
                    searchTerms,
                    item.id
                );
            })
            .join('');

        let kanjiHTML = '';
        for (const key in appData.kanji) {
            const section = appData.kanji[key];
            const title = section[currentLang] || section['en'];
            kanjiHTML += createCardSection(
                title,
                section.items,
                'kanji',
                'linear-gradient(135deg, var(--accent-purple), #A78BFA)',
                key
            );
        }
        $('#kanji').innerHTML = `<div class="space-y-4">${kanjiHTML}</div>`;

        let vocabHTML = '';
        for (const key in appData.vocab) {
            const section = appData.vocab[key];
            const title = section[currentLang] || section['en'];
            vocabHTML += createCardSection(
                title,
                section.items,
                'vocab',
                'linear-gradient(135deg, var(--accent-green), #4ADE80)',
                key
            );
        }
        $('#vocab').innerHTML = `<div class="space-y-4">${vocabHTML}</div>`;
    }

    // --- UI COMPONENTS ---
    const getThemeToggleHTML = () =>
        `<label class="theme-switch"><input type="checkbox"><span class="slider"></span></label>`;

    const getLangSwitcherHTML = () =>
        `<div class="lang-switch-pill"></div>
      <button data-lang="en">EN</button>
      <button data-lang="vi">VI</button>`;

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        $('#menu-toggle').addEventListener('click', () => {
            $('#sidebar').classList.add('open');
            $('#overlay').classList.add('active');
            document.body.classList.add('sidebar-open');
        });

        $('#overlay').addEventListener('click', closeSidebar);
        $('#header-theme-toggle').innerHTML = getThemeToggleHTML();
        $('#lang-switcher-desktop').innerHTML = getLangSwitcherHTML();
        $('#pin-toggle').addEventListener('click', togglePin); // New: Pin button listener


        $('#sidebar-controls').innerHTML = `
      <div class="theme-switch-wrapper py-2"><span class="font-semibold text-sm text-secondary" data-lang-key="theme"></span>${getThemeToggleHTML()}</div>
      <div class="theme-switch-wrapper py-2"><span class="font-semibold text-sm text-secondary" data-lang-key="language"></span><div class="lang-switch">${getLangSwitcherHTML()}</div></div>
    `;

        $$('.theme-switch input').forEach((el) =>
            el.addEventListener('change', toggleTheme)
        );
        $$('.lang-switch button').forEach((el) =>
            el.addEventListener('click', (e) => {
                e.preventDefault();
                setLanguage(el.dataset.lang);
            })
        );

        $('#search-input').addEventListener('input', handleSearch);
        $('#mobile-search-input').addEventListener('input', handleSearch);

        const debouncedResize = debounce(() => {
            $$('.lang-switch').forEach(moveLangPill);
            // Re-evaluate pin button visibility on resize
            if (window.innerWidth > 768) {
                $('#pin-toggle').style.display = 'none';
            } else {
                // Only show if a tab is active
                const activeTab = $('.tab-content.active');
                if (activeTab) {
                    $('#pin-toggle').style.display = 'block';
                    updatePinButtonState(activeTab.id);
                }
            }
        }, 100);
        window.addEventListener('resize', debouncedResize);
    }

    // --- DATA LOADING ---
    async function loadAllData(level) {
        try {
            const files = [
                'ui',
                'hiragana',
                'katakana',
                'kanji',
                'vocab',
                'grammar',
                'timeNumbers',
            ];
            const fetchPromises = files.map((file) =>
                fetch(`${config.dataPath}/${level}/${file}.json`).then((response) => {
                    if (!response.ok) throw new Error(`Failed to load ${file}.json`);
                    return response.json();
                })
            );
            const [
                ui,
                hiragana,
                katakana,
                kanji,
                vocab,
                grammar,
                timeNumbers,
            ] = await Promise.all(fetchPromises);
            appData = { ui, hiragana, katakana, kanji, vocab, grammar, timeNumbers };
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

    // --- INIT ---
    async function init() {
        try {
            await loadAllData(config.level);
            loadState();
            setupEventListeners();
            setupTheme();
            setLanguage(currentLang);

            setTimeout(() => {
                let initialTab;
                if (window.innerWidth <= 768 && pinnedTab) {
                    initialTab = pinnedTab; // Load pinned tab on mobile if exists
                } else if (window.innerWidth <= 768) {
                    initialTab = 'progress'; // Default mobile tab
                } else {
                    initialTab = 'hiragana'; // Default desktop tab
                }
                changeTab(initialTab);
                $$('.lang-switch').forEach(moveLangPill);
            }, 50);
        } catch (error) {
            console.error('Initialization failed.', error);
        }
    }

    // --- GLOBALS FOR HTML ONCLICK ---
    window.toggleLearned = toggleLearned;
    window.jumpToSection = jumpToSection;
    window.changeTab = changeTab;

    window.onload = init;
})();