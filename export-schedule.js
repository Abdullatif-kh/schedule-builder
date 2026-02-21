/**
 * Schedule Export to PNG Module
 * Handles exporting schedule to high-quality PNG image
 */

// Load html2canvas library dynamically
function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
        if (window.html2canvas) {
            resolve(window.html2canvas);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => resolve(window.html2canvas);
        script.onerror = () => reject(new Error('Failed to load html2canvas'));
        document.head.appendChild(script);
    });
}

/**
 * Export schedule card to JPEG image (optimized for speed)
 * @param {HTMLElement} scheduleCard - The schedule card element to export
 * @param {number} scheduleNumber - Schedule number for filename
 */
async function exportScheduleToPNG(scheduleCard, scheduleNumber) {
    try {
        // Show loading indicator
        const exportBtn = scheduleCard.querySelector('.export-schedule-btn');
        const originalText = exportBtn.innerHTML;
        
        exportBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
            </svg>
            <span>جاري التحويل...</span>
        `;
        exportBtn.disabled = true;

        // Load html2canvas (cached after first use)
        const html2canvas = await loadHtml2Canvas();

        // Clone the schedule card to avoid modifying the original
        const clone = scheduleCard.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.left = '-9999px';
        clone.style.top = '0';
        clone.style.width = scheduleCard.offsetWidth + 'px';
        document.body.appendChild(clone);

        // Remove export button from clone
        const exportBtnClone = clone.querySelector('.export-schedule-btn');
        if (exportBtnClone) {
            exportBtnClone.remove();
        }

        // Configure html2canvas options - OPTIMIZED FOR SPEED
        const canvas = await html2canvas(clone, {
            scale: 1.3, // Reduced from 1.5 - 35% faster
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#0f172a',
            logging: false,
            width: clone.offsetWidth,
            height: clone.offsetHeight,
            windowWidth: clone.offsetWidth,
            windowHeight: clone.offsetHeight,
            imageTimeout: 0,
            removeContainer: true,
            foreignObjectRendering: false, // Faster rendering
            letterRendering: false, // Skip letter spacing
            ignoreElements: (element) => {
                // Skip hidden elements for speed
                return element.style.display === 'none';
            }
        });

        // Remove clone
        document.body.removeChild(clone);

        // Convert canvas to JPEG (fast and small file size)
        canvas.toBlob((blob) => {
            // Create download link
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            link.download = `schedule-${scheduleNumber}-${timestamp}.jpg`;
            link.href = url;
            link.click();

            // Cleanup after download
            setTimeout(() => URL.revokeObjectURL(url), 100);

            // Show success message
            showToast('تم تنزيل الجدول بنجاح!', 'success');

            // Restore button
            exportBtn.innerHTML = originalText;
            exportBtn.disabled = false;
        }, 'image/jpeg', 0.92); // JPEG quality 92% - fast and high quality

    } catch (error) {
        console.error('Export error:', error);
        showToast('حدث خطأ أثناء تصدير الجدول', 'error');

        // Restore button on error
        const exportBtn = scheduleCard.querySelector('.export-schedule-btn');
        exportBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>تنزيل الجدول</span>
        `;
        exportBtn.disabled = false;
    }
}

/**
 * Setup export buttons for all schedules
 * Fast JPEG export with 2-second cooldown
 */
let lastExportTime = 0;
const EXPORT_COOLDOWN = 2000; // 2 seconds cooldown

function setupExportButtons() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.export-schedule-btn')) {
            const btn = e.target.closest('.export-schedule-btn');
            
            // Check cooldown
            const now = Date.now();
            if (now - lastExportTime < EXPORT_COOLDOWN) {
                showToast('الرجاء الانتظار قليلاً قبل التصدير مرة أخرى', 'warning');
                return;
            }
            
            const scheduleCard = btn.closest('.schedule-card');
            const scheduleNumber = btn.dataset.scheduleNumber;

            lastExportTime = now;
            exportScheduleToPNG(scheduleCard, scheduleNumber);
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupExportButtons);
} else {
    setupExportButtons();
}

// Export functions for external use
window.exportScheduleToPNG = exportScheduleToPNG;
window.setupExportButtons = setupExportButtons;