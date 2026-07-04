"use client";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./client";

// Generic: resolve a Storage path to an authenticated download URL.
// (Storage rules permit a patientVisible user to read patients/{id}/forms/**
// and the signatures path.)
export async function fileDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage(), path));
}

// Signatures go under patients/{id}/signatures/{formId}.png — NOT patients/{id}/forms/**
// (the Storage rules make the forms/ path Function-only). The catch-all patient path
// allows image uploads by a patientVisible user.
export async function uploadSignature(patientID: string, formId: string, png: Blob): Promise<string> {
  const path = `patients/${patientID}/signatures/${formId}.png`;
  await uploadBytes(ref(storage(), path), png, { contentType: "image/png" });
  return path;
}

export async function signatureUrl(path: string): Promise<string> {
  return fileDownloadUrl(path);
}

// Note attachments live under patients/{id}/photos/** and patients/{id}/files/** — the
// catch-all patient path allows image/PDF uploads (<25MB) by a patientVisible user.
export async function uploadAttachment(fileID: string, blob: Blob, mimeType: string): Promise<void> {
  await uploadBytes(ref(storage(), fileID), blob, { contentType: mimeType });
}

// The user's own profile photo. iOS keeps it session-scoped in its in-memory file store
// (ProfileView.loadAvatar never uploads), but storage.rules reserves users/{uid}/** —
// owner-writable images (<10MB, jpeg/png/webp), readable by any signed-in clinician —
// for exactly this. The web persists one stable object per user and records its path
// on users/{uid}.avatarFileId (same field name as the patient docs' avatar).
export async function uploadUserAvatar(uid: string, blob: Blob, mimeType: string): Promise<string> {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `users/${uid}/avatar.${ext}`;
  await uploadBytes(ref(storage(), path), blob, { contentType: mimeType });
  return path;
}
