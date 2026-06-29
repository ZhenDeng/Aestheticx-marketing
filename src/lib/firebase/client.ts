// Lazy Firebase init. Only touches the SDK when config is present, so DEMO mode
// (no env config) never loads or connects Firebase. Mirrors the iOS LiveBackend's
// "configured account" gate.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

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

export function appCheckSiteKey(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY ?? "";
}
export function isAppCheckConfigured(): boolean {
  return appCheckSiteKey().length > 0;
}

let app: FirebaseApp | undefined;
let appCheckStarted = false;

function startAppCheck(instance: FirebaseApp): void {
  if (appCheckStarted || typeof window === "undefined" || !isAppCheckConfigured()) return;
  appCheckStarted = true;
  // Dev-only debug token: prints a token to register under App Check → debug tokens.
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG === "true") {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  initializeAppCheck(instance, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey()),
    isTokenAutoRefreshEnabled: true,
  });
}

function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) throw new Error("Firebase is not configured");
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig());
  startAppCheck(app);
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
export function firestore(): Firestore {
  return getFirestore(getFirebaseApp());
}
// All Cloud Functions are pinned to australia-southeast1 (data residency; see
// backend globalOptions.ts and the iOS client). The web client must target the
// same region or every callable resolves to the wrong (default) region.
const FUNCTIONS_REGION = "australia-southeast1";
export function functions(): Functions {
  return getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
}
export function storage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}
