import { db } from '../firebase-config.js';
import { collection, doc, setDoc, getDocs, getDoc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

// References: users/{uid}/workspaces/{wid}/boards/{bid}/tasks/{tid}

export const taskService = {
    getCollectionRef(uid, wid, bid) {
        return collection(db, 'users', uid, 'workspaces', wid, 'boards', bid, 'tasks');
    },

    async getTask(uid, wid, bid, tid) {
        const taskRef = doc(db, 'users', uid, 'workspaces', wid, 'boards', bid, 'tasks', tid);
        const snapshot = await getDoc(taskRef);
        if (snapshot.exists()) {
            return snapshot.data();
        }
        return null;
    },

    async create(uid, wid, bid, title, labelId = null) {
        const taskRef = doc(this.getCollectionRef(uid, wid, bid));
        const data = {
            id: taskRef.id,
            title,
            description: '',
            dueDate: null,
            labels: labelId ? [labelId] : [],
            pinned: {},       // Record of { labelId: boolean } if pinned
            order: {},        // Record of { labelId: integer } for drag-drop ordering
            completed: false,
            completedAt: null,
            archived: false,
            archivedAt: null,
            createdAt: serverTimestamp()
        };

        // Give it a default order in its primary label bucket
        if (labelId) {
            data.order[labelId] = Date.now();
        }

        await setDoc(taskRef, data);
        return data;
    },

    async getAllTasks(uid, wid, bid) {
        const snapshot = await getDocs(this.getCollectionRef(uid, wid, bid));
        return snapshot.docs.map(doc => doc.data());
    },

    async update(uid, wid, bid, tid, updates) {
        const taskRef = doc(db, 'users', uid, 'workspaces', wid, 'boards', bid, 'tasks', tid);
        await updateDoc(taskRef, updates);
    },

    async delete(uid, wid, bid, tid) {
        const taskRef = doc(db, 'users', uid, 'workspaces', wid, 'boards', bid, 'tasks', tid);
        await deleteDoc(taskRef);
    },

    async archive(uid, wid, bid, tid) {
        const taskRef = doc(db, 'users', uid, 'workspaces', wid, 'boards', bid, 'tasks', tid);
        await updateDoc(taskRef, {
            archived: true,
            archivedAt: serverTimestamp()
        });
    },

    async unarchive(uid, wid, bid, tid) {
        const taskRef = doc(db, 'users', uid, 'workspaces', wid, 'boards', bid, 'tasks', tid);
        await updateDoc(taskRef, {
            archived: false,
            archivedAt: null
        });
    },

    async deleteOldArchivedTasks(uid, wid, bid, monthsOld) {
        const tasksRef = this.getCollectionRef(uid, wid, bid);

        // Calculate the cutoff date
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);

        // We can't query by timestamp easily if it's not indexed nicely with boolean, 
        // so we fetch all archived tasks and filter client-side since this is an admin/manual action
        const q = query(tasksRef, where('archived', '==', true));
        const snapshot = await getDocs(q);

        let deletedCount = 0;
        const batch = writeBatch(db);
        let batchCount = 0;

        snapshot.docs.forEach(docSnap => {
            const data = docSnap.data();
            if (data.archivedAt && data.archivedAt.toDate) {
                const archivedDate = data.archivedAt.toDate();
                if (archivedDate < cutoffDate) {
                    batch.delete(docSnap.ref);
                    deletedCount++;
                    batchCount++;
                }
            } else if (data.archivedAt === null || data.archivedAt === undefined) {
                // Failsafe for corrupted tasks that are archived but lack a timestamp, assume old
                batch.delete(docSnap.ref);
                deletedCount++;
                batchCount++;
            }
        });

        if (batchCount > 0) {
            await batch.commit();
        }

        return deletedCount;
    },

    // Migrate all tasks from one label to another (used when deleting a label)
    async migrateTasksToLabel(uid, wid, bid, fromLabelId, toLabelId) {
        const snapshot = await getDocs(this.getCollectionRef(uid, wid, bid));
        const batch = writeBatch(db);
        let count = 0;

        snapshot.docs.forEach(docSnap => {
            const task = docSnap.data();
            if (task.labels && task.labels.includes(fromLabelId)) {
                const newLabels = task.labels.map(l => l === fromLabelId ? toLabelId : l);
                batch.update(docSnap.ref, { labels: newLabels });
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
        }
        return count;
    },

    // Subscribe to all ACTIVE tasks for a board
    subscribeActive(uid, wid, bid, callback) {
        const q = query(
            this.getCollectionRef(uid, wid, bid),
            where('completed', '==', false),
            where('archived', '==', false)
        );
        return onSnapshot(q, (snapshot) => {
            const tasks = snapshot.docs.map(doc => doc.data());
            // Client-side sort by order logic is usually needed because multiple labels makes index complex
            callback(tasks);
        });
    },

    // Subscribe to all COMPLETED tasks for a board
    subscribeCompleted(uid, wid, bid, callback) {
        const q = query(
            this.getCollectionRef(uid, wid, bid),
            where('completed', '==', true),
            where('archived', '==', false) // Make sure completed tasks aren't in archive view optionally, but the user spec just says 'completed = true'. Let's ensure archived tasks are hidden from completed view as well.
        );
        return onSnapshot(q, (snapshot) => {
            const tasks = snapshot.docs.map(doc => doc.data());
            // Sort by completedAt descending inside the callback or service
            tasks.sort((a, b) => {
                const getMillis = (val) => {
                    if (!val) return 0;
                    if (typeof val.toMillis === 'function') return val.toMillis();
                    return new Date(val).getTime() || 0;
                };
                return getMillis(b.completedAt) - getMillis(a.completedAt);
            });
            callback(tasks);
        });
    },

    // Subscribe to all ARCHIVED tasks for a board
    subscribeArchived(uid, wid, bid, callback) {
        const q = query(
            this.getCollectionRef(uid, wid, bid),
            where('archived', '==', true)
        );
        return onSnapshot(q, (snapshot) => {
            const tasks = snapshot.docs.map(doc => doc.data());
            // Sort by archivedAt descending
            tasks.sort((a, b) => {
                const timeA = a.archivedAt?.toMillis() || 0;
                const timeB = b.archivedAt?.toMillis() || 0;
                return timeB - timeA;
            });
            callback(tasks);
        });
    }
};
