/**
 * @module utils
 * @description Provides utility functions for the application.
 */

// To this:
import * as wanakana from 'wanakana';

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

        if (wanakana.isKana(lowerText)) {
            termsSet.add(wanakana.toRomaji(lowerText));
        }
        if (wanakana.isRomaji(lowerText)) {
            termsSet.add(wanakana.toHiragana(lowerText));
            termsSet.add(wanakana.toKatakana(lowerText));
        }
    });
    return Array.from(termsSet).join(' ');
};