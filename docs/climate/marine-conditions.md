# Marine conditions

Ocean-facing provinces carry a tide and a wave reading in the province weather card's **Sea** block. Conditions are evaluated at one shore cell and one sea cell per province. They are display-only; the only world-generation effect is the tidal range described below.

## Tidal range

`post-elevation` builds `tidalSchedule` with `TIDAL_SCHEDULE.computeTidalSchedule({ moons: params.moons, params })` and turns it into the per-cell spring range `tidalRange` with `TIDAL_MAP.computeSpringTideMap`. `GenesisParams.moons` is required:

- The UI passes the main world's moons as shown in the solar-system panel (`displayMoons`), alongside the other system-derived overrides (`albedo`, `greenhouseFactor`, `seismologyTotalHeatingK`). Editing the moons afterwards takes effect on the next generation.
- Headless runs (history bench, tests) use `DEFAULT_WORLD_PARAMS.moons`, Earth's Moon (`SOL_SYSTEM.solLunaDefault`).
- A world with no moons gets a star-only range.

Moons are validated once by `TIDAL_CONTRIBUTORS.prepare` (`src/model/climate/ocean/tides/tidal-schedule/contributors`): periods are clamped between 1.5× the Roche limit and half the Hill sphere, eccentricity is capped below the Roche periapsis, and moons with no stable orbit are dropped. Preparation is idempotent. The stellar mass comes from `TIDAL_CONTRIBUTORS.starMassKg`, which falls back to the default spectral class for non-main-sequence stars.

### Strait damping

Nearly enclosed seas such as the Mediterranean, the Sea of Japan and the Gulf of Mexico have small tides because a narrow strait chokes the ocean tide. `TIDAL_STRAITS.damping` (`tidal-map/straits`) scales coastal ranges after the tier assignment, before the ranges spread offshore:

1. **Width:** each open-water cell's distance to the nearest land or lake cell, in km.
2. **Bottleneck:** a widest-path search from the widest cell of each ocean landmark. A cell's bottleneck is the largest narrowest-width over all water routes from there.
3. **Basin:** each water cell climbs the width field to its local maximum, the basin's interior.
4. **Factor:** `min(1, (ratio / 0.5)²)` with `ratio = bottleneck / interior width` at that maximum, floored at 0.1. A basin whose bottleneck half-width is at least 450 km is open (factor 1). A coastal cell takes the largest factor among its open-water neighbours.

Isolated sea landmarks have no ocean connection and take the floor. Damping is skipped when the world has no landmarks.

The constants:
- **450 km half-width:** the deep-ocean semidiurnal wavelength is about √(g × 4000 m) × 12.42 h ≈ 8,900 km, and openings wider than about a tenth of that do not choke the tide.
- **0.1 floor:** typical Mediterranean spring ranges (≈ 0.3 m) against Atlantic European coasts (≈ 3 m).
- **Squared ratio:** calibrated on the Earth heightmap import at 204,000 points. Median coastal factors there are Mediterranean 0.10, Red Sea 0.14, Gulf of Mexico 0.21, Sea of Japan 0.29, and 1 on Atlantic Europe, Pacific Japan and the Bay of Fundy.

Resonance is not modelled, so resonant basins behind narrow mouths, like Hudson Bay or the Persian Gulf, come out too small.

`tidalRange` feeds the coastal marsh bonus in terrain classification (`tidalRange × 0.2`), so moons change the history start state. `pnpm report:history` records `diagnostics.terrain.marshShare` (marsh share of land regions) and `diagnostics.terrain.tidalMaxForce`.

**Limitation:** in gas-giant-moon mode the parent giant is not a tide contributor; only the sibling moons are.

## Ocean-facing provinces

A cell is open water when it is not land and not a lake landmark (`LANDMARKS.openWaterMask`, built on `LANDMARKS.isLake`). Seas count. `provinces.waterAccess` is not reused because sea-only coasts are demoted to its lake tier.

`PROVINCE_LOCATIONS.build` sets `ProvinceLocation.marine`:

- **Shore cell:** the province land cell with the most open-water neighbours; ties go to the larger `tidalRange`, then the lower index.
- **Sea cell:** the shore's open-water neighbour with the most open-water neighbours, ties to the lower index.
- `null` when no land cell touches open water, the world has no landmarks, or the province was placed by the approximate nearest-land fallback.

## Waves

The weather worker builds one extra `WEATHER_BASELINE` per ocean-facing province for its sea cell and samples it with `WEATHER_REGION.sample`. That sample never enters `WEATHER_AGGREGATION`, so province weather values are unchanged. Hourly and monthly outlooks use the value-only `LOCAL_WEATHER.sampleProvinceValues` and skip marine work.

- **Fetch:** a walk from the sea cell along the upwind great circle. Each step takes the neighbour best aligned with the circle's forward tangent and stops before land or a lake, on a non-positive alignment or on a revisited cell. It never reroutes around an obstruction. Distance is capped at 2000 km.
- **Growth:** USACE *Coastal Engineering Manual* (2002) fetch-limited growth with `C_D = 0.001 (1.1 + 0.035 U)` and `u*² = C_D U²`: `Hs = 4.13e-2 u* √(F/g)`, capped by the fully developed Pierson–Moskowitz sea `0.21 (1.06 U)² / g`. The 1.06 factor converts the 10 m wind to 19.5 m. Gravity comes from the planet radius with Earth's mean density.
- **Sea ice:** frozen when the sea cell has perennial ice, or seasonal ice with a seasonal normal temperature at or below −1.8 °C. Frozen seas report `iceCovered` and no height.
- **Sea state:** Douglas scale (WMO code 3700): calm < 0.1 m, smooth < 0.5, slight < 1.25, moderate < 2.5, rough < 4, very rough < 6, high < 9, very high < 14, phenomenal beyond.
- **Excluded:** swell from distant storms, duration-limited growth, shoaling and breaking.

## Tides

`WEATHER_MARINE.tide` runs in the display layer, next to `WEATHER_SKY.moons`. Both use the generated world's captured `params` and prepared `params.moons`, not the live editor.

- **Equilibrium tide:** `ζ = Σ C_k P2(cos ψ_k)` over the star and each moon, minus its rotational mean `Σ C_k [1.5 (sin φ sin δ)² + 0.75 (cos φ cos δ)² − 0.5]`. `C_k` is `TIDAL_FORCE.tideContribution` at `cos ψ = 1`, moons at their semi-major axis. A moon the world is tidally locked to is omitted. Declinations and hour angles come from `WEATHER_SKY.positions`, which shares the sky's circular, coplanar moon model.
- **Scaling:** `level = springRangeM (ζ − ζ̄) / (1.5 cos² φ_eff Σ C)` with `φ_eff = min(|φ|, 60°)`. Aligned bodies at a low-latitude shore give a daily range equal to the shore's `tidalRange`. Beyond 60° the range tapers with cos² φ.
- **Lag:** a per-shore uniform draw in `[0, 1)` times half the dominant contributor's transit period, so neighbouring coasts have high water at different times.
- **Sampling:** a horizon of `min(1.25 T_dom, 7 days)` with step `min(T_min / 144, horizon / 180)`, at most 4096 steps. Every sample resolves the clock afresh with `WEATHER_CLOCK.resolve`. The card shows the current level and direction, the first strict high and low after now (or "Not found within forecast"), and a spring/neap label from the first full dominant transit: spring at ≥ 80 % of the spring range, neap at ≤ 50 %.
- **No tidal cycle:** locked worlds, a zero spring range, or no tide-raising bodies.

## Limitations

Tides ignore basin resonance (strait damping only reduces ranges), amphidromic geometry, moon eccentricity and inclination, and the display uses mean circular orbits while generation samples Keplerian ones. Spring/neap thresholds are Earth-like heuristics. Waves are local wind sea only.
