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
