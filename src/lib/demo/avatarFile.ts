// Client-side pre-upload validation for avatar picks, mirroring the server
// storage.rules constraints on avatar objects (images only — jpeg/png/webp —
// and <10MB). Rejecting a bad pick BEFORE reading/uploading gives the user an
// inline message instead of a Storage permission error mid-upload.

export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;

const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Inline error message for an invalid avatar file, or null when it may be used. */
export function avatarFileError(file: File): string | null {
  if (!AVATAR_ALLOWED_TYPES.has(file.type)) {
    return "That file type isn't supported — choose a JPEG, PNG, or WebP image.";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "That image is over 10MB — choose a smaller one.";
  }
  return null;
}
