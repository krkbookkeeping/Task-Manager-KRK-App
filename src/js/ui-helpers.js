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

// ── Mobile: FAB → open TaskModal directly (topbar button is hidden on mobile) ──
document.addEventListener('DOMContentLoaded', function () {
    var fab = document.getElementById('mobile-fab');
    if (fab) {
        fab.addEventListener('click', function () {
            if (window.currentTaskModal) {
                window.currentTaskModal.open();
            } else {
                // Fallback: trigger hidden topbar button
                var create = document.getElementById('btn-topbar-create-task');
                if (create) create.click();
            }
        });
    }

    // ── Mobile: Bucket dot navigation ──
    var bucketGrid = document.getElementById('main-board');
    var dotNav = document.getElementById('mobile-bucket-nav');
    if (bucketGrid && dotNav) {
        function buildDots() {
            var buckets = bucketGrid.querySelectorAll(':scope > .bucket, :scope > .bucket-empty');
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
            var dots = dotNav.querySelectorAll('.mobile-bucket-dot');
            if (!dots.length) return;
            var scrollLeft = bucketGrid.scrollLeft;
            var width = bucketGrid.offsetWidth;
            var index = Math.round(scrollLeft / width);
            dots.forEach(function (d, i) {
                d.classList.toggle('active', i === index);
            });
        }

        // Rebuild dots when buckets change
        var observer = new MutationObserver(buildDots);
        observer.observe(bucketGrid, { childList: true });

        // Update active dot on scroll
        var scrollTimer;
        bucketGrid.addEventListener('scroll', function () {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(updateActiveDot, 50);
        }, { passive: true });

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
