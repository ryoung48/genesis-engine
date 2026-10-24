// Added in chaos-machine (not in the vendored original; GPL-3.0 with the rest of this folder, see LICENSE).
// The planet's size in the parameters that were fitted to Earth's: its radius a = R / R_Earth and surface gravity
// gs = g / g_Earth (orbitOf), each exactly 1 on Earth, so Earth computes what the original did. The surface pressure
// stays Earth's, so the air column's mass, p / g, goes as 1 / gs, and its heights (scale height RT/g, the boundary
// layer, the tropopause) shrink as 1 / gs while its temperatures by pressure stay as they are.
//
// The distances on the sphere follow the radius through the grid (LatLonGrid's radiusM): the sizes of storms, air
// masses, coastal zones and currents stay the same in km — the Rossby radius NH/f, with N ∝ g and H ∝ 1/g, does not
// depend on either (Vallis 2017 §5.1) — and so cover more of a small planet. The gradients, winds, β and the Hadley
// cells' Burger number gH/(Ωa)² (gH stays, the tropopause standing 1/gs as high) follow the radius on their own.
//
//   • The heat the weather spreads poleward (TEMP_DIFFUSIVITY, TEMP_DIFFUSIVITY_EW, unit-sphere diffusivities, C·K/a²):
//     ∝ 1 / √(gs·a). The air column's heat capacity C ∝ 1/gs; the storms mix across the width of the baroclinic zone,
//     L ∝ a, at the rate their shear grows, K ∝ L²·(g/NT)·∂T/∂y with ∂T/∂y = ΔT/a (Stone 1972) — so D ∝ ΔT/(gs·a),
//     and a contrast that sets its own transport answers as the square root of that: in a two-mode balance
//     ΔT·(B + 6D) ≈ the sunlight's contrast, the transport outweighing B as on Earth (6D ≈ 3.9, B ≈ 2.1),
//     ΔT ∝ (gs·a)^½ and D ∝ (gs·a)^−½. Against ExoPlaSim on Earth's terrain (Worldbuilding Pasta 2026, "Climate
//     Explorations: Planet Size"), at its own starlight: 0.5 M⊕ ≈ 35 °C equator to pole (≈ 31 there: tropics 5–8 °C
//     cooler, poles > 10 °C warmer than Earth's 48), 0.1 M⊕ ≈ 14 (under 30 there). Mixing over a fixed Rossby radius
//     instead (D ∝ (gs·a³)^−½) evened 0.1 M⊕ to 8 °C and swung its rain belt 100° with the seasons, where ExoPlaSim's
//     hardly moves; a constant K (D ∝ 1/(gs·a²)) to 4 °C.
//   • Heat stored over land (TEMP_LAND_HEAT_CAP, mostly the air column's — temperature.js's AIR_COLUMN_HEAT_CAP): ∝ 1/gs.
//   • Rates per km of height (TEMP_PLATEAU_LAPSE, TEMP_ICE_LAPSE, RAIN_LEE_PER_KM, RAIN_RISE_PER_KM) ∝ gs, heights
//     (TEMP_BLOCK_KM, RAIN_VAPOUR_HEIGHT_KM, RAIN_TERRAIN_HEIGHT_KM) ∝ 1/gs — the lapse rate g/c_p and the scale height.
//   • The greenhouse (TEMP_OLR_A): every absorber's column ∝ 1/gs at the same mixing ratio, the heat to space lowered
//     by COLUMN_GREENHOUSE_WM2 per e-fold of it.
//   • The ocean's seasonal reach (OCEAN_SEASON_FULL_DEG, OCEAN_SEASON_ZERO_DEG): a long Rossby wave, c = β·L_d² with
//     β ∝ 1/a and L_d² ∝ g′ ∝ gs (OCEAN_GPRIME ∝ gs), crosses a basin a wide in a time ∝ a²/gs.
//   • The Ferrel cells' width (CIRC_FERREL_DEG): the Rhines scale √(U/β) ∝ √a in km, ∝ a^−½ in degrees.
// (Ice sheets keep Earth's dome height, TEMP_ICE_DOME_KM.)

import { waveLatitude } from './rotation.js';

// W/m² per e-fold of the absorbers' column: the water vapour's ≈ 1.8 W/m²/K over Clausius–Clapeyron's ≈ 7 %/K
// (Held & Soden 2000) ≈ 26, plus CO₂'s 5.35 (Myhre et al. 1998). In ExoPlaSim the starlight that holds an Earth-like
// world near 15 °C from 0.1 to 10 M⊕ goes as 1 + 0.117·ln gs, ≈ 28 W/m² per e-fold (Worldbuilding Pasta 2026).
const COLUMN_GREENHOUSE_WM2 = 31;

/** The parameters P (a stage's own copy, or the shared one) for the planet's size. */
export function sizeScaled(P, orbit) {
    const a = orbit.radiusScale, gs = orbit.gravityScale;
    if (a === 1 && gs === 1) return P;
    const out = { ...P };
    const spread = 1 / Math.sqrt(gs * a);
    out.TEMP_DIFFUSIVITY = P.TEMP_DIFFUSIVITY * spread; out.TEMP_DIFFUSIVITY_EW = P.TEMP_DIFFUSIVITY_EW * spread;
    out.TEMP_LAND_HEAT_CAP = P.TEMP_LAND_HEAT_CAP / gs;
    for (const key of ['TEMP_PLATEAU_LAPSE', 'TEMP_ICE_LAPSE', 'RAIN_LEE_PER_KM', 'RAIN_RISE_PER_KM', 'OCEAN_GPRIME']) out[key] = P[key] * gs;
    for (const key of ['TEMP_BLOCK_KM', 'RAIN_VAPOUR_HEIGHT_KM', 'RAIN_TERRAIN_HEIGHT_KM']) out[key] = P[key] / gs;
    out.TEMP_OLR_A = P.TEMP_OLR_A + COLUMN_GREENHOUSE_WM2 * Math.log(gs);
    out.OCEAN_SEASON_FULL_DEG = waveLatitude(P.OCEAN_SEASON_FULL_DEG, a * a / gs);
    out.OCEAN_SEASON_ZERO_DEG = waveLatitude(P.OCEAN_SEASON_ZERO_DEG, a * a / gs);
    out.CIRC_FERREL_DEG = P.CIRC_FERREL_DEG / Math.sqrt(a);
    return out;
}
