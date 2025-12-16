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
    // Fallback UI data (critical keys)
    const fallbackUI = {
        en: {
            dictionarySearch: "Dictionary Search",
            keyPoints: "Key Points",
            vocabulary: "Vocabulary",
            grammar: "Grammar",
            dashboard: "Dashboard",
            dashboardSubtitle: "Your learning progress",
            progressOverview: "Progress Overview",
            dictionarySubtitle: "Universal Dictionary", // Added missing key
            dictionaryNotice: "Select a category to start searching",
            searchPlaceholder: "Search for words...",
            progress: "Progress",
            levelNameLabel: "Level Name",
            levelNamePlaceholder: "e.g. N5",
            level: "Level", // Added missing key
            uploadLabel: "Upload Level File (.csv)",
            importButton: "Import",
            importLevel: "Import Level",
            footerText: "Made with ❤️ by",
            saveNotes: "Save Notes",
            notesPlaceholder: "Type your notes here / Gõ ghi chú của bạn ở đây...",
            modalExamples: "Examples",
            modalInfo: "Info",
            modalRadical: "Radical",
            modalMnemonic: "Mnemonic",
            noResults: "No results for",
            noResultsSubtitle: "Try checking your spelling or switching tabs.",
            searchErrorTitle: "Search failed",
            searchError: "Something went wrong while searching. Please try again.",
            retryButton: "Retry",
            vocabResults: "Vocabulary Results",
            kanjiResults: "Kanji Results",
            noDefinition: "No definition found.",
            onyomi: "On'yomi:",
            kunyomi: "Kun'yomi:",
            supportLabel: "Support",
            supportDeveloper: "Support the Developer",
            buyMeCoffee: "Buy me a coffee",
            momo: "Momo",
            vietqr: "VietQR",
            madeWithLove: "Made with ❤️ by",
            supportMessage: "If you find this handbook helpful, consider supporting its development!"
        },
        vi: {
            dictionarySearch: "Tra Từ Điển",
            keyPoints: "Điểm Chính",
            vocabulary: "Từ Vựng",
            grammar: "Ngữ Pháp",
            dashboard: "Bảng Điều Khiển",
            dashboardSubtitle: "Tiến độ học tập của bạn",
            progressOverview: "Tổng quan tiến độ",
            dictionarySubtitle: "Từ điển tổng hợp", // Added missing key
            dictionaryNotice: "Chọn một danh mục để bắt đầu tìm kiếm",
            searchPlaceholder: "Tìm kiếm từ vựng...",
            progress: "Tiến Độ",
            levelNameLabel: "Tên Cấp Độ",
            levelNamePlaceholder: "ví dụ: N5",
            level: "Cấp độ", // Added missing key
            uploadLabel: "Tải lên tệp cấp độ (.csv)",
            importButton: "Nhập",
            importLevel: "Nhập Cấp Độ",
            footerText: "Được làm bằng ❤️ bởi",
            saveNotes: "Lưu Ghi Chú",
            notesPlaceholder: "Gõ ghi chú của bạn ở đây...",
            modalExamples: "Ví dụ",
            modalInfo: "Thông tin",
            modalRadical: "Bộ thủ",
            modalMnemonic: "Gợi nhớ",
            noResults: "Không tìm thấy kết quả cho",
            noResultsSubtitle: "Hãy thử kiểm tra chính tả hoặc chuyển tab.",
            searchErrorTitle: "Tìm kiếm thất bại",
            searchError: "Đã xảy ra lỗi khi tìm kiếm. Vui lòng thử lại.",
            retryButton: "Thử lại",
            vocabResults: "Kết quả Từ Vựng",
            kanjiResults: "Kết quả Hán Tự",
            noDefinition: "Không tìm thấy định nghĩa.",
            onyomi: "Âm On:",
            kunyomi: "Âm Kun:",
            supportLabel: "Ủng hộ",
            supportDeveloper: "Ủng hộ nhà phát triển",
            buyMeCoffee: "Mua cho tôi ly cà phê",
            momo: "Momo",
            vietqr: "VietQR",
            madeWithLove: "Được làm bằng ❤️ bởi",
            supportMessage: "Nếu bạn thấy sổ tay này hữu ích, hãy cân nhắc ủng hộ nhé!"
        }
    };

    try {
        // Direct fetch from remote, skipping local check to avoid 404s
        let response = await fetch(`${config.dataPath}/ui.json`);

        let remoteUI = {};
        if (response.ok) {
            remoteUI = await response.json();
        } else {
            console.warn(`Failed to fetch UI data from remote source (${config.dataPath}/ui.json), using internal fallback.`);
        }

        // Merge fallback into remote (remote takes priority for existing keys)
        state.appData.ui = {
            en: { ...fallbackUI.en, ...(remoteUI.en || {}) },
            vi: { ...fallbackUI.vi, ...(remoteUI.vi || {}) }
        };

    } catch (error) {
        console.error("Fatal: Could not load the global ui.json file.", error);
        // Use full fallback
        state.appData.ui = fallbackUI;
    }
}


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
        // MODIFIED: Load and correctly parse the accordion state
        state.openAccordions = new Map(
            (currentLevelSettings?.openAccordions || []).map(([tabId, keys]) => [tabId, new Set(keys)])
        );

        state.progress = (await db.get('progress', state.currentLevel)) || { kanji: [], vocab: [] };
    } catch (error) {
        console.error("Error loading state from IndexedDB:", error);
        state.currentLang = 'en';
        state.currentLevel = config.defaultLevel;
        state.progress = { kanji: [], vocab: [] };
        state.openAccordions = new Map(); // Initialize as empty map on error
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

export async function updateLevelData(level, newData) {
    try {
        const db = await dbPromise;
        const existingData = await db.get('levels', level) || {};

        // A simple merge, you might want more sophisticated logic here
        const mergedData = { ...existingData, ...newData };

        await db.put('levels', mergedData, level);
    } catch (error) {
        console.error(`Error updating data for level ${level}:`, error);
    }
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