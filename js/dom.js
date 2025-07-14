/**
 * @module dom
 * @description Centralized object for all DOM element selections.
 */

// Export an object that will be populated later.
export const els = {};

/**
 * Populates the `els` object with all necessary DOM element references.
 * This should be called after the DOM is fully loaded.
 */
export function populateEls() {
    // Main layout
    els.sidebar = document.getElementById('sidebar');
    els.overlay = document.getElementById('overlay');
    els.mainContent = document.getElementById('main-content');

    // Loading
    els.loadingOverlay = document.getElementById('loading-overlay');

    // Header
    els.levelBadgeDesktop = document.getElementById('level-badge-desktop');
    els.levelBadgeMobile = document.getElementById('level-badge-mobile');
    els.mobileHeaderTitle = document.getElementById('mobile-header-title');

    // Search
    els.searchInput = document.getElementById('search-input');
    els.mobileSearchInput = document.getElementById('mobile-search-input');
    els.mobileSearchBar = document.querySelector('.mobile-search-bar');

    // Controls
    els.menuToggle = document.getElementById('menu-toggle');
    els.pinToggle = document.getElementById('pin-toggle');

    // Content containers
    els.progressOverview = document.getElementById('progress-overview');
    els.progressTab = document.getElementById('progress');
    els.hiraganaTab = document.getElementById('hiragana');
    els.katakanaTab = document.getElementById('katakana');
    els.kanjiTab = document.getElementById('kanji');
    els.keyPointsTab = document.getElementById('keyPoints');
    els.vocabTab = document.getElementById('vocab');
    els.grammarContainer = document.getElementById('grammar-container');
    els.grammarTab = document.getElementById('grammar');
    els.externalSearchTab = document.getElementById('external-search');

    // Sidebar Controls
    els.sidebarControls = document.getElementById('sidebar-controls');
    els.closeSidebarBtn = document.getElementById('close-sidebar-btn');

    // Import Modal
    els.importModal = document.getElementById('import-modal');
    els.importModalBackdrop = document.getElementById('import-modal-backdrop');
    els.modalWrapper = document.querySelector('#import-modal .modal-wrapper');
    els.openModalBtn = document.getElementById('sidebar-import-btn');
    els.closeModalBtn = document.getElementById('close-modal-btn');
    els.levelNameInput = document.getElementById('level-name-input');
    els.levelNameError = document.getElementById('level-name-error');
    els.fileImportArea = document.getElementById('file-import-area');
    els.fileInput = document.getElementById('file-input');
    els.importBtn = document.getElementById('import-btn');

    // Notes Modal
    els.desktopNotesBtn = document.getElementById('desktop-notes-btn');
    els.mobileNotesBtn = document.getElementById('mobile-notes-btn');
    els.notesModal = document.getElementById('notes-modal');
    els.notesModalBackdrop = document.getElementById('notes-modal-backdrop');
    els.notesModalWrapper = document.querySelector('#notes-modal .modal-wrapper');
    els.notesModalTitle = document.getElementById('notes-modal-title');
    els.closeNotesModalBtn = document.getElementById('close-notes-modal-btn');
    els.notesTextarea = document.getElementById('notes-textarea');
    els.notesSaveBtn = document.getElementById('notes-save-btn');
    els.notesStatus = document.getElementById('notes-status');

    // Kanji Modal
    els.kanjiDetailModal = document.getElementById('kanji-detail-modal');
    els.kanjiModalBackdrop = document.querySelector('#kanji-detail-modal #modal-backdrop');
    els.kanjiModalContentContainer = document.querySelector('#kanji-detail-modal #modal-content-container');
}