/**
 * Theme Manager
 * 
 * Manages light/dark mode across the entire application.
 * Theme preference is stored account-wide (same across all workspaces).
 * 
 * Once Firebase Auth is available, persistence will move to Firestore.
 * Default theme: light.
 */

const THEME_KEY = 'taskmanager-theme';

class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.listeners = [];
    }

    /**
     * Initialize theme on app start.
     * Must be called after DOMContentLoaded so toggle elements exist.
     */
    init() {
        const saved = this._getStoredTheme();
        this.currentTheme = saved || 'light';
        this._apply(this.currentTheme);
    }

    /**
     * Get the current theme
     */
    getTheme() {
        return this.currentTheme;
    }

    /**
     * Set theme to 'light' or 'dark'
     */
    setTheme(theme) {
        if (theme !== 'light' && theme !== 'dark') return;
        this.currentTheme = theme;
        this._apply(theme);
        this._storeTheme(theme);
        this._notifyListeners(theme);
    }

    /**
     * Toggle between light and dark
     */
    toggle() {
        const next = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(next);
    }

    /**
     * Subscribe to theme changes
     * @param {function} callback - receives the new theme string
     * @returns {function} unsubscribe function
     */
    onChange(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    /**
     * Apply theme to DOM
     */
    _apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Update the toggle UI if it exists
        const toggleInput = document.getElementById('theme-toggle');
        if (toggleInput) {
            toggleInput.checked = theme === 'dark';
        }

        // Update the label text if it exists
        const label = document.getElementById('theme-label');
        if (label) {
            label.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
        }

        // Update the theme icon if it exists (Material Icon names)
        const icon = document.getElementById('theme-icon');
        if (icon) {
            icon.textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
        }
    }

    _notifyListeners(theme) {
        this.listeners.forEach(cb => cb(theme));
    }

    /**
     * Temporary storage (will be replaced by Firestore in Phase 3)
     */
    _getStoredTheme() {
        try {
            return localStorage.getItem(THEME_KEY);
        } catch {
            return null;
        }
    }

    _storeTheme(theme) {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch {
            // Silently fail — localStorage is temporary anyway
        }
    }
}

// Singleton export
export const themeManager = new ThemeManager();
