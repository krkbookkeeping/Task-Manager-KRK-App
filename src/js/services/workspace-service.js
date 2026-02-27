import { db } from '../firebase-config.js';
import { collection, doc, setDoc, getDoc, getDocs, onSnapshot, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';

// References: users/{uid}/workspaces/{wid}

export const workspaceService = {
    // Get a reference to the workspaces collection for a specific user
    getCollectionRef(uid) {
        return collection(db, 'users', uid, 'workspaces');
    },

    // Create a new workspace
    async create(uid, name, settings = {}) {
        const wsRef = doc(this.getCollectionRef(uid)); // Auto ID
        const data = {
            id: wsRef.id,
            name: name,
            order: Date.now(),
            settings: {
                theme: 'light',
                collapseEmpty: false,
                crossBucketDefault: 'move',
                ...settings
            },
            createdAt: serverTimestamp()
        };
        await setDoc(wsRef, data);
        return data;
    },

    // Subscribe to all workspaces for a user
    subscribe(uid, callback) {
        const q = query(this.getCollectionRef(uid), orderBy('order', 'asc'));
        return onSnapshot(q, (snapshot) => {
            const workspaces = snapshot.docs.map(doc => doc.data());
            callback(workspaces);
        });
    },

    // Get all initial workspaces once (useful for initialization checks)
    async getAll(uid) {
        const q = query(this.getCollectionRef(uid), orderBy('order', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    }
};
