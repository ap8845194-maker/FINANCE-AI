// Firebase configuration for the FinAI frontend.
// This file contains the public Firebase Web App config, not a private service-account key.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc
 } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBYyMi85OA_HpT9Ws6DLutV1K-eDYvylYw",
    authDomain: "aiml-76965.firebaseapp.com",
    projectId: "aiml-76965",
    storageBucket: "aiml-76965.firebasestorage.app",
    messagingSenderId: "945292974698",
    appId: "1:945292974698:web:39c7cef631331c1f774813",
    measurementId: "G-GQ892JJZQL"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Re-export the Firebase functions used by script.js.
export {
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged,
    updateProfile,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    ref,
    uploadBytes,
    getDownloadURL
};

// Ask Google for the basic profile fields used by the app's user document.
googleProvider.addScope("profile");
googleProvider.addScope("email");
