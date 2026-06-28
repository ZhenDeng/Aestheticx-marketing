"use client";

import { useRef, useState } from "react";

// Draws on a canvas; reports a PNG Blob + data URL when asked. `onChange(hasDrawing)`
// lets the parent gate submit. Call `getPng()` to read the current drawing.
export interface SignatureHandle { getPng: () => Promise<{ blob: Blob; dataUrl: string } | null> }

export function SignaturePad({ onChange, handleRef }: {
  onChange: (hasDrawing: boolean) => void;
  handleRef: React.MutableRefObject<SignatureHandle | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  function pos(e: React.PointerEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function start(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#211c16";
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
    if (!dirty) { setDirty(true); onChange(true); }
  }
  function end() { drawing.current = false; }
  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setDirty(false); onChange(false);
  }

  // eslint-disable-next-line react-hooks/refs -- intentional imperative-handle pattern: expose getPng() to parent
  handleRef.current = {
    getPng: () =>
      new Promise((resolve) => {
        if (!dirty) return resolve(null);
        canvasRef.current!.toBlob((blob) => {
          if (!blob) return resolve(null);
          resolve({ blob, dataUrl: canvasRef.current!.toDataURL("image/png") });
        }, "image/png");
      }),
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-inner border border-line bg-card"
        style={{ aspectRatio: "3 / 1" }}
      />
      <button type="button" onClick={clear} className="mt-2 text-sm text-ink-soft hover:text-ink">Clear signature</button>
    </div>
  );
}
