export class Calendar {
    constructor(elementId) {
        this.container = document.getElementById(elementId);
        this.monthYearDisplay = document.getElementById('calendar-month-year');
        this.btnPrev = document.getElementById('btn-prev-month');
        this.btnNext = document.getElementById('btn-next-month');
        this.filterBanner = document.getElementById('date-filter-banner');
        this.filterText = document.getElementById('date-filter-text');
        this.btnClearFilter = document.getElementById('btn-clear-date-filter');
        this.btnToday = document.getElementById('btn-today');
        this.btnThisWeek = document.getElementById('btn-this-week');
        this.btnAllTasks = document.getElementById('btn-all-tasks');

        this.currentDate = new Date(); // Month currently being viewed
        this.selectedDate = null;      // The specifically clicked date (single)
        this.rangeStart = null;        // Start of date range (Shift+Click)
        this.rangeEnd = null;          // End of date range (Shift+Click)

        // This set will be populated from outside allowing us to show indicators
        // on days where tasks actually exist. Keys are "YYYY-MM-DD".
        this.datesWithTasks = new Set();
    }

    init() {
        if (!this.container) return;

        this.bindEvents();
        this.render();
    }

    updateFilterTabsState(activeId) {
        if (this.btnToday) this.btnToday.classList.remove('active');
        if (this.btnThisWeek) this.btnThisWeek.classList.remove('active');
        if (this.btnAllTasks) this.btnAllTasks.classList.remove('active');

        if (activeId) {
            const activeBtn = document.getElementById(activeId);
            if (activeBtn) activeBtn.classList.add('active');
        }
    }

    bindEvents() {
        this.btnPrev?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.render();
        });

        this.btnNext?.addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.render();
        });

        this.btnClearFilter?.addEventListener('click', () => {
            this.clearSelection();
        });

        this.btnAllTasks?.addEventListener('click', () => {
            this.clearSelection();
        });

        this.btnToday?.addEventListener('click', () => {
            const today = new Date();
            this.currentDate = new Date(today.getFullYear(), today.getMonth(), 1);

            const dateId = this.formatDateId(today.getFullYear(), today.getMonth(), today.getDate());
            this.selectedDate = dateId;
            this.rangeStart = null;
            this.rangeEnd = null;

            this.updateFilterTabsState('btn-today');
            this.render();
            this.updateFilterBanner();
            this.dispatchFilterEvent(dateId);
        });

        this.btnThisWeek?.addEventListener('click', () => {
            const today = new Date();

            // Calculate start of week (Sunday)
            const dow = today.getDay();
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - dow);

            // Calculate end of week (Saturday)
            const daysToSaturday = 6 - dow;
            const endOfWeek = new Date(today);
            endOfWeek.setDate(today.getDate() + daysToSaturday);

            const startId = this.formatDateId(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate());
            const endId = this.formatDateId(endOfWeek.getFullYear(), endOfWeek.getMonth(), endOfWeek.getDate());

            // Jump the calendar view to the current month if not already there
            this.currentDate = new Date(today.getFullYear(), today.getMonth(), 1);

            this.rangeStart = startId;
            this.rangeEnd = endId;
            this.selectedDate = null;

            this.updateFilterTabsState('btn-this-week');
            this.render();
            this.updateFilterBanner();
            this.dispatchFilterEvent(null, this.rangeStart, this.rangeEnd);
        });

        // Listen for keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.selectedDate || this.rangeStart) {
                    this.clearSelection();
                }
                return;
            }

            // Do not trigger letter shortcuts if typing in an input field
            const target = e.target;
            const isTyping = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;

            if (isTyping) return;

            if (e.key.toLowerCase() === 't') {
                e.preventDefault();
                this.btnToday?.click();
            } else if (e.key.toLowerCase() === 'w') {
                e.preventDefault();
                this.btnThisWeek?.click();
            }
        });

        // Vertical scroll for next/prev month
        if (this.container) {
            let lastScrollTime = 0;
            this.container.addEventListener('wheel', (e) => {
                // Prevent horizontal scrolling from triggering or default page scroll if over calendar
                e.preventDefault();

                const now = Date.now();
                // 350ms debounce to prevent trackpads from flying through 10 months in one swipe
                if (now - lastScrollTime < 350) return;

                if (e.deltaY > 0) {
                    // Scrolled down -> Next Month
                    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
                    this.render();
                    lastScrollTime = now;
                } else if (e.deltaY < 0) {
                    // Scrolled up -> Previous Month
                    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
                    this.render();
                    lastScrollTime = now;
                }
            }, { passive: false });
        }
    }

    setTaskDates(datesArray) {
        this.datesWithTasks.clear();
        datesArray.forEach(d => {
            if (d) this.datesWithTasks.add(d);
        });
        this.render(); // Re-render to show indicators
    }

    clearSelection() {
        this.selectedDate = null;
        this.rangeStart = null;
        this.rangeEnd = null;
        this.updateFilterTabsState('btn-all-tasks');
        this.render();
        this.updateFilterBanner();
        this.dispatchFilterEvent(null);
    }

    formatDateId(year, month, day) {
        const m = String(month + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        return `${year}-${m}-${d}`;
    }

    getHolidaysForYear(year) {
        if (!this.holidayCache) this.holidayCache = {};
        if (this.holidayCache[year]) return this.holidayCache[year];

        const holidays = new Set();
        const add = (m, d) => holidays.add(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

        // Fixed dates
        add(1, 1); // New Year
        add(7, 1); // Canada Day
        add(11, 11); // Remembrance Day
        add(12, 25); // Christmas
        add(12, 26); // Boxing Day
        add(9, 30); // Truth and Reconciliation

        const getTargetDay = (month, targetDow, weekNth) => {
            const firstDay = new Date(year, month - 1, 1);
            let firstDow = firstDay.getDay();
            let offset = (targetDow - firstDow + 7) % 7;
            let day = 1 + offset + (weekNth - 1) * 7;
            add(month, day);
        };

        // Family Day: 3rd Mon Feb
        getTargetDay(2, 1, 3);
        // Heritage Day: 1st Mon Aug
        getTargetDay(8, 1, 1);
        // Labour Day: 1st Mon Sep
        getTargetDay(9, 1, 1);
        // Thanksgiving: 2nd Mon Oct
        getTargetDay(10, 1, 2);

        // Victoria Day: Mon before May 25
        for (let d = 18; d <= 24; d++) {
            if (new Date(year, 4, d).getDay() === 1) add(5, d);
        }

        // Good Friday
        const f = Math.floor, G = year % 19, C = f(year / 100);
        const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
        const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
        const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7;
        const L = I - J, eMonth = 3 + f((L + 40) / 44), eDay = L + 28 - 31 * f(eMonth / 4);
        const easter = new Date(year, eMonth - 1, eDay);
        const gf = new Date(easter);
        gf.setDate(easter.getDate() - 2);
        add(gf.getMonth() + 1, gf.getDate());

        this.holidayCache[year] = holidays;
        return holidays;
    }

    isHoliday(dateId) {
        if (!dateId) return false;
        const [y] = dateId.split('-');
        const hol = this.getHolidaysForYear(parseInt(y, 10));
        return hol.has(dateId);
    }

    // Check if a dateId falls within the selected range
    isInRange(dateId) {
        if (!this.rangeStart || !this.rangeEnd) return false;
        return dateId >= this.rangeStart && dateId <= this.rangeEnd;
    }

    // Get CSS class for a date considering selection and range
    getSelectionClass(dateId) {
        if (this.rangeStart && this.rangeEnd) {
            // Range mode
            if (dateId === this.rangeStart) return ' range-start';
            if (dateId === this.rangeEnd) return ' range-end';
            if (this.isInRange(dateId)) return ' in-range';
        } else if (this.selectedDate === dateId) {
            return ' selected';
        }
        return '';
    }

    render() {
        this.container.innerHTML = '';

        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        // Update Header
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        if (this.monthYearDisplay) {
            this.monthYearDisplay.textContent = `${monthNames[month]} ${year}`;
        }

        // Calculate days for month 1
        const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        const today = new Date();
        const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
        const todayDate = today.getDate();

        // Previous Month's trailing days
        for (let i = firstDayOfMonth - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            const dObj = new Date(year, month - 1, dayNum);
            const dateId = this.formatDateId(dObj.getFullYear(), dObj.getMonth(), dObj.getDate());
            let classes = 'other-month';
            if (this.isHoliday(dateId)) classes += ' is-stat-holiday';
            const el = this.createDayElement(dayNum, classes, null); // passing null keeps it unclickable as before
            this.container.appendChild(el);
        }

        // Current Month's days
        for (let day = 1; day <= daysInMonth; day++) {
            let classes = '';
            if (isCurrentMonth && day === todayDate) {
                classes += ' today';
            }

            const dateId = this.formatDateId(year, month, day);
            classes += this.getSelectionClass(dateId);

            if (this.datesWithTasks.has(dateId)) {
                classes += ' has-tasks';
            }
            if (this.isHoliday(dateId)) {
                classes += ' is-stat-holiday';
            }

            const el = this.createDayElement(day, classes.trim(), dateId);
            this.container.appendChild(el);
        }

        // Fill remaining cells of month 1's last week
        const totalCellsFilled = firstDayOfMonth + daysInMonth;
        const remainderInWeek = totalCellsFilled % 7;
        if (remainderInWeek > 0) {
            const nextMonthDate = new Date(year, month + 1, 1);
            const nm2Year = nextMonthDate.getFullYear();
            const nm2Month = nextMonthDate.getMonth();
            for (let i = 1; i <= 7 - remainderInWeek; i++) {
                const dateId = this.formatDateId(nm2Year, nm2Month, i);
                let classes = 'other-month';
                classes += this.getSelectionClass(dateId);
                if (this.datesWithTasks.has(dateId)) classes += ' has-tasks';
                if (this.isHoliday(dateId)) classes += ' is-stat-holiday';
                const el = this.createDayElement(i, classes, dateId);
                this.container.appendChild(el);
            }
        }

        // ─── Month 2: Next month ───
        const nextDate = new Date(year, month + 1, 1);
        const nextYear = nextDate.getFullYear();
        const nextMonth = nextDate.getMonth();
        const daysFilledFromNextMonth = (remainderInWeek > 0) ? 7 - remainderInWeek : 0;

        // Separator header spanning full grid row
        const separator = document.createElement('div');
        separator.className = 'calendar-month-separator';
        separator.textContent = `${monthNames[nextMonth]} ${nextYear}`;
        this.container.appendChild(separator);

        // Day-of-week headers for month 2
        const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        dayLabels.forEach(label => {
            const hdr = document.createElement('span');
            hdr.className = 'calendar-day-label';
            hdr.textContent = label;
            this.container.appendChild(hdr);
        });

        // Next month calculations
        const firstDayOfNextMonth = new Date(nextYear, nextMonth, 1).getDay();
        const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
        const isNextCurrentMonth = today.getFullYear() === nextYear && today.getMonth() === nextMonth;

        // Leading blanks for month 2
        for (let i = 0; i < firstDayOfNextMonth; i++) {
            const blank = document.createElement('div');
            blank.className = 'calendar-day other-month';
            blank.style.visibility = 'hidden';
            this.container.appendChild(blank);
        }

        // Month 2's days (start from day after the overlap)
        for (let day = 1; day <= daysInNextMonth; day++) {
            let classes = 'next-month';

            if (isNextCurrentMonth && day === todayDate) {
                classes += ' today';
            }

            const dateId = this.formatDateId(nextYear, nextMonth, day);
            classes += this.getSelectionClass(dateId);

            if (this.datesWithTasks.has(dateId)) {
                classes += ' has-tasks';
            }
            if (this.isHoliday(dateId)) {
                classes += ' is-stat-holiday';
            }

            const el = this.createDayElement(day, classes.trim(), dateId);
            this.container.appendChild(el);
        }
    }

    createDayElement(dayNumber, className, dateId) {
        const el = document.createElement('div');
        el.className = `calendar-day ${className}`;
        el.textContent = dayNumber;

        if (dateId) {
            el.addEventListener('click', (e) => {
                const todayTemp = new Date();
                const todayId = this.formatDateId(todayTemp.getFullYear(), todayTemp.getMonth(), todayTemp.getDate());

                if (e.shiftKey && this.selectedDate) {
                    // Shift+Click: select a range from selectedDate to this date
                    const start = this.selectedDate < dateId ? this.selectedDate : dateId;
                    const end = this.selectedDate < dateId ? dateId : this.selectedDate;

                    this.rangeStart = start;
                    this.rangeEnd = end;
                    this.selectedDate = null; // clear single selection, we're in range mode

                    this.updateFilterTabsState(''); // Revert to un-highlighted state
                    this.render();
                    this.updateFilterBanner();
                    this.dispatchFilterEvent(null, start, end);
                } else {
                    // Regular click: single date selection (clears any range)
                    if (this.selectedDate === dateId && !this.rangeStart) {
                        // Toggle off if already selected
                        this.clearSelection();
                    } else {
                        this.selectedDate = dateId;
                        this.rangeStart = null;
                        this.rangeEnd = null;

                        // Highlight Today tab if clicking today's date, otherwise clear tabs
                        if (dateId === todayId) {
                            this.updateFilterTabsState('btn-today');
                        } else {
                            this.updateFilterTabsState(''); // Revert to un-highlighted state
                        }

                        this.render();
                        this.updateFilterBanner();
                        this.dispatchFilterEvent(dateId);
                    }
                }
            });

            el.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // 1. Calculate the end of the week for the clicked date
                const [y, m, d] = dateId.split('-');
                const clickedDateObj = new Date(y, m - 1, d);

                // Sunday is 0 in JS, Saturday is 6.
                // Days to add = 6 - currentDay
                // e.g., Wed = 3. 6 - 3 = 3 days to Sat. Sun = 0. 6 - 0 = 6 days to Sat. Sat = 6. 6 - 6 = 0 days.
                let daysToSaturday = 6 - clickedDateObj.getDay();

                const endOfWeekObj = new Date(clickedDateObj);
                endOfWeekObj.setDate(clickedDateObj.getDate() + daysToSaturday);

                const targetDateId = this.formatDateId(
                    endOfWeekObj.getFullYear(),
                    endOfWeekObj.getMonth(),
                    endOfWeekObj.getDate()
                );

                // 2. Toggle off if exactly this range is already active
                if (this.rangeStart === dateId && this.rangeEnd === targetDateId) {
                    this.clearSelection();
                    return;
                }

                // 3. Set new range and clear single selection
                this.rangeStart = dateId;
                this.rangeEnd = targetDateId;
                this.selectedDate = null;

                // 4. Trigger UI update seamlessly overriding the single click
                this.updateFilterTabsState(''); // Revert to un-highlighted state
                this.render();
                this.updateFilterBanner();
                this.dispatchFilterEvent(null, this.rangeStart, this.rangeEnd);
            });
        }
        return el;
    }

    updateFilterBanner() {
        if (!this.filterBanner || !this.filterText) return;

        if (this.rangeStart && this.rangeEnd) {
            // Range mode
            const formatNice = (dateStr) => {
                const [y, m, d] = dateStr.split('-');
                const dateObj = new Date(y, m - 1, d);
                return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            };
            this.filterText.textContent = `Showing tasks from ${formatNice(this.rangeStart)} to ${formatNice(this.rangeEnd)}`;
            this.filterBanner.style.display = 'flex';
        } else if (this.selectedDate) {
            // Single date mode
            const [y, m, d] = this.selectedDate.split('-');
            const dateObj = new Date(y, m - 1, d);
            const formatted = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

            this.filterText.textContent = `Showing tasks grouped by "${formatted}"`;
            this.filterBanner.style.display = 'flex';
        } else {
            this.filterBanner.style.display = 'none';
        }
    }

    dispatchFilterEvent(dateId, rangeStart = null, rangeEnd = null) {
        // Broadcast custom event that dashboard.js can listen to
        const event = new CustomEvent('filterTasksByDate', {
            detail: { date: dateId, rangeStart, rangeEnd }
        });
        document.dispatchEvent(event);
    }
}
