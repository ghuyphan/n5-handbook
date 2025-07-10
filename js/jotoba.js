/**
 * @module jotoba
 * @description Handles searching via the Jotoba API and translating results.
 */
import { els } from './dom.js';
import { state } from './config.js';
import { renderExternalSearchResults } from './ui.js';

/**
 * Translates text using the Google Translate API.
 * @param {string} text - The text to translate.
 * @param {string} from - The source language code (e.g., 'en').
 * @param {string} to - The target language code (e.g., 'vi').
 * @returns {Promise<string>} The translated text.
 */
async function translateText(text, from, to) {
    if (!text) return '';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Translation API error');
        const data = await response.json();
        return data[0]?.map(item => item[0]).join('') || `(Translation unavailable)`;
    } catch (error) {
        console.error('Translation failed:', error);
        return `(Translation error)`;
    }
}

/**
 * Renders a loading message in the external search tab.
 * @param {string} messageKey - The language key for the message.
 * @param {string} iconSvg - The SVG string for the icon.
 */
function showLoadingState(messageKey, iconSvg) {
    const getUIText = (key) => state.appData.ui?.[state.currentLang]?.[key] || `[${key}]`;
    if (els.externalSearchTab) {
        els.externalSearchTab.innerHTML = `
            <div class="text-center py-12 fade-in">
                <div class="inline-block animate-pulse">
                    ${iconSvg}
                </div>
                <p class="mt-4 text-secondary">${getUIText(messageKey)}</p>
            </div>
        `;
    }
}

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

    els.externalSearchTab.innerHTML = `<p class="text-center text-secondary my-8">${getUIText('searching')}</p>`;

    try {
        const isJP = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(query);
        
        // Determine search query - if Japanese, use as-is; otherwise translate to English
        let searchQuery;
        if (isJP) {
            searchQuery = query; // Use Japanese directly
        } else {
            // For Vietnamese or other languages, translate to English
            searchQuery = await translateText(query, 'vi', 'en');
        }

        const jotobaUrl = 'https://jotoba.de/api/search/words';
        const jotobaResponse = await fetch(jotobaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                query: searchQuery, 
                language: isJP ? 'Japanese' : 'English', // Set appropriate language
                no_english: false 
            }),
        });

        if (!jotobaResponse.ok) throw new Error(`Jotoba API Error: ${jotobaResponse.status}`);
        
        const jotobaData = await jotobaResponse.json();
        
        if (!jotobaData.words || jotobaData.words.length === 0) {
            renderExternalSearchResults({ words: [] }, query); // Pass empty results
            return;
        }

        // Process results: take the top 10 and translate their meanings
        const wordsToProcess = jotobaData.words.slice(0, 10);
        const translationPromises = wordsToProcess.map(async (word) => {
            const englishMeanings = word.senses.map(sense => sense.glosses.join(', ')).join('; ');
            const translatedMeanings = await translateText(englishMeanings, 'en', state.currentLang);
            return {
                ...word,
                translatedSenses: translatedMeanings,
            };
        });

        const translatedWords = await Promise.all(translationPromises);
        renderExternalSearchResults({ words: translatedWords }, query);
        
    } catch (error) {
        console.error("External Search Error:", error);
        els.externalSearchTab.innerHTML = `<p class="text-center text-red-500 my-8">Error: Could not fetch results. Please try again.</p>`;
    }
}