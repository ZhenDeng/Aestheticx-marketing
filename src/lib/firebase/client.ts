// Lazy Firebase init. Only touches the SDK when config is present, so DEMO mode
// (no env config) never loads or connects Firebase. Mirrors the iOS LiveBackend's
// "configured account" gate.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function firebaseConfig(): FirebaseConfig {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
}

export function isFirebaseConfigured(): boolean {
  return Object.values(firebaseConfig()).every((v) => v.length > 0);
}

let app: FirebaseApp | undefined;
function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured");
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig());
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
export function firestore(): Firestore {
  return getFirestore(getFirebaseApp());
}
export function functions(): Functions {
  return getFunctions(getFirebaseApp());
}
