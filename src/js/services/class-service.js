import { db } from '../firebase-config.js';
import { collection, doc, setDoc, onSnapshot, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// References: users/{uid}/workspaces/{wid}/classes/{classId}
export const classService = {
    getCollectionRef(uid, wid) {
        return collection(db, 'users', uid, 'workspaces', wid, 'classes');
    },

    async create(uid, wid, name, color = '#8b5cf6') {
        const classRef = doc(this.getCollectionRef(uid, wid));
        const data = { id: classRef.id, name, color, order: Date.now(), createdAt: serverTimestamp() };
        await setDoc(classRef, data);
        return data;
    },

    async update(uid, wid, classId, updates) {
        await updateDoc(doc(db, 'users', uid, 'workspaces', wid, 'classes', classId), updates);
    },

    async delete(uid, wid, classId) {
        await deleteDoc(doc(db, 'users', uid, 'workspaces', wid, 'classes', classId));
    },

    subscribe(uid, wid, callback) {
        return onSnapshot(this.getCollectionRef(uid, wid), snapshot => {
            callback(snapshot.docs.map(item => item.data()).sort((a, b) => {
                const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
                const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
                return orderA - orderB || (a.name || '').localeCompare(b.name || '');
            }));
        }, error => console.error('Failed to load task classes:', error));
    }
};
