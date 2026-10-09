# Religions and doctrines

Scope: `:history`. Religion metadata is fixed at world generation. Marriage and culture gender systems read its doctrines.

## Placement and types

Religions partition the culture adjacency graph, targeting six active cultures per religion. Families partition the religion adjacency graph, targeting three active religions per family. These partitions do not depend on doctrines.

Every family has one type: Animistic, Polytheistic, Dualistic, Monotheistic or Non-theistic. All its religions share that type. The era selects a five-weight row; the family's mean migration wave tilts late-settled families toward Animistic and early-settled families toward Monotheistic and Polytheistic. Government is not an input. A seed hash chooses the type without consuming engine randomness.

The rows in `src/model/history/sim/religion/index.ts` average the previous government priors over each era's government mix and multipliers, drop Non-religious and renormalize. Migration thresholds and multipliers retain the previous implementation's values.

## Family doctrines and religion variation

Each family draws one option in each of fifteen groups:

- Marriage type, divorce, bastardry and consanguinity.
- Homosexuality, adultery, witchcraft and kinslaying.
- Gender and pluralism.
- Head of faith and clerical tradition.
- Pilgrimage, funeral and monasticism.

The source tables are CK3 1.19.0.6 faith counts. An option's probability is `(type count + pooled share) / (type faith total + 1)`: one pseudo-faith distributed according to the pooled frequencies. A shared quantile is used with probability 0.55 for each of adultery, homosexuality and witchcraft, in strict-to-lax order. This preserves each group's marginal distribution while making family conduct doctrines lean together.

Head of faith is resolved before clerical tradition. A temporal head always requires lay clergy. Families without a temporal head draw clerical tradition from counts excluding temporal-head faiths. This constraint also applies after a religion changes its head.

Each religion copies its family's options and independently attempts changes at the CK3 per-group rates. A changed option is drawn from the same type's smoothed distribution with the original option removed. Funeral has a zero change rate. A temporal head can force a clerical change or suppress an attempted one. Final differences therefore differ slightly from attempted changes.

`religionDoctrine.options` is a flat religion-by-group `Uint8Array`. `familyOptions` preserves each family's original choices. Both use `RELIGION_DOCTRINE.groups` order. The worker transfers both buffers; the trait lists use structured cloning.

## Virtues and sins

Families draw three distinct virtues from type-specific CK3 religion counts. Each draw excludes the trait and its entire existing personality opposition group. Families then draw three distinct sins, excluding their virtues. With probability 0.82, each sin comes from the corresponding virtue's eligible opposites; otherwise it comes from the eligible sin table. Zero-weight opposite sets are sampled uniformly, so Wrathful can produce Calm even though Calm has no CK3 sin count. An opposite already selected as a sin is excluded from later draws.

Religions share their family's three virtues and three sins. Opposition groups come from `TRAITS.opposites`, shared with personality generation.

## Source and determinism

`scripts/ck3/religion-doctrine-counts.py <CK3>/game/common/religion` regenerates the tables, flip rates and conduct correlations. Religions map to Dualistic for dualism and Zoroastrianism, Non-theistic for Buddhism/Jainism/Taoism/Confucianism, Monotheistic for a monotheist default, Animistic for unreformed polytheist religions, and Polytheistic otherwise.

Faith options combine religion defaults, faith overrides and main-rite overrides. Adultery takes the stricter men's/women's option. Virtuous witchcraft merges into accepted, dynasty-wide kinslaying into extended-family crime, dynastic consanguinity into restricted and mandatory Hajj into mandatory. Earth-specific, special and non-creatable groups, sacraments, tenets and rites are excluded.

The three assignment streams have salts 7411, 7412 and 7413, with family/religion stride 8191. Family draws consume one shared quantile plus two draws per doctrine group; religion changes consume two per group; traits consume three virtue draws and two per sin. Conditional choices retain the fixed draw counts. No engine stream is advanced.

## Availability and wiki

Procedural worlds carry doctrines. Earth imports explicitly omit them, including imports without a province raster. Both paths still assign the five types to generated religion partitions.

On supported worlds, religion segments in nation and organization charts, religion mentions in nation and organization timelines, and the Religion row of a person page open the religion wiki. It shows the name, type, family, sibling religions, all fifteen doctrines with differences from the family marked, virtues and sins, and province and nation holdings at the viewed date. A family's label uses its lowest-index religion's name followed by “family”. Sibling and nation chips open their respective pages. Unsupported or unresolved religion keys remain unlinked.

Marriage type, consanguinity and gender have the simulation effects below. The other doctrines, virtues and sins do not enter [opinion](opinion-and-relationships.md) or faith hostility. Heads of faith here are doctrine options rather than simulated people.

## Verification and report

`src/test/history-run/religion-doctrine.smoke.test.ts` checks determinism, smoothing, conduct quantiles, clerical constraints, trait eligibility, procedural carriage, Earth exclusion and structured transfer. `religion-wiki.smoke.test.ts` checks rows, differences, sibling links, viewed-date holdings and unsupported keys.

`pnpm report:history` records family/type option shares alongside smoothed CK3 probabilities, final differences, clerical-rule cases, conduct correlations, opposite sins and duplicate-sin violations under `diagnostics.religion`. Timing and memory are compared separately from engine statistics.

## Simulation rules

`marriage_type` selects restricted monogamy, up to three additional wives, or up to three concubines; `consanguinity` sets both partners' kinship eligibility bars. See [marriage rules](marriage-and-alliances.md#religion-kinship-and-consorts). `gender` forces male-dominated religions' cultures to patriarchal. Equal religions draw patriarchal/equal/matriarchal at 0.14/0.29/0.57 from a separate stream (salt 7414, culture stride 8191); succession continues to read culture systems. Earth imports retain their existing systems and use the default marriage law.

The remaining twelve doctrine groups, virtues and sins have no engine effects. Homosexuality acceptance does not enable same-sex marriage while that game rule is disabled.
