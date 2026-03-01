import { db } from '../firebase-config.js';
import { collection, doc, setDoc, getDocs, onSnapshot, serverTimestamp, query, orderBy, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';

// References: users/{uid}/workspaces/{wid}/noteLabels/{lid}

export const noteLabelService = {
    getCollectionRef(uid, wid) {
        return collection(db, 'users', uid, 'workspaces', wid, 'noteLabels');
    },

    async create(uid, wid, name, color = '#6366f1') {
        const labelRef = doc(this.getCollectionRef(uid, wid));
        const data = {
            id: labelRef.id,
            name,
            color,
            order: Date.now(),
            createdAt: serverTimestamp()
        };
        await setDoc(labelRef, data);
        return data;
    },

    async update(uid, wid, lid, updates) {
        const labelRef = doc(db, 'users', uid, 'workspaces', wid, 'noteLabels', lid);
        await updateDoc(labelRef, updates);
    },

    async updateOrders(uid, wid, orderedLabelIds) {
        const batch = writeBatch(db);
        orderedLabelIds.forEach((lid, index) => {
            const labelRef = doc(db, 'users', uid, 'workspaces', wid, 'noteLabels', lid);
            batch.update(labelRef, { order: index * 100 });
        });
        await batch.commit();
    },

    async delete(uid, wid, lid) {
        const labelRef = doc(db, 'users', uid, 'workspaces', wid, 'noteLabels', lid);
        await deleteDoc(labelRef);
    },

    async ensureNoLabelExists(uid, wid) {
        const snapshot = await getDocs(this.getCollectionRef(uid, wid));
        const existing = snapshot.docs.map(d => d.data()).find(l => l.isSystem === true);
        if (existing) return existing.id;

        const labelRef = doc(this.getCollectionRef(uid, wid));
        const data = {
            id: labelRef.id,
            name: 'No Label',
            color: '#9ca3af',
            order: Number.MAX_SAFE_INTEGER,
            isSystem: true,
            createdAt: serverTimestamp()
        };
        await setDoc(labelRef, data);
        return data.id;
    },

    subscribe(uid, wid, callback) {
        const q = query(this.getCollectionRef(uid, wid), orderBy('order', 'asc'));
        return onSnapshot(q, (snapshot) => {
            const labels = snapshot.docs.map(doc => doc.data());
            callback(labels);
        });
    }
};
