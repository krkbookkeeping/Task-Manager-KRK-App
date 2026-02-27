import { db } from '../firebase-config.js';
import { collection, doc, setDoc, getDocs, onSnapshot, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';

// References: users/{uid}/workspaces/{wid}/boards/{bid}

export const boardService = {
    getCollectionRef(uid, wid) {
        return collection(db, 'users', uid, 'workspaces', wid, 'boards');
    },

    async create(uid, wid, name, description = '', color = '#6366f1') {
        const boardRef = doc(this.getCollectionRef(uid, wid));
        const data = {
            id: boardRef.id,
            name,
            description,
            color,
            order: Date.now(),
            archived: false,
            createdAt: serverTimestamp()
        };
        await setDoc(boardRef, data);
        return data;
    },

    subscribe(uid, wid, callback) {
        const q = query(this.getCollectionRef(uid, wid), orderBy('order', 'asc'));
        return onSnapshot(q, (snapshot) => {
            const boards = snapshot.docs.map(doc => doc.data());
            callback(boards);
        });
    },

    async getAllUnarchived(uid, wid) {
        const q = query(this.getCollectionRef(uid, wid), orderBy('order', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data()).filter(b => !b.archived);
    }
};
