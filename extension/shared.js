// ===============================================
// SHARED CONSTANTS
// Loaded by the popup and the service worker
// ===============================================

const SB_STATE_KEY = 'sb_state';
const SB_DATA_KEY = 'sb_data';
const SB_CANCEL_KEY = 'sb_cancel';

const SB_SITE_URL = 'https://abdullatif-kh.github.io/schedule-builder/schedule-builder.html';

// status: idle | running | done | error
const SB_IDLE_STATE = {
    status: 'idle',
    done: 0,
    total: 0,
    message: '',
    updatedAt: 0,
    opened: false
};
