/**
 * @module jotoba
 * @description Handles searching via the Jotoba API.
 */
import { els } from './dom.js';
import { state } from './config.js';
import { renderExternalSearchResults } from './ui.js';
import { dbPromise } from './database.js';

/**
 * Main handler for searching the external Jotoba dictionary.
 * @param {string} query - The search term from the user.
 */
export async function handleExternalSearch(query) {
    const getUIText = (key) => state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;

    if (!query) {
        els.externalSearchTab.innerHTML = `<p class="text-center text-secondary my-8" data-lang-key="dictionaryPrompt">${getUIText('dictionaryPrompt')}</p>`;
        return;
    }

    const db = await dbPromise;
    const cachedResult = await db.get('dictionary_cache', query);

    if (cachedResult) {
        renderExternalSearchResults(cachedResult, query);
        return;
    }

    els.externalSearchTab.innerHTML = `<p class="text-center text-secondary my-8">${getUIText('searching')}</p>`;

    try {
        const isJP = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(query);

        const jotobaUrl = 'https://jotoba.de/api/search/words';
        const jotobaResponse = await fetch(jotobaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                language: isJP ? 'Japanese' : 'English',
                no_english: false
            }),
        });

        if (!jotobaResponse.ok) throw new Error(`Jotoba API Error: ${jotobaResponse.status}`);

        const jotobaData = await jotobaResponse.json();

        if ((!jotobaData.words || jotobaData.words.length === 0) && (!jotobaData.kanji || jotobaData.kanji.length === 0)) {
            renderExternalSearchResults({ words: [], kanji: [] }, query); // Pass empty results
            return;
        }
        
        // Directly use the data, no translation needed
        const resultsToRender = {
            words: jotobaData.words || [],
            kanji: jotobaData.kanji || []
        };

        await db.put('dictionary_cache', resultsToRender, query);

        renderExternalSearchResults(resultsToRender, query);

    } catch (error) {
        console.error("External Search Error:", error);
        els.externalSearchTab.innerHTML = `<p class="text-center text-red-500 my-8">Error: Could not fetch results. Please try again.</p>`;
    }
}