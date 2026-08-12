// ===============================================
// GENERATED FILE - DO NOT EDIT
// Source: university-courses-scraper.js
// Regenerate with: node tools/sync-scraper.js
// ===============================================

(function () {
// سكريبت المواد الجامعية - محدث ليدعم الأيام المتعددة
class UniversityCoursesScraper {
  constructor() {
      this.allCourses = [];
      this.processedSections = new Set();
      
      this.speedSettings = {
          modalWaitTime: 50,
          betweenSectionsDelay: 5,
          fastMode: false
      };
      
      if (this.speedSettings.fastMode) {
          this.speedSettings.modalWaitTime = 400;
          this.speedSettings.betweenSectionsDelay = 100;
          console.log('⚡ الوضع السريع مفعل!');
      }
      
      this.dayMapping = {
          "1": "الأحد",
          "2": "الاثنين", 
          "3": "الثلاثاء",
          "4": "الأربعاء",
          "5": "الخميس"
      };
  }

  // تحويل الوقت من العربي للإنجليزي (بدون تغيير)
  parseTime(timeString) {
      if (!timeString) return { startTime: null, endTime: null };
      
      const timePattern = /(\d{1,2}):(\d{2})\s*(ص|م)\s*-\s*(\d{1,2}):(\d{2})\s*(ص|م)/;
      const match = timeString.match(timePattern);
      
      if (!match) return { startTime: null, endTime: null };
      
      const [, startHour, startMin, startPeriod, endHour, endMin, endPeriod] = match;
      
      let start24Hour = parseInt(startHour);
      let end24Hour = parseInt(endHour);
      
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
          startTime: `${start24Hour.toString().padStart(2, '0')}:${startMin}`,
          endTime: `${end24Hour.toString().padStart(2, '0')}:${endMin}`
      };
  }

  // 🆕 دالة جديدة: تحليل الأيام المتعددة
  parseMultipleDays(dayText) {
      if (!dayText) return [];
      
      const dayText_cleaned = dayText.trim();
      const days = [];
      
      console.log(`🔍 تحليل نص الأيام: "${dayText_cleaned}"`);
      
      // الأنماط المختلفة للأيام المتعددة
      const patterns = [
          // نمط: "4 1" (أيام منفصلة بمسافة)
          {
              regex: /^([1-5])\s+([1-5])$/,
              handler: (match) => [match[1], match[2]]
          },
          // نمط: "41" (أيام متصلة)
          {
              regex: /^([1-5])([1-5])$/,
              handler: (match) => [match[1], match[2]]
          },
          // نمط: "4,1" أو "4،1" (أيام بفاصلة)
          {
              regex: /^([1-5])[,،]\s*([1-5])$/,
              handler: (match) => [match[1], match[2]]
          },
          // نمط: "1 3 5" (ثلاثة أيام أو أكثر)
          {
              regex: /^([1-5])(\s+[1-5])+$/,
              handler: (match) => dayText_cleaned.split(/\s+/).filter(d => /^[1-5]$/.test(d))
          },
          // نمط: يوم واحد
          {
              regex: /^([1-5])$/,
              handler: (match) => [match[1]]
          }
      ];
      
      // تجربة كل نمط
      for (const pattern of patterns) {
          const match = dayText_cleaned.match(pattern.regex);
          if (match) {
              const extractedDays = pattern.handler(match);
              console.log(`✅ تم استخراج الأيام: [${extractedDays.join(', ')}]`);
              return extractedDays.map(day => ({
                  number: parseInt(day),
                  name: this.dayMapping[day]
              }));
          }
      }
      
      console.log(`❌ لم يتم التعرف على نمط الأيام: "${dayText_cleaned}"`);
      return [];
  }

  // استخراج البيانات الأساسية (بدون تغيير)
  extractBasicData() {
      console.log('🔍 استخراج البيانات الأساسية...');
      
      const tables = document.querySelectorAll('table');
      let coursesTable = null;
      let maxRows = 0;
      
      tables.forEach(table => {
          const rows = table.querySelectorAll('tr').length;
          if (rows > maxRows && rows > 15) {
              maxRows = rows;
              coursesTable = table;
          }
      });
      
      if (!coursesTable) {
          console.log('❌ لم يتم العثور على جدول المواد');
          return [];
      }
      
      console.log(`✅ جدول المواد محدد (${maxRows} صف)`);
      
      const courses = [];
      const rows = Array.from(coursesTable.querySelectorAll('tr'));
      
      for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const cells = Array.from(row.querySelectorAll('td'));
          
          if (cells.length < 6) continue;
          
          const courseData = this.extractCourseFromRow(cells, i, row);
          if (courseData) {
              courses.push(courseData);
          }
      }
      
      console.log(`✅ تم استخراج ${courses.length} شعبة`);
      return courses;
  }

  // استخراج بيانات المادة من صف واحد (بدون تغيير)
  extractCourseFromRow(cells, rowIndex, rowElement) {
      const cellTexts = cells.map(cell => {
          const text = cell.textContent.trim();
          return text.replace(/التفاصيل.*$/g, '').trim();
      });
      
      console.log(`📊 صف ${rowIndex}: [${cellTexts.join(' | ')}]`);
      
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
      
      for (let i = cellTexts.length - 1; i >= 0; i--) {
          const text = cellTexts[i];
          if (/^[a-zA-Zأ-ي]{2,4}\s*\d{3,4}$/.test(text)) {
              courseCode = text;
              break;
          }
      }
      
      for (const text of cellTexts) {
          if (/^\d{4}$/.test(text)) {
              sectionId = text;
              break;
          }
      }
      
      for (const text of cellTexts) {
          if (text && text.length > 3 && 
              !(/^\d+$/.test(text)) && 
              text !== courseCode && 
              text !== 'نظري' && text !== 'عملي' && 
              text !== 'مغلقة' && text !== 'مفتوحة' &&
              text !== sectionId) {
              courseName = text;
              break;
          }
      }
      
      for (const text of cellTexts) {
          if (text === 'نظري' || text === 'عملي') {
              courseType = text;
              break;
          }
      }
      
      for (const text of cellTexts) {
          if (/^\d{1}$/.test(text) && parseInt(text) >= 1 && parseInt(text) <= 8 && text !== sectionId) {
              creditHours = text;
              break;
          }
      }
      
      for (const text of cellTexts) {
          if (text === 'مغلقة' || text === 'مفتوحة') {
              status = text;
              break;
          }
      }
      
      console.log(`🔍 مستخرج: كود="${courseCode}" | اسم="${courseName}" | شعبة="${sectionId}" | نوع="${courseType}" | ساعات="${creditHours}" | حالة="${status}"`);
      
      if (!courseCode || !sectionId) {
          console.log(`⚠️ بيانات ناقصة في الصف ${rowIndex}`);
          return null;
      }
      
      const uniqueKey = `${courseCode}_${sectionId}`;
      if (this.processedSections.has(uniqueKey)) {
          console.log(`🔄 تجاهل الشعبة المكررة: ${uniqueKey}`);
          return null;
      }
      this.processedSections.add(uniqueKey);
      
      return {
          code: courseCode,
          name: courseName || 'غير محدد',
          sectionId: sectionId,
          type: courseType || 'غير محدد',
          creditHours: creditHours || 'غير محدد',
          status: status || 'غير محدد',
          detailsButton: detailsButton,
          rowIndex: rowIndex,
          uniqueKey: uniqueKey
      };
  }

  // 🔄 محدث: الحصول على تفاصيل الجدولة مع دعم الأيام المتعددة
  async getScheduleDetails(courseData) {
      console.log(`\n🔍 جاري استخراج تفاصيل: ${courseData.code} - شعبة ${courseData.sectionId}`);
      
      if (!courseData.detailsButton) {
          console.log('❌ لا يوجد زر تفاصيل');
          return { instructor: 'غير محدد', sessions: [] };
      }
      
      try {
          courseData.detailsButton.click();
          await new Promise(resolve => setTimeout(resolve, this.speedSettings.modalWaitTime));
          
          const modal = this.findModal();
          if (!modal) {
              console.log('❌ لم يتم العثور على نافذة التفاصيل');
              return { instructor: 'غير محدد', sessions: [] };
          }
          
          const scheduleInfo = this.extractScheduleFromModal(modal);
          this.closeModal();
          
          return scheduleInfo;
          
      } catch (error) {
          console.error('❌ خطأ في استخراج التفاصيل:', error);
          this.closeModal();
          return { instructor: 'غير محدد', sessions: [] };
      }
  }

  // البحث عن النافذة المنبثقة (بدون تغيير)
  findModal() {
      const modalSelectors = [
          'div[style*="display: block"]',
          'div[style*="visibility: visible"]',
          '[class*="modal"][style*="display: block"]',
          '[id*="modal"][style*="display: block"]',
          'div[style*="z-index"]'
      ];
      
      for (const selector of modalSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
              const text = element.textContent;
              if (text.includes('أوقات') || text.includes('الشعبة') || text.includes('الجدول')) {
                  return element;
              }
          }
      }
      
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
          if (div.offsetParent !== null && 
              div.textContent.includes('أوقات الشعبة')) {
              return div;
          }
      }
      
      return null;
  }

  // 🆕 محدث: استخراج الجدولة مع دعم الأيام المتعددة
  extractScheduleFromModal(modal) {
      let instructor = 'غير محدد';
      const sessions = [];
      const uniqueSessions = new Set();
      
      // استخراج اسم المحاضر
      const modalText = modal.textContent;
      const instructorMatch = modalText.match(/المحاضر\s*:?\s*([^\n:]+)/);
      if (instructorMatch) {
          instructor = instructorMatch[1].trim().replace(/\s+/g, ' ');
      }
      
      const tables = modal.querySelectorAll('table');
      console.log(`🔍 تم العثور على ${tables.length} جداول في النافذة`);
      
      // البحث عن الجدول الأبسط والأوضح (مثل الجدول 6 من النتائج)
      let bestTable = null;
      let bestScore = -1;
      
      for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
          const table = tables[tableIndex];
          const rows = table.querySelectorAll('tr');
          
          // تقييم الجدول بناءً على البساطة والوضوح
          let score = 0;
          if (rows.length === 2) score += 10; // جدول بسيط: عناوين + بيانات
          if (rows.length >= 2 && rows.length <= 5) score += 5; // حجم معقول
          
          // تحقق من وجود بيانات واضحة في الصف الثاني
          if (rows.length >= 2) {
              const dataCells = Array.from(rows[1].querySelectorAll('td, th'));
              const dataTexts = dataCells.map(cell => cell.textContent.trim());
              
              for (const text of dataTexts) {
                  if (/^[1-5]\s+[1-5]$/.test(text)) score += 20; // أيام متعددة
                  if (/^\d{1,2}:\d{2}\s*(ص|م)\s*-\s*\d{1,2}:\d{2}\s*(ص|م)$/.test(text)) score += 15; // وقت
                  if (/^\d{2,4}$/.test(text)) score += 10; // رقم قاعة
              }
          }
          
          console.log(`📊 الجدول ${tableIndex + 1}: ${rows.length} صف، نقاط=${score}`);
          
          if (score > bestScore) {
              bestScore = score;
              bestTable = table;
          }
      }
      
      if (!bestTable) {
          console.log('❌ لم يتم العثور على جدول مناسب');
          return { instructor, sessions };
      }
      
      console.log(`✅ تم اختيار أفضل جدول (نقاط: ${bestScore})`);
      
      // معالجة الجدول المختار
      const rows = bestTable.querySelectorAll('tr');
      
      for (let i = 1; i < rows.length; i++) { // تجاهل الصف الأول (العناوين)
          const cells = Array.from(rows[i].querySelectorAll('td, th'));
          const cellTexts = cells.map(cell => cell.textContent.trim());
          
          console.log(`🔍 معالجة الصف ${i}: [${cellTexts.join(' | ')}]`);
          
          let dayText = null;
          let timeString = null;
          let room = null;
          
          // استخراج البيانات من الخلايا (الطريقة المحسنة)
          for (let cellIndex = 0; cellIndex < cellTexts.length; cellIndex++) {
              const text = cellTexts[cellIndex];
              
              // البحث عن الأيام (أولوية أعلى للأيام المتعددة)
              if (!dayText && /^[1-5](\s+[1-5])*$/.test(text)) {
                  dayText = text;
                  console.log(`📅 تم العثور على الأيام: "${dayText}"`);
              }
              
              // البحث عن الوقت
              if (!timeString && (text.includes('ص') || text.includes('م')) && text.includes('-')) {
                  timeString = text;
                  console.log(`⏰ تم العثور على الوقت: "${timeString}"`);
              }
              
              // البحث عن القاعة (تجنب الخلط مع الأيام)
              if (!room && /^\d{2,4}$/.test(text) && text !== dayText) {
                  room = text;
                  console.log(`🏢 تم العثور على القاعة: "${room}"`);
              }
          }
          
          // معالجة البيانات المستخرجة
          if (dayText && timeString) {
              console.log(`🔄 معالجة: أيام="${dayText}" | وقت="${timeString}" | قاعة="${room}"`);
              
              const days = this.parseMultipleDays(dayText);
              const { startTime, endTime } = this.parseTime(timeString);
              
              if (startTime && endTime && days.length > 0) {
                  // إنشاء جلسة منفصلة لكل يوم
                  days.forEach(dayInfo => {
                      const sessionKey = `${dayInfo.number}_${startTime}_${endTime}_${room}`;
                      
                      if (!uniqueSessions.has(sessionKey)) {
                          uniqueSessions.add(sessionKey);
                          sessions.push({
                              day: dayInfo.number,
                              dayName: dayInfo.name,
                              startTime: startTime,
                              endTime: endTime,
                              room: room || 'غير محدد'
                          });
                          console.log(`✅ جلسة جديدة: ${dayInfo.name} ${startTime}-${endTime} قاعة ${room}`);
                      }
                  });
              }
          } else {
              console.log(`⚠️ بيانات ناقصة في الصف ${i}: أيام="${dayText}" | وقت="${timeString}"`);
          }
      }
      
      console.log(`✅ تم استخراج ${sessions.length} جلسة للمحاضر: ${instructor}`);
      return { instructor, sessions };
  }

  // باقي الدوال بدون تغيير...
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
          console.log('تعذر إغلاق النافذة تلقائياً');
      }
  }

  async scrapeCurrentPage() {
      console.log('🚀 بدء سحب البيانات مع التفاصيل (يدعم الأيام المتعددة)...\n');
      
      const basicCourses = this.extractBasicData();
      
      if (basicCourses.length === 0) {
          alert('❌ لم يتم العثور على مواد في هذه الصفحة');
          return;
      }
      
      console.log(`📊 سيتم معالجة ${basicCourses.length} شعبة...\n`);
      console.log('🔧 تجاوز المادة الأولى لحل مشكلة استخراج التفاصيل...');
      
      for (let i = 1; i < basicCourses.length; i++) {
          const courseData = basicCourses[i];
          
          console.log(`🔄 الشعبة ${i}/${basicCourses.length - 1}: ${courseData.code} - ${courseData.sectionId}`);
          
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
      
      console.log(`✅ تم تجاهل المادة الأولى ومعالجة ${this.allCourses.length} شعبة`);
      this.createFinalJSON();
  }

  createFinalJSON() {
      console.log('\n🎯 إنشاء JSON النهائي...');
      console.log(`📊 إجمالي الشعب: ${this.allCourses.length}`);
      
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
      
      navigator.clipboard.writeText(jsonString).then(() => {
          console.log('✅ تم نسخ JSON بنجاح!');
          this.downloadJSON(jsonOutput);
          alert(`🎉 تم استخراج ${this.allCourses.length} شعبة بنجاح!\n\n📋 JSON تم نسخه في الحافظة\n💾 ملف JSON سيُحمل تلقائياً\n\n🆕 يدعم الآن الأيام المتعددة!`);
      }).catch(err => {
          console.error('❌ خطأ في النسخ:', err);
          this.downloadJSON(jsonOutput);
      });
      
      console.log('\n📊 عينة من البيانات:');
      console.table(this.allCourses.slice(0, 3));
  }

  downloadJSON(jsonData) {
      try {
          const jsonString = JSON.stringify(jsonData, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          
          const link = document.createElement('a');
          link.href = url;
          link.download = `islamic_university_courses_${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          console.log('💾 تم تحميل ملف JSON!');
      } catch (error) {
          console.error('❌ خطأ في التحميل:', error);
      }
  }

  setSpeed(modalWait = 800, betweenSections = 200) {
      this.speedSettings.modalWaitTime = modalWait;
      this.speedSettings.betweenSectionsDelay = betweenSections;
      this.speedSettings.fastMode = false;
      console.log(`⚡ تم تخصيص السرعة: نافذة=${modalWait}ms، بين الشعب=${betweenSections}ms`);
      return this;
  }

  getStatusSummary() {
      const summary = {};
      this.allCourses.forEach(course => {
          const status = course.status;
          summary[status] = (summary[status] || 0) + 1;
      });
      return summary;
  }

  enableFastMode() {
      this.speedSettings.fastMode = true;
      this.speedSettings.modalWaitTime = 400;
      this.speedSettings.betweenSectionsDelay = 100;
      console.log('🚀 تم تفعيل الوضع السريع!');
      return this;
  }

  enableTurboMode() {
      this.speedSettings.fastMode = true;
      this.speedSettings.modalWaitTime = 200;
      this.speedSettings.betweenSectionsDelay = 50;
      console.log('⚡🚀 تم تفعيل الوضع فائق السرعة!');
      return this;
  }

  enableSafeMode() {
      this.speedSettings.fastMode = false;
      this.speedSettings.modalWaitTime = 1200;
      this.speedSettings.betweenSectionsDelay = 300;
      console.log('🛡️ تم تفعيل الوضع الآمن');
      return this;
  }

  showSettings() {
      console.log('⚙️ الإعدادات الحالية:');
      console.log(`   انتظار النافذة: ${this.speedSettings.modalWaitTime}ms`);
      console.log(`   انتظار بين الشعب: ${this.speedSettings.betweenSectionsDelay}ms`);
      console.log(`   الوضع السريع: ${this.speedSettings.fastMode ? 'مفعل' : 'معطل'}`);
      return this;
  }
}

    globalThis.UniversityCoursesScraper = UniversityCoursesScraper;
})();
