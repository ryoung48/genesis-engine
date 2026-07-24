Reusable instruction block for building out `public/earth-history/audits/` entries
for pre-2AD nations (the `cp_*` placeholder tags in `events/provinces.json` that
have no full `nations.json` entry, same category as Rome's `cp_roman_republic`).
Paste/reference this when starting a new nation or batch.

## Scope
Everything must be dated **before day 0** in `src/model/earth/history/date.ts`'s
encoding (day 0 = 2 AD Jan 1, 365-day years, no leap adjustment). Use real
historical BC/AD years, not `imperialis/countries.json`'s internal relative-year
numbering — that only checked out against `provinces.json`'s own embedded
chronology for Rome (`res_publica`/`late_res_publica`); the same check failed for
Persia/Maurya, so treat it as unreliable in general and anchor dates to
independently attested history instead.

## Sources, in priority order
1. `public/earth-history/events/provinces.json` — authoritative for which tags
   and provinces actually exist, and for real owner-history transition dates
   (often surprisingly accurate — cross-check proposed dates against it).
2. `public/earth-history/events/nations.json` — the pool of valid
   `governmentType` values (`tribal`/`monarchy`/`republic`/`theocracy` — see
   `src/model/earth/history/government.ts`) and the pool of already-used
   `reformId` values (grep `governmentReformAdd` payloads) to reuse before
   inventing new ones.
3. `geo-explorer/public/imperialis/countries.json` — reuse a nation's listed
   `reform`/`government` values as **existing**, not invented, whenever that
   mod source has a matching tag.
4. Real historiography for everything else (rulers, wars, battles, revolts).

## Everything is exhaustive, not a "greatest hits" pick

This is the single most important rule and it applies to **every category
below**, not just wars. The failure mode already seen once in this project:
defaulting to the 1-2 most famous entries per nation (one flagship war, 5-8
"highlight" rulers) instead of the full attested record. Don't do that again,
in any category. If a nation has 30 attested rulers, list 30. If a nation
fought 8 real wars with valid opposing tags, include all 8. If a nation has 5
attested internal revolts, include all 5. The only valid reason to omit a real,
attested entry is a hard blocker (no opposing tag exists for a war/revolt
distinction, or literally no source attests any names/dates for a stretch of
rulers) — never thoroughness fatigue or "the famous ones are enough."

## Rulers / government / reforms
- Full succession list where well-attested (e.g. Achaemenid king list,
  Ptolemaic dynasty, every Carthaginian suffete/general with a known date) —
  the complete list, not a curated subset.
- Where the record is genuinely thin (most of a multi-century republic, a
  poorly-attested succession), use every documented turning point as a
  stand-in ruler, flagged `sourceConfidence: "abstraction"` with a `note`
  explaining the gap. Never invent a name with no basis, but don't skip a
  real, named, dated figure just because there are already several others in
  that century.
- Reuse existing `reformId`/`governmentType` values first (source 2/3 above).
  Only propose a new reform id when nothing existing fits, and say so in the
  `note`.

## Wars
For every nation, enumerate **every major war** the historical record
attributes to it — founding/expansion wars, defensive wars, succession wars,
wars against every significant neighbor, decline/collapse wars — not just the
one or two most famous ones. The only valid reason to omit a real war is that
**no opposing tag exists** in `provinces.json`/`nations.json` for the other
side (verify this by grep, don't assume). Check the losing/absorbed side's
name against province owner-history tags before concluding no tag exists —
it's easy to miss a real one (e.g. `KLI` for Kalinga, `PRT` for Parthia were
both initially missed by pattern-matching on `cp_*` only; `PRT`/`KLI` are full
tags outside that prefix).

Include battles wherever a real one is attested (name, location, commanders,
force sizes, losses, outcome), matching `events/wars.json`'s schema — every
attested battle in a war, not just its single most famous one. Where the
exact ancient site has no dedicated province, use the nearest existing
province as a stand-in and flag it in that battle's `note`.

## Revolts
Enumerate **every** attested internal uprising with **no opposing tag**
(slave revolts, religious revolts, secessions with no registered breakaway
state) — not just the best-known one. These go in
`audits/revolts/<batch>-revolts.json` as province-level `revolt` events
matching `provinces.json`'s own schema (`payload.revolt: {type, size,
leader?}` + `comment`), not as `wars.json`-style entries. Use existing
`revolt.type` values (grep `provinces.json` for the enum) before proposing a
new one.

## Culture / religion conversions
Do **not** force these. Pre-2AD conversion events are genuinely rare — Rome
and most ancient nations show none (province religion/culture is static from
founding through 2AD in the source data). Only add one where there's a real,
single-date, well-documented event (e.g. Ashoka's turn to Buddhism after
Kalinga, 261/260 BC). If nothing like that exists for a nation, say so and
move on rather than inventing a plausible-sounding shift.

## Mandatory verification pass
Before calling any batch done, programmatically check against
`provinces.json`/`nations.json`:
- every `nationTag` / `warGoalTag` / battle `country` is a real, existing tag
- every `locationProvinceId` / `warGoalProvince` / revolt `provinceId` is a
  real, existing province id
- every `governmentType` is one of the 4 valid families
- every event's `date` is `< 0` (or `<= 0` where it's the very last
  transition into an already-covered successor, e.g. into ROM)

Report the check results, not just "looks good."

## Output shape
- `audits/<tag>.json` — one file per nation: `{_readme, tag, events[]}`, plus
  `provinceEvents: {<provinceId>: [...]}` if there are any culture/religion
  additions.
- `audits/wars/<batch-name>-wars.json` — `{_readme, wars: [...]}`, each war
  mirroring `events/wars.json`'s schema plus extra `note`/`sourceConfidence`
  fields for review.
- `audits/revolts/<batch-name>-revolts.json` — `{_readme, provinces: {...}}`.

Every event/war/battle/revolt carries a `note` (what it is, why the date/
province/tag was chosen, any caveat) and `sourceConfidence`
(`"traditional"` or `"abstraction"`).
