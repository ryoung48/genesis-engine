// Added in chaos-machine (not in the vendored original; GPL-3.0 with the rest of this folder, see LICENSE).
// The planet's rotation in the parameters that were fitted to Earth's: each scale below is relative to Earth's
// rotation (r = Ω / Ω_Earth) and is exactly 1 on Earth, so Earth computes what the original did.
//
//   • Storm and air-mass sizes (the Rossby scale, CIRC_ROSSBY_KM, TEMP_LOCAL_KM, RAIN_EDDY_LENGTH_KM,
//     RAIN_STABLE_REF_KM): ∝ 1/r — the Rossby radius NH/f (Vallis 2017 §5.1); the baroclinic eddies' length scales
//     inversely with the rotation rate in GCMs (Kaspi & Showman 2015 §3.1). Kept within MIN_KM … MAX_KM.
//   • Equatorial sizes (RAIN_TROPICAL_KM, OCEAN_EQ_DEG, OCEAN_EKMAN_TAUY_DEG): ∝ r^−½ — the equatorial
//     deformation radius √(c/β) (Gill 1982 §11.4).
//   • The heat the weather spreads poleward (TEMP_DIFFUSIVITY, TEMP_DIFFUSIVITY_EW): ∝ 1/r on faster planets (the
//     eddies shrink, above; in Kaspi & Showman's GCM the equator-to-pole contrast grows strongly above Earth's
//     rotation, §3.1, Fig. 8a); on slower ones ∝ the Hadley cells' width (r^−½, below), as their overturning takes
//     over the transport (below ≈ 0.2 Ω_Earth, Kaspi & Showman §3.1) — the contrast then falls with a longer day, as in
//     Guendelman & Kaspi 2019 §3.1.1 (this model has no Hadley transport of its own, only the diffusion).
//   • The ocean's seasonal reach (OCEAN_SEASON_FULL_DEG, OCEAN_SEASON_ZERO_DEG): the latitudes where a long Rossby
//     wave, c = β·L_d² ∝ cos φ / (Ω sin² φ) (Gill 1982 §12.4), crosses a basin in the same share of a season as at
//     Earth's — a longer year gives the waves longer.
//   • The Ferrel cells' width (CIRC_FERREL_DEG): ∝ r^−½ — the Rhines scale √(U/β) (Rhines 1975) sets the jets'
//     spacing; faster planets have more jets (Kaspi & Showman 2015 §3.1).
// (The Hadley cells themselves follow the rotation through their own theory, circulation.js: their edge goes as
// r^−½ for small cells, HADLEY_POWER here.)

import { EARTH_ROTATION } from './insolation.js';

const MIN_KM = 100;                 // one 1° grid step: nothing smaller is resolved
const MAX_KM = 5000;                // a quarter of the way round an Earth-sized planet: the planet's own scale
const MAX_EQ_DEG = 30;              // the equatorial band stays tropical
const HADLEY_POWER = 0.5;           // the Hadley edge ∝ Bu^¼ ∝ r^−½ (Hill et al. 2022 Eq. 16)
const FERREL_POWER = 0.5;

/** Ω / Ω_Earth. */
export function spinRatio(orbit) {
    return orbit.rotation / EARTH_ROTATION;
}

const clampKm = (km) => Math.min(MAX_KM, Math.max(MIN_KM, km));

/** The latitude (°) where cos φ / sin² φ is k times its value at lat0 (°). */
export function waveLatitude(lat0, k) {
    const at = (lat) => { const s = Math.sin(lat * Math.PI / 180); return Math.cos(lat * Math.PI / 180) / (s * s); };
    const target = at(lat0) * k;
    let lo = 0.5, hi = 89.5;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (at(mid) > target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
}

/** The parameters P (a stage's own copy) for the planet's rotation. */
export function spinScaled(P, orbit) {
    const r = spinRatio(orbit), season = orbit.yearScale ?? 1;
    if (r === 1 && season === 1) return P;
    const out = { ...P };
    for (const key of ['CIRC_ROSSBY_KM', 'TEMP_LOCAL_KM', 'RAIN_EDDY_LENGTH_KM', 'RAIN_STABLE_REF_KM']) out[key] = clampKm(P[key] / r);
    out.RAIN_TROPICAL_KM = clampKm(P.RAIN_TROPICAL_KM / Math.sqrt(r));
    out.OCEAN_EQ_DEG = Math.min(MAX_EQ_DEG, P.OCEAN_EQ_DEG / Math.sqrt(r));
    out.OCEAN_EKMAN_TAUY_DEG = Math.min(MAX_EQ_DEG, P.OCEAN_EKMAN_TAUY_DEG / Math.sqrt(r));
    const spread = r > 1 ? 1 / r : r ** -HADLEY_POWER;
    out.TEMP_DIFFUSIVITY = P.TEMP_DIFFUSIVITY * spread; out.TEMP_DIFFUSIVITY_EW = P.TEMP_DIFFUSIVITY_EW * spread;
    out.OCEAN_SEASON_FULL_DEG = waveLatitude(P.OCEAN_SEASON_FULL_DEG, r / season);
    out.OCEAN_SEASON_ZERO_DEG = waveLatitude(P.OCEAN_SEASON_ZERO_DEG, r / season);
    out.CIRC_FERREL_DEG = P.CIRC_FERREL_DEG / r ** FERREL_POWER;
    return out;
}
