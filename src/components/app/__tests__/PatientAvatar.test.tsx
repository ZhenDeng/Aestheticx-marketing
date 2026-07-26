import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity, Patient } from "@/lib/demo/types";

// PatientAvatar (0% coverage): a monogram (given+last initial) until a photo is uploaded, then an
// <img>. PatientAvatarPicker gates the upload control on canEdit and, in demo mode, stores the
// picked bytes as a data URL.

const setPatientAvatar = vi.fn();
let storeStatus: "demo" | "ready" = "demo";
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({ status: storeStatus, setPatientAvatar }),
}));
// Controllable live Storage upload (26/07 dead-button audit): the picker must show a
// pending state for the whole upload, not sit inert until the avatar swaps.
const uploadPatientAvatar = vi.hoisted(() => vi.fn(async () => "patients/p1/avatar/x.png"));
vi.mock("@/lib/firebase/storage", () => ({ uploadPatientAvatar, fileDownloadUrl: vi.fn(async () => "https://example.test/a.png") }));

import { PatientAvatar, PatientAvatarPicker } from "@/components/app/PatientAvatar";

function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: "p1", givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 5, day: 2 },
    gender: "Female", address: "", phone: "", email: "", allergies: "", currentMedications: "",
    owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [], ...over,
  };
}
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

beforeEach(() => {
  setPatientAvatar.mockClear();
  uploadPatientAvatar.mockClear();
  uploadPatientAvatar.mockResolvedValue("patients/p1/avatar/x.png");
  storeStatus = "demo";
});

describe("PatientAvatar", () => {
  it("shows the given+last monogram when there is no photo", () => {
    render(<PatientAvatar patient={patient()} size={56} />);
    expect(screen.getByText("AB")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the photo when an avatar data URL is present", () => {
    render(<PatientAvatar patient={patient({ avatarDataUrl: "data:image/png;base64,abc" })} size={56} />);
    // The decorative photo carries alt="" (presentational), so query by tag, not role.
    const img = document.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "data:image/png;base64,abc");
    expect(screen.queryByText("AB")).not.toBeInTheDocument();
  });
});

describe("PatientAvatarPicker", () => {
  it("is display-only (no picker button) when canEdit is false", () => {
    render(<PatientAvatarPicker patient={patient()} identity={nurse} canEdit={false} />);
    expect(screen.queryByRole("button", { name: /change patient photo/i })).not.toBeInTheDocument();
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("exposes the change-photo control when canEdit is true", () => {
    render(<PatientAvatarPicker patient={patient()} identity={nurse} canEdit />);
    expect(screen.getByRole("button", { name: /change patient photo/i })).toBeInTheDocument();
  });

  // 26/07 feedback (dead-button audit): the live Storage upload ran for seconds with no
  // pending state — the old photo/monogram just sat there until the write landed.
  it("disables the picker and shows an uploading state while the live upload runs", async () => {
    storeStatus = "ready";
    let release!: () => void;
    uploadPatientAvatar.mockImplementationOnce(
      () => new Promise<string>((resolve) => { release = () => resolve("patients/p1/avatar/x.png"); }),
    );
    render(<PatientAvatarPicker patient={patient()} identity={nurse} canEdit />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }));

    const pending = await screen.findByRole("button", { name: /uploading photo/i });
    expect(pending).toBeDisabled();
    expect(setPatientAvatar).not.toHaveBeenCalled(); // still mid-upload

    release();
    await vi.waitFor(() =>
      expect(setPatientAvatar).toHaveBeenCalledWith("p1", { avatarFileId: "patients/p1/avatar/x.png" }, nurse),
    );
    expect(screen.getByRole("button", { name: /change patient photo/i })).toBeEnabled();
  });

  it("stores a picked photo as a data URL in demo mode", async () => {
    render(<PatientAvatarPicker patient={patient()} identity={nurse} canEdit />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    await userEvent.upload(input, file);
    // FileReader.readAsDataURL resolves async → wait for the store write.
    await vi.waitFor(() =>
      expect(setPatientAvatar).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ avatarDataUrl: expect.stringContaining("data:") }),
        nurse,
      ),
    );
  });
});
