# Climate v2 obliquity

The reference is Worldbuilding Pasta's ExoPlaSim runs in "Climate Explorations: Obliquity" (2022). Those runs use Earth's terrain at tilts from 0° to 90°, with CO₂ adjusted at each tilt to hold the global mean near 15 °C. `src/test/earth/climatev2-orbit-sweep.diagnostic.smoke.test.ts` reproduces them:

- knob `tilt with ExoPlaSim's CO₂ (°)`: the 11 tilts, each with the article's CO₂ applied as a greenhouse forcing of 5.35·ln(ppm/280) W/m²;
- knob `axial tilt (°)`, run at 15, 23.5, 30 and 90: Earth's CO₂.

## Storm-track clouds

The air's reflectance is Earth's, placed by each month's belts: each latitude takes Earth's value from the same position relative to the rain belt and the Hadley edges (`temperature.js`, `fillAirRows`). Poleward of the Hadley edge, that value includes Earth's storm-track and polar clouds. Those clouds come from baroclinic eddies, which need the extratropics to cool toward the pole.

For each month and hemisphere, `stormTrackFade` measures that cooling from the current temperature harmonics: the zonal mean at the Hadley edge less the cos-weighted mean poleward of it.

- At 8 K or more (`STORM_GRADIENT_K`), the clouds stand in full. Earth's weakest month, NH August, gives 8.0 K, so Earth itself is unchanged.
- Below 8 K, the clouds' Hadley edge moves linearly toward the pole, so the summer pole takes the reflectance of Earth's Hadley cell. This matches the article's high-tilt summers: one cell spans the hemisphere, the polar front disappears, and the hot poles are too warm for clouds.

The fade applies only to rotating worlds once winds exist. Locked worlds use their own deck (see [pressure.md](pressure.md#tidally-locked-planets)).

## Results

Global mean, °C. With ExoPlaSim's CO₂ the article holds about 15 °C at every tilt (ExoPlaSim's own values in brackets).

| tilt | 0 | 5 | 15 | 23.5 | 30 | 35 | 40 | 45 | 60 | 75 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ExoPlaSim | 14.1 | 14.1 | 14.2 | 15 | 15.6 | 14.4 | 16.1 | 15.7 | 14.9 | 14.6 | 14.3 |
| before the fade | 17.2 | 17.2 | 17.2 | 15.6 | 13.8 | 12.0 | 11.7 | 11.9 | 10.8 | 10.2 | 9.7 |
| with the fade | 17.2 | 17.2 | 17.2 | 15.6 | 14.2 | 13.0 | 13.6 | 14.5 | 14.2 | 13.5 | 13.1 |

At Earth's CO₂, before → after (ExoPlaSim):

- 15°: 15.0 → 15.0 (10.8);
- 30°: 15.7 → 16.1 (19.9);
- 90°: 16.6 → 19.6. ExoPlaSim runs hot here; warm starts need about 38 ppm.

Poles minus equator in the annual mean, before → after (ExoPlaSim):

- 60°: −2.4 → +0.6 °C (poles about 5 warmer);
- 90°: +13.6 → +16.9 °C (poles more than 20 warmer).

Winter sea ice at 45–90°, N + S, falls from 18–24 Mkm² to 10–17 Mkm². ExoPlaSim has small coastal patches only.

## Equatorial seasons

At high tilt the sun crosses the equator at the equinoxes and stands far off it at the solstices, so the equator gets a twice-yearly cycle. ExoPlaSim's maps show equatorial land, in the months after each solstice and equinox. The sweep reports the same: `equatorLandAfterSolsticeC` (January and July) and `equatorLandAfterEquinoxC` (April and October), over land within 10° of the equator, plus `equatorLandMonthlyC`. The older `equatorSolsticeC` and `equatorEquinoxC` include the sea and use the solstice and equinox months themselves, so they mostly measure the slow ocean.

Equatorial land, °C, after the solstices / after the equinoxes:

| tilt | ours | ExoPlaSim |
|---|---|---|
| 45 | 13.6 / 17.9 | 15–25 all year |
| 60 | 3.6 / 14.4 | about 5 / 20 |
| 75 | −6.5 / 11.8 | snow at the solstices |
| 90 | −11.1 / 11.0 | snow at the solstices |

The 60° troughs match, but the equinox peak is about 5 °C short. Two causes were ruled out on the 60° run:

- **Tropical evaporation damping** (`TEMP_EVAP_DAMPING`): with it off, the troughs fall to 0.3 and −1.7 °C and the peaks stay at 13.3 and 15.8.
- **Rain-cloud radiation:** with it off, the peaks change by at most 0.4 °C.

## Known departures

- Low tilt (0–15°) runs about 3 °C warm. Our land ice caps already reach about 50–55°, as ExoPlaSim's do, so the gap is not the ice extent alone. ExoPlaSim's ice-albedo response is stronger than Earth's observed cryosphere forcing, to which ours is fitted (−3.3 W/m² over the NH, Flanner et al. 2011).
- At fixed CO₂ the global mean moves about a tenth as far as ExoPlaSim's between 23.5° and 15° or 30° (−0.6 and +0.5 °C against −4.8 and +4.3).
- At 60° the equator's equinox peak is short (see [Equatorial seasons](#equatorial-seasons)).
- The 90° cold-start ice belt (−27.6 °C at 300 ppm) is ExoPlaSim's second steady state. Our solve starts from one equilibrium and does not find it.
