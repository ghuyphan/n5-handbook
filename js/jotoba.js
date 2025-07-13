/**
 * @module jotoba
 * @description Handles searching via the Jotoba and JDict APIs with fallback mechanisms.
 */
import { els } from './dom.js';
import { state } from './config.js';
import { renderExternalSearchResults, createSearchPlaceholder } from './ui.js';
import { dbPromise } from './database.js';
import { debounce } from './utils.js'; // <-- CORRECT: IMPORT DEBOUNCE

// --- Constants ---
const JAPANESE_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
const JDICT_BASE_URL = 'https://jdict.net/api/v1/search';
const JOTOBA_BASE_URL = 'https://jotoba.de/api/search/words';
const REQUEST_TIMEOUT = 10000;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_WINDOW = 1000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

// --- State Management ---
let lastRequestTime = 0;
let currentSearchId = 0; // Used to prevent race conditions

// --- Core Fetch Logic ---

/**
 * Creates a timeout promise that rejects after specified milliseconds.
 * @param {number} ms - Timeout in milliseconds.
 * @returns {Promise} A promise that rejects after the timeout.
 */
function createTimeout(ms) {
    return new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), ms)
    );
}

/**
 * Implements exponential backoff delay for retries.
 * @param {number} attempt - The current retry attempt number.
 * @returns {Promise<void>}
 */
function delay(attempt) {
    const backoffDelay = RETRY_DELAY * Math.pow(2, attempt);
    return new Promise(resolve => setTimeout(resolve, backoffDelay));
}

/**
 * Determines if an error is network-related and should trigger a retry.
 * @param {Error} error - The error to check.
 * @returns {boolean}
 */
function shouldRetry(error) {
    const retryableErrors = ['Request timeout', 'Rate limit exceeded', 'Server error', 'Failed to fetch', 'NetworkError'];
    return retryableErrors.some(errorType => error.message.includes(errorType));
}

/**
 * A rate-limited and cancellable fetch function with timeout and retry logic.
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} options - Fetch options.
 * @param {AbortSignal} signal - An AbortSignal to cancel the request.
 * @param {number} retries - Number of retries remaining.
 * @returns {Promise<Response>}
 */
async function fetchWithTimeoutAndRetry(url, options = {}, signal, retries = MAX_RETRIES) {
    const now = Date.now();
    if (now - lastRequestTime < RATE_LIMIT_WINDOW) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_WINDOW - (now - lastRequestTime)));
    }
    lastRequestTime = Date.now();

    if (signal.aborted) {
        throw new DOMException('Request was aborted', 'AbortError');
    }

    try {
        const response = await Promise.race([
            fetch(url, { ...options, signal }),
            createTimeout(REQUEST_TIMEOUT)
        ]);

        if (!response.ok) {
            if (response.status === 429) throw new Error('Rate limit exceeded');
            if (response.status >= 500) throw new Error(`Server error: ${response.status}`);
            throw new Error(`HTTP error: ${response.status}`);
        }

        return response;
    } catch (error) {
        if (error.name === 'AbortError') throw error; // Don't retry aborted requests
        if (retries > 0 && shouldRetry(error)) {
            console.warn(`Request failed, retrying... (${retries} attempts left):`, error.message);
            await delay(MAX_RETRIES - retries);
            return fetchWithTimeoutAndRetry(url, options, signal, retries - 1);
        }
        throw error;
    }
}


// --- API Specific Logic (JDict & Jotoba) ---

function parseSuggestMean(suggestMean) {
    if (!suggestMean || typeof suggestMean !== 'string') return [];
    try {
        const readingRegex = /「(.*?)」/;
        return suggestMean.split(';').map(s => s.trim()).filter(Boolean).map(entry => {
            const match = entry.match(readingRegex);
            if (match) {
                const kana = match[1];
                const kanji = entry.replace(readingRegex, '').trim();
                return { kanji: kanji || kana, kana };
            }
            return { kanji: entry, kana: entry };
        });
    } catch (error) {
        console.warn('Error parsing suggest_mean:', error);
        return [];
    }
}

function transformJDictData(jdictData, isJP) {
    if (!jdictData?.list?.length) return null;

    try {
        const words = isJP
            ? jdictData.list.map(item => {
                const meanings = (item.suggest_mean || '').split(';').map(s => s.trim()).filter(Boolean);
                const kanaMatch = (item.word || '').match(/「(.*?)」/);
                const kanji = (item.word || '').replace(/「(.*?)」/, '').trim();
                return {
                    reading: { kanji: kanji || (kanaMatch ? kanaMatch[1] : ''), kana: kanaMatch ? kanaMatch[1] : '' },
                    senses: [{ glosses: meanings }]
                };
            })
            : jdictData.list.map(item => ({
                reading: { kanji: item.word || '', kana: '' },
                senses: parseSuggestMean(item.suggest_mean).map(meaning => ({
                    glosses: [meaning.kanji],
                    reading: meaning.kana
                }))
            }));
        return { words, kanji: [] };
    } catch (error) {
        console.warn('Error transforming JDict data:', error);
        return null;
    }
}

async function searchJDict(query, isJP, signal) {
    const dictType = isJP ? 'jp_vi' : 'vi_jp';
    const url = `${JDICT_BASE_URL}?keyword=${encodeURIComponent(query.trim())}&dict=${dictType}`;
    const response = await fetchWithTimeoutAndRetry(url, {}, signal);
    const data = await response.json();
    return transformJDictData(data, isJP);
}

async function searchJotoba(query, isJP, signal) {
    const response = await fetchWithTimeoutAndRetry(JOTOBA_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: query.trim(), language: isJP ? 'Japanese' : 'English', no_english: false }),
    }, signal);
    const data = await response.json();

    if (!data || (!data.words?.length && !data.kanji?.length)) {
        throw new Error('No results found');
    }
    return { words: data.words || [], kanji: data.kanji || [] };
}


// --- Caching Logic ---

async function getCachedResult(db, query) {
    try {
        const cachedResult = await db.get('dictionary_cache', query);
        const isCacheStillValid = cachedResult?.timestamp && (Date.now() - cachedResult.timestamp < CACHE_DURATION);
        if (isCacheStillValid) return cachedResult;
        if (cachedResult) await db.delete('dictionary_cache', query);
    } catch (error) {
        console.warn('Cache retrieval failed:', error);
    }
    return null;
}

async function cacheResult(db, query, data) {
    try {
        await db.put('dictionary_cache', { data, lang: state.currentLang, timestamp: Date.now() }, query);
    } catch (error) {
        console.warn('Cache storage failed:', error);
    }
}


// --- UI Rendering ---

function getUIText(key, fallback) {
    return state.appData?.ui?.[state.currentLang]?.[key] || fallback;
}

function renderErrorState(error, query) {
    let errorMessage;
    const errorMessages = {
        'timeout': 'searchTimeout',
        'Rate limit': 'searchRateLimitError',
        'Server error': 'searchServerError',
        'Network': 'searchNetworkError',
        'No results': 'noResults'
    };
    const errorKey = Object.keys(errorMessages).find(key => error.message.includes(key)) || 'default';

    if (errorKey === 'noResults') {
        errorMessage = getUIText('noResults', 'No results found for') + ` "${query}". ` + getUIText('noResultsSubtitle', 'Try checking your spelling or using a different term.');
    } else {
        errorMessage = getUIText(errorMessages[errorKey], 'Could not fetch results. Please try again.');
    }
    
    const errorIcon = `<svg class="w-16 h-16 text-red-400 opacity-80 mb-4 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>`;
    
    // ✨ ADDED anim-fade-in class for smooth appearance
    els.externalSearchTab.innerHTML = `
        <div class="search-placeholder-wrapper anim-fade-in">
             <div class="search-placeholder-box text-center">
                ${errorIcon}
                <h3 class="text-xl font-semibold text-primary">${getUIText('searchErrorTitle', 'Search Error')}</h3>
                <p class="text-secondary text-base mt-1 max-w-md mx-auto">${errorMessage}</p>
                <button class="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors" onclick="window.handleExternalSearch('${query.replace(/'/g, "\\'")}', true)">
                    ${getUIText('retryButton', 'Retry')}
                </button>
            </div>
        </div>`;
}


// --- Main Search Handler ---

/**
 * Performs the actual search logic, including API calls and fallback.
 * @param {string} query - The search query.
 * @param {boolean} isJP - Whether the query is in Japanese.
 * @param {AbortSignal} signal - Signal to abort the fetch.
 * @returns {Promise<Object>}
 */
async function performSearch(query, isJP, signal) {
    if (state.currentLang === 'vi') {
        try {
            const jdictResults = await searchJDict(query, isJP, signal);
            if (jdictResults) return jdictResults; // Use JDict results if they are valid
            console.log('JDict failed or returned no results, falling back to Jotoba.');
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            console.warn('JDict search failed, falling back to Jotoba:', error.message);
        }
    }
    // Default to Jotoba or fallback for 'vi'
    return await searchJotoba(query, isJP, signal);
}


/**
 * Main handler for initiating an external dictionary search.
 * This function manages state, caching, and prevents race conditions.
 * @param {string} query - The search term from the user.
 * @param {boolean} [forceRefresh=false] - If true, bypasses the cache.
 */
async function handleExternalSearchInternal(query, forceRefresh = false) {
    const searchId = ++currentSearchId; // Increment to create a unique ID for this search
    const controller = new AbortController();

    // Link this controller to the current search ID
    if (window.activeSearchController) {
        window.activeSearchController.abort(); // Cancel any previous, ongoing search
    }
    window.activeSearchController = controller;
    
    const { signal } = controller;

    // 1. Validate input and update UI
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        els.externalSearchTab.innerHTML = createSearchPlaceholder('prompt');
        return;
    }
    const normalizedQuery = query.trim();
    els.externalSearchTab.innerHTML = createSearchPlaceholder('searching');

    const db = await dbPromise;

    try {
        // 2. Check cache first (unless forcing a refresh)
        if (!forceRefresh) {
            const cachedResult = await getCachedResult(db, normalizedQuery);
            if (cachedResult && cachedResult.lang === state.currentLang) {
                if (searchId === currentSearchId) { // Only render if this is the latest search
                    renderExternalSearchResults(cachedResult.data, normalizedQuery);
                }
                return;
            }
        }

        // 3. Perform the live search
        const isJP = JAPANESE_REGEX.test(normalizedQuery);
        const results = await performSearch(normalizedQuery, isJP, signal);

        // 4. Cache and render the results, only if this is the latest search
        if (searchId === currentSearchId) {
            await cacheResult(db, normalizedQuery, results);
            renderExternalSearchResults(results, normalizedQuery);
        }

    } catch (error) {
        if (error.name !== 'AbortError') { // Don't render error for intentionally aborted searches
            console.error("External Search Error:", error);
            if (searchId === currentSearchId) { // Only show error if it's for the latest search
                renderErrorState(error, normalizedQuery);
            }
        }
    } finally {
        // Clean up the global controller if it's the one that just finished
        if (window.activeSearchController === controller) {
            window.activeSearchController = null;
        }
    }
}

// Export a debounced version to the window object for inline `onclick` calls.
// This prevents spamming searches from the UI.
window.handleExternalSearch = debounce(handleExternalSearchInternal, 300);
export const handleExternalSearch = window.handleExternalSearch;