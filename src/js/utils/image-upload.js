import { storage } from '../firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Upload an image File to Firebase Storage and return its public download URL.
 * Path: users/{uid}/images/{timestamp}_{random}.{ext}
 */
export async function uploadImage(uid, file) {
    const ext = file.type.split('/')[1] || 'png';
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storageRef = ref(storage, `users/${uid}/images/${filename}`);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
}
