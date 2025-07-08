/**
 * @module dom
 * @description Centralized object for all DOM element selections.
 */

export const els = {
    // Main layout
    sidebar: document.getElementById('sidebar'),
    overlay: document.getElementById('overlay'),
    mainContent: document.getElementById('main-content'),

    // Loading
    loadingOverlay: document.getElementById('loading-overlay'),

    // Header
    levelBadgeDesktop: document.getElementById('level-badge-desktop'),
    levelBadgeMobile: document.getElementById('level-badge-mobile'),
    mobileHeaderTitle: document.getElementById('mobile-header-title'),

    // Search
    searchInput: document.getElementById('search-input'),
    mobileSearchInput: document.getElementById('mobile-search-input'),
    mobileSearchBar: document.querySelector('.mobile-search-bar'),

    // Controls
    menuToggle: document.getElementById('menu-toggle'),
    pinToggle: document.getElementById('pin-toggle'),

    // Content containers
    progressOverview: document.getElementById('progress-overview'),
    progressTab: document.getElementById('progress'),
    hiraganaTab: document.getElementById('hiragana'),
    katakanaTab: document.getElementById('katakana'),
    kanjiTab: document.getElementById('kanji'),
    keyPointsTab: document.getElementById('key_points'),
    vocabTab: document.getElementById('vocab'),
    grammarContainer: document.getElementById('grammar-container'),
    grammarTab: document.getElementById('grammar'),


    // Sidebar Controls
    sidebarControls: document.getElementById('sidebar-controls'),
    closeSidebarBtn: document.getElementById('close-sidebar-btn'),

    // Import Modal
    importModal: document.getElementById('import-modal'),
    importModalBackdrop: document.getElementById('import-modal-backdrop'),
    modalWrapper: document.querySelector('#import-modal .modal-wrapper'),
    openModalBtn: document.getElementById('sidebar-import-btn'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    levelNameInput: document.getElementById('level-name-input'),
    levelNameError: document.getElementById('level-name-error'),
    fileImportArea: document.getElementById('file-import-area'),
    fileInput: document.getElementById('file-input'),
    importBtn: document.getElementById('import-btn'),

    // Kanji Modal
    kanjiDetailModal: document.getElementById('kanji-detail-modal'),
    kanjiModalBackdrop: document.querySelector('#kanji-detail-modal #modal-backdrop'),
    kanjiModalContentContainer: document.querySelector('#kanji-detail-modal #modal-content-container'),
};