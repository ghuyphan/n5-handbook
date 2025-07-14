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

/**
 * **MODIFIED**: Loads data for a specific tab on-demand and shows a correctly styled loader.
 * @param {string} level - The current level (e.g., 'n5').
 * @param {string} tabId - The ID of the tab to load data for (e.g., 'hiragana').
 */
export async function loadTabData(level, tabId) {
    if (state.appData[tabId]) {
        return Promise.resolve();
    }

    const tabElement = document.getElementById(tabId);
    if (tabElement) {
        // **THE FIX**: Only show this inner loader if the main overlay is NOT visible.
        const mainOverlay = document.getElementById('loading-overlay');
        const isOverlayVisible = mainOverlay && !mainOverlay.classList.contains('hidden');

        if (!isOverlayVisible) {
            tabElement.innerHTML = `
                <div class="search-placeholder-wrapper" style="height: 50vh;">
                    <div class="search-placeholder-box" style="background: transparent; box-shadow: none; border: none;">
                        <div class="loader"></div>
                    </div>
                </div>`;
        }
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
        if (tabElement) {
            tabElement.innerHTML = `<p class="p-4 text-center text-red-400">Failed to load content.</p>`;
        }
        throw error;
    }
}

/**
 * **MODIFIED**: This function now only loads essential UI data and data for custom levels.
 * Data for remote/default levels is now handled by the setLevel function.
 * @param {string} level The level to load.
 */
export async function loadAllData(level) {
    const uiPromise = fetch(`./data/${config.defaultLevel}/ui.json`)
        .then(res => res.ok ? res.json() : {})
        .catch(err => {
            console.error("Fatal: Could not load the global ui.json file.", err);
            return {};
        });

    // If it's a custom level, load its data completely from IndexedDB.
    const db = await dbPromise;
    const savedData = await db.get('levels', level);
    if (savedData) {
        state.appData = savedData;
        state.appData.ui = await uiPromise;
        return;
    }

    // For default or remote levels, just initialize with the UI data.
    // The new logic in setLevel will handle fetching the individual tab data files.
    state.appData = { ui: await uiPromise };
}