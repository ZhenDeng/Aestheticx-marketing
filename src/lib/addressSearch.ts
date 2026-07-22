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
// ask for". Photon both matches and RANKS loosely, so relevance and order are enforced here
// rather than trusted:
//
//   1. `layer=house|street` — without it Photon ranks `locality` features ABOVE real addresses
//      for a partial query. Localities carry a street-shaped name and format indistinguishably
//      from addresses, so "1 Smith" led with three Queensland localities while the real
//      "1 Smith Street" sat seventh (22/07 regression, PR #153).
//   2. `matchesQuery` — even inside those layers Photon returns fuzzy matches ("Everson Road,
//      Gympie" for "15 Gympie Road"). A result must carry the typed house number and the typed
//      street phrase or it is dropped.
//   3. Proximity bias + local ranking — house-level features carry no meaningful importance
//      score, so once a number narrows the match to individual dwellings Photon's order is
//      effectively arbitrary: "101 Collins Street" ranked Drysdale and Burnie above the
//      Melbourne CBD address (22/07 follow-up). Bare street queries looked fine only because
//      street features DO carry importance.
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

/** A proximity hint for the geocoder — see `biasForAddress`. */
export interface GeoPoint {
  lat: number;
  lon: number;
}

// Capital-city coordinates keyed by state, because the market is overwhelmingly metropolitan
// and the state is the one location fact derivable from an address the user has ALREADY typed —
// no geolocation permission, no extra network call, nothing new stored. The bias is a nudge,
// not a filter: interstate results still appear, ranked lower, which is exactly right for a
// clinic treating a patient from another state.
const AU_CAPITAL_COORDS: Record<string, GeoPoint> = {
  NSW: { lat: -33.8688, lon: 151.2093 },
  VIC: { lat: -37.8136, lon: 144.9631 },
  QLD: { lat: -27.4698, lon: 153.0251 },
  SA: { lat: -34.9285, lon: 138.6007 },
  WA: { lat: -31.9523, lon: 115.8613 },
  TAS: { lat: -42.8821, lon: 147.3272 },
  NT: { lat: -12.4634, lon: 130.8456 },
  ACT: { lat: -35.2809, lon: 149.1300 },
};

const STATE_PATTERN = new RegExp(
  `\\b(${[...Object.keys(AU_CAPITAL_COORDS), ...Object.keys(AU_STATE_ABBREVIATIONS)].join("|")})\\b`,
  "gi",
);

/** The state named in an address, or undefined. */
export function stateFromAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const matches = address.match(STATE_PATTERN);
  if (!matches) return undefined;
  // The LAST match wins: "12 Victoria Road, Bellevue Hill NSW 2023" names Victoria in the
  // street and NSW in the state slot, and the state slot is the one that means the state.
  const last = matches[matches.length - 1];
  const canonical = Object.keys(AU_STATE_ABBREVIATIONS).find((n) => n.toLowerCase() === last.toLowerCase());
  return canonical ? AU_STATE_ABBREVIATIONS[canonical] : last.toUpperCase();
}

/** Where to bias suggestions, given the signed-in user's own address. */
export function biasForAddress(address: string | undefined): GeoPoint | undefined {
  const state = stateFromAddress(address);
  return state ? AU_CAPITAL_COORDS[state] : undefined;
}

/** What the user's typed text asks for, as far as it can be pinned down. */
export interface ParsedAddressQuery {
  /** The street number, when the text starts with one after any unit designator. */
  houseNumber?: string;
  /** The street name up to and including its type word — the phrase a result must contain. */
  streetPhrase?: string;
  /** Anything typed after the street, e.g. a suburb — used to rank, never to reject. */
  extraWords: string[];
  /** The text to send the geocoder: the typed address minus any unit designator. */
  search: string;
}

// AU addresses commonly lead with a sub-dwelling: "5/200 Queen St", "Unit 5, 200 Queen St",
// "Suite 5 200 Queen St". Left in place, that leading 5 is read as the street number and
// "5 Queen Street" is offered for "Suite 5 200 Queen Street" — a real, wrong address.
const UNIT_PREFIX = /^\s*(?:(?:unit|suite|shop|apt|apartment|level|lot|u)\s*\.?\s*[0-9a-z-]+\s*[,/]?\s*)/i;
const SLASH_PREFIX = /^\s*[0-9]+[a-z]?\s*\/\s*/i;

// Where the street name ends. Matching only the first word let "Charles Smith Drive" answer
// "12 Smith Street"; matching the whole remainder would let a typed suburb ("12 High Street
// Prahran") reject the very street it names.
const STREET_TYPE_WORDS = new Set([
  "street", "st", "road", "rd", "avenue", "ave", "av", "drive", "dr", "court", "ct",
  "place", "pl", "parade", "pde", "terrace", "tce", "lane", "ln", "crescent", "cres",
  "close", "cl", "way", "boulevard", "blvd", "bvd", "highway", "hwy", "circuit", "cct",
  "esplanade", "esp", "grove", "gr", "rise", "walk", "mews", "square", "sq", "quay",
  "promenade", "circle", "loop", "row", "track", "trail", "view", "ridge", "green",
  "gardens", "gdns", "alley", "arcade", "bend", "chase", "concourse", "cove", "crest",
  "dale", "glade", "glen", "heights", "hts", "island", "junction", "key", "link", "mall",
  "outlook", "pass", "path", "plaza", "point", "port", "reach", "reserve", "retreat",
  "run", "strip", "turn", "vale", "villas", "vista", "waters", "wharf", "wynd",
]);

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

  const tokens = rest.split(/[^a-z0-9]+/).filter(Boolean);
  // Never end on the first token — a street cannot be only its type word, and "St Kilda Road"
  // opens with one.
  const typeAt = tokens.findIndex((t, i) => i > 0 && STREET_TYPE_WORDS.has(t));
  const end = typeAt === -1 ? tokens.length : typeAt + 1;
  const streetPhrase = tokens.slice(0, end).join(" ") || undefined;
  const extraWords = tokens.slice(end);

  return { houseNumber, streetPhrase, extraWords, search: search || normalised };
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
    const n = leadingNumber(p.housenumber);
    // A DIFFERENT number is a different address — "20 Wickham Terrace" must never offer 22.
    // A hit with NO number is kept: OSM house-number coverage in Australia is patchy, and
    // whole newer suburbs carry none at all (Wolli Creek has Brodie Spark Drive but not one
    // number on it). Rejecting those made the commonest case — typing your own full street
    // address — return an empty dropdown. `formatPhotonAddress` completes such a hit with the
    // number the USER typed; nothing is invented, the suburb/state/postcode just get filled in.
    if (n !== undefined && n !== parsed.houseNumber) return false;
  }
  if (parsed.streetPhrase) {
    const street = (p.street ?? p.name ?? "").toLowerCase();
    if (!street.includes(parsed.streetPhrase)) return false;
  }
  return true;
}

/**
 * Rank score for a surviving hit — lower sorts first. Photon's own order (now carrying the
 * proximity bias) is the tiebreak, preserved by a stable sort.
 */
function rank(p: PhotonProperties, parsed: ParsedAddressQuery): number {
  const street = (p.street ?? p.name ?? "").toLowerCase();
  // An exact street beats one that merely contains it: "Little Chapel Street" should not
  // outrank "Chapel Street" for a typed "Chapel Street".
  const exactStreet = parsed.streetPhrase && street === parsed.streetPhrase ? 0 : 1;
  // A typed suburb or postcode is a ranking signal only. Photon answers "12 chapel street
  // prahran" with "Little Chapel Street" alone, so rejecting on it would lose the real
  // Chapel Street the user is heading for.
  const haystack = [p.suburb, p.district, p.city, p.town, p.village, p.locality, p.postcode]
    .filter(Boolean).join(" ").toLowerCase();
  const missedExtras = parsed.extraWords.filter((w) => !haystack.includes(w)).length;
  // A hit that genuinely carries the number is better evidence than one completed from the
  // typed text — but only as a last tiebreak, behind street and suburb agreement.
  const completed = parsed.houseNumber && !p.housenumber ? 1 : 0;
  return exactStreet * 100 + missedExtras * 10 + completed;
}

/**
 * One AU-style line — "12 Smith Street, Richmond VIC 3121" — or null when the hit carries no
 * street name at all.
 *
 * `typedNumber` completes a street-level hit with the number the user typed, producing
 * "15 Brodie Spark Drive, Wolli Creek NSW 2205" from a street record that carries no numbers.
 * The number is the user's own — only the suburb, state and postcode come from the geocoder,
 * which is the whole point of the field. A hit that carries a DIFFERENT number never reaches
 * here; `matchesQuery` rejects it.
 */
export function formatPhotonAddress(p: PhotonProperties, typedNumber?: string): string | null {
  const street = p.street ?? p.name;
  if (!street) return null;
  const number = p.housenumber ?? typedNumber;
  const line1 = number ? `${number} ${street}` : street;
  const locality = p.suburb ?? p.district ?? p.city ?? p.town ?? p.village ?? p.locality;
  const state = p.state ? (AU_STATE_ABBREVIATIONS[p.state] ?? p.state) : undefined;
  const tail = [locality, state, p.postcode].filter(Boolean).join(" ");
  return tail ? `${line1}, ${tail}` : line1;
}

export async function searchAddresses(
  query: string,
  opts: { signal?: AbortSignal; near?: GeoPoint } = {},
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 4) return [];
  const parsed = parseAddressQuery(q);
  try {
    // A wide limit so ranking has something to work with: matches are filtered and re-ordered
    // here, and taking Photon's first few directly is what buried the real address.
    const bias = opts.near ? `&lat=${opts.near.lat}&lon=${opts.near.lon}` : "";
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(parsed.search)}&limit=40&lang=en${ADDRESS_LAYERS}${bias}&bbox=${AUSTRALIA_BBOX}`;
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: { properties?: PhotonProperties }[] };

    const kept = (data.features ?? [])
      .map((f) => f.properties ?? {})
      // The bbox clips to Australia already; the countrycode check guards border overlap.
      .filter((p) => !(p.countrycode && p.countrycode.toUpperCase() !== "AU"))
      .filter((p) => matchesQuery(p, parsed));

    // Stable sort, so Photon's proximity-biased order survives as the tiebreak.
    const ordered = kept
      .map((p, i) => ({ p, i, r: rank(p, parsed) }))
      .sort((a, b) => a.r - b.r || a.i - b.i);

    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    for (const { p } of ordered) {
      const label = formatPhotonAddress(p, parsed.houseNumber);
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
