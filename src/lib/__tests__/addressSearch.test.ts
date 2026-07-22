import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { biasForAddress, formatPhotonAddress, matchesQuery, parseAddressQuery, searchAddresses, stateFromAddress } from "@/lib/addressSearch";
import UNFILTERED_1_SMITH from "./fixtures/photon-1-smith-unfiltered.json";

// The address suggestion source feeds fields that print onto legal documents. The behaviours
// pinned here are: what a geocoder hit turns INTO, which hits are REJECTED as not-what-was-typed,
// and that every failure path degrades to no suggestions rather than throwing into a clinical form.
//
// `fixtures/photon-1-smith-unfiltered.json` is a REAL recorded Photon response, not a hand-written
// stub. The 22/07 regression (PR #153) shipped because every test used an idealised stub shaped the
// way the provider was assumed to behave: the formatting was correct and the provider's actual
// ranking was never exercised. Keep at least one test running against recorded reality.

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

describe("parseAddressQuery", () => {
  it("pulls out the house number and the street anchor word", () => {
    expect(parseAddressQuery("12 Smith Street")).toEqual({
      houseNumber: "12", streetPhrase: "smith street", extraWords: [], search: "12 smith street",
    });
  });

  it("has no house number when the text starts with a street name", () => {
    expect(parseAddressQuery("Chapel Street").houseNumber).toBeUndefined();
    expect(parseAddressQuery("Chapel Street").streetPhrase).toBe("chapel street");
  });

  it("never ends the street on its own first word", () => {
    // "St Kilda Road" opens with a street-type word; stopping there would anchor on "st".
    expect(parseAddressQuery("2 St Kilda Road").streetPhrase).toBe("st kilda road");
  });

  it("ends the street at its type word, keeping the rest as ranking hints", () => {
    // Matching the whole remainder would let a typed suburb reject the street it names.
    expect(parseAddressQuery("12 High Street Prahran")).toMatchObject({
      houseNumber: "12", streetPhrase: "high street", extraWords: ["prahran"],
    });
  });

  it("keeps the whole remainder while the street type is still untyped", () => {
    expect(parseAddressQuery("12 Chapel")).toMatchObject({ streetPhrase: "chapel", extraWords: [] });
  });

  it.each([
    ["Suite 5 200 Queen Street", "200", "200 queen street"],
    ["Unit 5, 200 Queen Street", "200", "200 queen street"],
    ["5/200 Queen Street", "200", "200 queen street"],
    ["Shop 3 45 Oxford Street", "45", "45 oxford street"],
    ["Level 1 100 Collins Street", "100", "100 collins street"],
  ])("strips the sub-dwelling designator in %s", (input, houseNumber, search) => {
    // Left in place the leading 5 reads as the street number, and "5 Queen Street" — a real,
    // wrong address — gets offered for "Suite 5 200 Queen Street".
    expect(parseAddressQuery(input)).toMatchObject({ houseNumber, search });
  });
});

describe("stateFromAddress / biasForAddress", () => {
  it.each([
    ["7/22 Fitzroy St, St Kilda VIC 3182", "VIC"],
    ["1 Test Street, Bondi NSW 2026", "NSW"],
    ["20 Wickham Terrace, Spring Hill Queensland 4000", "QLD"],
  ])("reads the state from %s", (address, state) => {
    expect(stateFromAddress(address)).toBe(state);
  });

  it("takes the LAST state named, not the first", () => {
    // "12 Victoria Road, Bellevue Hill NSW 2023" names Victoria in the STREET; the state slot
    // is the one that means the state.
    expect(stateFromAddress("12 Victoria Road, Bellevue Hill NSW 2023")).toBe("NSW");
  });

  it("has no bias when the address names no state", () => {
    expect(stateFromAddress("12 Smith Street")).toBeUndefined();
    expect(biasForAddress("12 Smith Street")).toBeUndefined();
    expect(biasForAddress(undefined)).toBeUndefined();
  });

  it("maps a state to its capital, which is what the geocoder is biased toward", () => {
    expect(biasForAddress("14 Acland St, St Kilda VIC")).toEqual({ lat: -37.8136, lon: 144.9631 });
  });
});

describe("matchesQuery", () => {
  const typed = parseAddressQuery("12 Smith Street");

  it("accepts a hit carrying the typed number and street", () => {
    expect(matchesQuery({ housenumber: "12", street: "Smith Street" }, typed)).toBe(true);
  });

  it("accepts a lettered or ranged number whose leading digits match", () => {
    expect(matchesQuery({ housenumber: "12a", street: "Smith Street" }, typed)).toBe(true);
    expect(matchesQuery({ housenumber: "12-14", street: "Smith Street" }, typed)).toBe(true);
  });

  it("rejects a different street number", () => {
    // "20 Wickham Terrace" must not offer number 22.
    expect(matchesQuery({ housenumber: "42", street: "Smith Street" }, typed)).toBe(false);
  });

  it("rejects a hit with no number when a number was typed", () => {
    // Selecting it would silently drop the number and save a different address.
    expect(matchesQuery({ street: "Smith Street" }, typed)).toBe(false);
  });

  it("rejects a street that is not the one typed", () => {
    // The live failure: "Everson Road, Gympie" came back for "15 Gympie Road".
    const gympie = parseAddressQuery("15 Gympie Road");
    expect(matchesQuery({ housenumber: "15", street: "Everson Road", city: "Gympie" }, gympie)).toBe(false);
  });

  it("rejects a street that merely contains the first typed word", () => {
    // "Charles Smith Drive" is not "Smith Street"; anchoring on one word accepted it.
    expect(matchesQuery({ housenumber: "12", street: "Charles Smith Drive" }, typed)).toBe(false);
  });

  it("does not reject on a typed suburb", () => {
    // Photon answers "12 chapel street prahran" with "Little Chapel Street" alone, so a
    // suburb must only rank — rejecting on it loses the street the user is heading for.
    const withSuburb = parseAddressQuery("12 Chapel Street Prahran");
    expect(matchesQuery({ housenumber: "12", street: "Chapel Street", suburb: "Cremorne" }, withSuburb)).toBe(true);
  });

  it("accepts any street while only a number has been typed", () => {
    expect(matchesQuery({ housenumber: "12", street: "Anything Road" }, parseAddressQuery("12"))).toBe(true);
  });

  it("rejects a locality even when its name and number look like an address", () => {
    // "1 Abel Smith Crescent" is a locality, carries number 1, and contains "smith" — every
    // other check here passes it. Only the feature type tells them apart.
    expect(matchesQuery(
      { type: "locality", housenumber: "1", street: "Abel Smith Crescent" },
      parseAddressQuery("1 Smith"),
    )).toBe(false);
  });
});

describe("formatPhotonAddress", () => {
  it("formats a full street hit as number street, locality STATE postcode", () => {
    expect(formatPhotonAddress({
      housenumber: "12", street: "Smith Street", suburb: "Richmond",
      state: "Victoria", postcode: "3121", countrycode: "AU",
    })).toBe("12 Smith Street, Richmond VIC 3121");
  });

  it("abbreviates every Australian state and territory", () => {
    const abbreviated = (state: string) => formatPhotonAddress({ housenumber: "1", street: "Test St", state });
    expect(abbreviated("New South Wales")).toBe("1 Test St, NSW");
    expect(abbreviated("Queensland")).toBe("1 Test St, QLD");
    expect(abbreviated("Australian Capital Territory")).toBe("1 Test St, ACT");
  });

  it("keeps an unrecognised state verbatim rather than dropping it", () => {
    expect(formatPhotonAddress({ housenumber: "1", street: "Test St", state: "Otago" })).toBe("1 Test St, Otago");
  });

  it("falls back through the locality fields when suburb is absent", () => {
    expect(formatPhotonAddress({
      housenumber: "5", street: "George Street", city: "Sydney", state: "New South Wales", postcode: "2000",
    })).toBe("5 George Street, Sydney NSW 2000");
  });

  it("keeps a whole-street hit that carries no house number", () => {
    // layer=street results answer an unnumbered query like "Chapel Street".
    expect(formatPhotonAddress({ name: "Chapel Street", suburb: "Prahran", state: "Victoria", postcode: "3181" }))
      .toBe("Chapel Street, Prahran VIC 3181");
  });

  it("returns null for a hit with no street name at all", () => {
    expect(formatPhotonAddress({ city: "Melbourne", state: "Victoria" })).toBeNull();
  });
});

describe("searchAddresses", () => {
  it("does not call the geocoder for a query under 4 characters", async () => {
    expect(await searchAddresses("12 ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("constrains the request to Australian addresses, not localities", async () => {
    fetchMock.mockResolvedValue(photonResponse([]));
    await searchAddresses("12 Smith Street");
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("bbox=112.9,-43.9,153.7,-9.0");
    // Repeated params, not comma-separated — Photon returns nothing for `layer=house,street`.
    expect(url).toContain("layer=house&layer=street");
  });

  it("sends the proximity bias when one is supplied, and omits it otherwise", async () => {
    fetchMock.mockResolvedValue(photonResponse([]));
    await searchAddresses("12 Smith Street", { near: { lat: -37.8136, lon: 144.9631 } });
    expect(fetchMock.mock.calls[0][0]).toContain("lat=-37.8136&lon=144.9631");

    fetchMock.mockClear();
    await searchAddresses("12 Smith Street");
    expect(fetchMock.mock.calls[0][0]).not.toContain("lat=");
  });

  it("ranks an exact street above one that merely contains it", async () => {
    fetchMock.mockResolvedValue(photonResponse([
      { housenumber: "12", street: "Little Chapel Street", suburb: "Prahran", state: "Victoria" },
      { housenumber: "12", street: "Chapel Street", suburb: "Cremorne", state: "Victoria" },
    ]));
    const results = await searchAddresses("12 Chapel Street");
    expect(results[0].label).toBe("12 Chapel Street, Cremorne VIC");
  });

  it("ranks a hit matching the typed suburb first without excluding the others", async () => {
    fetchMock.mockResolvedValue(photonResponse([
      { housenumber: "12", street: "Chapel Street", suburb: "Maldon", state: "Victoria" },
      { housenumber: "12", street: "Chapel Street", suburb: "Prahran", state: "Victoria" },
    ]));
    const results = await searchAddresses("12 Chapel Street Prahran");
    expect(results[0].label).toContain("Prahran");
    expect(results).toHaveLength(2);
  });

  it("sends the geocoder the address without the sub-dwelling designator", async () => {
    fetchMock.mockResolvedValue(photonResponse([]));
    await searchAddresses("Suite 5 200 Queen Street");
    expect(fetchMock.mock.calls[0][0]).toContain(`q=${encodeURIComponent("200 queen street")}`);
  });

  it("maps hits to formatted labels, skipping non-AU and non-matching results", async () => {
    fetchMock.mockResolvedValue(photonResponse([
      { housenumber: "12", street: "Smith Street", suburb: "Richmond", state: "Victoria", postcode: "3121", countrycode: "AU" },
      { housenumber: "12", street: "Jones Street", suburb: "Carlton", state: "Victoria", countrycode: "AU" },
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
      Array.from({ length: 10 }, (_, i) => ({ housenumber: String(i), street: "Smith Street", suburb: `Suburb ${i}` })),
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

  // The 22/07 regression, locked against the real response that caused it.
  it("rejects the locality features Photon ranks above real addresses", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => UNFILTERED_1_SMITH });
    const results = await searchAddresses("1 Smith");

    expect(results.length).toBeGreaterThan(0);
    // Every survivor is a real "1 <something> Smith <type>" address, not a locality.
    for (const r of results) {
      expect(r.label).toMatch(/^1 /);
      expect(r.label.toLowerCase()).toContain("smith");
    }
    // The three Queensland/SA localities that led the raw response are all gone, as is the
    // "Heath Street" hit that shares no street name with the query.
    const labels = results.map((r) => r.label).join(" | ");
    expect(labels).not.toContain("Abel Smith Crescent");
    expect(labels).not.toContain("Smith Lane");
    expect(labels).not.toContain("Heath Street");
  });
});
