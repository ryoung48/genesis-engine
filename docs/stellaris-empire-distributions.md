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
- Civic rarity tiers: `common/scripted_variables/00_scripted_variables.txt` (lines 43-45, 457-462)
- Species classes: `common/species_classes/01_base_species_classes.txt`, `00_species_classes.txt`
- Portraits: `common/portrait_sets/00_portrait_sets.txt`

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

Democratic, oligarchic, dictatorial, imperial, hive mind, machine intelligence: all `random_weight` base **2** (uniform). Corporate has no `random_weight` entry and is DLC-gated, so it is effectively never randomly rolled.

## Civics (`common/governments/civics/`)

Rarity tiers (`00_scripted_variables.txt`): default **5** / uncommon **3** / rare **1**. Most standard civics are 5. Exceptions:

- Boosted to **1000**: inwards perfection, fanatic purifiers, scorched earth (+ hive variant). Purifiers/scorched drop to 0 when disruptive gameplay is blocked.
- **Rare (1)**: shared burden, death cult, idyllic bloom, pompous purists, dystopian society, dark consortium, natural design, guided_sapience, galactic curators, and most newest-DLC civics.
- **Never random (0)**: eager explorers, stargazers, exploration protocol, privatized exploration; khan/sovereign origin-locked civics; servitor/assimilator once the game has started.
- Odd fixed values: memory vault / heroic tales / selective kinship / augmentation bazaars (4), life seeded + hive variants (5), beastmasters (10).

`ai_weight` is a separate system (base 5/3/1 matching rarity, ×3 on personality match, ×0.2 on mismatch, 0 on forbid) for mid-game AI reform picks — not spawn distribution.

## Species (`common/species_classes/`, `common/portrait_sets/`)

- Classes carry **no** `random_weight` block, so they are picked uniformly (subject to DLC `playable` gates) — except **MACHINE, explicitly down-weighted to base 1** (`00_species_classes.txt`, line 326). MACHINE also prefers gestalt ethics ~50% of the time (`preferred_ethics_weight` 6.5, per the file's own comment).
- Playable classes: mammalian, reptilian, avian, arthropoid, molluscoid, fungoid, plus DLC-gated plantoid, lithoid, necroid, aquatic, toxoid, cybernetic, biogenesis, wilderness, psionic, mindwarden, infernal, imperial.
- Randomizable portrait counts per class (including DLC `conditional_portraits`): mammalian 28, machine 23, avian/arthropoid 18, reptilian/humanoid/plantoid 17, fungoid/lithoid/necroid/molluscoid 16, aquatic/toxoid 15, infernal 10, human 2.
