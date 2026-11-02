// Added in chaos-machine (not in the vendored original; GPL-3.0 with the rest of this folder, see LICENSE).
// The planet's surface pressure in the parameters that were fitted to Earth's: ps = p / p_Earth (orbitOf), exactly 1
// on Earth, so Earth computes what the original did. The air's composition is held as in Worldbuilding Pasta 2025,
// "Climate Explorations: Pressure" (ExoPlaSim on Earth's terrain, N₂ varied, O₂ and CO₂ at Earth's partial pressures):
// the air column's mass, p / g, goes as ps; its scale height, lapse rate and water vapour column (set by the
// temperature, ρ·q_sat independent of p) stay as they are.
//
//   • Heat stored over land (TEMP_LAND_HEAT_CAP, mostly the air column's) and the air column's own (temperature.js,
//     diurnal.js): ∝ ps — the seasons and the day's range damp under thick air (ExoPlaSim: few places past 10 °C of
//     daily range at 4 bar; at 0.25 bar desert days near 70 °C).
//   • The heat the weather spreads poleward (TEMP_DIFFUSIVITY, TEMP_DIFFUSIVITY_EW): its dry part carries c_p·T in a
//     column ∝ ps, its latent part L·q in one ∝ ps·q_sat ∝ 1 (q_sat ∝ 1/p): D ∝ C·K with C ∝ (1 − LATENT_SHARE)·ps +
//     LATENT_SHARE, a contrast that sets its own transport answering as the square root (size.js). So thin air keeps
//     its water's transport, and its tropics do not run away.
//   • The greenhouse (TEMP_OLR_A): every absorber's lines broaden ∝ p (Lorentz half-width), at a fixed partial pressure
//     its optical depth ∝ ps; the heat to space falls by PRESSURE_GREENHOUSE_WM2 · (1 − ps^−SATURATION_POWER) /
//     SATURATION_POWER — PRESSURE_GREENHOUSE_WM2 per e-fold near Earth's, less as the bands saturate under thick air
//     and more as they open up under thin air.
//   • Clear air's Rayleigh scattering (rayleighReflect): optical depth ∝ ps.
//   • Surface wind speed (windScale) ∝ ps^−WIND_POWER; the air's density in the wind stress ∝ ps.
//   • The psychrometric constant γ = c_p·p / (0.622·L) ∝ ps (FAO-56 Eq. 8): the surface's net radiation goes less into
//     evaporation under thick air, Δ/(Δ + γ).

// ExoPlaSim's mean surface wind against pressure (Worldbuilding Pasta 2025): 26, 22, 23, 22, 19, 13 km/h at 0.1, 0.25,
// 0.5, 1, 2 and 10 bar — a least-squares power law in log space through Earth's 22 km/h
const WIND_POWER = 0.13;
// The latent share of the atmosphere's poleward heat transport on Earth: ≈ 0.4 of it through the midlatitudes
// (Trenberth & Caron 2001; Frierson et al. 2007, Fig. 1: about half at 40°, a third at 60°)
const LATENT_SHARE = 0.4;
// Fitted to the starlight that holds ExoPlaSim's Earth near 15 °C (Worldbuilding Pasta 2025: 1.356, 1.185, 1.069,
// 0.943, 0.912, 0.911 × Earth's at 0.1, 0.25, 0.5, 2, 4, 10 bar), Rayleigh's albedo (below), this model's own ice and
// the heat to space capped at a black body's (temperature.js) included: at that starlight 16.8, 15.1, 13.1, 15.7, 15.4,
// 14.3 °C (ExoPlaSim 15.9, 14.1, 14.1, 15.3, 14.5, 15.6; climatev2-orbit-sweep diagnostic; RMS 0.95 °C, against 1.11
// at 26 W/m² with power 0.32, 1.29 at 27 with 0.27 and 1.70 at 28 with 0.3). A plain log (SATURATION_POWER → 0) fit
// the thick side at 20 W/m² per e-fold but left 0.25 bar 15 °C too warm.
const PRESSURE_GREENHOUSE_WM2 = 26.5;
const SATURATION_POWER = 0.3;
// Clear air's broadband Rayleigh optical depth at 1 bar: the Eddington reflectance of this matches Lacis & Hansen
// 1974's 0.28 / (1 + 6.43μ) at μ = 0.5 (0.065; 550 nm alone is 0.097, the near infrared far less)
const RAYLEIGH_TAU = 0.07;
// (the psychrometric constant at Earth's surface pressure, hPa/K and kPa/K: FAO-56 Eq. 8 at 101.3 kPa)
export const PSYCHRO_HPA = 0.66;
export const PSYCHRO_KPA = 0.0665;

/** The parameters P (a stage's own copy, or the shared one) for the planet's surface pressure. */
export function pressureScaled(P, orbit) {
    const ps = orbit.pressureScale;
    if (ps === 1) return P;
    const out = { ...P };
    const spread = Math.sqrt((1 - LATENT_SHARE) * ps + LATENT_SHARE);
    out.TEMP_DIFFUSIVITY = P.TEMP_DIFFUSIVITY * spread; out.TEMP_DIFFUSIVITY_EW = P.TEMP_DIFFUSIVITY_EW * spread;
    out.TEMP_LAND_HEAT_CAP = P.TEMP_LAND_HEAT_CAP * ps;
    out.TEMP_OLR_A = P.TEMP_OLR_A - PRESSURE_GREENHOUSE_WM2 * (1 - ps ** -SATURATION_POWER) / SATURATION_POWER;
    return out;
}

/** Surface wind speed relative to Earth's at the same pressure pattern. */
export function windScale(orbit) {
    return orbit.pressureScale ** -WIND_POWER;
}

/** Clear air's Rayleigh reflectance for a sun at μ (cos zenith) under ps of Earth's air: Eddington, conservative, g = 0. */
export function rayleighReflect(mu, ps) {
    const m = Math.max(0.05, mu), t = RAYLEIGH_TAU * ps;
    return (t + (2 / 3 - m) * (1 - Math.exp(-t / m))) / (4 / 3 + t);
}
