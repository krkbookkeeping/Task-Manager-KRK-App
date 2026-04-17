/**
 * keyboard-shortcuts.js
 *
 * Global Alt+key shortcuts for fast workspace and view navigation.
 *
 * Shortcut map:
 *   Alt+B  → Bookmarks of the current workspace
 *   Alt+N  → Notes of the current workspace
 *   Alt+S  → Toggle starred-task filter on the current dashboard
 *   Alt+D  → DEX workspace (main dashboard)
 *   Alt+G  → GC workspace (main dashboard)
 *   Alt+Q  → Bar workspace (main dashboard)  [B is taken by Bookmarks]
 *   Alt+T  → Teg workspace (main dashboard)
 *   Alt+K  → Cycle through workspaces starting with "K" (KRK, KK, etc.)
 *   Alt+F  → FCA workspace (main dashboard)
 *
 * Escape → Clears the starred-task filter if active (when not focused on an input)
 */

// Maps Alt key letters to workspace name prefixes (lowercase, partial match).
// Multiple workspaces can share the same first letter — Alt+key will cycle through them.
const WORKSPACE_SHORTCUTS = {
    'd': 'dex',
    'g': 'gc',
    'q': 'bar',
    't': 'teg',
    'k': 'k',       // matches KRK, KK, and any workspace starting with "k"
    'f': 'fca',
};

/**
 * Returns true when the keyboard event should be ignored —
 * i.e. the user is typing in an input/textarea/contenteditable, or a modal is open.
 */
function shouldIgnore(e) {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (e.target && e.target.isContentEditable) return true;

    // Skip if any modal overlay is currently active/visible
    const activeModal = document.querySelector('.modal-overlay.active');
    if (activeModal) return true;

    return false;
}

/**
 * Navigate to the bookmarks view of the current workspace.
 */
function goToBookmarks() {
    if (window.currentBookmarkDashboard && typeof window.currentBookmarkDashboard.activateBookmarksView === 'function') {
        window.currentBookmarkDashboard.activateBookmarksView();
    }
}

/**
 * Navigate to the notes view of the current workspace.
 */
function goToNotes() {
    if (window.currentNoteDashboard && typeof window.currentNoteDashboard.activateNotesView === 'function') {
        window.currentNoteDashboard.activateNotesView();
    }
}

/**
 * Toggle the starred-task filter on the current dashboard.
 */
function toggleStarFilter() {
    if (window.currentDashboard && typeof window.currentDashboard.toggleStarFilter === 'function') {
        window.currentDashboard.toggleStarFilter();
    }
}

/**
 * Navigate to the main (tasks) dashboard of the current workspace.
 */
function goToMainDashboard() {
    const btn = document.getElementById('btn-nav-boards');
    if (btn) btn.click();
}

/**
 * Switch to a workspace whose name starts with the given prefix (case-insensitive).
 * If multiple workspaces match, repeated presses cycle through them in order.
 */
async function goToWorkspaceByPrefix(uid, prefix) {
    const workspaces = window.__workspaces || [];
    const matches = workspaces.filter(ws =>
        ws.name && ws.name.toLowerCase().startsWith(prefix)
    );

    if (matches.length === 0) {
        console.warn(`[Keyboard Shortcut] No workspace found with name starting with "${prefix}"`);
        return;
    }

    const currentWsId = window.__currentWorkspace?.workspaceId;

    if (matches.length === 1) {
        // Only one match — switch to it or show main dashboard if already there
        if (currentWsId === matches[0].id) {
            goToMainDashboard();
        } else if (typeof window.switchWorkspace === 'function') {
            await window.switchWorkspace(uid, matches[0].id);
        }
        return;
    }

    // Multiple matches — find current position and cycle to next
    const currentIndex = matches.findIndex(ws => ws.id === currentWsId);
    let nextIndex;

    if (currentIndex === -1) {
        // Not currently on any matching workspace — go to first
        nextIndex = 0;
    } else {
        // Cycle to the next match (wrap around)
        nextIndex = (currentIndex + 1) % matches.length;
    }

    const target = matches[nextIndex];
    if (currentWsId === target.id) {
        // Already here (shouldn't happen with length > 1, but just in case)
        goToMainDashboard();
    } else if (typeof window.switchWorkspace === 'function') {
        await window.switchWorkspace(uid, target.id);
    }
}

/**
 * Initialize the global keyboard shortcut listener.
 * Call once after the user is authenticated.
 */
export function initKeyboardShortcuts(uid) {
    // ── Alt+key shortcuts ──
    document.addEventListener('keydown', async (e) => {
        // Only fire on Alt combos with no Ctrl/Meta (avoid OS/browser shortcuts)
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (shouldIgnore(e)) return;

        const key = e.key.toLowerCase();

        // View shortcuts (operate on current workspace)
        if (key === 'b') {
            e.preventDefault();
            goToBookmarks();
            return;
        }

        if (key === 'n') {
            e.preventDefault();
            goToNotes();
            return;
        }

        if (key === 's') {
            e.preventDefault();
            toggleStarFilter();
            return;
        }

        // Workspace shortcuts
        const wsPrefix = WORKSPACE_SHORTCUTS[key];
        if (wsPrefix) {
            e.preventDefault();
            await goToWorkspaceByPrefix(uid, wsPrefix);
            return;
        }
    });

    // ── Global Escape: clear ALL filters (search, star, date) from anywhere ──
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        // Skip if a modal overlay is open (let the modal handle its own Escape)
        const activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal) return;

        const bmContainer = document.getElementById('bookmark-board-container');
        const noteContainer = document.getElementById('note-board-container');

        if (bmContainer && bmContainer.classList.contains('active')) {
            // Bookmark view — clear bookmark search
            if (window.currentBookmarkDashboard && typeof window.currentBookmarkDashboard.clearAllFilters === 'function') {
                const cleared = window.currentBookmarkDashboard.clearAllFilters();
                if (cleared) {
                    const si = document.getElementById('bookmark-search');
                    if (si && document.activeElement === si) si.blur();
                }
            }
        } else if (noteContainer && noteContainer.classList.contains('active')) {
            // Notes view — clear note search
            if (window.currentNoteDashboard && typeof window.currentNoteDashboard.clearAllFilters === 'function') {
                const cleared = window.currentNoteDashboard.clearAllFilters();
                if (cleared) {
                    const si = document.getElementById('note-search');
                    if (si && document.activeElement === si) si.blur();
                }
            }
        } else {
            // Tasks view — clear task filters
            if (window.currentDashboard && typeof window.currentDashboard.clearAllFilters === 'function') {
                const cleared = window.currentDashboard.clearAllFilters();
                if (cleared) {
                    const searchInput = document.getElementById('global-search');
                    if (searchInput && document.activeElement === searchInput) searchInput.blur();
                }
            }
        }
    });

    console.log('[Keyboard Shortcuts] Initialized. Alt+B=Bookmarks, Alt+N=Notes, Alt+S=StarFilter, Alt+D=DEX, Alt+G=GC, Alt+Q=Bar, Alt+T=Teg, Alt+K=KRK, Alt+F=FCA');
}
