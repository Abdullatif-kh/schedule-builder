// ===============================================
// POPUP
// Injects the scraper into the active tab and mirrors the stored state.
// The scrape itself lives in the page, so closing the popup never stops it.
// ===============================================

// A running scrape writes progress at least every few seconds. Going quiet for
// longer than this means the page died in a way the service worker missed.
const STALE_AFTER_MS = 30000;

const ui = {
    hint: document.getElementById('hint'),
    speed: document.getElementById('speed'),
    progress: document.getElementById('progress'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    status: document.getElementById('status'),
    startBtn: document.getElementById('startBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    openBtn: document.getElementById('openBtn'),
    inspectBtn: document.getElementById('inspectBtn'),
    clearBtn: document.getElementById('clearBtn'),
    report: document.getElementById('report'),
    reportText: document.getElementById('reportText'),
    copyReportBtn: document.getElementById('copyReportBtn')
};

let staleTimer = null;

function showStatus(message, variant) {
    ui.status.textContent = message;
    ui.status.className = variant ? `status is-${variant}` : 'status';
    ui.status.hidden = !message;
}

async function getStoredData() {
    const stored = await chrome.storage.local.get(SB_DATA_KEY);
    const data = stored[SB_DATA_KEY];
    return (data && Array.isArray(data.courses) && data.courses.length > 0) ? data : null;
}

function isStale(state) {
    return state.status === 'running'
        && state.updatedAt > 0
        && (Date.now() - state.updatedAt) > STALE_AFTER_MS;
}

// Put the UI back in a usable state after an interrupted scrape.
async function resetState(message) {
    await chrome.storage.local.set({
        [SB_CANCEL_KEY]: false,
        [SB_STATE_KEY]: Object.assign({}, SB_IDLE_STATE, {
            message: message || '',
            updatedAt: Date.now()
        })
    });
    chrome.action.setBadgeText({ text: '' });
}

async function render(state) {
    const current = state || SB_IDLE_STATE;

    if (isStale(current)) {
        await resetState('توقفت العملية السابقة (على الأرجح انتقلت الصفحة). أعد المحاولة.');
        return;
    }

    const isRunning = current.status === 'running';
    const data = await getStoredData();

    ui.startBtn.disabled = isRunning;
    ui.startBtn.textContent = isRunning ? 'جارٍ السحب...' : 'ابدأ السحب';
    ui.speed.disabled = isRunning;
    ui.cancelBtn.hidden = !isRunning;
    ui.inspectBtn.hidden = isRunning;
    ui.openBtn.hidden = !data;
    ui.clearBtn.hidden = !data;
    ui.hint.hidden = isRunning;

    if (data) {
        ui.openBtn.textContent = data.partial
            ? `افتح الموقع بـ ${data.courses.length} شعبة (غير مكتملة)`
            : 'افتح الموقع بالبيانات';
    }

    // Re-check for a stall while the popup stays open
    clearTimeout(staleTimer);
    if (isRunning) {
        staleTimer = setTimeout(async () => {
            const stored = await chrome.storage.local.get(SB_STATE_KEY);
            render(stored[SB_STATE_KEY]);
        }, 5000);
    }

    ui.progress.hidden = !isRunning;
    if (isRunning) {
        const percent = current.total > 0
            ? Math.floor((current.done / current.total) * 100)
            : 0;
        ui.progressFill.style.width = `${percent}%`;
        ui.progressText.textContent = current.total > 0
            ? `${current.done} من ${current.total} شعبة (${percent}%) — ${current.message}`
            : current.message;
        showStatus('', null);
        return;
    }

    if (current.status === 'error') {
        showStatus(current.message, 'error');
    } else if (current.status === 'done') {
        showStatus(`${current.message} — البيانات جاهزة للموقع`, 'done');
    } else if (current.message) {
        showStatus(current.message, null);
    } else if (data) {
        showStatus(`توجد بيانات محفوظة (${data.courses.length} شعبة)`, null);
    } else {
        showStatus('', null);
    }
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// Both buttons need the scraper present in the page first.
async function injectScraper(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['scraper-core.js', 'scraper-runner.js']
    });
}

async function startScrape() {
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
        showStatus('تعذّر الوصول إلى التبويب الحالي', 'error');
        return;
    }

    const speed = ui.speed.value;
    ui.report.hidden = true;

    try {
        // activeTab grants access to this tab because the user clicked the
        // button, so no permanent permission on the university site is needed.
        await injectScraper(tab.id);

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (selectedSpeed) => globalThis.__sbStartScrape(selectedSpeed),
            args: [speed]
        });

        await render({ status: 'running', done: 0, total: 0, message: 'جارٍ البدء...', updatedAt: Date.now() });
    } catch (error) {
        console.error(error);
        showStatus(`تعذّر تشغيل السحب في هذه الصفحة: ${error.message}`, 'error');
    }
}

async function inspectPage() {
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
        showStatus('تعذّر الوصول إلى التبويب الحالي', 'error');
        return;
    }

    try {
        await injectScraper(tab.id);

        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => globalThis.__sbInspectPage()
        });

        ui.reportText.value = JSON.stringify(result.result, null, 2);
        ui.report.hidden = false;
        showStatus('تقرير الفحص جاهز — انسخه وأرسله إذا لم يعمل السحب', null);
    } catch (error) {
        console.error(error);
        showStatus(`تعذّر فحص الصفحة: ${error.message}`, 'error');
    }
}

ui.startBtn.addEventListener('click', startScrape);
ui.inspectBtn.addEventListener('click', inspectPage);

ui.cancelBtn.addEventListener('click', async () => {
    showStatus('جارٍ الإيقاف...', null);

    // Ask the runner to stop, then release the UI regardless. If the page
    // already died there is nobody left to answer, and the popup must not stay
    // stuck on "running" waiting for it.
    await chrome.storage.local.set({ [SB_CANCEL_KEY]: true });

    setTimeout(async () => {
        const stored = await chrome.storage.local.get(SB_STATE_KEY);
        const state = stored[SB_STATE_KEY];

        if (state && state.status === 'running') {
            await resetState('تم إيقاف السحب');
        }
    }, 2000);
});

ui.openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: SB_SITE_URL });
    window.close();
});

ui.copyReportBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(ui.reportText.value);
        showStatus('تم نسخ التقرير', 'done');
    } catch (error) {
        ui.reportText.select();
        showStatus('حدّد النص وانسخه يدوياً', null);
    }
});

ui.clearBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(SB_DATA_KEY);
    await resetState('');
    await render(SB_IDLE_STATE);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes[SB_STATE_KEY]) {
        render(changes[SB_STATE_KEY].newValue);
    } else if (changes[SB_DATA_KEY]) {
        chrome.storage.local.get(SB_STATE_KEY).then(stored => render(stored[SB_STATE_KEY]));
    }
});

chrome.storage.local.get(SB_STATE_KEY).then(stored => render(stored[SB_STATE_KEY]));
