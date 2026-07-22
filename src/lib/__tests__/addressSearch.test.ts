import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatPhotonAddress, searchAddresses } from "@/lib/addressSearch";

// The address suggestion source feeds fields that print onto legal documents, so the two
// behaviours pinned here are: what a geocoder hit turns INTO (a single AU-style line, or
// nothing when the hit has no street), and that every failure path degrades to no
// suggestions rather than throwing into a clinical form.

function photonResponse(features: Record<string, unknown>[]) {
  return { ok: true, json: async () => ({ features: features.map((properties) => ({ properties })) }) };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatPhotonAddress", () => {
  it("formats a full street hit as number street, locality STATE postcode", () => {
    expect(formatPhotonAddress({
      housenumber: "12", street: "Smith Street", suburb: "Richmond",
      state: "Victoria", postcode: "3121", countrycode: "AU",
    })).toBe("12 Smith Street, Richmond VIC 3121");
  });

  it("abbreviates every Australian state and territory", () => {
    const abbreviated = (state: string) =>
      formatPhotonAddress({ housenumber: "1", street: "Test St", state });
    expect(abbreviated("New South Wales")).toBe("1 Test St, NSW");
    expect(abbreviated("Queensland")).toBe("1 Test St, QLD");
    expect(abbreviated("Australian Capital Territory")).toBe("1 Test St, ACT");
  });

  it("keeps an unrecognised state verbatim rather than dropping it", () => {
    expect(formatPhotonAddress({ housenumber: "1", street: "Test St", state: "Otago" }))
      .toBe("1 Test St, Otago");
  });

  it("falls back through the locality fields when suburb is absent", () => {
    expect(formatPhotonAddress({
      housenumber: "5", street: "George Street", city: "Sydney", state: "New South Wales", postcode: "2000",
    })).toBe("5 George Street, Sydney NSW 2000");
  });

  it("omits the house number when the hit has only a street", () => {
    expect(formatPhotonAddress({ street: "Chapel Street", suburb: "Prahran", state: "Victoria" }))
      .toBe("Chapel Street, Prahran VIC");
  });

  it("returns null for a hit with no street-level anchor", () => {
    // A whole suburb or a POI would otherwise fill a premises field with a non-address.
    expect(formatPhotonAddress({ name: "Richmond", city: "Melbourne", state: "Victoria" })).toBeNull();
  });
});

describe("searchAddresses", () => {
  it("does not call the geocoder for a query under 4 characters", async () => {
    expect(await searchAddresses("12 ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds the query to Australia", async () => {
    fetchMock.mockResolvedValue(photonResponse([]));
    await searchAddresses("12 Smith Street");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("bbox=112.9,-43.9,153.7,-9.0");
    expect(url).toContain(`q=${encodeURIComponent("12 Smith Street")}`);
  });

  it("maps hits to formatted labels, skipping non-street and non-AU results", async () => {
    fetchMock.mockResolvedValue(photonResponse([
      { housenumber: "12", street: "Smith Street", suburb: "Richmond", state: "Victoria", postcode: "3121", countrycode: "AU" },
      { name: "Richmond", city: "Melbourne", state: "Victoria", countrycode: "AU" },
      { housenumber: "12", street: "Smith Street", suburb: "Auckland", state: "Auckland", countrycode: "NZ" },
    ]));
    expect(await searchAddresses("12 Smith")).toEqual([
      { id: "12 Smith Street, Richmond VIC 3121", label: "12 Smith Street, Richmond VIC 3121" },
    ]);
  });

  it("de-duplicates identical formatted lines", async () => {
    const hit = { housenumber: "12", street: "Smith Street", suburb: "Richmond", state: "Victoria", postcode: "3121" };
    fetchMock.mockResolvedValue(photonResponse([hit, { ...hit }]));
    expect(await searchAddresses("12 Smith")).toHaveLength(1);
  });

  it("caps the list at six suggestions", async () => {
    fetchMock.mockResolvedValue(photonResponse(
      Array.from({ length: 10 }, (_, i) => ({ housenumber: String(i), street: "Smith Street", suburb: "Richmond" })),
    ));
    expect(await searchAddresses("Smith Street")).toHaveLength(6);
  });

  it("returns nothing when the geocoder responds with an error status", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await searchAddresses("12 Smith Street")).toEqual([]);
  });

  it("returns nothing when the network throws — typing must never be blocked", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await searchAddresses("12 Smith Street")).toEqual([]);
  });

  it("returns nothing when a newer keystroke aborts the request", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    expect(await searchAddresses("12 Smith Street")).toEqual([]);
  });
});
