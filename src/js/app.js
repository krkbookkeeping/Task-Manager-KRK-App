import { themeManager } from './theme.js';

// --- Initialize UI immediately (DOM is already ready for type="module" scripts) ---
function initApp() {
    console.log('Task Manager KRK — App initialized');

    // --- Initialize Theme ---
    themeManager.init();

}

// Run init — for module scripts, DOM is already parsed
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Load Firebase in background — doesn't block UI
import('./firebase-config.js')
    .then(async ({ db, auth }) => {
        console.log('Firebase loaded successfully');
        // Store refs globally for later use
        window.__firebase = { db, auth };

        // Real Firebase Auth Route Guarding
        const { onAuthStateChanged, signOut } = await import('firebase/auth');

        onAuthStateChanged(auth, (user) => {
            if (!user) {
                // Not logged in -> redirect to login
                window.location.href = '/Task-Manager-KRK-App/login.html';
            } else {
                console.log('User is signed in:', user.email);

                // Boot up dynamic data and dashboard
                import('./services/init-service.js').then(async ({ ensureDefaultData }) => {
                    const ids = await ensureDefaultData(user.uid);
                    if (ids) {
                        await bootWorkspace(user.uid, ids.workspaceId, ids.boardId);
                        // Initialize workspace switcher
                        initWorkspaceSwitcher(user.uid, ids.workspaceId);
                    }
                });

                // Update avatar with user's initial
                const avatar = document.getElementById('user-avatar');
                if (avatar && user.displayName) {
                    avatar.textContent = user.displayName.charAt(0).toUpperCase();
                    avatar.setAttribute('data-tooltip', user.displayName);
                } else if (avatar && user.email) {
                    avatar.textContent = user.email.charAt(0).toUpperCase();
                    avatar.setAttribute('data-tooltip', user.email);
                }

                // Update Settings Modal with user email
                const settingsEmail = document.getElementById('settings-account-email');
                if (settingsEmail) {
                    settingsEmail.textContent = `Signed in as ${user.email}`;
                }
            }
        });

        // Add Sign Out handler to Settings Modal
        const btnSignOut = document.getElementById('btn-settings-signout');
        if (btnSignOut) {
            btnSignOut.addEventListener('click', () => {
                if (confirm('Are you sure you want to sign out?')) {
                    signOut(auth);
                }
            });
        }
    })
    .catch((err) => {
        console.warn('Firebase failed to load (UI still works):', err.message);
    });


/**
 * Boots (or re-boots) all modules for a given workspace.
 * Dashboard and BookmarkDashboard: full destroy/re-create (AbortController handles cleanup).
 * TaskModal and BookmarkModal: use switchContext() on re-boot to avoid re-binding ~60 event listeners.
 */
async function bootWorkspace(uid, workspaceId, boardId) {
    const { Dashboard } = await import('./dashboard.js?v=3');
    const { TaskModal } = await import('./task-detail.js?v=3');
    const { Calendar } = await import('./calendar.js?v=3');
    const { BookmarkDashboard } = await import('./bookmark-dashboard.js');
    const { BookmarkModal } = await import('./bookmark-modal.js');

    // --- Dashboard: full teardown + re-create (has AbortController cleanup) ---
    if (window.currentDashboard) {
        window.currentDashboard.destroy();
    }
    if (window.currentBookmarkDashboard) {
        window.currentBookmarkDashboard.destroy();
    }

    // --- Calendar ---
    const calendar = new Calendar('calendar-grid');
    calendar.init();

    // --- Dashboard ---
    window.currentDashboard = new Dashboard(uid, workspaceId, boardId, calendar);
    window.currentDashboard.init();

    // --- BookmarkDashboard ---
    window.currentBookmarkDashboard = new BookmarkDashboard(uid, workspaceId);
    window.currentBookmarkDashboard.init();

    // --- TaskModal: switchContext on re-boot, full create on first boot ---
    if (window.currentTaskModal) {
        window.currentTaskModal.switchContext(uid, workspaceId, boardId, calendar);
    } else {
        window.currentTaskModal = new TaskModal(uid, workspaceId, boardId, calendar);
        window.currentTaskModal.init();
    }

    // --- BookmarkModal: switchContext on re-boot, full create on first boot ---
    if (window.currentBookmarkModal) {
        window.currentBookmarkModal.switchContext(uid, workspaceId);
    } else {
        window.currentBookmarkModal = new BookmarkModal(uid, workspaceId);
        window.currentBookmarkModal.init();
    }

    // Store current workspace context globally
    window.__currentWorkspace = { uid, workspaceId, boardId };

    console.log(`Workspace booted: ${workspaceId}, Board: ${boardId}`);
}


/**
 * Switches to a different workspace. Called from the sidebar UI.
 * Tears down everything, provisions data if needed, and re-boots.
 */
async function switchWorkspace(uid, newWorkspaceId) {
    if (window.__currentWorkspace && window.__currentWorkspace.workspaceId === newWorkspaceId) {
        return; // Already on this workspace
    }

    console.log(`Switching to workspace: ${newWorkspaceId}`);

    // Save to localStorage
    localStorage.setItem(`lastWorkspaceId_${uid}`, newWorkspaceId);

    // Ensure the workspace has a board
    const { ensureBoardAndLabels } = await import('./services/init-service.js');
    const { boardId } = await ensureBoardAndLabels(uid, newWorkspaceId);

    // Re-boot all modules with the new workspace
    await bootWorkspace(uid, newWorkspaceId, boardId);

    // Update sidebar trigger immediately
    updateWorkspaceTrigger();

    // Reset view to Boards tab
    const btnNavBoards = document.getElementById('btn-nav-boards');
    if (btnNavBoards) btnNavBoards.click();
}

// Expose switchWorkspace globally so sidebar UI can call it
window.switchWorkspace = switchWorkspace;


/**
 * Initializes the workspace switcher UI in the sidebar.
 * Subscribes to workspace list and renders the dropdown.
 */
function initWorkspaceSwitcher(uid, activeWorkspaceId) {
    // We'll import workspace service and subscribe
    import('./services/workspace-service.js').then(({ workspaceService }) => {
        // Cache for use in event handlers
        window.__workspaceServiceCache = { workspaceService };

        const dropdownList = document.getElementById('workspace-dropdown-list');
        if (!dropdownList) return;

        // Subscribe to workspace changes
        workspaceService.subscribe(uid, (workspaces) => {
            window.__workspaces = workspaces;
            updateWorkspaceTrigger();
            renderWorkspaceList(uid, workspaces);
        });

        // Toggle dropdown
        const trigger = document.getElementById('workspace-switcher-trigger');
        const dropdown = document.getElementById('workspace-dropdown');
        if (trigger && dropdown) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = dropdown.style.display === 'flex';
                dropdown.style.display = isOpen ? 'none' : 'flex';
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
                    dropdown.style.display = 'none';
                }
            });
        }

        // Create workspace button
        const btnCreate = document.getElementById('btn-create-workspace');
        if (btnCreate) {
            btnCreate.addEventListener('click', () => {
                const dropdown = document.getElementById('workspace-dropdown');
                if (dropdown) dropdown.style.display = 'none';
                showCreateWorkspaceDialog(uid);
            });
        }

        // Update trigger on first load
        updateWorkspaceTrigger();
    });
}


/**
 * Updates the workspace trigger button text and color dot.
 */
function updateWorkspaceTrigger() {
    const currentNameEl = document.getElementById('workspace-current-name');
    const currentDotEl = document.getElementById('workspace-current-dot');
    if (!currentNameEl) return;

    const activeWsId = window.__currentWorkspace?.workspaceId;
    const workspaces = window.__workspaces || [];
    const activeWs = workspaces.find(ws => ws.id === activeWsId);

    if (activeWs) {
        currentNameEl.textContent = activeWs.name;
        if (currentDotEl) currentDotEl.style.backgroundColor = activeWs.color || '#6366f1';
    }
}


/**
 * Renders the workspace list inside the dropdown.
 */
function renderWorkspaceList(uid, workspaces) {
    const dropdownList = document.getElementById('workspace-dropdown-list');
    if (!dropdownList) return;

    const activeWorkspaceId = window.__currentWorkspace?.workspaceId;

    dropdownList.innerHTML = workspaces.map(ws => {
        const isActive = ws.id === activeWorkspaceId;
        return `
            <div class="workspace-item ${isActive ? 'active' : ''}" data-ws-id="${ws.id}">
                <div class="workspace-item-left" data-ws-id="${ws.id}">
                    <span class="workspace-dot" style="background-color: ${ws.color || '#6366f1'};"></span>
                    <span class="workspace-name">${escapeHTML(ws.name)}</span>
                    ${isActive ? '<span class="material-symbols-outlined workspace-check" style="font-size: 16px; color: var(--success);">check_circle</span>' : ''}
                </div>
                <div class="workspace-item-actions">
                    <button class="btn-icon workspace-edit-btn" data-ws-id="${ws.id}" data-ws-name="${escapeHTML(ws.name)}" data-ws-color="${ws.color || '#6366f1'}" title="Edit">
                        <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
                    </button>
                    <button class="btn-icon workspace-delete-btn" data-ws-id="${ws.id}" data-ws-name="${escapeHTML(ws.name)}" title="Delete" ${workspaces.length <= 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
                        <span class="material-symbols-outlined" style="font-size: 16px; color: var(--danger);">delete</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // --- Event delegation for workspace items ---
    dropdownList.onclick = async (e) => {
        const wsItem = e.target.closest('.workspace-item-left');
        const editBtn = e.target.closest('.workspace-edit-btn');
        const deleteBtn = e.target.closest('.workspace-delete-btn');

        if (editBtn) {
            e.stopPropagation();
            const wsId = editBtn.dataset.wsId;
            const wsName = editBtn.dataset.wsName;
            const wsColor = editBtn.dataset.wsColor;
            showEditWorkspaceDialog(uid, wsId, wsName, wsColor);
            return;
        }

        if (deleteBtn && !deleteBtn.disabled) {
            e.stopPropagation();
            const wsId = deleteBtn.dataset.wsId;
            const wsName = deleteBtn.dataset.wsName;
            if (confirm(`Delete workspace "${wsName}"? This will permanently remove all tasks, bookmarks, and labels in this workspace.`)) {
                const { workspaceService } = window.__workspaceServiceCache;
                await workspaceService.delete(uid, wsId);

                // If we deleted the active workspace, switch to the first available
                if (window.__currentWorkspace?.workspaceId === wsId) {
                    const remaining = (window.__workspaces || []).filter(ws => ws.id !== wsId);
                    if (remaining.length > 0) {
                        await switchWorkspace(uid, remaining[0].id);
                    }
                }
            }
            return;
        }

        if (wsItem) {
            const wsId = wsItem.dataset.wsId;
            if (wsId) {
                await switchWorkspace(uid, wsId);
                const dropdown = document.getElementById('workspace-dropdown');
                if (dropdown) dropdown.style.display = 'none';
            }
        }
    };
}


/**
 * Shows a dialog for creating a new workspace.
 */
function showCreateWorkspaceDialog(uid) {
    // Remove existing dialog if any
    const existing = document.getElementById('workspace-create-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'workspace-create-dialog';
    dialog.style.cssText = 'position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--bg-overlay); z-index: 2000;';
    dialog.innerHTML = `
        <div style="background: var(--bg-surface); border: 1px solid var(--border-primary); border-radius: var(--radius-xl); padding: 24px; max-width: 360px; width: 90%; box-shadow: var(--shadow-lg);">
            <h3 style="margin: 0 0 16px; font-size: 1rem; font-weight: 600;">Create Workspace</h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div>
                    <label style="display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px;">Name</label>
                    <input type="text" id="create-ws-name" placeholder="e.g. Acme Corp" class="form-input" autocomplete="off" style="width: 100%; padding: 8px 12px; background: var(--bg-input); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-primary);">
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-input); padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-primary);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="color: var(--text-muted); font-size: 18px;">palette</span>
                        <span style="font-size: 0.85rem; color: var(--text-secondary);">Color</span>
                    </div>
                    <div style="position: relative; width: 28px; height: 28px; border-radius: 50%; overflow: hidden; border: 2px solid var(--border-primary); cursor: pointer;">
                        <input type="color" id="create-ws-color" value="#6366f1" style="position: absolute; top: -10px; left: -10px; width: 48px; height: 48px; cursor: pointer; border: none; padding: 0;">
                    </div>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 4px;">
                    <button class="btn btn-primary btn-sm" id="btn-create-ws-save" style="flex: 1;">Create</button>
                    <button class="btn btn-outline btn-sm" id="btn-create-ws-cancel" style="flex: 1;">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    // Focus name input
    const nameInput = document.getElementById('create-ws-name');
    if (nameInput) nameInput.focus();

    // Cancel
    document.getElementById('btn-create-ws-cancel').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

    // Save
    document.getElementById('btn-create-ws-save').addEventListener('click', async () => {
        const name = document.getElementById('create-ws-name').value.trim();
        const color = document.getElementById('create-ws-color').value;
        if (!name) return;

        const { workspaceService } = window.__workspaceServiceCache;
        const ws = await workspaceService.create(uid, name, color);
        dialog.remove();

        // Switch to the new workspace
        await switchWorkspace(uid, ws.id);
    });

    // Enter to create
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-create-ws-save').click();
        }
    });
}


/**
 * Shows a simple edit dialog for renaming / recoloring a workspace.
 */
function showEditWorkspaceDialog(uid, wsId, currentName, currentColor) {
    // Remove existing dialog if any
    const existing = document.getElementById('workspace-edit-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'workspace-edit-dialog';
    dialog.style.cssText = 'position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--bg-overlay); z-index: 2000;';
    dialog.innerHTML = `
        <div style="background: var(--bg-surface); border: 1px solid var(--border-primary); border-radius: var(--radius-xl); padding: 24px; max-width: 360px; width: 90%; box-shadow: var(--shadow-lg);">
            <h3 style="margin: 0 0 16px; font-size: 1rem; font-weight: 600;">Edit Workspace</h3>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div>
                    <label style="display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px;">Name</label>
                    <input type="text" id="edit-ws-name" value="${escapeHTML(currentName)}" class="form-input" autocomplete="off" style="width: 100%; padding: 8px 12px; background: var(--bg-input); border: 1px solid var(--border-primary); border-radius: var(--radius-md); color: var(--text-primary);">
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-input); padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-primary);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="material-symbols-outlined" style="color: var(--text-muted); font-size: 18px;">palette</span>
                        <span style="font-size: 0.85rem; color: var(--text-secondary);">Color</span>
                    </div>
                    <div style="position: relative; width: 28px; height: 28px; border-radius: 50%; overflow: hidden; border: 2px solid var(--border-primary); cursor: pointer;">
                        <input type="color" id="edit-ws-color" value="${currentColor}" style="position: absolute; top: -10px; left: -10px; width: 48px; height: 48px; cursor: pointer; border: none; padding: 0;">
                    </div>
                </div>
                <div style="display: flex; gap: 8px; margin-top: 4px;">
                    <button class="btn btn-primary btn-sm" id="btn-edit-ws-save" style="flex: 1;">Save</button>
                    <button class="btn btn-outline btn-sm" id="btn-edit-ws-cancel" style="flex: 1;">Cancel</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    // Focus name input
    const nameInput = document.getElementById('edit-ws-name');
    if (nameInput) {
        nameInput.focus();
        nameInput.select();
    }

    // Cancel
    document.getElementById('btn-edit-ws-cancel').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

    // Save
    document.getElementById('btn-edit-ws-save').addEventListener('click', async () => {
        const newName = document.getElementById('edit-ws-name').value.trim();
        const newColor = document.getElementById('edit-ws-color').value;
        if (!newName) return;

        const { workspaceService } = window.__workspaceServiceCache;
        await workspaceService.update(uid, wsId, { name: newName, color: newColor });
        dialog.remove();
    });

    // Enter to save
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btn-edit-ws-save').click();
        }
    });
}


/**
 * Escapes HTML to prevent XSS in dynamic content.
 */
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

