// ===============================================
// LANDING PAGE SCRIPT
// Handles file upload, script display, and navigation
// ===============================================

// ===============================================
// SCRAPER SCRIPT CODE
// This is the university courses scraper script
// ===============================================
const SCRAPER_SCRIPT = `// ===============================================
// University Courses Scraper Script
// Supports multiple days parsing and automatic data extraction
// ===============================================

class UniversityCoursesScraper {
    constructor() {
        this.allCourses = [];
        this.processedSections = new Set();
        
        // Speed configuration settings
        this.speedSettings = {
            modalWaitTime: 50,
            betweenSectionsDelay: 5,
            fastMode: false
        };
        
        // Enable fast mode if configured
        if (this.speedSettings.fastMode) {
            this.speedSettings.modalWaitTime = 400;
            this.speedSettings.betweenSectionsDelay = 100;
            console.log('⚡ Fast mode enabled!');
        }
        
        // Day mapping (Arabic day names)
        this.dayMapping = {
            "1": "الأحد",
            "2": "الاثنين", 
            "3": "الثلاثاء",
            "4": "الأربعاء",
            "5": "الخميس"
        };
    }

    // Parse Arabic time format to 24-hour format
    parseTime(timeString) {
        if (!timeString) return { startTime: null, endTime: null };
        
        const timePattern = /(\\\d{1,2}):(\\\d{2})\\\s*(ص|م)\\\s*-\\\s*(\\\d{1,2}):(\\\d{2})\\\s*(ص|م)/;
        const match = timeString.match(timePattern);
        
        if (!match) return { startTime: null, endTime: null };
        
        const [, startHour, startMin, startPeriod, endHour, endMin, endPeriod] = match;
        
        let start24Hour = parseInt(startHour);
        let end24Hour = parseInt(endHour);
        
        // Convert to 24-hour format
        if (startPeriod === 'م' && start24Hour !== 12) {
            start24Hour += 12;
        } else if (startPeriod === 'ص' && start24Hour === 12) {
            start24Hour = 0;
        }
        
        if (endPeriod === 'م' && end24Hour !== 12) {
            end24Hour += 12;
        } else if (endPeriod === 'ص' && end24Hour === 12) {
            end24Hour = 0;
        }
        
        return {
            startTime: \`\${start24Hour.toString().padStart(2, '0')}:\${startMin}\`,
            endTime: \`\${end24Hour.toString().padStart(2, '0')}:\${endMin}\`
        };
    }

    // Parse multiple days from text (supports various formats)
    parseMultipleDays(dayText) {
        if (!dayText) return [];
        
        const dayText_cleaned = dayText.trim();
        const days = [];
        
        console.log(\`🔍 Parsing day text: "\${dayText_cleaned}"\`);
        
        // Different patterns for multiple days
        const patterns = [
            // Pattern: "4 1" (space-separated days)
            {
                regex: /^([1-5])\\\s+([1-5])$/,
                handler: (match) => [match[1], match[2]]
            },
            // Pattern: "41" (concatenated days)
            {
                regex: /^([1-5])([1-5])$/,
                handler: (match) => [match[1], match[2]]
            },
            // Pattern: "4,1" or "4،1" (comma-separated)
            {
                regex: /^([1-5])[,،]\\\s*([1-5])$/,
                handler: (match) => [match[1], match[2]]
            },
            // Pattern: "1 3 5" (three or more days)
            {
                regex: /^([1-5])(\\\s+[1-5])+$/,
                handler: (match) => dayText_cleaned.split(/\\\s+/).filter(d => /^[1-5]$/.test(d))
            },
            // Pattern: single day
            {
                regex: /^([1-5])$/,
                handler: (match) => [match[1]]
            }
        ];
        
        // Try each pattern
        for (const pattern of patterns) {
            const match = dayText_cleaned.match(pattern.regex);
            if (match) {
                const extractedDays = pattern.handler(match);
                console.log(\`Extracted days: [\${extractedDays.join(', ')}]\`);
                return extractedDays.map(day => ({
                    number: parseInt(day),
                    name: this.dayMapping[day]
                }));
            }
        }
        
        console.log(\`Day pattern not recognized: "\${dayText_cleaned}"\`);
        return [];
    }

    // Extract basic course data from table rows
    extractBasicData() {
        console.log('🔍 Extracting basic course data...');
        
        const tables = document.querySelectorAll('table');
        let coursesTable = null;
        let maxRows = 0;
        
        // Find the main courses table (largest table with many rows)
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr').length;
            if (rows > maxRows && rows > 15) {
                maxRows = rows;
                coursesTable = table;
            }
        });
        
        if (!coursesTable) {
            console.log('Courses table not found');
            return [];
        }
        
        console.log(\`Courses table identified (\${maxRows} rows)\`);
        
        const courses = [];
        const rows = Array.from(coursesTable.querySelectorAll('tr'));
        
        // Process each row (skip header)
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = Array.from(row.querySelectorAll('td'));
            
            if (cells.length < 6) continue;
            
            const courseData = this.extractCourseFromRow(cells, i, row);
            if (courseData) {
                courses.push(courseData);
            }
        }
        
        console.log(\`Extracted \${courses.length} sections\`);
        return courses;
    }

    // Extract course data from a single table row
    extractCourseFromRow(cells, rowIndex, rowElement) {
        const cellTexts = cells.map(cell => {
            const text = cell.textContent.trim();
            return text.replace(/التفاصيل.*$/g, '').trim();
        });
        
        console.log(\`📊 Row \${rowIndex}: [\${cellTexts.join(' | ')}]\`);
        
        // Find details button
        const detailsButton = rowElement.querySelector('a[onclick], button[onclick]') ||
                             Array.from(rowElement.querySelectorAll('*')).find(el => 
                                 el.textContent.includes('التفاصيل')
                             );
        
        let courseCode = null;
        let courseName = null;
        let sectionId = null;
        let courseType = null;
        let creditHours = null;
        let status = null;
        
        // Extract course code (format: ABC123 or ABCD1234)
        for (let i = cellTexts.length - 1; i >= 0; i--) {
            const text = cellTexts[i];
            if (/^[a-zA-Zأ-ي]{2,4}\\\s*\\\d{3,4}$/.test(text)) {
                courseCode = text;
                break;
            }
        }
        
        // Extract section ID (4-digit number)
        for (const text of cellTexts) {
            if (/^\\\d{4}$/.test(text)) {
                sectionId = text;
                break;
            }
        }
        
        // Extract course name (longest non-numeric text)
        for (const text of cellTexts) {
            if (text && text.length > 3 && 
                !(/^\\\d+$/.test(text)) && 
                text !== courseCode && 
                text !== 'نظري' && text !== 'عملي' && 
                text !== 'مغلقة' && text !== 'مفتوحة' &&
                text !== sectionId) {
                courseName = text;
                break;
            }
        }
        
        // Extract course type (theoretical or practical)
        for (const text of cellTexts) {
            if (text === 'نظري' || text === 'عملي') {
                courseType = text;
                break;
            }
        }
        
        // Extract credit hours (single digit 1-8)
        for (const text of cellTexts) {
            if (/^\\\d{1}$/.test(text) && parseInt(text) >= 1 && parseInt(text) <= 8 && text !== sectionId) {
                creditHours = text;
                break;
            }
        }
        
        // Extract section status (open or closed)
        for (const text of cellTexts) {
            if (text === 'مغلقة' || text === 'مفتوحة') {
                status = text;
                break;
            }
        }
        
        console.log(\`🔍 Extracted: code="\${courseCode}" | name="\${courseName}" | section="\${sectionId}" | type="\${courseType}" | hours="\${creditHours}" | status="\${status}"\`);
        
        if (!courseCode || !sectionId) {
            console.log(\`⚠️ Incomplete data in row \${rowIndex}\`);
            return null;
        }
        
        return {
            code: courseCode,
            name: courseName || 'غير محدد',
            sectionId: sectionId,
            type: courseType || 'غير محدد',
            creditHours: creditHours || '0',
            status: status || 'غير محدد',
            detailsButton: detailsButton
        };
    }

    // Get schedule details by clicking the details button
    async getScheduleDetails(courseData) {
        const uniqueKey = \`\${courseData.code}_\${courseData.sectionId}\`;
        
        if (this.processedSections.has(uniqueKey)) {
            console.log(\`⏭️ Section already processed: \${uniqueKey}\`);
            return { instructor: 'معالج سابقاً', sessions: [] };
        }
        
        this.processedSections.add(uniqueKey);
        
        if (!courseData.detailsButton) {
            console.log('Details button not found');
            return { instructor: 'غير محدد', sessions: [] };
        }
        
        try {
            console.log(\`🔘 Clicking details button for: \${courseData.code} - \${courseData.sectionId}\`);
            courseData.detailsButton.click();
            
            await new Promise(resolve => setTimeout(resolve, this.speedSettings.modalWaitTime));
            
            const scheduleData = this.extractScheduleFromModal();
            
            this.closeModal();
            
            return scheduleData;
        } catch (error) {
            console.error(\`Error getting schedule: \${error.message}\`);
            return { instructor: 'خطأ', sessions: [] };
        }
    }

    // Extract schedule information from the modal
    extractScheduleFromModal() {
        console.log('📋 Extracting schedule from modal...');
        
        const modalTables = document.querySelectorAll('.modal table, [role="dialog"] table, .popup table');
        
        if (modalTables.length === 0) {
            console.log('No table found in modal');
            return { instructor: 'غير متاح', sessions: [] };
        }
        
        let scheduleTable = null;
        let maxRows = 0;
        
        modalTables.forEach(table => {
            const rows = table.querySelectorAll('tr').length;
            if (rows > maxRows) {
                maxRows = rows;
                scheduleTable = table;
            }
        });
        
        if (!scheduleTable) {
            console.log('Schedule table not found');
            return { instructor: 'غير متاح', sessions: [] };
        }
        
        console.log(\`Schedule table found with \${maxRows} rows\`);
        
        const rows = Array.from(scheduleTable.querySelectorAll('tr'));
        let instructor = 'غير محدد';
        const sessions = [];
        const uniqueSessions = new Set();
        
        // Extract instructor name and session details
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cells = Array.from(row.querySelectorAll('td'));
            
            if (cells.length === 0) continue;
            
            const cellTexts = cells.map(c => c.textContent.trim());
            console.log(\`📊 Modal row \${i}: [\${cellTexts.join(' | ')}]\`);
            
            // Extract instructor name
            if (instructor === 'غير محدد') {
                for (const text of cellTexts) {
                    if (text && text.length > 3 && 
                        !(/^\\\d+$/.test(text)) && 
                        text !== 'اليوم' && text !== 'الوقت' && text !== 'القاعة' &&
                        !text.includes(':') && !text.includes('ص') && !text.includes('م')) {
                        instructor = text;
                        console.log(\`👨‍🏫 Instructor found: "\${instructor}"\`);
                        break;
                    }
                }
            }
            
            // Extract session details (day, time, room)
            let dayText = null;
            let timeString = null;
            let room = null;
            
            for (const text of cellTexts) {
                // Look for time pattern (e.g., "8:00 ص - 9:00 ص")
                if (!timeString && /\\\d{1,2}:\\\d{2}\\\s*(ص|م)/.test(text)) {
                    timeString = text;
                    console.log(\`⏰ Time found: "\${timeString}"\`);
                }
                
                // Look for day pattern (e.g., "4", "4 1", "41")
                if (!dayText && /^[1-5](\\\s*[1-5])*$/.test(text)) {
                    dayText = text;
                    console.log(\`📅 Day found: "\${dayText}"\`);
                }
                
                // Look for room number (avoid confusing with days)
                if (!room && /^\\\d{2,4}$/.test(text) && text !== dayText) {
                    room = text;
                    console.log(\`🏢 Room found: "\${room}"\`);
                }
            }
            
            // Process extracted data
            if (dayText && timeString) {
                console.log(\`🔄 Processing: days="\${dayText}" | time="\${timeString}" | room="\${room}"\`);
                
                const days = this.parseMultipleDays(dayText);
                const { startTime, endTime } = this.parseTime(timeString);
                
                if (startTime && endTime && days.length > 0) {
                    // Create separate session for each day
                    days.forEach(dayInfo => {
                        const sessionKey = \`\${dayInfo.number}_\${startTime}_\${endTime}_\${room}\`;
                        
                        if (!uniqueSessions.has(sessionKey)) {
                            uniqueSessions.add(sessionKey);
                            sessions.push({
                                day: dayInfo.number,
                                dayName: dayInfo.name,
                                startTime: startTime,
                                endTime: endTime,
                                room: room || 'غير محدد'
                            });
                            console.log(\`New session: \${dayInfo.name} \${startTime}-\${endTime} room \${room}\`);
                        }
                    });
                }
            } else {
                console.log(\`⚠️ Incomplete data in row \${i}: days="\${dayText}" | time="\${timeString}"\`);
            }
        }
        
        console.log(\`Extracted \${sessions.length} sessions for instructor: \${instructor}\`);
        return { instructor, sessions };
    }

    // Close the modal window
    closeModal() {
        try {
            const closeSelectors = [
                'button[onclick*="close"]',
                'a[onclick*="close"]',
                '[class*="close"]',
                'button:contains("×")',
                'button:contains("إغلاق")'
            ];
            
            for (const selector of closeSelectors) {
                const closeBtn = document.querySelector(selector);
                if (closeBtn) {
                    closeBtn.click();
                    break;
                }
            }
            
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            
        } catch (error) {
            console.log('Could not close modal automatically');
        }
    }

    // Main scraping function
    async scrapeCurrentPage() {
        console.log('🚀 Starting data scraping with details (supports multiple days)...\\n');
        
        const basicCourses = this.extractBasicData();
        
        if (basicCourses.length === 0) {
            alert('No courses found on this page');
            return;
        }
        
        console.log(\`📊 Will process \${basicCourses.length} sections...\\n\`);
        console.log('🔧 Skipping first section to fix extraction issue...');
        
        // Process all sections (skip first to avoid issues)
        for (let i = 1; i < basicCourses.length; i++) {
            const courseData = basicCourses[i];
            
            console.log(\`🔄 Section \${i}/\${basicCourses.length - 1}: \${courseData.code} - \${courseData.sectionId}\`);
            
            const scheduleInfo = await this.getScheduleDetails(courseData);
            
            const completeCourse = {
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
            };
            
            this.allCourses.push(completeCourse);
            await new Promise(resolve => setTimeout(resolve, this.speedSettings.betweenSectionsDelay));
        }
        
        console.log(\`Skipped first section and processed \${this.allCourses.length} sections\`);
        this.createFinalJSON();
    }

    // Create and download final JSON output
    createFinalJSON() {
        console.log('\\n🎯 Creating final JSON...');
        console.log(\`📊 Total sections: \${this.allCourses.length}\`);
        
        const jsonOutput = {
            courses: this.allCourses,
            dayMapping: this.dayMapping,
            summary: {
                totalSessions: this.allCourses.reduce((sum, course) => sum + course.schedule.sessions.length, 0),
                sectionsWithSchedule: this.allCourses.filter(c => c.schedule.sessions.length > 0).length,
                sectionsByStatus: this.getStatusSummary()
            }
        };
        
        const jsonString = JSON.stringify(jsonOutput, null, 2);
        
        // Copy to clipboard
        navigator.clipboard.writeText(jsonString).then(() => {
            console.log('JSON copied successfully!');
            this.downloadJSON(jsonOutput);
            alert(\`🎉 Successfully extracted \${this.allCourses.length} sections!\\n\\n📋 JSON copied to clipboard\\n💾 JSON file will download automatically\\n\\n🆕 Now supports multiple days!\`);
        }).catch(err => {
            console.error('Copy error:', err);
            this.downloadJSON(jsonOutput);
        });
        
        console.log('\\n📊 Sample data:');
        console.table(this.allCourses.slice(0, 3));
    }

    // Download JSON file
    downloadJSON(jsonData) {
        try {
            const jsonString = JSON.stringify(jsonData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = \`islamic_university_courses_\${new Date().toISOString().slice(0, 10)}.json\`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log('💾 JSON file downloaded!');
        } catch (error) {
            console.error('Download error:', error);
        }
    }

    // Set custom speed settings
    setSpeed(modalWait = 800, betweenSections = 200) {
        this.speedSettings.modalWaitTime = modalWait;
        this.speedSettings.betweenSectionsDelay = betweenSections;
        this.speedSettings.fastMode = false;
        console.log(\`⚡ Speed customized: modal=\${modalWait}ms, betweenSections=\${betweenSections}ms\`);
        return this;
    }

    // Get status summary statistics
    getStatusSummary() {
        const summary = {};
        this.allCourses.forEach(course => {
            const status = course.status;
            summary[status] = (summary[status] || 0) + 1;
        });
        return summary;
    }

    // Enable fast mode
    enableFastMode() {
        this.speedSettings.fastMode = true;
        this.speedSettings.modalWaitTime = 400;
        this.speedSettings.betweenSectionsDelay = 100;
        console.log('🚀 Fast mode enabled!');
        return this;
    }

    // Enable turbo mode (very fast)
    enableTurboMode() {
        this.speedSettings.fastMode = true;
        this.speedSettings.modalWaitTime = 200;
        this.speedSettings.betweenSectionsDelay = 50;
        console.log('⚡🚀 Turbo mode enabled!');
        return this;
    }

    // Enable safe mode (slower but more reliable)
    enableSafeMode() {
        this.speedSettings.fastMode = false;
        this.speedSettings.modalWaitTime = 1200;
        this.speedSettings.betweenSectionsDelay = 300;
        console.log('🛡️ Safe mode enabled');
        return this;
    }

    // Show current settings
    showSettings() {
        console.log('⚙️ Current settings:');
        console.log(\`   Modal wait: \${this.speedSettings.modalWaitTime}ms\`);
        console.log(\`   Between sections: \${this.speedSettings.betweenSectionsDelay}ms\`);
        console.log(\`   Fast mode: \${this.speedSettings.fastMode ? 'Enabled' : 'Disabled'}\`);
        return this;
    }
}

// Initialize and run the scraper
console.log('Islamic University Script Updated');
console.log('🆕 Now supports multiple days (e.g., "4 1" = Sunday and Wednesday)');

const scraper = new UniversityCoursesScraper();

console.log('\\n📋 Options:');
console.log('🚀 scraper.enableFastMode().scrapeCurrentPage() - Run in fast mode');
console.log('⚡ scraper.enableTurboMode().scrapeCurrentPage() - Super fast mode');

console.log('\\n🆕 New features:');
console.log('Supports multiple days: "4 1", "41", "4,1"');
console.log('Creates separate session for each day');
console.log('Handles spaces and commas');

// Auto-start with fast mode after 3 seconds
setTimeout(() => {
    console.log('\\n🚀 Auto-starting in fast mode...');
    scraper.enableFastMode().scrapeCurrentPage();
}, 3000);`;

// ===============================================
// DOM ELEMENTS
// ===============================================
const elements = {
    // File upload
    uploadZone: document.getElementById('uploadZone'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    removeFileBtn: document.getElementById('removeFileBtn'),
    
    // Script buttons
    copyScriptBtn: document.getElementById('copyScriptBtn'),
    downloadScriptBtn: document.getElementById('downloadScriptBtn'),
    
    // Generate button
    generateBtn: document.getElementById('generateBtn'),
    
    // Modal
    scriptModal: document.getElementById('scriptModal'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    scriptCode: document.getElementById('scriptCode'),
    modalCopyBtn: document.getElementById('modalCopyBtn'),
    modalDownloadBtn: document.getElementById('modalDownloadBtn'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage')
};

// ===============================================
// STATE MANAGEMENT
// ===============================================
let uploadedFile = null;
let courseData = null;

// ===============================================
// FILE UPLOAD HANDLERS
// ===============================================

// Click to browse files
elements.uploadZone.addEventListener('click', () => {
    elements.fileInput.click();
});

// Handle file selection
elements.fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
});

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    elements.uploadZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight drop zone when dragging over it
['dragenter', 'dragover'].forEach(eventName => {
    elements.uploadZone.addEventListener(eventName, () => {
        elements.uploadZone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    elements.uploadZone.addEventListener(eventName, () => {
        elements.uploadZone.classList.remove('dragover');
    }, false);
});

// Handle dropped files
elements.uploadZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFile(files[0]);
}, false);

// Process uploaded file
function handleFile(file) {
    if (!file) return;
    
    // Validate file type
    if (!file.name.endsWith('.json')) {
        showToast('يرجى رفع ملف JSON فقط', 'error');
        return;
    }
    
    uploadedFile = file;
    
    // Show file info
    elements.fileName.textContent = file.name;
    elements.fileSize.textContent = formatFileSize(file.size);
    elements.fileInfo.style.display = 'flex';
    elements.uploadZone.style.display = 'none';
    
    // Enable generate button
    elements.generateBtn.disabled = false;
    
    // Read and parse file
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            courseData = JSON.parse(e.target.result);
            showToast('تم تحميل الملف بنجاح', 'success');
            console.log('Course data loaded:', courseData);
        } catch (error) {
            showToast('خطأ في قراءة الملف', 'error');
            console.error('Error parsing JSON:', error);
            removeFile();
        }
    };
    reader.readAsText(file);
}

// Remove uploaded file
elements.removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeFile();
});

function removeFile() {
    uploadedFile = null;
    courseData = null;
    elements.fileInput.value = '';
    elements.fileInfo.style.display = 'none';
    elements.uploadZone.style.display = 'block';
    elements.generateBtn.disabled = true;
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ===============================================
// SCRIPT MANAGEMENT
// ===============================================

// Copy script to clipboard
elements.copyScriptBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(SCRAPER_SCRIPT);
        showToast('تم نسخ السكربت', 'success');
    } catch (err) {
        console.error('Failed to copy:', err);
        showToast('فشل النسخ', 'error');
    }
});

// Download script as file
elements.downloadScriptBtn.addEventListener('click', () => {
    downloadScript();
});

// Show script in modal
function showScriptModal() {
    elements.scriptCode.textContent = SCRAPER_SCRIPT;
    elements.scriptModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Hide script modal
function hideScriptModal() {
    elements.scriptModal.classList.remove('active');
    document.body.style.overflow = '';
}

// Modal close handlers
elements.modalCloseBtn.addEventListener('click', hideScriptModal);
elements.modalOverlay.addEventListener('click', hideScriptModal);

// Prevent modal from closing when clicking on modal content
document.querySelector('.modal-content')?.addEventListener('click', (e) => {
    e.stopPropagation();
});

// Modal copy button
elements.modalCopyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(SCRAPER_SCRIPT);
        showToast('تم نسخ السكربت', 'success');
    } catch (err) {
        console.error('Failed to copy:', err);
        showToast('فشل النسخ', 'error');
    }
});

// Modal download button
elements.modalDownloadBtn.addEventListener('click', () => {
    downloadScript();
});

// Download script function
function downloadScript() {
    const blob = new Blob([SCRAPER_SCRIPT], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'university-courses-scraper.js';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('تم تحميل السكربت', 'success');
}

// ===============================================
// NAVIGATION
// ===============================================

// Navigate to schedule builder
elements.generateBtn.addEventListener('click', () => {
    if (!courseData) {
        showToast('يرجى رفع ملف المواد أولاً', 'error');
        return;
    }
    
    // Store data in sessionStorage
    sessionStorage.setItem('courseData', JSON.stringify(courseData));
    
    // Navigate to schedule builder page
    window.location.href = 'schedule-builder.html';
});

// ===============================================
// TOAST NOTIFICATION
// ===============================================
function showToast(message, type = 'success') {
    elements.toastMessage.textContent = message;
    
    // Set toast color based on type
    if (type === 'success') {
        elements.toast.style.background = 'rgba(39, 174, 96, 0.95)';
    } else if (type === 'error') {
        elements.toast.style.background = 'rgba(231, 76, 60, 0.95)';
    } else if (type === 'warning') {
        elements.toast.style.background = 'rgba(243, 156, 18, 0.95)';
    } else {
        elements.toast.style.background = 'rgba(52, 152, 219, 0.95)';
    }
    
    elements.toast.classList.add('show');
    
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 3000);
}

// ===============================================
// KEYBOARD SHORTCUTS
// ===============================================
document.addEventListener('keydown', (e) => {
    // ESC to close modal
    if (e.key === 'Escape' && elements.scriptModal.classList.contains('active')) {
        hideScriptModal();
    }
});

// ===============================================
// PAGE LOAD ANIMATION
// ===============================================
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    }, 100);
});

// ===============================================
// Development console output
// ===============================================
console.log('%cSchedule Generator - Landing Page Loaded', 'color: #667eea; font-size: 16px; font-weight: bold;');
console.log('%cCourse data scraper and file upload ready', 'color: #764ba2; font-size: 12px;');