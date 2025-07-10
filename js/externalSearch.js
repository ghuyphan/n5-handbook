/**
 * @module externalSearch
 * @description Handles loading and searching of external dictionary data.
 */
import Fuse from 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

export const externalDB = {
    vocab: [],
    kanji: [],
    vocabFuse: null,
    kanjiFuse: null,
};

/**
 * Loads a Yomichan-format dictionary by sequentially fetching bank files.
 * This method is robust and does not require an index.json file.
 * @param {string} path - The path to the dictionary's root folder.
 * @param {string} filePrefix - The prefix for the bank files (e.g., 'term_bank' or 'kanji_bank').
 * @returns {Promise<Array>} A promise that resolves with the aggregated dictionary data.
 */
async function loadDictionary(path, filePrefix) {
    let allData = [];
    let i = 1;
    let consecutiveNotFound = 0;
    const maxConsecutiveNotFound = 3; // Stop after 3 consecutive 404s
    
    console.log(`Starting to load dictionary from ${path} with prefix ${filePrefix}`);
    
    while (consecutiveNotFound < maxConsecutiveNotFound) {
        const filePath = `${path}/${filePrefix}_${i}.json`;
        
        try {
            console.log(`Attempting to load: ${filePath}`);
            const response = await fetch(filePath);
            
            if (response.ok) {
                const data = await response.json();
                allData = allData.concat(data);
                consecutiveNotFound = 0; // Reset counter on success
                console.log(`Successfully loaded ${filePath} with ${data.length} entries`);
            } else if (response.status === 404) {
                consecutiveNotFound++;
                console.log(`File not found: ${filePath} (${consecutiveNotFound}/${maxConsecutiveNotFound})`);
            } else {
                console.error(`Failed to load ${filePath}. Status: ${response.status}`);
                consecutiveNotFound++;
            }
        } catch (error) {
            console.error(`Error fetching ${filePath}:`, error);
            consecutiveNotFound++;
        }
        
        i++;
    }
    
    if (allData.length > 0) {
        console.log(`Successfully loaded ${i - consecutiveNotFound - 1} ${filePrefix} file(s) from ${path} with ${allData.length} total entries.`);
    } else {
        console.warn(`No data loaded from ${path}/${filePrefix}_*.json`);
    }
    
    return allData;
}

/**
 * Alternative method: Load dictionary with predefined file list
 * Use this if you know exactly which files exist
 */
async function loadDictionaryWithFileList(path, filePrefix, fileNumbers) {
    let allData = [];
    
    console.log(`Loading dictionary from ${path} with specific files: ${fileNumbers}`);
    
    for (const fileNum of fileNumbers) {
        const filePath = `${path}/${filePrefix}_${fileNum}.json`;
        
        try {
            console.log(`Loading: ${filePath}`);
            const response = await fetch(filePath);
            
            if (response.ok) {
                const data = await response.json();
                allData = allData.concat(data);
                console.log(`Successfully loaded ${filePath} with ${data.length} entries`);
            } else {
                console.error(`Failed to load ${filePath}. Status: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching ${filePath}:`, error);
        }
    }
    
    return allData;
}

/**
 * Check if a file exists
 */
async function fileExists(filePath) {
    try {
        const response = await fetch(filePath, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

/**
 * Discover available files in a directory
 */
async function discoverFiles(path, filePrefix, maxFiles = 50) {
    const availableFiles = [];
    
    for (let i = 1; i <= maxFiles; i++) {
        const filePath = `${path}/${filePrefix}_${i}.json`;
        if (await fileExists(filePath)) {
            availableFiles.push(i);
        }
    }
    
    return availableFiles;
}

/**
 * Initializes the external search by loading and indexing dictionaries.
 */
export async function initExternalSearch() {
    const jmdictPath = '../jmdict_vietnamese';
    const kanjidicPath = '../kanjidic_english';
    
    console.log('Initializing external search...');
    
    try {
        // Load with known file numbers based on your file structure
        const termBankFiles = Array.from({length: 29}, (_, i) => i + 1); // Files 1-29
        const kanjiBankFiles = [1, 2]; // Your actual kanji_bank files
        
        console.log('Loading dictionaries with known file numbers...');
        const [vocabData, kanjiData] = await Promise.all([
            loadDictionaryWithFileList(jmdictPath, 'term_bank', termBankFiles),
            loadDictionaryWithFileList(kanjidicPath, 'kanji_bank', kanjiBankFiles)
        ]);
        
        // Format data for easier searching with Fuse.js
        externalDB.vocab = vocabData.map(entry => ({
            term: entry[0],
            reading: entry[1],
            definitions: entry[5]?.[0] || []
        }));
        
        externalDB.kanji = kanjiData.map(entry => ({
            character: entry[0],
            onyomi: entry[1],
            kunyomi: entry[2],
            definitions: entry[4] || []
        }));
        
        // Create Fuse instances for fuzzy searching
        if (externalDB.vocab.length > 0) {
            externalDB.vocabFuse = new Fuse(externalDB.vocab, {
                keys: ['term', 'reading'],
                includeScore: true,
                threshold: 0.3,
            });
            console.log(`Vocab search initialized with ${externalDB.vocab.length} entries`);
        } else {
            console.warn('No vocab data loaded - vocab search will be unavailable');
        }
        
        if (externalDB.kanji.length > 0) {
            externalDB.kanjiFuse = new Fuse(externalDB.kanji, {
                keys: ['character', 'onyomi', 'kunyomi'],
                includeScore: true,
                threshold: 0.3,
            });
            console.log(`Kanji search initialized with ${externalDB.kanji.length} entries`);
        } else {
            console.warn('No kanji data loaded - kanji search will be unavailable');
        }
        
    } catch (error) {
        console.error('Error during external search initialization:', error);
    }
}

/**
 * Searches the loaded external dictionaries.
 * @param {string} query - The search query.
 * @returns {{vocab: Array, kanji: Array}} The search results.
 */
export function searchExternal(query) {
    const vocabResults = externalDB.vocabFuse ? externalDB.vocabFuse.search(query) : [];
    const kanjiResults = externalDB.kanjiFuse ? externalDB.kanjiFuse.search(query) : [];
    
    return {
        vocab: vocabResults.map(r => r.item),
        kanji: kanjiResults.map(r => r.item),
    };
}

/**
 * Get statistics about loaded dictionaries
 */
export function getDictionaryStats() {
    return {
        vocabEntries: externalDB.vocab.length,
        kanjiEntries: externalDB.kanji.length,
        vocabSearchAvailable: !!externalDB.vocabFuse,
        kanjiSearchAvailable: !!externalDB.kanjiFuse
    };
}