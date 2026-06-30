import { describe, it, expect } from "vitest";
import { mapNote, encodeNote } from "@/lib/firebase/mappers";
import type { Note } from "@/lib/demo/types";

const base: Note = {
  id: "n1", patientID: "p1", kind: "aftercareRecord", title: "Aftercare sent", body: "Body",
  createdAt: 1000, authorID: "u-voss", authorBadge: "Dr Voss", consumedAuthorisationIDs: [], medications: [],
  deliveryStatus: "failed", aftercareCategories: ["antiwrinkle"],
};

describe("note delivery-status mapper", () => {
  it("round-trips deliveryStatus + aftercareCategories", () => {
    const doc = encodeNote(base);
    expect(doc).toMatchObject({ deliveryStatus: "failed", aftercareCategories: ["antiwrinkle"] });
    const mapped = mapNote("n1", "p1", doc);
    expect(mapped.deliveryStatus).toBe("failed");
    expect(mapped.aftercareCategories).toEqual(["antiwrinkle"]);
  });
  it("leaves deliveryStatus undefined + categories empty when absent", () => {
    const mapped = mapNote("n2", "p1", { kind: "general", title: "", body: "x" });
    expect(mapped.deliveryStatus).toBeUndefined();
    expect(mapped.aftercareCategories).toEqual([]);
  });
  it("defaults an unknown deliveryStatus to undefined", () => {
    const mapped = mapNote("n3", "p1", { kind: "aftercareRecord", deliveryStatus: "weird" });
    expect(mapped.deliveryStatus).toBeUndefined();
  });
});
