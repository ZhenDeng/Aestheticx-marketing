"use client";

import { useRef, useState } from "react";
import { useDemoStore } from "@/lib/demo/store";
import { SignaturePad, type SignatureHandle } from "./SignaturePad";
import type { Identity } from "@/lib/demo/types";

// 02/08 owner request: the doctor draws their electronic signature once, on the dashboard,
// and it prints in the signature block (bottom left) of every approval PDF from then on.
// Stored as a WHITE-BACKED JPEG data URL: the hand-rolled PDF writer embeds JPEG bytes
// verbatim (DCTDecode) but cannot decode PNG pixels, and the pad's canvas is transparent —
// exporting it to JPEG directly would come out black. Saved on the doctor's user profile
// (users doc in live — the backend renderer's follow-up reads it from there).
export function DoctorSignatureSection({ asDoctor }: { asDoctor: Identity }) {
  const store = useDemoStore();
  const handle = useRef<SignatureHandle | null>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saved = (store.profileForUser(asDoctor.user.id).signatureDataUrl ?? "").trim();

  async function save() {
    setError(null);
    try {
      const png = await handle.current?.getPng();
      if (!png) return;
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("signature image failed to load"));
        image.src = png.dataUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      store.updateProfile({ signatureDataUrl: canvas.toDataURL("image/jpeg", 0.85) }, asDoctor);
      setReplacing(false);
      setHasDrawing(false);
    } catch {
      setError("Could not save the signature — please try again.");
    }
  }

  function remove() {
    setError(null);
    try {
      store.updateProfile({ signatureDataUrl: "" }, asDoctor);
    } catch {
      setError("Could not remove the signature.");
    }
  }

  const showPad = !saved || replacing;
  return (
    <section className="mt-8 rounded-card border border-line bg-card p-6 shadow-card">
      <h2 className="font-display text-lg text-ink">Electronic signature</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {saved
          ? "This signature is printed in the signature block of every treatment authorisation you approve."
          : "Sign below once — it will be printed in the signature block of every treatment authorisation you approve."}
      </p>

      {saved && !replacing && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL, next/image adds nothing */}
          <img src={saved} alt="Your saved signature" className="h-20 rounded-inner border border-line bg-card" />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => setReplacing(true)}
                    className="rounded-btn border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-tint">
              Replace signature
            </button>
            <button type="button" onClick={remove}
                    className="rounded-btn border border-line px-3 py-1.5 text-sm hover:border-danger" style={{ color: "var(--color-danger)" }}>
              Remove
            </button>
          </div>
        </div>
      )}

      {showPad && (
        <div className="mt-3">
          <SignaturePad handleRef={handle} onChange={setHasDrawing} />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={save} disabled={!hasDrawing}
                    className="rounded-btn px-4 py-2 text-sm font-medium text-card disabled:opacity-50" style={{ background: "var(--color-tint)" }}>
              Save signature
            </button>
            {replacing && (
              <button type="button" onClick={() => { setReplacing(false); setHasDrawing(false); }}
                      className="rounded-btn border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-tint">
                Keep current
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
    </section>
  );
}
