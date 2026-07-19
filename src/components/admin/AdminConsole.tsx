"use client";

import { useEffect, useMemo, useState } from "react";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { identityBadge, type AccountRecord, type CooperationRelationship, type CounterpartyType, type Identity, type Role, type ProductCategory, type ProductUnit, type BusinessEntity, type BusinessEntityType } from "@/lib/demo/types";
import { categoryDisplayName, PRODUCT_CATEGORIES, type CatalogProduct } from "@/lib/demo/catalog";
import type { SetCooperationRelationshipInput } from "@/lib/demo/backend";
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
      <ProductCatalogSection />
      <BusinessEntitiesSection />
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
      <ProductCatalogSection />
      <BusinessEntitiesSection />
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

// Cooperation relationships (spec 2026-07-08 cooperation-relationships, constitution §17):
// gates which doctors a nurse/clinic may request authorisation from, and carries the
// per-relationship price override + invoice-applies flag. Writes are demo-writable (the
// store validates + applies eagerly, then best-effort mirrors live), so this section renders
// identically in both modes.
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
  const clinics = store.clinics();

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
          clinics={clinics}
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
    </section>
  );
}

const PRODUCT_UNIT_OPTIONS: { value: ProductUnit; label: string }[] = [
  { value: "units", label: "Units (U)" },
  { value: "millilitres", label: "Millilitres (mL)" },
  { value: "vial", label: "Vial" },
  { value: "syringe", label: "Syringe" },
  { value: "tube", label: "Tube" },
  { value: "freeText", label: "Free text" },
];

// Admin-editable prescribing catalog (Tier 3 #5B): list every product grouped by category with an
// active toggle, plus an add-product form. Writes go through the superAdmin setProduct /
// deactivateProduct callables in live, or the demo reducers in demo.
function ProductCatalogSection() {
  const store = useDemoStore();
  const { identity } = useDemoAuth();
  const [adding, setAdding] = useState(false);
  const products = store.catalogProducts();
  const groups = useMemo(() => PRODUCT_CATEGORIES
    .map((category) => ({ category, items: products.filter((p) => p.category === category) }))
    .filter((g) => g.items.length > 0), [products]);

  if (!identity) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-lg text-ink">Product catalog</h2>
      <p className="mt-1 text-sm text-ink-soft">
        The injectable products nurses can select. Add a product or deactivate one — changes take
        effect without an app release. Deactivated products stay in the catalog but are hidden from selection.
      </p>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No products yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.category} className="rounded-card border border-line bg-card shadow-card">
              <h3 className="border-b border-line px-4 py-2.5 font-display text-base text-ink">
                {categoryDisplayName(g.category)} <span className="text-sm text-ink-soft">· {g.items.length}</span>
              </h3>
              <ul>
                {g.items.map((p) => <ProductRow key={p.id} product={p} identity={identity} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <AddProductForm identity={identity} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 w-full rounded-btn border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-tint/50"
        >
          Add product
        </button>
      )}
    </section>
  );
}

function ProductRow({ product, identity }: { product: CatalogProduct; identity: Identity }) {
  const store = useDemoStore();
  const [error, setError] = useState<string | null>(null);
  function toggle() {
    setError(null);
    try { store.setProductActive(product.id, !product.isActive, identity); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update"); }
  }
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${product.isActive ? "text-ink" : "text-ink-soft line-through"}`}>
          {product.brand ? `${product.brand} · ${product.name}` : product.name}
        </p>
        <p className="text-xs text-ink-soft">{product.unit}{product.isActive ? "" : " · inactive"}</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      <button
        onClick={toggle}
        className="shrink-0 rounded-btn border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-tint/50"
      >
        {product.isActive ? "Deactivate" : "Activate"}
      </button>
    </li>
  );
}

function AddProductForm({ identity, onDone, onCancel }: { identity: Identity; onDone: () => void; onCancel: () => void }) {
  const store = useDemoStore();
  const [category, setCategory] = useState<ProductCategory>("neurotoxin");
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<ProductUnit>("units");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    if (name.trim().length > 120) { setError("Name is too long (max 120)"); return; }
    if (brand.trim().length > 120) { setError("Brand is too long (max 120)"); return; }
    try {
      store.setProduct({ category, brand: brand.trim() || undefined, name: name.trim(), unit }, identity);
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add product"); }
  }

  const field = "w-full rounded-btn border border-line bg-card px-3 py-2 text-sm text-ink";
  return (
    <div className="mt-4 rounded-card border border-line bg-card p-4 shadow-card">
      <h3 className="font-display text-base text-ink">Add product</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm text-ink-soft">
          Category
          <select className={`mt-1 ${field}`} value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)}>
            {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{categoryDisplayName(c)}</option>)}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          Unit
          <select className={`mt-1 ${field}`} value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)}>
            {PRODUCT_UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          Brand <span className="text-ink-soft/70">(optional)</span>
          <input className={`mt-1 ${field}`} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Juvederm" />
        </label>
        <label className="text-sm text-ink-soft">
          Name
          <input className={`mt-1 ${field}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Voluma" />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={submit} className="rounded-btn bg-tint px-4 py-2 text-sm font-medium text-white hover:bg-tint/90">Add product</button>
        <button onClick={onCancel} className="rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint/50">Cancel</button>
      </div>
    </div>
  );
}

// --- First-class Business Entities (Tier 3 #4): super-admin editor ---
const ENTITY_TYPE_LABEL: Record<BusinessEntityType, string> = {
  clinic: "Clinic", independentNurse: "Independent nurse", independentDoctor: "Independent doctor",
};
const ENTITY_TYPES: BusinessEntityType[] = ["clinic", "independentNurse", "independentDoctor"];

function BusinessEntitiesSection() {
  const store = useDemoStore();
  const { identity } = useDemoAuth();
  const [adding, setAdding] = useState(false);
  const entities = store.businessEntities();
  const groups = useMemo(() => ENTITY_TYPES
    .map((type) => ({ type, items: entities.filter((e) => e.type === type) }))
    .filter((g) => g.items.length > 0), [entities]);

  if (!identity) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-lg text-ink">Business entities</h2>
      <p className="mt-1 text-sm text-ink-soft">
        The owning entity behind each clinic, independent nurse, and independent doctor — its legal
        name and ABN, used on tax invoices. Set a missing ABN or add an entity; changes take effect
        without an app release.
      </p>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No business entities yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.type} className="rounded-card border border-line bg-card shadow-card">
              <h3 className="border-b border-line px-4 py-2.5 font-display text-base text-ink">
                {ENTITY_TYPE_LABEL[g.type]} <span className="text-sm text-ink-soft">· {g.items.length}</span>
              </h3>
              <ul>
                {g.items.map((e) => <BusinessEntityRow key={e.id} entity={e} identity={identity} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <BusinessEntityForm identity={identity} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-4 w-full rounded-btn border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-tint/50"
        >
          Add business entity
        </button>
      )}
    </section>
  );
}

function BusinessEntityRow({ entity, identity }: { entity: BusinessEntity; identity: Identity }) {
  const store = useDemoStore();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  function toggle() {
    setError(null);
    try { store.setBusinessEntityActive(entity.id, !entity.isActive, identity); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update"); }
  }
  if (editing) {
    return (
      <li className="border-b border-line px-4 py-2.5 last:border-b-0">
        <BusinessEntityForm identity={identity} entity={entity} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${entity.isActive ? "text-ink" : "text-ink-soft line-through"}`}>
          {entity.tradingName ? `${entity.tradingName} · ${entity.legalName}` : entity.legalName}
        </p>
        <p className="text-xs text-ink-soft">{entity.abn ? `ABN ${entity.abn}` : "— no ABN"}{entity.isActive ? "" : " · inactive"}</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      <button onClick={() => setEditing(true)} className="shrink-0 rounded-btn border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-tint/50">Edit</button>
      <button
        onClick={toggle}
        className="shrink-0 rounded-btn border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-tint/50"
      >
        {entity.isActive ? "Deactivate" : "Activate"}
      </button>
    </li>
  );
}

// Add (no entity) or edit (entity supplied) a business entity. On edit, id + type are fixed; on add
// they are entered — the id is the owner id (a clinic id or a doctor/nurse uid). ABN is optional
// (a clinic may await one) but must be 11 digits when supplied; validation mirrors the backend.
function BusinessEntityForm({ identity, entity, onDone, onCancel }: { identity: Identity; entity?: BusinessEntity; onDone: () => void; onCancel: () => void }) {
  const store = useDemoStore();
  const isEdit = !!entity;
  const [id, setId] = useState(entity?.id ?? "");
  const [type, setType] = useState<BusinessEntityType>(entity?.type ?? "clinic");
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
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!isEdit && (
          <label className="text-sm text-ink-soft">
            Owner id <span className="text-ink-soft/70">(clinic id or user uid)</span>
            <input className={`mt-1 ${field}`} value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. clinic-lumiere" />
          </label>
        )}
        <label className="text-sm text-ink-soft">
          Type
          <select className={`mt-1 ${field}`} value={type} onChange={(e) => setType(e.target.value as BusinessEntityType)} disabled={isEdit}>
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

// Inline create form: doctor picker + a Nurse/Clinic counterparty toggle (spec:
// cooperation-linking — the callable, rules and edit rows always took clinic
// counterparties; only this create path was nurse-only), an optional price override,
// and sensible active defaults (authRequestsAllowed + invoiceApplies on) matching what
// a super admin would set up first.
function CreateRelationshipForm({ doctorOptions, nurses, clinics, identity, onDone, onCancel }: {
  doctorOptions: { doctorId: string; doctorName: string }[];
  nurses: AccountRecord[];
  clinics: { id: string; label: string }[];
  identity: Identity;
  onDone: () => void;
  onCancel: () => void;
}) {
  const store = useDemoStore();
  const [doctorID, setDoctorID] = useState(doctorOptions[0]?.doctorId ?? "");
  const [counterpartyType, setCounterpartyType] = useState<CounterpartyType>("nurse");
  const [counterpartyID, setCounterpartyID] = useState(nurses[0]?.id ?? "");
  const [priceDollars, setPriceDollars] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (doctorOptions.length === 0) {
    return (
      <section className="mt-4 rounded-card border border-line bg-card px-5 py-4 shadow-card">
        <p className="text-sm text-ink-soft">No doctors in the directory yet.</p>
        <div className="mt-3 flex justify-end">
          <button onClick={onCancel} className="rounded-btn border border-line px-4 py-1.5 text-sm text-ink-soft hover:border-tint/50">Close</button>
        </div>
      </section>
    );
  }

  // The selected type's directory as uniform {id, label} options; empty ⇒ the picker cell
  // explains and Create disables, while the toggle stays usable to switch type.
  const options = counterpartyType === "nurse"
    ? nurses.map((n) => ({ id: n.id, label: n.name || n.email || n.id }))
    : clinics;

  function selectType(type: CounterpartyType) {
    setCounterpartyType(type);
    setError(null);
    setCounterpartyID((type === "nurse" ? nurses.map((n) => n.id)[0] : clinics[0]?.id) ?? "");
  }

  function submit() {
    setError(null);
    const doctor = doctorOptions.find((d) => d.doctorId === doctorID);
    const counterparty = options.find((o) => o.id === counterpartyID);
    if (!doctor || !counterparty) { setError(`Pick a doctor and a ${counterpartyType}.`); return; }
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
          counterpartyType,
          counterpartyID: counterparty.id,
          counterpartyName: counterparty.label,
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
      <div className="mt-3 flex gap-1.5">
        {([["nurse", "Nurse"], ["clinic", "Clinic"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => selectType(value)}
            aria-pressed={counterpartyType === value}
            className={`rounded-btn px-3 py-1.5 text-sm ${counterpartyType === value ? "text-card" : "border border-line text-ink-soft"}`}
            style={counterpartyType === value ? { background: "var(--color-tint)" } : undefined}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="micro">Doctor</span>
          <select value={doctorID} onChange={(e) => setDoctorID(e.target.value)}
            className="mt-1 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink">
            {doctorOptions.map((d) => <option key={d.doctorId} value={d.doctorId}>{d.doctorName}</option>)}
          </select>
        </label>
        {options.length === 0 ? (
          <p className="self-end pb-1.5 text-sm text-ink-soft">
            {counterpartyType === "nurse"
              ? "No nurse accounts yet."
              : "No clinic accounts yet — create a clinic account first."}
          </p>
        ) : (
          <label className="block">
            <span className="micro">{counterpartyType === "nurse" ? "Nurse" : "Clinic"}</span>
            <select value={counterpartyID} onChange={(e) => setCounterpartyID(e.target.value)}
              className="mt-1 w-full rounded-field border border-line bg-card px-2.5 py-1.5 text-sm text-ink">
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
        )}
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
        <button onClick={submit} disabled={submitting || options.length === 0} className="rounded-btn px-4 py-1.5 text-sm font-medium text-card disabled:opacity-60" style={{ background: "var(--color-tint)" }}>
          {submitting ? "Creating…" : "Create relationship"}
        </button>
      </div>
    </section>
  );
}
