/**
 * @module audio
 * @description Handles audio pronunciation playback with Jotoba audio and Web Speech API fallback.
 */

const JOTOBA_BASE = 'https://jotoba.de';

// Track currently playing audio to allow stopping
let currentAudio = null;

/**
 * Play audio from a URL (Jotoba audio files)
 * @param {string} audioPath - The audio path from Jotoba API (e.g., "/assets/audio/走る【はしる】.ogg")
 * @returns {Promise<boolean>} - Whether playback was successful
 */
export function playAudio(audioPath) {
    return new Promise((resolve) => {
        // Stop any currently playing audio
        stopCurrentAudio();

        const url = audioPath.startsWith('http') ? audioPath : `${JOTOBA_BASE}${audioPath}`;

        currentAudio = new Audio(url);

        currentAudio.onended = () => {
            currentAudio = null;
            resolve(true);
        };

        currentAudio.onerror = () => {
            console.warn('Audio playback failed:', url);
            currentAudio = null;
            resolve(false);
        };

        currentAudio.play().catch(() => {
            currentAudio = null;
            resolve(false);
        });
    });
}

/**
 * Stop currently playing audio
 */
export function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    // Also stop any speech synthesis
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

/**
 * Speak text using Web Speech API (fallback)
 * @param {string} text - Japanese text to speak
 * @param {number} rate - Speech rate (0.1 to 2, default 0.8 for learning)
 * @returns {Promise<boolean>} - Whether speech was successful
 */
export function speak(text, rate = 0.8) {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) {
            console.warn('Web Speech API not supported');
            resolve(false);
            return;
        }

        // Stop any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = rate;

        // Try to find a Japanese voice
        const voices = window.speechSynthesis.getVoices();
        const japaneseVoice = voices.find(v => v.lang.startsWith('ja'));
        if (japaneseVoice) {
            utterance.voice = japaneseVoice;
        }

        utterance.onend = () => resolve(true);
        utterance.onerror = () => resolve(false);

        window.speechSynthesis.speak(utterance);
    });
}

/**
 * Play pronunciation - tries Jotoba audio first, falls back to Web Speech
 * @param {string|null} audioPath - Jotoba audio path (can be null)
 * @param {string} text - Japanese text for fallback speech
 * @returns {Promise<boolean>} - Whether any playback was successful
 */
export async function playPronunciation(audioPath, text) {
    // Try Jotoba audio first if available and not empty
    if (audioPath && audioPath.trim() !== '') {
        const success = await playAudio(audioPath);
        if (success) return true;
    }

    // Fallback to Web Speech API
    return speak(text);
}

/**
 * Initialize voices (needed for some browsers)
 * Call this early in app initialization
 */
export function initVoices() {
    if (window.speechSynthesis) {
        // Some browsers need this to load voices
        window.speechSynthesis.getVoices();

        // Chrome loads voices async
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
                window.speechSynthesis.getVoices();
            };
        }
    }
}
