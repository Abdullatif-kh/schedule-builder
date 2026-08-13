// ===============================================
// SERVICE WORKER
// Keeps the toolbar badge in sync with the scrape, opens the site once the
// data is ready, and — most importantly — notices when the scrape dies.
//
// The runner holds a port open for as long as it is alive. If the university
// page navigates away or the tab closes, that port drops and we flip the state
// out of "running" instead of leaving the popup stuck at 0% forever.
// ===============================================

importScripts('shared.js');

function setBadge(text, color) {
    chrome.action.setBadgeText({ text: text });
    if (color) {
        chrome.action.setBadgeBackgroundColor({ color: color });
    }
}

// Reuse an already-open builder tab so a second scrape does not stack tabs.
// Re-navigating it also re-runs the bridge, which is how the newly merged data
// reaches the page.
// The builder needs the offered courses. Scraping only the registered page
// (which the student may do first) has nothing to show yet.
function openSiteIfUsable() {
    chrome.storage.local.get(SB_DATA_KEY, (stored) => {
        const data = stored[SB_DATA_KEY];
        if (data && Array.isArray(data.courses) && data.courses.length > 0) {
            openSite();
        }
    });
}

function openSite() {
    chrome.tabs.query({ url: SB_SITE_MATCH }, (tabs) => {
        const existing = tabs && tabs[0];

        if (existing) {
            chrome.tabs.update(existing.id, { url: SB_SITE_URL, active: true });
        } else {
            chrome.tabs.create({ url: SB_SITE_URL });
        }
    });
}

// ---------------------------------------------------------------
// Liveness tracking
// ---------------------------------------------------------------
let livePorts = 0;

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sb-scrape') return;

    livePorts++;
    let finishedCleanly = false;

    port.onMessage.addListener((message) => {
        if (message && message.type === 'SB_FINISHED') {
            finishedCleanly = true;
        }
    });

    port.onDisconnect.addListener(async () => {
        livePorts = Math.max(0, livePorts - 1);
        if (finishedCleanly || livePorts > 0) return;

        const stored = await chrome.storage.local.get([SB_STATE_KEY, SB_DATA_KEY]);
        const state = stored[SB_STATE_KEY];
        if (!state || state.status !== 'running') return;

        // The runner vanished without finishing: the page navigated, reloaded,
        // or the tab was closed.
        const saved = stored[SB_DATA_KEY];
        const savedCount = saved && Array.isArray(saved.courses) ? saved.courses.length : 0;

        const detail = savedCount > 0
            ? ` تم حفظ ${savedCount} شعبة قبل التوقف.`
            : '';

        await chrome.storage.local.set({
            [SB_STATE_KEY]: {
                status: 'error',
                done: savedCount,
                total: state.total || 0,
                message: `توقف السحب لأن الصفحة انتقلت أو أُعيد تحميلها.${detail} افتح صفحة المقررات المطروحة من جديد وأعد المحاولة.`,
                updatedAt: Date.now(),
                opened: false
            }
        });
    });
});

// Also cancel through the port, so a running scrape stops immediately instead
// of waiting for its next storage poll.
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
            }, openSiteIfUsable);
        }
        return;
    }

    setBadge('');
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ [SB_STATE_KEY]: SB_IDLE_STATE });
    setBadge('');
});

// A worker restart means any scrape that was running is no longer connected.
chrome.runtime.onStartup.addListener(async () => {
    const stored = await chrome.storage.local.get(SB_STATE_KEY);
    const state = stored[SB_STATE_KEY];

    if (state && state.status === 'running') {
        await chrome.storage.local.set({ [SB_STATE_KEY]: SB_IDLE_STATE });
        setBadge('');
    }
});
