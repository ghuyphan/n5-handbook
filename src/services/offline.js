/**
 * @module offline
 * @description Manages offline data download and storage for JLPT levels
 */

import { state, config } from '../config.js';
import { dbPromise, loadTabData } from './database.js';

// Tabs to download for each level
const TABS_TO_DOWNLOAD = ['hiragana', 'katakana', 'kanji', 'vocab', 'grammar', 'keyPoints'];

// Download state
let downloadState = {
    isDownloading: false,
    abortController: null,
    currentLevel: '',
    totalLevels: 0,
    completedLevels: 0,
    currentTab: '',
    totalTabs: TABS_TO_DOWNLOAD.length,
    completedTabs: 0
};

/**
 * Get current download progress
 * @returns {object} Copy of current download state
 */
export function getDownloadProgress() {
    return { ...downloadState };
}

/**
 * Check if a download is in progress
 * @returns {boolean}
 */
export function isDownloading() {
    return downloadState.isDownloading;
}

/**
 * Cancel ongoing download
 */
export function cancelDownload() {
    if (downloadState.abortController) {
        downloadState.abortController.abort();
        downloadState.isDownloading = false;
    }
}

/**
 * Get list of available levels from the levels.json
 * @returns {Promise<string[]>}
 */
export async function getAvailableLevels() {
    try {
        const response = await fetch(`${config.dataPath}/levels.json`);
        if (response.ok) {
            const levels = await response.json();
            return levels.map(l => l.id || l);
        }
    } catch (e) {
        console.warn('Could not fetch levels list:', e);
    }
    return state.allAvailableLevels || ['n5'];
}

/**
 * Check which levels are available offline (stored in IndexedDB)
 * @returns {Promise<string[]>}
 */
export async function getOfflineLevels() {
    try {
        const db = await dbPromise;
        return await db.getAllKeys('levels');
    } catch (e) {
        console.warn('Could not get offline levels:', e);
        return [];
    }
}

/**
 * Download all data for specified levels
 * @param {string[]} levels - Levels to download
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<boolean>} True if completed, false if cancelled
 */
export async function downloadLevelsForOffline(levels, onProgress) {
    if (downloadState.isDownloading) {
        console.warn('Download already in progress');
        return false;
    }

    downloadState = {
        isDownloading: true,
        abortController: new AbortController(),
        currentLevel: '',
        totalLevels: levels.length,
        completedLevels: 0,
        currentTab: '',
        totalTabs: TABS_TO_DOWNLOAD.length,
        completedTabs: 0
    };

    const db = await dbPromise;

    try {
        for (const level of levels) {
            // Check for abort
            if (downloadState.abortController?.signal.aborted) {
                return false;
            }

            downloadState.currentLevel = level;
            downloadState.completedTabs = 0;
            onProgress?.(downloadState);

            const levelData = {};

            for (const tabId of TABS_TO_DOWNLOAD) {
                // Check for abort
                if (downloadState.abortController?.signal.aborted) {
                    return false;
                }

                downloadState.currentTab = tabId;
                onProgress?.(downloadState);

                try {
                    // Kana data is shared, others are level-specific
                    const isShared = ['hiragana', 'katakana'].includes(tabId);
                    const url = isShared
                        ? `${config.dataPath}/${tabId}.json`
                        : `${config.dataPath}/${level}/${tabId}.json`;

                    const response = await fetch(url, {
                        signal: downloadState.abortController?.signal
                    });

                    if (response.ok) {
                        levelData[tabId] = await response.json();
                        // Also store in memory for immediate use
                        state.appData[tabId] = levelData[tabId];
                    }
                } catch (e) {
                    if (e.name === 'AbortError') {
                        return false;
                    }
                    console.warn(`Failed to download ${tabId} for ${level}:`, e);
                }

                downloadState.completedTabs++;
                onProgress?.(downloadState);
            }

            // Store level data in IndexedDB for persistence
            await db.put('levels', levelData, level);

            downloadState.completedLevels++;
            onProgress?.(downloadState);
        }

        return true;
    } finally {
        downloadState.isDownloading = false;
        downloadState.abortController = null;
        onProgress?.(downloadState);
    }
}

/**
 * Check if device is online
 * @returns {boolean}
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Register online/offline event handlers
 * @param {Function} onOnline - Called when device comes online
 * @param {Function} onOffline - Called when device goes offline
 * @returns {Function} Cleanup function
 */
export function registerNetworkListeners(onOnline, onOffline) {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
    };
}
