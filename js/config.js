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
    fuseInstances: {},
    universalFuse: null,
    currentQuery: '',
    tabScrollPositions: new Map(),
    externalDB: {
        vocab: [],
        kanji: [],
        vocabFuse: null,
        kanjiFuse: null,
    },
};