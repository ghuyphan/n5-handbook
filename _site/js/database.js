/**
 * @module database
 * @description Manages all IndexedDB operations for state and data persistence.
 */

import { openDB } from 'idb';
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

/**
 * ADDED: Loads the essential global UI translations.
 * This should be called once at startup before any rendering occurs.
 */
export async function loadGlobalUI() {
    try {
        const response = await fetch(`./data/${config.defaultLevel}/ui.json`);
        if (!response.ok) {
            throw new Error(`Failed to fetch UI data: ${response.status}`);
        }
        state.appData.ui = await response.json();
    } catch (error) {
        console.error("Fatal: Could not load the global ui.json file.", error);
        // Set a fallback UI object to prevent the app from crashing.
        state.appData.ui = { en: { error: "UI failed to load" } };
    }
}


export async function loadState() {
    try {
        const db = await dbPromise;
        const [lang, level, levelSettings, progressData] = await Promise.all([
            db.get('settings', 'language'),
            db.get('settings', 'currentLevel'),
            db.get('settings', 'levelSettings'),
            db.get('progress', state.currentLevel)
        ]);

        state.currentLang = lang || 'en';
        state.currentLevel = level || config.defaultLevel;
        state.progress = progressData || { kanji: [], vocab: [] };

        const currentLevelSettings = levelSettings?.[state.currentLevel];
        state.pinnedTab = currentLevelSettings?.pinnedTab || null;
        state.openAccordions = new Map(
            (currentLevelSettings?.openAccordions || []).map(([tabId, keys]) => [tabId, new Set(keys)])
        );

    } catch (error) {
        console.error("Error loading state from IndexedDB:", error);
        // Set sensible defaults on failure
        Object.assign(state, {
            currentLang: 'en',
            currentLevel: config.defaultLevel,
            progress: { kanji: [], vocab: [] },
            pinnedTab: null,
            openAccordions: new Map(),
        });
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

/**
 * ADDED: Saves the current state of open accordions for the current level.
 */
export async function saveAccordionState() {
    try {
        const db = await dbPromise;
        const levelSettings = (await db.get('settings', 'levelSettings')) || {};

        if (!levelSettings[state.currentLevel]) {
            levelSettings[state.currentLevel] = {};
        }

        const serializableAccordions = Array.from(state.openAccordions.entries()).map(([tabId, keySet]) => [tabId, Array.from(keySet)]);

        levelSettings[state.currentLevel].openAccordions = serializableAccordions;
        await db.put('settings', levelSettings, 'levelSettings');
    } catch (error) {
        console.error("Error saving accordion state:", error);
    }
}

export async function loadTabData(level, tabId) {
    // Data is already present, no need to fetch.
    if (state.appData[tabId]) {
        return;
    }

    try {
        const response = await fetch(`${config.dataPath}/${level}/${tabId}.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        state.appData[tabId] = data; // Store fetched data
    } catch (error) {
        console.error(`Error loading data for tab ${tabId}:`, error);
        // We will render an error message in the UI, so re-throw to be caught by the caller.
        throw error;
    }
}

export async function loadAllData(level) {
    // The global UI is loaded separately now, so this function only handles level-specific data.
    const db = await dbPromise;
    const savedData = await db.get('levels', level);
    
    // Clear old data except for the UI
    const uiData = state.appData.ui;
    state.appData = { ui: uiData };

    if (savedData) {
        // Merge custom level data
        Object.assign(state.appData, savedData);
    }
}

// --- Note Management ---

const getNoteKey = (level, tabId) => `${level}-${tabId}`;

export async function saveNote(level, tabId, content) {
    try {
        const db = await dbPromise;
        const noteObject = {
            content: content,
            lastModified: new Date().toISOString()
        };
        await db.put('notes', noteObject, getNoteKey(level, tabId));
    } catch (error) {
        console.error(`Error saving note for ${getNoteKey(level, tabId)}:`, error);
    }
}

export async function loadNote(level, tabId) {
    try {
        const db = await dbPromise;
        return await db.get('notes', getNoteKey(level, tabId)) || null;
    } catch (error) {
        console.error(`Error loading note for ${getNoteKey(level, tabId)}:`, error);
        return null;
    }
}

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