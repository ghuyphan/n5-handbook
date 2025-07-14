/**
 * @module database
 * @description Manages all IndexedDB operations for state and data persistence. This refined version improves error handling and simplifies data loading logic.
 */

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';
import { state, config } from './config.js';
import { updateProgressDashboard } from './ui.js';

// Establishes a connection to the IndexedDB database, handling version upgrades.
export const dbPromise = openDB('HandbookDB', 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
        // Creates the initial object stores if the database is new.
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
        // Adds the dictionary cache store in version 2.
        if (oldVersion < 2) {
            if (!db.objectStoreNames.contains('dictionary_cache')) {
                db.createObjectStore('dictionary_cache');
            }
        }
    },
});

/**
 * Loads the essential user state (language, level, progress) from IndexedDB.
 */
export async function loadState() {
    try {
        const db = await dbPromise;
        // Fetches all settings concurrently for better performance.
        const [lang, level, levelSettings] = await Promise.all([
            db.get('settings', 'language'),
            db.get('settings', 'currentLevel'),
            db.get('settings', 'levelSettings')
        ]);

        state.currentLang = lang || 'en';
        state.currentLevel = level || config.defaultLevel;

        // Safely access level-specific settings.
        const currentLevelSettings = levelSettings?.[state.currentLevel];
        state.pinnedTab = currentLevelSettings?.pinnedTab || null;

        // Load progress for the current level.
        state.progress = (await db.get('progress', state.currentLevel)) || { kanji: [], vocab: [] };

    } catch (error) {
        console.error("Error loading state from IndexedDB:", error);
        // Fallback to default state on error to ensure app stability.
        state.currentLang = 'en';
        state.currentLevel = config.defaultLevel;
        state.progress = { kanji: [], vocab: [] };
    }
}

/**
 * Saves the current user progress for the active level to IndexedDB.
 */
export async function saveProgress() {
    try {
        const db = await dbPromise;
        await db.put('progress', state.progress, state.currentLevel);
        updateProgressDashboard();
    } catch (error) {
        console.error("Error saving progress to IndexedDB:", error);
    }
}

/**
 * Saves a single key-value pair to the settings store in IndexedDB.
 * @param {string} key The key for the setting.
 * @param {any} value The value of the setting.
 */
export async function saveSetting(key, value) {
    try {
        const db = await dbPromise;
        await db.put('settings', value, key);
    } catch (error) {
        console.error(`Error saving setting '${key}' to IndexedDB:`, error);
    }
}

/**
 * **REFINED**: Loads data for a specific tab on-demand from the network.
 * The internal loader logic has been removed to prevent race conditions with the main loading overlay.
 * The `setLevel` function is now the single source of truth for the loading UI.
 * @param {string} level - The current level (e.g., 'n5').
 * @param {string} tabId - The ID of the tab to load data for (e.g., 'hiragana').
 */
export async function loadTabData(level, tabId) {
    // If data is already loaded, no need to fetch it again.
    if (state.appData[tabId]) {
        return;
    }

    try {
        const response = await fetch(`${config.dataPath}/${level}/${tabId}.json`);
        if (!response.ok) {
            // This error will be caught by the calling function, typically setLevel.
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        state.appData[tabId] = data; // Assign fetched data to the state.
    } catch (error) {
        console.error(`Error loading data for tab ${tabId}:`, error);
        // Re-throw the error to be handled by the central error handler in `setLevel`.
        // This ensures a consistent user experience on failure.
        const tabElement = document.getElementById(tabId);
        if (tabElement) {
            tabElement.innerHTML = `<p class="p-4 text-center text-red-400">Failed to load content for ${tabId}.</p>`;
        }
        throw error;
    }
}

/**
 * **REFINED**: This function now loads only the data essential for initializing a level.
 * It's more streamlined and distinguishes clearly between custom and default levels.
 * @param {string} level The level to load.
 */
export async function loadAllData(level) {
    // 1. Always fetch the core UI text. It's small and needed for all levels.
    const uiPromise = fetch(`./data/${config.defaultLevel}/ui.json`)
        .then(res => {
            if (!res.ok) throw new Error(`Failed to fetch UI data: ${res.status}`);
            return res.json();
        })
        .catch(err => {
            console.error("Fatal: Could not load the global ui.json file.", err);
            // Return an empty object to prevent app crash if UI file is missing.
            return {};
        });

    // 2. Check if the level is a user-imported custom level stored in IndexedDB.
    const db = await dbPromise;
    const savedData = await db.get('levels', level);

    if (savedData) {
        // For custom levels, all data is loaded from IndexedDB.
        state.appData = savedData;
    } else {
        // For default levels, initialize with an empty object.
        // Tab-specific data will be loaded on demand by `loadTabData`.
        state.appData = {};
    }
    
    // 3. Assign the UI data to the state, ensuring it's always available.
    state.appData.ui = await uiPromise;
}