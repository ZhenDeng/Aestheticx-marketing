import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Patient } from "@/lib/demo/types";
import { PatientRow } from "@/components/app/PatientRow";

// PatientRow (0% coverage) is the shared patient list row: monogram avatar + display name +
// DOB · phone, with an "Alert" badge when the file carries one. PatientAvatar reads no store for
// the monogram path, so this renders standalone.

function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: "p1", givenName: "Amara", lastName: "Boyd", dateOfBirth: { year: 1990, month: 5, day: 2 },
    gender: "Female", address: "", phone: "0400 111 222", email: "", allergies: "", currentMedications: "",
    owner: { kind: "nurse", id: "u-sarah" }, prescribingDoctorIDs: [], ...over,
  };
}

describe("PatientRow", () => {
  it("links to the patient file and shows name + DOB · phone", () => {
    render(<PatientRow patient={patient()} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/app/patients/p1");
    expect(screen.getByText("Amara Boyd")).toBeInTheDocument();
    expect(screen.getByText("2/5/1990 · 0400 111 222")).toBeInTheDocument();
  });

  it("renders the preferred name in the display name", () => {
    render(<PatientRow patient={patient({ preferredName: "Mara" })} />);
    expect(screen.getByText("Amara 'Mara' Boyd")).toBeInTheDocument();
  });

  it("shows an Alert badge only when the file has an alert", () => {
    const { rerender } = render(<PatientRow patient={patient()} />);
    expect(screen.queryByText("Alert")).not.toBeInTheDocument();

    rerender(<PatientRow patient={patient({ alert: "Latex allergy" })} />);
    expect(screen.getByText("Alert")).toBeInTheDocument();
  });
});
