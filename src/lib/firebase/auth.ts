"use client";

import {
  signInWithEmailAndPassword, signOut as fbSignOut, onIdTokenChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "./client";
import { identitiesFromClaims, type DemoClaims } from "./identity";
import type { Identity } from "@/lib/demo/types";

export async function signInWithPassword(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebaseAuth(), email, password);
}

export async function signOutUser(): Promise<void> {
  await fbSignOut(firebaseAuth());
}

// Resolve the signed-in user's identities from custom claims + their users/{uid} doc.
export async function identitiesForUser(user: User): Promise<Identity[]> {
  const tokenResult = await user.getIdTokenResult();
  const raw = tokenResult.claims as Record<string, unknown>;
  const claims: DemoClaims = {
    uid: user.uid,
    roles: Array.isArray(raw.roles) ? (raw.roles as string[]) : [],
    clinics: (raw.clinics as Record<string, string>) ?? {},
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
