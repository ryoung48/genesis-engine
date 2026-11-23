# Tech levels

A generated world is requested by one number: the target tech level, the world maximum province TL on the GURPS ladder (TL0–TL12). The model derives the population-weighted world-average tech level **T̄** from it. Everything else on this page follows from T̄. The code is `src/model/society/tech-level/` (`TECH_LEVEL`, with the province spread in `TECH_SPREAD`). The plan is `plans/archive/tech-levels.md`.

Every TL is named from one descriptor scale (`TECH_LEVEL.describe`), used by the slider and the hover. Each band has an index. The bands that open a new era are pinned to the GURPS rung boundaries, and the index is interpolated linearly in between:

| Index | Starts at TL | Descriptor | Hallmarks |
|---|---|---|---|
| 1 | 0 | Paleolithic | hunter-gatherers, stone tools, fire |
| 3 | 0.25 | Mesolithic | bows, fishing nets, dugout canoes |
| 6 | 0.63 | Neolithic | agriculture, herding, villages |
| 9 | 1 | Copper Age | copper tools, the wheel, kilns |
| 12 | 1.33 | Bronze Age | bronze arms, plough, writing, cities |
| 15 | 1.67 | Late Bronze Age | chariots, organized armies, long-distance trade |
| 18 | 2 | Iron Age | iron tools, coinage, masonry |
| 21 | 2.33 | Classical Age | professional armies, roads, concrete, watermills |
| 24 | 2.67 | Late Antiquity | siege engines, glassmaking, bureaucracies |
| 27 | 3 | Early Middle Ages | heavy plough, horse collar, windmills |
| 30 | 3.23 | High Middle Ages | castles, crossbows, clocks, gunpowder |
| 33 | 3.46 | Commercial Revolution | universities, banking, early firearms |
| 36 | 3.69 | Late Middle Ages | plate armor, blast furnaces, artillery |
| 40 | 4 | Renaissance | printing press, arquebuses, caravels |
| 45 | 4.17 | Age of Discovery | ocean navigation, matchlocks |
| 50 | 4.33 | Scientific Revolution | muskets, star forts, telescopes |
| 60 | 4.67 | Enlightenment | flintlocks, canals, early industry |
| 70 | 5 | Industrial Revolution | steam, factories, railways |
| 80 | 6 | Machine Age | electricity, combustion engines, aviation |
| 90 | 7 and above | Space Age | computers, nuclear power, spaceflight |

The GURPS ladder still sets the numbers (energy per person, urban share, city size); the descriptor only names them.

## Request and era

`GenesisParams.targetTechLevel` replaces the old era setting. It is the **target**: the exact world maximum province TL, which is the number the generator slider shows (range 0.5 to 7.8, default 3.15 "Early Middle Ages", where the leading powers of an 867 start sit). The calibrated tables are keyed by the world average T̄, so the model converts at the point of use with `TECH_LEVEL.averageLevel({ target })`, the inverse of `TECH_LEVEL.leaderLevel` (the default target 3.15 gives T̄ 2.35). Era chips set the target to `leaderLevel` of the era anchor. Each era preset keeps a `techLevel` anchor: the T̄ whose world population equals the era's old population target, so choosing an era chip reproduces its old total. `ERAS.eraOf` returns the last era whose anchor is at or below T̄. The derived era still sets the settlement fraction, falloff, government mix and organizations.

| Era | paleolithic | neolithic | bronze | iron | lateMedieval | earlyModern | industrial | information |
|---|---|---|---|---|---|---|---|---|
| T̄ anchor | 0 | 0.19 | 0.56 | 1.42 | 2.35 (default) | 3.27 | 4.24 | 7.78 |

## The planet's own start year

The request does not pick an Earth date. It picks a level of progress, and the planet's own timeline decides when it gets there (`TECH_START`, `src/model/society/tech-level/start-year/`).

- **Progress.** The population-weighted average **farming age**: farm share × years since farming was adopted plus herd share × years since herding was adopted, from the mixed ways of life. Foragers count 0.
- **Target per TL.** Measured once on the Earth import (observed-climate farming with land expansion, 2026-11-21) at the anchor dates. Only these values come from Earth:

  | TL | 0.5 | 1 | 1.8 | 2.35 | 3 |
  |---|---|---|---|---|---|
  | Average farming age | 2,522 | 4,178 | 5,002 | 5,713 | 6,155 |

  - **Below TL 0.5** the target is the settled share of habitable land instead: 0.86 at TL 0 to 0.987 at TL 0.5.
  - **Above TL 3** the start is the planet's own TL 3 year (searched at TL 3's yield) plus Earth's gap after 1500, used as a duration: 300 years at TL 3.8, 400 at 5, 450 at 6, 500 at 7.3, 525 at 7.8.
- **Search.** The timeline is scanned in 50-year steps from the first adoption (or first settlement) to the horizon, taking the first step that reaches the target, then bisected to the year. Migration and farming run to year 10,000, so planets that farm late still reach their level. A planet that never reaches it starts at the horizon.
- **Clock.** The search reads the farming state before the crop exchange, the modern-farming ramps and the livestock voyages (`FarmingResult.startClock`, the same pre-voyage clock that dates the ocean year), so the start year cannot depend on land those later steps fill in. Otherwise a world that reaches the ocean year would date its own start by farmland that exists only because of that start's ocean year. Seed 1311714991 at 7.8 starts at 7002 on this clock (7228 with the crop exchange counted, 7842 with the modern ramps counted); seed 14963991 at the default level 5369 (5371).
- **Users of the start year.** Settled land (arrival at or before the start, for every preset), the population weights, held land, TL starting points, and the map's default date.
- **History calendar.** History keeps its own calendar starting at 867, because its political targets are keyed to it. The planet's arrival and contact years are shifted so the planet's start lands on 867, and the map converts history dates back to planet years when reading farming.
- **Example.** The verification world (seed 14963991, 204,000 points) farms about 3,000 years later than Earth and reaches TL 2.35 at year 5,410 on its own calendar.

## World population

`TECH_LEVEL.worldPopulation` reads the population at the request's **leader level** (`TECH_LEVEL.leaderLevel`), interpolating log-linearly between Earth anchors and staying flat beyond the ends:

| Leader TL | 0.5 | 1.4 | 2.0 | 2.5 | 3.15 | 4.1 | 5.0 | 6.1 | 7.0 | 7.8 | 9.0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| People | 4 M | 45 M | 115 M | 190 M | 285 M | 460 M | 1.0 B | 1.65 B | 2.5 B | 8.1 B | 10.4 B |
| Earth date | −10,000 | −3000 | −1000 | 1 | 900 | 1500 | 1800 | 1900 | 1950 | 2025 | ≈2080 |

So leaders at TL 7.8 mean today's 8.1 billion, and the default request (leaders 3.15) keeps about 285 million.

- **Sources.** HYDE 3.1 totals through 2000, and UN World Population Prospects 2024 for 2025 and the plateau.
- **Leader TL for each date** follows the leader targets below, except that 2025 is pinned at 7.8. These pairings are estimates.

`POPULATION.computePopulation` multiplies this by the **settled habitability score**: habitability × area summed over settled provinces only, normalised to Earth. Land migration hasn't reached at the start no longer counts toward the total.

## Province tech level

`TECH_LEVEL.assign` gives every settled province a TL; unsettled provinces have none. TL is relative: development decides who is ahead, and the final pass decides how far.

Generation runs in this order:
1. **Relative cities.** Cities are sized with every realm at the requested level, so only government shapes them.
2. **Development.** `URBANIZATION.spreadDevelopment` radiates it from every city, hop by hop. It decays faster across borders, and carries on through stateless land at the foreign rate.
3. **State development** (`URBANIZATION.stateDevelopment`). This is the development TL actually uses:
   - **No capital core.** State provinces keep their city development as is. An earlier capital core (every capital seeding a 20,000-person town, 0.25, spreading at 75% per hop inside its realm) was dropped because TL then read development the map never showed: provinces displaying the 0.05 floor read 0.15–0.25 and got TL about 2.2.
   - **Frontier loss.** A state province with no urban population loses 15% for each stateless neighbour, so rural frontier marches sit below the interior. Provinces with a town or city keep their development.
   - **Stateless land** keeps none of the development that leaked into it. It rises only by being pulled from more advanced neighbours, so it stays behind the states it borders.

   The 15% loss is a design value.
4. **Province TL** from that state development, through the steps below.
5. **Final cities.** Cities are re-sized from each realm's TL.

**Steps inside `TECH_LEVEL.assign`:**

1. **Development is the input.** Province TL comes straight from its state development; there is no starting knowledge or knowledge spin-up. Way of life enters only through the caps below. The spin-up (starting points from farming age, then the history diffusion rule) was dropped because its neighbour pull flattened each realm toward its oldest-farming provinces, leaving development a few hundredths of a TL.
2. **Log-development stretch.** TL is piecewise linear in log2(development) through three anchors (top development → leader target; 0.45 → target − (0.85/0.8) × gap; 0.05 floor → target − (2.15/0.8) × gap), clamped at 0 and at each province's way-of-life cap.
   - **Rule.** TL is read off log2(development) through three anchors, linear between them: the most developed settled province sits exactly on the **leader target** (the world's maximum; it is state land, so uncapped), development 0.45 sits 1.0625 gaps below it and the 0.05 floor 2.6875 gaps below, where a gap is leaders − T̄. At the default (target 3.15, gap 0.8) that is TL 2.3 at 0.45 and TL 1 at the floor: steep just below the leaders, levelling off toward the floor. These anchors are the user's choice; a constant 0.4–0.5 TL per halving of development left realms too bunched. If the top development is 0.45 or less, the middle anchor is dropped.
   - **Floor.** Development is floored at 0.05, the lowest value the urbanization curve gives a settled place (1,000 people). It also keeps stateless land, at development 0, finite: those provinces sit at the floor level before their caps.
   - **Why not a straight line.** The earlier line through the mean and the top had a slope of about 1 TL per unit of development, so realms at less than half the leader's development ended up only about 0.25 TL behind. The log-development anchors spread weak land much further.
   - **Expected values** (T̄ 2.35, leaders 3.15, top development 0.95):

     | Development | 0.95 | 0.45 | 0.20 | 0.10 | 0.05 |
     |---|---|---|---|---|---|
     | TL | 3.15 | 2.3 | 1.8 | 1.4 | 1.0 |

     The world average is not held at T̄: capped foragers and stateless land pull it below.
   - **Contact lag (tried, removed).** A contact-lag front from the leading realm, capping TL by contact distance and calibrated to Comin & Hobijn (2010, AER 100(5)) and the ORBIS sea-to-land speed ratio, was tried at generation and removed: development already sets most of the gap, so it barely changed TL. It is deferred to the history sim, where catch-up over time matters.
   - **Rural smoothing.** After the stretch, each settled province with under 1,000 urban people blends toward its neighbours: new TL = 0.5 × own + 0.5 × the mean of its settled neighbours' TL, for 2 passes, then clamped at 0 only: caps are not applied again, so capped forager pockets and stateless edges soften toward their neighbours instead of staying hard islands. Towns and cities (1,000+ urban people) are never changed but count as neighbours. It crosses realm borders and stateless land, because the hard edges were at frontiers. The province holding the maximum is left fixed, so the world maximum still equals the target exactly (averaging can only lower a province below it). Two passes and half weight on itself are the simplest values that soften one-province edges without flattening regions; the 1,000 threshold is the town cutoff.   - **Way-of-life caps.** Foragers are capped wherever they have no town, inside realms too; stateless farmers and herders are capped by density; state farmers and herders, and any province with 1,000+ urban people, are uncapped. Foraging peoples under nominal state rule (Inuit, interior Aboriginal Australians, Amazonian and Kalahari peoples around 1900–1950) kept stone-age technology; without this, worlds at high targets lost their whole low tail, since almost all land is state-held by then. Capitals are never forager-majority, and no cap spreads to neighbours, so realms' centres are unaffected.
     - *Foragers* (forage share above 50%, under 1,000 urban people, in or out of a realm) are capped by their land's forager density `d_f`, read on log10 between these anchors (densities after Kelly, *The Lifeways of Hunter-Gatherers*, 2013):

       | `d_f` (people/km²) | ≤ 0.03 | 0.5 | ≥ 1 |
       |---|---|---|---|
       | Cap | 0.2 (Paleolithic) | 0.6 (late Mesolithic) | 0.95 (late Neolithic) |

       Sparse desert and tundra bands (Western Desert, interior Inuit, 0.01–0.03/km²) stay Paleolithic; inland foragers (Hadza, rainforest foragers, 0.2–0.4/km²) top out in the Mesolithic; only rich coast and river foragers (Northwest Coast, Jōmon, 0.5–1+/km²; the model doubles `d_f` there) reach the Neolithic.
     - *Stateless farmers and herders* are capped by their people per km² (`density` of `FARMING_WAY_OF_LIFE.wayOfLife`), read on log10 between these anchors (European prehistoric densities after Zimmermann, Hilpert & Wendt 2009, *Human Biology* 81):

       | People/km² | ≤ 1 | 10 | ≥ 50 |
       |---|---|---|---|
       | Cap | 0.95 (late Neolithic) | 1.67 (Late Bronze Age) | 2.3 (Iron Age) |

       About 1/km² is early Neolithic farming or mobile pastoralism; 10/km² is tribal Bronze and Iron Age Europe (5-15/km²); 50/km² and up is the densest pre-state chiefdoms. Caps apply only to the province itself; an earlier easing that spread caps +0.5 TL per hop into neighbouring land was removed because it capped capitals near forager pockets and realm edges below their own countryside.
   - **Shape.** The process decides it: development through the stretch, way-of-life caps and rural smoothing, long tails included. Generation TL uses no diffusion.
   - **Leader targets.** Interpolated from these anchors, which are estimates from Earth dates:

     | T̄ | 0 | 0.5 | 1 | 1.8 | 2.35 | 3 | 3.8 | 5 | 6 | 7.3 | 7.8 | 12 |
     |---|---|---|---|---|---|---|---|---|---|---|---|---|
     | Leaders | 0.5 | 1.4 | 2 | 2.5 | 3.15 | 4.1 | 5 | 6.1 | 7 | 8.2 | 8.8 | 12 |

## Energy and Kardashev

`TECH_LEVEL.watts` gives energy per person, interpolated in log space. TL0–TL8 follow Morris's energy capture per person; TL9 and up extrapolate at ×2.5 per rung.

| TL | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| W/person | 250 | 600 | 1,000 | 1,200 | 1,600 | 3,000 | 5,000 | 8,000 | 10,000 | 25,000 | 60,000 | 150,000 | 400,000 |

- **No heating term.** Heating fuel measures cold, not capability.
- **World power.** `TECH_LEVEL.worldPower` sums population × watts and returns Sagan's K = (log10 W − 6) / 10.

## Urban share and city size

The final city sizes use each realm's population-weighted TL (`TECH_LEVEL.realmLevels`, `URBANIZATION.techKnowledge`). The history simulation starts from this generated urban population and development rather than recomputing them.

- **Urban share.** A realm's share is `urbanShare(realm TL) × U_gov / Ū`, capped at 85%. Ū is the population-weighted mean government `U`, so governments shift realms around the TL level without moving the world mean.

  | TL | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8+ |
  |---|---|---|---|---|---|---|---|---|---|
  | Share | 0 | 4% | 10% | 8% | 12% | 30% | 45% | 65% | 80% |

  Sources: Bairoch; UN World Urbanization Prospects 2018. The TL3 dip is Europe's post-Roman de-urbanisation.

- **No towns in foraging land.** A province where most people forage (`FARMING_WAY_OF_LIFE.foraging`, forage share above 50%) gets no urban population unless it is its realm's capital. The realm's urban total still comes from its whole population, so its cities concentrate in farming and herding provinces. Without this, at high targets almost every foraging province held 1,000+ urban people, which exempted it from the forager TL cap and rural smoothing and left large forager areas at Machine Age.
- **City-size cap.** The largest city interpolates log-linearly: TL1 80 k, TL2 1 M, TL3 1 M, TL4 1.1 M, TL5 2.3 M, TL6 6.5 M, TL7 16 M, TL8+ 37 M (Chandler; UN WUP 2018). The cap for a realm is that value ÷ 2.5 × the realm factor `min(2.5, (realm population / 10 M)^0.3)`, so only the biggest realms reach it.
- **History.** The history simulation's censuses keep their own knowledge formulas; see [growth, cities and knowledge](growth-cities-and-knowledge.md#urbanization-and-city-sizes).

## State-held land and realm sizes

The start's state-held share of settled land (`TECH_LEVEL.stateHeld`) and its realm-size distribution (`TECH_LEVEL.sizePlan`) are interpolated by T̄.

**State-held share:**

| T̄ | 0 | 0.19 | 1.8 | 2.1 | 2.35 | 2.45 | 3.5 | 5.1 | 7.8 |
|---|---|---|---|---|---|---|---|---|---|
| Share | 0 | 0.08 | 0.3285 | 0.3669 | 0.4635 | 0.4682 | 0.7191 | 1 | 1 |

- Measured from EU4 extended-timeline owned area over 113.80 M km² of habitable land, at 2, 476, 867, 1066 and 1701.
- 1914 and 2025 exceed the habitable area, because EU4 owns land the model counts as desolate, so they are capped at 1.
- Neolithic is the old era value.

**Realm-size shares** (% of state-held land; buckets in provinces of about 10,000 km²):

| T̄ | Anchor | 1 | 2–4 | 5–9 | 10–24 | 25–49 | 50–100 | 101+ | 101+ upper bound |
|---|---|---|---|---|---|---|---|---|---|
| 0.19 | Neolithic weights | 50.0 | 35.0 | 15.0 | 0 | 0 | 0 | 0 | 250 |
| 0.56 | Bronze weights | 19.38 | 34.26 | 21.80 | 11.76 | 12.80 | 0 | 0 | 250 |
| 1.8 | EU4 2 CE | 1.55 | 12.15 | 15.62 | 16.85 | 12.20 | 7.74 | 33.89 | 533 |
| 2.1 | EU4 476 | 1.67 | 10.77 | 12.85 | 13.71 | 15.41 | 13.68 | 31.91 | 280 |
| 2.35 | EU4 867 | 1.44 | 9.14 | 12.25 | 18.53 | 21.90 | 23.32 | 13.42 | 250 |
| 2.45 | EU4 1066 | 2.63 | 9.44 | 12.83 | 24.79 | 15.13 | 10.93 | 24.25 | 224 |
| 3.5 | EU4 1701 | 1.34 | 3.97 | 6.62 | 11.60 | 7.64 | 8.85 | 59.98 | 794 |
| 5.1 | EU4 1914 | 0.17 | 0.72 | 0.69 | 3.04 | 2.34 | 5.39 | 87.64 | 788 |
| 7.8 | EU4 2025 | 0.21 | 0.60 | 1.19 | 3.97 | 6.95 | 14.35 | 72.73 | 599 |

- **EU4 rows** are country count × conditional mean size from [distribution history](../politics/distribution-history.md), renormalised to land.
- **Neolithic and Bronze rows** are the old era weights and have no recorded source. The old Iron Age weights were dropped.
- **Above 7.8** the 2025 shape is held flat.
- **101+ upper bound.** `NATIONS` spreads a bucket's realms evenly between its bounds, so the bound is 2 × EU4's mean 101+ size − 101.
- **Default start.** At the default 2.35, both curves equal the old 867 start exactly. The history run's year-keyed target profile is unchanged.

## Map mode and report

- **Map mode.** Population → **Tech level** colours provinces on a continuous ramp over the world's TL range. Hovering shows TL, rung and watts per person.
- **Report.** `pnpm report:history` records a `techLevel` block: the request, settled score, total, population-weighted mean, SD, P5, P50 and P99, the Spearman correlation with log density, watts per person, K and the generation-time urban share.
- **Earth.** The Earth import has no generated development, so it gets no province TL and the map mode is hidden there. The Earth farming diagnostic (`HISTORY_FARMING_EARTH=1`) adds the import's settled score and its totals at T̄ 3 and 7.3.
