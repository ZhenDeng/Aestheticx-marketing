# Design — medication-address-autocomplete-2207

## One combobox, two sources

Both asks are the same interaction — type, see matches, pick one — over different data. `SuggestingInput`
owns the interaction (ARIA roles, keyboard, dismissal); `MedicationCombobox` and `AddressAutocomplete`
own only where suggestions come from. Two copies of the keyboard/dismissal rules would eventually
disagree, and this repo already pays that lesson in `RouteSelect`.

## Typed text stays authoritative

Neither source is complete. The product catalog omits anything a doctor compounds or sources
outside the seeded brands; the geocoder misses new estates, unit numbers and rural lots. So a
suggestion only ever *writes into* the field — it never constrains what may be saved, and no
validation was added anywhere. This is the same posture as the `select`-substitution trap noted in
`RouteSelect`, inverted: there the risk was a control silently changing a stored value, here the
rule is that the control may only change the value when the user picks.

## Why Photon, not Google Places

Google Places needs an API key, a billing account, and a key-restriction story for a public client
bundle. Photon (OpenStreetMap data, `photon.komoot.io`) is keyless and CORS-open, which keeps this
change web-only with no secret to provision or rotate. `searchAddresses` is the whole provider
surface — one function, returning `{id, label}` — so swapping to a keyed provider later is a
single-file change. The request is bounded to an Australian bbox, and the only data leaving the
browser is the partial address the user is typing.

## Address stays one string

Every stored address in this repo is a single free-text string (`Patient.address`, `Premise.address`,
the admin clinic/contact/principal-place fields), and those strings are printed verbatim onto
authorisation and invoice PDFs via `addressLines`. Selecting a suggestion therefore fills that one
field with a formatted AU-style line rather than populating separate suburb/state/postcode inputs —
splitting the address into components would be a data-model and PDF-rendering change, not an input
affordance, and is deliberately out of scope here.

## Failure is silent by contract

`searchAddresses` returns `[]` on every failure path — non-OK status, network throw, abort. A
geocoder outage must not surface an error in a clinical form, block a save, or make a required
field look broken; it degrades to plain typing, which is exactly what the field was before this
change. `AddressAutocomplete` additionally seeds its "settled" value from the initial prop so
opening an edit form never fires a lookup for an address nobody is typing.

## Relevance is enforced here, not trusted (22/07 follow-up)

The first cut sent the typed text to Photon and formatted whatever came back. That shipped a
real defect: for a partial query Photon ranks `locality` features ABOVE street addresses, and a
locality carries a street-shaped name and a house number, so it formatted indistinguishably from
an address. "1 Smith" led with three Queensland localities while the real "1 Smith Street" sat
seventh — the owner saw a dropdown of Queensland addresses for a query that had nothing to do
with Queensland. Photon also matches loosely within the address layers ("Everson Road, Gympie"
for "15 Gympie Road").

Two guards, deliberately both:

1. **Request** `layer=house&layer=street` — repeated params, since `layer=house,street` returns
   an empty feature list.
2. **Response** `matchesQuery` — reject a non-address feature type, a missing or different house
   number, or a street that does not contain the typed anchor word.

The response guard is not redundant. The layer param is the provider's promise; `matchesQuery` is
ours. If that param is renamed, dropped or quietly ignored, the type check still holds the line,
and it is the only one testable offline.

An empty dropdown is the correct outcome when nothing matches. The field is free text, so the
cost of showing nothing is that the user keeps typing — the cost of showing a wrong address is a
wrong premises on a Clause 68C direction. Strictness follows from which error is recoverable.

Sub-dwelling designators are stripped before BOTH the request and the number comparison. Left in,
"Suite 5 200 Queen Street" reads 5 as the street number and offers "5 Queen Street" — a real,
wrong address — and querying the raw text returns nothing usable.

## Testing lesson

Every original test used a hand-written stub shaped the way Photon was assumed to behave, so they
proved the formatting and the combobox interaction and never once exercised the provider's real
ranking. The bug lived entirely in that gap. `src/lib/__tests__/fixtures/photon-1-smith-unfiltered.json`
is now a REAL recorded response, and the regression test asserts against it. When a provider's
behaviour is the risk, at least one test has to meet the provider where it actually is.
