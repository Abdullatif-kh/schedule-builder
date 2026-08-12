// ===============================================
// LANDING PAGE SCRIPT
// Handles file upload, script display, and navigation
// ===============================================

// ===============================================
// SCRAPER SCRIPT SOURCE
// The scraper is NOT duplicated here. It is fetched from the single source of
// truth: university-courses-scraper.js. This guarantees the script the student
// copies is always exactly the script that lives in the repository.
// ===============================================
const SCRAPER_FILE = 'university-courses-scraper.js';
const SCRAPER_RAW_URL = 'https://raw.githubusercontent.com/abdullatif-kh/schedule-builder/main/university-courses-scraper.js';

let scraperSourcePromise = null;

function getScraperSource() {
    if (!scraperSourcePromise) {
        scraperSourcePromise = fetch(SCRAPER_FILE)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.text();
            })
            .catch(error => {
                // Allow a later retry instead of caching the failure
                scraperSourcePromise = null;
                throw error;
            });
    }
    return scraperSourcePromise;
}

// Shared failure handler: tell the user where to get the script manually
function handleScraperLoadError(error) {
    console.error('Failed to load scraper source:', error);
    showToast('تعذّر تحميل السكربت، افتح الرابط في الوصف يدوياً', 'error');
    window.open(SCRAPER_RAW_URL, '_blank', 'noopener');
}

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
    showLoadedFile(file.name, formatFileSize(file.size));

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

// Switch the upload card into the "file loaded" state
function showLoadedFile(name, sizeText) {
    elements.fileName.textContent = name;
    elements.fileSize.textContent = sizeText;
    elements.fileInfo.style.display = 'flex';
    elements.uploadZone.style.display = 'none';
    elements.generateBtn.disabled = false;
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
    sessionStorage.removeItem('courseData');
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
// CHROME EXTENSION HANDOFF
// The extension writes the scraped JSON straight into sessionStorage and fires
// `sb:extension-data`, so the student never touches a file.
// ===============================================
function adoptExtensionData(source = 'الإضافة') {
    const stored = sessionStorage.getItem('courseData');
    if (!stored) return false;

    try {
        const parsed = JSON.parse(stored);
        if (!parsed || !Array.isArray(parsed.courses)) return false;

        courseData = parsed;
        const sectionCount = parsed.courses.length;
        showLoadedFile(`تم الاستلام من ${source}`, `${sectionCount} شعبة جاهزة`);
        showToast(`تم استلام ${sectionCount} شعبة من ${source}`, 'success');
        return true;
    } catch (error) {
        console.error('Invalid extension data:', error);
        return false;
    }
}

window.addEventListener('sb:extension-data', () => adoptExtensionData());

// ===============================================
// SCRIPT MANAGEMENT
// ===============================================

// Copy script to clipboard
elements.copyScriptBtn.addEventListener('click', () => copyScriptToClipboard());
elements.modalCopyBtn.addEventListener('click', () => copyScriptToClipboard());

async function copyScriptToClipboard() {
    let source;
    try {
        source = await getScraperSource();
    } catch (error) {
        handleScraperLoadError(error);
        return;
    }

    try {
        await navigator.clipboard.writeText(source);
        showToast('تم نسخ السكربت', 'success');
    } catch (err) {
        // Clipboard blocked (permissions / insecure context): show the script
        // so the student can select and copy it manually.
        console.error('Failed to copy:', err);
        showToast('تعذّر النسخ التلقائي، انسخ السكربت يدوياً', 'warning');
        showScriptModal(source);
    }
}

// Download script as file
elements.downloadScriptBtn.addEventListener('click', () => downloadScript());
elements.modalDownloadBtn.addEventListener('click', () => downloadScript());

async function downloadScript() {
    let source;
    try {
        source = await getScraperSource();
    } catch (error) {
        handleScraperLoadError(error);
        return;
    }

    const blob = new Blob([source], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = SCRAPER_FILE;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('تم تحميل السكربت', 'success');
}

// Show script in modal
function showScriptModal(source) {
    elements.scriptCode.textContent = source;
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
// PAGE LOAD
// ===============================================
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    }, 100);

    // The extension bridge may have already planted data before this ran
    adoptExtensionData();
});

// ===============================================
// Development console output
// ===============================================
console.log('%cSchedule Generator - Landing Page Loaded', 'color: #667eea; font-size: 16px; font-weight: bold;');
console.log('%cCourse data scraper and file upload ready', 'color: #764ba2; font-size: 12px;');
