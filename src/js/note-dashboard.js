import { noteLabelService } from './services/note-label-service.js';
import { noteService } from './services/note-service.js';

export class NoteDashboard {
    constructor(uid, workspaceId) {
        this.uid = uid;
        this.workspaceId = workspaceId;

        this.labels = [];
        this.notes = [];
        this.searchQuery = '';

        this.bucketSortMode = {};
        try {
            const saved = localStorage.getItem(`noteBucketSort_${this.workspaceId}`);
            this.bucketSortMode = saved ? JSON.parse(saved) : {};
        } catch (e) {
            this.bucketSortMode = {};
        }

        this.unsubLabels = null;
        this.unsubNotes = null;

        this.gridEl = document.getElementById('note-board');

        // AbortController for cleaning up event listeners on destroy
        this._abortController = null;
    }

    init() {
        if (!this.gridEl) return;

        this.unsubLabels = noteLabelService.subscribe(this.uid, this.workspaceId, (labels) => {
            this.labels = labels;
            this.render();
        });

        this.unsubNotes = noteService.subscribe(this.uid, this.workspaceId, (notes) => {
            this.notes = notes;
            this.render();
        });

        // Abort any previous event listeners (in case of re-init)
        if (this._abortController) this._abortController.abort();
        this._abortController = new AbortController();

        this.setupEventListeners();
    }

    destroy() {
        if (this.unsubLabels) this.unsubLabels();
        if (this.unsubNotes) this.unsubNotes();
        if (this._abortController) this._abortController.abort();
    }

    render() {
        if (!this.gridEl) return;
        this.gridEl.innerHTML = '';

        const visibleLabels = this.labels.filter(l => !l.isParked);
        const parkedLabels = this.labels.filter(l => l.isParked)
            .sort((a, b) => {
                if (a.name === 'No Label') return 1;
                if (b.name === 'No Label') return -1;
                return a.name.localeCompare(b.name);
            });

        this.renderParkedLabels(parkedLabels);

        // Empty state: no labels at all
        if (visibleLabels.length === 0 && parkedLabels.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 60px 20px; text-align: center; width: 100%;';
            emptyState.innerHTML = `
                <span class="material-symbols-outlined" style="font-size: 48px; color: var(--text-muted); opacity: 0.5;">sticky_note_2</span>
                <div style="font-size: 1rem; font-weight: 600; color: var(--text-secondary);">No note labels yet</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); max-width: 280px;">Labels organize your notes into groups. Create your first one to get started.</div>
                <button class="btn btn-primary" id="btn-empty-create-note-label" style="padding: 10px 24px; display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
                    Create Your First Label
                </button>
            `;
            this.gridEl.appendChild(emptyState);

            const ctaBtn = document.getElementById('btn-empty-create-note-label');
            if (ctaBtn) {
                ctaBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const popover = document.getElementById('add-note-label-popover');
                    const inputName = document.getElementById('new-note-label-name');
                    if (popover) {
                        popover.style.display = 'flex';
                        if (inputName) inputName.focus();
                    }
                });
            }
            return;
        }

        visibleLabels.forEach((label) => {
            let bucketNotes = this.notes.filter(n => n.labels && n.labels.includes(label.id));

            // Apply search filter
            if (this.searchQuery) {
                const q = this.searchQuery.toLowerCase();
                bucketNotes = bucketNotes.filter(n => {
                    if (n.name && n.name.toLowerCase().includes(q)) return true;
                    // Search in comments
                    if (n.comments && n.comments.length > 0) {
                        return n.comments.some(c => c.content && c.content.toLowerCase().includes(q));
                    }
                    return false;
                });
            }

            // Sort
            const sortMode = this.bucketSortMode[label.id] || 'manual';
            if (sortMode === 'name') {
                bucketNotes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            } else {
                bucketNotes.sort((a, b) => {
                    const orderA = a.order?.[label.id] || 0;
                    const orderB = b.order?.[label.id] || 0;
                    return orderA - orderB;
                });
            }

            const bucketEl = document.createElement('div');
            bucketEl.className = `bucket animate-slide-up ${bucketNotes.length === 0 ? 'bucket-empty' : ''}`;
            bucketEl.style.borderTop = `4px solid ${label.color}`;
            bucketEl.draggable = true;
            bucketEl.setAttribute('data-label-id', label.id);

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
                        <span class="task-count">${bucketNotes.length}</span>
                        <button class="btn-icon btn-sm btn-sort-bucket ${sortMode === 'name' ? 'sort-active' : ''}" data-label-id="${label.id}" data-sort="name" data-tooltip="Sort by Name">
                            <span class="material-symbols-outlined" style="font-size: 16px;">sort_by_alpha</span>
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

            // Note cards
            let cardsHtml = `<div class="bucket-cards" data-label-id="${label.id}">`;
            bucketNotes.forEach(note => {
                const commentCount = (note.comments && note.comments.length) || 0;
                const createdDate = note.createdAt ? this.formatDate(note.createdAt) : '';
                cardsHtml += `
                    <div class="note-card" data-note-id="${note.id}" draggable="true">
                        <div class="note-card-body">
                            <span class="note-card-name">${this.escapeHtml(note.name)}</span>
                            <div class="note-card-meta">
                                ${createdDate ? `<span class="note-card-date">${createdDate}</span>` : ''}
                                ${commentCount > 0 ? `<span class="note-card-comments"><span class="material-symbols-outlined" style="font-size: 13px;">comment</span> ${commentCount}</span>` : ''}
                            </div>
                        </div>
                        <button class="btn-icon btn-note-settings" data-note-id="${note.id}" data-tooltip="Edit Note">
                            <span class="material-symbols-outlined" style="font-size: 16px;">settings</span>
                        </button>
                    </div>
                `;
            });
            cardsHtml += '</div>';

            // Quick add
            const quickAddHtml = `
                <div class="quick-add-task" style="padding: 10px; display: flex; gap: 8px;">
                    <input type="text" class="form-input form-input-sm quick-add-note-input" data-label-id="${label.id}" placeholder="Add note & press Enter..." />
                </div>
            `;

            bucketEl.innerHTML = headerHtml + cardsHtml + quickAddHtml;
            this.gridEl.appendChild(bucketEl);
        });

        this.bindEventsAfterRender();
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        let d;
        if (timestamp.toDate) {
            d = timestamp.toDate();
        } else if (timestamp.seconds) {
            d = new Date(timestamp.seconds * 1000);
        } else {
            d = new Date(timestamp);
        }
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const year = d.getFullYear();
        return `${month}/${day}/${year}`;
    }

    bindEventsAfterRender() {
        // Quick add note
        const inputs = this.gridEl.querySelectorAll('.quick-add-note-input');
        inputs.forEach(input => {
            input.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter' && input.value.trim() !== '') {
                    const name = input.value.trim();
                    const labelId = input.getAttribute('data-label-id');
                    input.value = '';
                    input.disabled = true;
                    try {
                        const newNote = await noteService.create(this.uid, this.workspaceId, name, labelId);
                        // Open modal immediately so user can add comments
                        if (window.currentNoteModal && newNote) {
                            window.currentNoteModal.open(newNote.id);
                        }
                    } catch (err) {
                        console.error('Failed to create note:', err);
                    } finally {
                        input.disabled = false;
                        input.focus();
                    }
                }
            });
        });

        // Click note card body → open modal
        const cardBodies = this.gridEl.querySelectorAll('.note-card-body');
        cardBodies.forEach(body => {
            body.addEventListener('click', (e) => {
                const card = body.closest('.note-card');
                const noteId = card.getAttribute('data-note-id');
                if (window.currentNoteModal) {
                    window.currentNoteModal.open(noteId);
                }
            });
        });

        // Click settings icon → open modal
        const settingsBtns = this.gridEl.querySelectorAll('.btn-note-settings');
        settingsBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = btn.getAttribute('data-note-id');
                if (window.currentNoteModal) {
                    window.currentNoteModal.open(noteId);
                }
            });
        });

        // Label menu toggle
        const menuBtns = this.gridEl.querySelectorAll('.btn-label-menu');
        menuBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                this.gridEl.querySelectorAll('.label-options-menu').forEach(m => {
                    if (m.getAttribute('data-menu-for') !== labelId) m.style.display = 'none';
                });
                const menu = this.gridEl.querySelector(`.label-options-menu[data-menu-for="${labelId}"]`);
                menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
            });
        });

        document.addEventListener('click', () => {
            if (this.gridEl) {
                this.gridEl.querySelectorAll('.label-options-menu').forEach(m => m.style.display = 'none');
            }
        }, { once: true });

        // Rename
        this.gridEl.querySelectorAll('.label-menu-item[data-action="rename"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                const bucket = this.gridEl.querySelector(`.bucket[data-label-id="${labelId}"]`);
                const nameSpan = bucket.querySelector('.label-name-text');
                const menu = this.gridEl.querySelector(`.label-options-menu[data-menu-for="${labelId}"]`);
                menu.style.display = 'none';

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
                            await noteLabelService.update(this.uid, this.workspaceId, labelId, { name: newName });
                        } catch (err) {
                            console.error('Failed to rename label:', err);
                        }
                    }
                };

                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') input.blur();
                    if (ev.key === 'Escape') { input.value = currentName; input.blur(); }
                });
                input.addEventListener('blur', saveRename);
            });
        });

        // Change color
        this.gridEl.querySelectorAll('.label-menu-item[data-action="color"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                const colorInput = btn.querySelector('.label-color-input');
                const menu = this.gridEl.querySelector(`.label-options-menu[data-menu-for="${labelId}"]`);
                menu.style.display = 'none';

                colorInput.style.pointerEvents = 'auto';
                colorInput.click();

                colorInput.addEventListener('input', async (ev) => {
                    try {
                        await noteLabelService.update(this.uid, this.workspaceId, labelId, { color: ev.target.value });
                    } catch (err) {
                        console.error('Failed to change color:', err);
                    }
                }, { once: true });
            });
        });

        // Delete label
        this.gridEl.querySelectorAll('.label-menu-item[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                const label = this.labels.find(l => l.id === labelId);
                const menu = this.gridEl.querySelector(`.label-options-menu[data-menu-for="${labelId}"]`);
                menu.style.display = 'none';

                const labelName = label ? label.name : 'this label';
                if (!confirm(`Delete "${labelName}"?\n\nAll notes in this label will be moved to "No Label".`)) return;

                try {
                    const noLabelId = await noteLabelService.ensureNoLabelExists(this.uid, this.workspaceId);
                    await noteService.migrateNotesToLabel(this.uid, this.workspaceId, labelId, noLabelId);
                    await noteLabelService.delete(this.uid, this.workspaceId, labelId);
                } catch (err) {
                    console.error('Failed to delete label:', err);
                    alert('Failed to delete label.');
                }
            });
        });

        // Sort buttons
        const sortBtns = this.gridEl.querySelectorAll('.btn-sort-bucket');
        sortBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const labelId = btn.getAttribute('data-label-id');
                const sortType = btn.getAttribute('data-sort');
                this.bucketSortMode[labelId] = sortType;
                localStorage.setItem(`noteBucketSort_${this.workspaceId}`, JSON.stringify(this.bucketSortMode));
                this.render();
            });
        });

        // ── Drag and Drop for Note Cards ──
        let cardDragThrottle = null;
        const allCards = this.gridEl.querySelectorAll('.note-card');
        allCards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                requestAnimationFrame(() => card.classList.add('dragging-note'));
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-note-card', card.getAttribute('data-note-id'));
                this.draggedNoteSourceLabelId = card.closest('.bucket').getAttribute('data-label-id');
            });

            card.addEventListener('dragend', async (e) => {
                e.stopPropagation();
                card.classList.remove('dragging-note');
                cardDragThrottle = null;

                const bucketEl = card.closest('.bucket');
                if (!bucketEl) return;
                const targetLabelId = bucketEl.getAttribute('data-label-id');
                const noteId = card.getAttribute('data-note-id');
                const cardElements = Array.from(bucketEl.querySelectorAll('.note-card'));

                // Cross-bucket drop
                if (this.draggedNoteSourceLabelId && targetLabelId !== this.draggedNoteSourceLabelId) {
                    const modal = document.getElementById('note-move-modal');
                    if (modal) {
                        modal.classList.add('active');
                        this.pendingMoveAdd = {
                            noteId: noteId,
                            sourceLabelId: this.draggedNoteSourceLabelId,
                            targetLabelId,
                            targetCardIds: cardElements.map(c => c.getAttribute('data-note-id'))
                        };
                    }
                    this.draggedNoteSourceLabelId = null;
                    return;
                }

                // Within-bucket reorder
                this.draggedNoteSourceLabelId = null;
                this.bucketSortMode[targetLabelId] = 'manual';
                localStorage.setItem(`noteBucketSort_${this.workspaceId}`, JSON.stringify(this.bucketSortMode));

                const updates = cardElements.map((c, index) => {
                    const id = c.getAttribute('data-note-id');
                    const note = this.notes.find(n => n.id === id);
                    if (note) {
                        const newOrder = { ...note.order };
                        newOrder[targetLabelId] = index;
                        note.order = newOrder;
                        return noteService.update(this.uid, this.workspaceId, id, { order: newOrder });
                    }
                    return Promise.resolve();
                });

                try {
                    await Promise.all(updates);
                } catch (err) {
                    console.error('Failed to reorder notes:', err);
                }
                this.render();
            });
        });

        // Drop zones for note cards
        const dropTargets = this.gridEl.querySelectorAll('.bucket');
        dropTargets.forEach(bucket => {
            bucket.addEventListener('dragover', (e) => {
                const dragging = this.gridEl.querySelector('.dragging-note');
                if (!dragging) return;

                e.preventDefault();
                e.stopPropagation();

                const container = bucket.querySelector('.bucket-cards');
                if (!container) return;

                if (cardDragThrottle) return;
                cardDragThrottle = setTimeout(() => { cardDragThrottle = null; }, 50);

                const afterElement = this.getDragAfterElement(container, e.clientY);
                if (afterElement == null) {
                    container.appendChild(dragging);
                } else {
                    container.insertBefore(dragging, afterElement);
                }
            });

            bucket.addEventListener('drop', (e) => {
                if (this.gridEl.querySelector('.dragging-note')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        });

        // ── Drag and Drop for Buckets ──
        let bucketDragThrottle = null;
        let lastSwapTarget = null;

        const buckets = this.gridEl.querySelectorAll('.bucket');
        buckets.forEach(bucket => {
            bucket.addEventListener('dragstart', (e) => {
                requestAnimationFrame(() => bucket.classList.add('dragging'));
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', bucket.getAttribute('data-label-id'));
                lastSwapTarget = null;
            });

            bucket.addEventListener('dragend', async () => {
                bucket.classList.remove('dragging');
                lastSwapTarget = null;
                bucketDragThrottle = null;

                const currentBuckets = Array.from(this.gridEl.querySelectorAll('.bucket'));
                const newOrderIds = currentBuckets.map(b => b.getAttribute('data-label-id')).filter(Boolean);

                if (newOrderIds.length > 0) {
                    try {
                        await noteLabelService.updateOrders(this.uid, this.workspaceId, newOrderIds);
                    } catch (err) {
                        console.error("Failed to update label order", err);
                    }
                }
            });
        });

        this.gridEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            if (bucketDragThrottle) return;
            bucketDragThrottle = setTimeout(() => { bucketDragThrottle = null; }, 80);

            const draggingBucket = this.gridEl.querySelector('.dragging');
            if (!draggingBucket) return;

            const targetBucket = e.target.closest('.bucket:not(.dragging)');
            if (!targetBucket || targetBucket === lastSwapTarget) return;

            const gridChildren = Array.from(this.gridEl.children);
            const draggedIndex = gridChildren.indexOf(draggingBucket);
            const targetIndex = gridChildren.indexOf(targetBucket);

            if (draggedIndex === targetIndex) return;
            lastSwapTarget = targetBucket;

            if (draggedIndex < targetIndex) {
                this.gridEl.insertBefore(draggingBucket, targetBucket.nextSibling);
            } else {
                this.gridEl.insertBefore(draggingBucket, targetBucket);
            }
        });

        this.gridEl.addEventListener('drop', (e) => {
            e.preventDefault();
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.note-card:not(.dragging-note)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    setupEventListeners() {
        const signal = this._abortController.signal;
        // New Label popover
        const btnShowAdd = document.getElementById('btn-show-add-note-label');
        const popover = document.getElementById('add-note-label-popover');
        const inputName = document.getElementById('new-note-label-name');
        const inputColor = document.getElementById('new-note-label-color');
        const btnSave = document.getElementById('btn-save-note-label');
        const btnCancel = document.getElementById('btn-cancel-note-label');

        if (btnShowAdd && popover) {
            btnShowAdd.addEventListener('click', (e) => {
                e.stopPropagation();
                if (popover.style.display === 'none' || !popover.style.display) {
                    popover.style.display = 'flex';
                    inputName.focus();
                } else {
                    popover.style.display = 'none';
                }
            }, { signal });

            document.addEventListener('click', (e) => {
                if (popover.style.display === 'flex' && !popover.contains(e.target) && !btnShowAdd.contains(e.target)) {
                    popover.style.display = 'none';
                }
            }, { signal });

            const closePopover = () => {
                inputName.value = '';
                inputColor.value = '#6366f1';
                popover.style.display = 'none';
                btnSave.disabled = false;
                btnSave.textContent = 'Create';
            };

            btnCancel.addEventListener('click', closePopover, { signal });

            btnSave.addEventListener('click', async () => {
                const name = inputName.value.trim();
                const color = inputColor.value;
                if (name) {
                    btnSave.disabled = true;
                    btnSave.textContent = 'Saving...';
                    try {
                        await noteLabelService.create(this.uid, this.workspaceId, name, color);
                        closePopover();
                    } catch (err) {
                        console.error(err);
                        alert('Failed to create label.');
                        btnSave.disabled = false;
                        btnSave.textContent = 'Create';
                    }
                }
            }, { signal });
        }

        // Park bucket delegation
        if (this.gridEl) {
            this.gridEl.addEventListener('click', async (e) => {
                const btnPark = e.target.closest('.btn-park-bucket');
                if (btnPark) {
                    e.stopPropagation();
                    const lid = btnPark.getAttribute('data-label-id');
                    if (lid) {
                        try {
                            await noteLabelService.update(this.uid, this.workspaceId, lid, { isParked: true });
                        } catch (err) {
                            console.error("Failed to park label:", err);
                        }
                    }
                }
            }, { signal });
        }

        // Sidebar navigation - Notes tab
        const btnNavNotes = document.getElementById('btn-nav-notes');
        if (btnNavNotes) {
            btnNavNotes.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof closeSidebar === 'function') closeSidebar();
                this.activateNotesView();
            }, { signal });
        }

        // Search
        const searchInput = document.getElementById('note-search');
        let searchDebounce = null;
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchDebounce);
                searchDebounce = setTimeout(() => {
                    this.searchQuery = e.target.value.trim();
                    this.render();
                }, 300);
            }, { signal });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.searchQuery = '';
                    searchInput.value = '';
                    this.render();
                }
            }, { signal });
        }

        // Zoom slider
        const zoomSlider = document.getElementById('note-zoom-slider');
        if (zoomSlider && this.gridEl) {
            const savedZoom = localStorage.getItem('noteGridZoom') || '1';
            zoomSlider.value = savedZoom;
            this.gridEl.style.zoom = savedZoom;

            zoomSlider.addEventListener('input', (e) => {
                const zoomVal = e.target.value;
                this.gridEl.style.zoom = zoomVal;
                localStorage.setItem('noteGridZoom', zoomVal);
            }, { signal });
        }

        // ── Add Note button (top bar) ──
        const btnCreateNote = document.getElementById('btn-topbar-create-note');
        if (btnCreateNote) {
            btnCreateNote.addEventListener('click', () => {
                if (window.currentNoteModal) {
                    window.currentNoteModal.open(null);
                }
            }, { signal });
        }

        // ── Labels visibility toggle ──
        const btnToggleLabels = document.getElementById('btn-toggle-note-labels');
        const labelsContainer = document.getElementById('note-parked-labels-container');
        const labelsToggleIcon = document.getElementById('note-labels-toggle-icon');

        const applyLabelsVisibility = (visible) => {
            if (labelsContainer) labelsContainer.style.display = visible ? 'flex' : 'none';
            if (labelsToggleIcon) {
                labelsToggleIcon.textContent = visible ? 'label_off' : 'label';
            }
            if (btnToggleLabels) {
                btnToggleLabels.style.opacity = visible ? '0.7' : '1';
                btnToggleLabels.title = visible ? 'Hide Labels' : 'Show Labels';
            }
        };

        const savedLabelsVisible = localStorage.getItem('noteLabelsVisible');
        this._labelsVisible = savedLabelsVisible === null ? true : savedLabelsVisible === 'true';
        applyLabelsVisibility(this._labelsVisible);

        if (btnToggleLabels) {
            btnToggleLabels.addEventListener('click', () => {
                this._labelsVisible = !this._labelsVisible;
                localStorage.setItem('noteLabelsVisible', this._labelsVisible);
                applyLabelsVisibility(this._labelsVisible);
            }, { signal });
        }

        // Cross-bucket move/add modal
        const moveModal = document.getElementById('note-move-modal');
        const btnMoveClose = document.getElementById('btn-note-move-close');
        const btnMoveMove = document.getElementById('btn-note-move-move');
        const btnMoveAdd = document.getElementById('btn-note-move-add');

        const closeMoveModal = () => {
            if (moveModal) moveModal.classList.remove('active');
            this.pendingMoveAdd = null;
            this.render();
        };

        if (btnMoveClose) btnMoveClose.addEventListener('click', closeMoveModal, { signal });

        if (btnMoveMove) {
            btnMoveMove.addEventListener('click', async () => {
                if (!this.pendingMoveAdd) return;
                const { noteId, sourceLabelId, targetLabelId, targetCardIds } = this.pendingMoveAdd;
                const note = this.notes.find(n => n.id === noteId);

                if (note) {
                    const newLabels = note.labels.filter(l => l !== sourceLabelId);
                    if (!newLabels.includes(targetLabelId)) newLabels.push(targetLabelId);

                    const newOrder = { ...note.order };
                    delete newOrder[sourceLabelId];

                    note.labels = newLabels;
                    note.order = newOrder;

                    const updates = targetCardIds.map((id, index) => {
                        if (id === noteId) {
                            newOrder[targetLabelId] = index;
                            return noteService.update(this.uid, this.workspaceId, noteId, { labels: newLabels, order: newOrder });
                        }
                        const current = this.notes.find(n => n.id === id);
                        if (current) {
                            const ord = { ...current.order };
                            ord[targetLabelId] = index;
                            current.order = ord;
                            return noteService.update(this.uid, this.workspaceId, id, { order: ord });
                        }
                        return Promise.resolve();
                    });

                    try { await Promise.all(updates); } catch (e) { console.error('Failed to move note:', e); }
                }
                closeMoveModal();
            }, { signal });
        }

        if (btnMoveAdd) {
            btnMoveAdd.addEventListener('click', async () => {
                if (!this.pendingMoveAdd) return;
                const { noteId, targetLabelId, targetCardIds } = this.pendingMoveAdd;
                const note = this.notes.find(n => n.id === noteId);

                if (note) {
                    const newLabels = [...note.labels];
                    if (!newLabels.includes(targetLabelId)) newLabels.push(targetLabelId);

                    const newOrder = { ...note.order };
                    note.labels = newLabels;
                    note.order = newOrder;

                    const updates = targetCardIds.map((id, index) => {
                        if (id === noteId) {
                            newOrder[targetLabelId] = index;
                            return noteService.update(this.uid, this.workspaceId, noteId, { labels: newLabels, order: newOrder });
                        }
                        const current = this.notes.find(n => n.id === id);
                        if (current) {
                            const ord = { ...current.order };
                            ord[targetLabelId] = index;
                            current.order = ord;
                            return noteService.update(this.uid, this.workspaceId, id, { order: ord });
                        }
                        return Promise.resolve();
                    });

                    try { await Promise.all(updates); } catch (e) { console.error('Failed to add note:', e); }
                }
                closeMoveModal();
            }, { signal });
        }
    }

    activateNotesView() {
        if (typeof closeSidebar === 'function') closeSidebar();
        // Deactivate all nav items
        const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
        navItems.forEach(item => item.classList.remove('active'));

        // Activate notes nav
        const btnNavNotes = document.getElementById('btn-nav-notes');
        if (btnNavNotes) btnNavNotes.classList.add('active');

        // Hide all board containers
        const containers = ['main-board-container', 'completed-board-container', 'archive-board-container', 'bookmark-board-container', 'note-board-container'];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.classList.remove('active');
            }
        });

        // Show note container
        const noteContainer = document.getElementById('note-board-container');
        if (noteContainer) {
            noteContainer.style.display = 'flex';
            noteContainer.classList.add('active');
        }

        // Hide left column (calendar)
        const leftColumn = document.querySelector('.left-column');
        if (leftColumn) leftColumn.style.display = 'none';

        // Swap top bar groups: hide task & bookmark controls, show note controls
        const taskTopbarGroup = document.getElementById('task-topbar-group');
        if (taskTopbarGroup) taskTopbarGroup.style.display = 'none';

        const bookmarkTopbarGroup = document.getElementById('bookmark-topbar-group');
        if (bookmarkTopbarGroup) bookmarkTopbarGroup.style.display = 'none';

        const noteTopbarGroup = document.getElementById('note-topbar-group');
        if (noteTopbarGroup) noteTopbarGroup.style.display = 'flex';

        // Hide global search
        const globalSearch = document.querySelector('.top-bar .search-container:not(#note-topbar-group .search-container):not(#bookmark-topbar-group .search-container)');
        if (globalSearch) globalSearch.style.display = 'none';

        // Hide task-specific sub-bar elements
        const taskSubBarElements = ['search-indicator', 'date-filter-banner', 'star-filter-bar'];
        taskSubBarElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        this.render();
    }

    renderParkedLabels(parkedLabels) {
        const container = document.getElementById('note-parked-labels-container');
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
                transition: transform var(--transition-fast), box-shadow var(--transition-fast);
            `;
            chip.title = "Restore Label";
            chip.innerHTML = `
                <span class="material-symbols-outlined" style="font-size: 14px; color: var(--text-muted); pointer-events: none;">visibility</span>
                <span style="pointer-events: none;">${this.escapeHtml(label.name)}</span>
            `;

            chip.onmouseover = () => {
                chip.style.transform = 'translateY(-1px)';
                chip.style.boxShadow = 'var(--shadow-md)';
            };
            chip.onmouseout = () => {
                chip.style.transform = 'none';
                chip.style.boxShadow = 'var(--shadow-sm)';
            };

            chip.onclick = async () => {
                try {
                    await noteLabelService.update(this.uid, this.workspaceId, label.id, { isParked: false });
                } catch (e) {
                    console.error("Failed to restore parked label:", e);
                }
            };

            container.appendChild(chip);
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
