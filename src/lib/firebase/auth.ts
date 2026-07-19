"use client";

import {
  signInWithEmailAndPassword, signOut as fbSignOut, onIdTokenChanged,
  updatePassword, setPersistence, browserLocalPersistence, browserSessionPersistence,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { firebaseAuth, firestore, functions } from "./client";
import { identitiesFromClaims } from "./identity";
import { resolveClaimsWithSelfHeal } from "./selfHeal";
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

// One in-flight heal per uid plus a short success cooldown: a force-refreshed token can
// re-fire the watcher before claims propagate. Failures release immediately, and later
// clinic changes can retry during the same page session.
const healGuard = new Map<string, number>();

// Resolve the signed-in user's identities from custom claims + their users/{uid} doc.
// Self-heals the 16/07 wiped-claims signature along the way (empty token roles while the
// users doc records roles): asks syncUserClaims to re-derive its own claims from server
// truth, force-refreshes the token, and resolves from the repaired claims — no manual
// admin repair step. Best-effort: a heal failure leaves sign-in exactly as it was.
export async function identitiesForUser(user: User): Promise<Identity[]> {
  const { claims, userDoc } = await resolveClaimsWithSelfHeal(user.uid, {
    readTokenClaims: async (forceRefresh) =>
      (await user.getIdTokenResult(forceRefresh)).claims as Record<string, unknown>,
    readUserDoc: async () => {
      try {
        const snap = await getDoc(doc(firestore(), "users", user.uid));
        return snap.exists() ? (snap.data() as { name?: string }) : null;
      } catch {
        return null; // name falls back to claim/email; not fatal for sign-in
      }
    },
    repairOwnClaims: async () => {
      await httpsCallable(functions(), "syncUserClaims")({ userId: user.uid });
    },
  }, healGuard);
  return identitiesFromClaims(claims, userDoc, await clinicNamesFor(claims.clinics));
}

/**
 * Names for the caller's OWN clinics, read from `clinics/{id}`. Claims carry ids only, so without
 * this the acting identity showed the raw clinic id wherever its name is rendered.
 *
 * Safe to read here specifically because these are the caller's own memberships:
 * firestore.rules allows `clinics/{id}` to `inClinic(clinicId) || isSuperAdmin()`, which every
 * id in one's own claims satisfies. (That same rule is why a clinic's address cannot be resolved
 * client-side for an authorisation the caller is not a member of — that case is stamped at
 * approval instead.)
 *
 * Best-effort per clinic: a failed or missing read yields no entry, which the resolver renders as
 * a blank name rather than an id. Sign-in must not fail because a clinic doc is unreadable.
 */
async function clinicNamesFor(clinics: Record<string, string>): Promise<Record<string, string>> {
  const ids = Object.keys(clinics ?? {});
  if (ids.length === 0) return {};
  const entries = await Promise.all(ids.map(async (id): Promise<[string, string] | null> => {
    try {
      const snap = await getDoc(doc(firestore(), "clinics", id));
      const name = snap.exists() ? (snap.data() as { name?: unknown }).name : undefined;
      return typeof name === "string" && name.trim() ? [id, name.trim()] : null;
    } catch {
      return null; // unreadable clinic → blank name, never the id
    }
  }));
  return Object.fromEntries(entries.filter((e): e is [string, string] => e !== null));
}

// The signed-in user's uid right now, or null. Lets the auth watcher discard a stale
// async identity resolution that settles after sign-out / a different sign-in.
export function currentUserUid(): string | null {
  return firebaseAuth().currentUser?.uid ?? null;
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
