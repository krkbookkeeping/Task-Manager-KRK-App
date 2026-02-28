import { taskService } from './services/task-service.js';
import { labelService } from './services/label-service.js';
import { DATE_PUNCH_OFFSETS, calculateOffsetDate } from './utils/date-utils.js';

export class TaskModal {
    constructor(uid, workspaceId, boardId, calendar = null) {
        this.uid = uid;
        this.workspaceId = workspaceId;
        this.boardId = boardId;
        this.calendar = calendar;

        // Elements
        this.overlay = document.getElementById('task-modal-overlay');
        this.titleInput = document.getElementById('task-modal-title');
        this.dateInput = document.getElementById('task-modal-date');
        this.datePunchesContainer = document.getElementById('task-detail-date-punches');
        this.descInput = document.getElementById('task-modal-desc');
        this.btnDescBold = document.getElementById('btn-desc-bold');
        this.btnDescHighlight = document.getElementById('btn-desc-highlight');
        this.btnDescLink = document.getElementById('btn-desc-link');

        // Buttons
        this.btnSave = document.getElementById('btn-task-save');
        this.btnCancel = document.getElementById('btn-task-cancel');
        this.btnClose = document.getElementById('btn-task-close');
        this.btnDelete = document.getElementById('btn-task-delete');
        this.btnComplete = document.getElementById('btn-task-complete');
        this.btnPrint = document.getElementById('btn-task-print');
        this.createdInfo = document.getElementById('task-modal-created-info');

        // Label Multi-Select Elements
        this.labelTrigger = document.getElementById('task-label-trigger');
        this.labelDropdown = document.getElementById('task-label-dropdown');
        this.labelSearch = document.getElementById('task-label-search');
        this.labelOptions = document.getElementById('task-label-options');
        this.labelCreateSection = document.getElementById('task-label-create-section');
        this.btnCreateLabel = document.getElementById('btn-create-new-label-modal');
        this.newLabelText = document.getElementById('new-label-text');
        this.selectedLabelsContainer = document.getElementById('task-selected-labels');

        // State
        this.currentTaskId = null; // null if creating new
        this.allLabels = [];
        this.selectedLabelIds = new Set();
        this.unsubLabels = null;
        this.comments = []; // Array of comment objects
        this.editingCommentId = null; // Track if we're editing an existing comment
        this.starred = false; // Star state

        // Star Elements
        this.btnStar = document.getElementById('btn-task-star');
        this.starIcon = document.getElementById('task-star-icon');

        // Comment Elements
        this.commentEditor = document.getElementById('comment-editor');
        this.btnAddComment = document.getElementById('btn-add-comment');
        this.commentsList = document.getElementById('comments-list');
        this.btnCommentBold = document.getElementById('btn-comment-bold');
        this.btnCommentHighlight = document.getElementById('btn-comment-highlight');
        this.btnCommentLink = document.getElementById('btn-comment-link');

        // Lightbox
        this.lightbox = document.getElementById('image-lightbox');
        this.lightboxImage = document.getElementById('lightbox-image');
        this.lightboxClose = document.getElementById('lightbox-close');

        // Related Tasks Elements
        this.btnLinkTask = document.getElementById('btn-link-task');
        this.relatedSearch = document.getElementById('related-tasks-search');
        this.relatedSearchInput = document.getElementById('related-tasks-search-input');
        this.relatedSearchResults = document.getElementById('related-tasks-search-results');
        this.relatedTasksList = document.getElementById('related-tasks-list');
        this.relatedTaskIds = [];
        this.allBoardTasks = []; // cache of all tasks in the board

        this.bindEvents();
    }

    init() {
        // Subscribe to labels so the dropdown is always populated
        this.unsubLabels = labelService.subscribe(this.uid, this.workspaceId, (labels) => {
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
     * Used by workspace switcher since TaskModal has ~53 listeners bound in constructor.
     */
    switchContext(uid, workspaceId, boardId, calendar = null) {
        if (this.unsubLabels) this.unsubLabels();
        this.uid = uid;
        this.workspaceId = workspaceId;
        this.boardId = boardId;
        this.calendar = calendar;
        this.currentTaskId = null;
        this.allLabels = [];
        this.selectedLabels = [];
        this.init();
    }

    promptLink() {
        const url = prompt("Enter link URL:", "https://");
        if (url) {
            document.execCommand('createLink', false, url);
        }
    }

    toggleHighlight(editorElement) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;

        let node = sel.anchorNode;
        let isHighlighted = false;
        while (node && node !== editorElement) {
            if (node.nodeType === 1) {
                const bg = node.style?.backgroundColor || '';
                if (bg === 'rgb(254, 240, 138)' || bg === '#fef08a' || node.tagName === 'MARK') {
                    isHighlighted = true;
                    break;
                }
            }
            node = node.parentNode;
        }

        if (isHighlighted) {
            document.execCommand('hiliteColor', false, 'transparent');
        } else {
            document.execCommand('hiliteColor', false, '#fef08a');
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
                    img.style.cursor = 'pointer';
                    img.addEventListener('click', () => this.openLightbox(img.src));
                    editorElement.appendChild(img);
                };
                reader.readAsDataURL(file);
                break;
            }
        }
    }

    linkify(html) {
        if (!html) return '';
        const temp = document.createElement('div');
        temp.innerHTML = html;
        this.linkifyTextNodes(temp);
        return temp.innerHTML;
    }

    linkifyTextNodes(node) {
        if (node.nodeType === 3) {
            const text = node.nodeValue;
            const urlRegex = /(https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+)/gi;
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;

            let matched = false;
            let htmlStr = text;

            if (urlRegex.test(htmlStr)) {
                htmlStr = htmlStr.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
                matched = true;
            }
            if (!matched && emailRegex.test(htmlStr)) {
                htmlStr = htmlStr.replace(emailRegex, '<a href="mailto:$1" target="_blank">$1</a>');
                matched = true;
            }

            if (matched) {
                const temp = document.createElement('span');
                temp.innerHTML = htmlStr;
                while (temp.firstChild) {
                    node.parentNode.insertBefore(temp.firstChild, node);
                }
                node.parentNode.removeChild(node);
            }
        } else if (node.nodeType === 1 && node.tagName !== 'A' && node.tagName !== 'BUTTON') {
            const children = Array.from(node.childNodes);
            for (const child of children) {
                this.linkifyTextNodes(child);
            }
        }
    }

    bindEvents() {
        const handleLinkClick = (e) => {
            const anchor = e.target.closest('a');
            if (anchor && anchor.href) {
                // If the user is clicking on a link in an editable div, we should open it.
                if (e.button === 0) { // left click
                    e.preventDefault();
                    window.open(anchor.href, '_blank');
                }
            }
        };

        if (this.descInput) this.descInput.addEventListener('click', handleLinkClick);
        if (this.commentEditor) this.commentEditor.addEventListener('click', handleLinkClick);
        if (this.commentsList) this.commentsList.addEventListener('click', handleLinkClick);

        // Editor Context Menu
        let savedRange = null;
        let rightClickedLink = null;
        const ctxMenu = document.getElementById('editor-context-menu');
        const ctxLinkText = document.getElementById('ctx-link-text');
        const btnCtxRemoveLink = document.getElementById('btn-ctx-remove-link');

        document.addEventListener('contextmenu', (e) => {
            const editor = e.target.closest('#task-modal-desc, #comment-editor, .comment-inline-editor');
            if (editor) {
                const sel = window.getSelection();
                const selText = sel.toString().trim();
                const anchor = e.target.closest('a');

                if (selText.length > 0 || anchor) {
                    e.preventDefault();
                    if (sel.rangeCount > 0) {
                        savedRange = sel.getRangeAt(0);
                    }
                    rightClickedLink = anchor;

                    if (ctxMenu) {
                        ctxMenu.style.display = 'flex';
                        let left = e.pageX;
                        let top = e.pageY;
                        if (left + 160 > window.innerWidth) left = window.innerWidth - 165;
                        if (top + 150 > window.innerHeight) top = window.innerHeight - 155;
                        ctxMenu.style.left = left + 'px';
                        ctxMenu.style.top = top + 'px';

                        if (anchor) {
                            if (ctxLinkText) ctxLinkText.textContent = 'Edit link';
                            if (btnCtxRemoveLink) btnCtxRemoveLink.style.display = 'flex';
                        } else {
                            if (ctxLinkText) ctxLinkText.textContent = 'Insert link';
                            if (btnCtxRemoveLink) btnCtxRemoveLink.style.display = 'none';
                        }
                    }
                    return; // exit to avoid hiding it
                }
            }
            if (ctxMenu) ctxMenu.style.display = 'none';
            rightClickedLink = null;
        });

        document.addEventListener('click', (e) => {
            if (ctxMenu && !ctxMenu.contains(e.target)) {
                ctxMenu.style.display = 'none';
            }
        });

        const restoreSelection = () => {
            if (savedRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
            }
        };

        const btnCtxCut = document.getElementById('btn-ctx-cut');
        if (btnCtxCut) {
            btnCtxCut.addEventListener('click', () => {
                restoreSelection();
                document.execCommand('cut');
                if (ctxMenu) ctxMenu.style.display = 'none';
            });
        }

        const btnCtxCopy = document.getElementById('btn-ctx-copy');
        if (btnCtxCopy) {
            btnCtxCopy.addEventListener('click', () => {
                restoreSelection();
                document.execCommand('copy');
                if (ctxMenu) ctxMenu.style.display = 'none';
            });
        }

        const btnCtxLink = document.getElementById('btn-ctx-link');
        if (btnCtxLink) {
            btnCtxLink.addEventListener('click', () => {
                restoreSelection();
                if (rightClickedLink) {
                    const newText = prompt("Edit link text:", rightClickedLink.textContent);
                    if (newText !== null) {
                        const newUrl = prompt("Edit link URL:", rightClickedLink.href);
                        if (newUrl !== null) {
                            rightClickedLink.textContent = newText;
                            rightClickedLink.href = newUrl;
                        }
                    }
                } else {
                    this.promptLink();
                }
                if (ctxMenu) ctxMenu.style.display = 'none';
            });
        }

        if (btnCtxRemoveLink) {
            btnCtxRemoveLink.addEventListener('click', () => {
                restoreSelection();
                if (rightClickedLink) {
                    const textNode = document.createTextNode(rightClickedLink.textContent);
                    rightClickedLink.parentNode.replaceChild(textNode, rightClickedLink);
                }
                if (ctxMenu) ctxMenu.style.display = 'none';
            });
        }

        // Modal toggles
        this.btnCancel.addEventListener('click', () => this.close());
        this.btnClose.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        // Save, Print, Delete, Complete
        this.btnSave.addEventListener('click', () => this.saveTask());
        if (this.btnPrint) {
            this.btnPrint.addEventListener('click', () => this.printTask());
        }
        this.btnDelete.addEventListener('click', () => this.deleteTask());
        if (this.btnComplete) {
            this.btnComplete.addEventListener('click', async () => {
                if (this.currentTaskId) {
                    try {
                        this.btnComplete.disabled = true;
                        this.btnComplete.textContent = 'Completing...';
                        await taskService.update(this.uid, this.workspaceId, this.boardId, this.currentTaskId, {
                            completed: true,
                            completedAt: new Date().toISOString()
                        });
                        this.close();
                    } catch (err) {
                        console.error("Failed to complete task:", err);
                        this.btnComplete.disabled = false;
                        this.btnComplete.textContent = 'Complete';
                    }
                }
            });
        }

        // Star Toggle
        this.btnStar.addEventListener('click', () => {
            this.starred = !this.starred;
            this.updateStarIcon();
        });

        // External triggers (Top Bar & Sidebar buttons)
        const topbarBtn = document.getElementById('btn-topbar-create-task');
        if (topbarBtn) topbarBtn.addEventListener('click', () => this.open());

        const sidebarBtn = document.getElementById('btn-sidebar-create-task');
        if (sidebarBtn) sidebarBtn.addEventListener('click', () => this.open());

        // Custom Label Dropdown behavior
        this.labelTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleLabelDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!this.labelDropdown.contains(e.target) && !this.labelTrigger.contains(e.target)) {
                this.labelDropdown.style.display = 'none';
            }
        });

        this.labelSearch.addEventListener('input', () => this.filterLabelOptions());

        this.btnCreateLabel.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const name = this.labelSearch.value.trim();
            if (name) {
                try {
                    // Pick a random default color for inline created labels
                    const colors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
                    const randomColor = colors[Math.floor(Math.random() * colors.length)];
                    const newLabel = await labelService.create(this.uid, this.workspaceId, name, randomColor);

                    this.selectedLabelIds.add(newLabel.id);
                    this.labelSearch.value = '';
                    this.filterLabelOptions();
                    this.renderSelectedLabels();
                } catch (e) {
                    console.error("Failed to create inline label", e);
                }
            }
        });

        // Description Toolbar - Bold
        if (this.btnDescBold) {
            this.btnDescBold.addEventListener('mousedown', (e) => {
                e.preventDefault();
                document.execCommand('bold');
            });
        }

        // Description Toolbar - Highlight
        if (this.btnDescHighlight) {
            this.btnDescHighlight.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.toggleHighlight(this.descInput);
            });
        }

        // Description Toolbar - Link
        if (this.btnDescLink) {
            this.btnDescLink.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.promptLink();
            });
        }

        // Description Paste Image handler
        if (this.descInput) {
            this.descInput.addEventListener('paste', (e) => this.handleImagePaste(e, this.descInput));
        }

        // Comment Toolbar - Bold
        this.btnCommentBold.addEventListener('mousedown', (e) => {
            e.preventDefault(); // prevent losing selection focus
            document.execCommand('bold');
        });

        // Comment Toolbar - Highlight (toggle)
        this.btnCommentHighlight.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.toggleHighlight(this.commentEditor);
        });

        // Comment Toolbar - Link
        if (this.btnCommentLink) {
            this.btnCommentLink.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.promptLink();
            });
        }

        // Comment Paste Image handler
        this.commentEditor.addEventListener('paste', (e) => this.handleImagePaste(e, this.commentEditor));

        // Add Comment
        this.btnAddComment.addEventListener('click', () => this.addComment());

        // Lightbox close
        this.lightboxClose.addEventListener('click', () => this.closeLightbox());
        this.lightbox.addEventListener('click', (e) => {
            if (e.target === this.lightbox) this.closeLightbox();
        });

        // Related Tasks - Link button
        this.btnLinkTask.addEventListener('click', (e) => {
            e.stopPropagation();
            const visible = this.relatedSearch.style.display !== 'none';
            this.relatedSearch.style.display = visible ? 'none' : 'block';
            if (!visible) {
                this.relatedSearchInput.value = '';
                this.relatedSearchInput.focus();
                this.renderSearchResults('');
            }
        });

        // Related Tasks - Search input
        this.relatedSearchInput.addEventListener('input', () => {
            this.renderSearchResults(this.relatedSearchInput.value.trim().toLowerCase());
        });

        // Close search when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.relatedSearch.contains(e.target) && e.target !== this.btnLinkTask) {
                this.relatedSearch.style.display = 'none';
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Priority: close lightbox first, then save+close modal
                if (this.lightbox.style.display !== 'none') {
                    this.closeLightbox();
                } else if (this.overlay.classList.contains('active')) {
                    this.saveTask();
                }
            }
        });
    }

    async open(taskId = null, defaultLabelId = null) {
        this.currentTaskId = taskId;
        this.selectedLabelIds.clear();
        this.labelSearch.value = '';
        this.filterLabelOptions();

        if (taskId) {
            // Editing existing task
            this.btnDelete.style.display = 'flex';
            if (this.btnComplete) this.btnComplete.style.display = 'block';
            this.btnSave.textContent = 'Save Changes';
            await this.populateTaskData(taskId);
        } else {
            // Creating new task
            this.btnDelete.style.display = 'none';
            if (this.btnComplete) this.btnComplete.style.display = 'none';
            if (this.createdInfo) this.createdInfo.textContent = '';
            this.btnSave.textContent = 'Create Task';
            this.titleInput.value = '';
            this.descInput.innerHTML = '';
            // Auto-populate date from calendar's selected date
            if (this.calendar && this.calendar.selectedDate) {
                this.dateInput.value = this.calendar.selectedDate; // YYYY-MM-DD format
            } else {
                this.dateInput.value = '';
            }
            if (defaultLabelId) {
                this.selectedLabelIds.add(defaultLabelId);
            }
            this.starred = false;
        }

        this.updateStarIcon();
        this.renderDatePunches();

        this.renderSelectedLabels();
        this.overlay.classList.add('active');
        this.titleInput.focus();

        // Clear comment editor and render existing comments
        this.commentEditor.innerHTML = '';
        this.renderComments();

        // Load all board tasks for the related tasks search
        this.allBoardTasks = await this.loadAllBoardTasks();
        this.renderRelatedTasks();
        this.relatedSearch.style.display = 'none';
    }

    renderDatePunches() {
        if (!this.datePunchesContainer) return;

        this.datePunchesContainer.innerHTML = DATE_PUNCH_OFFSETS.map(offset => `
            <button type="button" class="btn-date-punch" data-offset="${offset}" title="Set to ${offset}">
                ${offset}
            </button>
        `).join('');

        const punchBtns = this.datePunchesContainer.querySelectorAll('.btn-date-punch');
        punchBtns.forEach(btn => {
            const offset = btn.getAttribute('data-offset');
            const targetDate = calculateOffsetDate(offset);

            if (this.dateInput.value === targetDate) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', async () => {
                this.dateInput.value = targetDate;
                punchBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (this.currentTaskId) {
                    // Editing existing task: save immediately and close
                    punchBtns.forEach(b => b.disabled = true);
                    btn.classList.add('saving');

                    try {
                        await taskService.update(this.uid, this.workspaceId, this.boardId, this.currentTaskId, { dueDate: targetDate });
                        this.close();
                    } catch (err) {
                        console.error('Failed to save date punch', err);
                        punchBtns.forEach(b => b.disabled = false);
                        btn.classList.remove('saving');
                    }
                }
            });
        });
    }

    close() {
        this.overlay.classList.remove('active');
        this.currentTaskId = null;
        this.labelDropdown.style.display = 'none';
    }

    async populateTaskData(taskId) {
        try {
            const task = await taskService.getTask(this.uid, this.workspaceId, this.boardId, taskId);
            if (task) {
                this.titleInput.value = task.title || '';
                // The description is now RTF (HTML), but let's auto-link plain URLs first
                this.descInput.innerHTML = this.linkify(task.description || '');
                // Attach lightbox listeners to image tags in description if any
                this.descInput.querySelectorAll('img').forEach(img => {
                    img.style.cursor = 'pointer';
                    img.addEventListener('click', () => this.openLightbox(img.src));
                });
                if (task.dueDate) {
                    // Convert ISO format to YYYY-MM-DD for input[type=date]
                    this.dateInput.value = task.dueDate.split('T')[0];
                } else {
                    this.dateInput.value = '';
                }

                if (task.labels && Array.isArray(task.labels)) {
                    task.labels.forEach(id => this.selectedLabelIds.add(id));
                }

                // Format Created At date: 2026-02-24 08:02pm
                if (this.createdInfo) {
                    if (task.createdAt) {
                        try {
                            const d = typeof task.createdAt.toDate === 'function' ? task.createdAt.toDate() : new Date(task.createdAt);
                            const yr = d.getFullYear();
                            const mo = String(d.getMonth() + 1).padStart(2, '0');
                            const da = String(d.getDate()).padStart(2, '0');

                            let hours = d.getHours();
                            const mins = String(d.getMinutes()).padStart(2, '0');
                            const ampm = hours >= 12 ? 'pm' : 'am';
                            hours = hours % 12;
                            hours = hours ? hours : 12;
                            const hrStr = String(hours).padStart(2, '0');

                            this.createdInfo.textContent = `Created ${yr}-${mo}-${da} ${hrStr}:${mins}${ampm}`;
                        } catch (e) {
                            this.createdInfo.textContent = '';
                        }
                    } else {
                        this.createdInfo.textContent = '';
                    }
                }

                // Load comments
                this.comments = task.comments || [];

                // Load related tasks
                this.relatedTaskIds = task.relatedTasks || [];

                // Load starred state
                this.starred = task.starred === true;
            }
        } catch (err) {
            console.error("Failed to load task data:", err);
            alert("Could not load task data.");
            this.close();
        }
    }

    async saveTask() {
        const title = this.titleInput.value.trim();
        if (!title) {
            alert('A task title is required.');
            this.titleInput.focus();
            return;
        }

        this.btnSave.disabled = true;
        this.btnSave.textContent = 'Saving...';

        try {
            const data = {
                title: title,
                description: this.descInput.innerHTML.trim(),
                dueDate: this.dateInput.value ? new Date(this.dateInput.value).toISOString() : null,
                labels: Array.from(this.selectedLabelIds),
                comments: this.comments,
                relatedTasks: this.relatedTaskIds,
                starred: this.starred
            };

            if (this.currentTaskId) {
                await taskService.update(this.uid, this.workspaceId, this.boardId, this.currentTaskId, data);
            } else {
                // Determine a primary label id if one exists, just for default ordering logic
                const primaryLabelId = data.labels.length > 0 ? data.labels[0] : null;
                const newTask = await taskService.create(this.uid, this.workspaceId, this.boardId, title, primaryLabelId);
                // Set the rest of the fields that the create function doesn't take directly in its signature
                await taskService.update(this.uid, this.workspaceId, this.boardId, newTask.id, {
                    description: data.description,
                    dueDate: data.dueDate,
                    labels: data.labels
                });
            }

            this.btnSave.disabled = false;
            this.close();
        } catch (err) {
            console.error('Failed to save task:', err);
            alert('Failed to save task.');
            this.btnSave.disabled = false;
            this.btnSave.textContent = this.currentTaskId ? 'Save Changes' : 'Create Task';
        }
    }

    async deleteTask() {
        if (!this.currentTaskId) return;

        try {
            await taskService.archive(this.uid, this.workspaceId, this.boardId, this.currentTaskId);
            this.close();
        } catch (err) {
            console.error("Failed to delete task:", err);
            alert("Failed to delete task.");
        }
    }

    printTask() {
        if (!this.currentTaskId) {
            alert("Please save the task before printing.");
            return;
        }

        const title = this.titleInput.value || 'Untitled Task';
        const descHtml = this.descInput.innerHTML || '<p>No description provided.</p>';
        const createdDate = this.createdInfo.textContent ? `<div class="meta-item"><strong>Created:</strong> ${this.createdInfo.textContent.replace('Created ', '')}</div>` : '';
        const dueDateVal = this.dateInput.value;
        const dueDateString = dueDateVal ? `<div class="meta-item"><strong>Due Date:</strong> ${dueDateVal}</div>` : '';

        // Gather labels
        const labelBadges = Array.from(this.selectedLabelsContainer.querySelectorAll('.badge'))
            .map(badge => `<span class="badge" style="background: ${badge.style.backgroundColor}; color: ${badge.style.color};">${badge.textContent}</span>`)
            .join(' ');
        const labelsHtml = labelBadges ? `<div class="meta-item"><strong>Labels:</strong><br>${labelBadges}</div>` : '';

        // Gather comments
        const sortedComments = [...this.comments].reverse();
        let commentsHtml = '<div style="margin-top: 2rem;"><h3>Comments</h3>';
        if (sortedComments.length === 0) {
            commentsHtml += '<p>No comments.</p>';
        } else {
            sortedComments.forEach(c => {
                commentsHtml += `
                <div class="print-comment">
                    <div class="print-comment-meta">${this.formatCommentDate(c.createdAt)}</div>
                    <div class="print-comment-body">${this.linkify(c.content)}</div>
                </div>`;
            });
        }
        commentsHtml += '</div>';

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            alert("Please allow pop-ups to print tasks.");
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Print Task - ${title}</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        line-height: 1.6;
                        color: #000;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 2rem;
                    }
                    h1 { margin-top: 0; border-bottom: 2px solid #eee; padding-bottom: 1rem; }
                    .meta-block {
                        display: flex;
                        gap: 2rem;
                        background: #f9f9f9;
                        padding: 1rem;
                        border-radius: 8px;
                        margin-bottom: 2rem;
                        flex-wrap: wrap;
                    }
                    .meta-item {
                        min-width: 150px;
                    }
                    .badge {
                        display: inline-block;
                        padding: 0.2rem 0.6rem;
                        border-radius: 999px;
                        font-size: 0.8rem;
                        font-weight: 500;
                        margin-right: 4px;
                        margin-top: 4px;
                    }
                    .description {
                        margin-bottom: 2rem;
                        word-break: break-word;
                    }
                    .description img, .print-comment-body img {
                        max-width: 100%;
                        height: auto;
                        border-radius: 4px;
                        margin: 10px 0;
                    }
                    .print-comment {
                        border-left: 3px solid #ccc;
                        padding-left: 1rem;
                        margin-bottom: 1.5rem;
                    }
                    .print-comment-meta {
                        font-size: 0.85rem;
                        color: #666;
                        margin-bottom: 0.5rem;
                    }
                    .print-comment-body {
                        word-break: break-word;
                    }
                    a { color: #2563eb; text-decoration: underline; }
                    @media print {
                        body { padding: 0; }
                        .meta-block { background: transparent; border: 1px solid #ccc; }
                    }
                </style>
            </head>
            <body>
                <h1>${title}</h1>
                <div class="meta-block">
                    ${createdDate}
                    ${dueDateString}
                    ${labelsHtml}
                </div>
                <h3>Description</h3>
                <div class="description">${descHtml}</div>
                ${commentsHtml}
                <script>
                    window.onload = function() {
                        setTimeout(() => {
                            window.print();
                            window.close();
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    // --- Comments Logic ---

    async addComment() {
        const content = this.commentEditor.innerHTML.trim();
        if (!content || content === '<br>') return;

        if (this.editingCommentId) {
            // Update existing comment
            const idx = this.comments.findIndex(c => c.id === this.editingCommentId);
            if (idx !== -1) {
                this.comments[idx].content = content;
            }
            this.editingCommentId = null;
            this.btnAddComment.textContent = 'Add Comment';
        } else {
            // Create new comment
            const comment = {
                id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
                content: content,
                createdAt: new Date().toISOString()
            };
            this.comments.push(comment);
        }

        this.commentEditor.innerHTML = '';
        this.renderComments();

        // Save immediately if editing an existing task
        if (this.currentTaskId) {
            try {
                await taskService.update(this.uid, this.workspaceId, this.boardId, this.currentTaskId, {
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
            <div class="comment-entry" data-comment-id="${c.id}">
                <div class="comment-timestamp">
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
                <div class="comment-content">${this.linkify(c.content)}</div>
            </div>
        `).join('');

        // Attach lightbox click handlers to all images inside comments
        this.commentsList.querySelectorAll('.comment-content img').forEach(img => {
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => this.openLightbox(img.src));
        });

        // Attach edit/delete handlers
        this.commentsList.querySelectorAll('.comment-action-btn[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => this.editComment(btn.getAttribute('data-comment-id')));
        });
        this.commentsList.querySelectorAll('.comment-action-btn[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => this.deleteComment(btn.getAttribute('data-comment-id')));
        });
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

    openLightbox(src) {
        this.lightboxImage.src = src;
        this.lightbox.style.display = 'flex';
    }

    closeLightbox() {
        this.lightbox.style.display = 'none';
        this.lightboxImage.src = '';
    }

    updateStarIcon() {
        if (!this.starIcon) return;
        if (this.starred) {
            this.starIcon.style.color = '#f59e0b';
            this.starIcon.style.fontVariationSettings = "'FILL' 1";
        } else {
            this.starIcon.style.color = 'var(--text-muted)';
            this.starIcon.style.fontVariationSettings = '';
        }
    }

    editComment(commentId) {
        const comment = this.comments.find(c => c.id === commentId);
        if (!comment) return;

        // Find the comment entry in the DOM
        const entry = this.commentsList.querySelector(`.comment-entry[data-comment-id="${commentId}"]`);
        if (!entry) return;

        const contentDiv = entry.querySelector('.comment-content');
        const actionsSpan = entry.querySelector('.comment-actions');

        // Hide the action buttons while editing
        if (actionsSpan) actionsSpan.style.display = 'none';

        // Replace the static content with an inline editor
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

        // Inline Bold
        contentDiv.querySelector('.inline-bold-btn').addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.execCommand('bold');
        });

        // Inline Highlight (toggle)
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
            if (this.currentTaskId) {
                try {
                    await taskService.update(this.uid, this.workspaceId, this.boardId, this.currentTaskId, {
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

        // Clear editing state if we were editing the deleted comment
        if (this.editingCommentId === commentId) {
            this.editingCommentId = null;
            this.commentEditor.innerHTML = '';
            this.btnAddComment.textContent = 'Add Comment';
        }

        // Persist
        if (this.currentTaskId) {
            try {
                await taskService.update(this.uid, this.workspaceId, this.boardId, this.currentTaskId, {
                    comments: this.comments
                });
            } catch (err) {
                console.error('Failed to delete comment:', err);
            }
        }
    }

    // --- Related Tasks Logic ---

    async loadAllBoardTasks() {
        try {
            const snapshot = await taskService.getAllTasks(this.uid, this.workspaceId, this.boardId);
            return snapshot || [];
        } catch (err) {
            console.error('Failed to load board tasks:', err);
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
            // Find the label color for the task
            const labelId = t.labels && t.labels.length > 0 ? t.labels[0] : null;
            const label = labelId ? this.allLabels.find(l => l.id === labelId) : null;
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

        // Click to open linked task
        this.relatedTasksList.querySelectorAll('.related-task-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.related-task-unlink')) return; // don't open if clicking unlink
                this.openRelatedTask(card.getAttribute('data-task-id'));
            });
        });

        // Unlink button
        this.relatedTasksList.querySelectorAll('.related-task-unlink').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.unlinkTask(btn.getAttribute('data-task-id'));
            });
        });
    }

    renderSearchResults(filterText) {
        // Show all board tasks except self and already linked
        const exclude = new Set([this.currentTaskId, ...this.relatedTaskIds]);
        let results = this.allBoardTasks.filter(t => !exclude.has(t.id));

        if (filterText) {
            results = results.filter(t => t.title.toLowerCase().includes(filterText));
        }

        if (results.length === 0) {
            this.relatedSearchResults.innerHTML = `
                <div style="padding: 8px 12px; color: var(--text-muted); font-size: 0.85rem;">
                    No tasks found.
                </div>
            `;
            return;
        }

        this.relatedSearchResults.innerHTML = results.slice(0, 10).map(t => {
            const labelId = t.labels && t.labels.length > 0 ? t.labels[0] : null;
            const label = labelId ? this.allLabels.find(l => l.id === labelId) : null;
            const color = label ? label.color : '#9ca3af';

            return `
                <div class="related-search-item" data-task-id="${t.id}">
                    <span class="related-task-dot" style="background: ${color};"></span>
                    <span>${this.escapeHtml(t.title)}</span>
                </div>
            `;
        }).join('');

        this.relatedSearchResults.querySelectorAll('.related-search-item').forEach(item => {
            item.addEventListener('click', () => {
                this.linkTask(item.getAttribute('data-task-id'));
            });
        });
    }

    async linkTask(targetTaskId) {
        if (this.relatedTaskIds.includes(targetTaskId)) return;

        // Add to current task
        this.relatedTaskIds.push(targetTaskId);

        // Add current task to target task (bidirectional)
        const targetTask = this.allBoardTasks.find(t => t.id === targetTaskId);
        if (targetTask) {
            const targetRelated = targetTask.relatedTasks || [];
            if (!targetRelated.includes(this.currentTaskId)) {
                targetRelated.push(this.currentTaskId);
                try {
                    await taskService.update(this.uid, this.workspaceId, this.boardId, targetTaskId, {
                        relatedTasks: targetRelated
                    });
                    // Update cache
                    targetTask.relatedTasks = targetRelated;
                } catch (err) {
                    console.error('Failed to update target task:', err);
                }
            }
        }

        // Save current task
        if (this.currentTaskId) {
            try {
                await taskService.update(this.uid, this.workspaceId, this.boardId, this.currentTaskId, {
                    relatedTasks: this.relatedTaskIds
                });
            } catch (err) {
                console.error('Failed to save related tasks:', err);
            }
        }

        this.relatedSearch.style.display = 'none';
        this.renderRelatedTasks();
    }

    async unlinkTask(targetTaskId) {
        // Remove from current task
        this.relatedTaskIds = this.relatedTaskIds.filter(id => id !== targetTaskId);

        // Remove current task from target task (bidirectional)
        const targetTask = this.allBoardTasks.find(t => t.id === targetTaskId);
        if (targetTask) {
            const targetRelated = (targetTask.relatedTasks || []).filter(id => id !== this.currentTaskId);
            try {
                await taskService.update(this.uid, this.workspaceId, this.boardId, targetTaskId, {
                    relatedTasks: targetRelated
                });
                targetTask.relatedTasks = targetRelated;
            } catch (err) {
                console.error('Failed to update target task:', err);
            }
        }

        // Save current task
        if (this.currentTaskId) {
            try {
                await taskService.update(this.uid, this.workspaceId, this.boardId, this.currentTaskId, {
                    relatedTasks: this.relatedTaskIds
                });
            } catch (err) {
                console.error('Failed to save related tasks:', err);
            }
        }

        this.renderRelatedTasks();
    }

    async openRelatedTask(taskId) {
        // Save current task first, then open the linked one
        await this.saveTask();
        this.open(taskId);
    }

    // --- Label Dropdown Logic ---

    toggleLabelDropdown() {
        const isVisible = this.labelDropdown.style.display === 'flex';
        this.labelDropdown.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            this.labelSearch.focus();
            this.filterLabelOptions();
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

        // Toggle Create UI
        if (searchTerm && !matchFound) {
            this.labelCreateSection.style.display = 'block';
            this.newLabelText.textContent = searchTerm;
        } else {
            this.labelCreateSection.style.display = 'none';
        }
    }

    filterLabelOptions() {
        this.renderLabelOptions();
    }

    renderSelectedLabels() {
        this.selectedLabelsContainer.innerHTML = '';
        if (this.selectedLabelIds.size === 0) {
            document.getElementById('task-label-display').textContent = 'Select labels...';
            document.getElementById('task-label-display').style.color = 'var(--text-muted)';
            return;
        }

        document.getElementById('task-label-display').textContent = `${this.selectedLabelIds.size} selected`;
        document.getElementById('task-label-display').style.color = 'var(--text-main)';

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

        // Add removed listener to tags
        const removeBtns = this.selectedLabelsContainer.querySelectorAll('.label-tag-remove');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idToRemove = btn.getAttribute('data-id');
                this.selectedLabelIds.delete(idToRemove);
                this.renderSelectedLabels();
                this.renderLabelOptions(); // Update checkmarks
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
