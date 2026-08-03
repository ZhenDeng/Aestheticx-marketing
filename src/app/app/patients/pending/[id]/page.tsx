"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDemoAuth } from "@/lib/demo/auth";
import { useDemoStore } from "@/lib/demo/store";
import { PatientForm } from "@/components/app/PatientForm";

// Review a form-link submission (change: patient-form-link-generation). The selector already
// scopes to the generating account, so any other identity — including the same user under a
// different role/clinic — sees "not available", never the card. Approve runs the ordinary
// createPatient path (the form is editable first); Decline discards the submission.
export default function PendingPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { identity } = useDemoAuth();
  const store = useDemoStore();
  const router = useRouter();
  // Two-step decline: first tap arms, second confirms (it discards the submission for good).
  const [armDecline, setArmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!identity) return null;
  if (store.status === "loading") return <p className="text-ink-soft">Loading…</p>;

  const submission = store.patientFormSubmissionsFor(identity).find((s) => s.id === id);
  if (!submission) {
    return (
      <div>
        <Link href="/app/patients" className="text-sm text-ink-soft hover:text-ink">← Back to patients</Link>
        <p className="mt-4 text-ink-soft">
          This submission isn&apos;t available — it may already be approved or declined, or it belongs to another account.
        </p>
      </div>
    );
  }

  function decline() {
    if (!armDecline) {
      setArmDecline(true);
      return;
    }
    try {
      store.declinePatientFormSubmission(submission!.id, identity!);
      router.push("/app/patients");
    } catch {
      setError("Could not decline the submission. Please try again.");
    }
  }

  return (
    <div>
      <Link href="/app/patients" className="text-sm text-ink-soft hover:text-ink">← Back to patients</Link>
      <p className="mt-3 max-w-2xl text-sm text-ink-soft">
        Submitted via your new patient form link on{" "}
        {new Date(submission.submittedAt).toLocaleDateString("en-AU")}. Check the details — edit
        anything that needs fixing — then approve to create the patient file, or decline to discard.
      </p>
      <div className="mt-4">
        <PatientForm
          mode="create"
          initial={submission.draft}
          title="Review patient submission"
          submitLabel="Approve & create patient"
          create={(draft) => store.approvePatientFormSubmission(submission.id, draft, identity!)}
          onCancel={() => router.push("/app/patients")}
        />
      </div>
      <div className="mt-8 max-w-2xl rounded-card border border-line bg-card p-5">
        <p className="text-sm text-ink-soft">Not a genuine enquiry, or a duplicate? Declining discards the submission.</p>
        {error && <p className="mt-2 text-sm" style={{ color: "var(--color-rose)" }}>{error}</p>}
        <button type="button" onClick={decline}
          className="mt-3 rounded-btn border px-4 py-2 text-sm"
          style={{ borderColor: "var(--color-rose)", color: "var(--color-rose)" }}>
          {armDecline ? "Confirm decline" : "Decline submission"}
        </button>
        {armDecline && (
          <button type="button" onClick={() => setArmDecline(false)}
            className="ml-2 mt-3 rounded-btn border border-line px-4 py-2 text-sm text-ink-soft hover:border-tint">
            Keep it
          </button>
        )}
      </div>
    </div>
  );
}
