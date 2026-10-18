# Religions and doctrines

Doctrines are generated lazily, outside the history simulation, from the world's religion types and families (`RELIGION_DOCTRINE.of` in `src/model/people/doctrine`, memoized on the type array). They do not change culture gender systems or any simulation statistic; the world's `religionGender` preference is separate. People read the `marriage_type` option.

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

Doctrines exist for every procedural world that has religion types and families, and are computed on first use. Earth imports have none. The religion wiki opens from the Religion row of a person page, religion segments in nation and organization charts, and religion mentions in nation and organization timelines. It shows the name, type, family, sibling religions, all fifteen doctrines with differences from the family marked, virtues and sins, and the nations holding it at the viewed date.

## Effect on people

`marriage_type` is read for a man's home province religion in the 25-year frame at the time. Monogamy gives one spouse at a time. Polygamy lets a man aged 18–69 take additional wives, and concubines lets him keep concubines, up to a count set by his standing (nothing, county, duchy, kingdom, empire, hegemony: 0, 0, 1, 2, 3, 3; only rulers have standing, read from the titles their realm holds). Each eligible man seeks with chance 0.35 a year. See [families](families.md#plural-wives-and-concubines). `consanguinity` sets which marriages between relatives are possible ([families](families.md#marriages-between-relatives)). The other eleven doctrine groups, virtues and sins have no effect on generated people; same-sex marriage stays disabled.

## Verification

`people-query.smoke.test.ts` checks that every religion has a marriage type and that plural wives and concubines occur.
