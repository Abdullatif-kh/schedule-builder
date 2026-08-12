// ===============================================
// SERVICE WORKER
// Keeps the toolbar badge in sync with the scrape and opens the site once the
// data is ready. Storage changes wake the worker, so nothing is missed while
// it is asleep.
// ===============================================

importScripts('shared.js');

function setBadge(text, color) {
    chrome.action.setBadgeText({ text: text });
    if (color) {
        chrome.action.setBadgeBackgroundColor({ color: color });
    }
}

function openSite() {
    chrome.tabs.create({ url: SB_SITE_URL });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[SB_STATE_KEY]) return;

    const state = changes[SB_STATE_KEY].newValue;
    if (!state) return;

    if (state.status === 'running') {
        const percent = state.total > 0
            ? Math.floor((state.done / state.total) * 100)
            : 0;
        setBadge(`${percent}%`, '#3b82f6');
        return;
    }

    if (state.status === 'error') {
        setBadge('!', '#ef4444');
        return;
    }

    if (state.status === 'done') {
        setBadge('✓', '#10b981');

        // Open the site once per completed scrape. `opened` guards against the
        // write below re-triggering this listener.
        if (!state.opened) {
            chrome.storage.local.set({
                [SB_STATE_KEY]: Object.assign({}, state, { opened: true })
            }, openSite);
        }
        return;
    }

    setBadge('');
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ [SB_STATE_KEY]: SB_IDLE_STATE });
    setBadge('');
});
