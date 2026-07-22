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
