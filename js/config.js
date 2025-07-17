/**
 * @module config
 * @description Holds the application's static configuration and dynamic state.
 */

// Static configuration that doesn't change during runtime
export const config = {
    defaultLevel: 'n5',
    dataPath: 'https://raw.githubusercontent.com/ghuyphan/JLPT_Datas/main',
};

// Dynamic state of the application, which will be modified during runtime
export const state = {
    appData: {},
    progress: { kanji: [], vocab: [] },
    currentLang: 'en',
    currentLevel: config.defaultLevel,
    allAvailableLevels: [config.defaultLevel],
    pinnedTab: null,
    levelSettings: {}, // ADDED: To hold all level-specific settings
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
    tabScrollPositions: new Map(),
    renderedTabs: new Map(),
    openAccordions: new Map(),
    externalDB: {
        vocab: [],
        kanji: [],
        vocabFuse: null,
        kanjiFuse: null,
    },
};