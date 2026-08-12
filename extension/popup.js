// ===============================================
// POPUP
// Injects the scraper into the active tab and mirrors the stored state.
// The scrape itself lives in the page, so closing the popup never stops it.
// ===============================================

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
    clearBtn: document.getElementById('clearBtn')
};

function showStatus(message, variant) {
    ui.status.textContent = message;
    ui.status.className = variant ? `status is-${variant}` : 'status';
    ui.status.hidden = !message;
}

async function hasStoredData() {
    const stored = await chrome.storage.local.get(SB_DATA_KEY);
    const data = stored[SB_DATA_KEY];
    return Boolean(data && Array.isArray(data.courses) && data.courses.length > 0);
}

async function render(state) {
    const current = state || SB_IDLE_STATE;
    const isRunning = current.status === 'running';
    const dataAvailable = await hasStoredData();

    ui.startBtn.disabled = isRunning;
    ui.startBtn.textContent = isRunning ? 'جارٍ السحب...' : 'ابدأ السحب';
    ui.speed.disabled = isRunning;
    ui.cancelBtn.hidden = !isRunning;
    ui.openBtn.hidden = !dataAvailable;
    ui.clearBtn.hidden = !dataAvailable;
    ui.hint.hidden = isRunning;

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
    } else if (dataAvailable) {
        showStatus('توجد بيانات محفوظة من عملية سابقة', null);
    } else {
        showStatus('', null);
    }
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function startScrape() {
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
        showStatus('تعذّر الوصول إلى التبويب الحالي', 'error');
        return;
    }

    const speed = ui.speed.value;

    try {
        // activeTab grants access to this tab because the user clicked the
        // button, so no permanent permission on the university site is needed.
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['scraper-core.js', 'scraper-runner.js']
        });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (selectedSpeed) => globalThis.__sbStartScrape(selectedSpeed),
            args: [speed]
        });

        await render({ status: 'running', done: 0, total: 0, message: 'جارٍ البدء...' });
    } catch (error) {
        console.error(error);
        showStatus(`تعذّر تشغيل السحب في هذه الصفحة: ${error.message}`, 'error');
    }
}

ui.startBtn.addEventListener('click', startScrape);

ui.cancelBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ [SB_CANCEL_KEY]: true });
    showStatus('جارٍ الإيقاف...', null);
});

ui.openBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: SB_SITE_URL });
    window.close();
});

ui.clearBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(SB_DATA_KEY);
    await chrome.storage.local.set({ [SB_STATE_KEY]: SB_IDLE_STATE });
    chrome.action.setBadgeText({ text: '' });
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
