// Seeds the Firebase Emulator Suite for the cross-repo round-trip E2E: a nurse and a doctor
// (auth users + role claims + users/{uid} docs), an HA-filler catalog product, and an active
// cooperation relationship between them (so the nurse's request UI can address the doctor). Uses
// the Admin SDK, which bypasses security rules — the emulators must be running (see README.md).
// Called from global-setup.ts; not a standalone script (Playwright transpiles this module).
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const PROJECT_ID = "aestheticx-91e6b";
export const PASSWORD = "E2epass!23";
export const NURSE = { uid: "e2e-nurse", email: "nurse@e2e.test", name: "Nina Nurse" };
export const DOCTOR = { uid: "e2e-doctor", email: "doctor@e2e.test", name: "Dr Dana Approver" };
export const COOP_ID = "coop-e2e";
export const PRODUCT = { id: "voluma-e2e", name: "Voluma" };

function ensureEmulatorEnv() {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.GCLOUD_PROJECT ??= PROJECT_ID;
}

function app() {
  return getApps().length ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
}

type Acct = { uid: string; email: string; name: string };

async function upsertUser(
  auth: ReturnType<typeof getAuth>,
  db: ReturnType<typeof getFirestore>,
  u: Acct,
  roles: string[],
) {
  try {
    await auth.getUser(u.uid);
    await auth.updateUser(u.uid, { email: u.email, password: PASSWORD, displayName: u.name });
  } catch {
    await auth.createUser({ uid: u.uid, email: u.email, password: PASSWORD, displayName: u.name, emailVerified: true });
  }
  // Role claims the web client reads (identitiesFromClaims: roles[] + clinics{}). No
  // mustChangePassword claim → no first-login gate.
  await auth.setCustomUserClaims(u.uid, { roles, clinics: {} });
  await db.doc(`users/${u.uid}`).set({ name: u.name, roles }, { merge: true });
}

export async function seed() {
  ensureEmulatorEnv();
  const auth = getAuth(app());
  const db = getFirestore(app());

  await upsertUser(auth, db, NURSE, ["nurse"]);
  await upsertUser(auth, db, DOCTOR, ["doctor"]);

  // Catalog product for the nurse's live-mode request picker; HA filler so approval also grants
  // the standing hyaluronidase emergency authorisation.
  await db.doc(`products/${PRODUCT.id}`).set({
    name: PRODUCT.name, category: "haFiller", brand: "Juvederm", unit: "millilitres", isActive: true,
  });

  // Active cooperation so the nurse may raise a request to this doctor (mapCooperationRelationship).
  await db.doc(`cooperationRelationships/${COOP_ID}`).set({
    doctorId: DOCTOR.uid,
    doctorName: DOCTOR.name,
    counterpartyType: "nurse",
    counterpartyId: NURSE.uid,
    counterpartyName: NURSE.name,
    status: "active",
    authRequestsAllowed: true,
    invoiceApplies: true,
    priceCentsOverride: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { NURSE, DOCTOR, PASSWORD, COOP_ID, PRODUCT };
}
