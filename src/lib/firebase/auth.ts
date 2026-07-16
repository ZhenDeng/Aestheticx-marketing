"use client";

import {
  signInWithEmailAndPassword, signOut as fbSignOut, onIdTokenChanged,
  updatePassword, setPersistence, browserLocalPersistence, browserSessionPersistence,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseAuth, firestore, functions } from "./client";
import { identitiesFromClaims, type DemoClaims } from "./identity";
import type { Identity } from "@/lib/demo/types";

// remember=true (the historical default) keeps the session across browser restarts;
// false scopes it to the tab session. Persistence must be set BEFORE the credential
// sign-in or Firebase applies it only from the next sign-in onwards.
export async function signInWithPassword(email: string, password: string, remember = true): Promise<void> {
  const auth = firebaseAuth();
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser(): Promise<void> {
  await fbSignOut(firebaseAuth());
}

// Resolve the signed-in user's identities from custom claims + their users/{uid} doc.
export async function identitiesForUser(user: User): Promise<Identity[]> {
  const tokenResult = await user.getIdTokenResult();
  const raw = tokenResult.claims as Record<string, unknown>;
  const rawClinics = raw.clinics;
  const claims: DemoClaims = {
    uid: user.uid,
    roles: Array.isArray(raw.roles) ? (raw.roles as string[]).filter((r) => typeof r === "string") : [],
    clinics:
      rawClinics && typeof rawClinics === "object" && !Array.isArray(rawClinics)
        ? (rawClinics as Record<string, string>)
        : {},
  };
  let userDoc: { name?: string } | null = null;
  try {
    const snap = await getDoc(doc(firestore(), "users", user.uid));
    userDoc = snap.exists() ? (snap.data() as { name?: string }) : null;
  } catch {
    userDoc = null; // name falls back to claim/email; not fatal for sign-in
  }
  return identitiesFromClaims(claims, userDoc);
}

// Subscribe to auth state; calls back with the User (or null when signed out).
export function watchUser(cb: (user: User | null) => void): () => void {
  return onIdTokenChanged(firebaseAuth(), cb);
}

// The first-login gate, carried on the ID token's custom claims exactly as iOS reads it
// (AuthClaims.parse → mustChangePassword). Set by the createUser Function on super-admin-
// created accounts; cleared by completeFirstLogin.
export async function mustChangePasswordForUser(user: User): Promise<boolean> {
  const tokenResult = await user.getIdTokenResult();
  return tokenResult.claims.mustChangePassword === true;
}

// Thrown by completeFirstLogin when the password update SUCCEEDED but the follow-up
// confirmation (the completeFirstLogin callable / token refresh) failed. Callers key
// off `error.name` to tell the user their new password is already set and a retry of
// the whole flow (updatePassword with the same password is a no-op) will finish it.
export class FirstLoginConfirmError extends Error {
  constructor(cause: unknown) {
    super("Password was set, but confirming first-login completion with the server failed", { cause });
    this.name = "FirstLoginConfirmError";
  }
}

// First-login completion (iOS FirstLoginPasswordView flow): set the real password on the
// Auth record, then call the deployed completeFirstLogin callable (no payload; returns
// { ok: true }) which clears the claim + users/{uid}.mustChangePassword, then force-refresh
// the token so the cleared claim lands locally. Failures after the password update are
// rethrown as FirstLoginConfirmError so the UI can distinguish "password not set" from
// "password set, confirmation pending".
export async function completeFirstLogin(newPassword: string): Promise<void> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error("Not signed in");
  await updatePassword(user, newPassword);
  try {
    await httpsCallable(functions(), "completeFirstLogin")({});
    await user.getIdToken(true);
  } catch (error) {
    throw new FirstLoginConfirmError(error);
  }
}

// Force a fresh ID token so newly-set custom claims land locally (16/07 feedback bug 1).
// Custom claims reach the client only on sign-in or an explicit force-refresh; a nurse
// whose claims were repaired server-side would otherwise stay locked on her stale token
// until the next sign-in. Best-effort: a refresh failure just leaves the old token.
export async function refreshIdToken(): Promise<void> {
  const user = firebaseAuth().currentUser;
  if (user) await user.getIdToken(true);
}

// Self-serve deletion (iOS FirebaseAuthClient.deleteAccount) is deliberately NOT ported:
// on the web, account removal is an administrative act (super-admin console →
// deleteUserAccount callable). iOS keeps its flow only because the App Store mandates it.
