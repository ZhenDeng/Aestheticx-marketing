import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import type { Identity } from "@/lib/demo/types";

// The two entry points to the /app area, now served from separate routes: DemoLoginForm at
// /demo (pick a preset role, forces the sandbox on) and LiveLoginForm at /login (email +
// password, and leaves the sandbox). The post-login destination is role-aware and honours
// ?next= (authRedirect), so these tests pin down both the role→home mapping and the
// open-redirect correction — plus the mode switch each form owns.

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

// Mutable auth value so a test can flip mode / populate identity and re-render, mirroring the
// live async identity resolution (signInLive resolves, then the Firebase listener lands identity).
type AuthValue = ReturnType<typeof baseAuth>;
function baseAuth() {
  return {
    mode: "demo" as "demo" | "live",
    identity: null as Identity | null,
    accounts: DEMO_ACCOUNTS,
    signIn: vi.fn(),
    signInLive: vi.fn(async () => {}),
    selectIdentity: vi.fn(),
    enterDemoMode: vi.fn(),
    exitDemoMode: vi.fn(),
    signOut: vi.fn(),
  };
}
let auth: AuthValue;
vi.mock("@/lib/demo/auth", () => ({ useDemoAuth: () => auth }));

// loginPrefs touches localStorage — jsdom provides it; assert the remembered-email prefill.
import { saveLoginPrefs } from "@/lib/demo/loginPrefs";
import { DemoLoginForm, LiveLoginForm } from "@/components/app/LoginForm";

beforeEach(() => {
  auth = baseAuth();
  push.mockClear();
  replace.mockClear();
  window.localStorage.clear();
  window.history.pushState({}, "", "/demo");
});

describe("DemoLoginForm (/demo)", () => {
  it("switches the tab into the sandbox on mount", () => {
    // This is what makes /demo work on a Firebase-configured deployment — without it the
    // picker would render but the app behind it would still talk to Firestore.
    render(<DemoLoginForm />);
    expect(auth.enterDemoMode).toHaveBeenCalled();
    expect(auth.exitDemoMode).not.toHaveBeenCalled();
  });

  it("renders no email/password fields", () => {
    render(<DemoLoginForm />);
    expect(screen.queryByRole("textbox", { name: /email/i })).not.toBeInTheDocument();
  });

  it("lists every preset account and routes clinical roles to the dashboard", async () => {
    const user = userEvent.setup();
    render(<DemoLoginForm />);

    // Every demo account is offered as a radio option.
    for (const acc of DEMO_ACCOUNTS) {
      expect(screen.getByText(acc.label)).toBeInTheDocument();
    }

    // Default selection is the first account (Sarah — Nurse) → dashboard.
    await user.click(screen.getByRole("button", { name: /enter the demo/i }));
    expect(auth.signIn).toHaveBeenCalledWith(DEMO_ACCOUNTS[0].identities[0]);
    expect(push).toHaveBeenCalledWith("/app/dashboard");
  });

  it("routes the Platform Admin to the admin shell, not the clinical dashboard", async () => {
    const user = userEvent.setup();
    render(<DemoLoginForm />);

    const adminIdx = DEMO_ACCOUNTS.findIndex((a) => a.identities[0].role === "superAdmin");
    const adminLabel = screen.getByText(DEMO_ACCOUNTS[adminIdx].label);
    await user.click(adminLabel);
    await user.click(screen.getByRole("button", { name: /enter the demo/i }));

    expect(auth.signIn).toHaveBeenCalledWith(DEMO_ACCOUNTS[adminIdx].identities[0]);
    expect(push).toHaveBeenCalledWith("/app/admin");
  });

  it("honours a valid in-app ?next= target for the role", async () => {
    window.history.pushState({}, "", "/demo?next=%2Fapp%2Fcalendar");
    const user = userEvent.setup();
    render(<DemoLoginForm />);

    await user.click(screen.getByRole("button", { name: /enter the demo/i }));
    expect(push).toHaveBeenCalledWith("/app/calendar");
  });

  it("corrects a ?next= the role may not reach (nurse aimed at admin) back to the dashboard", async () => {
    window.history.pushState({}, "", "/demo?next=%2Fapp%2Fadmin");
    const user = userEvent.setup();
    render(<DemoLoginForm />); // default account is a nurse — admin is off-limits

    await user.click(screen.getByRole("button", { name: /enter the demo/i }));
    expect(push).toHaveBeenCalledWith("/app/dashboard");
  });
});

describe("LiveLoginForm (/login)", () => {
  it("leaves the sandbox on mount", () => {
    // A visitor who wandered in from /demo must get a clean live sign-in, not a form
    // rendered over a sandboxed store.
    render(<LiveLoginForm />);
    expect(auth.exitDemoMode).toHaveBeenCalled();
    expect(auth.enterDemoMode).not.toHaveBeenCalled();
  });

  it("renders no preset role picker", () => {
    render(<LiveLoginForm />);
    for (const acc of DEMO_ACCOUNTS) {
      expect(screen.queryByText(acc.label)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /enter the demo/i })).not.toBeInTheDocument();
  });

  it("prefills the remembered email but never a password", () => {
    saveLoginPrefs(window.localStorage, { email: "nurse@demo.test", remember: true });
    render(<LiveLoginForm />);
    expect(screen.getByRole("textbox", { name: /email/i })).toHaveValue("nurse@demo.test");
    // Password field starts empty (no name→value leak from prefs).
    const pw = document.querySelector('input[type="password"]') as HTMLInputElement;
    expect(pw.value).toBe("");
  });

  it("shows an inline error and does not navigate when sign-in fails", async () => {
    auth.signInLive = vi.fn(async () => {
      throw new Error("wrong password");
    });
    const user = userEvent.setup();
    render(<LiveLoginForm />);

    await user.type(screen.getByRole("textbox", { name: /email/i }), "nurse@demo.test");
    await user.type(document.querySelector('input[type="password"]') as HTMLInputElement, "wrong");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByText(/sign-in failed/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    // Button re-enables so the user can retry.
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeEnabled();
  });

  it("redirects reactively to the role home once the identity resolves", () => {
    auth.identity = { user: { id: "u-sarah", name: "Sarah Chen" }, role: "nurse", context: { kind: "independent" } };
    render(<LiveLoginForm />);
    // The effect fires on mount when identity is already present (already-signed-in forward).
    expect(replace).toHaveBeenCalledWith("/app/dashboard");
  });

  it("calls signInLive with the remember-me preference the user chose", async () => {
    const user = userEvent.setup();
    render(<LiveLoginForm />);

    await user.type(screen.getByRole("textbox", { name: /email/i }), "doc@demo.test");
    await user.type(document.querySelector('input[type="password"]') as HTMLInputElement, "secret");
    // Untick "remember me".
    await user.click(screen.getByRole("checkbox", { name: /remember me/i }));
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(auth.signInLive).toHaveBeenCalledWith("doc@demo.test", "secret", false);
  });
});
