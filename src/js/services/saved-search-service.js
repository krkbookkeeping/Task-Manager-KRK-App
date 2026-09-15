import { db } from '../firebase-config.js';
import { collection, doc, setDoc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc, writeBatch } from 'firebase/firestore';

// References: users/{uid}/workspaces/{wid}/savedSearches/{searchId}
export const savedSearchService = {
    getCollectionRef(uid, wid) {
        return collection(db, 'users', uid, 'workspaces', wid, 'savedSearches');
    },

    async create(uid, wid, savedSearch) {
        const searchRef = doc(this.getCollectionRef(uid, wid));
        const data = {
            id: searchRef.id,
            ...savedSearch,
            order: Date.now(),
            createdAt: serverTimestamp()
        };
        await setDoc(searchRef, data);
        return data;
    },

    async delete(uid, wid, searchId) {
        await deleteDoc(doc(db, 'users', uid, 'workspaces', wid, 'savedSearches', searchId));
    },

    async updateOrders(uid, wid, orderedSearchIds) {
        const batch = writeBatch(db);
        orderedSearchIds.forEach((searchId, index) => {
            batch.update(doc(db, 'users', uid, 'workspaces', wid, 'savedSearches', searchId), { order: index * 100 });
        });
        await batch.commit();
    },

    subscribe(uid, wid, callback) {
        const searches = query(this.getCollectionRef(uid, wid), orderBy('order', 'asc'));
        return onSnapshot(searches, (snapshot) => callback(snapshot.docs.map(doc => doc.data())));
    }
};
