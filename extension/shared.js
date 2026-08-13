// ===============================================
// SHARED CONSTANTS
// Loaded by the popup and the service worker
// ===============================================

const SB_STATE_KEY = 'sb_state';
const SB_DATA_KEY = 'sb_data';
const SB_REGISTERED_KEY = 'sb_registered';
const SB_CANCEL_KEY = 'sb_cancel';

const SB_SITE_URL = 'https://abdullatif-kh.github.io/schedule-builder/schedule-builder.html';
const SB_SITE_MATCH = 'https://abdullatif-kh.github.io/schedule-builder/*';

// The academic portal. After the offered courses are scraped the extension
// drives the same tab to the registered-courses view and scrapes that too.
const SB_PORTAL_ORIGIN = 'https://eduportal.iu.edu.sa';
const SB_REGISTERED_URL = SB_PORTAL_ORIGIN + '/iu/ui/student/student_schedule/index/studentScheduleIndex.faces';

// status: idle | running | done | error
// phase:  offered (المقررات المطروحة) | registered (المقررات المسجلة)
const SB_IDLE_STATE = {
    status: 'idle',
    phase: 'offered',
    done: 0,
    total: 0,
    message: '',
    updatedAt: 0,
    opened: false
};
