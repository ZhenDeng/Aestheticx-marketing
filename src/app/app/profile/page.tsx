"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { avatarFileError } from "@/lib/demo/avatarFile";
import { useDemoStore } from "@/lib/demo/store";
import { heldIdentities } from "@/lib/demo/identity";
import { identityBadge, type Identity, type Role, type UserProfile } from "@/lib/demo/types";
import { identityKey } from "@/lib/demo/identityPrefs";
import { landingFor } from "@/lib/demo/authRedirect";
import { tintStyle } from "@/lib/demo/tint";

// Port of iOS ProfileView (spec: auth-accounts): own details + the identity switch.
// Selecting an identity re-tints the app and swaps to that role's landing. Billing is reached
// from here (not a main tab), and account deletion is live-only. Platform-admin management
// (accounts, cooperation relationships) lives in the Admin module (/app/admin), not here —
// constitution §16/Rule 7 keeps the admin surface out of the clinical/profile UI.

const ROLE_SUBTITLE: Record<Role, string> = {
  nurse: "RN · COSMETIC INJECTOR",
  doctor: "MEDICAL PRACTITIONER",
  clinicAdmin: "CLINIC ADMINISTRATOR",
  superAdmin: "PLATFORM ADMINISTRATOR",
};

// The sample values iOS ProfileView renders in its DenseRows — used as input
// placeholders only (iOS's InMemoryBackend seeds no profile data, so stored
// fields start empty and these never masquerade as real data).
const FIELD_PLACEHOLDER = {
  ahpra: "NMW0001234567",
  phone: "0412 884 209",
  address: "14 Acland St, St Kilda VIC",
};

// iOS initials: first letters of the first two name parts, skipping "Dr".
function initials(name: string): string {
  return name.split(" ").filter((p) => p && p !== "Dr").slice(0, 2).map((p) => p[0]).join("");
}

function sameIdentity(a: Identity, b: Identity): boolean {
  const clinicId = (i: Identity) => (i.context.kind === "clinic" ? i.context.clinic.id : null);
  return a.user.id === b.user.id && a.role === b.role && clinicId(a) === clinicId(b);
}

function contextLine(identity: Identity): string {
  const roleName: Record<Role, string> = { doctor: "Doctor", nurse: "Nurse", clinicAdmin: "Clinic admin", superAdmin: "Super admin" };
  if (identity.context.kind === "independent") {
    return identity.role === "superAdmin" ? "Platform" : `Independent clinician · ${roleName[identity.role]}`;
  }
  return identity.role === "clinicAdmin" ? "Clinic admin" : `Employee · ${roleName[identity.role]}`;
}

export default function ProfilePage() {
  const { identity, availableIdentities, selectIdentity, signOut } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const me = identity;
  const profile = store.profileForUser(me.user.id);
  const isSuperAdmin = me.role === "superAdmin";
  const isClinician = me.role === "doctor" || me.role === "nurse";
  // The account's full identity set, cross-mode (live claims, else the demo account).
  const identities = heldIdentities(me, availableIdentities);
  // AHPRA belongs to the ACCOUNT (a practitioner registration), not the active identity —
  // a super admin who also holds a clinician role sees it without switching identities.
  // Accounts with no clinical role (pure admins) still hide it.
  const holdsClinicalRole = identities.some((i) => i.role === "doctor" || i.role === "nurse");

  return (
    <div className="max-w-3xl">
      <header className="flex flex-col items-center gap-3 text-center">
        <AvatarPicker me={me} profile={profile} />
        <div>
          <h1 className="font-display text-3xl text-ink">{me.user.name}</h1>
          <p className="micro mt-1 tracking-widest">{ROLE_SUBTITLE[me.role]}</p>
        </div>
      </header>

      <ProfileFields me={me} profile={profile} showsAhpra={isClinician || holdsClinicalRole} />

      {!isSuperAdmin && (
        <>
          <h2 className="mt-8 font-display text-lg text-ink">{me.role === "doctor" ? "Approvals" : "Authorised"}</h2>
          <Link href="/app/billing" className="mt-3 flex items-center justify-between gap-3 rounded-card border border-line bg-card px-5 py-4 shadow-card transition-colors hover:border-tint/50">
            <span>
              <span className="block text-sm font-medium text-ink">
                {me.role === "doctor" ? "Approvals & invoices" : "Authorised scripts"}
              </span>
              <span className="block text-sm text-ink-soft">Monthly counts &amp; invoicing</span>
            </span>
            <span aria-hidden className="text-ink-soft">›</span>
          </Link>
        </>
      )}

      {isSuperAdmin && (
        <>
          <h2 className="mt-8 font-display text-lg text-ink">Platform administration</h2>
          <Link href="/app/admin" className="mt-3 flex items-center justify-between gap-3 rounded-card border border-line bg-card px-5 py-4 shadow-card transition-colors hover:border-tint/50">
            <span>
              <span className="block text-sm font-medium text-ink">Open the admin console</span>
              <span className="block text-sm text-ink-soft">Accounts, cooperation relationships &amp; audit</span>
            </span>
            <span aria-hidden className="text-ink-soft">›</span>
          </Link>
        </>
      )}

      {identities.length > 1 && (
        <>
          <h2 className="mt-8 font-display text-lg text-ink">Practise as</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {identities.map((id) => {
              const active = sameIdentity(id, me);
              return (
                <li key={`${id.role}:${id.context.kind === "clinic" ? id.context.clinic.id : "independent"}`} style={tintStyle(id)}>
                  <button
                    onClick={() => {
                      // iOS parity: switching re-tints the app and swaps the dashboard. Admin
                      // switches land in the admin shell, not the clinical dashboard (§16).
                      selectIdentity(id);
                      router.push(landingFor(id.role));
                    }}
                    className="flex w-full items-center gap-4 rounded-card border bg-card px-4 py-3.5 text-left transition-shadow"
                    style={active
                      ? { borderColor: "var(--color-tint)", boxShadow: "0 3px 8px color-mix(in srgb, var(--color-tint) 25%, transparent)" }
                      : { borderColor: "var(--color-line)" }}
                  >
                    <span className="grid h-10 w-10 flex-none place-items-center rounded-field font-display italic text-card" style={{ background: "var(--color-tint)" }}>
                      {identityBadge(id)[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{identityBadge(id)}</span>
                      <span className="block text-sm text-ink-soft">{contextLine(id)}</span>
                    </span>
                    <span aria-hidden className="flex-none text-lg" style={{ color: active ? "var(--color-tint)" : "var(--color-line)" }}>
                      {active ? "●" : "○"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-10 flex flex-col items-center gap-4">
        <button onClick={signOut} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint/50">
          Sign out
        </button>
      </div>
    </div>
  );
}

// Tappable avatar: replaces the monogram with the chosen photo. Demo keeps the bytes
// in state as a data URL (iOS keeps them in its in-memory file store); live uploads
// to users/{uid}/** (storage.rules avatar path) and records users/{uid}.avatarFileId.
function AvatarPicker({ me, profile }: { me: Identity; profile: UserProfile }) {
  const store = useDemoStore();
  const live = store.status !== "demo";
  const inputRef = useRef<HTMLInputElement>(null);
  // Resolved Storage URL, remembered with the fileId it belongs to so a stale URL
  // never renders for a different (or cleared) avatar object.
  const [resolved, setResolved] = useState<{ fileId: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileId = profile.avatarFileId;
  useEffect(() => {
    if (!live || !fileId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { fileDownloadUrl } = await import("@/lib/firebase/storage");
        const url = await fileDownloadUrl(fileId);
        if (!cancelled) setResolved({ fileId, url });
      } catch {
        // Unresolvable object — keep the monogram fallback.
      }
    })();
    return () => { cancelled = true; };
  }, [live, fileId]);
  const liveUrl = resolved && resolved.fileId === fileId ? resolved.url : null;

  async function pick(file: File) {
    // Mirror the server storage rules before reading/uploading anything.
    const invalid = avatarFileError(file);
    if (invalid) { setError(invalid); return; }
    setError(null);
    try {
      if (live) {
        const { uploadUserAvatar } = await import("@/lib/firebase/storage");
        const path = await uploadUserAvatar(me.user.id, file, file.type || "image/jpeg");
        store.updateProfile({ avatarFileId: path }, me);
        const { fileDownloadUrl } = await import("@/lib/firebase/storage");
        // Re-resolve eagerly so a same-path re-upload refreshes (new download token).
        setResolved({ fileId: path, url: await fileDownloadUrl(path) });
      } else {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        store.updateProfile({ avatarDataUrl: dataUrl }, me);
      }
    } catch {
      setError("The photo could not be saved. Please try again.");
    }
  }

  const src = live ? liveUrl : profile.avatarDataUrl ?? null;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button" onClick={() => inputRef.current?.click()} aria-label="Change profile photo"
        className="relative h-24 w-24 rounded-full"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URLs / tokenised Storage URLs
          <img src={src} alt="" className="h-24 w-24 rounded-full border border-line object-cover" />
        ) : (
          <span className="grid h-24 w-24 place-items-center rounded-full border border-line font-display text-3xl text-card" style={{ background: "var(--color-tint)" }}>
            {initials(me.user.name)}
          </span>
        )}
        <span aria-hidden className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-ink text-xs text-card">✎</span>
      </button>
      <input
        ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }}
      />
      {error && <p className="text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
    </div>
  );
}

// The details card: AHPRA (doctor/nurse only), ABN, Phone, Address — the same rows as
// iOS ProfileView. AHPRA/phone/address are client-writable on users/{uid}; ABN is
// rules-immutable (set by the createUser Function), so it renders display-only.
function ProfileFields({ me, profile, showsAhpra }: { me: Identity; profile: UserProfile; showsAhpra: boolean }) {
  const store = useDemoStore();
  // Address is per-identity (owner feedback #2); AHPRA/phone are account-wide.
  const identityAddress = store.addressForIdentity(me);
  // Remount the drafts whenever the stored fields OR the active identity change — switching
  // "Practise as" keeps the same user id, so the identity key must be part of the key.
  return (
    <ProfileFieldsEditor
      key={`${identityKey(me)}|${profile.ahpra}|${profile.phone}|${identityAddress}`}
      me={me} profile={profile} identityAddress={identityAddress} showsAhpra={showsAhpra} store={store}
    />
  );
}

function ProfileFieldsEditor({ me, profile, identityAddress, showsAhpra, store }: {
  me: Identity; profile: UserProfile; identityAddress: string; showsAhpra: boolean; store: ReturnType<typeof useDemoStore>;
}) {
  const [ahpra, setAhpra] = useState(profile.ahpra);
  const [phone, setPhone] = useState(profile.phone);
  const [address, setAddress] = useState(identityAddress);
  const dirty = ahpra !== profile.ahpra || phone !== profile.phone || address !== identityAddress;

  function save() {
    if (ahpra !== profile.ahpra || phone !== profile.phone) {
      store.updateProfile({
        ...(ahpra !== profile.ahpra ? { ahpra } : {}),
        ...(phone !== profile.phone ? { phone } : {}),
      }, me);
    }
    if (address !== identityAddress) store.setAddressForIdentity(me, address);
  }

  const row = "flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-b-0";
  const input = "w-56 max-w-[60%] rounded-field border border-line bg-card px-2.5 py-1.5 text-right text-sm text-ink outline-none focus:border-tint";
  return (
    <section className="mt-7 rounded-card border border-line bg-card px-5 py-2 shadow-card">
      {showsAhpra && (
        <label className={row}>
          <span className="micro">AHPRA</span>
          <input value={ahpra} onChange={(e) => setAhpra(e.target.value)} placeholder={FIELD_PLACEHOLDER.ahpra} className={input} />
        </label>
      )}
      <div className={row}>
        <span className="micro">ABN</span>
        <span className="text-sm text-ink" title="Set by your administrator — ABN changes go through AestheticX">
          {profile.abn || "—"}
        </span>
      </div>
      <label className={row}>
        <span className="micro">Phone</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={FIELD_PLACEHOLDER.phone} className={input} />
      </label>
      {/* Address gets its own full-width block (label above, wrapping textarea) so long
          addresses stay fully visible — the shared right-aligned w-56 input truncates them. */}
      <label className="block border-b border-line py-2.5 last:border-b-0">
        <span className="micro">Address</span>
        <span className="ml-2 text-xs text-ink-soft">· {contextLine(me)}</span>
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={FIELD_PLACEHOLDER.address}
          rows={2}
          className="mt-1.5 w-full resize-none rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint"
        />
      </label>
      {dirty && (
        <div className="flex justify-end py-2.5">
          <button onClick={save} className="rounded-btn px-4 py-1.5 text-sm font-medium text-card" style={{ background: "var(--color-tint)" }}>
            Save details
          </button>
        </div>
      )}
    </section>
  );
}

// Self-serve account deletion was removed deliberately (2026-07-05): account removal is
// an administrative act via the super-admin console's deleteUserAccount callable. iOS
// keeps its in-app flow because the App Store mandates it; the web has no such rule.
