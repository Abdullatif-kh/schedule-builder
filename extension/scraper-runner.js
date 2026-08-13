// ===============================================
// SCRAPER RUNNER
// Injected into the university page right after scraper-core.js.
// Drives the scrape, reports progress, and stores the result.
//
// Progress and results go straight into chrome.storage.local so the work
// survives the popup being closed or the service worker going to sleep.
//
// The academic portal is a JSF app: some row links are real navigations, and
// following one destroys this script mid-scrape. Three defences:
//   1. default navigation is suppressed while scraping,
//   2. results are saved as they are collected, never only at the end,
//   3. a port to the service worker dies with the page, which is how the UI
//      learns the scrape stopped instead of sitting at 0% forever.
// ===============================================

(function () {
    // Injected again when the button is pressed twice: keep the first copy.
    if (globalThis.__sbRunnerReady) return;
    globalThis.__sbRunnerReady = true;

    const STATE_KEY = 'sb_state';
    const DATA_KEY = 'sb_data';
    const CANCEL_KEY = 'sb_cancel';

    // Storage writes are throttled so a 300-section scrape does not spam it
    const PROGRESS_INTERVAL_MS = 400;

    let running = false;
    let cancelRequested = false;
    let livePort = null;
    let blockedNavigations = [];

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function setState(state) {
        return chrome.storage.local.set({
            [STATE_KEY]: Object.assign({ updatedAt: Date.now(), opened: false }, state)
        });
    }

    async function isCancelled() {
        if (cancelRequested) return true;
        const result = await chrome.storage.local.get(CANCEL_KEY);
        return result[CANCEL_KEY] === true;
    }

    // ---------------------------------------------------------------
    // Liveness: the port drops when this page unloads, and the service
    // worker turns that into a visible "the scrape stopped" state.
    // ---------------------------------------------------------------
    function openLifelinePort() {
        try {
            livePort = chrome.runtime.connect({ name: 'sb-scrape' });
            livePort.onMessage.addListener((message) => {
                if (message && message.type === 'SB_CANCEL') {
                    cancelRequested = true;
                }
            });
        } catch (error) {
            console.warn('[مولد الجداول] تعذّر فتح قناة المراقبة:', error);
        }
    }

    function closeLifelinePort() {
        if (!livePort) return;
        try {
            livePort.postMessage({ type: 'SB_FINISHED' });
            livePort.disconnect();
        } catch (error) {
            // Already gone; nothing to do
        }
        livePort = null;
    }

    // ---------------------------------------------------------------
    // Navigation guard
    // Clicking a details link must open the modal, not leave the page.
    // preventDefault stops the browser from following the link while the
    // page's own click handlers still run, so the modal still opens.
    // ---------------------------------------------------------------
    function onCaptureClick(event) {
        if (!running) return;

        const link = event.target && event.target.closest
            ? event.target.closest('a[href]')
            : null;

        if (link) {
            const href = link.getAttribute('href') || '';
            if (href && href !== '#' && !href.startsWith('javascript:')) {
                blockedNavigations.push(href.slice(0, 120));
            }
        }

        event.preventDefault();
    }

    function installNavigationGuard() {
        document.addEventListener('click', onCaptureClick, true);
    }

    function removeNavigationGuard() {
        document.removeEventListener('click', onCaptureClick, true);
    }

    function buildOutput(scraper, courses, partial) {
        return {
            courses: courses,
            dayMapping: scraper.dayMapping,
            summary: {
                totalSessions: courses.reduce((sum, course) => sum + course.schedule.sessions.length, 0),
                sectionsWithSchedule: courses.filter(c => c.schedule.sessions.length > 0).length,
                sectionsByStatus: courses.reduce((acc, course) => {
                    acc[course.status] = (acc[course.status] || 0) + 1;
                    return acc;
                }, {})
            },
            generatedBy: 'chrome-extension',
            generatedAt: new Date().toISOString(),
            partial: Boolean(partial)
        };
    }

    function toCourseRecord(courseData, scheduleInfo, index) {
        return {
            index: index,
            code: courseData.code,
            name: courseData.name,
            sectionId: courseData.sectionId,
            type: courseData.type,
            creditHours: courseData.creditHours,
            status: courseData.status,
            instructor: scheduleInfo.instructor,
            schedule: {
                sessions: scheduleInfo.sessions
            }
        };
    }

    // Sections keep their page order in the output, so the site can still pair
    // a theoretical section with the practical one that follows it.
    function sortByPageOrder(courses) {
        return courses.slice().sort((a, b) => a.index - b.index);
    }

    async function runScrape() {
        if (running) return;
        running = true;
        cancelRequested = false;
        blockedNavigations = [];

        const scraper = new globalThis.UniversityCoursesScraper();
        const collected = [];
        let total = 0;

        // Saves whatever has been collected so far, so an interrupted scrape
        // still leaves usable data behind.
        async function persist(partial) {
            if (collected.length === 0) return;
            await chrome.storage.local.set({
                [DATA_KEY]: buildOutput(scraper, sortByPageOrder(collected), partial)
            });
        }

        try {
            await chrome.storage.local.set({ [CANCEL_KEY]: false });
            openLifelinePort();
            installNavigationGuard();

            scraper.enableTurboMode();

            await setState({ status: 'running', done: 0, total: 0, message: 'جارٍ قراءة جدول المواد...' });

            const basicCourses = scraper.extractBasicData();

            if (basicCourses.length === 0) {
                await setState({
                    status: 'error',
                    done: 0,
                    total: 0,
                    message: 'لم يتم العثور على جدول المواد. افتح صفحة "المقررات المطروحة وفق الخطة" ثم أعد المحاولة.'
                });
                return;
            }

            // The first parsed row is not a normal section: clicking its
            // details control makes the portal navigate to the home page,
            // which kills the scrape. This is the same row the console script
            // skips ("تجاوز المادة الأولى"). Counting it would also inflate
            // the total by one and make a completed scrape look failed.
            const order = basicCourses.map((_, i) => i).slice(1);

            if (order.length === 0) {
                await setState({
                    status: 'error',
                    done: 0,
                    total: 0,
                    message: 'لم يتم العثور على شعب قابلة للسحب في هذه الصفحة'
                });
                return;
            }

            total = order.length;

            let lastProgressAt = 0;

            for (let position = 0; position < order.length; position++) {
                if (await isCancelled()) {
                    await persist(true);
                    await setState({
                        status: 'idle',
                        done: collected.length,
                        total: total,
                        message: `تم إيقاف السحب بعد ${collected.length} شعبة`
                    });
                    return;
                }

                const sourceIndex = order[position];
                const courseData = basicCourses[sourceIndex];

                let scheduleInfo = await scraper.getScheduleDetails(courseData);

                // The odd section times out before its modal renders; one
                // retry recovers it.
                if (scheduleInfo.sessions.length === 0) {
                    await delay(scraper.speedSettings.modalWaitTime * 2);
                    const retry = await scraper.getScheduleDetails(courseData);
                    if (retry.sessions.length > 0) {
                        scheduleInfo = retry;
                    }
                }

                collected.push(toCourseRecord(courseData, scheduleInfo, sourceIndex));

                const now = Date.now();
                if (now - lastProgressAt > PROGRESS_INTERVAL_MS || position === order.length - 1) {
                    lastProgressAt = now;
                    await persist(true);
                    await setState({
                        status: 'running',
                        done: collected.length,
                        total: total,
                        message: `${courseData.code} - شعبة ${courseData.sectionId}`
                    });
                }

                await delay(scraper.speedSettings.betweenSectionsDelay);
            }

            await persist(false);

            const withoutSessions = collected.filter(c => c.schedule.sessions.length === 0).length;
            let message = `تم سحب ${collected.length} شعبة`;
            if (withoutSessions > 0) {
                message += ` (${withoutSessions} بلا أوقات — أعد السحب لاستكمالها)`;
            }

            await setState({
                status: 'done',
                done: collected.length,
                total: total,
                message: message
            });

            console.log(`[مولد الجداول] تم سحب ${collected.length} شعبة`);
        } catch (error) {
            console.error('[مولد الجداول] خطأ أثناء السحب:', error);
            await persist(true);
            await setState({
                status: 'error',
                done: collected.length,
                total: total,
                message: `حدث خطأ أثناء السحب: ${error.message}`
            });
        } finally {
            running = false;
            removeNavigationGuard();
            closeLifelinePort();

            if (blockedNavigations.length > 0) {
                console.warn('[مولد الجداول] روابط مُنعت من الانتقال:', blockedNavigations);
            }
        }
    }

    // Entry point called by the popup through chrome.scripting.executeScript
    globalThis.__sbStartScrape = function () {
        runScrape();
        return true;
    };
})();
