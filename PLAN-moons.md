# Plan: Moon System & Physical Tidal Model

## Context
Replace the blunt `tidalStrength` scalar slider with a physical moon system (0–3 moons per planet). Each moon has mass, diameter, orbital period, eccentricity, and inclination. The tidal model uses equilibrium tide potential (Legendre P2) per body, summed per surface point and time, then modulated by a coastal amplification layer. This produces a tidal calendar (spring/neap beating patterns from multiple moons) and a geographic spring-tide map. The old `computeTidalRange` is abandoned.

---

## 1. Data Model — `MoonParams`

**New file: `src/model/shared/moon-types.ts`**

```typescript
export interface MoonParams {
  massKg: number               // moon mass
  diameterKm: number           // moon diameter (apparent size / eclipses later)
  orbitalPeriodDays: number    // sidereal period in planet-days
  eccentricity: number         // 0–0.9; periapsis must exceed Roche limit
  inclinationDeg: number       // vs equatorial plane, 0–90°
}

export const MAX_MOONS = 3
export const MOON_DEFAULTS: MoonParams = {   // Earth's Moon
  massKg: 7.34e22,
  diameterKm: 3474,
  orbitalPeriodDays: 27.3,
  eccentricity: 0.055,
  inclinationDeg: 5.1,
}
```

---

## 2. Planet & Star Mass Derivation

**New file: `src/model/shared/orbital-mechanics.ts`**

```typescript
const EARTH_DENSITY_KG_M3 = 5515

// Planet mass derived from radius assuming Earth-like bulk density (all generated worlds
// are rocky). Mass scales as R³, so a 2× radius planet has 8× the mass.
export function derivePlanetMassKg(radiusKm: number): number
// = EARTH_DENSITY × (4/3)π × R³

// Orbital semi-major axis from Kepler III: a = (G × M_planet × T² / 4π²)^(1/3)
// T in seconds = orbitalPeriodDays × hoursPerDay × 3600
export function moonSemiMajorAxisM(
  moon: MoonParams,
  planetMassKg: number,
  hoursPerDay: number,
): number
```

---

## 3. Orbital Validity Bounds

**Same file `orbital-mechanics.ts`**, computed for each moon before tidal work:

### Hill Sphere
Maximum distance at which the planet retains a satellite against stellar perturbation:
```typescript
// r_Hill = a_planet × (M_planet / (3 × M_star))^(1/3)
// Stable orbits require: a_moon < 0.5 × r_Hill
export function hillSphereM(
  planetOrbitalDistanceM: number,
  planetMassKg: number,
  starMassKg: number,      // getStarMassSol(cls, subtype) × M_SOL_KG
): number
```

### Roche Limit
Minimum distance before tidal forces disrupt the moon:
```typescript
// d_Roche = R_planet × (2 × ρ_planet / ρ_moon)^(1/3)
// ρ_moon derived from massKg and (4/3)π × (diameterKm/2)³
export function rocheLimitM(
  planetRadiusM: number,
  planetDensityKgM3: number,    // = EARTH_DENSITY_KG_M3
  moonMassKg: number,
  moonDiameterM: number,
): number
```

### Valid Eccentricity
Periapsis `r_peri = a × (1 - e)` must exceed the Roche limit:
```
e_max = 1 - r_Roche / a
```

### Valid Inclination
0°–90° is physically valid. Inclinations >39° risk Kozai–Lidov oscillations on geological timescales, but for per-generation simulation the full range is allowed without hard clamping.

### Validation at generation time
Derive valid period bounds (min = Roche-limit period, max = 0.5 × Hill-sphere period) via Kepler III. Clamp `orbitalPeriodDays` silently. Clamp `eccentricity` to `e_max`. Set `TidalSchedule.moonsClamped = true` if any value was adjusted.

---

## 4. Equilibrium Tidal Potential — per surface point and time

**New file: `src/model/climate/tidal-force.ts`**

### Tide from one body at a surface point
```typescript
// tideAtPoint_i = C_i × P2(cos ψ_i)
// C_i = (bodyMass / planetMass) × (planetRadius⁴ / bodyDistance³)
// P2(x) = (3x² - 1) / 2
// cos ψ = sin(lat)×sin(bodyLat) + cos(lat)×cos(bodyLat)×cos(bodyLon - lon)
//
// ψ = 0° (directly overhead) → high tide
// ψ = 90° (on horizon)       → low tide
// ψ = 180° (underfoot)       → high tide (second tidal bulge)
```

### Moon position at time t
```typescript
// Returns sub-moon latitude/longitude and current distance from planet centre
function moonSubpointLatLon(
  moon: MoonParams,
  semiMajorAxisM: number,
  t: number,               // planet-days from epoch
  planetRotationRad: number,  // = 2π × t
): { latRad: number; lonRad: number; distanceM: number }
```

- True anomaly ν from eccentric anomaly via Newton–Raphson on Kepler's equation (`M = E - e sin E`)
- Distance at ν: `r = a(1 - e²) / (1 + e cos ν)`
- Inclination rotates the orbital plane; sub-moon latitude oscillates with amplitude = `inclinationDeg`
- Eccentric moons: stronger tides at periapsis (closer), weaker at apoapsis — automatic from `r`

### Solar tide
```typescript
// Planet's true anomaly from its own orbital eccentricity + perihelion param
function starSubpointLatLon(
  orbitalDistanceAU: number,
  planetEccentricity: number,
  perihelionLon: number,       // GenesisParams.perihelion
  t: number,
  daysPerYear: number,
): { latRad: number; lonRad: number; distanceM: number }

function starTideAtPoint(
  starMassSol: number,
  starDistanceM: number,
  planetMassKg: number,
  planetRadiusM: number,
  cosPsi: number,
): number
```

---

## 5. Tidal Calendar — `computeTidalSchedule()`

**New file: `src/model/climate/tidal-schedule.ts`**

```typescript
export interface TidalEvent {
  dayOfYear: number
  totalForce: number    // normalized: 1.0 = Earth spring tide (Moon + Sun aligned)
}

export interface TidalSchedule {
  events: TidalEvent[]    // one entry per planet-day
  maxForce: number        // peak spring tide force (scales the geographic map)
  minForce: number        // minimum neap force
  moonsClamped: boolean   // true if any moon's orbital params were out of bounds
}

export function computeTidalSchedule(
  moons: MoonParams[],
  params: Pick<GenesisParams,
    | "daysPerYear" | "hoursPerDay" | "planetRadiusKm" | "tidallyLocked"
    | "spectralClass" | "starSubtype" | "orbitalDistanceAU"
    | "eccentricity" | "perihelion">,
): TidalSchedule
```

**Algorithm:**
For each planet-day `t` in `[0, daysPerYear)`:
1. Sample at a canonical open-ocean test point (equator, 0° lon)
2. `rawForce = Σ tideAtPoint(moon_i, 0, 0, t) + starTideAtPoint(0, 0, t)`
3. Normalize by Earth reference: `(Moon-alone tide at canonical point with Earth params)`
4. Multi-moon beat pattern and eccentricity variations emerge automatically

`tidallyLocked` → return zeroed schedule immediately.

Using a single canonical point for the schedule is sufficient because we only need *relative* force over time; absolute geographic variation is handled separately in the tidal map.

---

## 6. Geographic Tidal Map — `computeSpringTideMap()`

**New file: `src/model/climate/tidal-map.ts`** (replaces deleted `computeTidalRange`)

```typescript
export function computeSpringTideMap(
  mesh: SphereMesh,
  isLand: Uint8Array,
  isCoastal: Uint8Array,
  schedule: TidalSchedule,
  params: Pick<GenesisParams, "seed">,
): Float32Array   // per-region spring tidal range in metres
```

**Two-layer model:**

**Layer 1 — Astronomical baseline**
- Scale = `schedule.maxForce`
- Open-ocean equilibrium tidal range at Earth spring tide ≈ 0.25 m
- So: `astronomicalRange = 0.25 × maxForce` (metres, before local effects)

**Layer 2 — Local ocean response (coastal geometry amplification)**
Preserve the existing enclosure-based piecewise amplifier from old `computeTidalRange`:
```
enclosure → amplification:
  0.00 → 1×    (open headland)
  0.50 → 2×    (straight coast)
  0.67 → 3×    (recessed bay)
  0.83 → 6×    (small bay)
  0.92 → 96×   (funnel inlet, e.g. Bay of Fundy)
```
Plus Dijkstra ocean propagation with 400 km e-folding decay (unchanged from old code).

**Final per-region result:**
```
observedTide(r) = 0.25 × maxForce × localAmplification(enclosure_r)
```

---

## 7. `GenesisParams` changes

**`src/model/types/tectonics.ts`**

Remove:
```typescript
tidalStrength?: number
```
Add:
```typescript
moons?: MoonParams[]   // 0–3 entries; undefined treated as []
```

---

## 8. Pipeline integration

**`src/model/pipelines/post-elevation.ts`**
```typescript
const tidalSchedule = computeTidalSchedule(params.moons ?? [], params)
const tidalRange = computeSpringTideMap(mesh, isLand, isCoastal, tidalSchedule, params)
```
Both are passed through to output.

**`src/model/transport/worker-types.ts`**
- Replace `tidalStrength` in request params with `moons?: MoonParams[]`
- Add `tidalSchedule?: TidalSchedule` to `SerializedGenesisWorld`

---

## 9. Cleanup

| File | Change |
|------|--------|
| `src/model/shared/slider-ranges.ts` | Remove `tidalStrength` entry |
| `src/ui/planet/screen/generation/sliders.ts` | Remove Tides `SliderDef` |
| `src/ui/planet/screen/generation/defaults.ts` | Replace `tidalStrength: 1.0` with `moons: [MOON_DEFAULTS]` |
| `src/ui/planet/screen/generation/generation.ts` | Swap `tidalStrength` → `moons` in params merge |
| `src/ui/hooks/useLockedClimatePreview.ts` | Remove `tidalStrength` refs |
| `src/ui/hooks/useEbmPreview.ts` | Remove `tidalStrength` refs |
| `src/model/climate/tides.ts` | Delete (replaced by tidal-force + tidal-schedule + tidal-map) |

---

## 10. UI — GenerationPanel (minimum scope for this PR)

**`src/ui/planet/controls/GenerationPanel.tsx`**

Replace the Tides slider row with a **Moon Count stepper** on the Planet tab:

```
Moons   [ − ]  1  [ + ]
        ●
```

- `−` / `+` buttons clamp moon count to `[0, MAX_MOONS]`
- Adding a moon appends `MOON_DEFAULTS`; removing drops the last entry
- One filled circle (●) displayed per moon as a visual indicator
- Tooltip: "Number of natural satellites. Each moon's mass and orbital period determine tidal forces, spring/neap beating cycles, and future eclipse and phase data."
- When `tidallyLocked`: stepper remains visible with a note "(tides suppressed — tidally locked)"

Per-moon attribute controls (mass, diameter, period, eccentricity, inclination) are **future work**.

---

## 11. Planet stats display

**`src/ui/planet/screen/display/planet-stats.ts`**

Replace "Tidal Strength" row with:
- "Moons: N"
- "Spring Tide: X.Xx× Earth" (from `schedule.maxForce`)
- "Spring Tide Interval: ~N days" (average gap between spring-tide peaks in `events`)

---

## Future work (not in this PR)
- Per-moon attribute sliders (mass, diameter, orbital period, eccentricity, inclination) with ranges derived from Roche/Hill bounds
- Tidal calendar chart (force vs day-of-year line chart in planet info panel)
- Moon phase simulation and phase icon calendar
- Apparent diameter overlay
- Eclipse event geometry (new/full moon + alignment check)
- Procedural moon names

---

## Verification
1. `pnpm test` — update existing tidal tests to new interfaces; fix pipeline/climate tests
2. Run app → Planet tab → confirm Tides slider gone, Moon stepper visible
3. Moons = 0 → tidal map all-zero, stats show "0 moons"
4. Moons = 1 (default `MOON_DEFAULTS`) → spring tide output approximately matches prior Earth regime
5. Moons = 3 → amplified spring tide range, schedule shows complex beating pattern
6. Tidal lock enabled → moons still displayed, tidal range zeroed
7. Very small planet or distant orbit → `moonsClamped = true`, orbital period auto-adjusted
