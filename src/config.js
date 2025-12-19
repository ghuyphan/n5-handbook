/**
 * @module config
 * @description Holds the application's static configuration and dynamic state.
 */

// Static configuration that doesn't change during runtime
export const config = {
    defaultLevel: 'n5',
    dataPath: 'https://raw.githubusercontent.com/ghuyphan/JLPT_Datas/main',
};

// Breakpoints for responsive design
export const BREAKPOINTS = {
    mobile: 768,
    tablet: 1024,
};

// Helper function for mobile detection
export const isMobile = () => window.innerWidth <= BREAKPOINTS.mobile;

// Dynamic state of the application, which will be modified during runtime
export const state = {
    appData: {},
    progress: { kanji: [], vocab: [] },
    currentLang: 'en',
    currentLevel: config.defaultLevel,
    allAvailableLevels: [config.defaultLevel],
    pinnedTab: null,
    isSwitchingLevel: false,
    loadingStatus: 'idle',
    activeTab: 'progress',
    notes: {
        /** @type {Map<string, string>} */
        data: new Map(),
        originalContent: ''
    },
    fuseInstances: {},
    universalFuse: null,
    currentQuery: '',
    lastDictionaryQuery: '',
    renderedTabs: new Map(),
    openAccordions: new Map(),
    externalDB: {
        vocab: [],
        kanji: [],
        vocabFuse: null,
        kanjiFuse: null,
    },
    // Web Worker for search
    searchWorker: null,
    // Map to store DOM elements by ID for quick lookup after worker search
    // Structure: { [tabId]: Map<itemId, HTMLElement> }
    domItemMap: {},
};