import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity, Patient } from "@/lib/demo/types";

// PatientAvatar (0% coverage): a monogram (given+last initial) until a photo is uploaded, then an
// <img>. PatientAvatarPicker gates the upload control on canEdit and, in demo mode, stores the
// picked bytes as a data URL.

const setPatientAvatar = vi.fn();
vi.mock("@/lib/demo/store", () => ({
  useDemoStore: () => ({ status: "demo" as const, setPatientAvatar }),
}));

import { PatientAvatar, PatientAvatarPicker } from "@/components/app/PatientAvatar";

function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: "p1", givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 5, day: 2 },
    gender: "Female", address: "", phone: "", email: "", allergies: "", currentMedications: "",
    owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [], ...over,
  };
}
const nurse: Identity = { user: { id: "u-sarah", name: "Sarah" }, role: "nurse", context: { kind: "independent" } };

beforeEach(() => setPatientAvatar.mockClear());

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
