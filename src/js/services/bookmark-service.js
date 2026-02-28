import { db } from '../firebase-config.js';
import { collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp, query, deleteDoc, updateDoc, getDocs, writeBatch } from 'firebase/firestore';

// References: users/{uid}/workspaces/{wid}/bookmarks/{bmid}

export const bookmarkService = {
    getCollectionRef(uid, wid) {
        return collection(db, 'users', uid, 'workspaces', wid, 'bookmarks');
    },

    async getBookmark(uid, wid, bmid) {
        const bmRef = doc(db, 'users', uid, 'workspaces', wid, 'bookmarks', bmid);
        const snapshot = await getDoc(bmRef);
        if (snapshot.exists()) {
            return snapshot.data();
        }
        return null;
    },

    async create(uid, wid, name, labelId = null) {
        const bmRef = doc(this.getCollectionRef(uid, wid));
        const data = {
            id: bmRef.id,
            name,
            url: '',
            notes: '',
            labels: labelId ? [labelId] : [],
            order: {},
            createdAt: serverTimestamp()
        };

        if (labelId) {
            data.order[labelId] = Date.now();
        }

        await setDoc(bmRef, data);
        return data;
    },

    async update(uid, wid, bmid, updates) {
        const bmRef = doc(db, 'users', uid, 'workspaces', wid, 'bookmarks', bmid);
        await updateDoc(bmRef, updates);
    },

    async delete(uid, wid, bmid) {
        const bmRef = doc(db, 'users', uid, 'workspaces', wid, 'bookmarks', bmid);
        await deleteDoc(bmRef);
    },

    async migrateBookmarksToLabel(uid, wid, fromLabelId, toLabelId) {
        const snapshot = await getDocs(this.getCollectionRef(uid, wid));
        const batch = writeBatch(db);
        let count = 0;

        snapshot.docs.forEach(docSnap => {
            const bm = docSnap.data();
            if (bm.labels && bm.labels.includes(fromLabelId)) {
                const newLabels = bm.labels.map(l => l === fromLabelId ? toLabelId : l);
                batch.update(docSnap.ref, { labels: newLabels });
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
        }
        return count;
    },

    subscribe(uid, wid, callback) {
        const q = query(this.getCollectionRef(uid, wid));
        return onSnapshot(q, (snapshot) => {
            const bookmarks = snapshot.docs.map(doc => doc.data());
            callback(bookmarks);
        });
    }
};
