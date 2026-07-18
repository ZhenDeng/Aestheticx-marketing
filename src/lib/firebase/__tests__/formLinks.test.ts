import { describe, it, expect, vi, beforeEach } from "vitest";

// createFormLink mints a single-use signing link via the createFormLink onCall Function.
// Mock the callable to assert the wire args + the response handling.

const callable = vi.fn();
const httpsCallable = vi.fn(() => callable);
vi.mock("firebase/functions", () => ({ httpsCallable: (...a: unknown[]) => httpsCallable(...a) }));
vi.mock("@/lib/firebase/client", () => ({ functions: () => ({}) }));

import { createFormLink } from "@/lib/firebase/formLinks";

beforeEach(() => {
  callable.mockReset();
  httpsCallable.mockClear();
});

describe("createFormLink", () => {
  it("calls the createFormLink function with the patient id + template and returns the url", async () => {
    callable.mockResolvedValue({ data: { token: "tok-1", url: "https://app.test/s/tok-1" } });
    const res = await createFormLink("p1", "antiwrinkleConsent");

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "createFormLink");
    expect(callable).toHaveBeenCalledWith({ patientId: "p1", template: "antiwrinkleConsent" });
    expect(res).toEqual({ token: "tok-1", url: "https://app.test/s/tok-1" });
  });

  it("defaults the token to empty when the function omits it", async () => {
    callable.mockResolvedValue({ data: { url: "https://app.test/s/x" } });
    await expect(createFormLink("p1", "antiwrinkleConsent")).resolves.toEqual({ token: "", url: "https://app.test/s/x" });
  });

  it("throws when the function returns no url", async () => {
    callable.mockResolvedValue({ data: {} });
    await expect(createFormLink("p1", "antiwrinkleConsent")).rejects.toThrow(/no url/i);
  });
});
