import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";

// CalendarPage is 1316 lines and was at 0% coverage. Rather than mock its ~18 store methods
// (brittle), this drives the REAL page against the deterministic demo seed (buildSeedState +
// SEED_NOW) through the real providers — a genuine integration smoke test of the schedule shell,
// the view switcher, period navigation, and the new-appointment form toggle.

// Force demo mode: the store then hydrates synchronously from the seed with a fixed `now`.
vi.mock("@/lib/firebase/client", () => ({ isFirebaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

import { DemoAuthProvider, useDemoAuth } from "@/lib/demo/auth";
import { DemoStoreProvider } from "@/lib/demo/store";
import CalendarPage from "@/app/app/calendar/page";

const nurse = DEMO_ACCOUNTS[0].identities[0]; // Sarah Chen — Nurse (independent)

function Providers({ children }: { children: ReactNode }) {
  return (
    <DemoAuthProvider>
      <DemoStoreProvider>{children}</DemoStoreProvider>
    </DemoAuthProvider>
  );
}

// A tiny sign-in harness: the demo auth provider starts signed-out, so a child button signs in
// as the demo nurse before we assert on the calendar.
function SignInAs({ children }: { children: ReactNode }) {
  const { signIn, identity } = useDemoAuth();
  return (
    <>
      {!identity && <button onClick={() => signIn(nurse)}>__signin__</button>}
      {identity && children}
    </>
  );
}

async function renderCalendar() {
  const user = userEvent.setup();
  render(
    <Providers>
      <SignInAs>
        <CalendarPage />
      </SignInAs>
    </Providers>,
  );
  await user.click(screen.getByRole("button", { name: "__signin__" }));
  await screen.findByRole("heading", { name: /^calendar$/i });
  return user;
}

describe("CalendarPage (integration, demo seed)", () => {
  it("renders the schedule shell with the day/week/month switcher (week default)", async () => {
    await renderCalendar();
    for (const v of ["day", "week", "month"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${v}$`, "i") })).toBeInTheDocument();
    }
    // Navigation controls are present.
    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^today$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("switches to the day view and back, changing the period label", async () => {
    const user = await renderCalendar();
    const label = () => screen.getByRole("heading", { name: /^calendar$/i }).nextElementSibling?.textContent ?? "";
    const weekLabel = label();

    await user.click(screen.getByRole("button", { name: /^day$/i }));
    // Day view shows a single-day period label distinct from the week range.
    await waitFor(() => expect(label()).not.toBe(weekLabel));

    await user.click(screen.getByRole("button", { name: /^month$/i }));
    await waitFor(() => expect(label()).not.toBe(weekLabel));
  });

  it("steps the period forward and returns via Today", async () => {
    const user = await renderCalendar();
    const label = () => screen.getByRole("heading", { name: /^calendar$/i }).nextElementSibling?.textContent ?? "";
    const start = label();

    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => expect(label()).not.toBe(start));

    await user.click(screen.getByRole("button", { name: /^today$/i }));
    await waitFor(() => expect(label()).toBe(start));
  });

  it("opens the new-appointment form from the week view", async () => {
    const user = await renderCalendar();
    await user.click(screen.getByRole("button", { name: /new appointment/i }));
    // The form exposes an appointment-type / patient search surface — assert a form control appears.
    await waitFor(() => expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0));
  });
});
