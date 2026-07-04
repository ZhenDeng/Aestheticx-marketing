// Client-side avatar pick validation — mirrors storage.rules (jpeg/png/webp, <10MB).
import { describe, expect, it } from "vitest";
import { AVATAR_MAX_BYTES, avatarFileError } from "@/lib/demo/avatarFile";

function file(type: string, bytes: number): File {
  const f = new File([new Uint8Array(1)], "avatar", { type });
  // jsdom Files can't be constructed multi-MB cheaply; report the size instead.
  Object.defineProperty(f, "size", { value: bytes });
  return f;
}

describe("avatarFileError", () => {
  it("accepts each server-allowed image type under the limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(avatarFileError(file(type, AVATAR_MAX_BYTES))).toBeNull();
    }
  });

  it("rejects types the storage rules would refuse", () => {
    for (const type of ["image/gif", "application/pdf", "image/svg+xml", ""]) {
      expect(avatarFileError(file(type, 1024))).toMatch(/JPEG, PNG, or WebP/);
    }
  });

  it("rejects files over 10MB", () => {
    expect(avatarFileError(file("image/jpeg", AVATAR_MAX_BYTES + 1))).toMatch(/over 10MB/);
  });
});
