// 26/07 feedback (dead-button audit): picking large files left "Attach photo or file"
// completely inert while every FileReader ran, and attachments only appeared as one batch
// at the end. The picker must show a reading state and surface each file as it resolves.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { NoteAttachment } from "@/lib/demo/types";

import { NoteAttachmentsInput } from "@/components/app/NoteAttachments";

// Controllable FileReader: each instance parks until the test releases it.
class FakeFileReader {
  static instances: FakeFileReader[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  error = new Error("read failed");
  readAsDataURL(_file: File) { FakeFileReader.instances.push(this); }
  release(dataUrl: string) { this.result = dataUrl; this.onload?.(); }
}

function Harness({ onValue }: { onValue: (v: NoteAttachment[]) => void }) {
  const [value, setValue] = useState<NoteAttachment[]>([]);
  onValue(value);
  return <NoteAttachmentsInput patientID="p1" value={value} onChange={setValue} />;
}

beforeEach(() => {
  FakeFileReader.instances = [];
  vi.stubGlobal("FileReader", FakeFileReader);
});
afterEach(() => vi.unstubAllGlobals());

describe("NoteAttachmentsInput", () => {
  it("shows a reading state while files load and surfaces each attachment as it resolves", async () => {
    let latest: NoteAttachment[] = [];
    render(<Harness onValue={(v) => { latest = v; }} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.pdf", { type: "application/pdf" }),
    ]);

    // Both reads pending: the picker announces progress instead of sitting inert.
    expect(await screen.findByText("Reading 2 files…")).toBeInTheDocument();
    expect(latest).toHaveLength(0);

    // First file resolves → appears immediately, while the second is still reading.
    await act(async () => { FakeFileReader.instances[0].release("data:image/png;base64,aa"); });
    expect(latest).toHaveLength(1);
    expect(screen.getByText("Reading 1 file…")).toBeInTheDocument();

    await act(async () => { FakeFileReader.instances[1].release("data:application/pdf;base64,bb"); });
    expect(latest).toHaveLength(2);
    expect(screen.getByText("Attach photo or file")).toBeInTheDocument();
    expect(screen.queryByText(/Reading/)).not.toBeInTheDocument();
  });

  it("recovers the picker when a read fails", async () => {
    let latest: NoteAttachment[] = [];
    render(<Harness onValue={(v) => { latest = v; }} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, [new File(["a"], "a.png", { type: "image/png" })]);
    expect(await screen.findByText("Reading 1 file…")).toBeInTheDocument();

    await act(async () => { FakeFileReader.instances[0].onerror?.(); });
    expect(screen.getByText("Attach photo or file")).toBeInTheDocument(); // picker usable again
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    expect(latest).toHaveLength(0);
  });
});
