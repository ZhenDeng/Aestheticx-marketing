import { describe, it, expect } from "vitest";
import {
  emptyState, noteTemplatesForOwner, saveNoteTemplate, deleteNoteTemplate, BackendError,
} from "@/lib/demo/backend";
import { encodeNoteTemplate, mapNoteTemplate } from "@/lib/firebase/mappers";
import type { Identity, NoteTemplate } from "@/lib/demo/types";

const sarah: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };
const voss: Identity = { user: { id: "u-voss", name: "Voss" }, role: "doctor", context: { kind: "independent" } };

const tpl = (id: string, ownerID: string, name: string, body = "B"): NoteTemplate =>
  ({ id, ownerID, name, body, aftercareCategories: [] });

describe("note templates", () => {
  it("lists an owner's templates alphabetically by name", () => {
    let s = emptyState();
    s = saveNoteTemplate(s, tpl("t1", "u-sarah", "Zinc"), sarah);
    s = saveNoteTemplate(s, tpl("t2", "u-sarah", "anti-wrinkle"), sarah);
    expect(noteTemplatesForOwner(s, "u-sarah").map((t) => t.name)).toEqual(["anti-wrinkle", "Zinc"]);
  });

  it("upserts by id (edit replaces, no duplicate)", () => {
    let s = emptyState();
    s = saveNoteTemplate(s, tpl("t1", "u-sarah", "Draft"), sarah);
    s = saveNoteTemplate(s, { ...tpl("t1", "u-sarah", "Final"), body: "B2" }, sarah);
    const list = noteTemplatesForOwner(s, "u-sarah");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "t1", name: "Final", body: "B2" });
  });

  it("rejects saving a template owned by someone else", () => {
    expect(() => saveNoteTemplate(emptyState(), tpl("t1", "u-voss", "X"), sarah)).toThrow(BackendError);
  });

  it("only deletes the caller's own template", () => {
    let s = emptyState();
    s = saveNoteTemplate(s, tpl("t1", "u-sarah", "Mine"), sarah);
    s = saveNoteTemplate(s, tpl("t2", "u-voss", "Theirs"), voss);
    s = deleteNoteTemplate(s, "t2", sarah); // sarah cannot remove voss's; scoped to caller
    expect(noteTemplatesForOwner(s, "u-voss").map((t) => t.id)).toEqual(["t2"]);
    s = deleteNoteTemplate(s, "t1", sarah);
    expect(noteTemplatesForOwner(s, "u-sarah")).toEqual([]);
  });

  it("keeps templates private to their owner", () => {
    let s = emptyState();
    s = saveNoteTemplate(s, tpl("t1", "u-sarah", "Mine"), sarah);
    expect(noteTemplatesForOwner(s, "u-voss")).toEqual([]);
  });
});

describe("note template mapper", () => {
  it("round-trips through encode -> map", () => {
    const t: NoteTemplate = { id: "t1", ownerID: "u-sarah", name: "Lip filler", body: "Std body", aftercareCategories: ["haFiller"] };
    const doc = encodeNoteTemplate(t);
    expect(doc).toMatchObject({ ownerId: "u-sarah", name: "Lip filler", body: "Std body", aftercareCategories: ["haFiller"] });
    expect(mapNoteTemplate("t1", doc)).toEqual(t);
  });

  it("drops unknown aftercare categories on decode", () => {
    const mapped = mapNoteTemplate("t1", { ownerId: "u", name: "n", body: "b", aftercareCategories: ["antiwrinkle", "bogus"] });
    expect(mapped.aftercareCategories).toEqual(["antiwrinkle"]);
  });
});
