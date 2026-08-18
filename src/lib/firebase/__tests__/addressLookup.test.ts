import { beforeEach, describe, expect, it, vi } from "vitest";

const callable = vi.fn();
const httpsCallable = vi.fn(() => callable);

vi.mock("firebase/functions", () => ({
  httpsCallable: (...args: unknown[]) => httpsCallable(...args),
}));
vi.mock("@/lib/firebase/client", () => ({ functions: () => ({}) }));

import { autocompleteAddress, resolveAddress } from "@/lib/firebase/addressLookup";

const SESSION_TOKEN = "d9428888-122b-4a8f-a585-89e1f51ed487";

beforeEach(() => {
  callable.mockReset();
  httpsCallable.mockClear();
});

describe("address lookup callables", () => {
  it("calls autocompleteAddress with the typed input and session token", async () => {
    callable.mockResolvedValue({
      data: { predictions: [{ placeId: "p1", label: "12 Smith Street, Richmond VIC 3121, Australia" }] },
    });

    await expect(autocompleteAddress("12 Smith", SESSION_TOKEN)).resolves.toEqual([
      { placeId: "p1", label: "12 Smith Street, Richmond VIC 3121, Australia" },
    ]);

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "autocompleteAddress");
    expect(callable).toHaveBeenCalledWith({ input: "12 Smith", sessionToken: SESSION_TOKEN });
  });

  it("returns only trimmed complete predictions and caps them at six", async () => {
    callable.mockResolvedValue({
      data: {
        predictions: [
          { placeId: " p1 ", label: " First Street " },
          { placeId: "", label: "Missing ID" },
          { placeId: "p2", label: "   " },
          { placeId: 3, label: "Non-string ID" },
          { placeId: "p3", label: ["Non-string label"] },
          null,
          { placeId: "p4", label: "Fourth Street" },
          { placeId: "p5", label: "Fifth Street" },
          { placeId: "p6", label: "Sixth Street" },
          { placeId: "p7", label: "Seventh Street" },
          { placeId: "p8", label: "Eighth Street" },
          { placeId: "p9", label: "Ninth Street" },
        ],
      },
    });

    await expect(autocompleteAddress("12 Smith", SESSION_TOKEN)).resolves.toEqual([
      { placeId: "p1", label: "First Street" },
      { placeId: "p4", label: "Fourth Street" },
      { placeId: "p5", label: "Fifth Street" },
      { placeId: "p6", label: "Sixth Street" },
      { placeId: "p7", label: "Seventh Street" },
      { placeId: "p8", label: "Eighth Street" },
    ]);
  });

  it("calls resolveAddress with the exact selection payload", async () => {
    callable.mockResolvedValue({
      data: { address: " Unit 5/12 Smith Street, Richmond VIC 3121, Australia " },
    });

    await expect(resolveAddress("p1", "Unit 5/12 Smith", SESSION_TOKEN)).resolves.toBe(
      "Unit 5/12 Smith Street, Richmond VIC 3121, Australia",
    );

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), "resolveAddress");
    expect(callable).toHaveBeenCalledWith({
      placeId: "p1",
      input: "Unit 5/12 Smith",
      sessionToken: SESSION_TOKEN,
    });
  });

  it("rejects a missing, non-string, or blank resolved address", async () => {
    for (const data of [{}, { address: 3 }, { address: "   " }]) {
      callable.mockResolvedValueOnce({ data });
      await expect(resolveAddress("p1", "Unit 5/12 Smith", SESSION_TOKEN)).rejects.toThrow(
        "Address resolution returned no address",
      );
    }
  });

  it("propagates callable failures for the caller to handle", async () => {
    const authError = new Error("unauthenticated");
    callable.mockRejectedValue(authError);

    await expect(autocompleteAddress("12 Smith", SESSION_TOKEN)).rejects.toBe(authError);
  });
});
