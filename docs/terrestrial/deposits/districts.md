# Deposit districts

Part of the [deposits overview](overview.md). Code: `src/model/geography/terrain/deposits/districts`.

A district is a field of deposits that share one noise shape, so ore comes in clusters aligned to lineaments instead of scattered per region. `DISTRICTS.create({ seed, systems, gridDeg, radiusKm })` builds, per system, a cascade of noise with grain, lineaments and warp, coupled to associated systems.

## Thresholds

Each system has two calibrated thresholds, `t0` at quantile `1 − 1.35 · share` and `t1` at `1 − 0.75 · share`, so the district footprint (`at > 0`) covers about 1.35 times its `share` (capped at 0.97). They are stored in `districts/thresholds.ts` under a key built from the systems and the calibration radius (`thresholdKey({ systems, radiusKm })`, currently 6371 km).

Regenerate with:

```powershell
node scripts/deposits/calibrate-districts.mjs
```

It takes about 0.5 s. A world whose planet radius differs from 6371 km is not recalibrated per world; the shape is used with its own radius but the 6371 km thresholds.

## Spacing

Spot frequencies are `R / 260` and `R / 500` (R in km), after district spacing in Carlson 1991. The grid used for the district cells comes from the mesh edge length rule (`gridDeg`).
