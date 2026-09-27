# Stellaris empire distributions (`:galaxy`)

Reference data for how Stellaris distributes species, governments, ethics and civics across randomly generated empires. Intended as a calibration source if we ever want galaxy-sim nation generation to mirror Stellaris-style variety.

All values below are `random_weight` bases from the game files (used at empire generation), not `ai_weight` (which only governs mid-game AI civic picks). Assumes all DLC owned; several entries are DLC-gated via `playable`.

## Sources

Paths relative to the Stellaris install (`C:\Program Files (x86)\Steam\steamapps\common\Stellaris`):

- Ethics: `common/ethics/00_ethics.txt`
- Authorities: `common/governments/authorities/00_authorities.txt`
- Governments: `common/governments/01_authority_governments.txt`, `02_ethic_governments.txt`, `03_civic_governments.txt`, `00_ai_governments.txt`
- Weight tiers: `common/scripted_variables/08_scripted_variables_governments.txt`
- Civics: `common/governments/civics/00_civics.txt`, `01_special_civics.txt`, `02_gestalt_civics.txt`, `03_corporate_civics.txt`
- Origins: `common/governments/civics/00_origins.txt`, `01_origins_non_playable.txt`
- Civic rarity tiers: `common/scripted_variables/00_scripted_variables.txt` (lines 43-45, 457-462)
- Species classes: `common/species_classes/01_base_species_classes.txt`, `00_species_classes.txt`
- Portraits: `common/portrait_sets/00_portrait_sets.txt`
- Planetary deposits: `common/deposits/01_planetary_deposits.txt`, `02_sr_deposits.txt`, `01_orbital_deposits.txt`
- Deposit rules: `common/deposits/99_README_DEPOSITS.txt`, categories in `common/deposit_categories/00_deposit_categories.txt`
- Deposit counts: `common/defines/00_defines.txt` (lines 674-686)
- Climate triggers: `common/scripted_triggers/00_scripted_triggers.txt` (lines 2344-2366), `01_scripted_triggers_infernals.txt` (line 37)
- Planet classes: `common/planet_classes/00_planet_classes.txt`, `03_planet_classes_ancient_relics.txt`

Weights were extracted with `parse_weights.py` (brace-matching dump of every `random_weight`/`weight` block); re-run it against the files above to re-verify after a game update.

## Ethics (`common/ethics/00_ethics.txt`)

3 ethic points per empire; fanatic costs 2, regular costs 1.

| Ethic | Fanatic | Regular |
| --- | --- | --- |
| Militarist | **250** (file comment: "more common ethic") | **150** |
| Authoritarian, Egalitarian, Xenophobe, Spiritualist, Materialist | 150 | 100 |
| Xenophile | 100 | **66** (rarest regular) |
| Pacifist | **33** | 66 |
| Gestalt consciousness | not randomly rolled (300 base, zeroed once the game starts) | — |

Fanatic xenophobe is multiplied by 0.2 when disruptive gameplay is blocked.

## Governments (`common/governments/`)

The government *name* is not rolled proportionally. Each file's header documents the rule: tiers are tried highest-weight first, and within a tier the first-listed matching government wins. Base weights (`08_scripted_variables_governments.txt`):

| Tier | Base weight |
| --- | --- |
| Galactic sovereign (imperial domain) | 500,000 — overrides everything |
| AI governments (fallen empires, enclaves, marauders; never player-available) | 100,000 |
| Homicidal civic overrides (purifiers, devouring swarm, terminator, criminal…) | 50,000 |
| Authority-swap | 10,000 |
| Origin-based | 7,500 |
| Civic prio | 5,000 |
| Civic (`03_civic_governments.txt`, ~35 entries) | 1,000 |
| Ethic (`02_ethic_governments.txt`: theocratic, military, irenic, moral…) | 100, with ×2 bumps (star empire, military set, megachurch with combo civics) |
| Authority (`01_authority_governments.txt`: democracy, oligarchy, dictatorship, despotic empire, hive, machine, megacorp, wilderness) | 10 |
| Fallback | 1 |

So a random empire's effective distribution is driven by its authority/ethics/civics rolls; the display name follows deterministically.

### Authorities (`authorities/00_authorities.txt`)

All six rollable authorities have `random_weight` base **2** with no modifiers — uniform, subject to `possible` ethic/species gates:

| Authority | Base | Excluded / required |
| --- | --- | --- |
| Democratic | 2 | no gestalt, no (fanatic) authoritarian |
| Oligarchic | 2 | no gestalt, no fanatic egalitarian/authoritarian |
| Dictatorial | 2 | no gestalt, no (fanatic) egalitarian |
| Imperial | 2 | no gestalt, no (fanatic) egalitarian (file also contains a duplicate base-2 block, same value, harmless) |
| Hive mind | 2 | **requires** gestalt ethics + non-machine species |
| Machine intelligence | 2 | **requires** gestalt ethics + MACHINE species |

Corporate has no `random_weight` entry and is DLC-gated (`auth_corporate`), so it is effectively never randomly rolled.

## Civics (`common/governments/civics/`)

Rarity tiers (`00_scripted_variables.txt`): default **5** / uncommon **3** / rare **1**. Most standard civics are 5. Exceptions:

- Boosted to **1000**: inwards perfection, fanatic purifiers, scorched earth (+ hive variant). Purifiers/scorched drop to 0 when disruptive gameplay is blocked.
- **Rare (1)**: shared burden, death cult, idyllic bloom, pompous purists, dystopian society, dark consortium, natural design, guided_sapience, galactic curators, and most newest-DLC civics.
- **Never random (0)**: eager explorers, stargazers, exploration protocol, privatized exploration; khan/sovereign origin-locked civics; servitor/assimilator once the game has started.
- Odd fixed values: memory vault / heroic tales / selective kinship / augmentation bazaars (4), life seeded + hive variants (5), beastmasters (10).

`ai_weight` is a separate system (base 5/3/1 matching rarity, ×3 on personality match, ×0.2 on mismatch, 0 on forbid) for mid-game AI reform picks — not spawn distribution.

## Origins (`common/governments/civics/00_origins.txt`)

The plain default start dominates at **100**; everything else is single digits:

- Base game standouts: mechanists and syncretic evolution **10**; tree of life, remnants, lost colony **5**; clone army and machine **2**; galactic doorstep and unplugged **1** (unplugged is AI-excluded).
- Most DLC origins: **5** (necrophage, ocean paradise, here be dragons, subterranean, common ground, hegemon, doomsday, lithoid crater, life-seeded, post-apocalyptic, fear of the dark, cybernetic creed, synthetic fertility, wilderness…); a few at 3 (void dwellers + machines) or 2 (shattered ring, toxic knights, progenitor hive, riftworld, arc welders); 1 for niche ones (red giant, cosmic dawn, mindwardens, endbringers, evolutionary predators, starlit citadel, treasure hunters, storm chasers, default nomads, heirs of the khan).
- Conditional: scion is 0, +2 only when fallen empires are enabled; primal calling is 0 for AI but +1 for human players; mindwardens zeroed for AI.
- Never random (0): shroud-forged, payback, broken shackles, overtuned, star slingshot, imperial vassal, and the legendary-leader variants.
- `01_origins_non_playable.txt` (fallen empires, primitives, separatists, khan successors, NPC federation members…) is all base **0** — assigned directly, never rolled.

## Species (`common/species_classes/`, `common/portrait_sets/`)

- Classes carry **no** `random_weight` block, so they are picked uniformly (subject to DLC `playable` gates) — except **MACHINE, explicitly down-weighted to base 1** (`00_species_classes.txt`, line 326). MACHINE also prefers gestalt ethics ~50% of the time (`preferred_ethics_weight` 6.5, per the file's own comment).
- Playable classes: mammalian, reptilian, avian, arthropoid, molluscoid, fungoid, plus DLC-gated plantoid, lithoid, necroid, aquatic, toxoid, cybernetic, biogenesis, wilderness, psionic, mindwarden, infernal, imperial.
- Randomizable portrait counts per class (including DLC `conditional_portraits`): mammalian 28, machine 23, avian/arthropoid 18, reptilian/humanoid/plantoid 17, fungoid/lithoid/necroid/molluscoid 16, aquatic/toxoid 15, infernal 10, human 2.

## Planetary resources (`common/deposits/`)

The key surprise: colonizable-planet deposits yield almost no resources directly. Each deposit grants **+1 to +3 max districts** of its category (`district_generator/mining/farming_max_add`), and jobs on those districts produce the resources. So "resource distribution by planet type" is really "district-slot distribution by planet type".

Mechanics: each deposit has a `potential` gate (climate helpers or an explicit `pc_*` list) and a `drop_weight` (`99_README_DEPOSITS.txt`: default 1). Base chances (`00_scripted_variables.txt`): high **16** / med **8** / low **4** for common deposits; high-rare **2** / med-rare **1** / low-rare **0.5** for strategic ones. Modifiers: ×1.5 on-climate bonus (energy on dry, minerals on cold, food on wet), ×2 gaia bonus on rares. Counts (`00_defines.txt`): a colonizable planet gets 5 fixed + 2 random deposits + 0.2×size of each, targeting min 3 unblocked + 1 blocker, with a 0.25 diversification push across already-used categories.

Climate mapping (`00_planet_classes.txt`, `03_planet_classes_ancient_relics.txt`): dry = desert/arid/savannah (+tomb/relic, though relic is excluded from the dry *bonus*); wet = tropical/continental/ocean; cold = tundra/arctic/alpine. Gaia and nuked match no climate — deposits reach them only via explicit gates.

### Energy (+generator districts)

| Deposit | Slots | Gates | Chance |
| --- | --- | --- | --- |
| Arid highlands | +1 | dry, non-volcanic | high |
| Hot springs | +1 | cold, wet, or nuked | high |
| Rushing waterfalls | +2 | wet | med |
| Searing desert | +2 | gaia, nuked, relic, dry | med |
| Frozen gas lake | +2 | gaia, relic, cold | med |
| Geothermal vent | +3 | arctic/tundra/savannah/desert/arid/volcanic | low |
| Underwater vent | +3 | gaia, relic, ocean, nuked | low |
| Tempestous mountain | +3 | tropical/alpine/gaia/relic/continental/volcanic | low |

Result: dry worlds lean energy across the board (highlands + searing + vent, all with the ×1.5 dry bonus); wet worlds get springs + waterfalls; ocean's big payout is the +3 underwater vent.

### Minerals (+mining districts)

| Deposit | Slots | Gates | Chance |
| --- | --- | --- | --- |
| Veiny cliffs | +1 | alpine/arctic/arid/continental/nuked | high |
| Mineral fields | +1 | tropical/savannah/desert/ocean/tundra | high |
| Prosperous mesa | +2 | continental/tropical/savannah/desert/gaia/relic | med |
| Ore-rich caverns | +2 | ocean/alpine/arctic/arid/tundra/nuked/gaia/relic | med |
| Rich mountain | +3 | continental/desert/alpine/arctic/arid/tundra/gaia/relic | low |
| Submerged ore veins | +3 | ocean/tropical/savannah/nuked/gaia/relic | low |

All with a ×1.5 bonus on cold worlds — so arctic/tundra/alpine are the mining-biased climates despite a narrower deposit list.

### Food (+farming districts)

+1/high: lichen fields (arctic/nuked, ×0.33 on nuked), bountiful plains (arid/savannah), rugged woods (continental only), green hills (ocean/tropical), forgiving tundra (alpine/tundra), boggy fens (ocean only), nutritious mudland (desert only). +2/med: fungal caves (cold/nuked ×0.33), lush jungle (gaia/tropical/ocean), fertile lands (savannah/continental/gaia/arid), great river (arid/desert). +3/low: black soil (continental/savannah/gaia), teeming reef (gaia/ocean), marvelous oasis (arid/desert), tropical island (arid/desert/tropical), fungal forest (cold). All ×1.5 on wet worlds — ocean/tropical/continental are the breadbaskets; arid/desert still eat via oasis/island/river.

### Rare deposits on planets (`01_planetary_deposits.txt`, `02_sr_deposits.txt`)

- Exotic gases (dust caverns/desert, +generator SR slots), motes (bubbling swamp/fuming bog, +farming SR slots), crystals (caverns/forest/reef, +mining SR slots): any habitable world (plus hive/machine worlds), high-rare 2, on-climate ×1.5, gaia ×2. Crystal forest excludes ocean/nuked/gaia/volcanic; crystal reef is ocean/nuked/gaia-only.
- Betharian stone (+4 mining, med-rare 1) and alien pets (med-rare 1, no volcanic): any habitable world.
- Gaia-only +1s (buzzing plains, mineral striations, natural farmland) sit at 0.01 — effectively never randomly rolled.
- Orbital strategic deposits (gases/motes 1.5/0.5, zro 5/1, dark matter 10/1, living metal fixed) are gated by *system* flags (nebula etc. in `02_sr_deposits.txt`), not planet class; tiers 3+ are weight 0, event/anomaly only. Uninhabitable rocks get the tiered energy/mineral/research orbital deposits instead (`01_orbital_deposits.txt`).

### Uninhabitable objects and stars (`01_orbital_deposits.txt`)

Uninhabitable objects get exactly **one** deposit (`NON_COLONY_DEPOSITS_FIXED_BASE = 1`, no random/size extras in `00_defines.txt`), harvested by mining/research stations — and unlike colonies these pay resources directly. Object gates live in `can_have_*` triggers (`00_scripted_triggers.txt`, lines 2368-2515). Rolled tiers are 2-5 almost everywhere; tier 1 and 6+ sit at weight 0 / `potential = no`, reserved for scripted placement.

- **Asteroids** (rocky, ice, crystal): minerals 2/3/4/5 at 5/2.5/1/0.1 with an asteroid multiplier that grows per tier (×2/×3/×4/×5 — rocks punch above weight at high tiers); motes 1/2 (molten/asteroid); alloys 1/2 at 2/0.5 (×1.5 in nebulae); trade 2-5 at 5/2.5/1/0.1 (×2 asteroid); gases on ice asteroids.
- **Molten / toxic / frozen / barren / broken / shattered / junk**: the mineral pool at half weight on molten/toxic/frozen (×0.5); motes on molten; crystals on frozen; gases on toxic; zro 5/1 on toxic/shrouded (halved outside nebulae); alloys on molten/junk/broken/shattered (junk-only tiers 3-25 are weight 0, placed by script).
- **Gas giants**: energy with a flat ×2 bonus; exotic gases; society 2-5 at 5/2.5/0.5/0.1 (also toxic/shrouded); engineering 2 (weight 2); trade 2-5; food 3 only inside nebulae (0.1).
- **Stars** (A/B/F/G/K/M + giants): energy with spectral scaling that steepens at high tiers — dim K/M/T stars ×1.5→×3, F/G flat ×1.25, bright A/B ×0.5; physics 2 at weight 1 on minor stars, physics 3/4/5 at 0.5/0.05/0.01 with A/B ×3, F/G ×2, K/M ×1.5 (hot blue stars are the physics pick).
- **Neutron stars / pulsars / black holes**: physics and engineering 3/4/5 with a ×5 exotic bonus (eng at 1/0.2/0.05); dark matter 10/1 on black holes only (halved outside nebulae).

Bonus detail: every orbital deposit also carries a `habitat_modifier` granting +habitat districts of the matching type, so a rich system makes its habitats richer too.
