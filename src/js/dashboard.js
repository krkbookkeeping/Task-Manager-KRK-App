import { labelService } from './services/label-service.js';
import { taskService } from './services/task-service.js';
import { DATE_PUNCH_OFFSETS, calculateOffsetDate } from './utils/date-utils.js';

export class Dashboard {
    constructor(uid, workspaceId, boardId, calendarInstance = null) {
        this.uid = uid;
        this.workspaceId = workspaceId;
        this.boardId = boardId;
        this.calendar = calendarInstance;

        this.labels = [];
        this.tasks = [];
        this.currentFilterDate = null; // Stored as YYYY-MM-DD
        this.currentFilterDateEnd = null; // End of range filter
        this.starFilter = false; // Only show starred tasks
        this.searchQuery = ''; // Global search query
        this.currentView = 'active'; // 'active' or 'completed' or 'archived'
        this.completedTasks = []; // Cache for completed view
        this.archivedTasks = []; // Cache for archived view

        try {
            const savedSortMode = localStorage.getItem(`bucketSortMode_${this.boardId}`);
            this.bucketSortMode = savedSortMode ? JSON.parse(savedSortMode) : {}; // Per-label sort mode: 'manual' (default), 'name', 'date'
        } catch (e) {
            this.bucketSortMode = {};
        }

        this.unsubLabels = null;
        this.unsubTasks = null;

        this.gridEl = document.querySelector('.bucket-grid');

        // AbortController for cleaning up event listeners on destroy
        this._abortController = null;
    }

    init() {
        if (!this.gridEl) return;

        // Subscribe to Labels
        this.unsubLabels = labelService.subscribe(this.uid, this.workspaceId, (labels) => {
            this.labels = labels;
            this.render();
        });

        // Subscribe to Tasks
        this.unsubTasks = taskService.subscribeActive(this.uid, this.workspaceId, this.boardId, (tasks) => {
            this.tasks = tasks;

            // Feed dates back to calendar
            if (this.calendar) {
                const dates = tasks.map(t => t.dueDate ? t.dueDate.split('T')[0] : null).filter(Boolean);
                this.calendar.setTaskDates(dates);
            }

            this.render();
        });

        // Listen for Calendar Filter Events
        document.addEventListener('filterTasksByDate', (e) => {
            if (e.detail.rangeStart && e.detail.rangeEnd) {
                // Range mode
                this.currentFilterDate = e.detail.rangeStart;
                this.currentFilterDateEnd = e.detail.rangeEnd;
            } else {
                // Single date mode
                this.currentFilterDate = e.detail.date;
                this.currentFilterDateEnd = null;
            }
            this.render();
        });

        // Abort any previous event listeners (in case of re-init)
        if (this._abortController) this._abortController.abort();
        this._abortController = new AbortController();

        this.setupEventListeners();
    }

    destroy() {
        if (this.unsubLabels) this.unsubLabels();
        if (this.unsubTasks) this.unsubTasks();
        if (this.unsubCompletedTasks) this.unsubCompletedTasks();
        if (this.unsubArchivedTasks) this.unsubArchivedTasks();
        // Clean up all event listeners
        if (this._abortController) this._abortController.abort();
    }

    render() {
        if (!this.gridEl) return;
        this.gridEl.innerHTML = '';

        const visibleLabels = this.labels.filter(label => !label.isParked);
        const parkedLabels = this.labels.filter(label => label.isParked)
            .sort((a, b) => {
                if (a.name === 'No Label') return 1;
                if (b.name === 'No Label') return -1;
                return a.name.localeCompare(b.name);
            });

        // Update Parked Labels header UI
        this.renderParkedLabels(parkedLabels);

        // Empty state: no labels at all — show CTA
        if (visibleLabels.length === 0 && parkedLabels.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 60px 20px; text-align: center; width: 100%;';
            emptyState.innerHTML = `
                <span class="material-symbols-outlined" style="font-size: 48px; color: var(--text-muted); opacity: 0.5;">label</span>
                <div style="font-size: 1rem; font-weight: 600; color: var(--text-secondary);">No labels yet</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); max-width: 280px;">Labels act as columns for your tasks. Create your first one to get started.</div>
                <button class="btn btn-primary" id="btn-empty-create-label" style="padding: 10px 24px; display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
                    Create Your First Label
                </button>
            `;
            this.gridEl.appendChild(emptyState);

            // Wire up the CTA button to trigger the existing add-label popover
            const ctaBtn = document.getElementById('btn-empty-create-label');
            if (ctaBtn) {
                ctaBtn.addEventListener('click', () => {
                    const btnShowAddTop = document.getElementById('btn-show-add-label-top');
                    if (btnShowAddTop) btnShowAddTop.click();
                });
            }
            return;
        }

        // Render each label as a bucket
        visibleLabels.forEach((label) => {
            let bucketTasks = this.tasks.filter(t => t.labels && t.labels.includes(label.id));

            // Apply Date Filter if active
            if (this.currentFilterDate) {
                bucketTasks = bucketTasks.filter(t => {
                    if (!t.dueDate) return false;
                    const taskDate = t.dueDate.split('T')[0];
                    if (this.currentFilterDateEnd) {
                        // Range filter
                        return taskDate >= this.currentFilterDate && taskDate <= this.currentFilterDateEnd;
                    }
                    return taskDate === this.currentFilterDate;
                });
            }

            // Apply Star Filter if active
            if (this.starFilter) {
                bucketTasks = bucketTasks.filter(t => t.starred === true);
            }

            // Apply Search Query if active
            if (this.searchQuery) {
                bucketTasks = bucketTasks.filter(t => this.filterTaskByQuery(t, this.searchQuery));
            }

            // Sort tasks based on per-bucket sort mode
            const sortMode = this.bucketSortMode[label.id] || 'manual';
            if (sortMode === 'name') {
                bucketTasks.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            } else if (sortMode === 'date') {
                bucketTasks.sort((a, b) => {
                    if (!a.dueDate && !b.dueDate) return 0;
                    if (!a.dueDate) return 1;
                    if (!b.dueDate) return -1;
                    return a.dueDate.localeCompare(b.dueDate);
                });
            } else {
                // Manual / default: sort by order field
                bucketTasks.sort((a, b) => {
                    const orderA = a.order?.[label.id] || 0;
                    const orderB = b.order?.[label.id] || 0;
                    return orderA - orderB;
                });
            }

            const bucketEl = document.createElement('div');
            // Adding dynamic border color directly to the style
            bucketEl.className = `bucket animate-slide-up ${bucketTasks.length === 0 ? 'bucket-empty' : ''}`;
            bucketEl.style.borderTop = `4px solid ${label.color}`;
            bucketEl.draggable = true;
            bucketEl.setAttribute('data-label-id', label.id);
            // ... rest of header, etc ...

            // Header
            const isSystemLabel = label.isSystem === true;
            const headerHtml = `
                <div class="bucket-header">
                    <h4>
                        <span class="label-dot" style="background-color: ${label.color};"></span>
                        <span class="label-name-text">${this.escapeHtml(label.name)}</span>
                    </h4>
                    <div class="bucket-header-actions">
                        <button class="btn-icon btn-sm btn-park-bucket" data-label-id="${label.id}" data-tooltip="Park / Hide Label">
                            <span class="material-symbols-outlined" style="font-size: 16px;">visibility_off</span>
                        </button>
                        <span class="task-count">${bucketTasks.length}</span>
                        <button class="btn-icon btn-sm btn-sort-bucket ${sortMode === 'name' ? 'sort-active' : ''}" data-label-id="${label.id}" data-sort="name" data-tooltip="Sort by Name">
                            <span class="material-symbols-outlined" style="font-size: 16px;">sort_by_alpha</span>
                        </button>
                        <button class="btn-icon btn-sm btn-sort-bucket ${sortMode === 'date' ? 'sort-active' : ''}" data-label-id="${label.id}" data-sort="date" data-tooltip="Sort by Date">
                            <span class="material-symbols-outlined" style="font-size: 16px;">calendar_month</span>
                        </button>
                        <div class="label-menu-wrapper" style="position: relative;">
                            <button class="btn-icon btn-sm btn-label-menu" data-label-id="${label.id}" data-tooltip="More options">
                                <span class="material-symbols-outlined">more_horiz</span>
                            </button>
                            <div class="label-options-menu" data-menu-for="${label.id}" style="display: none;">
                                <button class="label-menu-item" data-action="rename" data-label-id="${label.id}">
                                    <span class="material-symbols-outlined">edit</span>
                                    Rename
                                </button>
                                <button class="label-menu-item" data-action="color" data-label-id="${label.id}">
                                    <span class="material-symbols-outlined">palette</span>
                                    Change Color
                                    <input type="color" class="label-color-input" value="${label.color}" data-label-id="${label.id}" style="position:absolute; opacity:0; width:0; height:0; pointer-events:none;" />
                                </button>
                                ${isSystemLabel ? '' : `
                                <div class="label-menu-divider"></div>
                                <button class="label-menu-item label-menu-item-danger" data-action="delete" data-label-id="${label.id}">
                                    <span class="material-symbols-outlined">delete</span>
                                    Delete Label
                                </button>
                                `}
                        </div>
                    </div>
                </div>
            </div>
            `;

            // Cards container (Always render this so empty buckets have a drop zone)
            let cardsHtml = '<div class="bucket-cards" data-label-id="' + label.id + '">';
            bucketTasks.forEach(task => {
                const dueDateStr = task.dueDate ? this.formatDate(task.dueDate) : 'No date';
                const isStarred = task.starred === true;
                cardsHtml += `
                    <div class="task-card ${isStarred ? 'task-starred' : ''}" data-task-id="${task.id}" draggable="true">
                        <div class="task-card-title-row">
                            <div class="task-card-title">${this.escapeHtml(task.title)}</div>
                            <button class="btn-icon btn-star-card ${isStarred ? 'starred' : ''}" data-task-id="${task.id}" data-tooltip="${isStarred ? 'Unstar' : 'Star'}" style="padding: 0;">
                                <span class="material-symbols-outlined" style="font-size: 18px;">star</span>
                            </button>
                        </div>
                        <div class="task-card-meta">
                            ${task.dueDate ? `
                            <div class="task-card-date-badge">
                                <span class="material-symbols-outlined task-meta-icon">calendar_today</span>
                                <span>${dueDateStr}</span>
                            </div>
                            ` : `
                            <div style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted);">
                                <span class="material-symbols-outlined task-meta-icon">calendar_today</span>
                                <span>${dueDateStr}</span>
                            </div>
                            `}
                            <div class="date-punches dashboard-punches" style="margin-left: 8px;">
                                ${DATE_PUNCH_OFFSETS.filter(offset => offset !== '0').map(offset => `
                                    <button class="btn-date-punch dashboard-punch" data-task-id="${task.id}" data-offset="${offset}" title="Add ${offset}">
                                        ${offset}
                                    </button>
                                `).join('')}
                            </div>
                            <button class="btn-icon btn-sm btn-complete-task" data-task-id="${task.id}" data-tooltip="Complete Task" style="margin-left: auto; padding: 2px;">
                                <span class="material-symbols-outlined" style="font-size: 16px;">check_circle</span>
                            </button>
                        </div>
                    </div>
                `;
            });
            cardsHtml += '</div>';

            // Quick Add Task inline
            const quickAddHtml = `
                <div class="quick-add-task" style="padding: 10px; display: flex; gap: 8px;">
                    <input type="text" class="form-input form-input-sm quick-add-input" data-label-id="${label.id}" placeholder="Type task & press Enter..." />
                </div>
            `;

            bucketEl.innerHTML = headerHtml + cardsHtml + quickAddHtml;
            this.gridEl.appendChild(bucketEl);
        });

        this.bindEventsAfterRender();
    }

    bindEventsAfterRender() {
        // Quick Add Task (Enter key)
        const inputs = this.gridEl.querySelectorAll('.quick-add-input');
        inputs.forEach(input => {
            input.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter' && input.value.trim() !== '') {
                    const title = input.value.trim();
                    const labelId = input.getAttribute('data-label-id');
                    input.value = ''; // clear immediately
                    input.disabled = true;
                    try {
                        const newTask = await taskService.create(this.uid, this.workspaceId, this.boardId, title, labelId);
                        // Auto-set due date from calendar's selected date
                        if (this.calendar && this.calendar.selectedDate && newTask && newTask.id) {
                            const dueDate = new Date(this.calendar.selectedDate + 'T12:00:00').toISOString();
                            await taskService.update(this.uid, this.workspaceId, this.boardId, newTask.id, { dueDate });
                        }
                    } catch (err) {
                        console.error('Failed to create task:', err);
                        alert('Could not create task. Check console.');
                    } finally {
                        input.disabled = false;
                        input.focus();
                    }
                }
            });
        });

        // Complete Task
        const completeBtns = this.gridEl.querySelectorAll('.btn-complete-task');
        completeBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const taskId = btn.getAttribute('data-task-id');
                try {
                    await taskService.update(this.uid, this.workspaceId, this.boardId, taskId, {
                        completed: true,
                        completedAt: new Date().toISOString() // Or serverTimestamp if importing it
                    });
                } catch (err) {
                    console.error(err);
                }
            });
        });

        // Star Toggle on Task Cards
        const starBtns = this.gridEl.querySelectorAll('.btn-star-card');
        starBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const taskId = btn.getAttribute('data-task-id');
                const task = this.tasks.find(t => t.id === taskId);
                if (!task) return;
                const newStarred = !task.starred;
                try {
                    await taskService.update(this.uid, this.workspaceId, this.boardId, taskId, {
                        starred: newStarred
                    });
                } catch (err) {
                    console.error('Failed to toggle star:', err);
                }
            });
        });

        // Open Task Modal on Card Click
        const taskCards = this.gridEl.querySelectorAll('.task-card');
        taskCards.forEach(card => {
            card.addEventListener('click', () => {
                const taskId = card.getAttribute('data-task-id');
                if (window.currentTaskModal) {
                    window.currentTaskModal.open(taskId);
                }
            });
        });

        // ── Label Options Menu ──
        // Toggle dropdown
        const menuBtns = this.gridEl.querySelectorAll('.btn-label-menu');
        menuBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                // Close all other menus first
                this.gridEl.querySelectorAll('.label-options-menu').forEach(m => {
                    if (m.getAttribute('data-menu-for') !== labelId) m.style.display = 'none';
                });
                const menu = this.gridEl.querySelector(`.label-options-menu[data-menu-for="${labelId}"]`);
                menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
            });
        });

        // Close menus when clicking anywhere outside
        const closeMenusHandler = () => {
            this.gridEl.querySelectorAll('.label-options-menu').forEach(m => m.style.display = 'none');
        };
        document.addEventListener('click', closeMenusHandler, { once: true });

        // Rename action
        this.gridEl.querySelectorAll('.label-menu-item[data-action="rename"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                const bucket = this.gridEl.querySelector(`.bucket[data-label-id="${labelId}"]`);
                const nameSpan = bucket.querySelector('.label-name-text');
                const menu = this.gridEl.querySelector(`.label-options-menu[data-menu-for="${labelId}"]`);
                menu.style.display = 'none';

                // Replace name text with an input
                const currentName = nameSpan.textContent;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = currentName;
                input.className = 'label-rename-input';
                nameSpan.replaceWith(input);
                input.focus();
                input.select();

                const saveRename = async () => {
                    const newName = input.value.trim();
                    if (newName && newName !== currentName) {
                        try {
                            await labelService.update(this.uid, this.workspaceId, labelId, { name: newName });
                        } catch (err) {
                            console.error('Failed to rename label:', err);
                        }
                    }
                    // Snapshot listener will re-render, restoring the span
                };

                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') { input.blur(); }
                    if (ev.key === 'Escape') { input.value = currentName; input.blur(); }
                });
                input.addEventListener('blur', saveRename);
            });
        });

        // Change Color action
        this.gridEl.querySelectorAll('.label-menu-item[data-action="color"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                const colorInput = btn.querySelector('.label-color-input');
                const menu = this.gridEl.querySelector(`.label-options-menu[data-menu-for="${labelId}"]`);
                menu.style.display = 'none';

                // Make the hidden color input clickable and open it
                colorInput.style.pointerEvents = 'auto';
                colorInput.click();

                colorInput.addEventListener('input', async (ev) => {
                    const newColor = ev.target.value;
                    try {
                        await labelService.update(this.uid, this.workspaceId, labelId, { color: newColor });
                    } catch (err) {
                        console.error('Failed to change color:', err);
                    }
                }, { once: true });
            });
        });

        // Delete Label action
        this.gridEl.querySelectorAll('.label-menu-item[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                const label = this.labels.find(l => l.id === labelId);
                const menu = this.gridEl.querySelector(`.label-options-menu[data-menu-for="${labelId}"]`);
                menu.style.display = 'none';

                const labelName = label ? label.name : 'this label';
                if (!confirm(`Delete "${labelName}" ?\n\nAll tasks in this label will be moved to "No Label".`)) return;

                try {
                    // Ensure the system "No Label" bucket exists
                    const noLabelId = await labelService.ensureNoLabelExists(this.uid, this.workspaceId);
                    // Migrate all tasks from deleted label to "No Label"
                    await taskService.migrateTasksToLabel(this.uid, this.workspaceId, this.boardId, labelId, noLabelId);
                    // Delete the label itself
                    await labelService.delete(this.uid, this.workspaceId, labelId);
                } catch (err) {
                    console.error('Failed to delete label:', err);
                    alert('Failed to delete label. Check console.');
                }
            });
        });

        // ── Sort Buttons in Bucket Headers ──
        const sortBtns = this.gridEl.querySelectorAll('.btn-sort-bucket');
        sortBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                const sortType = btn.getAttribute('data-sort'); // 'name' or 'date'

                // If clicking the current sort type, fallback to manual maybe? Or just keep it. 
                // Let's just set it so it overrides manual. If they want manual they drag.
                this.bucketSortMode[labelId] = sortType;

                // Save to localStorage
                localStorage.setItem(`bucketSortMode_${this.boardId}`, JSON.stringify(this.bucketSortMode));

                // Re-render to show new sort and update active icons
                this.render();
            });
        });

        // ── Drag and Drop ordering for Tasks within Buckets ──
        let taskDragThrottle = null;

        const allTaskCards = this.gridEl.querySelectorAll('.task-card');
        allTaskCards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                e.stopPropagation(); // prevent bucket dragging
                requestAnimationFrame(() => {
                    card.classList.add('dragging-task');
                });
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-task-card', card.getAttribute('data-task-id'));

                // Save source bucket so we know if we dropped across buckets
                this.draggedTaskSourceLabelId = card.closest('.bucket').getAttribute('data-label-id');
            });

            card.addEventListener('dragend', async (e) => {
                e.stopPropagation();
                card.classList.remove('dragging-task');
                taskDragThrottle = null;

                // After drop, find the bucket we are in and save the new order
                const bucketEl = card.closest('.bucket');
                if (!bucketEl) return;
                const targetLabelId = bucketEl.getAttribute('data-label-id');
                const tId = card.getAttribute('data-task-id');
                const cardElements = Array.from(bucketEl.querySelectorAll('.task-card'));

                // If cross-bucket drop, prompt the user instead of autosaving
                if (this.draggedTaskSourceLabelId && targetLabelId !== this.draggedTaskSourceLabelId) {
                    const modal = document.getElementById('move-add-modal');
                    if (modal) {
                        modal.classList.add('active');
                        this.pendingMoveAdd = {
                            taskId: tId,
                            sourceLabelId: this.draggedTaskSourceLabelId,
                            targetLabelId: targetLabelId,
                            targetCardElements: cardElements.map(c => c.getAttribute('data-task-id')) // Just store IDs for order
                        };
                    }
                    this.draggedTaskSourceLabelId = null;
                    return; // Stop here, wait for user input from modal
                }

                // Normal within-bucket drop update
                this.draggedTaskSourceLabelId = null;

                // Override sort mode to manual
                this.bucketSortMode[targetLabelId] = 'manual';

                // Save to localStorage
                localStorage.setItem(`bucketSortMode_${this.boardId}`, JSON.stringify(this.bucketSortMode));

                // We want to update Firestore for every task in this bucket with its new index
                // We'll do them sequentially so we don't spam writes, or just fire them.
                const updates = cardElements.map((c, index) => {
                    const tId = c.getAttribute('data-task-id');
                    const t = this.tasks.find(tItem => tItem.id === tId);
                    if (t) {
                        const newOrder = { ...t.order };
                        newOrder[targetLabelId] = index;
                        t.order = newOrder; // optimistic update
                        return taskService.update(this.uid, this.workspaceId, this.boardId, tId, { order: newOrder });
                    }
                    return Promise.resolve();
                });

                try {
                    await Promise.all(updates);
                } catch (err) {
                    console.error('Failed to sort tasks:', err);
                }

                // Re-render to refresh bucket header icons
                this.render();
            });
        });

        const dropTargets = this.gridEl.querySelectorAll('.bucket');
        dropTargets.forEach(bucket => {
            bucket.addEventListener('dragover', (e) => {
                // Determine if we are dragging a task
                const draggingTask = this.gridEl.querySelector('.dragging-task');
                if (!draggingTask) return; // Might be a bucket drag

                e.preventDefault();
                e.stopPropagation();

                const container = bucket.querySelector('.bucket-cards');
                if (!container) return;

                if (taskDragThrottle) return;
                taskDragThrottle = setTimeout(() => { taskDragThrottle = null; }, 50);

                // Find where to drop
                const afterElement = this.getDragAfterElement(container, e.clientY);
                if (afterElement == null) {
                    container.appendChild(draggingTask);
                } else {
                    container.insertBefore(draggingTask, afterElement);
                }
            });

            bucket.addEventListener('drop', (e) => {
                const draggingTask = this.gridEl.querySelector('.dragging-task');
                if (!draggingTask) return;
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // ── Drag and Drop ordering for Buckets ──
        let dragThrottleTimer = null;
        let lastSwapTarget = null;

        const buckets = this.gridEl.querySelectorAll('.bucket');
        buckets.forEach(bucket => {
            bucket.addEventListener('dragstart', (e) => {
                // Small delay so the browser can capture the drag image first
                requestAnimationFrame(() => {
                    bucket.classList.add('dragging');
                });
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', bucket.getAttribute('data-label-id'));
                lastSwapTarget = null;
            });

            bucket.addEventListener('dragend', async () => {
                bucket.classList.remove('dragging');
                lastSwapTarget = null;
                dragThrottleTimer = null;

                // Persist the new order on dragend (more reliable than drop)
                const currentBuckets = Array.from(this.gridEl.querySelectorAll('.bucket'));
                const newOrderIds = currentBuckets
                    .map(b => b.getAttribute('data-label-id'))
                    .filter(id => id);

                if (newOrderIds.length > 0) {
                    try {
                        await labelService.updateOrders(this.uid, this.workspaceId, newOrderIds);
                    } catch (err) {
                        console.error("Failed to update label order", err);
                    }
                }
            });
        });

        this.gridEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            // Throttle: only process a swap every 80ms to prevent flickering
            if (dragThrottleTimer) return;
            dragThrottleTimer = setTimeout(() => { dragThrottleTimer = null; }, 80);

            const draggingBucket = this.gridEl.querySelector('.dragging');
            if (!draggingBucket) return;

            // Find the bucket the cursor is hovering over
            const targetBucket = e.target.closest('.bucket:not(.dragging)');
            const addBucket = this.gridEl.querySelector('.bucket-add');

            // Skip if we already swapped with this exact target (prevents rapid back-and-forth)
            if (!targetBucket || targetBucket === addBucket || targetBucket === lastSwapTarget) return;

            const gridChildren = Array.from(this.gridEl.children);
            const draggedIndex = gridChildren.indexOf(draggingBucket);
            const targetIndex = gridChildren.indexOf(targetBucket);

            if (draggedIndex === targetIndex) return;

            // Do the swap
            lastSwapTarget = targetBucket;

            if (draggedIndex < targetIndex) {
                this.gridEl.insertBefore(draggingBucket, targetBucket.nextSibling);
            } else {
                this.gridEl.insertBefore(draggingBucket, targetBucket);
            }
        });

        // Date Punches (optimistic update)
        const datePunches = this.gridEl.querySelectorAll('.dashboard-punch');
        datePunches.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const taskId = btn.getAttribute('data-task-id');
                const offset = btn.getAttribute('data-offset');
                const newDate = calculateOffsetDate(offset);

                const task = this.tasks.find(t => t.id === taskId);
                if (!task) return;

                // Store previous in case of failure
                const prevDate = task.dueDate;
                task.dueDate = newDate;

                // Optimistic render
                this.render();

                try {
                    await taskService.update(this.uid, this.workspaceId, this.boardId, taskId, { dueDate: newDate });
                } catch (err) {
                    console.error('Failed to update due date', err);
                    task.dueDate = prevDate;
                    this.render(); // Revert UI
                }
            });
        });

        // Also allow drop on the grid itself (needed to prevent default browser behavior)
        this.gridEl.addEventListener('drop', (e) => {
            e.preventDefault();
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging-task)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            // We want the middle of the box
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    setupEventListeners() {
        const signal = this._abortController.signal;
        // Add Label logic moving to top bar
        const btnShowAddTop = document.getElementById('btn-show-add-label-top');
        const popoverAdd = document.getElementById('add-label-popover');
        const inputNameTop = document.getElementById('new-label-name');
        const inputColorTop = document.getElementById('new-label-color');
        const btnSaveTop = document.getElementById('btn-save-label');
        const btnCancelTop = document.getElementById('btn-cancel-label');

        if (btnShowAddTop && popoverAdd) {
            btnShowAddTop.addEventListener('click', (e) => {
                e.stopPropagation();
                // Toggle popover visibility
                if (popoverAdd.style.display === 'none' || !popoverAdd.style.display) {
                    popoverAdd.style.display = 'flex';
                    inputNameTop.focus();
                } else {
                    popoverAdd.style.display = 'none';
                }
            }, { signal });

            // Close popover when clicking anywhere outside
            document.addEventListener('click', (e) => {
                if (popoverAdd.style.display === 'flex' && !popoverAdd.contains(e.target) && !btnShowAddTop.contains(e.target)) {
                    popoverAdd.style.display = 'none';
                }
            }, { signal });

            const closePopover = () => {
                inputNameTop.value = '';
                inputColorTop.value = '#6366f1';
                popoverAdd.style.display = 'none';
                btnSaveTop.disabled = false;
                btnSaveTop.textContent = 'Create';
            };

            btnCancelTop.addEventListener('click', closePopover, { signal });

            btnSaveTop.addEventListener('click', async () => {
                const name = inputNameTop.value.trim();
                const color = inputColorTop.value;
                if (name) {
                    btnSaveTop.disabled = true;
                    btnSaveTop.textContent = 'Saving...';
                    try {
                        await labelService.create(this.uid, this.workspaceId, name, color);
                        closePopover();
                    } catch (err) {
                        console.error(err);
                        alert('Failed to create label.');
                        btnSaveTop.disabled = false;
                        btnSaveTop.textContent = 'Create';
                    }
                }
            }, { signal });
        }
        // Delegate bucket park action explicitly
        if (this.gridEl) {
            this.gridEl.addEventListener('click', async (e) => {
                const btnPark = e.target.closest('.btn-park-bucket');
                if (btnPark) {
                    e.stopPropagation();
                    const lid = btnPark.getAttribute('data-label-id');
                    if (lid) {
                        try {
                            await labelService.update(this.uid, this.workspaceId, lid, { isParked: true });
                        } catch (err) {
                            console.error("Failed to park label:", err);
                        }
                    }
                }
            }, { signal });
        }

        // Sidebar Navigation Toggles
        const btnNavBoards = document.getElementById('btn-nav-boards');
        const btnNavCompleted = document.getElementById('btn-nav-completed');
        const btnNavArchive = document.getElementById('btn-nav-archive');

        const mainBoardContainer = document.getElementById('main-board-container');
        const completedBoardContainer = document.getElementById('completed-board-container');
        const archiveBoardContainer = document.getElementById('archive-board-container');

        const btnNavBookmarks = document.getElementById('btn-nav-bookmarks');
        const bookmarkBoardContainer = document.getElementById('bookmark-board-container');

        if (btnNavBoards && btnNavCompleted && btnNavArchive && mainBoardContainer && completedBoardContainer && archiveBoardContainer) {

            const activateTab = (tabId) => {
                [btnNavBoards, btnNavCompleted, btnNavArchive].forEach(btn => btn.classList.remove('active'));
                if (btnNavBookmarks) btnNavBookmarks.classList.remove('active');
                [mainBoardContainer, completedBoardContainer, archiveBoardContainer].forEach(container => container.classList.remove('active'));
                if (bookmarkBoardContainer) {
                    bookmarkBoardContainer.classList.remove('active');
                    bookmarkBoardContainer.style.display = 'none';
                }
                const noteBoardContainer = document.getElementById('note-board-container');
                if (noteBoardContainer) {
                    noteBoardContainer.classList.remove('active');
                    noteBoardContainer.style.display = 'none';
                }
                const btnNavNotes = document.getElementById('btn-nav-notes');
                if (btnNavNotes) btnNavNotes.classList.remove('active');

                // Restore left column and task-specific UI when switching away from bookmarks/notes
                const leftColumn = document.querySelector('.left-column');
                if (leftColumn) leftColumn.style.display = 'flex';

                // Swap topbar groups: show task controls, hide bookmark & note controls
                const taskTopbarGroup = document.getElementById('task-topbar-group');
                if (taskTopbarGroup) taskTopbarGroup.style.display = 'flex';

                const bookmarkTopbarGroup = document.getElementById('bookmark-topbar-group');
                if (bookmarkTopbarGroup) bookmarkTopbarGroup.style.display = 'none';

                const noteTopbarGroup = document.getElementById('note-topbar-group');
                if (noteTopbarGroup) noteTopbarGroup.style.display = 'none';

                // Restore global search
                const globalSearch = document.querySelector('.top-bar .search-container');
                if (globalSearch) globalSearch.style.display = 'flex';

                // Restore star filter bar
                const starFilterBar = document.getElementById('star-filter-bar');
                if (starFilterBar) starFilterBar.style.display = 'flex';

                if (tabId === 'boards') {
                    btnNavBoards.classList.add('active');
                    mainBoardContainer.classList.add('active');
                    const pageLabel = document.getElementById('workspace-page-label');
                    if (pageLabel) pageLabel.textContent = ' \u2014 Tasks';
                    this.currentView = 'active';
                    this.render();
                } else if (tabId === 'completed') {
                    btnNavCompleted.classList.add('active');
                    completedBoardContainer.classList.add('active');
                    const pageLabel = document.getElementById('workspace-page-label');
                    if (pageLabel) pageLabel.textContent = ' \u2014 Completed';
                    this.currentView = 'completed';
                    this.loadCompletedTasks();
                } else if (tabId === 'archive') {
                    btnNavArchive.classList.add('active');
                    archiveBoardContainer.classList.add('active');
                    const pageLabel = document.getElementById('workspace-page-label');
                    if (pageLabel) pageLabel.textContent = ' \u2014 Archived';
                    this.currentView = 'archived';
                    this.loadArchivedTasks();
                }
            };

            btnNavBoards.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof closeSidebar === 'function') closeSidebar();
                activateTab('boards');
            }, { signal });

            btnNavCompleted.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof closeSidebar === 'function') closeSidebar();
                activateTab('completed');
            }, { signal });

            btnNavArchive.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof closeSidebar === 'function') closeSidebar();
                activateTab('archive');
            }, { signal });
        }

        // ── Global Search Binding ──
        const searchInput = document.getElementById('global-search');
        const searchClearBtn = document.getElementById('btn-clear-search');
        const searchIndicator = document.getElementById('search-indicator');
        const searchIndicatorText = document.getElementById('search-indicator-text');
        let searchDebounce = null;

        const updateSearchUI = () => {
            if (this.searchQuery) {
                searchClearBtn.style.display = 'block';
                searchIndicator.style.display = 'flex';
                searchIndicatorText.textContent = `Filtered by search: '${this.searchQuery}'`;
            } else {
                searchClearBtn.style.display = 'none';
                searchIndicator.style.display = 'none';
                searchInput.value = '';
            }
            // Trigger render for the active view
            if (this.currentView === 'completed') {
                this.renderCompletedTasks(this.completedTasks);
            } else if (this.currentView === 'archived') {
                this.renderArchivedTasks(this.archivedTasks);
            } else {
                this.render();
            }
        };

        if (searchInput && searchClearBtn && searchIndicator) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => {
                    this.searchQuery = e.target.value.trim();
                    updateSearchUI();
                }, 300);
            }, { signal });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (this.currentFilterDate || this.currentFilterDateEnd) {
                        if (this.calendar) {
                            this.calendar.clearSelection();
                        } else {
                            this.currentFilterDate = null;
                            this.currentFilterDateEnd = null;
                            this.render();
                        }
                        return;
                    }

                    this.searchQuery = '';
                    updateSearchUI();
                }
            }, { signal });

            searchClearBtn.addEventListener('click', () => {
                if (this.currentFilterDate || this.currentFilterDateEnd) {
                    if (this.calendar) {
                        this.calendar.clearSelection();
                    } else {
                        this.currentFilterDate = null;
                        this.currentFilterDateEnd = null;
                        this.render();
                    }
                    return;
                }

                this.searchQuery = '';
                updateSearchUI();
            }, { signal });
        }

        // Star Filter Toggle
        const btnStarFilter = document.getElementById('btn-star-filter');
        const starFilterIcon = document.getElementById('star-filter-icon');
        const starFilterLabel = document.getElementById('star-filter-label');

        if (btnStarFilter) {
            btnStarFilter.addEventListener('click', () => {
                this.starFilter = !this.starFilter;

                if (this.starFilter) {
                    btnStarFilter.classList.add('active');
                    starFilterIcon.style.color = '#f59e0b';
                    starFilterIcon.style.fontVariationSettings = "'FILL' 1";
                    starFilterLabel.textContent = 'Showing Starred';
                } else {
                    btnStarFilter.classList.remove('active');
                    starFilterIcon.style.color = '';
                    starFilterIcon.style.fontVariationSettings = '';
                    starFilterLabel.textContent = 'Show Starred Only';
                }

                this.render();
            }, { signal });
        }

        // ── Zoom Slider ──
        const zoomSlider = document.getElementById('zoom-slider');
        if (zoomSlider && this.gridEl) {
            // Load saved zoom preference
            const savedZoom = localStorage.getItem('bucketGridZoom') || '1';
            zoomSlider.value = savedZoom;
            this.gridEl.style.zoom = savedZoom;

            zoomSlider.addEventListener('input', (e) => {
                const zoomVal = e.target.value;
                this.gridEl.style.zoom = zoomVal;
                localStorage.setItem('bucketGridZoom', zoomVal);
            }, { signal });
        }

        // ── Cross-Bucket Move/Add Modal Handlers ──
        const moveAddModal = document.getElementById('move-add-modal');
        const btnMoveAddClose = document.getElementById('btn-move-add-close');
        const btnMoveAddMove = document.getElementById('btn-move-add-move');
        const btnMoveAddAdd = document.getElementById('btn-move-add-add');

        const closeMoveAddModal = () => {
            if (moveAddModal) moveAddModal.classList.remove('active');
            this.pendingMoveAdd = null;
            // Re-render to revert the visually dragged card to its original place if cancelled
            this.render();
        };

        if (btnMoveAddClose) btnMoveAddClose.addEventListener('click', closeMoveAddModal, { signal });

        if (btnMoveAddMove) {
            btnMoveAddMove.addEventListener('click', async () => {
                if (!this.pendingMoveAdd) return;
                const { taskId, sourceLabelId, targetLabelId, targetCardElements } = this.pendingMoveAdd;
                const task = this.tasks.find(t => t.id === taskId);

                if (task) {
                    // Move: Remove source label, add target label
                    const newLabels = task.labels.filter(l => l !== sourceLabelId);
                    if (!newLabels.includes(targetLabelId)) newLabels.push(targetLabelId);

                    const newOrder = { ...task.order };
                    delete newOrder[sourceLabelId]; // remove order from source bucket

                    // Optimistic update
                    task.labels = newLabels;
                    task.order = newOrder;

                    // Update all tasks in target bucket to new order
                    const updates = targetCardElements.map((id, index) => {
                        if (id === taskId) {
                            newOrder[targetLabelId] = index; // add to new order
                            return taskService.update(this.uid, this.workspaceId, this.boardId, taskId, { labels: newLabels, order: newOrder });
                        }
                        const currentTask = this.tasks.find(t => t.id === id);
                        if (currentTask) {
                            const ord = { ...currentTask.order };
                            ord[targetLabelId] = index;
                            currentTask.order = ord;
                            return taskService.update(this.uid, this.workspaceId, this.boardId, id, { order: ord });
                        }
                        return Promise.resolve();
                    });

                    try {
                        await Promise.all(updates);
                    } catch (e) {
                        console.error('Failed to move task:', e);
                    }
                }
                closeMoveAddModal();
            }, { signal });
        }

        if (btnMoveAddAdd) {
            btnMoveAddAdd.addEventListener('click', async () => {
                if (!this.pendingMoveAdd) return;
                const { taskId, sourceLabelId, targetLabelId, targetCardElements } = this.pendingMoveAdd;
                const task = this.tasks.find(t => t.id === taskId);

                if (task) {
                    // Add: Keep source label, add target label
                    const newLabels = [...task.labels];
                    if (!newLabels.includes(targetLabelId)) newLabels.push(targetLabelId);

                    const newOrder = { ...task.order };
                    // We intentionally keep the source order

                    // Optimistic update
                    task.labels = newLabels;
                    task.order = newOrder;

                    // Update all tasks in target bucket to new order
                    const updates = targetCardElements.map((id, index) => {
                        if (id === taskId) {
                            newOrder[targetLabelId] = index;
                            return taskService.update(this.uid, this.workspaceId, this.boardId, taskId, { labels: newLabels, order: newOrder });
                        }
                        const currentTask = this.tasks.find(t => t.id === id);
                        if (currentTask) {
                            const ord = { ...currentTask.order };
                            ord[targetLabelId] = index;
                            currentTask.order = ord;
                            return taskService.update(this.uid, this.workspaceId, this.boardId, id, { order: ord });
                        }
                        return Promise.resolve();
                    });

                    try {
                        await Promise.all(updates);
                    } catch (e) {
                        console.error('Failed to add task:', e);
                    }
                }
                closeMoveAddModal();
            }, { signal });
        }
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

    formatDate(dateString) {
        if (!dateString) return '';
        // Prevent local timezone shifting by isolating YYYY-MM-DD and parsing directly
        const [y, m, d] = dateString.split('T')[0].split('-');
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // =========================================================
    // COMPLETED TASKS VIEW DEDICATED LOGIC
    // =========================================================
    loadCompletedTasks() {
        const listContainer = document.getElementById('completed-tasks-list');
        if (!listContainer) return;

        listContainer.innerHTML = '<div class="empty-state">Loading completed tasks...</div>';

        // Subscribe strictly when viewing
        if (this.unsubCompletedTasks) this.unsubCompletedTasks();

        this.unsubCompletedTasks = taskService.subscribeCompleted(this.uid, this.workspaceId, this.boardId, (tasks) => {
            this.completedTasks = tasks;
            this.renderCompletedTasks(tasks);
        });
    }

    filterTaskByQuery(task, query) {
        if (!query) return true;
        const q = query.toLowerCase();

        // Check Title
        if (task.title && task.title.toLowerCase().includes(q)) return true;

        // Check Description
        if (task.description && task.description.toLowerCase().includes(q)) return true;

        // Check Comments
        if (task.comments && Array.isArray(task.comments)) {
            if (task.comments.some(c => c.text && c.text.toLowerCase().includes(q))) return true;
        }

        // Check Labels
        if (task.labels && Array.isArray(task.labels)) {
            const labelObjs = this.labels.filter(l => task.labels.includes(l.id));
            if (labelObjs.some(l => l.name && l.name.toLowerCase().includes(q))) return true;
        }

        // Check Attachments
        if (task.attachments && Array.isArray(task.attachments)) {
            if (task.attachments.some(a => a.name && a.name.toLowerCase().includes(q))) return true;
        }

        return false;
    }

    renderCompletedTasks(tasks) {
        // Apply Search Query if active
        if (this.searchQuery) {
            tasks = tasks.filter(t => this.filterTaskByQuery(t, this.searchQuery));
        }

        const listContainer = document.getElementById('completed-tasks-list');
        if (!listContainer) return;

        if (tasks.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">check_circle</span>
                    <div>No completed tasks found!</div>
                </div>
            `;
            return;
        }

        let html = '';
        tasks.forEach(task => {
            const completedDateStr = task.completedAt ? new Date(task.completedAt).toLocaleDateString() : 'Unknown';
            const originalBucketName = this.labels.find(l => task.labels && task.labels.includes(l.id))?.name || 'No Label';

            html += `
                <div class="task-card" data-task-id="${task.id}" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 12px 16px; border-left: 4px solid var(--success); cursor: pointer;">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-weight: 600; font-size: 1rem; color: var(--text-primary); text-decoration: line-through; opacity: 0.7;">${this.escapeHtml(task.title)}</span>
                        <div style="display: flex; gap: 16px; font-size: 0.8rem; color: var(--text-muted);">
                            <span><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">folder</span> ${this.escapeHtml(originalBucketName)}</span>
                            <span><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">done_all</span> Finished: ${completedDateStr}</span>
                        </div>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline btn-restore-task" data-task-id="${task.id}" data-tooltip="Restore to Main Board" style="display: flex; align-items: center; gap: 4px;">
                            <span class="material-symbols-outlined" style="font-size: 16px;">settings_backup_restore</span> Restore
                        </button>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = `<div style="display: flex; flex-direction: column; gap: 8px;">${html}</div>`;

        // Bind Open Task Modal event
        const completedTaskCards = listContainer.querySelectorAll('.task-card');
        completedTaskCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // Ignore if clicked on the restore button
                if (e.target.closest('.btn-restore-task')) return;
                const taskId = card.getAttribute('data-task-id');
                if (window.currentTaskModal) {
                    window.currentTaskModal.open(taskId);
                }
            });
        });

        // Bind Restore events
        const restoreBtns = listContainer.querySelectorAll('.btn-restore-task');
        restoreBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const taskId = btn.getAttribute('data-task-id');
                try {
                    // Stripping completed flag and completedAt restores it naturally to the Main Board queries
                    await taskService.update(this.uid, this.workspaceId, this.boardId, taskId, {
                        completed: false,
                        completedAt: null
                    });
                } catch (err) {
                    console.error('Failed to restore task:', err);
                }
            });
        });
    }

    renderParkedLabels(parkedLabels) {
        const container = document.getElementById('parked-labels-container');
        if (!container) return;

        container.innerHTML = '';

        parkedLabels.forEach(label => {
            const chip = document.createElement('div');
            chip.className = 'parked-label-chip';
            chip.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 12px;
                background-color: var(--bg-surface);
                border: 1px solid var(--border-light);
                border-left: 3px solid ${label.color || '#6366f1'};
                border-radius: var(--radius-full);
                font-size: 0.8rem;
                font-weight: 500;
                color: var(--text-primary);
                cursor: pointer;
                box-shadow: var(--shadow-sm);
                transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
            `;
            chip.title = "Restore to Main Board";
            chip.innerHTML = `
                <span class="material-symbols-outlined" style="font-size: 14px; color: var(--text-muted); pointer-events: none;">visibility</span>
                <span style="pointer-events: none;">${this.escapeHtml(label.name)}</span>
            `;

            // Hover effects
            chip.onmouseover = () => {
                chip.style.transform = 'translateY(-1px)';
                chip.style.boxShadow = 'var(--shadow-md)';
                chip.style.borderColor = label.color || 'auto';
            };
            chip.onmouseout = () => {
                chip.style.transform = 'none';
                chip.style.boxShadow = 'var(--shadow-sm)';
                chip.style.borderColor = 'var(--border-light)';
            };

            // Click to restore
            chip.onclick = async () => {
                try {
                    await labelService.update(this.uid, this.workspaceId, label.id, { isParked: false });
                } catch (e) {
                    console.error("Failed to restore parked label:", e);
                }
            };

            container.appendChild(chip);
        });
    }

    // =========================================================
    // ARCHIVED TASKS VIEW DEDICATED LOGIC
    // =========================================================
    loadArchivedTasks() {
        const listContainer = document.getElementById('archived-tasks-list');
        if (!listContainer) return;

        listContainer.innerHTML = '<div class="empty-state">Loading archived tasks...</div>';

        if (this.unsubArchivedTasks) this.unsubArchivedTasks();

        this.unsubArchivedTasks = taskService.subscribeArchived(this.uid, this.workspaceId, this.boardId, (tasks) => {
            this.archivedTasks = tasks;
            this.renderArchivedTasks(tasks);
        });

        const btnPermanentDelete = document.getElementById('btn-delete-old-archive');
        if (btnPermanentDelete) {
            // Remove previous listeners using clone trick
            const newBtn = btnPermanentDelete.cloneNode(true);
            btnPermanentDelete.replaceWith(newBtn);

            newBtn.addEventListener('click', async () => {
                const months = 6;
                if (confirm(`Are you sure you want to permanently delete all archived tasks older than ${months} months? This action cannot be undone.`)) {
                    try {
                        const count = await taskService.deleteOldArchivedTasks(this.uid, this.workspaceId, this.boardId, months);
                        alert(`Successfully permanently deleted ${count} tasks.`);
                    } catch (e) {
                        console.error("Error permanently deleting tasks:", e);
                        alert("Failed to delete tasks. See console for details.");
                    }
                }
            });
        }
    }

    renderArchivedTasks(tasks) {
        if (this.searchQuery) {
            tasks = tasks.filter(t => this.filterTaskByQuery(t, this.searchQuery));
        }

        const listContainer = document.getElementById('archived-tasks-list');
        if (!listContainer) return;

        if (tasks.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">inventory</span>
                    <div>No archived tasks found!</div>
                </div>
            `;
            return;
        }

        let html = '';
        tasks.forEach(task => {
            const archivedDateStr = task.archivedAt ? new Date(task.archivedAt.toMillis ? task.archivedAt.toMillis() : task.archivedAt).toLocaleDateString() : 'Unknown';
            const originalBucketName = this.labels.find(l => task.labels && task.labels.includes(l.id))?.name || 'No Label';

            html += `
                <div class="task-card" data-task-id="${task.id}" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 12px 16px; border-left: 4px solid var(--text-muted); cursor: pointer; opacity: 0.85;">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <span style="font-weight: 600; font-size: 1rem; color: var(--text-primary);">${this.escapeHtml(task.title)}</span>
                        <div style="display: flex; gap: 16px; font-size: 0.8rem; color: var(--text-muted);">
                            <span><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">folder</span> ${this.escapeHtml(originalBucketName)}</span>
                            <span><span class="material-symbols-outlined" style="font-size: 14px; vertical-align: text-bottom;">archive</span> Archived: ${archivedDateStr}</span>
                        </div>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline btn-restore-task" data-task-id="${task.id}" data-tooltip="Unarchive to Main Board" style="display: flex; align-items: center; gap: 4px;">
                            <span class="material-symbols-outlined" style="font-size: 16px;">unarchive</span> Restore
                        </button>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = `<div style="display: flex; flex-direction: column; gap: 8px;">${html}</div>`;

        // Bind Open Task Modal event
        const taskCards = listContainer.querySelectorAll('.task-card');
        taskCards.forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-restore-task')) return;
                const taskId = card.getAttribute('data-task-id');
                if (window.currentTaskModal) {
                    window.currentTaskModal.open(taskId);
                }
            });
        });

        // Bind Restore events
        const restoreBtns = listContainer.querySelectorAll('.btn-restore-task');
        restoreBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const taskId = btn.getAttribute('data-task-id');
                try {
                    await taskService.unarchive(this.uid, this.workspaceId, this.boardId, taskId);
                } catch (err) {
                    console.error('Failed to unarchive task:', err);
                }
            });
        });
    }
}
