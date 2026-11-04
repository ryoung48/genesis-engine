# Local weather decision tree

The sole generator is `src/model/climate/weather/local/decision`. It ports the decision tree and cloud table from the sibling `world-generator/src/models/cells/weather/index.ts`, replacing its dice with correlated draws and applying the numeric constraints agreed for this project. It does not infer atmospheric profiles, CAPE, cloud heights or particle transport. Tropical cyclones come from the generated cyclone-risk field and are applied in `region` (see Tropical cyclones).

## Vocabulary

36 primary phenomena:

- Sky and surface: clear skies, cloudy, dew, frost.
- Obscuration: mist, haze, fog, freezing fog, ice fog, ice crystals.
- Rain: drizzle, freezing drizzle, light rain, moderate rain, heavy rain, light showers, rain showers, freezing rain, rain and snow.
- Convective: thunderstorm, hail, tornado, thundersnow.
- Snow: light snow, moderate snow, heavy snow, snow showers, heavy snow showers, drifting snow, blizzard.
- Wind-raised particles: blowing sand, blowing dust, sand storm, dust storm.
- Tropical cyclones: tropical storm, hurricane.

Rain and snow labels are bands of the rate that actually falls (see Precipitation phase and rate bands). "Rain and snow" is the British "sleet": a rain–snow mix, partitioned half liquid and half snow. Ice pellets are not a separate outcome.

Cloud/sky descriptions: clear skies, cirrus clouds, altostratus clouds, stratus clouds, altocumulus clouds, stratocumulus clouds, cumulus clouds and nimbus clouds.

## Original probabilities and cloud table

Monthly rainfall, rescaled to an Earth-length month (`mm × Earth year / world year`), interpolates the original probability scale: 0/10/25/50/100/150/200/250 mm maps to 0.06/0.18/0.30/0.42/0.54/0.68/0.80/0.92. Above 250 mm the last segment continues, capped at probability one. Negative rainfall is clamped to zero. These values come from the sibling model's `weather/rain/index.ts`.

Five regimes lie on one storminess axis, ordered stormy → rainy → overcast → cloudy → clear, and a single correlated branch draw (600 km/48 h) selects the regime by cumulative share. Neighbouring states therefore follow each other: clearing passes through cloudy and overcast instead of jumping between unrelated slices.

The wet share is p, as in the original. Its stormy fraction is `clamp(0.25 + 0.015 × T, 0.25, 0.6)` for monthly mean temperature T °C: about 0.4 at 10°C, matching the original 0.35/0.90, and 0.6 at ≥23°C, near the ~60% convective share of tropical rain (TRMM). The 0.25 floor keeps cold-season synoptic storms (blizzard, thundersnow) that the stormy regime also represents.

The dry share 1−p splits into overcast, cloudy and clear so the expected cloud cover equals the monthly cloud fraction (see the cloud coverage constraint). Without cloud data the dry split is the original 0.64/0.12/0.12 renormalized without windy: 0.727/0.136/0.136.

Windy and fog are overlays that never move regime boundaries. A dry regime whose condensation ladder (below) yields fog, freezing fog or ice fog becomes the fog regime. Otherwise a dry regime with wind ≥8 m/s becomes windy. A rainy or stormy hour that ends without precipitation at ≥8 m/s is also reported as windy (a windy lull in a wet system). Every overlay keeps its regime's cloud category. Each sample also reports its base regime before the windy relabel, so wind can be compared by regime.

Let p be the rainfall probability. Arid means p<0.15, semi-arid 0.15≤p<0.25, moderate 0.25≤p<0.40 and wet p≥0.40. Those names are the original cloud-table bins, not a new biome classification.

| Regime | Arid | Semi-arid | Moderate | Wet |
| --- | --- | --- | --- | --- |
| Clear | clear skies | clear skies | clear skies | clear skies |
| Overcast | cirrus | cirrus | altostratus | stratus |
| Rainy | altostratus | stratus | stratus | cumulus (≥15°C or <0°C) / stratus |
| Stormy | cumulus | nimbus | nimbus | nimbus |
| Cloudy | altocumulus | cumulus | cumulus | stratocumulus |

This table is used for the five base regimes; windy keeps the category of the regime it overlays. Three deliberate changes from the original table:

- Wet-climate rainy hours are cumulus (showers) when the monthly mean is ≥15°C or below 0°C, and stratus in between. At 15°C the stormy-share formula's convective fraction is about one half, so cool maritime rain is mostly layered. A wet month below 0°C means a snowbelt climate, where cold air crossing open water or lakes produces convective snow showers.
- Wet-climate cloudy hours are stratocumulus, the commonest low cloud of moist climates, instead of altostratus.
- Non-precipitating cumulus at night is reported as stratocumulus, since fair-weather cumulus spreads out or dies after sunset.

Overcast and cloudy hours, and rainy hours in which no rain falls (using the overcast shares), do not use their table entry for the reported cloud. Each hour reports one predominant type, chosen as low, middle or high cloud by a correlated cloud-layer draw (600 km/48 h, so a region keeps its cloud deck for a day or two). The table entry still drives that hour's weather outcomes. The low/middle shares by climate band (arid, semi-arid, moderate, wet) are:

| Type | Arid | Semi-arid | Moderate | Wet |
| --- | --- | --- | --- | --- |
| Overcast | 0.15/0.45 | 0.30/0.45 | 0.45/0.40 | 0.60/0.30 |
| Cloudy | 0.30/0.45 | 0.45/0.35 | 0.55/0.30 | 0.65/0.25 |

The remainder of each row is high cloud.
- Low cloud: stratus (wet) or stratocumulus for overcast; stratocumulus (wet) or cumulus for cloudy.
- Middle cloud: altostratus for overcast, altocumulus for cloudy.
- High cloud: cirrus.

Surface cloud atlases over land (Warren and Hahn) report middle clouds in roughly a third of observations and stratus in about a tenth, counted per layer. One-type-per-hour shares should sit below that, so the middle shares are 0.25–0.45. Drier climates lean to middle and high cloud because moist low cloud needs boundary-layer humidity. These shares are design choices checked against the bench, not calibrated values.

Ahead of a front, falling pressure moves `0.5 × low × clamp(−tendency/2 hPa, 0, 1)` of the low share to altostratus in overcast hours and to cirrus in cloudy hours. That follows the warm-front sequence of cirrus, then cirrostratus, then altostratus, then nimbostratus as a system approaches.

Fog from overcast or cloudy hours with cloud cover (advective fog) is reported as stratus, cloud at ground level. Radiative fog keeps the clear regime's category. Light rain has altostratus, stratus and nimbus associations; precipitation never globally forces nimbus.

## Original phenomenon branches

Temperature boundaries below are the original Fahrenheit boundaries where given in °F, applied to the actual generated temperature. The generator otherwise stores Celsius.

- Stormy/nimbus: a precipitation candidate occurs with probability min(1,2p). With dew point ≥55°F (12.8°C) it is a thunderstorm, or hail or tornado for the shares given under Severe-weather modulation. 55°F is the common forecasting floor for boundary-layer moisture that supports deep convection. It replaces the old 69°F air-temperature floor, which excluded most cool-season and evening mid-latitude storms. Below that dew point the candidate takes the precipitation phase below: heavy rain, rain and snow, freezing rain, or the snow share. 2% of the snow share is thundersnow; the rest is blizzard. Otherwise it is quiet cloudy weather.
- Stormy/cumulus: the same candidate probability gives convective light rain or light snow through the precipitation phase, labelled as showers. Otherwise it is cloudy.
- Rainy/altostratus: probability p gives light rain or light snow through the precipitation phase; otherwise cloudy.
- Rainy/stratus: the candidate is light rain/light snow, changing with probability p to heavy rain/moderate snow.
- Rainy/cumulus: the candidate is convective drizzle-weight rain/light snow, changing with probability p to moderate rain/moderate snow, all labelled as showers.
- Windy: in a snow-season month (monthly mean <0°C) and below −0.5°C, lying snow is assumed. Sustained wind ≥13 m/s gives a ground blizzard: 13 m/s is where blowing snow typically cuts visibility below 400 m for loose snow. 8–13 m/s gives drifting snow below eye level: dry-snow transport thresholds are roughly 4–11 m/s, averaging about 7.7 m/s (Li & Pomeroy 1997, J. Appl. Meteor. 36:205). Neither has falling snow. Monthly temperature stands in for lying snow, which the model does not store. Windy wet-regime lulls use the same rule.
- Windy (dry regime): bare desert/sparse ground with aridity <0.3 gives blowing sand/dust at gusts ≥10 m/s and sand/dust storm at gusts ≥15 m/s. Otherwise it is quiet weather with the selected cloud category.
- Condensation ladder for dry regimes, replacing the original p/2p/3p fog draw:
  - Clear skies (radiative) use clear-sky surface cooling and only form fog, mist and deposits at night. Ice crystals also forms by day.
  - Overcast and cloudy (advective) use their cloud-reduced surface temperature at any hour, so advection and sea fog are not excluded in the afternoon.
  - Depression ≤0.5°C with wind ≤2.5 m/s (radiative) or ≤10 m/s (advective) gives fog. From −10°C to 32°F it is freezing fog: below about −10°C supercooled droplets glaciate quickly, so droplet fog is mostly a 0 to −10°C phenomenon (Gultepe et al. 2007, Pure Appl. Geophys. 164:1121). From −10°C to −30°F saturated air gives no fog. Below −30°F it is ice fog only with wind ≤2.5 m/s; natural ice fog is a calm-air phenomenon.
  - Ice crystals needs the clear regime, air ≤−25°C, wind ≤5 m/s, and vapour at or above ice saturation (Magnus water and ice formulas). Polar observations report it mainly in clear, calm air colder than about −25°C.
  - Mist (depression ≤2°C) needs ≥32°F and wind ≤8 m/s.
  - Deposition uses the surface margin, surface minus dew point: dew above 0°C at margin ≤0; frost at margin ≤1°C below 0°C.
  - Advective regimes test mist before deposition. Clear nights test deposition first, because dew forms on radiating surfaces before the air itself saturates.
- Haze: dry hours of the clear, cloudy, overcast and windy types are hazy with share `0.3 × clamp((0.5 − aridity)/0.5, 0, 1) × clamp((0.3 − p)/0.15, 0, 1)`, when relative humidity is below 80%. Haze is dust and other particles in dry air, so it follows dryness rather than cloud cover.
  - Aridity is annual P/PET; below 0.5 are the UNEP semi-arid and arid classes.
  - The month factor is full in arid months (p ≤ 0.15) and zero from p = 0.3.
  - The 0.3 ceiling matches the 10–30% of observations reporting haze or dust haze at very hazy dry-season stations (Sahel Harmattan, Middle East summer).
  - Above 80% humidity the obscuration is mist, the usual dividing line between mist and haze in weather reports.
  - The correlated event draw picks haze, so hazy spells cluster. Haze caps visibility at 5 km and keeps the hour's cloud category. Earlier versions used haze as a zero-cover cloud category, which made it rare and tied it to cloud cover instead of dryness.
- Clear by day, cloudy and overcast otherwise have quiet weather: clear skies when their category is clear skies, otherwise cloudy.

## Explicit numeric constraints

These are the deliberate changes to the old rules; there is no second classifier.

- Wind uses the existing climate vectors and correlated numeric anomalies, not wind dice. Dry-branch windiness starts at 8 m/s sustained. Blowing sand/dust and sand/dust storms require the existing bare-ground source (desert code 1 / sparse code 2, land excluding ice) and aridity <0.3. The storm threshold of gusts ≥15 m/s (about 10 m/s sustained) lies within the 7–13 m/s 10 m thresholds at which desert sand and dust lift. Blowing particles cap visibility at 5 km, storms at 300 m.
- Thunderstorm, hail and tornado require temperature/dew-point depression <10°C on top of the 55°F dew-point floor; otherwise the candidate becomes heavy rain. No instability or upper-air score remains.
- Blizzard requires gusts ≥15.6 m/s, following the US definition of sustained wind or frequent gusts of 35 mph; otherwise its candidate becomes moderate snow. Falling- and blowing-snow visibility uses `max(50,10000/(1+24×extinction))` metres, with extinction equal to snow water rate/2.5 plus (gust/15.6)^2 when snow is falling or blowing and gusts reach that threshold. A blizzard must have visibility <400 m and remain eligible at the current time and 1/2/3 hours earlier; otherwise its displayed outcome is snowfall. The 8, 13, 15.6 m/s and 400 m limits are shared through `WEATHER_DECISION.limits()`.
- Zero mean rainfall forbids a falling-precipitation result. Surface/deposition phenomena, ice crystals, drifting snow and blowing particles are dry outcomes. Wet outcomes receive liquid water, snow, a 50/50 liquid/snow partition for rain and snow, or all ice for hail.

## Severe-weather modulation

The stormy share is `clamp(base × (1 + b), 0, 0.9)`, where `base` is the temperature-driven share above and `b` the diurnal convective bias.

- Diurnal bias: `b = A × cos(2π(solarPhase − 0.625))`, peaking at 15:00 local solar time, with A = +0.4 over land and −0.15 over ocean (so oceans peak near 03:00). Dai (2001, J. Climate 14:1092) finds late-afternoon land maxima of tens of percent of the daily mean and weaker early-morning ocean maxima. The bias averages to zero over a day, and tide-locked worlds use b = 0. Because the wet-hour rate and acceptance are normalised against the monthly mean, this moves rain between hours without changing monthly totals.
- Hail: of thunderstorm candidates, `0.1 × land × (1 + b) × organisation × survival` become hail (relative intensity 4, partitioned entirely as ice).
  - `organisation = min(1, 0.25 + 0.75 × max(sin²(2φ), tornadoRisk))`. The 45° storm-track term stands in for the vertical shear that organises long-lived hail-producing updrafts. The generated tornado-risk field marks severe-convection environments (moist, flat, mid-latitude interiors). The 0.25 floor keeps tropical highland hail possible.
  - `survival = clamp((4.5 − H)/1, 0, 1)`, where `H = max(0, monthly T)/6.5` km is the freezing-level height above ground for a 6.5 K/km lapse rate. Hail rarely reaches the surface when the melting level is above about 4–4.5 km (cf. Prein & Holland 2018, Weather Clim. Extremes 22:10); survival fades from 3.5 to 4.5 km. This stops lowland tropical hail without a fixed surface-temperature cut-off.
  - The 0.1 ceiling is an uncalibrated bound, checked against the bench. Ocean hail is excluded as rare. Hail follows the thunderstorm humidity gate and uses the cumulonimbus category.
- Tornado: of thunderstorm candidates, `0.015 × land × tornadoRisk × (1 + b)` become tornado (relative intensity 5, liquid, cumulonimbus). This uses the generated tornado-risk field (0–1; moist, flat, mid-latitude interiors score highest). At risk 1 it gives about 1.5% of thunderstorm hours. Oklahoma averages about 60 tornadoes a year over 181,000 km² (NOAA Storm Prediction Center climatology), roughly one tornado-hour a year per 2,000 km² province against 50–100 thunderstorm hours. The diurnal bias b gives the late-afternoon peak. A tornado sets the gust to at least `29 + 20u` m/s: 29 m/s is the bottom of the EF0 3-second gust range, and the span covers EF0–EF1, the ratings of most tornadoes. It is the province-scale "tornado in the area" condition, not a point strike. Tornadoes are otherwise outside the province weather; hail organisation and outflow gusts also read the tornado-risk field.
- Convective outflow gusts: thunderstorm, hail, tornado and thundersnow raise the gust to at least `10 + 10u + 10 × max(0, b) + 5 × hail + 5 × tornadoRisk` m/s, where u is the gust draw. Ordinary outflow therefore gusts 10–20 m/s, typical of thunderstorm peak gusts. Afternoon, hail and severe environments push the tail past 25.7 m/s (58 mph), the US severe-thunderstorm wind criterion.
- Squall is not modelled separately: outflow gusts carry the visible effect, and a gust-front label would need convective downdraft information the tree lacks.

## Precipitation phase and rate bands

Phase follows the wet-bulb temperature, approximated as `Tw = T − (T − Td)/3` with the depression capped at 15°C (no dew point: `Tw = T`). The snow fraction is logistic, `s = 1/(1 + exp(Tw − 1°C))`, centred on the ~1°C near-surface temperature at which rain and snow are equally likely (Jennings et al. 2018, Nat. Commun. 9:1148). A wet candidate splits into snow `s²`, rain and snow `2s(1−s)` and liquid `(1−s)²`, so the phases overlap in a transition band instead of switching at one temperature. Liquid becomes freezing rain when the air temperature is below 0°C. Split outcomes under 0.1% of the candidate weight are dropped.

Freezing rain also needs a warm layer aloft, which the column-free model cannot see. Between −5°C and 0°C a warm-nose share `n = 0.4 × clamp((T + 5)/4, 0, 1) × clamp(0.5 + (T − monthly T)/8, 0, 1)` of the snow and rain-and-snow weight in layered-cloud branches becomes freezing rain. Shower branches (cumulus) get no warm-nose share, because the warm layer comes with frontal layered cloud. It is full from −1°C to 0°C and zero at −5°C, following the surface range of most freezing-rain reports (Cortinas et al. 2004, Wea. Forecasting 19:377). The second factor favours hours warmer than the monthly mean, standing in for warm advection on the warm side of a system. The 0.4 ceiling is an uncalibrated bound, checked against the bench.

After the rate is drawn, labels are re-banded by it:

- Rain uses the AMS intensity classes: light rain <2.5, moderate rain <7.6 and heavy rain ≥7.6 mm/h. Drizzle (<0.5 mm/h) and freezing drizzle need a stratus cloud category; drizzle is small drops from stratus, not just a low rate. Light rain from other clouds stays light rain.
- Convective rain from cumulus branches is light showers <2.5, rain showers <7.6 and heavy rain ≥7.6 mm/h.
- Snow uses water-equivalent rates where the snowfall visibility formula (below) gives the NWS light/moderate/heavy limits of about 1 km and 0.5 km: light snow <1, moderate snow <2 and heavy snow ≥2 mm/h. Convective snow is snow showers <2 and heavy snow showers ≥2 mm/h.
- Thunderstorm, hail, tornado, thundersnow, rain and snow, freezing rain, blizzard and tropical cyclones keep their labels.

The relative intensities below only set the rate split between candidates; the label shown comes from the rate.

Rain lowers visibility through `0.025 × (liquid rate)^0.6` added to the snow extinction, about 3 km at 10 mm/h and 1.4 km at 50 mm/h.

## Rainfall occurrence and intensity

The old tree has no precipitation amounts. Its wet candidates carry relative intensities:

| Candidate | Relative intensity |
| --- | ---: |
| Drizzle / freezing drizzle | 0.2 |
| Light rain / light showers / freezing rain / rain and snow | 1 |
| Moderate rain / rain showers | 3 |
| Hail | 4 |
| Thunderstorm / tornado | 5 |
| Heavy rain / tropical storm / hurricane | 10 |
| Light snow | 0.2 |
| Moderate snow / snow showers | 1 |
| Heavy snow | 2 |
| Blizzard / thundersnow | 2.5 |

Showers take the intensity of the candidate they relabel.

Occurrence and intensity are set separately. Let r be the monthly-curve mean rate and T the monthly mean temperature. The climatological wet-hour intensity is `I = clamp(0.6 × 1.065^T, 0.3, 4)` mm/h: 6.5%/K is Clausius–Clapeyron scaling, 0.6 mm/h at 0°C gives about 1.2 mm/h at 11°C as in mid-latitude maritime hourly records, and the bounds keep snow water equivalent and tropical rates finite. The target wet-hour fraction is `f = min(0.3, r/I)`; 0.3 is about the wettest station hourly occurrence.

Let W be the tree's probability of a wet candidate and E its expected relative intensity. A wet candidate is accepted when the correlated precipitation draw u < a = min(1, f/W), with rate `(relative × W/E) × r/(aW) × −ln(u/a)`. On acceptance u/a is uniform, so the exponential factor has mean one, the expected rate is exactly r and precipitation-field cores are heaviest. Rejection yields quiet weather with the same cloud category. Occurrence no longer depends on the candidates' relative intensities, so snow and rain climates with equal totals precipitate comparably often.

## Tropical cyclones

The generated `cycloneRisk` field (0–1, normalised to its 99th percentile) drives tropical storms and hurricanes. In a month, a sample's cyclone share is `0.01 × risk × clamp(1 − (warmest monthly T − monthly T)/3, 0, 1)`. Storms are confined to the warm season within 3°C of the warmest month. The share is 1% of peak-season hours at the highest-risk coasts, about 30 hours a year over a four-month season: one to three tropical-storm passages of 12–24 hours, typical of the most exposed Gulf and western-Pacific coasts.

A dedicated correlated draw (600 km/48 h) marks the share's upper tail. Its depth x ∈ (0, 1] within that tail sets sustained wind `17.5 + 30x²` m/s, overriding lower winds. Tropical storm starts at 17.5 m/s (34 kt). Hurricane is ≥32.9 m/s (64 kt, Saffir–Simpson category 1), about 28% of cyclone hours, rising to 47.5 m/s at the core.

A cyclone hour forces the stormy regime and an accepted precipitation draw, then relabels the outcome tropical storm or hurricane with the cumulonimbus category. This adds rain above the monthly mean during those hours, an intentional excess bounded by the 1% share.

## Cloud coverage constraint

The cloud table chooses the category; the regime shares set coverage. Nominal mean covers are stormy 0.95, rainy 0.9, overcast 0.9, cloudy 0.5 and clear 0.1, following the okta conventions for overcast (≥7/8), partly cloudy (3–5/8) and few clouds (1–2/8). Let C be the interpolated monthly cloud fraction and m = (C − wet cover)/(1−p) the mean cover the dry hours must supply.

- m ≤ 0.1: all dry hours are clear, with clear cover scaled to m; if m < 0, wet covers also scale down to C.
- 0.1 < m ≤ the overcast/cloudy average: clear takes `1 − (m − 0.1)/(average − 0.1)`, and overcast and cloudy split the rest equally.
- Larger m: no clear hours; the overcast share rises toward one and covers scale up (capped at 1) as needed.

The clear share therefore falls in cloudy climates and rises in clear ones, and expected cover equals C. Each sample's cover is its regime mean spread uniformly by the precipitation draw's thickness `1−u`: `2m(1−u)` for m<0.5, otherwise `1−2(1−m)u`, so precipitating samples lean toward thick cover and partly cloudy skies occur. Clear-regime cover below 1/16 (half an okta) rounds to exactly clear. Above it, the category is cumulus by day and cirrus by night, so a "mostly clear" sky names its few clouds. When C=0 and r=0 the wet share is zero. A cloud-bearing regime whose mean cover is zero reports cloud coverage/type as unavailable instead of inventing positive coverage. Missing cloud input stays unavailable.

## Presentation vocabulary

The generated primary phenomenon and cloud category go directly to the wiki and bench. There is no later rain/snow/intensity-to-label mapping. Province aggregation keeps its representative regime, phenomenon and cloud description together. See [local weather](local-weather.md) for time, correlation, aggregation and diagnostics.
