# Religions

Scope: `:history`. Religion metadata is fixed at world generation. Its one simulation effect is the gender preference, which constrains culture gender systems.

## Placement and types

Religions partition the culture adjacency graph, targeting six active cultures per religion. Families partition the religion adjacency graph, targeting three active religions per family. These partitions do not depend on the gender preference.

Every family has one type: Animistic, Polytheistic, Dualistic, Monotheistic or Non-theistic. All its religions share that type. The era selects a five-weight row; the family's mean migration wave tilts late-settled families toward Animistic and early-settled families toward Monotheistic and Polytheistic. Government is not an input. A seed hash chooses the type without consuming engine randomness.

The rows in `src/model/history/sim/religion/index.ts` average the previous government priors over each era's government mix and multipliers, drop Non-religious and renormalize. Migration thresholds and multipliers retain the previous implementation's values.

## Gender preference

Each religion is either male-dominated or equal. A family draws one preference and each religion copies it, then flips it with probability 0.118. The source tables are CK3 1.19.0.6 faith counts of the gender doctrine by religion type:

| Type | Male-dominated | Equal |
|---|---:|---:|
| Animistic | 26 | 13 |
| Polytheistic | 6 | 1 |
| Dualistic | 10 | 2 |
| Monotheistic | 35 | 2 |
| Non-theistic | 8 | 0 |

An option's probability is `(type count + pooled share) / (type faith total + 1)`: one pseudo-faith distributed according to the pooled frequencies. A flip draws from the same type's smoothed distribution with the original option removed, which for two options is the other one.

Code: `src/model/history/sim/religion/gender` (`RELIGION_GENDER`). The draws are hashes of the world seed, channel 7415 for the family and 7416 for each religion's two flip draws (attempt, then choice), salted by family or religion index, so they consume no engine randomness and individual religions differ from earlier worlds while the rates do not. `religionGender` is a `Uint8Array` with one entry per religion (0 male-dominated, 1 equal); the generation pipelines, worker protocol and engine state carry it, and Earth imports omit it.

## Culture gender systems

`GENDER_SYSTEM.restrict` reads the preference. A culture whose religion is male-dominated is forced to patriarchal. A culture whose religion is equal draws patriarchal, equal or matriarchal at 0.14, 0.29 and 0.57 from a separate stream (salt 7414, culture stride 8191). Cultures without a religion keep their system. Rulers' sex follows the culture's system (`GENDER_SYSTEM.resolveLeaderGender`): patriarchal 95% male, equal 50%, matriarchal 95% female; succession does not read sex.

## Verification and report

`src/test/history-run/religion-gender.smoke.test.ts` checks the male-dominated share of each religion type against the smoothed CK3 rate within sampling error, family coherence, determinism, the forced patriarchy and the 0.14/0.29/0.57 split. `pnpm report:history` records the male-dominated share per religion type under `diagnostics.religion` and the cultures by preference and system under `diagnostics.religionGenderSystems`.
