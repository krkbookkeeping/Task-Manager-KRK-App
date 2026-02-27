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
                        const { Dashboard } = await import('./dashboard.js?v=3');
                        const { TaskModal } = await import('./task-detail.js?v=3');
                        const { Calendar } = await import('./calendar.js?v=3');

                        // Clean up old dashboard if it exists
                        if (window.currentDashboard) {
                            window.currentDashboard.destroy();
                        }
                        if (window.currentTaskModal) {
                            window.currentTaskModal.destroy();
                        }
                        // Assume we might want to cleanup calendar later, but for now just instantiate

                        const calendar = new Calendar('calendar-grid');
                        calendar.init();

                        // Initialize new dynamic dashboard, pass calendar so it can update task dates
                        window.currentDashboard = new Dashboard(user.uid, ids.workspaceId, ids.boardId, calendar);
                        window.currentDashboard.init();

                        // Initialize new task modal
                        window.currentTaskModal = new TaskModal(user.uid, ids.workspaceId, ids.boardId, calendar);
                        window.currentTaskModal.init();
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
