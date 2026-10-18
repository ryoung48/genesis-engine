# People generated on demand

The simulation tracks one individual per realm: the ruler (see [rulers and dynasties](../politics/rulers-and-dynasties.md)). Everyone else a wiki page shows is generated when a page asks for them, on the main thread, from the history record. Nothing here runs inside the history simulation, draws from its RNG, or changes its statistics. `src/model/people` imports the record, the world frame and `shared`; nothing under `src/model/history` imports it.

A person page shows sex, age, health band, culture, religion, title, house (or "Lowborn"), personality, congenital traits and old-age conditions. It lists parents, full and half siblings, current and former spouses and children, each with name, sex, age, house, health status and the page person's opinion of them. Its timeline lists births, weddings, widowhood, children's births, pregnancy losses, condition onsets and band changes, deaths of relatives, accession and deposition, and the person's own death.

## Keys and seeds

A person is a `PersonKey`, a canonical string:

| Key | Person |
|---|---|
| `R(rulerId)` | a simulated ruler |
| `S(owner,k)` | the k-th free spouse of a house member |
| `C(marriage,n)` | the n-th free child of a marriage |
| `A(anchor,role)` | a person injected to satisfy a record anchor |
| `P(child,f\|m)` | a generated parent |
| `V(seat,bucket)` | a seat holder created for the noble pool |

A marriage key is the two spouse keys and the start. The person seed is the world seed mixed with a 32-bit FNV-1a hash of the key. Every random draw is `HASH.unit({ seed, channel, salt })` where the salt is a completed age or a month index. Nothing draws from `window.dice`. A person's own life, character and family structure are pure functions of the world seed, the key and the record. Spouse choice is not: it draws from a [pool of nobles](nobility.md) that grows as pages are opened, so the spouses in a session can depend on the click history. A person already shown never changes.

Channels: 1–132 character, 200+ congenital, 1000–1040 health, 1100–1102 marriage seeking, 1200–1208 fertility, 1300–1312 anchors, 1400 names.

## Layers

| Layer | Contents | Built when |
|---|---|---|
| L1 stub | key, birth, sex, house, home, character, life (health rows, death date and cause) | the person appears in any list or is needed for inheritance |
| L2 chain | marriages and children, with each child's and spouse's L1 | the person is clicked, or is a parent of the clicked person |
| L3 page | timeline, title, culture, religion, opinions at the date | the person is clicked |

A layer depends only on lower layers. **Stub facts are final:** a life is computed before and independently of the person's own chain; childbirth only relabels a death the life already fixed (see [families](families.md)); spouses and generated parents always use the no-parent character rule, so a character never depends on relatives created after it was shown; and generated relatives are fitted to a birth that is already fixed, never the reverse. Everything a family list shows therefore equals what the member's own page shows after a click.

A marriage and its children are one shared object owned by the chain that created it, so either spouse's page yields the same children and dates. Event rows are produced from that single object, so both pages show the same date and text. Family death rows carry the date only; the cause belongs to the dead person's own page.

## Lazy relatives

An outsider spouse's parents (`P(S,f|m)`) are created when the spouse is clicked: father alive at conception, mother alive at birth, aged by the generated-parent gaps in [anchors](anchors.md). Their other children come from that couple's chain, with the spouse placed as an anchored child. A founder's grandparents are created the same way when a generated parent is clicked.

## Store

`PEOPLE_STORE.of({ record })` is a `WeakMap` from record to a memo of stubs, chains, marriages and names, with build counters per layer. It is rebuilt, with the anchor index, whenever `record.maxTimeMs` has advanced, because a newly recorded ruler change can add an anchor. Once the run is complete nothing is invalidated. Pages (L3) are not memoized; they are a date filter over L1 and L2. Generated people are not persisted across reloads.

## Limits

Procedural records only: Earth-import rulers have no `rulerId`. Excluded: diseases and wounds (health changes come only from old age and the five ageing conditions), the six base attributes, Inbred and Pure-blooded, households, residence, interaction memories, district holders, patricians and lovers. Marriages between relatives follow the consanguinity doctrine but only among siblings, half-siblings, uncles/aunts with nieces/nephews, and first cousins. Standing for the child cap is fixed (ruler 3, other house member 3, commoner 1) rather than read from title tiers. A pregnancy's earlier-children count covers the marriage, not the mother's whole life. Culture at birth is read from the frame at the birth year rounded down to 25 years. Regency start and end have no timeline row.

Details: [nobility and the spouse pool](nobility.md), [religion and doctrines](religion-and-doctrines.md), [anchors](anchors.md), [health and ageing](health-and-ageing.md), [families](families.md), [character and opinion](character-and-opinion.md).

## Reporting

`pnpm report:people` generates a procedural world with its initial conditions and rulers, then measures people queries at that starting date. It does not advance the simulation. `HISTORY_YEARS` is ignored. World generation uses `HISTORY_SEEDS`, `HISTORY_ERA`, `HISTORY_POINTS`, `HISTORY_START`, `HISTORY_REACH_KM` and `HISTORY_COHESION_STEP`.

The report opens 12 distinct rulers selected deterministically across sex and minor/adult cohorts in the initialized world, and revisits each page to measure cached access. This small navigation workload replaces the former 200-page timing sample and 3,000-page bulk sweep. `PEOPLE_PAGES` can reduce the sample to between 1 and 12 pages. Generated relatives share one store, and its counts and family/health observations are descriptive of this sample, not population estimates. World preparation and people query time are recorded separately.

`PEOPLE_OUT` chooses an exact output file; otherwise reports go to `stats/people/<UTC timestamp>-<PEOPLE_TITLE or people-report>/0.json`. `HISTORY_OUT` does not redirect people output.

`pnpm report:history` performs no people generation and has no `diagnostics.people` or `peopleMs` fields. A people-report failure cannot prevent a separate history report from completing. The standalone people benchmark is excluded from `pnpm test:history`.
