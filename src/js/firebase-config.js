import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA1XoWOiFCeoc5M0iO13EA3b26qhMyPdhw",
  authDomain: "task-manager-app-krk.firebaseapp.com",
  projectId: "task-manager-app-krk",
  storageBucket: "task-manager-app-krk.firebasestorage.app",
  messagingSenderId: "913306252590",
  appId: "1:913306252590:web:9153b4f33a0476a691b6bf",
  measurementId: "G-7HP7L0Z2LJ"
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);
