import { describe, expect, it } from "vitest";
import {
  PATIENT_FORM_LINKS_KEY, PATIENT_FORM_SUBMISSIONS_KEY,
  findPatientFormLink, formLinkAccountKey, loadPatientFormSubmissions, patientFormUrl,
  removePatientFormLink, removePatientFormSubmission, sanitizeDraft, savePatientFormLink,
  savePatientFormSubmission, submissionsForAccount,
  type PatientFormLink, type PatientFormSubmission,
} from "@/lib/demo/patientFormLinks";
import { emptyDraft, type Identity } from "@/lib/demo/types";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as Storage;
}
function throwingStorage(): Storage {
  const boom = () => { throw new Error("denied"); };
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 } as unknown as Storage;
}

const doctor: Identity = { user: { id: "u-doc", name: "Zhexia" }, role: "doctor", context: { kind: "independent" } };
const doctorAtClinic: Identity = { user: { id: "u-doc", name: "Zhexia" }, role: "doctor", context: { kind: "clinic", clinic: { id: "clinic-lumiere", name: "Lumière" } } };
const nurse: Identity = { user: { id: "u-nurse", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

function link(token: string, identity: Identity): PatientFormLink {
  return { token, accountKey: formLinkAccountKey(identity), accountName: identity.user.name, createdAt: 1 };
}
function submission(id: string, identity: Identity, at = 1): PatientFormSubmission {
  return { id, token: `t-${id}`, accountKey: formLinkAccountKey(identity), draft: emptyDraft(), submittedAt: at };
}

describe("formLinkAccountKey", () => {
  it("distinguishes the same user under different contexts", () => {
    expect(formLinkAccountKey(doctor)).toBe("u-doc|doctor:independent");
    expect(formLinkAccountKey(doctorAtClinic)).toBe("u-doc|doctor:clinic-lumiere");
    expect(formLinkAccountKey(doctor)).not.toBe(formLinkAccountKey(doctorAtClinic));
  });
});

describe("patientFormUrl", () => {
  it("builds the public intake URL", () => {
    expect(patientFormUrl("https://x.test", "tok-1")).toBe("https://x.test/intake/tok-1");
  });
});

describe("link round trip", () => {
  it("saves, finds, and removes a link", () => {
    const s = memoryStorage();
    expect(savePatientFormLink(s, link("tok-1", doctor))).toBe(true);
    expect(findPatientFormLink(s, "tok-1")?.accountKey).toBe("u-doc|doctor:independent");
    removePatientFormLink(s, "tok-1"); // a submit consumes the link
    expect(findPatientFormLink(s, "tok-1")).toBeNull();
  });
  it("keeps other links when one is removed", () => {
    const s = memoryStorage();
    savePatientFormLink(s, link("tok-1", doctor));
    savePatientFormLink(s, link("tok-2", nurse));
    removePatientFormLink(s, "tok-1");
    expect(findPatientFormLink(s, "tok-2")).not.toBeNull();
  });
  it("returns null for unknown tokens and corrupt JSON, and survives throwing storage", () => {
    expect(findPatientFormLink(memoryStorage(), "nope")).toBeNull();
    expect(findPatientFormLink(memoryStorage({ [PATIENT_FORM_LINKS_KEY]: "{not json" }), "tok-1")).toBeNull();
    expect(findPatientFormLink(throwingStorage(), "tok-1")).toBeNull();
    expect(savePatientFormLink(throwingStorage(), link("tok-1", doctor))).toBe(false);
    expect(() => removePatientFormLink(throwingStorage(), "tok-1")).not.toThrow();
  });
});

describe("submission round trip", () => {
  it("saves and removes submissions", () => {
    const s = memoryStorage();
    expect(savePatientFormSubmission(s, submission("s1", doctor))).toBe(true);
    expect(Object.keys(loadPatientFormSubmissions(s))).toEqual(["s1"]);
    removePatientFormSubmission(s, "s1");
    expect(loadPatientFormSubmissions(s)).toEqual({});
  });
  it("reports failure instead of silently losing a visitor's details", () => {
    expect(savePatientFormSubmission(throwingStorage(), submission("s1", doctor))).toBe(false);
  });
  it("drops malformed entries instead of crashing", () => {
    const raw = JSON.stringify({ ok: submission("ok", doctor), bad: { id: 42 }, worse: null });
    const subs = loadPatientFormSubmissions(memoryStorage({ [PATIENT_FORM_SUBMISSIONS_KEY]: raw }));
    expect(Object.keys(subs)).toEqual(["ok"]);
  });
});

describe("submissionsForAccount — the only-this-account rule", () => {
  it("returns only the generating account's submissions, newest first", () => {
    const subs = {
      a: submission("a", doctor, 10),
      b: submission("b", nurse, 20),
      c: submission("c", doctor, 30),
      d: submission("d", doctorAtClinic, 40), // same user, different context — NOT visible
    };
    expect(submissionsForAccount(subs, doctor).map((s) => s.id)).toEqual(["c", "a"]);
    expect(submissionsForAccount(subs, nurse).map((s) => s.id)).toEqual(["b"]);
    expect(submissionsForAccount(subs, doctorAtClinic).map((s) => s.id)).toEqual(["d"]);
  });
});

describe("sanitizeDraft", () => {
  it("passes a well-formed draft through", () => {
    const d = { ...emptyDraft(), givenName: "Ada", dateOfBirth: { year: 1990, month: 2, day: 3 } };
    expect(sanitizeDraft(d)).toEqual(d);
  });
  it("coerces garbage to blanks the normal validation then reports", () => {
    const out = sanitizeDraft({ givenName: 42, dateOfBirth: "1990-02-03", extra: "dropped" });
    expect(out.givenName).toBe("");
    expect(out.dateOfBirth).toBeNull();
    expect(out).not.toHaveProperty("extra");
    expect(sanitizeDraft(null)).toEqual(emptyDraft());
  });
});
