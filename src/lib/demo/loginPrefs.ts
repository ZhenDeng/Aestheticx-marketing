// Pure "Remember me" preferences for the live login. Storage is injected so this is
// unit-testable; every access is wrapped because storage can throw (private browsing,
// disabled cookies). Only the email is ever stored — never the password; staying
// signed in is Firebase persistence's job (see signInWithPassword).
// Device-local key, like ax.recentlyUsedProducts (the iOS UserDefaults analogue).
export const REMEMBERED_EMAIL_KEY = "ax.rememberedEmail";

export function rememberedEmail(storage: Storage): string | null {
  try {
    const raw = storage.getItem(REMEMBERED_EMAIL_KEY);
    const trimmed = raw?.trim() ?? "";
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function saveLoginPrefs(storage: Storage, prefs: { email: string; remember: boolean }): void {
  try {
    const email = prefs.email.trim();
    if (prefs.remember && email) storage.setItem(REMEMBERED_EMAIL_KEY, email);
    else storage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {
    // Storage unavailable — remembering is best-effort.
  }
}
