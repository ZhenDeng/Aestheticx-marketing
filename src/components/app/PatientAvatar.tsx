"use client";

import { useEffect, useRef, useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import type { Identity, Patient } from "@/lib/demo/types";

// Port of iOS PatientAvatar + PatientAvatarPicker (MediaAndInvoice.swift, spec:
// patient-records): the patient photo beside the name, a monogram until one is
// uploaded. iOS renders it at 72pt on the patient file header and 56pt in the list.

// iOS monogram: first letter of the given name + first letter of the last name.
function monogram(p: Patient): string {
  return `${p.givenName.slice(0, 1)}${p.lastName.slice(0, 1)}`;
}

// Resolves the avatar's display URL: the demo dataUrl directly, else (live) the
// Storage download URL for patients/{id}.avatarFileId, fetched on demand. Keyed by
// fileId so a re-upload (fresh object key per upload) re-resolves automatically.
function useAvatarUrl(p: Patient): string | null {
  const [resolved, setResolved] = useState<{ fileId: string; url: string } | null>(null);
  const fileId = p.avatarFileId;
  useEffect(() => {
    if (p.avatarDataUrl || !fileId) return;
    let alive = true;
    void (async () => {
      try {
        const { fileDownloadUrl } = await import("@/lib/firebase/storage");
        const url = await fileDownloadUrl(fileId);
        if (alive) setResolved({ fileId, url });
      } catch { /* unresolvable object — keep the monogram fallback */ }
    })();
    return () => { alive = false; };
  }, [p.avatarDataUrl, fileId]);
  if (p.avatarDataUrl) return p.avatarDataUrl;
  return resolved && resolved.fileId === fileId ? resolved.url : null;
}

export function PatientAvatar({ patient, size }: { patient: Patient; size: number }) {
  const url = useAvatarUrl(patient);
  const px = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- data URLs / tokenised Storage URLs
    return <img src={url} alt="" style={px} className="flex-none rounded-full border border-line object-cover" />;
  }
  return (
    <span
      aria-hidden
      style={{ ...px, background: "var(--color-tint)", fontSize: size * 0.38 }}
      className="grid flex-none place-items-center rounded-full border border-line font-display italic text-card"
    >
      {monogram(patient)}
    </span>
  );
}

// Tap-to-upload wrapper used on the patient file header (iOS PatientAvatarPicker):
// canEdit (canEditDetails) gates the picker; otherwise the avatar is display-only.
// Demo keeps the picked bytes in state as a data URL; live uploads to
// patients/{id}/avatar/** and records patients/{id}.avatarFileId.
export function PatientAvatarPicker({ patient, identity, canEdit, size = 72 }: {
  patient: Patient; identity: Identity; canEdit: boolean; size?: number;
}) {
  const store = useDemoStore();
  const live = store.status !== "demo";
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return <PatientAvatar patient={patient} size={size} />;

  async function pick(file: File) {
    setError(null);
    try {
      if (live) {
        const { uploadPatientAvatar } = await import("@/lib/firebase/storage");
        const path = await uploadPatientAvatar(patient.id, file, file.type || "image/jpeg");
        store.setPatientAvatar(patient.id, { avatarFileId: path }, identity);
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        store.setPatientAvatar(patient.id, { avatarDataUrl: dataUrl }, identity);
      }
    } catch {
      setError("The photo could not be saved. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button" onClick={() => inputRef.current?.click()} aria-label="Change patient photo"
        className="relative flex-none rounded-full" style={{ width: size, height: size }}
      >
        <PatientAvatar patient={patient} size={size} />
        <span aria-hidden className="absolute bottom-0 right-0 grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-ink text-xs text-card">✎</span>
      </button>
      <input
        ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }}
      />
      {error && <p className="text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
    </div>
  );
}
