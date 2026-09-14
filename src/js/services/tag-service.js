import { db } from '../firebase-config.js';
import { collection, doc, setDoc, onSnapshot, serverTimestamp, deleteDoc, updateDoc } from 'firebase/firestore';

// References: users/{uid}/workspaces/{wid}/tags/{tagId}
export const tagService = {
    getCollectionRef(uid, wid) {
        return collection(db, 'users', uid, 'workspaces', wid, 'tags');
    },

    async create(uid, wid, name, color = '#0ea5e9') {
        const tagRef = doc(this.getCollectionRef(uid, wid));
        const data = { id: tagRef.id, name, color, order: Date.now(), createdAt: serverTimestamp() };
        await setDoc(tagRef, data);
        return data;
    },

    async update(uid, wid, tagId, updates) {
        await updateDoc(doc(db, 'users', uid, 'workspaces', wid, 'tags', tagId), updates);
    },

    async delete(uid, wid, tagId) {
        await deleteDoc(doc(db, 'users', uid, 'workspaces', wid, 'tags', tagId));
    },

    subscribe(uid, wid, callback) {
        // Keep this unfiltered: Firestore orderBy omits older documents that do
        // not have an order field, which made valid existing tags invisible.
        return onSnapshot(this.getCollectionRef(uid, wid), snapshot => {
            callback(snapshot.docs.map(item => item.data()).sort((a, b) => {
                const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
                const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
                return orderA - orderB || (a.name || '').localeCompare(b.name || '');
            }));
        }, error => console.error('Failed to load task tags:', error));
    }
};
