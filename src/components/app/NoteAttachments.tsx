"use client";

import { useEffect, useState } from "react";
import { isImageAttachment } from "@/lib/demo/backend";
import type { NoteAttachment } from "@/lib/demo/types";

// Matches the Storage rules' accepted uploads (image jpeg/png/webp/heic or PDF, <25MB).
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
const MAX_BYTES = 25 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Composer attachment picker (spec: clinical-notes — photo and file attachments). Photos
// preview as thumbnails; other files show a renameable display name — renaming touches only
// displayName, never the minted fileID (the Storage object key).
export function NoteAttachmentsInput({ patientID, value, onChange }: {
  patientID: string;
  value: NoteAttachment[];
  onChange: (next: NoteAttachment[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const added: NoteAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is over the 25 MB limit.`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : "bin";
      const fileID = `patients/${patientID}/${isImage ? "photos" : "files"}/${crypto.randomUUID()}.${ext}`;
      added.push({ fileID, displayName: file.name, mimeType: file.type, dataUrl: await readAsDataUrl(file) });
    }
    if (added.length) onChange([...value, ...added]);
  }

  function rename(fileID: string, displayName: string) {
    onChange(value.map((a) => (a.fileID === fileID ? { ...a, displayName } : a)));
  }
  function remove(fileID: string) {
    onChange(value.filter((a) => a.fileID !== fileID));
  }

  return (
    <div className="mt-3">
      <label className="inline-block cursor-pointer rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">
        Attach photo or file
        <input type="file" accept={ACCEPT} multiple className="hidden"
               onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
      </label>
      {error && <p className="mt-1 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}

      {value.some(isImageAttachment) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.filter(isImageAttachment).map((a) => (
            <span key={a.fileID} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- data-url preview */}
              <img src={a.dataUrl} alt="Attached photo" className="h-16 w-16 rounded-inner border border-line object-cover" />
              <button type="button" onClick={() => remove(a.fileID)} aria-label="Remove photo"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-card text-xs text-ink-soft hover:border-tint">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {value.filter((a) => !isImageAttachment(a)).map((a) => (
        <div key={a.fileID} className="mt-2 flex items-center gap-2">
          <input value={a.displayName} onChange={(e) => rename(a.fileID, e.target.value)} aria-label="Attachment name"
                 className="w-full max-w-xs rounded-field border border-line px-2 py-1 text-sm text-ink outline-none focus:border-tint" />
          <span className="micro flex-none">PDF</span>
          <button type="button" onClick={() => remove(a.fileID)} aria-label="Remove file"
                  className="flex-none rounded-btn border border-line px-2 py-1 text-xs text-ink-soft hover:border-tint">
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

// Resolves an attachment's display URL: the demo dataUrl directly, else (hydrated live
// notes) a Storage download URL fetched on demand.
function useAttachmentUrl(a: NoteAttachment): string | null {
  const [url, setUrl] = useState<string | null>(a.dataUrl ?? null);
  useEffect(() => {
    if (a.dataUrl) return;
    let alive = true;
    void (async () => {
      try {
        const { fileDownloadUrl } = await import("@/lib/firebase/storage");
        const resolved = await fileDownloadUrl(a.fileID);
        if (alive) setUrl(resolved);
      } catch { /* leave the placeholder — visibility or network */ }
    })();
    return () => { alive = false; };
  }, [a.fileID, a.dataUrl]);
  return url;
}

function AttachmentImage({ a, size }: { a: NoteAttachment; size: string }) {
  const url = useAttachmentUrl(a);
  // Spec: photos render as thumbnails without showing file names.
  if (!url) return <span aria-hidden className={`${size} inline-block rounded-inner border border-line bg-paper-deep`} />;
  // eslint-disable-next-line @next/next/no-img-element -- resolved Storage/data url
  return <img src={url} alt="Note photo" className={`${size} rounded-inner border border-line object-cover`} />;
}

// Spec: list rows with photos show a thumbnail strip beneath the title without opening.
export function AttachmentThumbStrip({ photos }: { photos: NoteAttachment[] }) {
  return (
    <span className="mt-1 flex gap-1">
      {photos.map((a) => <AttachmentImage key={a.fileID} a={a} size="h-10 w-10" />)}
    </span>
  );
}

// Open-note attachment block: larger photo thumbnails (no names) + file chips by display name.
export function NoteAttachmentList({ attachments }: { attachments: NoteAttachment[] }) {
  const photos = attachments.filter(isImageAttachment);
  const files = attachments.filter((a) => !isImageAttachment(a));
  return (
    <>
      {photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((a) => <AttachmentImage key={a.fileID} a={a} size="h-24 w-24" />)}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((a) => <FileChip key={a.fileID} a={a} />)}
        </div>
      )}
    </>
  );
}

function FileChip({ a }: { a: NoteAttachment }) {
  const url = useAttachmentUrl(a);
  const label = a.displayName || "Attachment";
  const cls = "micro rounded-full border border-line px-2 py-0.5";
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className={`${cls} underline-offset-2 hover:border-tint hover:underline`}>{label}</a>
    : <span className={cls}>{label}</span>;
}
