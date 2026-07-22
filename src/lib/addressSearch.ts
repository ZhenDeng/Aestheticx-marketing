// Street-address suggestions for the address comboboxes (22/07 feedback #2), backed by the
// Photon geocoder (photon.komoot.io — OpenStreetMap data, keyless, CORS-open, built for
// search-as-you-type). Chosen over Google Places because it needs no API key or billing
// account; swap `searchAddresses` for a keyed provider later without touching callers.
//
// The lookup is best-effort by contract: every failure path returns [] so a network problem
// degrades to plain typing and can never block clinical data entry.
//
// These suggestions land in fields printed onto Clause 68C authorisations and tax invoices, so
// the bar is NOT "show something plausible" — it is "never offer an address the user did not
// ask for". Photon ranks loosely, so relevance is enforced here rather than trusted:
//
//   1. `layer=house|street` — without it Photon ranks `locality` features ABOVE real addresses
//      for a partial query. Localities carry a street-shaped name and formatted
//      indistinguishably from addresses, so "1 Smith" led with three Queensland localities
//      while the real "1 Smith Street" sat seventh (22/07 regression, PR #153).
//   2. `matchesQuery` — even inside those layers Photon returns fuzzy matches ("Everson Road,
//      Gympie" for "15 Gympie Road"). A result must carry the typed house number and the typed
//      street word or it is dropped.
//
// An empty dropdown is the correct outcome when nothing matches: the field is free text, so
// the user simply keeps typing. A wrong suggestion is far more expensive than no suggestion.

export interface AddressSuggestion {
  id: string;
  label: string;
}

interface PhotonProperties {
  /** Photon's feature class: "house", "street", "locality", "district", "city", … */
  type?: string;
  housenumber?: string;
  street?: string;
  name?: string;
  locality?: string;
  district?: string;
  city?: string;
  town?: string;
  village?: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  countrycode?: string;
}

const AU_STATE_ABBREVIATIONS: Record<string, string> = {
  "New South Wales": "NSW",
  "Victoria": "VIC",
  "Queensland": "QLD",
  "South Australia": "SA",
  "Western Australia": "WA",
  "Tasmania": "TAS",
  "Northern Territory": "NT",
  "Australian Capital Territory": "ACT",
};

// Australia bounding box (minLon,minLat,maxLon,maxLat) — Photon restricts results to it, so
// the query never leaves the market the app operates in.
const AUSTRALIA_BBOX = "112.9,-43.9,153.7,-9.0";

// Repeated `layer` params, not comma-separated — Photon returns an empty feature list for
// `layer=house,street` and honours `layer=house&layer=street`.
const ADDRESS_LAYERS = "&layer=house&layer=street";

/** What the user's typed text asks for, as far as it can be pinned down. */
export interface ParsedAddressQuery {
  /** The street number, when the text starts with one after any unit designator. */
  houseNumber?: string;
  /** First meaningful word of the street name — the anchor a result must match. */
  streetWord?: string;
  /** The text to send the geocoder: the typed address minus any unit designator. */
  search: string;
}

// AU addresses commonly lead with a sub-dwelling: "5/200 Queen St", "Unit 5, 200 Queen St",
// "Suite 5 200 Queen St". Left in place, that leading 5 is read as the street number and
// "5 Queen Street" is offered for "Suite 5 200 Queen Street" — a real, wrong address.
const UNIT_PREFIX = /^\s*(?:(?:unit|suite|shop|apt|apartment|level|lot|u)\s*\.?\s*[0-9a-z-]+\s*[,/]?\s*)/i;
const SLASH_PREFIX = /^\s*[0-9]+[a-z]?\s*\/\s*/i;

export function parseAddressQuery(query: string): ParsedAddressQuery {
  const normalised = query.trim().toLowerCase().replace(/\s+/g, " ");
  // Order matters: "unit 5/200" carries both forms. The stripped text is also what gets sent
  // to the geocoder — leaving "suite 5" in the query makes Photon match on the unit and return
  // nothing usable for "Suite 5 200 Queen Street".
  const search = normalised.replace(UNIT_PREFIX, "").replace(SLASH_PREFIX, "").trim();
  let rest = search;

  const houseMatch = /^([0-9]+)[a-z]?\b[\s,]*/.exec(rest);
  const houseNumber = houseMatch?.[1];
  if (houseMatch) rest = rest.slice(houseMatch[0].length);

  // Skip short particles ("st kilda road" must anchor on "kilda", not "st").
  const streetWord = rest.split(/[^a-z]+/).find((w) => w.length >= 3);
  return { houseNumber, streetWord, search: search || normalised };
}

/** The leading numeric part of an OSM house number, so "12a" and "12-14" both read as 12. */
function leadingNumber(value: string | undefined): string | undefined {
  return /^([0-9]+)/.exec(value ?? "")?.[1];
}

/**
 * Whether a geocoder hit is actually what was typed. Strict on purpose — see the file header.
 */
export function matchesQuery(p: PhotonProperties, parsed: ParsedAddressQuery): boolean {
  // Belt and braces with the `layer` params: a locality carries a street-shaped name
  // ("1 Abel Smith Crescent") and a house number, so nothing else here would reject one. The
  // request already asks for house/street only — this holds the line if that param is ever
  // dropped, renamed, or quietly ignored by the provider.
  if (p.type && p.type !== "house" && p.type !== "street") return false;
  if (parsed.houseNumber) {
    // A hit with no number cannot satisfy a numbered query: selecting it would silently drop
    // the number the user typed and produce a different address.
    if (leadingNumber(p.housenumber) !== parsed.houseNumber) return false;
  }
  if (parsed.streetWord) {
    const street = (p.street ?? p.name ?? "").toLowerCase();
    if (!street.includes(parsed.streetWord)) return false;
  }
  return true;
}

/**
 * One AU-style line — "12 Smith Street, Richmond VIC 3121" — or null when the hit carries no
 * street name at all. A hit WITHOUT a house number is kept: `layer=street` results are whole
 * streets ("Chapel Street, Prahran VIC 3181"), which are a legitimate answer when the user
 * typed no number. `matchesQuery` has already rejected them for a numbered query.
 */
export function formatPhotonAddress(p: PhotonProperties): string | null {
  const street = p.street ?? p.name;
  if (!street) return null;
  const line1 = p.housenumber ? `${p.housenumber} ${street}` : street;
  const locality = p.suburb ?? p.district ?? p.city ?? p.town ?? p.village ?? p.locality;
  const state = p.state ? (AU_STATE_ABBREVIATIONS[p.state] ?? p.state) : undefined;
  const tail = [locality, state, p.postcode].filter(Boolean).join(" ");
  return tail ? `${line1}, ${tail}` : line1;
}

export async function searchAddresses(query: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 4) return [];
  const parsed = parseAddressQuery(q);
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(parsed.search)}&limit=20&lang=en${ADDRESS_LAYERS}&bbox=${AUSTRALIA_BBOX}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: { properties?: PhotonProperties }[] };
    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    for (const feature of data.features ?? []) {
      const props = feature.properties ?? {};
      // The bbox clips to Australia already; the countrycode check guards border overlap.
      if (props.countrycode && props.countrycode.toUpperCase() !== "AU") continue;
      if (!matchesQuery(props, parsed)) continue;
      const label = formatPhotonAddress(props);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push({ id: label, label });
      if (out.length >= 6) break;
    }
    return out;
  } catch (error) {
    // An aborted request must stay silent (a newer keystroke superseded it); any other
    // failure also degrades to no suggestions — typing remains the source of truth.
    if (error instanceof DOMException && error.name === "AbortError") return [];
    return [];
  }
}
