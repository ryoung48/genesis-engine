# Local weather decision tree

The sole generator is `src/model/climate/weather/local/decision`. It ports the decision tree and cloud table from the sibling `world-generator/src/models/cells/weather/index.ts`, replacing its dice with correlated draws and applying the numeric constraints agreed for this project. It does not infer atmospheric profiles, CAPE, cloud heights or particle transport.

## Vocabulary

Primary phenomena: clear skies, cloudy, dew, thin mist, mist, fog, drizzle, spattering rain, pelting rain, rain shower, thunderstorm, quiet downpour, sleet, cold surface, thin frost, frost, rime, ice fog, dusting, tiny flakes, ice crystals, snow flurry, snowfall, blizzard, sand storm and dust storm.

Cloud/sky descriptions: clear skies, haze, cirrus clouds, altostratus clouds, stratus clouds, altocumulus clouds, cumulus clouds and nimbus clouds. Haze is the original procedural obscuration category, not an extra diagnosed cloud genus.

## Original probabilities and cloud table

Monthly rainfall, rescaled to an Earth-length month (`mm × Earth year / world year`), interpolates the original probability scale: 0/10/25/50/100/150/200/250 mm maps to 0.06/0.18/0.30/0.42/0.54/0.68/0.80/0.92. Above 250 mm the last segment continues, capped at probability one. Negative rainfall is clamped to zero. These values come from the sibling model's `weather/rain/index.ts`.

Five regimes lie on one storminess axis, ordered stormy → rainy → overcast → cloudy → clear, and a single correlated branch draw (600 km/48 h) selects the regime by cumulative share. Neighbouring states therefore follow each other: clearing passes through cloudy and overcast instead of jumping between unrelated slices.

The wet share is p, as in the original. Its stormy fraction is `clamp(0.25 + 0.015 × T, 0.25, 0.6)` for monthly mean temperature T °C: about 0.4 at 10°C, matching the original 0.35/0.90, and 0.6 at ≥23°C, near the ~60% convective share of tropical rain (TRMM). The 0.25 floor keeps cold-season synoptic storms (sleet, blizzard) that the stormy regime also represents.

The dry share 1−p splits into overcast, cloudy and clear so the expected cloud cover equals the monthly cloud fraction (see the cloud coverage constraint). Without cloud data the dry split is the original 0.64/0.12/0.12 renormalized without windy: 0.727/0.136/0.136.

Windy and fog are overlays that never move regime boundaries. A dry regime with wind ≥8 m/s becomes windy, keeping its cloud category. A rainy or stormy hour that ends without precipitation at ≥8 m/s is also reported as windy (a windy lull in a wet system), keeping its cloud category. A calm dry regime whose condensation ladder (below) yields fog, rime or ice fog becomes the fog regime, also keeping its cloud category.

Let p be the rainfall probability. Arid means p<0.15, semi-arid 0.15≤p<0.25, moderate 0.25≤p<0.40 and wet p≥0.40. Those names are the original cloud-table bins, not a new biome classification.

| Regime | Arid | Semi-arid | Moderate | Wet |
| --- | --- | --- | --- | --- |
| Clear | clear skies | clear skies | clear skies | clear skies |
| Overcast | haze | cirrus | altostratus | stratus |
| Rainy | altostratus | stratus | stratus | cumulus |
| Stormy | cumulus | nimbus | nimbus | nimbus |
| Cloudy | altocumulus | cumulus | cumulus | altostratus |

This table is used directly for the five base regimes; windy and fog keep the category of the regime they overlay. Spattering rain therefore has altostratus, stratus and cumulus associations; precipitation never globally forces nimbus.

## Original phenomenon branches

All temperature boundaries below are the original Fahrenheit boundaries, applied to the actual generated temperature. The generator otherwise stores Celsius.

- Stormy/nimbus: a precipitation candidate occurs with probability min(1,2p). Below 31°F it is blizzard, at 31–34°F sleet, above 34 through 69°F quiet downpour, and above 69°F thunderstorm. Otherwise it is quiet cloudy weather.
- Stormy/cumulus: the same candidate probability gives spattering rain, or ice crystals at ≤32°F. Otherwise it is cloudy.
- Rainy/altostratus: probability p gives spattering rain, or ice crystals at ≤32°F; otherwise cloudy.
- Rainy/stratus: the candidate is spattering rain/tiny flakes, changing with probability p to pelting rain/snow flurry, with the frozen alternative at ≤32°F.
- Rainy/cumulus: the candidate is drizzle/dusting, changing with probability p to rain shower/snowfall, with the frozen alternative at ≤32°F.
- Windy: in a snow-season month (monthly mean <0°C), below −0.5°C and with sustained wind ≥13 m/s, blowing snow gives a ground blizzard with no falling snow. Monthly temperature stands in for lying snow, which the model does not store. 13 m/s is where blowing snow typically cuts visibility below 400 m for loose snow. Windy wet-regime lulls use the same rule.
- Windy (dry regime): bare desert/sparse ground with aridity <0.3 and gusts ≥15 m/s yields sand/dust storm respectively. Otherwise it is quiet weather with the selected cloud category.
- Condensation ladder for calm dry regimes, replacing the original p/2p/3p fog draw. Clear skies use it only at night with clear-sky surface cooling (radiative); overcast and cloudy use it outside the local afternoon with their cloud-reduced surface temperature (advective). Depression ≤0.5°C with wind ≤2.5 m/s (radiative) or ≤5 m/s (advective) gives fog, or rime below 32°F with wind ≥1.6 m/s, or ice fog below −30°F. Mist (depression ≤1°C) and thin mist (≤2°C) need ≥32°F and wind ≤8 m/s. Deposition uses the surface margin, surface minus dew point: dew above 0°C at margin ≤0; frost at margin ≤0, thin frost at ≤1°C and, radiatively, cold surface at ≤2°C below 0°C. Advective regimes test mist before deposition; clear nights test deposition first, because dew forms on radiating surfaces before the air itself saturates.
- Clear by day, cloudy and overcast have quiet weather: clear skies when their category is clear skies, otherwise cloudy. This includes the original haze → cloudy wording.

## Explicit numeric constraints

These are the deliberate changes to the old rules; there is no second classifier.

- Wind uses the existing climate vectors and correlated numeric anomalies, not wind dice. Dry-branch windiness starts at 8 m/s sustained. Sand/dust storm requires the existing bare-ground source (desert code 1 / sparse code 2, land excluding ice), aridity <0.3 and gusts ≥15 m/s, about 10 m/s sustained, within the 7–13 m/s 10 m thresholds at which desert sand and dust lift.
- Thunderstorm requires available dew point >0°C and temperature/dew-point depression <10°C; otherwise its candidate becomes pelting rain. The old tree already places thunderstorm above 69°F. No instability or upper-air score remains.
- Blizzard requires gusts ≥15.6 m/s, following the US definition of sustained wind or frequent gusts of 35 mph; otherwise its candidate becomes snowfall. Falling- and blowing-snow visibility uses `max(50,10000/(1+24×extinction))` metres, with extinction equal to snow water rate/2.5 plus (gust/15.6)^2 when snow is falling or blowing and gusts reach that threshold. A blizzard must have visibility <400 m and remain eligible at the current time and 1/2/3 hours earlier; otherwise its displayed outcome is snowfall. These are retained consistency checks, not new storm-frequency tuning.
- Zero mean rainfall forbids a falling-precipitation result. Surface/deposition phenomena are dry outcomes. Wet outcomes receive liquid water, snow, or a nominal 50/50 liquid/ice partition for the original broad sleet category. There is no invented warm-layer/freezing-rain/hail model.

## Rainfall occurrence and intensity

The old tree has no precipitation amounts. Its wet candidates carry relative intensities:

| Candidate | Relative intensity |
| --- | ---: |
| Drizzle | 0.2 |
| Spattering rain | 1 |
| Pelting rain | 10 |
| Rain shower | 3 |
| Quiet downpour | 10 |
| Thunderstorm | 5 |
| Sleet | 1 |
| Dusting / tiny flakes | 0.1 |
| Ice crystals | 0.05 |
| Snow flurry | 0.3 |
| Snowfall | 1 |
| Blizzard | 2.5 |

Occurrence and intensity are set separately. Let r be the monthly-curve mean rate and T the monthly mean temperature. The climatological wet-hour intensity is `I = clamp(0.6 × 1.065^T, 0.3, 4)` mm/h: 6.5%/K is Clausius–Clapeyron scaling, 0.6 mm/h at 0°C gives about 1.2 mm/h at 11°C as in mid-latitude maritime hourly records, and the bounds keep snow water equivalent and tropical rates finite. The target wet-hour fraction is `f = min(0.3, r/I)`; 0.3 is about the wettest station hourly occurrence.

Let W be the tree's probability of a wet candidate and E its expected relative intensity. A wet candidate is accepted when the correlated precipitation draw u < a = min(1, f/W), with rate `(relative × W/E) × r/(aW) × −ln(u/a)`. On acceptance u/a is uniform, so the exponential factor has mean one, the expected rate is exactly r and precipitation-field cores are heaviest. Rejection yields quiet weather with the same cloud category. Occurrence no longer depends on the candidates' relative intensities, so snow and rain climates with equal totals precipitate comparably often.

## Cloud coverage constraint

The cloud table chooses the category; the regime shares set coverage. Nominal mean covers are stormy 0.95, rainy 0.9, overcast 0.9 (0 when its category is haze), cloudy 0.5 and clear 0, following the okta conventions for overcast (≥7/8) and partly cloudy (3–5/8). Let C be the interpolated monthly cloud fraction and m = (C − wet cover)/(1−p) the mean cover the dry hours must supply.

- m ≤ 0: all dry hours are clear, and wet covers scale down to C.
- 0 < m ≤ the overcast/cloudy average: clear takes `1 − m/average`, and overcast and cloudy split the rest equally.
- Larger m: no clear hours; the overcast share rises toward one and covers scale up (capped at 1) as needed.

The clear share therefore falls in cloudy climates and rises in clear ones, and expected cover equals C. Each sample's cover is its regime mean spread uniformly by the precipitation draw's thickness `1−u`: `2m(1−u)` for m<0.5, otherwise `1−2(1−m)u`, so precipitating samples lean toward thick cover and partly cloudy skies occur. When C=0 and r=0 the wet share is zero. A cloud-bearing regime whose mean cover is zero reports cloud coverage/type as unavailable instead of inventing positive coverage. Missing cloud input stays unavailable.

## Presentation vocabulary

The generated primary phenomenon and cloud category go directly to the wiki and bench. There is no later rain/snow/intensity-to-label mapping. Province aggregation keeps its representative regime, phenomenon and cloud description together. See [local weather](local-weather.md) for time, correlation, aggregation and diagnostics.
