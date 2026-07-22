// Street-address suggestions for the address comboboxes (22/07 feedback #2), backed by the
// Photon geocoder (photon.komoot.io — OpenStreetMap data, keyless, CORS-open, built for
// search-as-you-type). Chosen over Google Places because it needs no API key or billing
// account; swap `searchAddresses` for a keyed provider later without touching callers.
//
// The lookup is best-effort by contract: every failure path returns [] so a network problem
// degrades to plain typing and can never block clinical data entry.

export interface AddressSuggestion {
  id: string;
  label: string;
}

interface PhotonProperties {
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

/**
 * One AU-style line — "12 Smith Street, Richmond VIC 3121" — or null when the hit has no
 * street-level anchor (Photon also returns POIs, regions and whole suburbs; those would fill
 * the field with something that is not a premises address).
 */
export function formatPhotonAddress(p: PhotonProperties): string | null {
  const street = p.street ?? (p.housenumber ? p.name : undefined);
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
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en&bbox=${AUSTRALIA_BBOX}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: { properties?: PhotonProperties }[] };
    const seen = new Set<string>();
    const out: AddressSuggestion[] = [];
    for (const feature of data.features ?? []) {
      const props = feature.properties ?? {};
      // The bbox clips to Australia already; the countrycode check guards border overlap.
      if (props.countrycode && props.countrycode.toUpperCase() !== "AU") continue;
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
