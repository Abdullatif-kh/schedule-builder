// ===============================================
// SCHEDULE BUILDER SCRIPT
// Complete schedule generation tool with conflict detection
// ===============================================

// ===============================================
// GLOBAL STATE MANAGEMENT
// ===============================================
let coursesData = null;                  // Loaded course data from JSON
let selectedCourses = new Set();          // User-selected courses
let mandatoryCourses = new Set();         // Mandatory courses (must be in every schedule)
let registeredSections = new Set();       // Sections already registered in (kept available, never preferred)
let preferredInstructors = new Set();     // Preferred instructors (normalized names)
let courseUnits = {};                     // Course units (theoretical + practical combined)
let instructorIndex = new Map();          // Normalized instructor name -> { display, courses, sectionCount }

// Results state (kept so sorting does not require regenerating)
let lastSchedules = [];
let renderedCount = 0;
const RENDER_BATCH_SIZE = 20;

// ===============================================
// DOM ELEMENTS CACHE
// ===============================================
const DOM = {
    // Course selection
    coursesList: document.getElementById('coursesList'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    deselectAllBtn: document.getElementById('deselectAllBtn'),
    
    // Settings
    minCredits: document.getElementById('minCredits'),
    maxCredits: document.getElementById('maxCredits'),
    maxResults: document.getElementById('maxResults'),
    includeClosedSections: document.getElementById('includeClosedSections'),
    allowPartialSchedules: document.getElementById('allowPartialSchedules'),
    hideIdenticalTimes: document.getElementById('hideIdenticalTimes'),

    // Registered sections
    registeredSectionsInput: document.getElementById('registeredSectionsInput'),
    registeredSectionsDisplay: document.getElementById('registeredSectionsDisplay'),

    // Preferred instructors
    instructorSearch: document.getElementById('instructorSearch'),
    instructorsList: document.getElementById('instructorsList'),
    instructorsEmptyState: document.getElementById('instructorsEmptyState'),
    strictInstructors: document.getElementById('strictInstructors'),
    preferredInstructorsDisplay: document.getElementById('preferredInstructorsDisplay'),

    // Day selection
    dayCheckboxes: Array.from({length: 5}, (_, i) => document.getElementById(`day_${i+1}`)),

    // Actions
    generateBtn: document.getElementById('generateBtn'),

    // Results
    loadingState: document.getElementById('loadingState'),
    resultsSection: document.getElementById('resultsSection'),
    resultsCount: document.getElementById('resultsCount'),
    schedulesGrid: document.getElementById('schedulesGrid'),
    sortMode: document.getElementById('sortMode'),
    loadMoreContainer: document.getElementById('loadMoreContainer'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),
    loadMoreHint: document.getElementById('loadMoreHint'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage')
};

// ===============================================
// INITIALIZATION
// ===============================================
// How long to wait for the Chrome extension to plant its data before giving up.
// The extension bridge reads chrome.storage asynchronously, so it can land
// slightly after DOMContentLoaded.
const EXTENSION_DATA_TIMEOUT = 2500;

function init() {
    const storedData = sessionStorage.getItem('courseData');

    if (storedData) {
        loadCourseData(storedData);
        return;
    }

    // No data yet: give the extension bridge a chance before redirecting
    let settled = false;

    const onExtensionData = () => {
        if (settled) return;
        const data = sessionStorage.getItem('courseData');
        if (!data) return;

        settled = true;
        clearTimeout(redirectTimer);
        window.removeEventListener('sb:extension-data', onExtensionData);
        loadCourseData(data);
    };

    window.addEventListener('sb:extension-data', onExtensionData);

    const redirectTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('sb:extension-data', onExtensionData);
        showToast('لم يتم العثور على بيانات المواد', 'error');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
    }, EXTENSION_DATA_TIMEOUT);
}

function loadCourseData(storedData) {
    try {
        // Parse and decode course data
        const rawData = JSON.parse(storedData);
        coursesData = decodeCoursesData(rawData);

        // Setup UI
        setupCourseUnits();
        setupCourseSelection();
        setupInstructorSelection();
        setupEventListeners();
        applyScrapedRegisteredSections(rawData);

        showToast('تم تحميل البيانات بنجاح', 'success');
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('خطأ في تحميل البيانات', 'error');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
    }
}

// ===============================================
// TEXT DECODING UTILITIES
// ===============================================
function decodeArabicText(text) {
    if (!text || typeof text !== 'string') return text;
    
    // Common Arabic text replacements for encoding issues
    const replacements = {
        'Ø§Ù„Ù…Ù‡Ø§Ø±Ø§Øª Ø§Ù„Ù„ØºÙˆÙŠØ©': 'المهارات اللغوية',
        'Ø§Ù„Ù‚Ø±Ø¢Ù† Ø§Ù„ÙƒØ±ÙŠÙ…': 'القرآن الكريم',
        'Ù‡ÙŠØ§ÙƒÙ„ Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª': 'هياكل البيانات',
        'Ù†Ø¸Ø±ÙŠ': 'نظري',
        'Ø¹Ù…Ù„ÙŠ': 'عملي',
        'Ù…ØºÙ„Ù‚Øة': 'مغلقة',
        'Ù…ÙØªÙˆØ­Øة': 'مفتوحة',
        'Ø§Ù„Ø£Ø­Ø¯': 'الأحد',
        'Ø§Ù„Ø§Ø«Ù†ÙŠÙ†': 'الاثنين',
        'Ø§Ù„Ø«Ù„Ø§Ø«Ø§Ø¡': 'الثلاثاء',
        'Ø§Ù„Ø£Ø±Ø¨Ø¹Ø§Ø¡': 'الأربعاء',
        'Ø§Ù„Ø®Ù…ÙŠØ³': 'الخميس',
        'ØºÙŠØ± Ù…Ø­Ø¯Ø¯': 'غير محدد'
    };
    
    let result = text;
    for (const [encoded, arabic] of Object.entries(replacements)) {
        result = result.replace(new RegExp(encoded, 'g'), arabic);
    }
    return result;
}

function decodeCoursesData(rawData) {
    return {
        ...rawData,
        courses: rawData.courses.map(course => ({
            ...course,
            name: decodeArabicText(course.name),
            status: decodeArabicText(course.status),
            type: decodeArabicText(course.type),
            instructor: decodeArabicText(course.instructor),
            schedule: {
                ...course.schedule,
                sessions: course.schedule.sessions.map(session => ({
                    ...session,
                    dayName: decodeArabicText(session.dayName),
                    room: decodeArabicText(session.room)
                }))
            }
        }))
    };
}

// ===============================================
// COURSE UNITS SETUP
// Combines theoretical and practical sections of the same course
// ===============================================
function setupCourseUnits() {
    courseUnits = {};
    const courses = coursesData.courses;
    
    for (let i = 0; i < courses.length; i++) {
        const course = courses[i];
        const courseCode = course.code;
        
        // Initialize course unit array if doesn't exist
        if (!courseUnits[courseCode]) {
            courseUnits[courseCode] = [];
        }
        
        // Process theoretical courses
        if (course.type === 'نظري') {
            const practicalCourse = courses[i + 1];
            
            // Check if next course is practical part of same course
            if (practicalCourse && 
                practicalCourse.code === courseCode && 
                practicalCourse.type === 'عملي') {
                // Combined unit (theoretical + practical)
                courseUnits[courseCode].push({
                    type: 'combined',
                    theoretical: course,
                    practical: practicalCourse,
                    totalCredits: parseInt(course.creditHours) || 0
                });
                i++; // Skip next iteration since we processed practical
            } else {
                // Theoretical only unit
                courseUnits[courseCode].push({
                    type: 'theoretical',
                    theoretical: course,
                    totalCredits: parseInt(course.creditHours) || 0
                });
            }
        } 
        // Process standalone practical courses
        else if (course.type === 'عملي') {
            const prevCourse = courses[i - 1];
            // Only add if not already processed as part of combined unit
            if (!prevCourse || 
                prevCourse.code !== courseCode || 
                prevCourse.type !== 'نظري') {
                courseUnits[courseCode].push({
                    type: 'practical',
                    practical: course,
                    totalCredits: 0
                });
            }
        }
    }
    
    console.log('Course units setup complete:', courseUnits);
}

// ===============================================
// INSTRUCTOR INDEX
// Builds the list of instructors the student can mark as preferred
// ===============================================

// Values the scraper writes when it could not read a real instructor name
const UNKNOWN_INSTRUCTORS = new Set(['غير محدد', 'غير متاح', 'خطأ', 'معالج سابقاً']);

// Normalize an instructor name so "د. محمد  علي" and "محمد علي" match
function normalizeInstructor(name) {
    if (!name || typeof name !== 'string') return '';

    const cleaned = name
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(الدكتور|الدكتوره|الدكتورة|الأستاذ|الاستاذ|د\s*[.\/]|أ\s*[.\/]|ا\s*[.\/])\s*/, '')
        .trim();

    if (!cleaned || UNKNOWN_INSTRUCTORS.has(cleaned)) return '';
    return cleaned;
}

function buildInstructorIndex() {
    instructorIndex = new Map();

    coursesData.courses.forEach(course => {
        const key = normalizeInstructor(course.instructor);
        if (!key) return;

        if (!instructorIndex.has(key)) {
            instructorIndex.set(key, {
                display: key,
                courses: new Set(),
                sectionCount: 0
            });
        }

        const entry = instructorIndex.get(key);
        entry.courses.add(course.code);
        entry.sectionCount++;
    });

    console.log(`Instructor index built: ${instructorIndex.size} instructors`);
}

function setupInstructorSelection() {
    buildInstructorIndex();

    DOM.instructorsList.innerHTML = '';

    if (instructorIndex.size === 0) {
        DOM.instructorsList.innerHTML =
            '<p class="form-hint">لا توجد أسماء دكاترة في ملف المواد</p>';
        return;
    }

    // Most-teaching instructors first, then alphabetically
    const sorted = Array.from(instructorIndex.entries()).sort((a, b) => {
        if (b[1].sectionCount !== a[1].sectionCount) {
            return b[1].sectionCount - a[1].sectionCount;
        }
        return a[1].display.localeCompare(b[1].display, 'ar');
    });

    sorted.forEach(([key, info], index) => {
        const item = document.createElement('div');
        item.className = 'instructor-item';
        item.dataset.instructorName = info.display;

        const inputId = `instructor_${index}`;
        const courseList = Array.from(info.courses).join('، ');

        item.innerHTML = `
            <input type="checkbox" id="${inputId}">
            <label for="${inputId}">
                ${info.display}
                <span class="instructor-meta">${info.sectionCount} شعبة | ${courseList}</span>
            </label>
        `;

        DOM.instructorsList.appendChild(item);
        item.querySelector('input').addEventListener('change', (e) => {
            togglePreferredInstructor(key, e.target.checked);
        });
    });
}

function togglePreferredInstructor(instructorKey, isChecked) {
    if (isChecked) {
        preferredInstructors.add(instructorKey);
    } else {
        preferredInstructors.delete(instructorKey);
    }
    updatePreferredInstructorsDisplay();
}

function updatePreferredInstructorsDisplay() {
    const display = DOM.preferredInstructorsDisplay;

    if (preferredInstructors.size === 0) {
        display.innerHTML = '';
        return;
    }

    const chips = Array.from(preferredInstructors)
        .map(name => `<span class="instructor-chip">${name}</span>`)
        .join('');

    display.innerHTML = `
        <div style="background: rgba(20, 184, 166, 0.15); border: 1px solid rgba(20, 184, 166, 0.4); border-radius: 8px; padding: 12px;">
            <div style="margin-bottom: 8px; font-weight: 600; color: rgba(255, 255, 255, 0.9);">
                الدكاترة المفضلون (${preferredInstructors.size}):
            </div>
            ${chips}
        </div>
    `;
}

function filterInstructorList() {
    const query = DOM.instructorSearch.value.trim();
    const items = DOM.instructorsList.querySelectorAll('.instructor-item');
    let visible = 0;

    items.forEach(item => {
        const matches = !query || item.dataset.instructorName.includes(query);
        item.style.display = matches ? 'flex' : 'none';
        if (matches) visible++;
    });

    DOM.instructorsEmptyState.style.display =
        (visible === 0 && instructorIndex.size > 0) ? 'block' : 'none';
}

// Does either section of this unit belong to a preferred instructor?
function unitHasPreferredInstructor(unit) {
    if (unit.theoretical && preferredInstructors.has(normalizeInstructor(unit.theoretical.instructor))) {
        return true;
    }
    if (unit.practical && preferredInstructors.has(normalizeInstructor(unit.practical.instructor))) {
        return true;
    }
    return false;
}

function isPreferredInstructor(name) {
    const key = normalizeInstructor(name);
    return key !== '' && preferredInstructors.has(key);
}
// ===============================================
// UI SETUP AND MANAGEMENT
// ===============================================
function setupCourseSelection() {
    DOM.coursesList.innerHTML = '';
    
    Object.entries(courseUnits).forEach(([code, units]) => {
        if (units.length > 0) {
            const firstUnit = units[0];
            const courseName = firstUnit.theoretical ? firstUnit.theoretical.name : firstUnit.practical.name;
            const totalSections = units.length;
            const credits = firstUnit.totalCredits;
            
            // Determine course type badge
            let typeBadge = '';
            if (firstUnit.type === 'combined') {
                typeBadge = '<span style="background: #3498db; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8em;">نظري + عملي</span>';
            } else if (firstUnit.type === 'theoretical') {
                typeBadge = '<span style="background: #3498db; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8em;">نظري</span>';
            } else {
                typeBadge = '<span style="background: #17a2b8; color: white; padding: 2px 8px; border-radius: 10px; font-size: 0.8em;">عملي</span>';
            }
            
            // Create course item
            const courseItem = document.createElement('div');
            courseItem.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 12px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; margin-bottom: 8px; transition: all 0.2s;';
            
            courseItem.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 10px;">
                    <input type="checkbox" id="course_${code}" value="${code}" style="margin-top: 4px; cursor: pointer;">
                    <label for="course_${code}" style="flex: 1; cursor: pointer; color: rgba(255, 255, 255, 0.9);">
                        <strong style="color: #4facfe;">${code}</strong> - ${courseName} ${typeBadge}
                        <br>
                        <small style="color: rgba(255, 255, 255, 0.6);">الساعات: ${credits} | الشعب المتاحة: ${totalSections}</small>
                    </label>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; padding-right: 30px;">
                    <input type="checkbox" id="mandatory_${code}" value="${code}" style="cursor: pointer;">
                    <label for="mandatory_${code}" style="font-size: 0.9em; color: #f39c12; font-weight: 600; cursor: pointer;">
                        🔴 مادة إجبارية (لازم تكون في كل جدول)
                    </label>
                </div>
            `;
            
            courseItem.addEventListener('mouseenter', () => {
                courseItem.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            courseItem.addEventListener('mouseleave', () => {
                courseItem.style.background = 'rgba(255, 255, 255, 0.05)';
            });
            
            DOM.coursesList.appendChild(courseItem);
            
            // Add event listeners
            document.getElementById(`course_${code}`).addEventListener('change', () => toggleCourse(code));
            document.getElementById(`mandatory_${code}`).addEventListener('change', () => toggleMandatory(code));
        }
    });
}

function setupEventListeners() {
    // Course selection buttons
    DOM.selectAllBtn.addEventListener('click', selectAllCourses);
    DOM.deselectAllBtn.addEventListener('click', deselectAllCourses);

    // Registered sections input
    DOM.registeredSectionsInput.addEventListener('input', updateRegisteredSections);

    // Instructor search
    DOM.instructorSearch.addEventListener('input', filterInstructorList);

    // Re-sort already generated results without regenerating them
    DOM.sortMode.addEventListener('change', () => {
        if (lastSchedules.length > 0) {
            renderSchedules();
        }
    });

    // Incremental rendering
    DOM.loadMoreBtn.addEventListener('click', renderNextBatch);

    // Generate button
    DOM.generateBtn.addEventListener('click', generateSchedules);
}

// ===============================================
// COURSE SELECTION HANDLERS
// ===============================================
function toggleCourse(courseCode) {
    if (selectedCourses.has(courseCode)) {
        selectedCourses.delete(courseCode);
        mandatoryCourses.delete(courseCode);
        document.getElementById(`mandatory_${courseCode}`).checked = false;
    } else {
        selectedCourses.add(courseCode);
    }
    console.log('Selected courses:', selectedCourses);
}

function toggleMandatory(courseCode) {
    if (mandatoryCourses.has(courseCode)) {
        mandatoryCourses.delete(courseCode);
    } else {
        mandatoryCourses.add(courseCode);
        // Auto-select course if marking as mandatory
        if (!selectedCourses.has(courseCode)) {
            selectedCourses.add(courseCode);
            document.getElementById(`course_${courseCode}`).checked = true;
        }
    }
    console.log('Mandatory courses:', mandatoryCourses);
}

function selectAllCourses() {
    Object.keys(courseUnits).forEach(courseCode => {
        selectedCourses.add(courseCode);
        document.getElementById(`course_${courseCode}`).checked = true;
    });
    showToast('تم تحديد جميع المواد', 'success');
}

function deselectAllCourses() {
    selectedCourses.clear();
    mandatoryCourses.clear();
    Object.keys(courseUnits).forEach(courseCode => {
        document.getElementById(`course_${courseCode}`).checked = false;
        document.getElementById(`mandatory_${courseCode}`).checked = false;
    });
    showToast('تم إلغاء تحديد جميع المواد', 'success');
}

// ===============================================
// REGISTERED SECTIONS MANAGEMENT
// ===============================================

// The extension can scrape the student's own registered sections from the
// portal. When it has, fill the field in instead of making them type it.
function applyScrapedRegisteredSections(rawData) {
    const scraped = rawData && rawData.registeredSections;
    if (!Array.isArray(scraped) || scraped.length === 0) return;

    DOM.registeredSectionsInput.value = scraped.join(', ');
    updateRegisteredSections();

    showToast(`تم جلب ${scraped.length} شعبة مسجلة تلقائياً`, 'info');
}

function updateRegisteredSections() {
    const input = DOM.registeredSectionsInput.value;
    const sections = input.split(',').map(s => s.trim()).filter(s => s);
    
    registeredSections.clear();
    sections.forEach(s => registeredSections.add(s));
    
    updateRegisteredSectionsDisplay();
}

function updateRegisteredSectionsDisplay() {
    const display = DOM.registeredSectionsDisplay;
    
    if (registeredSections.size === 0) {
        display.innerHTML = '';
        return;
    }
    
    const validSections = [];
    const invalidSections = [];
    
    // Validate registered sections
    registeredSections.forEach(sectionId => {
        const section = coursesData.courses.find(c => c.sectionId === sectionId);
        if (section) {
            validSections.push(section);
        } else {
            invalidSections.push(sectionId);
        }
    });
    
    let html = '<div style="background: rgba(243, 156, 18, 0.2); border: 1px solid rgba(243, 156, 18, 0.4); border-radius: 8px; padding: 12px; margin-top: 10px;">';
    
    if (validSections.length > 0) {
        html += `<div style="margin-bottom: 8px; font-weight: 600; color: rgba(255, 255, 255, 0.9);">الشعب الصحيحة (${validSections.length}):</div>`;
        validSections.forEach(section => {
            html += `<span style="display: inline-block; background: rgba(243, 156, 18, 0.8); color: white; padding: 4px 10px; margin: 2px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">${section.code} - ${section.sectionId}</span>`;
        });
    }
    
    if (invalidSections.length > 0) {
        html += `<div style="margin-top: 10px; color: #e74c3c; font-weight: 600;">شعب غير موجودة: ${invalidSections.join(', ')}</div>`;
    }
    
    html += '</div>';
    display.innerHTML = html;
}

// ===============================================
// DAY SELECTION UTILITIES
// ===============================================
function getSelectedDays() {
    return DOM.dayCheckboxes
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.value));
}

// ===============================================
// TIME UTILITIES
// ===============================================
function convertTo12Hour(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    
    if (hours === 0) {
        return `12:${String(minutes).padStart(2, '0')} ص`;
    } else if (hours === 12) {
        return `12:${String(minutes).padStart(2, '0')} م`;
    } else if (hours < 12) {
        return `${hours}:${String(minutes).padStart(2, '0')} ص`;
    } else {
        return `${hours - 12}:${String(minutes).padStart(2, '0')} م`;
    }
}

function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// ===============================================
// TOAST NOTIFICATION
// ===============================================
function showToast(message, type = 'success') {
    DOM.toastMessage.textContent = message;
    
    // Set toast color based on type
    const colors = {
        success: 'rgba(39, 174, 96, 0.95)',
        error: 'rgba(231, 76, 60, 0.95)',
        warning: 'rgba(243, 156, 18, 0.95)',
        info: 'rgba(52, 152, 219, 0.95)'
    };
    
    DOM.toast.style.background = colors[type] || colors.info;
    DOM.toast.classList.add('show');
    
    setTimeout(() => {
        DOM.toast.classList.remove('show');
    }, 3000);
}
// ===============================================
// SCHEDULE GENERATION LOGIC
// Core algorithm for generating conflict-free schedules
// ===============================================

// Check if two session arrays have time conflicts
function hasTimeConflict(sessions1, sessions2) {
    for (const session1 of sessions1) {
        for (const session2 of sessions2) {
            // Check if sessions are on the same day
            if (session1.day === session2.day) {
                const start1 = timeToMinutes(session1.startTime);
                const end1 = timeToMinutes(session1.endTime);
                const start2 = timeToMinutes(session2.startTime);
                const end2 = timeToMinutes(session2.endTime);
                
                // Precise conflict detection - even 1-minute overlap is a conflict
                if (start1 < end2 && start2 < end1) {
                    return true;
                }
            }
        }
    }
    return false;
}

// All sessions of a unit (theoretical + practical) in one array
function getUnitSessions(unit) {
    const sessions = [];

    if (unit.theoretical && unit.theoretical.schedule && unit.theoretical.schedule.sessions) {
        sessions.push(...unit.theoretical.schedule.sessions);
    }
    if (unit.practical && unit.practical.schedule && unit.practical.schedule.sessions) {
        sessions.push(...unit.practical.schedule.sessions);
    }

    return sessions;
}

// Does this unit clash with anything already in the schedule?
function unitConflictsWith(unit, schedule) {
    const sessions = getUnitSessions(unit);

    for (const existingUnit of schedule) {
        if (hasTimeConflict(sessions, getUnitSessions(existingUnit))) {
            return true;
        }
    }

    return false;
}

// Does every session of this unit fall on a day the student kept?
function unitFitsSelectedDays(unit, selectedDays) {
    return getUnitSessions(unit).every(session => selectedDays.includes(session.day));
}

// Validate that a schedule has no conflicts
function isValidSchedule(units) {
    const allSessions = [];
    units.forEach(unit => allSessions.push(...getUnitSessions(unit)));

    // Check for conflicts between all session pairs
    for (let i = 0; i < allSessions.length; i++) {
        for (let j = i + 1; j < allSessions.length; j++) {
            if (hasTimeConflict([allSessions[i]], [allSessions[j]])) {
                return false; // Conflict found
            }
        }
    }

    // Check that all sessions are on selected days
    const selectedDays = getSelectedDays();
    for (const session of allSessions) {
        if (!selectedDays.includes(session.day)) {
            return false; // Session on non-selected day
        }
    }

    return true; // No conflicts found
}

// Can the student actually take this section? Open sections, plus any section
// already registered in — a closed section you already hold is still yours.
function isSectionAvailable(section) {
    return section.status === 'مفتوحة' || registeredSections.has(section.sectionId);
}

// Calculate score for a schedule (higher is better).
// `knownGapMinutes` avoids recomputing gaps when the caller already has them.
function calculateScheduleScore(units, knownGapMinutes) {
    let score = 100; // Base score

    units.forEach(unit => {
        // Theoretical section scoring
        if (unit.theoretical) {
            // A section you are already registered in is available to you no
            // matter what its status says, so it scores exactly like an open
            // one. It gets no bonus: ranking schedules by what you happen to
            // hold today would bury better timetables.
            score += isSectionAvailable(unit.theoretical) ? 20 : -5;

            if (isPreferredInstructor(unit.theoretical.instructor)) {
                score += 60; // Bonus for a preferred instructor
            }
        }

        // Practical section scoring
        if (unit.practical) {
            score += isSectionAvailable(unit.practical) ? 10 : -3;

            if (isPreferredInstructor(unit.practical.instructor)) {
                score += 30; // Bonus for a preferred instructor
            }
        }
    });
    
    // Penalty for gaps (prefer compact schedules)
    const totalGapMinutes = knownGapMinutes !== undefined
        ? knownGapMinutes
        : sumGapMinutes(calculateDailyGaps(units));

    score -= Math.floor(totalGapMinutes / 10);

    return score;
}

// Total free minutes between classes across the whole week
function sumGapMinutes(dailyGaps) {
    return Object.values(dailyGaps).reduce((total, dayGaps) => {
        return total + dayGaps.reduce((dayTotal, gap) => dayTotal + gap.gapMinutes, 0);
    }, 0);
}

// Calculate gaps between sessions for each day
function calculateDailyGaps(units) {
    const dailySchedules = {};
    const dailyGaps = {};

    // Organize sessions by day
    units.forEach(unit => {
        getUnitSessions(unit).forEach(session => {
            if (!dailySchedules[session.day]) {
                dailySchedules[session.day] = [];
            }
            dailySchedules[session.day].push({
                start: timeToMinutes(session.startTime),
                end: timeToMinutes(session.endTime),
                startTime: session.startTime,
                endTime: session.endTime
            });
        });
    });
    
    // Calculate gaps for each day
    Object.entries(dailySchedules).forEach(([day, sessions]) => {
        // Sort sessions by start time
        sessions.sort((a, b) => a.start - b.start);
        dailyGaps[day] = [];
        
        // Find gaps between consecutive sessions
        for (let i = 1; i < sessions.length; i++) {
            const gapMinutes = sessions[i].start - sessions[i-1].end;
            
            // Only consider gaps longer than 10 minutes
            if (gapMinutes > 10) {
                const gapHours = Math.floor(gapMinutes / 60);
                const gapMins = gapMinutes % 60;
                
                dailyGaps[day].push({
                    gapMinutes: gapMinutes,
                    gapText: gapHours > 0 ? 
                        `${gapHours}:${String(gapMins).padStart(2, '0')} ساعة فراغ` : 
                        `${gapMins} دقيقة فراغ`,
                    afterTime: sessions[i-1].endTime,
                    beforeTime: sessions[i].startTime
                });
            }
        }
    });
    
    return dailyGaps;
}

// Main schedule generation function
function generateSchedules() {
    // Validation
    if (selectedCourses.size === 0) {
        showToast('يرجى اختيار مادة واحدة على الأقل', 'error');
        return;
    }
    
    const selectedDays = getSelectedDays();
    if (selectedDays.length === 0) {
        showToast('يرجى اختيار يوم واحد على الأقل', 'error');
        return;
    }
    
    // Check mandatory courses
    if (mandatoryCourses.size > 0) {
        const missingMandatory = [];
        mandatoryCourses.forEach(courseCode => {
            if (!selectedCourses.has(courseCode)) {
                missingMandatory.push(courseCode);
            }
        });
        
        if (missingMandatory.length > 0) {
            showToast(`هناك مواد إجبارية غير محددة: ${missingMandatory.join(', ')}`, 'error');
            return;
        }
    }
    
    // Show loading state
    DOM.loadingState.style.display = 'block';
    DOM.resultsSection.style.display = 'none';
    
    // Start generation with small delay for UI update
    setTimeout(() => {
        try {
            const schedules = generateAllSchedulesComprehensive();
            displayResults(schedules);
        } catch (error) {
            console.error('Error generating schedules:', error);
            showToast('حدث خطأ أثناء توليد الجداول', 'error');
            DOM.loadingState.style.display = 'none';
        }
    }, 100);
}

// ===============================================
// SCHEDULE FINGERPRINTS
// Used to guarantee every result is a distinct schedule
// ===============================================

// Identity of a schedule: the exact set of sections it uses.
// Two schedules sharing a signature are the same schedule.
function scheduleSignature(units) {
    const ids = [];

    units.forEach(unit => {
        if (unit.theoretical) ids.push(`T${unit.theoretical.sectionId}`);
        if (unit.practical) ids.push(`P${unit.practical.sectionId}`);
    });

    return ids.sort().join('|');
}

// Shape of a schedule in the weekly grid: same courses at the same times.
// Sections that differ only by number produce an identical grid, so this lets
// us collapse them into a single result.
function scheduleTimeSignature(units) {
    const slots = [];

    units.forEach(unit => {
        [unit.theoretical, unit.practical].forEach(section => {
            if (!section || !section.schedule || !section.schedule.sessions) return;
            section.schedule.sessions.forEach(session => {
                slots.push(`${section.code}@${session.day}:${session.startTime}-${session.endTime}`);
            });
        });
    });

    return slots.sort().join('|');
}

// Reason the last run produced nothing useful (shown in the empty state)
let lastGenerationIssue = '';

// Comprehensive schedule generation algorithm
function generateAllSchedulesComprehensive() {
    const startTime = performance.now();
    lastGenerationIssue = '';

    // Get settings
    const minCredits = parseInt(DOM.minCredits.value);
    const maxCredits = parseInt(DOM.maxCredits.value);
    const maxResults = parseInt(DOM.maxResults.value);
    const includeClosedSections = DOM.includeClosedSections.checked;
    const allowPartialSchedules = DOM.allowPartialSchedules.checked;
    const hideIdenticalTimes = DOM.hideIdenticalTimes.checked;
    const strictInstructors = DOM.strictInstructors.checked && preferredInstructors.size > 0;
    const selectedDays = getSelectedDays();

    const allSchedules = [];
    const seenSignatures = new Set();
    const seenTimeSignatures = new Set();

    // Prepare course options
    const courseOptions = Array.from(selectedCourses).map(courseCode => {
        let units = courseUnits[courseCode] || [];

        // Drop units that meet on an excluded day. Pruning here shrinks the
        // search tree instead of throwing whole schedules away at the end.
        units = units.filter(unit => unitFitsSelectedDays(unit, selectedDays));

        // Filter out closed sections if not including them
        if (!includeClosedSections) {
            units = units.filter(unit => {
                // Registered sections stay in the pool even when closed — that
                // is the only special treatment they get.
                const theoreticalOpen = !unit.theoretical || isSectionAvailable(unit.theoretical);
                const practicalOpen = !unit.practical || isSectionAvailable(unit.practical);
                return theoreticalOpen && practicalOpen;
            });
        }

        // Strict mode: keep only preferred instructors, but only for courses
        // where a preferred instructor actually teaches — otherwise the course
        // would silently vanish from every schedule.
        if (strictInstructors) {
            const preferredUnits = units.filter(unitHasPreferredInstructor);
            if (preferredUnits.length > 0) {
                units = preferredUnits;
            }
        }

        return {
            code: courseCode,
            units: units,
            isMandatory: mandatoryCourses.has(courseCode)
        };
    });

    // A mandatory course with no usable section makes every schedule impossible
    const blockedMandatory = courseOptions
        .filter(option => option.isMandatory && option.units.length === 0)
        .map(option => option.code);

    if (blockedMandatory.length > 0) {
        lastGenerationIssue = `لا توجد شعبة متاحة للمواد الإجبارية: ${blockedMandatory.join('، ')} — راجع الأيام المختارة أو الشعب المغلقة`;
        console.log(lastGenerationIssue);
        return [];
    }

    const usableOptions = courseOptions.filter(option => option.units.length > 0);
    const mandatoryOptions = usableOptions.filter(option => option.isMandatory);
    const optionalOptions = usableOptions.filter(option => !option.isMandatory);

    console.log('Generating schedules...');
    console.log(`Mandatory courses: ${mandatoryOptions.length}`);
    console.log(`Optional courses: ${optionalOptions.length}`);

    function reachedLimit() {
        return maxResults > 0 && allSchedules.length >= maxResults;
    }

    // Record a finished schedule. Every filter that decides whether a
    // combination deserves to be shown lives here, in one place.
    function recordSchedule(currentSchedule, totalCredits) {
        if (currentSchedule.length === 0) return;
        if (totalCredits < minCredits || totalCredits > maxCredits) return;

        // "Full schedules only" means every usable selected course is present
        if (!allowPartialSchedules && currentSchedule.length < usableOptions.length) return;

        // Exact duplicate: same sections, already recorded
        const signature = scheduleSignature(currentSchedule);
        if (seenSignatures.has(signature)) return;
        seenSignatures.add(signature);

        // Optional: collapse schedules that look identical in the weekly grid
        if (hideIdenticalTimes) {
            const timeSignature = scheduleTimeSignature(currentSchedule);
            if (seenTimeSignatures.has(timeSignature)) return;
            seenTimeSignatures.add(timeSignature);
        }

        if (!isValidSchedule(currentSchedule)) return;

        // Metrics are computed once here and reused for sorting and display
        const dailyGaps = calculateDailyGaps(currentSchedule);
        const totalGapMinutes = sumGapMinutes(dailyGaps);

        allSchedules.push({
            units: [...currentSchedule],
            totalCredits: totalCredits,
            score: calculateScheduleScore(currentSchedule, totalGapMinutes),
            daysUsed: Object.keys(dailyGaps).length,
            totalGapMinutes: totalGapMinutes
        });
    }

    // Recursive function to generate combinations.
    // Schedules are recorded only when the branch is finished — recording at
    // every node used to emit the same schedule once per remaining course.
    function generateCombinations(currentSchedule, courseIndex, totalCredits) {
        if (reachedLimit()) return;

        if (courseIndex >= optionalOptions.length) {
            recordSchedule(currentSchedule, totalCredits);
            return;
        }

        // Try adding each unit of current course
        const currentCourse = optionalOptions[courseIndex];

        for (const unit of currentCourse.units) {
            const newCredits = totalCredits + unit.totalCredits;

            if (newCredits > maxCredits) continue;
            if (unitConflictsWith(unit, currentSchedule)) continue;

            currentSchedule.push(unit);
            generateCombinations(currentSchedule, courseIndex + 1, newCredits);
            currentSchedule.pop();

            if (reachedLimit()) return;
        }

        // Skipping a course is only legal when partial schedules are allowed
        if (allowPartialSchedules) {
            generateCombinations(currentSchedule, courseIndex + 1, totalCredits);
        }
    }

    // Start with mandatory courses (returns one empty schedule if there are none)
    const mandatorySchedules = generateMandatoryCombinations(mandatoryOptions, maxCredits);

    if (mandatorySchedules.length === 0) {
        lastGenerationIssue = 'لا يمكن الجمع بين المواد الإجبارية المختارة بدون تعارض';
        console.log(lastGenerationIssue);
        return [];
    }

    // Generate all combinations starting from each mandatory schedule
    for (const mandatorySchedule of mandatorySchedules) {
        generateCombinations([...mandatorySchedule.units], 0, mandatorySchedule.totalCredits);

        if (reachedLimit()) break;
    }

    const endTime = performance.now();
    console.log(`Generated ${allSchedules.length} unique schedules in ${(endTime - startTime).toFixed(2)}ms`);

    if (allSchedules.length === 0 && !allowPartialSchedules) {
        lastGenerationIssue = 'لا يوجد جدول يضم كل المواد المختارة ضمن نطاق الساعات — جرّب تفعيل "السماح بالجداول الجزئية"';
    }

    return allSchedules;
}

// Generate combinations for mandatory courses only
function generateMandatoryCombinations(mandatoryOptions, maxCredits) {
    if (mandatoryOptions.length === 0) {
        return [{ units: [], totalCredits: 0 }];
    }

    const validCombinations = [];

    function generate(currentSchedule, courseIndex, totalCredits) {
        if (courseIndex >= mandatoryOptions.length) {
            if (isValidSchedule(currentSchedule)) {
                validCombinations.push({
                    units: [...currentSchedule],
                    totalCredits: totalCredits
                });
            }
            return;
        }

        const currentCourse = mandatoryOptions[courseIndex];

        for (const unit of currentCourse.units) {
            const newCredits = totalCredits + unit.totalCredits;

            if (newCredits > maxCredits) continue;
            if (unitConflictsWith(unit, currentSchedule)) continue;

            currentSchedule.push(unit);
            generate(currentSchedule, courseIndex + 1, newCredits);
            currentSchedule.pop();
        }
    }

    generate([], 0, 0);
    return validCombinations;
}
// ===============================================
// RESULTS DISPLAY
// Functions for rendering generated schedules
// ===============================================

// Ordering of the results list. Each mode falls back to the other metrics so
// ties are broken sensibly instead of arbitrarily.
const SORT_COMPARATORS = {
    score: (a, b) =>
        b.score - a.score ||
        a.daysUsed - b.daysUsed ||
        a.totalGapMinutes - b.totalGapMinutes,

    days: (a, b) =>
        a.daysUsed - b.daysUsed ||
        a.totalGapMinutes - b.totalGapMinutes ||
        b.score - a.score,

    gaps: (a, b) =>
        a.totalGapMinutes - b.totalGapMinutes ||
        a.daysUsed - b.daysUsed ||
        b.score - a.score
};

function sortSchedules(schedules, mode) {
    const comparator = SORT_COMPARATORS[mode] || SORT_COMPARATORS.score;
    return [...schedules].sort(comparator);
}

function displayResults(schedules) {
    DOM.loadingState.style.display = 'none';
    lastSchedules = schedules;

    if (schedules.length === 0) {
        DOM.resultsSection.style.display = 'block';
        DOM.loadMoreContainer.style.display = 'none';
        DOM.resultsCount.textContent = '0 جدول';
        DOM.schedulesGrid.innerHTML = `
            <div class="glass-card" style="padding: 60px; text-align: center;">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 20px; opacity: 0.5;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h2 style="color: rgba(255, 255, 255, 0.9); margin-bottom: 15px;">لا توجد جداول متاحة</h2>
                <p style="color: rgba(255, 255, 255, 0.7); font-size: 1.1rem;">
                    ${lastGenerationIssue || 'جرب تعديل خياراتك أو تضمين الشعب المغلقة'}
                </p>
            </div>
        `;
        return;
    }

    renderSchedules();

    // Scroll to results
    DOM.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast(`تم توليد ${schedules.length} جدول بنجاح`, 'success');
}

// Sort and render from scratch. Called on generation and whenever the sort
// mode changes — sorting never re-runs the generator.
function renderSchedules() {
    lastSchedules = sortSchedules(lastSchedules, DOM.sortMode.value);

    DOM.resultsSection.style.display = 'block';
    DOM.resultsCount.textContent = `${lastSchedules.length} جدول`;
    DOM.schedulesGrid.innerHTML = '';
    renderedCount = 0;

    renderNextBatch();
}

// Render schedules in batches: building a thousand weekly grids at once is
// what made the page freeze after generation.
function renderNextBatch() {
    const nextCount = Math.min(renderedCount + RENDER_BATCH_SIZE, lastSchedules.length);
    const fragment = document.createDocumentFragment();

    for (let i = renderedCount; i < nextCount; i++) {
        fragment.appendChild(createScheduleCard(lastSchedules[i], i + 1));
    }

    DOM.schedulesGrid.appendChild(fragment);
    renderedCount = nextCount;

    const remaining = lastSchedules.length - renderedCount;
    DOM.loadMoreContainer.style.display = remaining > 0 ? 'block' : 'none';
    DOM.loadMoreHint.textContent = remaining > 0
        ? `معروض ${renderedCount} من ${lastSchedules.length} جدول`
        : '';
}

function createScheduleCard(schedule, index) {
    const card = document.createElement('div');
    card.className = 'schedule-card glass-card';
    
    // daysUsed / totalGapMinutes were computed once during generation
    const { units, totalCredits, score, daysUsed, totalGapMinutes } = schedule;

    // Calculate statistics
    let mandatoryCount = 0;
    let optionalCount = 0;
    let openSections = 0;
    let closedSections = 0;
    let registeredSectionCount = 0;
    let preferredCount = 0;

    units.forEach(unit => {
        const courseCode = unit.theoretical ? unit.theoretical.code : unit.practical.code;

        if (mandatoryCourses.has(courseCode)) {
            mandatoryCount++;
        } else {
            optionalCount++;
        }

        [unit.theoretical, unit.practical].forEach(section => {
            if (!section) return;

            if (registeredSections.has(section.sectionId)) {
                registeredSectionCount++;
            } else if (section.status === 'مفتوحة') {
                openSections++;
            } else {
                closedSections++;
            }

            if (isPreferredInstructor(section.instructor)) {
                preferredCount++;
            }
        });
    });

    const gapHours = Math.floor(totalGapMinutes / 60);
    const gapMins = totalGapMinutes % 60;
    const gapText = totalGapMinutes > 0 ?
        `${gapHours > 0 ? gapHours + 'س ' : ''}${gapMins > 0 ? gapMins + 'د' : ''}` :
        'لا يوجد';

    const courseCount = units.length;

    card.innerHTML = `
        <div class="schedule-card-header">
            <div class="schedule-info">
                <h3>الجدول رقم ${index}</h3>
                <div class="schedule-stats">
                    <span class="stat-badge">المواد: ${courseCount}</span>
                    <span class="stat-badge">الساعات: ${totalCredits}</span>
                    <span class="stat-badge">الأيام: ${daysUsed}</span>
                    <span class="stat-badge">الفراغات: ${gapText}</span>
                    ${mandatoryCount > 0 ? `<span class="stat-badge" style="background: rgba(231,76,60,0.3);">إجباري: ${mandatoryCount}</span>` : ''}
                    ${optionalCount > 0 ? `<span class="stat-badge" style="background: rgba(52,152,219,0.3);">اختياري: ${optionalCount}</span>` : ''}
                    <span class="stat-badge" style="background: rgba(39,174,96,0.3);">مفتوح: ${openSections}</span>
                    ${registeredSectionCount > 0 ? `<span class="stat-badge" style="background: rgba(243,156,18,0.3);">مسجل: ${registeredSectionCount}</span>` : ''}
                    ${closedSections > 0 ? `<span class="stat-badge" style="background: rgba(231,76,60,0.3);">مغلق: ${closedSections}</span>` : ''}
                    ${preferredCount > 0 ? `<span class="stat-badge" style="background: rgba(20,184,166,0.35);">⭐ مفضل: ${preferredCount}</span>` : ''}
                    <span class="stat-badge" style="background: rgba(155,89,182,0.3);">النقاط: ${score}</span>
                </div>
            </div>
            <button class="btn btn-primary export-schedule-btn" data-schedule-number="${index}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                تنزيل الجدول
            </button>
        </div>
        <div class="schedule-table">
            ${createWeeklySchedule(units)}
        </div>
    `;
    
    return card;
}

function createWeeklySchedule(units) {
    const dayMapping = {1: 'الأحد', 2: 'الاثنين', 3: 'الثلاثاء', 4: 'الأربعاء', 5: 'الخميس'};
    
    const dailySchedules = {};
    
    // Organize sessions by day
    units.forEach(unit => {
        const sessions = [];
        
        if (unit.theoretical) {
            unit.theoretical.schedule.sessions.forEach(session => {
                sessions.push({
                    ...session,
                    unit: unit,
                    section: unit.theoretical,
                    type: 'نظري'
                });
            });
        }
        
        if (unit.practical) {
            unit.practical.schedule.sessions.forEach(session => {
                sessions.push({
                    ...session,
                    unit: unit,
                    section: unit.practical,
                    type: 'عملي'
                });
            });
        }
        
        sessions.forEach(session => {
            if (!dailySchedules[session.day]) {
                dailySchedules[session.day] = [];
            }
            dailySchedules[session.day].push(session);
        });
    });
    
    // Sort sessions by start time for each day
    Object.values(dailySchedules).forEach(sessions => {
        sessions.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    });
    
    const dailyGaps = calculateDailyGaps(units);
    
    // Build weekly grid
    let grid = '<div class="weekly-grid">';
    
    // Add day columns
    for (let dayIndex = 1; dayIndex <= 5; dayIndex++) {
        const dayName = dayMapping[dayIndex];
        const sessions = dailySchedules[dayIndex] || [];
        const gaps = dailyGaps[dayIndex] || [];
        
        grid += `
            <div class="day-column">
                <div class="day-header">${dayName}</div>
                <div class="day-sessions">
        `;
        
        if (sessions.length === 0) {
            grid += '<div class="no-sessions">لا يوجد دوام</div>';
        } else {
            for (let i = 0; i < sessions.length; i++) {
                const session = sessions[i];
                const isRegistered = registeredSections.has(session.section.sectionId);
                
                let statusColor, statusText, sessionBg;
                if (isRegistered) {
                    statusColor = '#F6AD55';
                    statusText = 'مسجل مسبقاً';
                    sessionBg = 'linear-gradient(135deg, rgba(246, 173, 85, 0.2), rgba(237, 137, 54, 0.15))';
                } else if (session.section.status === 'مفتوحة') {
                    statusColor = '#48BB78';
                    statusText = 'مفتوحة';
                    sessionBg = 'linear-gradient(135deg, rgba(72, 187, 120, 0.2), rgba(56, 161, 105, 0.15))';
                } else {
                    statusColor = '#F56565';
                    statusText = 'مغلقة';
                    sessionBg = 'linear-gradient(135deg, rgba(245, 101, 101, 0.2), rgba(229, 62, 62, 0.15))';
                }
                
                const typeColor = session.type === 'نظري' ? '#14B8A6' : '#FF6B35';
                const isClosed = session.section.status === 'مغلقة';
                const closedBorder = isClosed ? 'border: 3px solid #EF4444 !important;' : '';
                
                grid += `
                    <div class="session-card" style="border-color: ${statusColor}; background: ${sessionBg}; border-width: 2px; ${closedBorder}">
                        <div class="session-header" style="background: linear-gradient(135deg, ${typeColor}, ${typeColor === '#14B8A6' ? '#0D9488' : '#F7931E'});">
                            ${session.section.name}
                        </div>
                        <div class="session-body" style="background: rgba(255, 255, 255, 0.95); color: #1a202c;">
                            <div class="session-time" style="color: ${typeColor};">${convertTo12Hour(session.startTime)} - ${convertTo12Hour(session.endTime)}</div>
                            <div class="session-details" style="color: #4a5568;">
                                ${session.section.code} | ${session.type} | ${session.room}<br>
                                <strong style="color: #2d3748;">د. ${session.section.instructor}${isPreferredInstructor(session.section.instructor) ? ' ⭐' : ''}</strong><br>
                                الشعبة: ${session.section.sectionId}<br>
                                <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
                                ${isRegistered ? '<br><span style="color: #F6AD55; font-size: 1.1em;">📝</span>' : ''}
                            </div>
                        </div>
                    </div>
                `;
                
                // Add gap indicator if exists
                const gapAfter = gaps.find(gap => gap.afterTime === session.endTime);
                if (gapAfter) {
                    grid += `<div class="gap-indicator">⏰ ${gapAfter.gapText}</div>`;
                }
            }
        }
        
        grid += '</div></div>';
    }
    
    grid += '</div>';
    
    // Add total gaps summary
    const totalGapMinutes = Object.values(dailyGaps).reduce((total, dayGaps) => {
        return total + dayGaps.reduce((dayTotal, gap) => dayTotal + gap.gapMinutes, 0);
    }, 0);
    
    if (totalGapMinutes > 0) {
        const totalHours = Math.floor(totalGapMinutes / 60);
        const totalMins = totalGapMinutes % 60;
        grid += `
            <div style="margin-top: 15px; padding: 15px; background: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.4); border-radius: 8px; text-align: center; color: rgba(255, 255, 255, 0.9); font-weight: 600;">
                إجمالي الفراغات: ${totalHours > 0 ? `${totalHours} ساعة ` : ''}${totalMins > 0 ? `${totalMins} دقيقة` : ''}
            </div>
        `;
    }
    
    return grid;
}

// Export schedule (placeholder for future implementation)
function exportSchedule(scheduleIndex) {
    showToast(`تصدير الجدول رقم ${scheduleIndex} - هذه الميزة قيد التطوير`, 'info');
}

// Make exportSchedule globally accessible
window.exportSchedule = exportSchedule;

// ===============================================
// INITIALIZATION
// ===============================================
// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// ===============================================
// Development console output
// ===============================================
console.log('%cSchedule Builder Module Loaded', 'color: #667eea; font-size: 16px; font-weight: bold;');
console.log('%cAlgorithm: Conflict-free schedule generation with backtracking', 'color: #764ba2; font-size: 12px;');