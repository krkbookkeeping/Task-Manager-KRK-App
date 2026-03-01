import { db } from '../firebase-config.js';
import { collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp, query, deleteDoc, updateDoc, getDocs, writeBatch } from 'firebase/firestore';

// References: users/{uid}/workspaces/{wid}/notes/{nid}

export const noteService = {
    getCollectionRef(uid, wid) {
        return collection(db, 'users', uid, 'workspaces', wid, 'notes');
    },

    async getNote(uid, wid, nid) {
        const noteRef = doc(db, 'users', uid, 'workspaces', wid, 'notes', nid);
        const snapshot = await getDoc(noteRef);
        if (snapshot.exists()) {
            return snapshot.data();
        }
        return null;
    },

    async getAllNotes(uid, wid) {
        const snapshot = await getDocs(this.getCollectionRef(uid, wid));
        return snapshot.docs.map(doc => doc.data());
    },

    async create(uid, wid, name, labelId = null) {
        const noteRef = doc(this.getCollectionRef(uid, wid));
        const data = {
            id: noteRef.id,
            name,
            labels: labelId ? [labelId] : [],
            order: {},
            comments: [],
            createdAt: serverTimestamp()
        };

        if (labelId) {
            data.order[labelId] = Date.now();
        }

        await setDoc(noteRef, data);
        return data;
    },

    async update(uid, wid, nid, updates) {
        const noteRef = doc(db, 'users', uid, 'workspaces', wid, 'notes', nid);
        await updateDoc(noteRef, updates);
    },

    async delete(uid, wid, nid) {
        const noteRef = doc(db, 'users', uid, 'workspaces', wid, 'notes', nid);
        await deleteDoc(noteRef);
    },

    async migrateNotesToLabel(uid, wid, fromLabelId, toLabelId) {
        const snapshot = await getDocs(this.getCollectionRef(uid, wid));
        const batch = writeBatch(db);
        let count = 0;

        snapshot.docs.forEach(docSnap => {
            const note = docSnap.data();
            if (note.labels && note.labels.includes(fromLabelId)) {
                const newLabels = note.labels.map(l => l === fromLabelId ? toLabelId : l);
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
            const notes = snapshot.docs.map(doc => doc.data());
            callback(notes);
        });
    }
};
