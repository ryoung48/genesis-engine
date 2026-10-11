# Government changes over time

Government belongs to a sovereign realm and is read from its root province. A new realm inherits its former sovereign's government after its provinces and supporting districts have been assembled. Conquest does not restamp every province.

Code: `src/model/history/sim/engine/state/government`, the shared release path in `state`, and the succession events. The [government catalog and succession systems](government-and-succession.md) describe the consequences of each type.

## Review moments and order

| Moment | Rules, in order |
|---|---|
| Founding, after final repartition and inheritance, before installing the ruler | Size, city republic |
| Accession, after succession, interregnum, partition and revolts, before coronation | Size, city republic, electoral house streak or house loss, absolute monarchy |
| Yearly, before title elevation | City republic |

A review applies at most one transition. Inheritance initializes the new realm and does not consume this limit. A small absolute monarchy becomes feudal or elective first; the city rule can act at a later review. A founding cannot centralise into absolute monarchy. A deferred coronation is not another accession. Succession is settled under the late ruler's government.

## Rules and values

| Rule | Condition | Result | Value source |
|---|---|---|---|
| Hereditary tribal size | At least 5 provinces | Tribal monarchy; otherwise chiefdom | World generation's tribal size bands in `sim/nations/government` |
| Elective tribal size | At least 10 provinces | Tribal federation; otherwise native council | World generation's federation threshold; councils of 5–9 remain councils |
| Absolute regression | Fewer than 20 provinces, at founding or accession | Elective or feudal monarchy | World generation's late medieval absolute size threshold |
| Absolute accession | Feudal or elective monarchy, at least 20 provinces, realm knowledge at least 1.9 | Absolute monarchy | Shared size threshold; the knowledge baseline is 1.44 in 1500 and 2.38 in 1800, placing 1.9 around 1650, the generation of Denmark's 1660 absolutism and Louis XIV's personal rule from 1661 |
| City republic | Feudal or elective monarchy, at most 4 provinces, largest city at least 5,000 urban residents, urban share at least 20% | Oligarchic republic | Republic-favoured smallest worldgen size bands; [minimum city size](../population/growth-cities-and-knowledge.md); oligarchic republic's 20% urban target in `GOVERNMENT_PROFILES` |
| Electoral capture | An oligarchic republic elects the same house for 3 consecutive accessions | Dynastic signoria | Design value modelled on the successive Medici heads Cosimo, Piero and Lorenzo; measured rather than tuned to a target |
| House lost | A signoria's accession installs a different house | Oligarchic republic | The defining dynastic condition no longer holds |

Absolute regression calls the same `GOVERNMENT.monarchySubtype` roll as world generation with the realm size, era size weight and history random stream. Results other than elective or feudal become feudal. In the late medieval era, fewer than 5 provinces always gives feudal; 5–19 gives elective below roll 0.75 and feudal otherwise.

No rule leaves the tribal family or enters or leaves theocracy. There is no political-development meter, authority ladder, yearly conversion probability or cooldown. Tribal realms change form in both directions. Large advanced tribal realms remain tribal. Steppe Horde is absent from the simulation catalog; former generation candidates follow the ordinary federation/monarchy branch.

## Dependent state

Government writes clear economy caches and invoke military mutation hooks. Army targets, levy eligibility, raids, succession, partition and city targets read the current government at their next use.

After installing a released ruler, reconciliation runs even if inherited government did not change. Other reviews reconcile when they transition.

Leaving single-heir succession ends every personal union edge with its correct senior and junior and deletes the junior's generation entry. Each former junior of the realm, or the realm itself if it was a junior, receives a fresh ruler of the shared dynasty with claim 2, an `INHERITED_AGE` draw and a minority regency if needed; see [rulers and dynasties](rulers-and-dynasties.md#shared-rulers-and-unions). Leaving marriage-alliance eligibility immediately removes the realm's [marriage ties](royal-marriages.md#ending) and records their end. Ordinary alliances persist. Regents and coronations retain their ordinary rules.

## Records and measurement

A changed root emits one `government change` note carrying type names and cause: `inherited`, `size`, `knowledge`, `city`, `election streak` or `house lost`. Equal assignments produce no note. Inherited initialization sets an empty nation's initial government; on an existing timeline it emits an event only when the recorded type differs. Rule transitions always append a dated `governmentChange` event, including on an empty timeline, with their cause as the comment. Notes are translated in order, so founding preserves inheritance followed by its rule transition.

The detailed report has a `government` section in each window and `governmentTotal` in diagnostics. It records realm counts and population shares by type, counts in the 1, 2–4, 5–9, 10–19 and 20+ province bands, and transitions by from/to/cause. Inheritance initialization is counted separately. HTML comparisons show absent fields for reports made before this instrumentation.

Baseline: `stats/history/2026-10-11T16-38-20-861Z-government-baseline/933.json`, seed 14963991, late medieval, 204,000 points, years 867–1800, late knowledge threshold 2.366478320318625, no profiling. The 10-year instrumentation check preserved all behavioral fields and recorded zero changes: `stats/history/2026-10-11T16-42-29-058Z-government-instrumentation/10.json`.

Completed report: `stats/history/2026-10-11T17-01-40-746Z-government-changes/933.json`, with zero validation violations; its `comparison.md` separates behavior from timing and memory. It records 1,641 rule transitions: 1,472 size, 22 knowledge, 126 city, 12 election streak and 9 house loss. There are 2,116 inherited initializations. In 1800 there are 30 absolute realms, 9 oligarchic republics, 1 signoria and 24 tribal realms among 238 sovereigns. No rule leaves the tribal family. These are single-seed observations, not rate targets. The EU4-format reference's 43–58% tribal share provides context; the run falls below it late, without a rule converting tribal realms out of that family.
