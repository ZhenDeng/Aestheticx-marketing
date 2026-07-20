"use client";

import { useEffect, useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { identityBadge, type AccountRecord, type Identity, type Role, type BusinessEntity, type BusinessEntityType } from "@/lib/demo/types";
import { CooperationRelationshipsSection } from "@/components/admin/RelationshipsSection";
import { validateNewUser, type NewPremiseInput, type NewUserInput } from "@/lib/demo/userAdmin";

// The platform-admin management console (accounts + create user + cooperation relationships).
// Lives under the Admin module (/app/admin), separate from the clinical UI (constitution
// §16/Rule 7). Demo keeps iOS AdminConsoleView parity (static demo cast, disabled create
// button — the demo has no Auth backend). Live lists the real users collection and drives the
// deployed createUser / resetUserPassword / deleteUserAccount Functions.

// iOS initials: first letters of the first two name parts, skipping "Dr".
function initials(name: string): string {
  return name.split(" ").filter((p) => p && p !== "Dr").slice(0, 2).map((p) => p[0]).join("");
}

const ROLE_LABEL: Record<Role, string> = {
  doctor: "Doctor", nurse: "Nurse", clinicAdmin: "Clinic admin", superAdmin: "Super admin",
};

export function AdminConsole({ live }: { live: boolean }) {
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
          const roles = [...new Set(account.identities.map((i) => i.role))];
          const clinicIDs = [...new Set(account.identities.flatMap((i) => (i.context.kind === "clinic" ? [i.context.clinic.id] : [])))];
          const scope = accountEntityScope(account.identities[0].user.id, roles, clinicIDs);
          return (
            <li key={account.label} className="flex flex-wrap items-center gap-3.5 border-b border-line px-4 py-3 last:border-b-0">
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
              <AccountEntityLine ownerIds={scope.ownerIds} preferred={scope.preferred} />
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
  const entityScope = accountEntityScope(account.id, account.roles, account.clinicIDs ?? []);

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

  // 17/07 feedback: no manual "Repair access" control here — wiped-claims accounts
  // self-heal at their own next sign-in (see src/lib/firebase/selfHeal.ts).
  // flex-wrap on the row + the actions cluster keeps every control inside the
  // horizontal viewport at narrow widths (actions drop below the identity line).
  return (
    <li className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
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
      <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {del === "confirming" || del === "deleting" ? (
          <>
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
          </>
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
      </span>
      <AccountEntityLine ownerIds={entityScope.ownerIds} preferred={entityScope.preferred} />
    </li>
  );
}

// Inline create-user form. Pre-validates with the client port of the Function's
// validateNewUser so field errors show before any network call; Function errors
// (e.g. email already in use) surface underneath. Round 6 (auth-pdf-feedback-round-6):
// everything the treatment-authorisation PDF needs is captured at creation — a doctor's
// principal place of practice, a nurse's premises of administration (≥1, first becomes
// the default), and a new "Clinic" account type (name IS the clinic name, no AHPRA,
// clinic address required — that address is its fixed premise on generated documents).
function CreateUserForm({ onDone, onCancel }: { onDone: (name: string) => void; onCancel: () => void }) {
  const store = useDemoStore();
  const [accountType, setAccountType] = useState<"practitioner" | "clinic">("practitioner");
  const [draft, setDraft] = useState({
    name: "", email: "", phone: "", abn: "", businessName: "", ahpra: "", temporaryPassword: "",
    principalPlace: "", clinicAddress: "", address: "",
  });
  const [premises, setPremises] = useState<NewPremiseInput[]>([{ name: "", address: "" }]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [supervisingDoctorId, setSupervisingDoctorId] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const clinic = accountType === "clinic";
  const isDoctor = !clinic && roles.includes("doctor");
  const isNurse = !clinic && roles.includes("nurse");

  // The prescribing-doctor directory for the nurse's optional supervising-doctor link
  // (16/07 feedback bug 1): fetched once when a nurse role is first selected, like the
  // cooperation-relationship picker. The link is optional — a nurse can be linked later.
  const [doctorOptions, setDoctorOptions] = useState<{ doctorId: string; doctorName: string }[]>([]);
  useEffect(() => {
    if (!isNurse || doctorOptions.length > 0) return;
    let cancelled = false;
    void store.listDoctors().then((ds) => { if (!cancelled) setDoctorOptions(ds); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isNurse, doctorOptions.length, store]);

  const input = (field: string) =>
    `w-full rounded-field border bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint ${missing.includes(field) ? "border-rose" : "border-line"}`;

  function toggleRole(role: Role) {
    setRoles((r) => (r.includes(role) ? r.filter((x) => x !== role) : [...r, role]));
  }

  function payload(): NewUserInput {
    if (clinic) {
      return {
        ...draft, ahpra: undefined, principalPlace: undefined, premises: undefined,
        accountType: "clinic", roles: ["clinicAdmin"],
      };
    }
    return {
      ...draft,
      clinicAddress: undefined,
      principalPlace: roles.includes("doctor") ? draft.principalPlace : undefined,
      premises: roles.includes("nurse") ? premises : undefined,
      // 16/07: optional contact address (persists to Profile) + optional supervising-doctor
      // link (nurse only — the callable creates the cooperation relationship atomically).
      address: draft.address.trim() || undefined,
      supervisingDoctorId: roles.includes("nurse") && supervisingDoctorId ? supervisingDoctorId : undefined,
      roles,
    };
  }

  async function submit() {
    const inputPayload = payload();
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
      <div className="mt-3 flex gap-1.5">
        {([["practitioner", "Practitioner"], ["clinic", "Clinic"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => { setAccountType(value); setMissing([]); }}
            aria-pressed={accountType === value}
            className={`rounded-btn px-3 py-1.5 text-sm ${accountType === value ? "text-card" : "border border-line text-ink-soft"}`}
            style={accountType === value ? { background: "var(--color-tint)" } : undefined}
          >
            {label}
          </button>
        ))}
      </div>
      {clinic && (
        <p className="mt-2 text-sm text-ink-soft">
          A clinic signs in as its own organisation: the full name is the clinic name, no AHPRA,
          and its address is the premise printed on every clinic authorisation document.
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field(clinic ? "Clinic name" : "Full name", "name")}
        {field("Email", "email", { type: "email" })}
        {field("Phone", "phone")}
        {field("ABN", "abn")}
        {field("Business name", "businessName")}
        {!clinic && field("AHPRA", "ahpra", { hint: "Required for doctors and nurses" })}
        {clinic && field("Clinic address", "clinicAddress", { hint: "Printed as the premises of administration on clinic authorisations" })}
        {field("Temporary password", "temporaryPassword", { type: "password", hint: "At least 8 characters — they change it on first login" })}
        {!clinic && (
          <div>
            <span className="micro">Roles</span>
            <div className={`mt-1 flex gap-4 rounded-field border px-2.5 py-1.5 ${missing.some((m) => m.startsWith("roles")) ? "border-rose" : "border-line"}`}>
              {(["doctor", "nurse"] as const).map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} className="accent-[var(--color-tint)]" />
                  {ROLE_LABEL[role]}
                </label>
              ))}
            </div>
          </div>
        )}
        {isDoctor && field("Principal place of practice", "principalPlace", { hint: "Prints in the Clause 68C direction and PDF signature block" })}
        {/* 16/07 feedback bug 2: a contact address entered here persists to the user's Profile. */}
        {!clinic && field("Address", "address", { hint: "Contact address — shows on the user's profile (optional)" })}
      </div>
      {isNurse && (
        <label className="mt-3 block">
          <span className="micro">Supervising doctor</span>
          <p className="micro mt-0.5 text-ink-soft">Optional — links the nurse under this doctor so she can raise authorisation requests immediately. You can also set this up later.</p>
          <select
            value={supervisingDoctorId}
            onChange={(e) => setSupervisingDoctorId(e.target.value)}
            className="mt-1.5 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint"
          >
            <option value="">No supervising doctor yet</option>
            {doctorOptions.map((d) => (
              <option key={d.doctorId} value={d.doctorId}>{d.doctorName}</option>
            ))}
          </select>
        </label>
      )}
      {isNurse && (
        <div className="mt-3">
          <span className="micro">Premises of administration</span>
          <p className="micro mt-0.5 text-ink-soft">At least one — the first becomes the default; the nurse can add more later.</p>
          <div className="mt-1.5 flex flex-col gap-2">
            {premises.map((p, i) => (
              <div key={i} className={`grid grid-cols-1 gap-2 rounded-field border p-2.5 sm:grid-cols-[1fr_2fr_auto] ${missing.includes("premises") ? "border-rose" : "border-line"}`}>
                <input
                  value={p.name} placeholder="Premise name" aria-label={`Premise ${i + 1} name`}
                  onChange={(e) => setPremises((rows) => rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                  className="rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint"
                />
                <input
                  value={p.address} placeholder="Street address" aria-label={`Premise ${i + 1} address`}
                  onChange={(e) => setPremises((rows) => rows.map((r, j) => (j === i ? { ...r, address: e.target.value } : r)))}
                  className="rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-tint"
                />
                <button
                  type="button"
                  onClick={() => setPremises((rows) => rows.filter((_, j) => j !== i))}
                  disabled={premises.length <= 1}
                  className="text-sm text-ink-soft hover:text-ink disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPremises((rows) => [...rows, { name: "", address: "" }])}
            className="mt-2 rounded-btn border border-line px-3 py-1 text-sm text-ink-soft hover:border-tint/50"
          >
            Add another premise
          </button>
        </div>
      )}
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
          {submitting ? "Creating…" : clinic ? "Create clinic" : "Create user"}
        </button>
      </div>
    </section>
  );
}

// --- Business entities on account rows (Tier 3 #4; 20/07 feedback: the standalone section
// is gone — each account row surfaces its own entity, and adds are pre-scoped) ---
const ENTITY_TYPE_LABEL: Record<BusinessEntityType, string> = {
  clinic: "Clinic", independentNurse: "Independent nurse", independentDoctor: "Independent doctor",
};
const ENTITY_TYPES: BusinessEntityType[] = ["clinic", "independentNurse", "independentDoctor"];

// Which entity owner ids an account's row shows, and what an add from that row creates.
// A clinic's entity belongs on the account that ADMINISTERS the clinic (not on every
// employee's row); practitioners own their uid-keyed independent entity; a pure super
// admin has no entity affordance.
function accountEntityScope(id: string, roles: Role[], clinicIDs: string[]): {
  ownerIds: string[];
  preferred: { id: string; type: BusinessEntityType } | null;
} {
  const clinicAdmin = roles.includes("clinicAdmin");
  const ownerIds = clinicAdmin ? [id, ...clinicIDs] : [id];
  if (clinicAdmin && clinicIDs.length > 0) return { ownerIds, preferred: { id: clinicIDs[0], type: "clinic" } };
  if (roles.includes("doctor")) return { ownerIds, preferred: { id, type: "independentDoctor" } };
  if (roles.includes("nurse")) return { ownerIds, preferred: { id, type: "independentNurse" } };
  return { ownerIds, preferred: null };
}

// The full-width entity strip under an account row: existing entities with inline
// Edit/activate, or a pre-scoped "Add business entity". Renders nothing for accounts with
// neither (e.g. the super admin's own row) and for non-super-admin viewers.
function AccountEntityLine({ ownerIds, preferred }: {
  ownerIds: string[];
  preferred: { id: string; type: BusinessEntityType } | null;
}) {
  const store = useDemoStore();
  const { identity } = useDemoAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!identity || identity.role !== "superAdmin") return null;
  const entities = store.businessEntities().filter((e) => ownerIds.includes(e.id));
  if (entities.length === 0 && !preferred) return null;

  function toggle(entity: BusinessEntity) {
    setError(null);
    try { store.setBusinessEntityActive(entity.id, !entity.isActive, identity!); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update"); }
  }

  return (
    <div className="w-full border-t border-line pt-2">
      {entities.map((entity) => editingId === entity.id ? (
        <BusinessEntityForm key={entity.id} identity={identity} entity={entity} onDone={() => setEditingId(null)} onCancel={() => setEditingId(null)} />
      ) : (
        <div key={entity.id} className="flex flex-wrap items-center gap-2">
          <span className="micro flex-none">{ENTITY_TYPE_LABEL[entity.type]} entity</span>
          <span className={`min-w-0 flex-1 truncate text-sm ${entity.isActive ? "text-ink" : "text-ink-soft line-through"}`}>
            {entity.tradingName ? `${entity.tradingName} · ${entity.legalName}` : entity.legalName}
            <span className="text-ink-soft"> — {entity.abn ? `ABN ${entity.abn}` : "no ABN"}{entity.isActive ? "" : " · inactive"}</span>
          </span>
          <button onClick={() => setEditingId(entity.id)} className="micro flex-none rounded-btn border border-line px-2.5 py-1 text-ink-soft hover:border-tint/50">
            Edit
          </button>
          <button onClick={() => toggle(entity)} className="micro flex-none rounded-btn border border-line px-2.5 py-1 text-ink-soft hover:border-tint/50">
            {entity.isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      ))}
      {entities.length === 0 && preferred && (adding ? (
        <BusinessEntityForm identity={identity} fixed={preferred} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-soft">No business entity — legal name and ABN print on tax invoices.</span>
          <button onClick={() => setAdding(true)} className="micro flex-none rounded-btn border border-line px-2.5 py-1 text-ink-soft hover:border-tint/50">
            Add business entity
          </button>
        </div>
      ))}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

// Add or edit a business entity. On edit (entity supplied) id + type are fixed; account-row
// adds supply `fixed` (owner id + inferred type — no free-text owner id since the row already
// knows both). ABN is optional (a clinic may await one) but must be 11 digits when supplied;
// validation mirrors the backend.
function BusinessEntityForm({ identity, entity, fixed, onDone, onCancel }: {
  identity: Identity;
  entity?: BusinessEntity;
  fixed?: { id: string; type: BusinessEntityType };
  onDone: () => void;
  onCancel: () => void;
}) {
  const store = useDemoStore();
  const isEdit = !!entity;
  const idLocked = isEdit || !!fixed;
  const [id] = useState(entity?.id ?? fixed?.id ?? "");
  const [type, setType] = useState<BusinessEntityType>(entity?.type ?? fixed?.type ?? "clinic");
  const [legalName, setLegalName] = useState(entity?.legalName ?? "");
  const [tradingName, setTradingName] = useState(entity?.tradingName ?? "");
  const [abn, setAbn] = useState(entity?.abn ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const entityId = entity?.id ?? id.trim();
    if (!isEdit) {
      // The owner id is free-text on add (unlike the auto-slugged product form), so guard it
      // client-side to give a clear message instead of a raw backend "validationFailed".
      if (!entityId) { setError("Owner id is required"); return; }
      if (entityId.includes("/") || entityId.includes(".")) { setError("Owner id can't contain '/' or '.'"); return; }
      // Add is an upsert — warn before silently clobbering an existing (likely backfilled) entity.
      if (store.businessEntities().some((e) => e.id === entityId)) {
        setError("An entity for this id already exists — use its Edit button instead"); return;
      }
    }
    if (!legalName.trim()) { setError("Legal name is required"); return; }
    if (legalName.trim().length > 160) { setError("Legal name is too long (max 160)"); return; }
    if (tradingName.trim().length > 160) { setError("Trading name is too long (max 160)"); return; }
    const abnDigits = abn.replace(/\s+/g, "");
    if (abnDigits.length > 0 && !/^\d{11}$/.test(abnDigits)) { setError("ABN must be 11 digits"); return; }
    try {
      store.setBusinessEntity({
        id: entityId, type, legalName: legalName.trim(),
        tradingName: tradingName.trim() || undefined, abn: abnDigits || undefined,
        isActive: entity?.isActive ?? true,
      }, identity);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save entity"); }
  }

  const field = "w-full rounded-btn border border-line bg-card px-3 py-2 text-sm text-ink";
  return (
    <div className="mt-4 rounded-card border border-line bg-card p-4 shadow-card">
      <h3 className="font-display text-base text-ink">{isEdit ? "Edit business entity" : "Add business entity"}</h3>
      {/* 20/07: adds are account-row-scoped, so the owner id is known — shown, never typed. */}
      {!isEdit && fixed && (
        <p className="micro mt-1">Owner id · {fixed.id}</p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm text-ink-soft">
          Type
          <select className={`mt-1 ${field}`} value={type} onChange={(e) => setType(e.target.value as BusinessEntityType)} disabled={idLocked}>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{ENTITY_TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          Legal name
          <input className={`mt-1 ${field}`} value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="e.g. Lumière Clinic Pty Ltd" />
        </label>
        <label className="text-sm text-ink-soft">
          Trading name <span className="text-ink-soft/70">(optional)</span>
          <input className={`mt-1 ${field}`} value={tradingName} onChange={(e) => setTradingName(e.target.value)} placeholder="e.g. Lumière" />
        </label>
        <label className="text-sm text-ink-soft">
          ABN <span className="text-ink-soft/70">(11 digits, optional)</span>
          <input className={`mt-1 ${field}`} value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="e.g. 82 601 443 218" />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={submit} className="rounded-btn bg-tint px-4 py-2 text-sm font-medium text-white hover:bg-tint/90">{isEdit ? "Save" : "Add entity"}</button>
        <button onClick={onCancel} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint/50">Cancel</button>
      </div>
    </div>
  );
}
