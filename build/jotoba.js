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
const RATE_LIMIT_WINDOW = 1000; // 1 second between requests
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

// Rate limiting and request management
const requestTracker = new Map();
let activeRequests = new Set();
let lastRequestTime = 0;

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
 * Implements exponential backoff delay
 * @param {number} attempt - The current attempt number (0-based)
 * @returns {Promise} A promise that resolves after the delay
 */
function delay(attempt) {
    const backoffDelay = RETRY_DELAY * Math.pow(2, attempt);
    return new Promise(resolve => setTimeout(resolve, backoffDelay));
}

/**
 * Rate-limited fetch with timeout and retry logic
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<Response>} The fetch response
 */
async function fetchWithTimeoutAndRetry(url, options = {}, retries = MAX_RETRIES) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_WINDOW) {
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_WINDOW - timeSinceLastRequest));
    }
    lastRequestTime = Date.now();

    // Check if we already have an active request for this URL
    const requestKey = `${url}:${JSON.stringify(options)}`;
    if (activeRequests.has(requestKey)) {
        throw new Error('Duplicate request prevented');
    }

    activeRequests.add(requestKey);

    try {
        const response = await Promise.race([
            fetch(url, {
                ...options,
                signal: AbortSignal.timeout(REQUEST_TIMEOUT)
            }),
            createTimeout(REQUEST_TIMEOUT)
        ]);

        // Handle specific HTTP errors
        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('Rate limit exceeded');
            }
            if (response.status >= 500 && response.status < 600) {
                throw new Error(`Server error: ${response.status}`);
            }
            if (response.status === 404) {
                throw new Error('API endpoint not found');
            }
            throw new Error(`HTTP error: ${response.status}`);
        }

        return response;
    } catch (error) {
        if (retries > 0 && shouldRetry(error)) {
            console.warn(`Request failed, retrying... (${retries} attempts left):`, error.message);
            await delay(MAX_RETRIES - retries);
            return fetchWithTimeoutAndRetry(url, options, retries - 1);
        }
        throw error;
    } finally {
        activeRequests.delete(requestKey);
    }
}

/**
 * Determines if an error should trigger a retry
 * @param {Error} error - The error to check
 * @returns {boolean} Whether the error should trigger a retry
 */
function shouldRetry(error) {
    const retryableErrors = [
        'Request timeout',
        'Rate limit exceeded',
        'Server error',
        'Failed to fetch', // Network errors
        'NetworkError'
    ];
    return retryableErrors.some(errorType => error.message.includes(errorType));
}

/**
 * Parses a JDict 'suggest_mean' string from a vi_jp search.
 * @param {string} suggestMean - The string from the JDict API.
 * @returns {Array<{kanji: string, kana: string}>} An array of objects.
 */
function parseSuggestMean(suggestMean) {
    if (!suggestMean || typeof suggestMean !== 'string') return [];

    try {
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
    } catch (error) {
        console.warn('Error parsing suggest_mean:', error);
        return [];
    }
}

/**
 * Validates and sanitizes JDict response data
 * @param {Object} jdictData - Raw JDict API response
 * @returns {boolean} Whether the data is valid
 */
function validateJDictData(jdictData) {
    return jdictData && 
           typeof jdictData === 'object' && 
           Array.isArray(jdictData.list) && 
           jdictData.list.length > 0;
}

/**
 * Transforms JDict response data to match the expected format
 * @param {Object} jdictData - Raw JDict API response
 * @param {boolean} isJP - Whether the query is in Japanese
 * @returns {Object} Transformed data
 */
function transformJDictData(jdictData, isJP) {
    if (!validateJDictData(jdictData)) {
        return { words: [], kanji: [] };
    }

    try {
        let transformedWords;
        if (isJP) {
            // Handle JP -> VI response (e.g., searching for "車" or "こんにちわ")
            transformedWords = jdictData.list.map(item => {
                const meanings = (item.suggest_mean || '').split(';').map(s => s.trim()).filter(Boolean);
                const kanaMatch = (item.word || '').match(/「(.*?)」/);
                const kanji = (item.word || '').replace(/「(.*?)」/, '').trim();
                const kana = kanaMatch ? kanaMatch[1] : '';

                return {
                    reading: { kanji: kanji || kana, kana },
                    senses: [{ glosses: meanings }]
                };
            });
        } else {
            // Handle VI -> JP response
            transformedWords = jdictData.list.map(item => ({
                reading: { kanji: item.word || '', kana: '' },
                senses: parseSuggestMean(item.suggest_mean).map(meaning => ({
                    glosses: [meaning.kanji],
                    reading: meaning.kana
                }))
            }));
        }

        return { words: transformedWords, kanji: [] };
    } catch (error) {
        console.warn('Error transforming JDict data:', error);
        return { words: [], kanji: [] };
    }
}

/**
 * Attempts to search using JDict API
 * @param {string} query - The search query
 * @param {boolean} isJP - Whether the query is in Japanese
 * @returns {Promise<Object|null>} Search results or null if failed
 */
async function searchJDict(query, isJP) {
    if (!query || query.trim().length === 0) {
        return null;
    }

    try {
        const dictType = isJP ? 'jp_vi' : 'vi_jp';
        const url = `${JDICT_BASE_URL}?keyword=${encodeURIComponent(query.trim())}&dict=${dictType}`;
        
        const response = await fetchWithTimeoutAndRetry(url);
        const data = await response.json();
        
        if (!validateJDictData(data)) {
            console.warn('JDict returned invalid or empty data');
            return null;
        }
        
        return transformJDictData(data, isJP);
    } catch (error) {
        console.warn('JDict search failed:', error.message);
        return null;
    }
}

/**
 * Validates Jotoba response data
 * @param {Object} jotobaData - Raw Jotoba API response
 * @returns {boolean} Whether the data is valid
 */
function validateJotobaData(jotobaData) {
    return jotobaData && 
           typeof jotobaData === 'object' && 
           (Array.isArray(jotobaData.words) || Array.isArray(jotobaData.kanji));
}

/**
 * Attempts to search using Jotoba API
 * @param {string} query - The search query
 * @param {boolean} isJP - Whether the query is in Japanese
 * @returns {Promise<Object>} Search results
 */
async function searchJotoba(query, isJP) {
    if (!query || query.trim().length === 0) {
        throw new Error('Empty query provided');
    }

    try {
        const response = await fetchWithTimeoutAndRetry(JOTOBA_BASE_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                query: query.trim(),
                language: isJP ? 'Japanese' : 'English',
                no_english: false
            }),
        });

        const data = await response.json();
        
        if (!validateJotobaData(data)) {
            throw new Error('Invalid response data from Jotoba');
        }
        
        return {
            words: data.words || [],
            kanji: data.kanji || []
        };
    } catch (error) {
        console.error('Jotoba search failed:', error.message);
        throw new Error(`Jotoba API Error: ${error.message}`);
    }
}

/**
 * Checks if cached result is still valid
 * @param {Object} cachedResult - The cached result object
 * @returns {boolean} Whether the cache is still valid
 */
function isCacheValid(cachedResult) {
    return cachedResult && 
           cachedResult.timestamp && 
           typeof cachedResult.timestamp === 'number' &&
           Date.now() - cachedResult.timestamp < CACHE_DURATION;
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
        
        // Clean up expired cache entry
        if (cachedResult) {
            await db.delete('dictionary_cache', query);
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
            lang: state.currentLang,
            timestamp: Date.now()
        }, query);
    } catch (error) {
        console.warn('Cache storage failed:', error);
    }
}

/**
 * Debounces search requests to prevent spam
 * @param {Function} func - The function to debounce
 * @param {number} delay - The debounce delay in milliseconds
 * @returns {Function} The debounced function
 */
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Gets localized UI text with fallback
 * @param {string} key - The UI text key
 * @param {string} fallback - The fallback text
 * @returns {string} The localized text
 */
function getUIText(key, fallback) {
    return state.appData?.ui?.[state.currentLang]?.[key] || fallback;
}

/**
 * Renders error state with appropriate message
 * @param {Error} error - The error that occurred
 * @param {string} query - The search query
 */
function renderErrorState(error, query) {
    const errorTitle = getUIText('searchErrorTitle', 'Search Error');
    let errorMessage;
    
    if (error.message.includes('timeout')) {
        errorMessage = getUIText('searchTimeout', 'Search timed out. Please try again.');
    } else if (error.message.includes('Rate limit')) {
        errorMessage = getUIText('searchRateLimitError', 'Too many requests. Please wait a moment.');
    } else if (error.message.includes('Server error')) {
        errorMessage = getUIText('searchServerError', 'Server is temporarily unavailable. Please try again later.');
    } else if (error.message.includes('Network')) {
        errorMessage = getUIText('searchNetworkError', 'Network connection failed. Please check your internet connection.');
    } else if (error.message.includes('No results found')) {
        errorMessage = getUIText('noResults', 'No results found') + ` "${query}". ` + getUIText('noResultsSubtitle', 'Try checking your spelling or using a different term.');
    } else {
        errorMessage = getUIText('searchError', 'Could not fetch results. Please try again.');
    }
        
    const errorIcon = `<svg class="w-16 h-16 text-red-400 opacity-80 mb-4 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>`;
    
    els.externalSearchTab.innerHTML = `
        <div class="search-placeholder-wrapper">
             <div class="search-placeholder-box text-center">
                ${errorIcon}
                <h3 class="text-xl font-semibold text-primary">${errorTitle}</h3>
                <p class="text-secondary text-base mt-1 max-w-md mx-auto">${errorMessage}</p>
                <button class="mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors" onclick="handleExternalSearch('${query}', true)">
                    ${getUIText('retryButton', 'Retry')}
                </button>
            </div>
        </div>`;
}

/**
 * Main handler for searching external dictionaries.
 * Manages caching, API fallback, and rendering of results.
 * @param {string} query - The search term from the user.
 * @param {boolean} [forceRefresh=false] - If true, bypasses the cache.
 */
async function handleExternalSearchInternal(query, forceRefresh = false) {
    // Validate input
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        els.externalSearchTab.innerHTML = createSearchPlaceholder('prompt');
        return;
    }

    const normalizedQuery = query.trim();
    const db = await dbPromise;

    // Check for duplicate requests
    const requestKey = `${normalizedQuery}:${state.currentLang}`;
    if (requestTracker.has(requestKey)) {
        console.log('Duplicate search request prevented');
        return;
    }

    requestTracker.set(requestKey, Date.now());

    try {
        // 1. Check cache first, unless forcing a refresh
        if (!forceRefresh) {
            const cachedResult = await getCachedResult(db, normalizedQuery);
            if (cachedResult && cachedResult.lang === state.currentLang) {
                renderExternalSearchResults(cachedResult.data, normalizedQuery);
                return;
            }
        }

        // 2. Show 'searching' state
        if (!els.externalSearchTab.querySelector('.search-placeholder-wrapper')) {
            els.externalSearchTab.innerHTML = createSearchPlaceholder('searching');
        }

        const isJP = JAPANESE_REGEX.test(normalizedQuery);
        let resultsToRender = null;

        // 3. Select API based on language with proper error handling
        if (state.currentLang === 'vi') {
            try {
                resultsToRender = await searchJDict(normalizedQuery, isJP);
            } catch (error) {
                console.warn('JDict failed:', error.message);
                resultsToRender = null;
            }
            
            if (!resultsToRender || (!resultsToRender.words?.length && !resultsToRender.kanji?.length)) {
                console.log('JDict failed or returned no results, falling back to Jotoba.');
                resultsToRender = await searchJotoba(normalizedQuery, isJP);
            }
        } else {
            resultsToRender = await searchJotoba(normalizedQuery, isJP);
        }
        
        // 4. Validate results
        if (!resultsToRender || (!resultsToRender.words?.length && !resultsToRender.kanji?.length)) {
            throw new Error('No results found');
        }
        
        // 5. Cache the successful result
        await cacheResult(db, normalizedQuery, resultsToRender);
        
        // 6. Render the results
        renderExternalSearchResults(resultsToRender, normalizedQuery);

    } catch (error) {
        console.error("External Search Error:", error);
        renderErrorState(error, normalizedQuery);
    } finally {
        // Clean up request tracker
        setTimeout(() => {
            requestTracker.delete(requestKey);
        }, RATE_LIMIT_WINDOW);
    }
}

// Export the debounced version to prevent spam
export const handleExternalSearch = debounce(handleExternalSearchInternal, 300);