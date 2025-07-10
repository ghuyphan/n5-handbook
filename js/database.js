/**
 * @module database
 * @description Manages all IndexedDB operations for state and data persistence.
 */

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';
import { state, config } from './config.js';
import { updateProgressDashboard } from './ui.js';

export const dbPromise = openDB('HandbookDB', 2, { // Version updated to 2
    upgrade(db, oldVersion) {
        if (oldVersion < 1) {
            if (!db.objectStoreNames.contains('levels')) {
                db.createObjectStore('levels');
            }
            if (!db.objectStoreNames.contains('progress')) {
                db.createObjectStore('progress');
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings');
            }
        }
        if (oldVersion < 2) {
            // New stores for the dictionary cache
            if (!db.objectStoreNames.contains('dictionary_cache')) {
                db.createObjectStore('dictionary_cache');
            }
        }
    },
});

export async function loadState() {
    try {
        const db = await dbPromise;
        const [lang, level, levelSettings] = await Promise.all([
            db.get('settings', 'language'),
            db.get('settings', 'currentLevel'),
            db.get('settings', 'levelSettings') // Get the new object for all level-specific settings
        ]);
        
        state.currentLang = lang || 'en';
        state.currentLevel = level || config.defaultLevel;
        
        // Get the pinned tab specifically for the current level
        const currentLevelSettings = levelSettings?.[state.currentLevel];
        state.pinnedTab = currentLevelSettings?.pinnedTab || null;

        // Progress loading remains the same as it's already per-level
        state.progress = (await db.get('progress', state.currentLevel)) || { kanji: [], vocab: [] };

    } catch (error) {
        console.error("Error loading state from IndexedDB:", error);
    }
}

export async function saveProgress() {
    try {
        const db = await dbPromise;
        await db.put('progress', state.progress, state.currentLevel);
        updateProgressDashboard();
    } catch (error) {
        console.error("Error saving progress to IndexedDB:", error);
    }
}

export async function saveSetting(key, value) {
    try {
        const db = await dbPromise;
        await db.put('settings', value, key);
    } catch (error) {
        console.error(`Error saving setting '${key}' to IndexedDB:`, error);
    }
}

export async function loadAllData(level) {
    const uiPromise = fetch(`./data/${config.defaultLevel}/ui.json`)
        .then(res => res.ok ? res.json() : {})
        .catch(err => {
            console.error("Fatal: Could not load the global ui.json file.", err);
            return {};
        });

    if (level !== config.defaultLevel) {
        const db = await dbPromise;
        const savedData = await db.get('levels', level);
        if (savedData) {
            state.appData = savedData;
            state.appData.ui = await uiPromise;
            return;
        }
    }

    try {
        const files = ['hiragana', 'katakana', 'kanji', 'vocab', 'grammar', 'keyPoints'];
        const fetchPromises = files.map((file) =>
            fetch(`${config.dataPath}/${level}/${file}.json`).then((response) => {
                if (!response.ok) throw new Error(`Failed to load ${file}.json for level ${level}`);
                return response.json();
            })
        );

        const [uiData, ...levelData] = await Promise.all([uiPromise, ...fetchPromises]);

        state.appData = Object.fromEntries(files.map((file, i) => [file, levelData[i]]));
        state.appData.ui = uiData;

    } catch (error) {
        console.error('Error loading application data:', error);
        document.body.innerHTML = `<div style="text-align: center; padding: 40px; font-family: sans-serif;"><h2>Error Loading Data</h2><p>Could not load learning data for <b>JLPT ${level.toUpperCase()}</b>.</p></div>`;
        throw error;
    }
}