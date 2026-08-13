// ===============================================
// SERVICE WORKER
// Owns everything that has to outlive the page:
//   - the toolbar badge
//   - noticing when a scrape dies with its tab
//   - driving the tab to the registered-courses page and scraping it
//
// The second phase lives here because a content script cannot survive the
// navigation that takes the student from one page to the other.
// ===============================================

importScripts('shared.js');

const RUNNER_FILES = ['scraper-core.js', 'scraper-runner.js'];
const LOAD_TIMEOUT_MS = 30000;
const EXTRACT_ATTEMPTS = 3;
const EXTRACT_RETRY_MS = 800;

let livePorts = 0;
let lastScrapeTabId = null;
let registeredPhaseActive = false;

// ---------------------------------------------------------------
// Badge
// ---------------------------------------------------------------
function setBadge(text, color) {
    chrome.action.setBadgeText({ text: text });
    if (color) {
        chrome.action.setBadgeBackgroundColor({ color: color });
    }
}

function updateBadge(state) {
    if (state.status === 'running') {
        const percent = state.total > 0 ? Math.floor((state.done / state.total) * 100) : 0;
        setBadge(`${percent}%`, '#3b82f6');
    } else if (state.status === 'error') {
        setBadge('!', '#ef4444');
    } else if (state.status === 'done') {
        setBadge('✓', '#10b981');
    } else {
        setBadge('');
    }
}

// ---------------------------------------------------------------
// Opening the builder
// ---------------------------------------------------------------

// Reuse an already-open builder tab so a second scrape does not stack tabs.
// Re-navigating it also re-runs the bridge, which is how newly merged data
// reaches the page.
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

// The builder needs the offered courses. Scraping only the registered page
// has nothing to show yet.
function openSiteIfUsable() {
    chrome.storage.local.get(SB_DATA_KEY, (stored) => {
        const data = stored[SB_DATA_KEY];
        if (data && Array.isArray(data.courses) && data.courses.length > 0) {
            openSite();
        }
    });
}

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
function writeState(state) {
    return chrome.storage.local.set({
        [SB_STATE_KEY]: Object.assign(
            { updatedAt: Date.now(), opened: false, phase: 'offered', done: 0, total: 0, message: '' },
            state
        )
    });
}

// ---------------------------------------------------------------
// Liveness: the port drops when the scraped page unloads
// ---------------------------------------------------------------
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sb-scrape') return;

    livePorts++;
    let finishedCleanly = false;

    // How the worker learns which tab to drive for the second phase
    if (port.sender && port.sender.tab) {
        lastScrapeTabId = port.sender.tab.id;
    }

    port.onMessage.addListener((message) => {
        if (message && message.type === 'SB_FINISHED') {
            finishedCleanly = true;
        }
    });

    port.onDisconnect.addListener(async () => {
        livePorts = Math.max(0, livePorts - 1);
        if (finishedCleanly || livePorts > 0 || registeredPhaseActive) return;

        const stored = await chrome.storage.local.get([SB_STATE_KEY, SB_DATA_KEY]);
        const state = stored[SB_STATE_KEY];
        if (!state || state.status !== 'running') return;

        const saved = stored[SB_DATA_KEY];
        const savedCount = saved && Array.isArray(saved.courses) ? saved.courses.length : 0;
        const detail = savedCount > 0 ? ` تم حفظ ${savedCount} شعبة قبل التوقف.` : '';

        await writeState({
            status: 'error',
            phase: state.phase,
            done: savedCount,
            total: state.total || 0,
            message: `توقف السحب لأن الصفحة انتقلت أو أُعيد تحميلها.${detail} افتح صفحة المقررات المطروحة من جديد وأعد المحاولة.`
        });
    });
});

// ---------------------------------------------------------------
// Phase two: the registered courses, on the other side of a navigation
// ---------------------------------------------------------------
function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        let settled = false;

        const finish = (ok) => {
            if (settled) return;
            settled = true;
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timer);
            resolve(ok);
        };

        const listener = (id, info) => {
            if (id === tabId && info.status === 'complete') finish(true);
        };

        chrome.tabs.onUpdated.addListener(listener);
        const timer = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
    });
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callInPage(tabId, func) {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func });
    return result ? result.result : null;
}

// Inject and extract, retrying while the view finishes rendering
async function scrapeRegisteredOn(tabId) {
    for (let attempt = 0; attempt < EXTRACT_ATTEMPTS; attempt++) {
        if (attempt > 0) await delay(EXTRACT_RETRY_MS);

        await chrome.scripting.executeScript({ target: { tabId }, files: RUNNER_FILES });
        const count = await callInPage(tabId, () => globalThis.__sbScrapeRegistered());

        if (count > 0) return count;
    }

    return 0;
}

// Only drive the tab when it is actually sitting on the portal
async function canAutoRegister() {
    if (lastScrapeTabId === null) return false;

    try {
        const tab = await chrome.tabs.get(lastScrapeTabId);
        return Boolean(tab && tab.url && tab.url.startsWith(SB_PORTAL_ORIGIN));
    } catch (error) {
        return false; // tab closed
    }
}

async function finishWithoutRegistered(message) {
    await writeState({
        status: 'done',
        phase: 'offered',
        message: message,
        opened: true
    });
    openSiteIfUsable();
}

async function runRegisteredPhase(offeredState) {
    const tabId = lastScrapeTabId;
    registeredPhaseActive = true;

    try {
        await writeState({
            status: 'running',
            phase: 'registered',
            message: 'جارٍ فتح صفحة المقررات المسجلة...'
        });

        // Start listening before navigating so the event cannot be missed
        let loaded = waitForTabLoad(tabId);
        await chrome.tabs.update(tabId, { url: SB_REGISTERED_URL });
        await loaded;

        let count = await scrapeRegisteredOn(tabId);

        // A direct visit does not always render the view; fall back to the
        // portal's own menu link, which definitely does.
        if (count === 0) {
            await writeState({
                status: 'running',
                phase: 'registered',
                message: 'جارٍ فتح الصفحة من قائمة البوابة...'
            });

            await chrome.scripting.executeScript({ target: { tabId }, files: RUNNER_FILES });

            // Listen before clicking: the load can complete before the click
            // call even returns.
            loaded = waitForTabLoad(tabId);
            const clicked = await callInPage(tabId, () => globalThis.__sbClickRegisteredLink());

            if (clicked) {
                await loaded;
                await delay(EXTRACT_RETRY_MS);
                count = await scrapeRegisteredOn(tabId);
            }
        }

        if (count === 0) {
            await finishWithoutRegistered(
                `${offeredState.message} — تعذّر جلب الشعب المسجلة تلقائياً، افتح صفحة المقررات المسجلة واضغط الزر`
            );
        }
        // On success the runner has already written its own done state
    } catch (error) {
        console.error('[مولد الجداول] فشلت مرحلة المقررات المسجلة:', error);
        await finishWithoutRegistered(
            `${offeredState.message} — تعذّر جلب الشعب المسجلة تلقائياً، افتح صفحة المقررات المسجلة واضغط الزر`
        );
    } finally {
        registeredPhaseActive = false;
    }
}

// ---------------------------------------------------------------
// Reacting to a finished scrape
// ---------------------------------------------------------------
async function handleDone(state) {
    // Claim this completion first, so nothing runs twice
    await chrome.storage.local.set({
        [SB_STATE_KEY]: Object.assign({}, state, { opened: true })
    });

    if (state.phase === 'offered' && await canAutoRegister()) {
        runRegisteredPhase(state);
        return;
    }

    openSiteIfUsable();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[SB_STATE_KEY]) return;

    const state = changes[SB_STATE_KEY].newValue;
    if (!state) return;

    updateBadge(state);

    if (state.status === 'done' && !state.opened) {
        handleDone(state);
    }
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
