/**
 * @module database
 * @description Manages all IndexedDB operations for state and data persistence.
 */

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';
import { state, config } from './config.js';
import { updateProgressDashboard } from './ui.js';

// MODIFIED: Bumped version to 3
export const dbPromise = openDB('HandbookDB', 3, {
    upgrade(db, oldVersion) {
        if (oldVersion < 1) {
            db.createObjectStore('levels');
            db.createObjectStore('progress');
            db.createObjectStore('settings');
        }
        if (oldVersion < 2) {
            db.createObjectStore('dictionary_cache');
        }
        // ADDED: New object store for notes
        if (oldVersion < 3) {
            db.createObjectStore('notes');
        }
    },
});

export async function loadState() {
    try {
        const db = await dbPromise;
        const [lang, level, levelSettings] = await Promise.all([
            db.get('settings', 'language'),
            db.get('settings', 'currentLevel'),
            db.get('settings', 'levelSettings')
        ]);

        state.currentLang = lang || 'en';
        state.currentLevel = level || config.defaultLevel;

        const currentLevelSettings = levelSettings?.[state.currentLevel];
        state.pinnedTab = currentLevelSettings?.pinnedTab || null;

        state.progress = (await db.get('progress', state.currentLevel)) || { kanji: [], vocab: [] };
    } catch (error) {
        console.error("Error loading state from IndexedDB:", error);
        state.currentLang = 'en';
        state.currentLevel = config.defaultLevel;
        state.progress = { kanji: [], vocab: [] };
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

export async function loadTabData(level, tabId) {
    if (state.appData[tabId]) {
        return;
    }

    try {
        const response = await fetch(`${config.dataPath}/${level}/${tabId}.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        state.appData[tabId] = data;
    } catch (error) {
        console.error(`Error loading data for tab ${tabId}:`, error);
        const tabElement = document.getElementById(tabId);
        if (tabElement) {
            const getUIText = (key, replacements = {}) => {
                let text = state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;
                for (const [placeholder, value] of Object.entries(replacements)) {
                    text = text.replace(`{${placeholder}}`, value);
                }
                return text;
            };
            const errorText = getUIText('errorFailedToLoadContent', { tabId: tabId });
            tabElement.innerHTML = `<p class="p-4 text-center text-red-400">${errorText}</p>`;
        }
        throw error;
    }
}

export async function loadAllData(level) {
    const uiPromise = fetch(`./data/${config.defaultLevel}/ui.json`)
        .then(res => {
            if (!res.ok) throw new Error(`Failed to fetch UI data: ${res.status}`);
            return res.json();
        })
        .catch(err => {
            console.error("Fatal: Could not load the global ui.json file.", err);
            return {};
        });

    const db = await dbPromise;
    const savedData = await db.get('levels', level);

    if (savedData) {
        state.appData = savedData;
    } else {
        state.appData = {};
    }
    
    state.appData.ui = await uiPromise;
}

// --- ADDED FUNCTIONS FOR NOTES ---

/**
 * Saves a note for a specific level and tab.
 * @param {string} level The level identifier (e.g., 'n5').
 * @param {string} tabId The tab identifier (e.g., 'grammar').
 * @param {string} content The note content.
 */
export async function saveNote(level, tabId, content) {
    try {
        const db = await dbPromise;
        const key = `${level}-${tabId}`;
        const noteObject = {
            content: content,
            lastModified: new Date().toISOString()
        };
        await db.put('notes', noteObject, key);
    } catch (error) {
        console.error(`Error saving note for ${level}-${tabId}:`, error);
    }
}



/**
 * Loads a note for a specific level and tab.
 * @param {string} level The level identifier.
 * @param {string} tabId The tab identifier.
 * @returns {Promise<object|null>} The note object { content, lastModified }, or null if not found.
 */
export async function loadNote(level, tabId) {
    try {
        const db = await dbPromise;
        const key = `${level}-${tabId}`;
        // MODIFIED: Return the full object, or null if it doesn't exist.
        const note = await db.get('notes', key);
        return note || null;
    } catch (error) {
        console.error(`Error loading note for ${level}-${tabId}:`, error);
        return null; // Ensure null is returned on error
    }
}

/**
 * Deletes all notes associated with a given level.
 * @param {string} level The level to delete notes for.
 */
export async function deleteNotesForLevel(level) {
    try {
        const db = await dbPromise;
        const tx = db.transaction('notes', 'readwrite');
        const keys = await tx.store.getAllKeys();
        const levelKeys = keys.filter(key => key.startsWith(`${level}-`));
        await Promise.all(levelKeys.map(key => tx.store.delete(key)));
        await tx.done;
    } catch (error) {
        console.error(`Error deleting notes for level ${level}:`, error);
    }
}