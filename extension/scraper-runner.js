// ===============================================
// SCRAPER RUNNER
// Injected into the university page right after scraper-core.js.
// Drives the scrape, reports progress, and stores the result.
//
// Progress and results go straight into chrome.storage.local so the work
// survives the popup being closed or the service worker going to sleep.
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

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function setState(state) {
        return chrome.storage.local.set({
            [STATE_KEY]: Object.assign({ updatedAt: Date.now(), opened: false }, state)
        });
    }

    async function isCancelled() {
        const result = await chrome.storage.local.get(CANCEL_KEY);
        return result[CANCEL_KEY] === true;
    }

    function buildOutput(scraper, courses) {
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
            generatedAt: new Date().toISOString()
        };
    }

    async function runScrape(speed) {
        if (running) return;
        running = true;

        try {
            await chrome.storage.local.set({ [CANCEL_KEY]: false });

            const scraper = new globalThis.UniversityCoursesScraper();

            if (speed === 'turbo') {
                scraper.enableTurboMode();
            } else if (speed === 'safe') {
                scraper.enableSafeMode();
            } else {
                scraper.enableFastMode();
            }

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

            const total = basicCourses.length;
            const courses = [];
            let lastProgressAt = 0;

            for (let i = 0; i < total; i++) {
                if (await isCancelled()) {
                    await setState({
                        status: 'idle',
                        done: i,
                        total: total,
                        message: 'تم إيقاف السحب'
                    });
                    return;
                }

                const courseData = basicCourses[i];
                let scheduleInfo = await scraper.getScheduleDetails(courseData);

                // The first modal on a page often fails to open, and the odd
                // section times out. One retry recovers both cases, so unlike
                // the console script no section has to be skipped.
                if (scheduleInfo.sessions.length === 0) {
                    await delay(scraper.speedSettings.modalWaitTime * 2);
                    const retry = await scraper.getScheduleDetails(courseData);
                    if (retry.sessions.length > 0) {
                        scheduleInfo = retry;
                    }
                }

                courses.push({
                    index: i,
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
                });

                const now = Date.now();
                if (now - lastProgressAt > PROGRESS_INTERVAL_MS || i === total - 1) {
                    lastProgressAt = now;
                    await setState({
                        status: 'running',
                        done: i + 1,
                        total: total,
                        message: `${courseData.code} - شعبة ${courseData.sectionId}`
                    });
                }

                await delay(scraper.speedSettings.betweenSectionsDelay);
            }

            const output = buildOutput(scraper, courses);

            await chrome.storage.local.set({ [DATA_KEY]: output });
            await setState({
                status: 'done',
                done: courses.length,
                total: total,
                message: `تم سحب ${courses.length} شعبة`
            });

            console.log(`[مولد الجداول] تم سحب ${courses.length} شعبة`);
        } catch (error) {
            console.error('[مولد الجداول] خطأ أثناء السحب:', error);
            await setState({
                status: 'error',
                done: 0,
                total: 0,
                message: `حدث خطأ أثناء السحب: ${error.message}`
            });
        } finally {
            running = false;
        }
    }

    // Entry point called by the popup through chrome.scripting.executeScript
    globalThis.__sbStartScrape = function (speed) {
        runScrape(speed);
        return true;
    };
})();
