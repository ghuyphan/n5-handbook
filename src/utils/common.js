/**
 * @module utils
 * @description Provides utility functions for the application.
 */

import { isKana, isRomaji, toRomaji, toHiragana, toKatakana } from 'wanakana';
import { state } from '../config.js';

/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to delay.
 * @returns {Function} The new debounced function.
 */
export const debounce = (func, wait) => {
    let timeout;
    const debounced = (...args) => {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
    debounced.cancel = () => clearTimeout(timeout);
    return debounced;
};

/**
 * Generates a focused string of search terms from an array of texts.
 * @param {string[]} texts - An array of strings to process.
 * @returns {string} A space-separated string of search terms.
 */
export const generateSearchTerms = (texts = []) => {
    const termsSet = new Set();
    texts.filter(Boolean).forEach(text => {
        const lowerText = String(text).toLowerCase();
        termsSet.add(lowerText);

        if (isKana(lowerText)) {
            termsSet.add(toRomaji(lowerText));
        }
        if (isRomaji(lowerText)) {
            termsSet.add(toHiragana(lowerText));
            termsSet.add(toKatakana(lowerText));
        }
    });
    return Array.from(termsSet).join(' ');
};

/**
 * Retrieves a UI string for the current language, with fallbacks.
 * @param {string} key - The key of the UI string.
 * @param {object} [replacements={}] - An object of placeholder values.
 * @returns {string} The localized and formatted UI string.
 */
export const getUIText = (key, replacements = {}) => {
    let text = state.appData.ui?.[state.currentLang]?.[key] || state.appData.ui?.['en']?.[key] || `[${key}]`;
    // Specific fallback for a commonly used key
    if (key === 'lastSavedOn' && !state.appData.ui?.[state.currentLang]?.[key]) {
        text = `Last saved: {date}`;
    }
    for (const [placeholder, value] of Object.entries(replacements)) {
        text = text.replace(`{${placeholder}}`, value);
    }
    return text;
};