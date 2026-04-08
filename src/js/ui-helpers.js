/**
 * ui-helpers.js
 *
 * Lightweight UI utility functions for the main dashboard (index.html).
 * Handles sidebar toggling, settings modal, theme switching, and
 * the global "F to focus search" keyboard shortcut.
 *
 * Loaded as a classic (non-module) script so functions are available
 * to inline onclick handlers in the HTML.
 */

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
}
function openSettingsModal() {
    document.getElementById('settings-modal').classList.add('active');
}
function closeSettingsModal() {
    document.getElementById('settings-modal').classList.remove('active');
}
function toggleTheme() {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    var next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    var toggle = document.getElementById('modal-theme-toggle');
    if (toggle) toggle.checked = (next === 'dark');
    try { localStorage.setItem('taskmanager-theme', next); } catch (e) { }
}

// Restore saved theme on load
(function () {
    try {
        var saved = localStorage.getItem('taskmanager-theme');
        if (saved === 'dark' || saved === 'light') {
            document.documentElement.setAttribute('data-theme', saved);
            window.addEventListener('DOMContentLoaded', function () {
                var toggle = document.getElementById('modal-theme-toggle');
                if (toggle) toggle.checked = (saved === 'dark');
            });
        }
    } catch (e) { }
})();

// ── Mobile: Calendar overlay toggle ──
function toggleMobileCalendar() {
    var col = document.querySelector('.left-column');
    if (!col) return;
    col.classList.toggle('mobile-visible');
}
function closeMobileCalendar() {
    var col = document.querySelector('.left-column');
    if (col) col.classList.remove('mobile-visible');
}

// ── Mobile: FAB → open correct modal based on active view ──
document.addEventListener('DOMContentLoaded', function () {
    var fab = document.getElementById('mobile-fab');
    if (fab) {
        fab.addEventListener('click', function () {
            // Determine which view is active
            var bmContainer = document.getElementById('bookmark-board-container');
            var noteContainer = document.getElementById('note-board-container');
            var isBookmarks = bmContainer && bmContainer.classList.contains('active');
            var isNotes = noteContainer && noteContainer.classList.contains('active');

            // Helper: get the label id of the currently-visible bucket in a grid
            function getVisibleLabelId(gridId) {
                var grid = document.getElementById(gridId);
                if (!grid) return null;
                var buckets = grid.querySelectorAll(':scope > .bucket, :scope > .bucket-empty');
                if (!buckets.length) return null;
                var index = Math.round(grid.scrollLeft / grid.offsetWidth);
                var bucket = buckets[Math.min(index, buckets.length - 1)];
                return bucket ? bucket.getAttribute('data-label-id') : null;
            }

            if (isNotes) {
                var labelId = getVisibleLabelId('note-board');
                if (window.currentNoteModal) window.currentNoteModal.open(null, labelId);
            } else if (isBookmarks) {
                var labelId = getVisibleLabelId('bookmark-board');
                if (window.currentBookmarkModal) window.currentBookmarkModal.open(null, labelId);
            } else {
                var labelId = getVisibleLabelId('main-board');
                if (window.currentTaskModal) {
                    window.currentTaskModal.open(null, labelId);
                } else {
                    var create = document.getElementById('btn-topbar-create-task');
                    if (create) create.click();
                }
            }
        });
    }

    // ── Mobile: Bucket dot navigation (tracks active view: tasks, bookmarks, or notes) ──
    var dotNav = document.getElementById('mobile-bucket-nav');
    if (dotNav) {
        var grids = {
            tasks: document.getElementById('main-board'),
            bookmarks: document.getElementById('bookmark-board'),
            notes: document.getElementById('note-board')
        };

        function getActiveGrid() {
            // Check which board container is active
            var bmContainer = document.getElementById('bookmark-board-container');
            if (bmContainer && bmContainer.classList.contains('active')) return grids.bookmarks;
            var noteContainer = document.getElementById('note-board-container');
            if (noteContainer && noteContainer.classList.contains('active')) return grids.notes;
            return grids.tasks;
        }

        function buildDots() {
            var activeGrid = getActiveGrid();
            if (!activeGrid) return;
            var buckets = activeGrid.querySelectorAll(':scope > .bucket, :scope > .bucket-empty');
            dotNav.innerHTML = '';
            buckets.forEach(function (bucket, i) {
                var dot = document.createElement('button');
                dot.className = 'mobile-bucket-dot';
                dot.setAttribute('aria-label', 'Go to bucket ' + (i + 1));
                dot.addEventListener('click', function () {
                    bucket.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                });
                dotNav.appendChild(dot);
            });
            updateActiveDot();
        }

        function updateActiveDot() {
            var activeGrid = getActiveGrid();
            if (!activeGrid) return;
            var dots = dotNav.querySelectorAll('.mobile-bucket-dot');
            if (!dots.length) return;
            var scrollLeft = activeGrid.scrollLeft;
            var width = activeGrid.offsetWidth;
            var index = Math.round(scrollLeft / width);
            dots.forEach(function (d, i) {
                d.classList.toggle('active', i === index);
            });
        }

        // Observe all grids for bucket changes
        Object.values(grids).forEach(function (grid) {
            if (!grid) return;
            var observer = new MutationObserver(buildDots);
            observer.observe(grid, { childList: true });

            var scrollTimer;
            grid.addEventListener('scroll', function () {
                clearTimeout(scrollTimer);
                scrollTimer = setTimeout(updateActiveDot, 50);
            }, { passive: true });
        });

        // Also rebuild dots when the active view changes (observe board containers for class changes)
        ['main-board-container', 'bookmark-board-container', 'note-board-container'].forEach(function (id) {
            var container = document.getElementById(id);
            if (container) {
                var viewObserver = new MutationObserver(function () {
                    setTimeout(buildDots, 100);
                });
                viewObserver.observe(container, { attributes: true, attributeFilter: ['class'] });
            }
        });

        buildDots();
    }
});

// ── Mobile: Move parked-tasks-tray and bucket-nav to body so overflow:hidden ancestors don't clip them ──
(function () {
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    document.addEventListener('DOMContentLoaded', function () {
        var tray = document.getElementById('parked-tasks-tray');
        if (tray) document.body.appendChild(tray);
        var dotNav = document.getElementById('mobile-bucket-nav');
        if (dotNav) document.body.appendChild(dotNav);
    });
})();

// ── Mobile: Escape closes calendar overlay ──
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeMobileCalendar();
    }
});

// Global Keyboard Shortcut: Press 'F' or 'f' to focus search
document.addEventListener('keydown', function (e) {
    var tagName = e.target.tagName;
    var isContentEditable = e.target.isContentEditable;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || isContentEditable) {
        return;
    }

    if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        var searchInput = document.getElementById('global-search');
        if (searchInput) {
            searchInput.focus();
        }
    }
});
