// Owner feedback 04/08 bug 2 (mobile): a treatment note authored as
// "Zhexia Shah Wang @ Mara.H Skin&Aesthetics Clinic" pushed the note row wider than the
// phone screen — the kind-pill + author cluster was flex-none and the badge never
// truncated, so a long "name @ clinic" badge could not shrink. jsdom has no real layout,
// so this locks the CSS contract instead: the badge must be allowed to shrink (min-w-0
// down the chain) and ellipsise (truncate) rather than widen the row.
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { emptyState } from "@/lib/demo/backend";
import { patientAccessLevel } from "@/lib/demo/isolation";
import { LUMIERE } from "@/lib/demo/accounts";
import type { DemoState, Identity, Note, Patient } from "@/lib/demo/types";

const LONG_BADGE = "Zhexia Shah Wang @ Mara.H Skin&Aesthetics Clinic";

const nurse: Identity = {
  user: { id: "u-zhexia", name: "Zhexia Shah Wang" },
  role: "nurse",
  context: { kind: "clinic", clinic: LUMIERE },
};

const patient: Patient = {
  id: "p-1", givenName: "Christina", lastName: "Mao",
  dateOfBirth: { year: 1982, month: 10, day: 1 }, gender: "Female",
  address: "50 Cecil Street, Gordon NSW 2072", phone: "0478787180", email: "c@example.com",
  allergies: "nil", currentMedications: "",
  owner: { kind: "clinic", id: LUMIERE.id }, prescribingDoctorIDs: [], openReviewerDoctorIDs: [],
};

// A 1×1 transparent PNG — enough for the strip to render real <img> thumbnails.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const treatmentNote: Note = {
  id: "n-1", patientID: "p-1", kind: "treatment", title: "",
  body: "Anti-wrinkle treatment administered.",
  createdAt: Date.parse("2026-08-04T09:00:00Z"),
  authorID: "u-zhexia", authorBadge: LONG_BADGE,
  consumedAuthorisationIDs: [], medications: [],
  attachments: Array.from({ length: 6 }, (_, i) => ({
    fileID: `patients/p-1/photos/photo-${i}.png`, displayName: `photo-${i}.png`,
    mimeType: "image/png", dataUrl: PIXEL,
  })),
};

const state: DemoState = { ...emptyState(), patients: { [patient.id]: patient } };

vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app/ConsultCall", () => ({ useConsultCall: () => ({ start: vi.fn(), active: false }) }));
vi.mock("@/components/app/PatientAvatar", () => ({ PatientAvatarPicker: () => null, PatientAvatar: () => null }));
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => ({ identity: nurse }) }));
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({
    status: "demo" as const,
    now: Date.parse("2026-08-04T12:00:00Z"),
    state,
    matrixEnabled: true,
    patientAccess: (p: Patient, id: Identity) => patientAccessLevel(state, id, p),
    walletEntries: () => [], walletBalance: () => 0, priceListFor: () => [], invoicesFor: () => [],
    topUpWallet: vi.fn(), checkoutClient: vi.fn(), finalizeServiceFee: vi.fn(),
    visibleNotesForPatient: () => [treatmentNote],
    activeAuthorisations: () => [], activeEmergencyAuthorisations: () => [],
    formsForPatient: () => [], appointmentsForPatient: () => [], openRequestsForPatient: () => [],
    searchPatients: () => [], recordAdminAccess: vi.fn(),
    deletePatient: vi.fn(), mergePatients: vi.fn(), saveGeneralNote: vi.fn(),
    retryAftercare: vi.fn(), withdrawRequest: vi.fn(),
  }),
}));

import PatientFilePage from "@/app/app/patients/[id]/page";

async function renderFile() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <PatientFilePage params={Promise.resolve({ id: "p-1" })} />
      </Suspense>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("patient file — note row with a long author badge (mobile overflow)", () => {
  it("lets the author badge shrink and truncate instead of widening the row", async () => {
    await renderFile();
    // Notes collapse by default (patient-file accordions) — open the section first.
    await userEvent.click(screen.getByRole("button", { name: /notes \(1\)/i }));
    const badge = screen.getByText(LONG_BADGE);
    // The badge itself must ellipsise…
    expect(badge.className).toMatch(/\btruncate\b/);
    // …and every flex wrapper between it and the row must be allowed to shrink below
    // its content width, or the truncation never engages and the row overflows.
    const cluster = badge.parentElement!;
    expect(cluster.className).toMatch(/\bmin-w-0\b/);
    expect(cluster.className).not.toMatch(/\bflex-none\b/);
  });

  // Owner feedback 04/08 follow-up: with photos attached, the collapsed row's thumbnail
  // strip (fixed 40px tiles, non-wrapping flex) grew wider than the left column and slid
  // under the Treatment pill on mobile. Tiles must wrap onto further lines instead.
  it("wraps the photo thumbnail strip instead of sliding under the kind pill", async () => {
    await renderFile();
    await userEvent.click(screen.getByRole("button", { name: /notes \(1\)/i }));
    const thumb = document.querySelector(`img[src="${PIXEL}"]`);
    expect(thumb).not.toBeNull();
    const strip = thumb!.parentElement!;
    expect(strip.className).toMatch(/\bflex-wrap\b/);
  });

  // Wrapping stopped the overlap but left the badge with ~10px beside a photo strip and the
  // pill ("Zhexia Shah Wang @ …" rendered as "S."). A phone row cannot hold photos + pill +
  // badge on one line, so the meta cluster drops to its own line below the title/photos on
  // mobile and only returns beside them from the sm breakpoint up.
  it("stacks the kind pill + author badge below the title on mobile, side-by-side from sm up", async () => {
    await renderFile();
    await userEvent.click(screen.getByRole("button", { name: /notes \(1\)/i }));
    const badge = screen.getByText(LONG_BADGE);
    const row = badge.closest("button")!;
    expect(row.className).toMatch(/\bflex-col\b/);
    expect(row.className).toMatch(/\bsm:flex-row\b/);
    // Stacked children must still be width-bounded, or a long badge re-widens the row.
    expect(badge.parentElement!.className).toMatch(/\bmax-w-full\b/);
  });
});
