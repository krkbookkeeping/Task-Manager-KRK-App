import { bookmarkLabelService } from './services/bookmark-label-service.js';
import { bookmarkService } from './services/bookmark-service.js';

export class BookmarkDashboard {
    constructor(uid, workspaceId) {
        this.uid = uid;
        this.workspaceId = workspaceId;

        this.labels = [];
        this.bookmarks = [];
        this.searchQuery = '';

        this.bucketSortMode = {};
        try {
            const saved = localStorage.getItem(`bookmarkBucketSort_${this.workspaceId}`);
            this.bucketSortMode = saved ? JSON.parse(saved) : {};
        } catch (e) {
            this.bucketSortMode = {};
        }

        this.unsubLabels = null;
        this.unsubBookmarks = null;

        this.gridEl = document.getElementById('bookmark-board');

        // AbortController for cleaning up event listeners on destroy
        this._abortController = null;
    }

    init() {
        if (!this.gridEl) return;

        this.unsubLabels = bookmarkLabelService.subscribe(this.uid, this.workspaceId, (labels) => {
            this.labels = labels;
            this.render();
        });

        this.unsubBookmarks = bookmarkService.subscribe(this.uid, this.workspaceId, (bookmarks) => {
            this.bookmarks = bookmarks;
            this.render();
        });

        // Abort any previous event listeners (in case of re-init)
        if (this._abortController) this._abortController.abort();
        this._abortController = new AbortController();

        this.setupEventListeners();
    }

    destroy() {
        if (this.unsubLabels) this.unsubLabels();
        if (this.unsubBookmarks) this.unsubBookmarks();
        // Clean up all event listeners
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

        // Empty state: no labels at all — show CTA
        if (visibleLabels.length === 0 && parkedLabels.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 60px 20px; text-align: center; width: 100%;';
            emptyState.innerHTML = `
                <span class="material-symbols-outlined" style="font-size: 48px; color: var(--text-muted); opacity: 0.5;">bookmarks</span>
                <div style="font-size: 1rem; font-weight: 600; color: var(--text-secondary);">No bookmark labels yet</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); max-width: 280px;">Labels organize your bookmarks into groups. Create your first one to get started.</div>
                <button class="btn btn-primary" id="btn-empty-create-bookmark-label" style="padding: 10px 24px; display: flex; align-items: center; gap: 8px;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
                    Create Your First Label
                </button>
            `;
            this.gridEl.appendChild(emptyState);

            const ctaBtn = document.getElementById('btn-empty-create-bookmark-label');
            if (ctaBtn) {
                ctaBtn.addEventListener('click', () => {
                    const btnShowAdd = document.getElementById('btn-show-add-bookmark-label');
                    if (btnShowAdd) btnShowAdd.click();
                });
            }
            return;
        }

        visibleLabels.forEach((label) => {
            let bucketBookmarks = this.bookmarks.filter(b => b.labels && b.labels.includes(label.id));

            // Apply search filter
            if (this.searchQuery) {
                const q = this.searchQuery.toLowerCase();
                bucketBookmarks = bucketBookmarks.filter(b =>
                    (b.name && b.name.toLowerCase().includes(q)) ||
                    (b.url && b.url.toLowerCase().includes(q)) ||
                    (b.notes && b.notes.toLowerCase().includes(q))
                );
            }

            // Sort
            const sortMode = this.bucketSortMode[label.id] || 'manual';
            if (sortMode === 'name') {
                bucketBookmarks.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            } else {
                bucketBookmarks.sort((a, b) => {
                    const orderA = a.order?.[label.id] || 0;
                    const orderB = b.order?.[label.id] || 0;
                    return orderA - orderB;
                });
            }

            const bucketEl = document.createElement('div');
            bucketEl.className = `bucket animate-slide-up ${bucketBookmarks.length === 0 ? 'bucket-empty' : ''}`;
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
                        <span class="task-count">${bucketBookmarks.length}</span>
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

            // Bookmark cards
            let cardsHtml = `<div class="bucket-cards" data-label-id="${label.id}">`;
            bucketBookmarks.forEach(bm => {
                cardsHtml += `
                    <div class="bookmark-card" data-bookmark-id="${bm.id}" draggable="true">
                        <div class="bookmark-card-body" data-url="${this.escapeHtml(bm.url || '')}">
                            <span class="bookmark-card-name">${this.escapeHtml(bm.name)}</span>
                        </div>
                        <button class="btn-icon btn-bookmark-settings" data-bookmark-id="${bm.id}" data-tooltip="Edit Bookmark">
                            <span class="material-symbols-outlined" style="font-size: 16px;">settings</span>
                        </button>
                    </div>
                `;
            });
            cardsHtml += '</div>';

            // Quick add
            const quickAddHtml = `
                <div class="quick-add-task" style="padding: 10px; display: flex; gap: 8px;">
                    <input type="text" class="form-input form-input-sm quick-add-bookmark-input" data-label-id="${label.id}" placeholder="Add bookmark & press Enter..." />
                </div>
            `;

            bucketEl.innerHTML = headerHtml + cardsHtml + quickAddHtml;
            this.gridEl.appendChild(bucketEl);
        });

        this.bindEventsAfterRender();
    }

    bindEventsAfterRender() {
        // Quick add bookmark
        const inputs = this.gridEl.querySelectorAll('.quick-add-bookmark-input');
        inputs.forEach(input => {
            input.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter' && input.value.trim() !== '') {
                    const name = input.value.trim();
                    const labelId = input.getAttribute('data-label-id');
                    input.value = '';
                    input.disabled = true;
                    try {
                        const newBm = await bookmarkService.create(this.uid, this.workspaceId, name, labelId);
                        // Open modal immediately so user can add URL
                        if (window.currentBookmarkModal && newBm) {
                            window.currentBookmarkModal.open(newBm.id);
                        }
                    } catch (err) {
                        console.error('Failed to create bookmark:', err);
                    } finally {
                        input.disabled = false;
                        input.focus();
                    }
                }
            });
        });

        // Click bookmark card body → open URL
        const cardBodies = this.gridEl.querySelectorAll('.bookmark-card-body');
        cardBodies.forEach(body => {
            body.addEventListener('click', (e) => {
                const url = body.getAttribute('data-url');
                if (url) {
                    window.open(url, '_blank');
                }
            });
        });

        // Click settings icon → open modal
        const settingsBtns = this.gridEl.querySelectorAll('.btn-bookmark-settings');
        settingsBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const bmId = btn.getAttribute('data-bookmark-id');
                if (window.currentBookmarkModal) {
                    window.currentBookmarkModal.open(bmId);
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
                            await bookmarkLabelService.update(this.uid, this.workspaceId, labelId, { name: newName });
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
                        await bookmarkLabelService.update(this.uid, this.workspaceId, labelId, { color: ev.target.value });
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
                if (!confirm(`Delete "${labelName}"?\n\nAll bookmarks in this label will be moved to "No Label".`)) return;

                try {
                    const noLabelId = await bookmarkLabelService.ensureNoLabelExists(this.uid, this.workspaceId);
                    await bookmarkService.migrateBookmarksToLabel(this.uid, this.workspaceId, labelId, noLabelId);
                    await bookmarkLabelService.delete(this.uid, this.workspaceId, labelId);
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
                localStorage.setItem(`bookmarkBucketSort_${this.workspaceId}`, JSON.stringify(this.bucketSortMode));
                this.render();
            });
        });

        // ── Drag and Drop for Bookmark Cards ──
        let cardDragThrottle = null;
        const allCards = this.gridEl.querySelectorAll('.bookmark-card');
        allCards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                requestAnimationFrame(() => card.classList.add('dragging-bookmark'));
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-bookmark-card', card.getAttribute('data-bookmark-id'));
                this.draggedBookmarkSourceLabelId = card.closest('.bucket').getAttribute('data-label-id');
            });

            card.addEventListener('dragend', async (e) => {
                e.stopPropagation();
                card.classList.remove('dragging-bookmark');
                cardDragThrottle = null;

                const bucketEl = card.closest('.bucket');
                if (!bucketEl) return;
                const targetLabelId = bucketEl.getAttribute('data-label-id');
                const bmId = card.getAttribute('data-bookmark-id');
                const cardElements = Array.from(bucketEl.querySelectorAll('.bookmark-card'));

                // Cross-bucket drop
                if (this.draggedBookmarkSourceLabelId && targetLabelId !== this.draggedBookmarkSourceLabelId) {
                    const modal = document.getElementById('bookmark-move-modal');
                    if (modal) {
                        modal.classList.add('active');
                        this.pendingMoveAdd = {
                            bookmarkId: bmId,
                            sourceLabelId: this.draggedBookmarkSourceLabelId,
                            targetLabelId,
                            targetCardIds: cardElements.map(c => c.getAttribute('data-bookmark-id'))
                        };
                    }
                    this.draggedBookmarkSourceLabelId = null;
                    return;
                }

                // Within-bucket reorder
                this.draggedBookmarkSourceLabelId = null;
                this.bucketSortMode[targetLabelId] = 'manual';
                localStorage.setItem(`bookmarkBucketSort_${this.workspaceId}`, JSON.stringify(this.bucketSortMode));

                const updates = cardElements.map((c, index) => {
                    const id = c.getAttribute('data-bookmark-id');
                    const bm = this.bookmarks.find(b => b.id === id);
                    if (bm) {
                        const newOrder = { ...bm.order };
                        newOrder[targetLabelId] = index;
                        bm.order = newOrder;
                        return bookmarkService.update(this.uid, this.workspaceId, id, { order: newOrder });
                    }
                    return Promise.resolve();
                });

                try {
                    await Promise.all(updates);
                } catch (err) {
                    console.error('Failed to reorder bookmarks:', err);
                }
                this.render();
            });
        });

        // Drop zones for bookmark cards
        const dropTargets = this.gridEl.querySelectorAll('.bucket');
        dropTargets.forEach(bucket => {
            bucket.addEventListener('dragover', (e) => {
                const dragging = this.gridEl.querySelector('.dragging-bookmark');
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
                if (this.gridEl.querySelector('.dragging-bookmark')) {
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
                        await bookmarkLabelService.updateOrders(this.uid, this.workspaceId, newOrderIds);
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
        const draggableElements = [...container.querySelectorAll('.bookmark-card:not(.dragging-bookmark)')];
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
        const btnShowAdd = document.getElementById('btn-show-add-bookmark-label');
        const popover = document.getElementById('add-bookmark-label-popover');
        const inputName = document.getElementById('new-bookmark-label-name');
        const inputColor = document.getElementById('new-bookmark-label-color');
        const btnSave = document.getElementById('btn-save-bookmark-label');
        const btnCancel = document.getElementById('btn-cancel-bookmark-label');

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
                        await bookmarkLabelService.create(this.uid, this.workspaceId, name, color);
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
                            await bookmarkLabelService.update(this.uid, this.workspaceId, lid, { isParked: true });
                        } catch (err) {
                            console.error("Failed to park label:", err);
                        }
                    }
                }
            }, { signal });
        }

        // Sidebar navigation - Bookmarks tab
        const btnNavBookmarks = document.getElementById('btn-nav-bookmarks');
        if (btnNavBookmarks) {
            btnNavBookmarks.addEventListener('click', (e) => {
                e.preventDefault();
                this.activateBookmarksView();
            }, { signal });
        }

        // Search
        const searchInput = document.getElementById('bookmark-search');
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
        const zoomSlider = document.getElementById('bookmark-zoom-slider');
        if (zoomSlider && this.gridEl) {
            const savedZoom = localStorage.getItem('bookmarkGridZoom') || '1';
            zoomSlider.value = savedZoom;
            this.gridEl.style.zoom = savedZoom;

            zoomSlider.addEventListener('input', (e) => {
                const zoomVal = e.target.value;
                this.gridEl.style.zoom = zoomVal;
                localStorage.setItem('bookmarkGridZoom', zoomVal);
            }, { signal });
        }

        // ── Add Bookmark button (top bar) ──
        const btnCreateBookmark = document.getElementById('btn-topbar-create-bookmark');
        if (btnCreateBookmark) {
            btnCreateBookmark.addEventListener('click', () => {
                if (window.currentBookmarkModal) {
                    window.currentBookmarkModal.open(null);
                }
            }, { signal });
        }

        // ── Labels visibility toggle ──
        const btnToggleLabels = document.getElementById('btn-toggle-bookmark-labels');
        const labelsContainer = document.getElementById('bookmark-parked-labels-container');
        const labelsToggleIcon = document.getElementById('bookmark-labels-toggle-icon');

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

        // Restore saved state (default: visible)
        const savedLabelsVisible = localStorage.getItem('bookmarkLabelsVisible');
        this._labelsVisible = savedLabelsVisible === null ? true : savedLabelsVisible === 'true';
        applyLabelsVisibility(this._labelsVisible);

        if (btnToggleLabels) {
            btnToggleLabels.addEventListener('click', () => {
                this._labelsVisible = !this._labelsVisible;
                localStorage.setItem('bookmarkLabelsVisible', this._labelsVisible);
                applyLabelsVisibility(this._labelsVisible);
            }, { signal });
        }

        // Cross-bucket move/add modal
        const moveModal = document.getElementById('bookmark-move-modal');
        const btnMoveClose = document.getElementById('btn-bookmark-move-close');
        const btnMoveMove = document.getElementById('btn-bookmark-move-move');
        const btnMoveAdd = document.getElementById('btn-bookmark-move-add');

        const closeMoveModal = () => {
            if (moveModal) moveModal.classList.remove('active');
            this.pendingMoveAdd = null;
            this.render();
        };

        if (btnMoveClose) btnMoveClose.addEventListener('click', closeMoveModal, { signal });

        if (btnMoveMove) {
            btnMoveMove.addEventListener('click', async () => {
                if (!this.pendingMoveAdd) return;
                const { bookmarkId, sourceLabelId, targetLabelId, targetCardIds } = this.pendingMoveAdd;
                const bm = this.bookmarks.find(b => b.id === bookmarkId);

                if (bm) {
                    const newLabels = bm.labels.filter(l => l !== sourceLabelId);
                    if (!newLabels.includes(targetLabelId)) newLabels.push(targetLabelId);

                    const newOrder = { ...bm.order };
                    delete newOrder[sourceLabelId];

                    bm.labels = newLabels;
                    bm.order = newOrder;

                    const updates = targetCardIds.map((id, index) => {
                        if (id === bookmarkId) {
                            newOrder[targetLabelId] = index;
                            return bookmarkService.update(this.uid, this.workspaceId, bookmarkId, { labels: newLabels, order: newOrder });
                        }
                        const current = this.bookmarks.find(b => b.id === id);
                        if (current) {
                            const ord = { ...current.order };
                            ord[targetLabelId] = index;
                            current.order = ord;
                            return bookmarkService.update(this.uid, this.workspaceId, id, { order: ord });
                        }
                        return Promise.resolve();
                    });

                    try { await Promise.all(updates); } catch (e) { console.error('Failed to move bookmark:', e); }
                }
                closeMoveModal();
            }, { signal });
        }

        if (btnMoveAdd) {
            btnMoveAdd.addEventListener('click', async () => {
                if (!this.pendingMoveAdd) return;
                const { bookmarkId, targetLabelId, targetCardIds } = this.pendingMoveAdd;
                const bm = this.bookmarks.find(b => b.id === bookmarkId);

                if (bm) {
                    const newLabels = [...bm.labels];
                    if (!newLabels.includes(targetLabelId)) newLabels.push(targetLabelId);

                    const newOrder = { ...bm.order };
                    bm.labels = newLabels;
                    bm.order = newOrder;

                    const updates = targetCardIds.map((id, index) => {
                        if (id === bookmarkId) {
                            newOrder[targetLabelId] = index;
                            return bookmarkService.update(this.uid, this.workspaceId, bookmarkId, { labels: newLabels, order: newOrder });
                        }
                        const current = this.bookmarks.find(b => b.id === id);
                        if (current) {
                            const ord = { ...current.order };
                            ord[targetLabelId] = index;
                            current.order = ord;
                            return bookmarkService.update(this.uid, this.workspaceId, id, { order: ord });
                        }
                        return Promise.resolve();
                    });

                    try { await Promise.all(updates); } catch (e) { console.error('Failed to add bookmark:', e); }
                }
                closeMoveModal();
            }, { signal });
        }
    }

    activateBookmarksView() {
        // Deactivate all nav items
        const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
        navItems.forEach(item => item.classList.remove('active'));

        // Activate bookmarks nav
        const btnNavBookmarks = document.getElementById('btn-nav-bookmarks');
        if (btnNavBookmarks) btnNavBookmarks.classList.add('active');

        // Hide all board containers
        const containers = ['main-board-container', 'completed-board-container', 'archive-board-container', 'bookmark-board-container'];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.classList.remove('active');
            }
        });

        // Show bookmark container
        const bmContainer = document.getElementById('bookmark-board-container');
        if (bmContainer) {
            bmContainer.style.display = 'flex';
            bmContainer.classList.add('active');
        }

        // Hide left column (calendar)
        const leftColumn = document.querySelector('.left-column');
        if (leftColumn) leftColumn.style.display = 'none';

        // Swap top bar groups: hide task controls, show bookmark controls
        const taskTopbarGroup = document.getElementById('task-topbar-group');
        if (taskTopbarGroup) taskTopbarGroup.style.display = 'none';

        const bookmarkTopbarGroup = document.getElementById('bookmark-topbar-group');
        if (bookmarkTopbarGroup) bookmarkTopbarGroup.style.display = 'flex';

        // Hide global search (bookmarks has its own in the bookmark-topbar-group)
        const globalSearch = document.querySelector('.top-bar .search-container:not(#bookmark-topbar-group .search-container)');
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
        const container = document.getElementById('bookmark-parked-labels-container');
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
                    await bookmarkLabelService.update(this.uid, this.workspaceId, label.id, { isParked: false });
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
