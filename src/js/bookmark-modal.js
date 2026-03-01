import { bookmarkService } from './services/bookmark-service.js';
import { bookmarkLabelService } from './services/bookmark-label-service.js';

export class BookmarkModal {
    constructor(uid, workspaceId) {
        this.uid = uid;
        this.workspaceId = workspaceId;

        // Elements
        this.overlay = document.getElementById('bookmark-modal-overlay');
        this.titleText = document.getElementById('bookmark-modal-title-text');
        this.nameInput = document.getElementById('bookmark-modal-name');
        this.urlInput = document.getElementById('bookmark-modal-url');
        this.notesInput = document.getElementById('bookmark-modal-notes');

        // Buttons
        this.btnSave = document.getElementById('btn-bookmark-save');
        this.btnCancel = document.getElementById('btn-bookmark-cancel');
        this.btnClose = document.getElementById('btn-bookmark-close');
        this.btnDelete = document.getElementById('btn-bookmark-delete');

        // Label Multi-Select Elements
        this.labelTrigger = document.getElementById('bookmark-label-trigger');
        this.labelDropdown = document.getElementById('bookmark-label-dropdown');
        this.labelSearch = document.getElementById('bookmark-label-search');
        this.labelOptions = document.getElementById('bookmark-label-options');
        this.labelCreateSection = document.getElementById('bookmark-label-create-section');
        this.btnCreateLabel = document.getElementById('btn-create-new-bookmark-label-modal');
        this.newLabelText = document.getElementById('new-bookmark-label-text');
        this.selectedLabelsContainer = document.getElementById('bookmark-selected-labels');

        // State
        this.currentBookmarkId = null;
        this.allLabels = [];
        this.selectedLabelIds = new Set();
        this.unsubLabels = null;
        this.isSaving = false;

        this.bindEvents();
    }

    init() {
        this.unsubLabels = bookmarkLabelService.subscribe(this.uid, this.workspaceId, (labels) => {
            this.allLabels = labels;
            this.renderLabelOptions();
            this.renderSelectedLabels();
        });
    }

    destroy() {
        if (this.unsubLabels) this.unsubLabels();
    }

    /**
     * Updates workspace context without re-binding DOM event listeners.
     */
    switchContext(uid, workspaceId) {
        if (this.unsubLabels) this.unsubLabels();
        this.uid = uid;
        this.workspaceId = workspaceId;
        this.currentBookmarkId = null;
        this.allLabels = [];
        this.selectedLabels = [];
        this.init();
    }

    bindEvents() {
        this.btnCancel.addEventListener('click', () => this.close());
        this.btnClose.addEventListener('click', () => this.close());

        this.btnSave.addEventListener('click', () => this.save());
        this.btnDelete.addEventListener('click', () => this.deleteBookmark());

        // Sync name input to title
        this.nameInput.addEventListener('input', () => {
            const val = this.nameInput.value.trim();
            this.titleText.textContent = val || (this.currentBookmarkId ? 'Untitled Bookmark' : 'New Bookmark');
        });

        // Label dropdown
        this.labelTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleLabelDropdown();
        });

        document.addEventListener('click', (e) => {
            if (this.labelDropdown && !this.labelDropdown.contains(e.target) && !this.labelTrigger.contains(e.target)) {
                this.labelDropdown.style.display = 'none';
            }
        });

        this.labelSearch.addEventListener('input', () => this.renderLabelOptions());

        this.btnCreateLabel.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const name = this.labelSearch.value.trim();
            if (name) {
                try {
                    const colors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];
                    const newLabel = await bookmarkLabelService.create(this.uid, this.workspaceId, name, randomColor);
                    this.selectedLabelIds.add(newLabel.id);
                    this.labelSearch.value = '';
                    this.renderLabelOptions();
                    this.renderSelectedLabels();
                } catch (err) {
                    console.error("Failed to create bookmark label", err);
                }
            }
        });

        // Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
                this.close();
            }
        });
    }

    open(bookmarkId = null, defaultLabelId = null) {
        this.currentBookmarkId = bookmarkId;
        this.selectedLabelIds.clear();
        this.labelSearch.value = '';
        this.renderLabelOptions();

        if (bookmarkId) {
            this.titleText.textContent = 'Loading...';
            this.btnDelete.style.display = 'flex';
            this.btnSave.textContent = 'Save Changes';
            this.populateBookmarkData(bookmarkId);
        } else {
            this.titleText.textContent = 'New Bookmark';
            this.btnDelete.style.display = 'none';
            this.btnSave.textContent = 'Create Bookmark';
            this.nameInput.value = '';
            this.urlInput.value = '';
            this.notesInput.value = '';
            if (defaultLabelId) {
                this.selectedLabelIds.add(defaultLabelId);
            }
        }

        this.renderSelectedLabels();
        this.overlay.classList.add('active');
        this.nameInput.focus();
    }

    close() {
        this.overlay.classList.remove('active');
        this.currentBookmarkId = null;
        this.isSaving = false;
        this.btnSave.disabled = false;
        this.labelDropdown.style.display = 'none';
    }

    async populateBookmarkData(bookmarkId) {
        try {
            const bm = await bookmarkService.getBookmark(this.uid, this.workspaceId, bookmarkId);
            if (bm) {
                this.nameInput.value = bm.name || '';
                this.urlInput.value = bm.url || '';
                this.notesInput.value = bm.notes || '';
                this.titleText.textContent = bm.name || 'Untitled Bookmark';
                if (bm.labels && Array.isArray(bm.labels)) {
                    bm.labels.forEach(id => this.selectedLabelIds.add(id));
                }
                this.renderSelectedLabels();
            }
        } catch (err) {
            console.error("Failed to load bookmark data:", err);
            this.close();
        }
    }

    async save() {
        if (this.isSaving) return;

        const name = this.nameInput.value.trim();
        if (!name) {
            alert('A bookmark name is required.');
            this.nameInput.focus();
            return;
        }

        this.isSaving = true;
        this.btnSave.disabled = true;
        this.btnSave.textContent = 'Saving...';

        // Snapshot the id immediately so concurrent close() calls can't nullify it mid-flight
        const bookmarkId = this.currentBookmarkId;

        try {
            const data = {
                name,
                url: this.urlInput.value.trim(),
                notes: this.notesInput.value.trim(),
                labels: Array.from(this.selectedLabelIds)
            };

            if (bookmarkId) {
                await bookmarkService.update(this.uid, this.workspaceId, bookmarkId, data);
            } else {
                const primaryLabelId = data.labels.length > 0 ? data.labels[0] : null;
                const newBm = await bookmarkService.create(this.uid, this.workspaceId, name, primaryLabelId);
                await bookmarkService.update(this.uid, this.workspaceId, newBm.id, {
                    url: data.url,
                    notes: data.notes,
                    labels: data.labels
                });
            }

            this.isSaving = false;
            this.close();
        } catch (err) {
            console.error('Failed to save bookmark:', err);
            alert('Failed to save bookmark.');
            this.isSaving = false;
            this.btnSave.disabled = false;
            this.btnSave.textContent = bookmarkId ? 'Save Changes' : 'Create Bookmark';
        }
    }

    async deleteBookmark() {
        if (!this.currentBookmarkId) return;
        if (!confirm('Delete this bookmark permanently?')) return;

        try {
            await bookmarkService.delete(this.uid, this.workspaceId, this.currentBookmarkId);
            this.close();
        } catch (err) {
            console.error("Failed to delete bookmark:", err);
            alert("Failed to delete bookmark.");
        }
    }

    // --- Label Dropdown Logic ---

    toggleLabelDropdown() {
        const isVisible = this.labelDropdown.style.display === 'flex';
        this.labelDropdown.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            this.labelSearch.focus();
            this.renderLabelOptions();
        }
    }

    renderLabelOptions() {
        const searchTerm = this.labelSearch.value.trim().toLowerCase();
        this.labelOptions.innerHTML = '';
        let matchFound = false;

        this.allLabels.forEach(label => {
            if (label.name.toLowerCase().includes(searchTerm)) {
                if (label.name.toLowerCase() === searchTerm) matchFound = true;

                const isSelected = this.selectedLabelIds.has(label.id);
                const el = document.createElement('div');
                el.className = `custom-select-option ${isSelected ? 'selected' : ''}`;
                el.innerHTML = `
                    <span class="label-dot" style="background-color: ${label.color}; width: 12px; height: 12px;"></span>
                    <span style="flex: 1;">${this.escapeHtml(label.name)}</span>
                    ${isSelected ? '<span class="material-symbols-outlined" style="font-size: 16px; color: var(--primary);">check</span>' : ''}
                `;

                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (isSelected) {
                        this.selectedLabelIds.delete(label.id);
                    } else {
                        this.selectedLabelIds.add(label.id);
                    }
                    this.renderLabelOptions();
                    this.renderSelectedLabels();
                });

                this.labelOptions.appendChild(el);
            }
        });

        if (searchTerm && !matchFound) {
            this.labelCreateSection.style.display = 'block';
            this.newLabelText.textContent = searchTerm;
        } else {
            this.labelCreateSection.style.display = 'none';
        }
    }

    renderSelectedLabels() {
        this.selectedLabelsContainer.innerHTML = '';
        const display = document.getElementById('bookmark-label-display');

        if (this.selectedLabelIds.size === 0) {
            display.textContent = 'Select labels...';
            display.style.color = 'var(--text-muted)';
            return;
        }

        display.textContent = `${this.selectedLabelIds.size} selected`;
        display.style.color = 'var(--text-main)';

        this.selectedLabelIds.forEach(id => {
            const label = this.allLabels.find(l => l.id === id);
            if (label) {
                const tag = document.createElement('div');
                tag.className = 'label-tag';
                tag.innerHTML = `
                    <span class="label-tag-color" style="background-color: ${label.color};"></span>
                    <span>${this.escapeHtml(label.name)}</span>
                    <span class="material-symbols-outlined label-tag-remove" data-id="${label.id}">close</span>
                `;
                this.selectedLabelsContainer.appendChild(tag);
            }
        });

        const removeBtns = this.selectedLabelsContainer.querySelectorAll('.label-tag-remove');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectedLabelIds.delete(btn.getAttribute('data-id'));
                this.renderSelectedLabels();
                this.renderLabelOptions();
            });
        });
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
