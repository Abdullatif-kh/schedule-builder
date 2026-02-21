// ===============================================
// SCHEDULE BUILDER SCRIPT
// Complete schedule generation tool with conflict detection
// ===============================================

// ===============================================
// GLOBAL STATE MANAGEMENT
// ===============================================
let coursesData = null;             // Loaded course data from JSON
let selectedCourses = new Set();     // User-selected courses
let mandatoryCourses = new Set();    // Mandatory courses (must be in every schedule)
let registeredSections = new Set();  // Previously registered sections (high priority)
let courseUnits = {};                // Course units (theoretical + practical combined)

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
    
    // Registered sections
    registeredSectionsInput: document.getElementById('registeredSectionsInput'),
    registeredSectionsDisplay: document.getElementById('registeredSectionsDisplay'),
    
    // Day selection
    dayCheckboxes: Array.from({length: 5}, (_, i) => document.getElementById(`day_${i+1}`)),
    
    // Actions
    generateBtn: document.getElementById('generateBtn'),
    
    // Results
    loadingState: document.getElementById('loadingState'),
    resultsSection: document.getElementById('resultsSection'),
    resultsCount: document.getElementById('resultsCount'),
    schedulesGrid: document.getElementById('schedulesGrid'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage')
};

// ===============================================
// INITIALIZATION
// ===============================================
function init() {
    // Check if course data exists in session storage
    const storedData = sessionStorage.getItem('courseData');
    
    if (!storedData) {
        showToast('لم يتم العثور على بيانات المواد', 'error');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return;
    }
    
    try {
        // Parse and decode course data
        const rawData = JSON.parse(storedData);
        coursesData = decodeCoursesData(rawData);
        
        // Setup UI
        setupCourseUnits();
        setupCourseSelection();
        setupEventListeners();
        
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

// Validate that a schedule has no conflicts
function isValidSchedule(units) {
    const allSessions = [];
    
    // Collect all sessions from all units
    units.forEach(unit => {
        if (unit.theoretical && unit.theoretical.schedule && unit.theoretical.schedule.sessions) {
            allSessions.push(...unit.theoretical.schedule.sessions);
        }
        if (unit.practical && unit.practical.schedule && unit.practical.schedule.sessions) {
            allSessions.push(...unit.practical.schedule.sessions);
        }
    });
    
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

// Calculate score for a schedule (higher is better)
function calculateScheduleScore(units) {
    let score = 100; // Base score
    
    units.forEach(unit => {
        // Theoretical section scoring
        if (unit.theoretical) {
            if (registeredSections.has(unit.theoretical.sectionId)) {
                score += 100; // Highest priority for registered sections
            } else if (unit.theoretical.status === 'مفتوحة') {
                score += 20; // Bonus for open sections
            } else {
                score -= 5; // Penalty for closed sections
            }
        }
        
        // Practical section scoring
        if (unit.practical) {
            if (registeredSections.has(unit.practical.sectionId)) {
                score += 50; // High priority for registered practical
            } else if (unit.practical.status === 'مفتوحة') {
                score += 10; // Bonus for open practical
            } else {
                score -= 3; // Penalty for closed practical
            }
        }
    });
    
    // Calculate and penalize gaps
    const dailyGaps = calculateDailyGaps(units);
    const totalGapMinutes = Object.values(dailyGaps).reduce((total, dayGaps) => {
        return total + dayGaps.reduce((dayTotal, gap) => dayTotal + gap.gapMinutes, 0);
    }, 0);
    
    // Penalty for gaps (prefer compact schedules)
    score -= Math.floor(totalGapMinutes / 10);
    
    return score;
}

// Calculate gaps between sessions for each day
function calculateDailyGaps(units) {
    const dailySchedules = {};
    const dailyGaps = {};
    
    // Organize sessions by day
    units.forEach(unit => {
        const sessions = [];
        if (unit.theoretical && unit.theoretical.schedule && unit.theoretical.schedule.sessions) {
            sessions.push(...unit.theoretical.schedule.sessions);
        }
        if (unit.practical && unit.practical.schedule && unit.practical.schedule.sessions) {
            sessions.push(...unit.practical.schedule.sessions);
        }
        
        sessions.forEach(session => {
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

// Comprehensive schedule generation algorithm
function generateAllSchedulesComprehensive() {
    const startTime = performance.now();
    
    // Get settings
    const minCredits = parseInt(DOM.minCredits.value);
    const maxCredits = parseInt(DOM.maxCredits.value);
    const maxResults = parseInt(DOM.maxResults.value);
    const includeClosedSections = DOM.includeClosedSections.checked;
    const allowPartialSchedules = DOM.allowPartialSchedules.checked;
    
    const allSchedules = [];
    const selectedCoursesArray = Array.from(selectedCourses);
    
    // Prepare course options (filter by availability if needed)
    const courseOptions = selectedCoursesArray.map(courseCode => {
        let units = courseUnits[courseCode];
        
        // Filter out closed sections if not including them
        if (!includeClosedSections) {
            units = units.filter(unit => {
                const theoreticalOpen = !unit.theoretical || unit.theoretical.status === 'مفتوحة' || registeredSections.has(unit.theoretical.sectionId);
                const practicalOpen = !unit.practical || unit.practical.status === 'مفتوحة' || registeredSections.has(unit.practical.sectionId);
                return theoreticalOpen && practicalOpen;
            });
        }
        
        return {
            code: courseCode,
            units: units,
            isMandatory: mandatoryCourses.has(courseCode)
        };
    }).filter(option => option.units.length > 0);
    
    // Separate mandatory and optional courses
    const mandatoryOptions = courseOptions.filter(opt => opt.isMandatory);
    const optionalOptions = courseOptions.filter(opt => !opt.isMandatory);
    
    console.log(`Generating schedules...`);
    console.log(`Mandatory courses: ${mandatoryOptions.length}`);
    console.log(`Optional courses: ${optionalOptions.length}`);
    
    // Recursive function to generate combinations
    function generateCombinations(currentSchedule, courseIndex, totalCredits) {
        // Check if we've reached max results
        if (maxResults > 0 && allSchedules.length >= maxResults) {
            return;
        }
        
        // Check if current schedule meets criteria
        if (totalCredits >= minCredits) {
            // Validate schedule
            if (isValidSchedule(currentSchedule)) {
                const score = calculateScheduleScore(currentSchedule);
                allSchedules.push({
                    units: [...currentSchedule],
                    totalCredits: totalCredits,
                    score: score
                });
            }
        }
        
        // Stop if we've processed all courses or exceeded max credits
        if (courseIndex >= optionalOptions.length || totalCredits >= maxCredits) {
            return;
        }
        
        // Try adding each unit of current course
        const currentCourse = optionalOptions[courseIndex];
        for (const unit of currentCourse.units) {
            const newCredits = totalCredits + unit.totalCredits;
            
            // Check if adding this unit keeps us within credit limits
            if (newCredits <= maxCredits) {
                // Check for conflicts with current schedule
                let hasConflict = false;
                for (const existingUnit of currentSchedule) {
                    const sessions1 = [];
                    const sessions2 = [];
                    
                    // Collect sessions from new unit
                    if (unit.theoretical && unit.theoretical.schedule) {
                        sessions1.push(...unit.theoretical.schedule.sessions);
                    }
                    if (unit.practical && unit.practical.schedule) {
                        sessions1.push(...unit.practical.schedule.sessions);
                    }
                    
                    // Collect sessions from existing unit
                    if (existingUnit.theoretical && existingUnit.theoretical.schedule) {
                        sessions2.push(...existingUnit.theoretical.schedule.sessions);
                    }
                    if (existingUnit.practical && existingUnit.practical.schedule) {
                        sessions2.push(...existingUnit.practical.schedule.sessions);
                    }
                    
                    if (hasTimeConflict(sessions1, sessions2)) {
                        hasConflict = true;
                        break;
                    }
                }
                
                // Add unit if no conflict
                if (!hasConflict) {
                    currentSchedule.push(unit);
                    generateCombinations(currentSchedule, courseIndex + 1, newCredits);
                    currentSchedule.pop();
                }
            }
        }
        
        // Try skipping this course (if partial schedules allowed)
        if (allowPartialSchedules) {
            generateCombinations(currentSchedule, courseIndex + 1, totalCredits);
        }
    }
    
    // Start with mandatory courses
    const mandatorySchedules = generateMandatoryCombinations(mandatoryOptions);
    
    if (mandatorySchedules.length === 0 && mandatoryOptions.length > 0) {
        console.log('No valid combination found for mandatory courses!');
        return [];
    }
    
    // Generate all combinations starting from each mandatory schedule
    if (mandatorySchedules.length > 0) {
        for (const mandatorySchedule of mandatorySchedules) {
            generateCombinations(mandatorySchedule.units, 0, mandatorySchedule.totalCredits);
            
            // Break if we've reached max results
            if (maxResults > 0 && allSchedules.length >= maxResults) {
                break;
            }
        }
    } else {
        // No mandatory courses, start from scratch
        generateCombinations([], 0, 0);
    }
    
    // Sort schedules by score (highest first)
    allSchedules.sort((a, b) => b.score - a.score);
    
    const endTime = performance.now();
    console.log(`Generated ${allSchedules.length} schedules in ${(endTime - startTime).toFixed(2)}ms`);
    
    return allSchedules;
}

// Generate combinations for mandatory courses only
function generateMandatoryCombinations(mandatoryOptions) {
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
            
            // Check for conflicts
            let hasConflict = false;
            for (const existingUnit of currentSchedule) {
                const sessions1 = [];
                const sessions2 = [];
                
                if (unit.theoretical && unit.theoretical.schedule) {
                    sessions1.push(...unit.theoretical.schedule.sessions);
                }
                if (unit.practical && unit.practical.schedule) {
                    sessions1.push(...unit.practical.schedule.sessions);
                }
                
                if (existingUnit.theoretical && existingUnit.theoretical.schedule) {
                    sessions2.push(...existingUnit.theoretical.schedule.sessions);
                }
                if (existingUnit.practical && existingUnit.practical.schedule) {
                    sessions2.push(...existingUnit.practical.schedule.sessions);
                }
                
                if (hasTimeConflict(sessions1, sessions2)) {
                    hasConflict = true;
                    break;
                }
            }
            
            if (!hasConflict) {
                currentSchedule.push(unit);
                generate(currentSchedule, courseIndex + 1, newCredits);
                currentSchedule.pop();
            }
        }
    }
    
    generate([], 0, 0);
    return validCombinations;
}
// ===============================================
// RESULTS DISPLAY
// Functions for rendering generated schedules
// ===============================================

function displayResults(schedules) {
    DOM.loadingState.style.display = 'none';
    
    if (schedules.length === 0) {
        DOM.resultsSection.style.display = 'block';
        DOM.schedulesGrid.innerHTML = `
            <div class="glass-card" style="padding: 60px; text-align: center;">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 20px; opacity: 0.5;">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <h2 style="color: rgba(255, 255, 255, 0.9); margin-bottom: 15px;">لا توجد جداول متاحة</h2>
                <p style="color: rgba(255, 255, 255, 0.7); font-size: 1.1rem;">جرب تعديل خياراتك أو تضمين الشعب المغلقة</p>
            </div>
        `;
        return;
    }
    
    DOM.resultsSection.style.display = 'block';
    DOM.resultsCount.textContent = `${schedules.length} جدول`;
    DOM.schedulesGrid.innerHTML = '';
    
    // Display each schedule
    schedules.forEach((schedule, index) => {
        const scheduleCard = createScheduleCard(schedule, index + 1);
        DOM.schedulesGrid.appendChild(scheduleCard);
    });
    
    // Scroll to results
    DOM.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    showToast(`تم توليد ${schedules.length} جدول بنجاح`, 'success');
}

function createScheduleCard(schedule, index) {
    const card = document.createElement('div');
    card.className = 'schedule-card glass-card';
    
    const { units, totalCredits, score } = schedule;
    
    // Calculate statistics
    let mandatoryCount = 0;
    let optionalCount = 0;
    let openSections = 0;
    let closedSections = 0;
    let registeredSectionCount = 0;
    
    units.forEach(unit => {
        const courseCode = unit.theoretical ? unit.theoretical.code : unit.practical.code;
        
        if (mandatoryCourses.has(courseCode)) {
            mandatoryCount++;
        } else {
            optionalCount++;
        }
        
        if (unit.theoretical) {
            if (registeredSections.has(unit.theoretical.sectionId)) {
                registeredSectionCount++;
            } else if (unit.theoretical.status === 'مفتوحة') {
                openSections++;
            } else {
                closedSections++;
            }
        }
        
        if (unit.practical) {
            if (registeredSections.has(unit.practical.sectionId)) {
                registeredSectionCount++;
            } else if (unit.practical.status === 'مفتوحة') {
                openSections++;
            } else {
                closedSections++;
            }
        }
    });
    
    const dailyGaps = calculateDailyGaps(units);
    const totalGapMinutes = Object.values(dailyGaps).reduce((total, dayGaps) => {
        return total + dayGaps.reduce((dayTotal, gap) => dayTotal + gap.gapMinutes, 0);
    }, 0);
    
    const gapHours = Math.floor(totalGapMinutes / 60);
    const gapMins = totalGapMinutes % 60;
    const gapText = totalGapMinutes > 0 ? 
        `${gapHours > 0 ? gapHours + 'س ' : ''}${gapMins > 0 ? gapMins + 'د' : ''}` : 
        'لا يوجد';
    
    const daysUsed = Object.keys(dailyGaps).length;
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
                                <strong style="color: #2d3748;">د. ${session.section.instructor}</strong><br>
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