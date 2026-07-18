// Lazy Firebase init. Only touches the SDK when config is present, so DEMO mode
// (no env config) never loads or connects Firebase. Mirrors the iOS LiveBackend's
// "configured account" gate.
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator, type Functions } from "firebase/functions";
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

// Local Firebase Emulator Suite wiring, OFF unless NEXT_PUBLIC_FIREBASE_EMULATORS === "true".
// Used only by the cross-repo E2E harness (e2e-emulator/) to drive the real backend Cloud
// Functions against local auth/firestore/functions emulators. Each service connects once.
const USE_EMULATORS = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "true";
const EMU_HOST = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST ?? "127.0.0.1";
let authEmuConnected = false, fsEmuConnected = false, fnEmuConnected = false;

export function firebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  if (USE_EMULATORS && !authEmuConnected) {
    authEmuConnected = true;
    connectAuthEmulator(auth, `http://${EMU_HOST}:9099`, { disableWarnings: true });
  }
  return auth;
}
export function firestore(): Firestore {
  const db = getFirestore(getFirebaseApp());
  if (USE_EMULATORS && !fsEmuConnected) {
    fsEmuConnected = true;
    connectFirestoreEmulator(db, EMU_HOST, 8080);
  }
  return db;
}
// All Cloud Functions are pinned to australia-southeast1 (data residency; see
// backend globalOptions.ts and the iOS client). The web client must target the
// same region or every callable resolves to the wrong (default) region.
const FUNCTIONS_REGION = "australia-southeast1";
export function functions(): Functions {
  const fn = getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
  if (USE_EMULATORS && !fnEmuConnected) {
    fnEmuConnected = true;
    connectFunctionsEmulator(fn, EMU_HOST, 5001);
  }
  return fn;
}
export function storage(): FirebaseStorage {
  return getStorage(getFirebaseApp());
}
