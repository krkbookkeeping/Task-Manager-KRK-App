import { noteService } from './services/note-service.js';
import { noteLabelService } from './services/note-label-service.js';
import { taskService } from './services/task-service.js';
import { labelService } from './services/label-service.js';

export class NoteModal {
    constructor(uid, workspaceId) {
        this.uid = uid;
        this.workspaceId = workspaceId;

        // Elements
        this.overlay = document.getElementById('note-modal-overlay');
        this.titleText = document.getElementById('note-modal-title-text');
        this.nameInput = document.getElementById('note-modal-name');
        this.createdInfo = document.getElementById('note-modal-created-info');

        // Buttons
        this.btnSave = document.getElementById('btn-note-save');
        this.btnCancel = document.getElementById('btn-note-cancel');
        this.btnClose = document.getElementById('btn-note-close');
        this.btnDelete = document.getElementById('btn-note-delete');

        // Label Multi-Select Elements
        this.labelTrigger = document.getElementById('note-label-trigger');
        this.labelDropdown = document.getElementById('note-label-dropdown');
        this.labelSearch = document.getElementById('note-label-search');
        this.labelOptions = document.getElementById('note-label-options');
        this.labelCreateSection = document.getElementById('note-label-create-section');
        this.btnCreateLabel = document.getElementById('btn-create-new-note-label-modal');
        this.newLabelText = document.getElementById('new-note-label-text');
        this.selectedLabelsContainer = document.getElementById('note-selected-labels');

        // Comment Elements
        this.commentEditor = document.getElementById('note-comment-editor');
        this.btnAddComment = document.getElementById('btn-note-add-comment');
        this.commentsList = document.getElementById('note-comments-list');
        this.btnCommentBold = document.getElementById('btn-note-comment-bold');
        this.btnCommentHighlight = document.getElementById('btn-note-comment-highlight');
        this.btnCommentLink = document.getElementById('btn-note-comment-link');

        // Related Tasks Elements
        this.btnLinkTask = document.getElementById('btn-note-link-task');
        this.relatedTasksSearch = document.getElementById('note-related-tasks-search');
        this.relatedTasksSearchInput = document.getElementById('note-related-tasks-search-input');
        this.relatedTasksSearchResults = document.getElementById('note-related-tasks-search-results');
        this.relatedTasksList = document.getElementById('note-related-tasks-list');

        // Related Notes Elements
        this.btnLinkNote = document.getElementById('btn-note-link-note');
        this.relatedNotesSearch = document.getElementById('note-related-notes-search');
        this.relatedNotesSearchInput = document.getElementById('note-related-notes-search-input');
        this.relatedNotesSearchResults = document.getElementById('note-related-notes-search-results');
        this.relatedNotesList = document.getElementById('note-related-notes-list');

        // Lightbox (reuse existing)
        this.lightbox = document.getElementById('image-lightbox');
        this.lightboxImage = document.getElementById('lightbox-image');
        this.lightboxClose = document.getElementById('lightbox-close');

        // State
        this.currentNoteId = null;
        this.allLabels = [];
        this.selectedLabelIds = new Set();
        this.unsubLabels = null;
        this.isSaving = false;
        this.comments = [];
        this.relatedTaskIds = [];
        this.relatedNoteIds = [];
        this.allBoardTasks = [];
        this.allWorkspaceNotes = [];
        this.allTaskLabels = [];
        this.allNoteLabels = [];

        this.bindEvents();
    }

    init() {
        this.unsubLabels = noteLabelService.subscribe(this.uid, this.workspaceId, (labels) => {
            this.allLabels = labels;
            this.renderLabelOptions();
            this.renderSelectedLabels();
        });
    }

    destroy() {
        if (this.unsubLabels) this.unsubLabels();
    }

    switchContext(uid, workspaceId) {
        if (this.unsubLabels) this.unsubLabels();
        this.uid = uid;
        this.workspaceId = workspaceId;
        this.currentNoteId = null;
        this.allLabels = [];
        this.selectedLabelIds = new Set();
        this.comments = [];
        this.init();
    }

    bindEvents() {
        this.btnCancel.addEventListener('click', () => this.close());
        this.btnClose.addEventListener('click', () => this.close());
        this.btnSave.addEventListener('click', () => this.save());
        this.btnDelete.addEventListener('click', () => this.deleteNote());

        // Sync name input to title
        this.nameInput.addEventListener('input', () => {
            const val = this.nameInput.value.trim();
            this.titleText.textContent = val || (this.currentNoteId ? 'Untitled Note' : 'New Note');
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
                    const newLabel = await noteLabelService.create(this.uid, this.workspaceId, name, randomColor);
                    this.selectedLabelIds.add(newLabel.id);
                    this.labelSearch.value = '';
                    this.renderLabelOptions();
                    this.renderSelectedLabels();
                } catch (err) {
                    console.error("Failed to create note label", err);
                }
            }
        });

        // Comment toolbar
        this.btnCommentBold.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.execCommand('bold');
        });

        this.btnCommentHighlight.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            let node = sel.anchorNode;
            let isHighlighted = false;
            while (node && node !== this.commentEditor) {
                if (node.nodeType === 1) {
                    const bg = node.style?.backgroundColor || '';
                    if (bg === 'rgb(254, 240, 138)' || bg === '#fef08a') {
                        isHighlighted = true;
                        break;
                    }
                }
                node = node.parentNode;
            }
            document.execCommand('hiliteColor', false, isHighlighted ? 'transparent' : '#fef08a');
        });

        this.btnCommentLink.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const url = prompt('Enter URL:');
            if (url) {
                document.execCommand('createLink', false, url);
            }
        });

        // Add comment
        this.btnAddComment.addEventListener('click', () => this.addComment());

        // Image paste
        this.commentEditor.addEventListener('paste', (e) => this.handleImagePaste(e, this.commentEditor));

        // Related Tasks: link button and search
        this.btnLinkTask.addEventListener('click', () => {
            const isVisible = this.relatedTasksSearch.style.display !== 'none';
            this.relatedTasksSearch.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                this.relatedTasksSearchInput.value = '';
                this.relatedTasksSearchInput.focus();
                this.renderTaskSearchResults('');
            }
        });

        this.relatedTasksSearchInput.addEventListener('input', () => {
            this.renderTaskSearchResults(this.relatedTasksSearchInput.value.trim().toLowerCase());
        });

        // Related Notes: link button and search
        this.btnLinkNote.addEventListener('click', () => {
            const isVisible = this.relatedNotesSearch.style.display !== 'none';
            this.relatedNotesSearch.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                this.relatedNotesSearchInput.value = '';
                this.relatedNotesSearchInput.focus();
                this.renderNoteSearchResults('');
            }
        });

        this.relatedNotesSearchInput.addEventListener('input', () => {
            this.renderNoteSearchResults(this.relatedNotesSearchInput.value.trim().toLowerCase());
        });

        // Close search dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (this.relatedTasksSearch && !this.relatedTasksSearch.contains(e.target) && !this.btnLinkTask.contains(e.target)) {
                this.relatedTasksSearch.style.display = 'none';
            }
            if (this.relatedNotesSearch && !this.relatedNotesSearch.contains(e.target) && !this.btnLinkNote.contains(e.target)) {
                this.relatedNotesSearch.style.display = 'none';
            }
        });

        // Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
                this.close();
            }
        });
    }

    async open(noteId = null, defaultLabelId = null) {
        this.currentNoteId = noteId;
        this.selectedLabelIds.clear();
        this.labelSearch.value = '';
        this.comments = [];
        this.relatedTaskIds = [];
        this.relatedNoteIds = [];
        this.commentEditor.innerHTML = '';
        this.relatedTasksSearch.style.display = 'none';
        this.relatedNotesSearch.style.display = 'none';
        this.renderLabelOptions();

        if (noteId) {
            this.btnDelete.style.display = 'flex';
            this.btnSave.textContent = 'Save Changes';
            await this.populateNoteData(noteId);
            // Title shows the note name
            this.titleText.textContent = this.nameInput.value || 'Untitled Note';
        } else {
            this.titleText.textContent = 'New Note';
            this.btnDelete.style.display = 'none';
            this.btnSave.textContent = 'Create Note';
            this.nameInput.value = '';
            this.createdInfo.textContent = '';
            if (defaultLabelId) {
                this.selectedLabelIds.add(defaultLabelId);
            }
        }

        // Load related data
        this.allBoardTasks = await this.loadAllBoardTasks();
        this.allTaskLabels = await this.loadAllTaskLabels();
        this.allWorkspaceNotes = await this.loadAllWorkspaceNotes();
        this.allNoteLabels = await this.loadAllNoteLabels();

        this.renderSelectedLabels();
        this.renderComments();
        this.renderRelatedTasks();
        this.renderRelatedNotes();
        this.overlay.classList.add('active');
        this.nameInput.focus();
    }

    close() {
        this.overlay.classList.remove('active');
        this.currentNoteId = null;
        this.isSaving = false;
        this.btnSave.disabled = false;
        this.labelDropdown.style.display = 'none';
    }

    async populateNoteData(noteId) {
        try {
            const note = await noteService.getNote(this.uid, this.workspaceId, noteId);
            if (note) {
                this.nameInput.value = note.name || '';
                if (note.labels && Array.isArray(note.labels)) {
                    note.labels.forEach(id => this.selectedLabelIds.add(id));
                }
                this.comments = note.comments || [];
                this.relatedTaskIds = note.relatedTasks || [];
                this.relatedNoteIds = note.relatedNotes || [];
                // Show created date
                if (note.createdAt) {
                    this.createdInfo.textContent = `Created ${this.formatCommentDate(
                        note.createdAt.toDate ? note.createdAt.toDate().toISOString() :
                        note.createdAt.seconds ? new Date(note.createdAt.seconds * 1000).toISOString() :
                        note.createdAt
                    )}`;
                }
                this.renderSelectedLabels();
            }
        } catch (err) {
            console.error("Failed to load note data:", err);
            this.close();
        }
    }

    async save() {
        if (this.isSaving) return;

        const name = this.nameInput.value.trim();
        if (!name) {
            alert('A note name is required.');
            this.nameInput.focus();
            return;
        }

        this.isSaving = true;
        this.btnSave.disabled = true;
        this.btnSave.textContent = 'Saving...';

        const noteId = this.currentNoteId;

        try {
            const data = {
                name,
                labels: Array.from(this.selectedLabelIds),
                comments: this.comments,
                relatedTasks: this.relatedTaskIds,
                relatedNotes: this.relatedNoteIds
            };

            if (noteId) {
                await noteService.update(this.uid, this.workspaceId, noteId, data);
            } else {
                const primaryLabelId = data.labels.length > 0 ? data.labels[0] : null;
                const newNote = await noteService.create(this.uid, this.workspaceId, name, primaryLabelId);
                await noteService.update(this.uid, this.workspaceId, newNote.id, {
                    labels: data.labels,
                    comments: data.comments
                });
            }

            this.isSaving = false;
            this.close();
        } catch (err) {
            console.error('Failed to save note:', err);
            alert('Failed to save note.');
            this.isSaving = false;
            this.btnSave.disabled = false;
            this.btnSave.textContent = noteId ? 'Save Changes' : 'Create Note';
        }
    }

    async deleteNote() {
        if (!this.currentNoteId) return;
        if (!confirm('Delete this note permanently?')) return;

        try {
            await noteService.delete(this.uid, this.workspaceId, this.currentNoteId);
            this.close();
        } catch (err) {
            console.error("Failed to delete note:", err);
            alert("Failed to delete note.");
        }
    }

    // --- Comment System ---

    async addComment() {
        const content = this.commentEditor.innerHTML.trim();
        if (!content || content === '<br>') return;

        const comment = {
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            content: content,
            createdAt: new Date().toISOString()
        };
        this.comments.push(comment);

        this.commentEditor.innerHTML = '';
        this.renderComments();

        // Save immediately if editing an existing note
        if (this.currentNoteId) {
            try {
                await noteService.update(this.uid, this.workspaceId, this.currentNoteId, {
                    comments: this.comments
                });
            } catch (err) {
                console.error('Failed to save comment:', err);
            }
        }
    }

    renderComments() {
        if (!this.commentsList) return;

        if (this.comments.length === 0) {
            this.commentsList.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: var(--space-xl) 0;">
                    <span class="material-symbols-outlined" style="font-size: 28px; opacity: 0.4;">forum</span>
                    <p style="font-size: 0.85rem; margin-top: 6px;">No comments yet.</p>
                </div>
            `;
            return;
        }

        // Show newest first
        const sorted = [...this.comments].reverse();
        this.commentsList.innerHTML = sorted.map(c => `
            <div class="note-comment-entry" data-comment-id="${c.id}">
                <div class="note-comment-timestamp">
                    ${this.formatCommentDate(c.createdAt)}
                    <span class="comment-actions">
                        <button class="comment-action-btn" data-action="edit" data-comment-id="${c.id}" title="Edit">
                            <span class="material-symbols-outlined" style="font-size: 15px;">edit</span>
                        </button>
                        <button class="comment-action-btn comment-action-delete" data-action="delete" data-comment-id="${c.id}" title="Delete">
                            <span class="material-symbols-outlined" style="font-size: 15px;">delete</span>
                        </button>
                    </span>
                </div>
                <div class="note-comment-content">${this.linkify(c.content)}</div>
            </div>
        `).join('');

        // Attach lightbox click handlers to images
        this.commentsList.querySelectorAll('.note-comment-content img').forEach(img => {
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => this.openLightbox(img.src));
        });

        // Edit handlers
        this.commentsList.querySelectorAll('.comment-action-btn[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => this.editComment(btn.getAttribute('data-comment-id')));
        });

        // Delete handlers
        this.commentsList.querySelectorAll('.comment-action-btn[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => this.deleteComment(btn.getAttribute('data-comment-id')));
        });
    }

    editComment(commentId) {
        const comment = this.comments.find(c => c.id === commentId);
        if (!comment) return;

        const entry = this.commentsList.querySelector(`.note-comment-entry[data-comment-id="${commentId}"]`);
        if (!entry) return;

        const contentDiv = entry.querySelector('.note-comment-content');
        const actionsSpan = entry.querySelector('.comment-actions');

        if (actionsSpan) actionsSpan.style.display = 'none';

        contentDiv.innerHTML = `
            <div class="comment-inline-toolbar">
                <button class="comment-toolbar-btn inline-bold-btn" type="button" title="Bold">
                    <span class="material-symbols-outlined" style="font-size: 18px;">format_bold</span>
                </button>
                <button class="comment-toolbar-btn inline-highlight-btn" type="button" title="Highlight">
                    <span class="material-symbols-outlined" style="font-size: 18px;">ink_highlighter</span>
                </button>
            </div>
            <div class="comment-inline-editor" contenteditable="true">${comment.content}</div>
            <div class="comment-inline-actions">
                <button class="btn btn-primary btn-sm inline-save-btn" type="button">Save</button>
                <button class="btn btn-outline btn-sm inline-cancel-btn" type="button">Cancel</button>
            </div>
        `;

        const inlineEditor = contentDiv.querySelector('.comment-inline-editor');
        inlineEditor.focus();

        // Image paste in inline editor
        inlineEditor.addEventListener('paste', (e) => this.handleImagePaste(e, inlineEditor));

        // Inline Bold
        contentDiv.querySelector('.inline-bold-btn').addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.execCommand('bold');
        });

        // Inline Highlight
        contentDiv.querySelector('.inline-highlight-btn').addEventListener('mousedown', (e) => {
            e.preventDefault();
            const sel = window.getSelection();
            if (!sel.rangeCount) return;
            let node = sel.anchorNode;
            let isHighlighted = false;
            while (node && node !== inlineEditor) {
                if (node.nodeType === 1) {
                    const bg = node.style?.backgroundColor || '';
                    if (bg === 'rgb(254, 240, 138)' || bg === '#fef08a') {
                        isHighlighted = true;
                        break;
                    }
                }
                node = node.parentNode;
            }
            document.execCommand('hiliteColor', false, isHighlighted ? 'transparent' : '#fef08a');
        });

        // Save
        contentDiv.querySelector('.inline-save-btn').addEventListener('click', async () => {
            const newContent = inlineEditor.innerHTML.trim();
            if (newContent && newContent !== '<br>') {
                const idx = this.comments.findIndex(c => c.id === commentId);
                if (idx !== -1) this.comments[idx].content = newContent;
            }
            this.renderComments();
            if (this.currentNoteId) {
                try {
                    await noteService.update(this.uid, this.workspaceId, this.currentNoteId, {
                        comments: this.comments
                    });
                } catch (err) {
                    console.error('Failed to save comment:', err);
                }
            }
        });

        // Cancel
        contentDiv.querySelector('.inline-cancel-btn').addEventListener('click', () => {
            this.renderComments();
        });
    }

    async deleteComment(commentId) {
        if (!confirm('Delete this comment?')) return;

        this.comments = this.comments.filter(c => c.id !== commentId);
        this.renderComments();

        if (this.currentNoteId) {
            try {
                await noteService.update(this.uid, this.workspaceId, this.currentNoteId, {
                    comments: this.comments
                });
            } catch (err) {
                console.error('Failed to delete comment:', err);
            }
        }
    }

    handleImagePaste(e, editorElement) {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const img = document.createElement('img');
                    img.src = ev.target.result;
                    img.className = 'comment-pasted-image';
                    img.addEventListener('click', () => this.openLightbox(img.src));
                    editorElement.appendChild(img);
                };
                reader.readAsDataURL(file);
                break;
            }
        }
    }

    openLightbox(src) {
        if (this.lightbox && this.lightboxImage) {
            this.lightboxImage.src = src;
            this.lightbox.style.display = 'flex';
        }
    }

    formatCommentDate(isoString) {
        const d = new Date(isoString);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        let hours = d.getHours();
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12 || 12;
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${mins} ${ampm}`;
    }

    linkify(html) {
        if (!html) return '';
        // Don't linkify URLs that are already in anchor tags or image srcs
        return html.replace(
            /(?<![="'])(https?:\/\/[^\s<]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
    }

    // --- Related Tasks Logic ---

    async loadAllBoardTasks() {
        try {
            const ws = window.__currentWorkspace;
            if (!ws || !ws.boardId) return [];
            return await taskService.getAllTasks(ws.uid, ws.workspaceId, ws.boardId) || [];
        } catch (err) {
            console.error('Failed to load board tasks:', err);
            return [];
        }
    }

    async loadAllTaskLabels() {
        try {
            const ws = window.__currentWorkspace;
            if (!ws || !ws.boardId) return [];
            const { getDocs, collection } = await import('firebase/firestore');
            const { db } = await import('./firebase-config.js');
            const snap = await getDocs(collection(db, 'users', ws.uid, 'workspaces', ws.workspaceId, 'boards', ws.boardId, 'labels'));
            return snap.docs.map(d => d.data());
        } catch (err) {
            console.error('Failed to load task labels:', err);
            return [];
        }
    }

    async loadAllWorkspaceNotes() {
        try {
            return await noteService.getAllNotes(this.uid, this.workspaceId) || [];
        } catch (err) {
            console.error('Failed to load workspace notes:', err);
            return [];
        }
    }

    async loadAllNoteLabels() {
        try {
            const { getDocs, collection } = await import('firebase/firestore');
            const { db } = await import('./firebase-config.js');
            const snap = await getDocs(collection(db, 'users', this.uid, 'workspaces', this.workspaceId, 'noteLabels'));
            return snap.docs.map(d => d.data());
        } catch (err) {
            console.error('Failed to load note labels:', err);
            return [];
        }
    }

    renderRelatedTasks() {
        if (!this.relatedTasksList) return;

        if (this.relatedTaskIds.length === 0) {
            this.relatedTasksList.innerHTML = `
                <div style="color: var(--text-muted); font-size: 0.85rem; padding: 8px 0;">
                    No linked tasks yet.
                </div>
            `;
            return;
        }

        const linkedTasks = this.relatedTaskIds
            .map(id => this.allBoardTasks.find(t => t.id === id))
            .filter(Boolean);

        this.relatedTasksList.innerHTML = linkedTasks.map(t => {
            const labelId = t.labels && t.labels.length > 0 ? t.labels[0] : null;
            const label = labelId ? this.allTaskLabels.find(l => l.id === labelId) : null;
            const color = label ? label.color : '#9ca3af';

            return `
                <div class="related-task-card" data-task-id="${t.id}">
                    <span class="related-task-dot" style="background: ${color};"></span>
                    <span class="related-task-title">${this.escapeHtml(t.title)}</span>
                    <button class="related-task-unlink" data-task-id="${t.id}" title="Unlink">
                        <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                    </button>
                </div>
            `;
        }).join('');

        this.relatedTasksList.querySelectorAll('.related-task-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.related-task-unlink')) return;
                this.openRelatedTask(card.getAttribute('data-task-id'));
            });
        });

        this.relatedTasksList.querySelectorAll('.related-task-unlink').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.unlinkTask(btn.getAttribute('data-task-id'));
            });
        });
    }

    renderTaskSearchResults(filterText) {
        const exclude = new Set(this.relatedTaskIds);
        let results = this.allBoardTasks.filter(t => !exclude.has(t.id));

        if (filterText) {
            results = results.filter(t => t.title.toLowerCase().includes(filterText));
        }

        if (results.length === 0) {
            this.relatedTasksSearchResults.innerHTML = `
                <div style="padding: 8px 12px; color: var(--text-muted); font-size: 0.85rem;">
                    No tasks found.
                </div>
            `;
            return;
        }

        this.relatedTasksSearchResults.innerHTML = results.slice(0, 10).map(t => {
            const labelId = t.labels && t.labels.length > 0 ? t.labels[0] : null;
            const label = labelId ? this.allTaskLabels.find(l => l.id === labelId) : null;
            const color = label ? label.color : '#9ca3af';

            return `
                <div class="related-search-item" data-task-id="${t.id}">
                    <span class="related-task-dot" style="background: ${color};"></span>
                    <span>${this.escapeHtml(t.title)}</span>
                </div>
            `;
        }).join('');

        this.relatedTasksSearchResults.querySelectorAll('.related-search-item').forEach(item => {
            item.addEventListener('click', () => {
                this.linkTask(item.getAttribute('data-task-id'));
            });
        });
    }

    async linkTask(targetTaskId) {
        if (this.relatedTaskIds.includes(targetTaskId)) return;

        // Add to current note
        this.relatedTaskIds.push(targetTaskId);

        // Add current note to target task's relatedNotes (bidirectional)
        const ws = window.__currentWorkspace;
        const targetTask = this.allBoardTasks.find(t => t.id === targetTaskId);
        if (targetTask && ws) {
            const targetRelated = targetTask.relatedNotes || [];
            if (!targetRelated.includes(this.currentNoteId)) {
                targetRelated.push(this.currentNoteId);
                try {
                    await taskService.update(ws.uid, ws.workspaceId, ws.boardId, targetTaskId, {
                        relatedNotes: targetRelated
                    });
                    targetTask.relatedNotes = targetRelated;
                } catch (err) {
                    console.error('Failed to update target task:', err);
                }
            }
        }

        // Save current note
        if (this.currentNoteId) {
            try {
                await noteService.update(this.uid, this.workspaceId, this.currentNoteId, {
                    relatedTasks: this.relatedTaskIds
                });
            } catch (err) {
                console.error('Failed to save related tasks:', err);
            }
        }

        this.relatedTasksSearch.style.display = 'none';
        this.renderRelatedTasks();
    }

    async unlinkTask(targetTaskId) {
        // Remove from current note
        this.relatedTaskIds = this.relatedTaskIds.filter(id => id !== targetTaskId);

        // Remove current note from target task (bidirectional)
        const ws = window.__currentWorkspace;
        const targetTask = this.allBoardTasks.find(t => t.id === targetTaskId);
        if (targetTask && ws) {
            const targetRelated = (targetTask.relatedNotes || []).filter(id => id !== this.currentNoteId);
            try {
                await taskService.update(ws.uid, ws.workspaceId, ws.boardId, targetTaskId, {
                    relatedNotes: targetRelated
                });
                targetTask.relatedNotes = targetRelated;
            } catch (err) {
                console.error('Failed to update target task:', err);
            }
        }

        // Save current note
        if (this.currentNoteId) {
            try {
                await noteService.update(this.uid, this.workspaceId, this.currentNoteId, {
                    relatedTasks: this.relatedTaskIds
                });
            } catch (err) {
                console.error('Failed to save related tasks:', err);
            }
        }

        this.renderRelatedTasks();
    }

    async openRelatedTask(taskId) {
        await this.save();
        if (window.currentTaskModal) {
            window.currentTaskModal.open(taskId);
        }
    }

    // --- Related Notes Logic ---

    renderRelatedNotes() {
        if (!this.relatedNotesList) return;

        if (this.relatedNoteIds.length === 0) {
            this.relatedNotesList.innerHTML = `
                <div style="color: var(--text-muted); font-size: 0.85rem; padding: 8px 0;">
                    No linked notes yet.
                </div>
            `;
            return;
        }

        const linkedNotes = this.relatedNoteIds
            .map(id => this.allWorkspaceNotes.find(n => n.id === id))
            .filter(Boolean);

        this.relatedNotesList.innerHTML = linkedNotes.map(n => {
            const labelId = n.labels && n.labels.length > 0 ? n.labels[0] : null;
            const label = labelId ? this.allNoteLabels.find(l => l.id === labelId) : null;
            const color = label ? label.color : '#9ca3af';

            return `
                <div class="related-task-card" data-note-id="${n.id}">
                    <span class="related-task-dot" style="background: ${color};"></span>
                    <span class="related-task-title">${this.escapeHtml(n.name)}</span>
                    <button class="related-task-unlink" data-note-id="${n.id}" title="Unlink">
                        <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                    </button>
                </div>
            `;
        }).join('');

        this.relatedNotesList.querySelectorAll('.related-task-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.related-task-unlink')) return;
                this.openRelatedNote(card.getAttribute('data-note-id'));
            });
        });

        this.relatedNotesList.querySelectorAll('.related-task-unlink').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.unlinkNote(btn.getAttribute('data-note-id'));
            });
        });
    }

    renderNoteSearchResults(filterText) {
        const exclude = new Set([this.currentNoteId, ...this.relatedNoteIds]);
        let results = this.allWorkspaceNotes.filter(n => !exclude.has(n.id));

        if (filterText) {
            results = results.filter(n => n.name.toLowerCase().includes(filterText));
        }

        if (results.length === 0) {
            this.relatedNotesSearchResults.innerHTML = `
                <div style="padding: 8px 12px; color: var(--text-muted); font-size: 0.85rem;">
                    No notes found.
                </div>
            `;
            return;
        }

        this.relatedNotesSearchResults.innerHTML = results.slice(0, 10).map(n => {
            const labelId = n.labels && n.labels.length > 0 ? n.labels[0] : null;
            const label = labelId ? this.allNoteLabels.find(l => l.id === labelId) : null;
            const color = label ? label.color : '#9ca3af';

            return `
                <div class="related-search-item" data-note-id="${n.id}">
                    <span class="related-task-dot" style="background: ${color};"></span>
                    <span>${this.escapeHtml(n.name)}</span>
                </div>
            `;
        }).join('');

        this.relatedNotesSearchResults.querySelectorAll('.related-search-item').forEach(item => {
            item.addEventListener('click', () => {
                this.linkNote(item.getAttribute('data-note-id'));
            });
        });
    }

    async linkNote(targetNoteId) {
        if (this.relatedNoteIds.includes(targetNoteId)) return;

        // Add to current note
        this.relatedNoteIds.push(targetNoteId);

        // Add current note to target note's relatedNotes (bidirectional)
        const targetNote = this.allWorkspaceNotes.find(n => n.id === targetNoteId);
        if (targetNote) {
            const targetRelated = targetNote.relatedNotes || [];
            if (!targetRelated.includes(this.currentNoteId)) {
                targetRelated.push(this.currentNoteId);
                try {
                    await noteService.update(this.uid, this.workspaceId, targetNoteId, {
                        relatedNotes: targetRelated
                    });
                    targetNote.relatedNotes = targetRelated;
                } catch (err) {
                    console.error('Failed to update target note:', err);
                }
            }
        }

        // Save current note
        if (this.currentNoteId) {
            try {
                await noteService.update(this.uid, this.workspaceId, this.currentNoteId, {
                    relatedNotes: this.relatedNoteIds
                });
            } catch (err) {
                console.error('Failed to save related notes:', err);
            }
        }

        this.relatedNotesSearch.style.display = 'none';
        this.renderRelatedNotes();
    }

    async unlinkNote(targetNoteId) {
        // Remove from current note
        this.relatedNoteIds = this.relatedNoteIds.filter(id => id !== targetNoteId);

        // Remove current note from target note (bidirectional)
        const targetNote = this.allWorkspaceNotes.find(n => n.id === targetNoteId);
        if (targetNote) {
            const targetRelated = (targetNote.relatedNotes || []).filter(id => id !== this.currentNoteId);
            try {
                await noteService.update(this.uid, this.workspaceId, targetNoteId, {
                    relatedNotes: targetRelated
                });
                targetNote.relatedNotes = targetRelated;
            } catch (err) {
                console.error('Failed to update target note:', err);
            }
        }

        // Save current note
        if (this.currentNoteId) {
            try {
                await noteService.update(this.uid, this.workspaceId, this.currentNoteId, {
                    relatedNotes: this.relatedNoteIds
                });
            } catch (err) {
                console.error('Failed to save related notes:', err);
            }
        }

        this.renderRelatedNotes();
    }

    async openRelatedNote(noteId) {
        await this.save();
        this.open(noteId);
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
        const display = document.getElementById('note-label-display');

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
