// ===============================================
// SITE BRIDGE
// Runs on the schedule builder site at document_start and hands the scraped
// data to the page. A content script shares the page's origin storage, so
// writing sessionStorage is all the site needs - it reads `courseData` from
// there exactly as it would after a manual file upload.
// ===============================================

(function () {
    const DATA_KEY = 'sb_data';
    const REGISTERED_KEY = 'sb_registered';

    chrome.storage.local.get([DATA_KEY, REGISTERED_KEY], (result) => {
        const data = result[DATA_KEY];
        if (!data || !Array.isArray(data.courses) || data.courses.length === 0) return;

        // The two scrapes are independent and can run in either order, so they
        // are stored apart and joined here.
        const registered = result[REGISTERED_KEY];
        const payload = Object.assign({}, data);

        if (registered && Array.isArray(registered.registeredSections)) {
            payload.registeredSections = registered.registeredSections;
        }

        try {
            sessionStorage.setItem('courseData', JSON.stringify(payload));
        } catch (error) {
            console.error('[مولد الجداول] تعذّر تمرير البيانات للصفحة:', error);
            return;
        }

        // The storage read is async, so the page may already be running. The
        // site listens for this event and picks the data up either way.
        window.dispatchEvent(new CustomEvent('sb:extension-data'));

        const registeredNote = payload.registeredSections
            ? ` (و${payload.registeredSections.length} شعبة مسجلة)`
            : '';
        console.log(`[مولد الجداول] تم تمرير ${data.courses.length} شعبة إلى الموقع${registeredNote}`);
    });
})();
