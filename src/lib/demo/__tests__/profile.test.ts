import { describe, it, expect } from "vitest";
import { profileForUser, updateProfile, emptyState } from "@/lib/demo/backend";
import type { UserProfileEdit } from "@/lib/demo/types";

describe("profileForUser", () => {
  it("defaults to empty fields when the user has no stored profile", () => {
    expect(profileForUser(emptyState(), "u-voss")).toEqual({ ahpra: "", abn: "", phone: "", address: "" });
  });

  it("returns the stored profile when present", () => {
    const s = {
      ...emptyState(),
      profileByUser: { "u-voss": { ahpra: "MED0001", abn: "82 601 443 218", phone: "0412 884 209", address: "14 Acland St" } },
    };
    expect(profileForUser(s, "u-voss").abn).toBe("82 601 443 218");
  });
});

describe("updateProfile", () => {
  it("merges a partial edit onto the default when no prior profile exists", () => {
    const s = updateProfile(emptyState(), "u-voss", { phone: "0400 000 000" });
    expect(profileForUser(s, "u-voss")).toEqual({ ahpra: "", abn: "", phone: "0400 000 000", address: "" });
  });

  it("merges an edit without disturbing other fields", () => {
    let s = updateProfile(emptyState(), "u-voss", { phone: "0400 000 000", ahpra: "MED0001" });
    s = updateProfile(s, "u-voss", { address: "14 Acland St" });
    expect(profileForUser(s, "u-voss")).toEqual({
      ahpra: "MED0001", abn: "", phone: "0400 000 000", address: "14 Acland St",
    });
  });

  it("stores the avatar (demo dataUrl and live fileId) as part of the profile", () => {
    const s = updateProfile(emptyState(), "u-voss", { avatarDataUrl: "data:image/png;base64,x", avatarFileId: "users/u-voss/avatar.jpg" });
    expect(profileForUser(s, "u-voss").avatarDataUrl).toBe("data:image/png;base64,x");
    expect(profileForUser(s, "u-voss").avatarFileId).toBe("users/u-voss/avatar.jpg");
  });

  it("ignores ABN edits — firestore.rules makes abn client-immutable", () => {
    const sneaky = { abn: "11 111 111 111", phone: "0400 000 000" } as UserProfileEdit;
    const s = updateProfile(emptyState(), "u-voss", sneaky);
    expect(profileForUser(s, "u-voss").abn).toBe("");
    expect(profileForUser(s, "u-voss").phone).toBe("0400 000 000");
  });

  it("does not mutate the input state (immutability)", () => {
    const before = emptyState();
    const after = updateProfile(before, "u-voss", { phone: "0400 000 000" });
    expect(before.profileByUser).toEqual({});
    expect(after).not.toBe(before);
  });
});
