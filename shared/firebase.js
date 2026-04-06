import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

export function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
}

export function isFirebaseConfigured() {
  const config = getFirebaseConfig();
  return Boolean(config.apiKey && config.projectId && config.appId);
}

let cachedApp = null;
let cachedDb = null;

export function getFirebaseApp() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase config is missing. Set the Vite Firebase env variables first.');
  }
  if (!cachedApp) {
    cachedApp = initializeApp(getFirebaseConfig());
  }
  return cachedApp;
}

export function getFirebaseDb() {
  if (!cachedDb) {
    cachedDb = getFirestore(getFirebaseApp());
  }
  return cachedDb;
}
