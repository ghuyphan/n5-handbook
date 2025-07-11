/**
 * @module jotoba
 * @description Handles searching via the Jotoba and JDict APIs with fallback mechanisms.
 */
import { els } from './dom.js';
import { state } from './config.js';
import { renderExternalSearchResults, createSearchPlaceholder } from './ui.js';
import { dbPromise } from './database.js';

// Constants for better maintainability
const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
const JDICT_BASE_URL = 'https://jdict.net/api/v1/search';
const JOTOBA_BASE_URL = 'https://jotoba.de/api/search/words';
const REQUEST_TIMEOUT = 10000; // 10 seconds
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Creates a timeout promise that rejects after specified milliseconds
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise} A promise that rejects after timeout
 */
function createTimeout(ms) {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), ms)
    );
}

/**
 * Fetches data with timeout support
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
async function fetchWithTimeout(url, options = {}) {
    return Promise.race([
        fetch(url, options),
        createTimeout(REQUEST_TIMEOUT)
    ]);
}

/**
 * Parses a JDict 'suggest_mean' string from a vi_jp search.
 * @param {string} suggestMean - The string from the JDict API.
 * @returns {Array<{kanji: string, kana: string}>} An array of objects.
 */
function parseSuggestMean(suggestMean) {
    if (!suggestMean) return [];

    const entries = suggestMean.split(';').map(s => s.trim()).filter(Boolean);
    const readingRegex = /「(.*?)」/;

    return entries.map(entry => {
        const match = entry.match(readingRegex);
        if (match) {
            const kana = match[1];
            const kanji = entry.replace(readingRegex, '').trim();
            return { kanji: kanji || kana, kana };
        }
        return { kanji: entry, kana: entry };
    });
}

/**
 * Transforms JDict response data to match the expected format
 * @param {Object} jdictData - Raw JDict API response
 * @param {boolean} isJP - Whether the query is in Japanese
 * @returns {Object} Transformed data
 */
function transformJDictData(jdictData, isJP) {
    if (!jdictData.list || jdictData.list.length === 0) {
        return { words: [], kanji: [] };
    }

    let transformedWords;
    if (isJP) {
        // Handle JP -> VI response (e.g., searching for "車" or "こんにちわ")
        transformedWords = jdictData.list.map(item => {
            const meanings = item.suggest_mean.split(';').map(s => s.trim()).filter(Boolean);
            const kanaMatch = item.word.match(/「(.*?)」/);
            const kanji = item.word.replace(/「(.*?)」/, '').trim();
            const kana = kanaMatch ? kanaMatch[1] : '';

            return {
                reading: { kanji, kana },
                senses: [{ glosses: meanings }]
            };
        });
    } else {
        // Handle VI -> JP response
        transformedWords = jdictData.list.map(item => ({
            reading: { kanji: item.word, kana: '' },
            senses: parseSuggestMean(item.suggest_mean).map(meaning => ({
                glosses: [meaning.kanji],
                reading: meaning.kana
            }))
        }));
    }

    return { words: transformedWords, kanji: [] };
}

/**
 * Attempts to search using JDict API
 * @param {string} query - The search query
 * @param {boolean} isJP - Whether the query is in Japanese
 * @returns {Promise<Object|null>} Search results or null if failed
 */
async function searchJDict(query, isJP) {
    try {
        const dictType = isJP ? 'jp_vi' : 'vi_jp';
        const url = `${JDICT_BASE_URL}?keyword=${encodeURIComponent(query)}&dict=${dictType}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            console.warn(`JDict API returned ${response.status}, will fallback if possible.`);
            return null;
        }
        const data = await response.json();
        return transformJDictData(data, isJP);
    } catch (error) {
        console.warn('JDict search failed:', error.message);
        return null;
    }
}

/**
 * Attempts to search using Jotoba API
 * @param {string} query - The search query
 * @param {boolean} isJP - Whether the query is in Japanese
 * @returns {Promise<Object>} Search results
 */
async function searchJotoba(query, isJP) {
    const response = await fetchWithTimeout(JOTOBA_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            language: isJP ? 'Japanese' : 'English',
            no_english: false
        }),
    });

    if (!response.ok) {
        throw new Error(`Jotoba API Error: ${response.status}`);
    }
    const data = await response.json();
    return {
        words: data.words || [],
        kanji: data.kanji || []
    };
}

/**
 * Checks if cached result is still valid
 * @param {Object} cachedResult - The cached result object
 * @returns {boolean} Whether the cache is still valid
 */
function isCacheValid(cachedResult) {
    if (!cachedResult || !cachedResult.timestamp) return false;
    return Date.now() - cachedResult.timestamp < CACHE_DURATION;
}

/**
 * Retrieves data from cache if valid.
 * @param {IDBDatabase} db - The database instance.
 * @param {string} query - The search query.
 * @returns {Promise<Object|null>} Cached data object { data, lang, timestamp } or null.
 */
async function getCachedResult(db, query) {
    try {
        const cachedResult = await db.get('dictionary_cache', query);
        if (isCacheValid(cachedResult)) {
            return cachedResult;
        }
    } catch (error) {
        console.warn('Cache retrieval failed:', error);
    }
    return null;
}

/**
 * Stores data in cache with timestamp and language context.
 * @param {IDBDatabase} db - The database instance.
 * @param {string} query - The search query.
 * @param {Object} data - The data to cache.
 */
async function cacheResult(db, query, data) {
    try {
        await db.put('dictionary_cache', {
            data,
            lang: state.currentLang, // Store language context
            timestamp: Date.now()
        }, query);
    } catch (error) {
        console.warn('Cache storage failed:', error);
    }
}

/**
 * Main handler for searching external dictionaries.
 * Manages caching, API fallback, and rendering of results.
 * @param {string} query - The search term from the user.
 * @param {boolean} [forceRefresh=false] - If true, bypasses the cache.
 */
export async function handleExternalSearch(query, forceRefresh = false) {
    if (!query) {
        els.externalSearchTab.innerHTML = createSearchPlaceholder('prompt');
        return;
    }

    const db = await dbPromise;

    // 1. Check cache first, unless forcing a refresh
    if (!forceRefresh) {
        const cachedResult = await getCachedResult(db, query);
        // Use cache only if it exists and was saved with the same language
        if (cachedResult && cachedResult.lang === state.currentLang) {
            renderExternalSearchResults(cachedResult.data, query);
            return;
        }
    }

    // 2. Show 'searching' state
    if (!els.externalSearchTab.querySelector('.search-placeholder-wrapper')) {
        els.externalSearchTab.innerHTML = createSearchPlaceholder('searching');
    }

    try {
        const isJP = JAPANESE_REGEX.test(query);
        let resultsToRender = null;

        // 3. Select API based on language
        if (state.currentLang === 'vi') {
            resultsToRender = await searchJDict(query, isJP);
            if (!resultsToRender) {
                console.log('JDict failed or returned no results, falling back to Jotoba.');
                resultsToRender = await searchJotoba(query, isJP);
            }
        } else {
            resultsToRender = await searchJotoba(query, isJP);
        }
        
        // 4. Cache the successful result
        await cacheResult(db, query, resultsToRender);
        
        // 5. Render the results
        renderExternalSearchResults(resultsToRender, query);

    } catch (error) {
        console.error("External Search Error:", error);
        
        // Use localized error messages
        const getUIText = (key, fallback) => state.appData.ui?.[state.currentLang]?.[key] || fallback;
        const errorTitle = getUIText('searchErrorTitle', 'Search Error');
        let errorMessage;
        
        if (error.message.includes('timeout')) {
            errorMessage = getUIText('searchTimeoutError', 'Search timed out. Please try again.');
        } else {
            errorMessage = getUIText('searchFetchError', 'Could not fetch results. Please try again.');
        }
            
        // Render a proper error message placeholder
        const errorIcon = `<svg class="w-16 h-16 text-red-400 opacity-80 mb-4 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>`;
        els.externalSearchTab.innerHTML = `
            <div class="search-placeholder-wrapper">
                 <div class="search-placeholder-box text-center">
                    ${errorIcon}
                    <h3 class="text-xl font-semibold text-primary">${errorTitle}</h3>
                    <p class="text-secondary text-base mt-1 max-w-md mx-auto">${errorMessage}</p>
                </div>
            </div>`;
    }
}