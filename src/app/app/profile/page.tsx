"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { avatarFileError } from "@/lib/demo/avatarFile";
import { useDemoStore } from "@/lib/demo/store";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import {
  identityBadge, type AccountRecord, type CooperationRelationship, type Identity, type Role, type UserProfile,
} from "@/lib/demo/types";
import type { SetCooperationRelationshipInput } from "@/lib/demo/backend";
import { validateNewUser } from "@/lib/demo/userAdmin";
import { identityKey } from "@/lib/demo/identityPrefs";
import { tintStyle } from "@/lib/demo/tint";

// Port of iOS ProfileView (spec: auth-accounts): own details + the identity switch.
// Selecting an identity re-tints the app and swaps the dashboard. Billing is reached
// from here (not a main tab), and account deletion is live-only.

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
  const { identity, availableIdentities, selectIdentity, signOut, mode } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const me = identity;
  const profile = store.profileForUser(me.user.id);
  const isSuperAdmin = me.role === "superAdmin";
  const isClinician = me.role === "doctor" || me.role === "nurse";
  // Live: identities resolved from claims. Demo: the signed-in account's identity list
  // (iOS demo sign-in hands SessionState the whole account).
  const identities = availableIdentities.length
    ? availableIdentities
    : DEMO_ACCOUNTS.find((a) => a.identities.some((i) => i.user.id === me.user.id))?.identities ?? [me];
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

      {isSuperAdmin && <AdminConsole live={mode === "live"} />}

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
                      // iOS parity: switching re-tints the app and swaps the dashboard.
                      selectIdentity(id);
                      router.push("/app/dashboard");
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

// Super admin console. Demo keeps iOS AdminConsoleView parity (static demo cast,
// disabled create button — the demo has no Auth backend). Live lists the real
// users collection (rules: superAdmin may list it) and drives the deployed
// createUser / resetUserPassword Functions — roles are assigned at creation;
// the deployed backend has no callable for re-roling an existing account.
function AdminConsole({ live }: { live: boolean }) {
  if (!live) return <DemoAdminConsole />;
  return <LiveAdminConsole />;
}

function DemoAdminConsole() {
  return (
    <>
      <h2 className="mt-8 font-display text-lg text-ink">Accounts</h2>
      <ul className="mt-3 rounded-card border border-line bg-card shadow-card">
        {DEMO_ACCOUNTS.map((account) => {
          const name = account.identities[0].user.name;
          return (
            <li key={account.label} className="flex items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full font-display text-card" style={{ background: "var(--color-tint)" }}>
                {name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{name}</span>
                <span className="micro block truncate">{account.identities.map(identityBadge).join(" · ")}</span>
              </span>
              <span className="micro flex-none rounded-full px-2 py-0.5" style={{ background: "var(--color-umber-soft)", color: "var(--color-umber)" }}>
                Read-only
              </span>
            </li>
          );
        })}
      </ul>
      <button disabled className="mt-4 w-full rounded-btn bg-ink px-4 py-2.5 text-sm font-medium text-card opacity-60" title="Sign in live as a super admin to administer accounts">
        Create user · assign roles
      </button>
      <p className="mt-3 text-sm text-ink-soft">
        User administration is live-only in the demo. In the live app the super admin sees
        every real account here and creates users through the createUser Cloud Function.
      </p>
      <CooperationRelationshipsSection />
    </>
  );
}

const ROLE_LABEL: Record<Role, string> = {
  doctor: "Doctor", nurse: "Nurse", clinicAdmin: "Clinic admin", superAdmin: "Super admin",
};

function LiveAdminConsole() {
  const store = useDemoStore();
  const accounts = store.accounts();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  return (
    <>
      <h2 className="mt-8 font-display text-lg text-ink">Accounts</h2>
      {accounts.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No accounts loaded yet.</p>
      ) : (
        <ul className="mt-3 rounded-card border border-line bg-card shadow-card">
          {accounts.map((account) => <AccountRow key={account.id} account={account} />)}
        </ul>
      )}
      {created && (
        <p className="mt-3 rounded-field px-3 py-2 text-sm" style={{ background: "var(--color-umber-soft)", color: "var(--color-umber)" }}>
          {created} created. They sign in with the temporary password and are asked to set
          their own on first login.
        </p>
      )}
      {creating ? (
        <CreateUserForm
          onDone={(name) => { setCreating(false); setCreated(name); }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          onClick={() => { setCreated(null); setCreating(true); }}
          className="mt-4 w-full rounded-btn bg-ink px-4 py-2.5 text-sm font-medium text-card transition-opacity hover:opacity-90"
        >
          Create user · assign roles
        </button>
      )}
      <p className="mt-3 text-sm text-ink-soft">
        Creation writes roles to custom claims and emails the new user (createUser Cloud
        Function). Role changes on existing accounts go through AestheticX operations.
      </p>
      <CooperationRelationshipsSection />
    </>
  );
}

function AccountRow({ account }: { account: AccountRecord }) {
  const store = useDemoStore();
  const { identity } = useDemoAuth();
  const [reset, setReset] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resetError, setResetError] = useState<string | null>(null);
  const [del, setDel] = useState<"idle" | "confirming" | "deleting" | "error">("idle");
  const [delError, setDelError] = useState<string | null>(null);
  const display = account.name || account.email || account.id;
  // Own row gets no delete action: the Function rejects self-deletion (the in-app
  // Delete account flow below is the self-serve path), so don't render a dead button.
  const isSelf = identity?.user.id === account.id;

  // Await-then-setState without an unmount guard is this file's event-handler
  // convention; React treats a post-unmount set as a no-op.
  async function sendReset() {
    setReset("sending");
    setResetError(null);
    try {
      await store.resetUserPassword(account.email);
      setReset("sent");
    } catch (e) {
      setResetError(e instanceof Error ? e.message : String(e));
      setReset("error");
    }
  }

  async function performDelete() {
    setDel("deleting");
    setDelError(null);
    try {
      await store.deleteUserAccount(account.id);
      // No local state to settle: the store rehydrates and this row drops out.
    } catch (e) {
      setDelError(e instanceof Error ? e.message : String(e));
      setDel("error");
    }
  }

  return (
    <li className="flex items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-full font-display text-card" style={{ background: "var(--color-tint)" }}>
        {initials(display)[0] ?? "?"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{display}</span>
        <span className="micro block truncate">
          {[account.roles.map((r) => ROLE_LABEL[r]).join(" · ") || "No role", account.email].filter(Boolean).join(" — ")}
        </span>
      </span>
      {account.mustChangePassword && (
        <span className="micro flex-none rounded-full px-2 py-0.5" style={{ background: "var(--color-umber-soft)", color: "var(--color-umber)" }}>
          Awaiting first login
        </span>
      )}
      {del === "confirming" || del === "deleting" ? (
        <span className="flex flex-none items-center gap-2">
          <span className="micro" style={{ color: "var(--color-rose)" }}>Delete login? Records kept.</span>
          <button
            onClick={() => void performDelete()}
            disabled={del === "deleting"}
            className="micro flex-none rounded-btn px-2.5 py-1 text-card disabled:opacity-60"
            style={{ background: "var(--color-rose)" }}
          >
            {del === "deleting" ? "Deleting…" : "Confirm"}
          </button>
          <button
            onClick={() => setDel("idle")}
            disabled={del === "deleting"}
            className="micro flex-none rounded-btn border border-line px-2.5 py-1 text-ink-soft disabled:opacity-60"
          >
            Cancel
          </button>
        </span>
      ) : (
        <>
          {account.email && (
            <button
              onClick={() => void sendReset()}
              disabled={reset === "sending" || reset === "sent"}
              className="micro flex-none rounded-btn border border-line px-2.5 py-1 text-ink-soft hover:border-tint/50 disabled:opacity-60"
              title={resetError ?? "Email this account a password-reset link"}
            >
              {reset === "idle" && "Reset password"}
              {reset === "sending" && "Sending…"}
              {reset === "sent" && "Reset sent"}
              {reset === "error" && "Failed — retry"}
            </button>
          )}
          {!isSelf && (
            <button
              onClick={() => setDel("confirming")}
              className="micro flex-none rounded-btn border px-2.5 py-1 hover:opacity-80"
              style={{ borderColor: "var(--color-rose)", color: "var(--color-rose)" }}
              title={delError ?? "Delete this account's login — clinical records are retained"}
            >
              {del === "error" ? "Delete failed — retry" : "Delete"}
            </button>
          )}
        </>
      )}
    </li>
  );
}

// Inline create-user form. Pre-validates with the client port of the Function's
// validateNewUser so field errors show before any network call; Function errors
// (e.g. email already in use) surface underneath.
function CreateUserForm({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const store = useDemoStore();
  const [draft, setDraft] = useState({
    name: "", email: "", phone: "", abn: "", businessName: "", ahpra: "", temporaryPassword: "",
  });
  const [roles, setRoles] = useState<Role[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const input = (field: keyof typeof draft) =>
    `w-full rounded-field border bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint ${missing.includes(field) ? "border-rose" : "border-line"}`;

  function toggleRole(role: Role) {
    setRoles((r) => (r.includes(role) ? r.filter((x) => x !== role) : [...r, role]));
  }

  async function submit() {
    const inputPayload = { ...draft, roles };
    const invalid = validateNewUser(inputPayload);
    setMissing(invalid);
    setServerError(null);
    if (invalid.length) return;
    setSubmitting(true);
    try {
      await store.createUser(inputPayload);
      onDone(draft.name);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  const field = (label: string, key: keyof typeof draft, extra?: { type?: string; hint?: string }) => (
    <label className="block">
      <span className="micro">{label}</span>
      <input
        type={extra?.type ?? "text"}
        autoComplete={extra?.type === "password" ? "new-password" : "off"}
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        className={`mt-1 ${input(key)}`}
      />
      {extra?.hint && <span className="micro mt-1 block text-ink-soft">{extra.hint}</span>}
    </label>
  );

  return (
    <section className="mt-4 rounded-card border border-line bg-card px-5 py-4 shadow-card">
      <h3 className="font-display text-base text-ink">New user</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("Full name", "name")}
        {field("Email", "email", { type: "email" })}
        {field("Phone", "phone")}
        {field("ABN", "abn")}
        {field("Business name", "businessName")}
        {field("AHPRA", "ahpra", { hint: "Required for doctors and nurses" })}
        {field("Temporary password", "temporaryPassword", { type: "password", hint: "At least 8 characters — they change it on first login" })}
        <div>
          <span className="micro">Roles</span>
          <div className={`mt-1 flex gap-4 rounded-field border px-2.5 py-1.5 ${missing.includes("roles") ? "border-rose" : "border-line"}`}>
            {(["doctor", "nurse"] as const).map((role) => (
              <label key={role} className="flex items-center gap-1.5 text-sm text-ink">
                <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} className="accent-[var(--color-tint)]" />
                {ROLE_LABEL[role]}
              </label>
            ))}
          </div>
        </div>
      </div>
      {missing.length > 0 && (
        <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>
          Please complete the highlighted fields.
        </p>
      )}
      {serverError && (
        <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{serverError}</p>
      )}
      <div className="mt-4 flex justify-end gap-2.5">
        <button onClick={onCancel} disabled={submitting} className="rounded-btn border border-line px-4 py-1.5 text-sm text-ink-soft hover:border-tint/50">
          Cancel
        </button>
        <button onClick={() => void submit()} disabled={submitting} className="rounded-btn px-4 py-1.5 text-sm font-medium text-card disabled:opacity-60" style={{ background: "var(--color-tint)" }}>
          {submitting ? "Creating…" : "Create user"}
        </button>
      </div>
    </section>
  );
}

// Cooperation relationships (spec 2026-07-08 cooperation-relationships, constitution §17):
// gates which doctors a nurse/clinic may request authorisation from, and carries the
// per-relationship price override + invoice-applies flag. Writes are demo-writable (the
// store validates + applies eagerly, then best-effort mirrors live), so this section renders
// identically from both DemoAdminConsole and LiveAdminConsole.
function CooperationRelationshipsSection() {
  const store = useDemoStore();
  const { identity } = useDemoAuth();
  const [creating, setCreating] = useState(false);
  // The full doctor directory, fetched once for the create form's picker (accounts() already
  // gives nurses synchronously; doctors need the async directory like the request builder did).
  const [doctorOptions, setDoctorOptions] = useState<{ doctorId: string; doctorName: string }[]>([]);
  const [doctorsLoaded, setDoctorsLoaded] = useState(false);
  useEffect(() => {
    if (doctorsLoaded) return;
    let cancelled = false;
    store.listDoctors().then((ds) => { if (!cancelled) { setDoctorOptions(ds); setDoctorsLoaded(true); } });
    return () => { cancelled = true; };
  }, [store, doctorsLoaded]);

  const relationships = store.cooperationRelationships();
  const nurses = store.accounts().filter((a) => a.roles.includes("nurse"));

  // Group by doctor, preserving cooperationRelationships()'s sort (doctor name, then
  // counterparty name) since Map insertion order follows first-seen iteration order.
  const groups = useMemo(() => {
    const byDoctor = new Map<string, { doctorID: string; doctorName: string; rels: CooperationRelationship[] }>();
    for (const r of relationships) {
      const g = byDoctor.get(r.doctorID) ?? { doctorID: r.doctorID, doctorName: r.doctorName, rels: [] };
      g.rels.push(r);
      byDoctor.set(r.doctorID, g);
    }
    return [...byDoctor.values()];
  }, [relationships]);

  if (!identity) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-lg text-ink">Cooperation relationships</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Controls which doctors a nurse or clinic may request authorisation from, plus each
        relationship&apos;s pricing and invoicing.
      </p>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No cooperation relationships yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.doctorID} className="rounded-card border border-line bg-card shadow-card">
              <h3 className="border-b border-line px-4 py-2.5 font-display text-base text-ink">{g.doctorName}</h3>
              <ul>
                {g.rels.map((r) => <RelationshipRow key={r.id} rel={r} identity={identity} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
      {creating ? (
        <CreateRelationshipForm
          doctorOptions={doctorOptions}
          nurses={nurses}
          identity={identity}
          onDone={() => setCreating(false)}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="mt-4 w-full rounded-btn border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-tint/50"
        >
          Add cooperation relationship
        </button>
      )}
      {/* Clinic-counterparty CREATE is out of scope here — there is no clinic directory yet
          to pick from. Edit/remove below still work for clinic relationships that already
          exist from seed data or a backfill. */}
    </section>
  );
}

function RelationshipRow({ rel, identity }: { rel: CooperationRelationship; identity: Identity }) {
  const store = useDemoStore();
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const priceText = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));
  const [priceDraft, setPriceDraft] = useState(priceText(rel.priceCentsOverride));
  const priceDirty = priceDraft.trim() !== priceText(rel.priceCentsOverride);

  function patch(fields: Partial<SetCooperationRelationshipInput>) {
    setError(null);
    try {
      store.setCooperationRelationship(
        {
          doctorID: rel.doctorID,
          doctorName: rel.doctorName,
          counterpartyType: rel.counterpartyType,
          counterpartyID: rel.counterpartyID,
          counterpartyName: rel.counterpartyName,
          status: rel.status,
          authRequestsAllowed: rel.authRequestsAllowed,
          invoiceApplies: rel.invoiceApplies,
          priceCentsOverride: rel.priceCentsOverride,
          ...fields,
        },
        identity,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function savePrice() {
    const trimmed = priceDraft.trim();
    if (!trimmed) { patch({ priceCentsOverride: null }); return; }
    const dollars = Number(trimmed);
    if (!Number.isFinite(dollars) || dollars <= 0) { setError("Enter a valid price."); return; }
    patch({ priceCentsOverride: Math.round(dollars * 100) });
  }

  function remove() {
    setError(null);
    try { store.removeCooperationRelationship(rel.id, identity); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setConfirmingRemove(false);
  }

  const priceLabel = rel.priceCentsOverride == null ? "default $25.00" : `$${(rel.priceCentsOverride / 100).toFixed(2)}`;
  const history = showHistory ? store.relationshipAuditFor(rel.id) : [];

  return (
    <li className="flex flex-col gap-2.5 border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{rel.counterpartyName}</span>
          <span className="micro block">
            {rel.counterpartyType === "nurse" ? "Nurse" : "Clinic"} · {priceLabel} · invoicing {rel.invoiceApplies ? "on" : "off"}
          </span>
        </span>
        <span
          className="micro flex-none rounded-full px-2 py-0.5"
          style={rel.status === "active"
            ? { background: "var(--color-umber-soft)", color: "var(--color-umber)" }
            : { background: "var(--color-line)", color: "var(--color-ink-soft)" }}
        >
          {rel.status === "active" ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-ink">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={rel.status === "active"} onChange={(e) => patch({ status: e.target.checked ? "active" : "inactive" })} />
          Active
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={rel.authRequestsAllowed} onChange={(e) => patch({ authRequestsAllowed: e.target.checked })} />
          Requests allowed
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={rel.invoiceApplies} onChange={(e) => patch({ invoiceApplies: e.target.checked })} />
          Invoicing
        </label>
        <label className="flex items-center gap-1.5">
          <span className="micro">Price $</span>
          <input
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            placeholder="25.00"
            inputMode="decimal"
            className="w-20 rounded-field border border-line bg-card px-2 py-1 text-sm text-ink"
          />
          {priceDirty && (
            <button onClick={savePrice} className="micro rounded-btn px-2 py-1 text-card" style={{ background: "var(--color-tint)" }}>
              Save
            </button>
          )}
        </label>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setShowHistory((s) => !s)} className="micro text-ink-soft hover:text-ink">
          {showHistory ? "Hide history" : "Show history"}
        </button>
        {confirmingRemove ? (
          <span className="flex items-center gap-2">
            <span className="micro" style={{ color: "var(--color-rose)" }}>Deactivate this relationship?</span>
            <button onClick={remove} className="micro rounded-btn px-2.5 py-1 text-card" style={{ background: "var(--color-rose)" }}>
              Confirm
            </button>
            <button onClick={() => setConfirmingRemove(false)} className="micro rounded-btn border border-line px-2.5 py-1 text-ink-soft">
              Cancel
            </button>
          </span>
        ) : rel.status === "active" && (
          <button
            onClick={() => setConfirmingRemove(true)}
            className="micro rounded-btn border px-2.5 py-1 hover:opacity-80"
            style={{ borderColor: "var(--color-rose)", color: "var(--color-rose)" }}
          >
            Remove
          </button>
        )}
      </div>

      {showHistory && (
        <ul className="flex flex-col gap-1 rounded-inner border border-line px-3 py-2" style={{ background: "var(--color-tint-soft)" }}>
          {history.length === 0 && <li className="micro text-ink-soft">No history yet.</li>}
          {history.map((entry) => (
            <li key={entry.id} className="micro text-ink-soft">
              <span className="font-medium text-ink">{entry.action}</span> · {entry.summary} · {new Date(entry.at).toLocaleString()} · {entry.actorName}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// Inline create form: doctor + nurse pickers (clinic counterparties have no directory to
// pick from yet — out of scope), an optional price override, and sensible active defaults
// (authRequestsAllowed + invoiceApplies on) matching what a super admin would set up first.
function CreateRelationshipForm({ doctorOptions, nurses, identity, onDone, onCancel }: {
  doctorOptions: { doctorId: string; doctorName: string }[];
  nurses: AccountRecord[];
  identity: Identity;
  onDone: () => void;
  onCancel: () => void;
}) {
  const store = useDemoStore();
  const [doctorID, setDoctorID] = useState(doctorOptions[0]?.doctorId ?? "");
  const [counterpartyID, setCounterpartyID] = useState(nurses[0]?.id ?? "");
  const [priceDollars, setPriceDollars] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (doctorOptions.length === 0 || nurses.length === 0) {
    return (
      <section className="mt-4 rounded-card border border-line bg-card px-5 py-4 shadow-card">
        <p className="text-sm text-ink-soft">
          {doctorOptions.length === 0 ? "No doctors in the directory yet." : "No nurse accounts yet."}
        </p>
        <div className="mt-3 flex justify-end">
          <button onClick={onCancel} className="rounded-btn border border-line px-4 py-1.5 text-sm text-ink-soft hover:border-tint/50">Close</button>
        </div>
      </section>
    );
  }

  function submit() {
    setError(null);
    const doctor = doctorOptions.find((d) => d.doctorId === doctorID);
    const nurse = nurses.find((n) => n.id === counterpartyID);
    if (!doctor || !nurse) { setError("Pick a doctor and a nurse."); return; }
    let priceCentsOverride: number | null = null;
    const trimmed = priceDollars.trim();
    if (trimmed) {
      const dollars = Number(trimmed);
      if (!Number.isFinite(dollars) || dollars <= 0) { setError("Enter a valid price."); return; }
      priceCentsOverride = Math.round(dollars * 100);
    }
    setSubmitting(true);
    try {
      store.setCooperationRelationship(
        {
          doctorID: doctor.doctorId,
          doctorName: doctor.doctorName,
          counterpartyType: "nurse",
          counterpartyID: nurse.id,
          counterpartyName: nurse.name || nurse.email || nurse.id,
          status: "active",
          authRequestsAllowed: true,
          invoiceApplies: true,
          priceCentsOverride,
        },
        identity,
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-4 rounded-card border border-line bg-card px-5 py-4 shadow-card">
      <h3 className="font-display text-base text-ink">New cooperation relationship</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="micro">Doctor</span>
          <select value={doctorID} onChange={(e) => setDoctorID(e.target.value)}
            className="mt-1 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink">
            {doctorOptions.map((d) => <option key={d.doctorId} value={d.doctorId}>{d.doctorName}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="micro">Nurse</span>
          <select value={counterpartyID} onChange={(e) => setCounterpartyID(e.target.value)}
            className="mt-1 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink">
            {nurses.map((n) => <option key={n.id} value={n.id}>{n.name || n.email || n.id}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="micro">Price override (optional)</span>
          <input
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            placeholder="Leave blank for default $25.00"
            inputMode="decimal"
            className="mt-1 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink"
          />
        </label>
      </div>
      {error && <p className="mt-3 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
      <div className="mt-4 flex justify-end gap-2.5">
        <button onClick={onCancel} disabled={submitting} className="rounded-btn border border-line px-4 py-1.5 text-sm text-ink-soft hover:border-tint/50">
          Cancel
        </button>
        <button onClick={submit} disabled={submitting} className="rounded-btn px-4 py-1.5 text-sm font-medium text-card disabled:opacity-60" style={{ background: "var(--color-tint)" }}>
          {submitting ? "Creating…" : "Create relationship"}
        </button>
      </div>
    </section>
  );
}

// Self-serve account deletion was removed deliberately (2026-07-05): account removal is
// an administrative act via the super-admin console's deleteUserAccount callable. iOS
// keeps its in-app flow because the App Store mandates it; the web has no such rule.
