/**
 * @module database
 * @description Manages all IndexedDB operations for state and data persistence.
 */

import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@8/+esm';
import { state, config } from './config.js';
import { updateProgressDashboard } from './ui.js';

export const dbPromise = openDB('HandbookDB', 2, {
    upgrade(db, oldVersion) {
        if (oldVersion < 1) {
            db.createObjectStore('levels');
            db.createObjectStore('progress');
            db.createObjectStore('settings');
        }
        if (oldVersion < 2) {
            db.createObjectStore('dictionary_cache');
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