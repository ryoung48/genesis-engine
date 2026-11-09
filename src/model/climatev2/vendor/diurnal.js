// Added in chaos-machine (not in the vendored original; GPL-3.0 with the rest of this folder, see LICENSE).
// The day's cycle, solved on the energy-balance grid like the year's: each harmonic n of the day (ω = 2π / the solar
// day) is one steady complex problem. Three layers per cell:
//
//   ground (skin, per tile):         S_n = (λ_rad + λ_lat + G_n) T_s + h (T_s − T_a)
//   the air by the ground (per tile): i n ω C_bl T_a = h (T_s − T_a) − k (T_a − T_f)
//   the free air above (one field):   (i n ω C_col + B) T_f − ∇·(D ∇T_f) + γ u·∇T_f = Σ_tiles share · k (T_a − T_f)
//
// The tiles are the cell's land, open sea and sea ice. S_n: the n-th harmonic of the day's sunlight at the surface
// (the truncated cosine of a day's sun, local noon at each longitude, through the clear sky and the clouds — Kasten &
// Czeplak 1980); G_n: the ground's uptake — a semi-infinite soil of thermal inertia I takes I·√(i n ω) (Carslaw &
// Jaeger 1959; Oke 1987 §2.2), the sea a mixed slab i n ω ρc d; h, λ_lat: the turbulent exchange of sensible and latent
// heat (bulk formulas, Garratt 1992); λ_rad: the ground's emission; k: the boundary layer's exchange with the air above;
// B: the planet's heat to space per degree (the energy balance's own TEMP_OLR_B); C_col: the air column's heat
// capacity. The free air's spread D is the energy balance's own plus the gravity waves' evening-out of a day-to-night
// contrast within the Rossby radius (the weak-temperature-gradient limit, Pierrehumbert 2010 §9; Koll & Abbot 2016):
// on Earth the free air barely feels the day (i ω C_col ≫ the rest) and this is the point model of the boundary layer;
// on a slow planet the whole column follows the sun and the air carries the day's heat to the night side.
//
// Out of it: each month's daily range (maximum − minimum of T_a, with the weather's own swing within a day, WEATHER_*_C,
// added in quadrature); how much further a day's sun heats the land than an Earth day's would (for the rain stage's
// convection); and the extra heat the ground radiates for its swing beyond an Earth day's — ⟨σT⁴⟩ over the day exceeds
// σ⟨T⟩⁴ by 6σT²⟨T′²⟩ — which the next round's energy balance takes off its forcing. Earth's own day is already in
// the energy balance's fit, so only the departure from it counts (none on Earth).
//
// The day's warmth of the air by the ground lowers the surface pressure where the sun is (dayWinds): the winds blow from the night side
// toward the afternoon and swing with the day. Over a day they average out, but their speed does not — the exchange
// of heat and water with the ground (next round), the rain stage's evaporation and the ocean's wind stress feel
// ⟨u′²⟩ on top of the monthly winds and their gusts (on Earth's day none: Earth's sea breezes are in those fits).

import { HelmholtzSolver } from './solver.js';
import { LatLonGrid, coarsenField, refineField } from './grid.js';
import { WET_MONTH_MM } from './temperature.js';
import { sunAt, EARTH_ROTATION } from './insolation.js';

const SIGMA = 5.670e-8;
const EARTH_SOLAR_DAY_S = 86400;
const HARMONICS = 4;
const TILE_FIELDS = 8;              // tileSurface's fields
const SOLVED = 2;                   // harmonics with the free air solved; higher ones stay local (n ω C_col ≫ everything else)
const SAMPLES = 24;                 // points through the day for the maximum and minimum
const FIELD_GRID_DEG = 3;           // °, the free air's grid (as the circulation's and the rain's)
const FIELD_TOL = 1e-3;             // the free air's solve: residual …
const FIELD_CYCLES = 30;            // … and at most this many multigrid cycles
const AIR_COLUMN_HEAT_CAP = 1.0e7;  // J/m²/K (temperature.js)
export const DAY_TIMES = [0.5, 2.5, 4.5, 6.5, 8.5, 10.5];   // months: the times of year the day's cycle is solved at

// (tuned: the climatev2-tune diagnostic's DTR objective, PASTA exact match with the observed temperature and rain and
// the model's day range on the imported Earth, 87.6 → 89.5 %; land DTR error 2.64 → 2.26 °C)
export const DIURNAL_PARAMS = {
    CLEAR_SKY: 0.693,       // –          sunlight reaching the ground through a clear sky (Wild et al. 2013: 247 of 340 W/m², global clear-sky; tuned)
    CLOUD_DIM: 0.75,        // –          … under full cloud: × (1 − CLOUD_DIM · cloud^CLOUD_POWER) (Kasten & Czeplak 1980)
    CLOUD_POWER: 3.4,       // –
    ALBEDO_LAND: 0.213,     // –          bare and vegetated ground, 0.15–0.25 (Oke 1987 Table 1.1; tuned)
    ALBEDO_SNOW: 0.6,       // –          old snow 0.4–0.7 (Oke 1987 Table 1.1)
    ALBEDO_SEA: 0.06,       // –          (Oke 1987 Table 1.1)
    EMISSIVITY: 0.95,       // –          (Oke 1987 Table 1.1: soils 0.90–0.98)
    EXCHANGE: 0.005,        // –          bulk transfer coefficient for heat, neutral, 10 m over z₀ ≈ 0.03 m: (κ / ln(10/z₀))² (Garratt 1992 §3; tuned)
    GUST_MS: 1,             // m/s        the wind's floor in the exchange: convective gustiness (Beljaars 1995)
    INERTIA_DRY: 620,       // J m⁻² K⁻¹ s^-½   dry soil (Oke 1987 Table 2.1: dry sandy 620, dry clay 600)
    INERTIA_WET: 2000,      // J m⁻² K⁻¹ s^-½   wet soil (Oke 1987 Table 2.1: saturated sandy 2550, clay 1590)
    INERTIA_SNOW: 130,      // J m⁻² K⁻¹ s^-½   fresh snow (Oke 1987 Table 2.1)
    SEA_LAYER_M: 5,         // m          the sea's daily warm layer, 1–10 m (Kawai & Wada 2007)
    AIR_LAYER_M: 200,       // m          the depth of air the day's heat is mixed through: 1–2 km by afternoon, ~200 m at night (Stull 1988 §1.6);
                            //            the screen-level range follows the shallow night layer most (fitted within that range: 150–300 m, the
                            //            climatev2-diurnal-compare diagnostic)
    AIR_LOSS: 3,            // W/m²/K     the boundary layer's exchange with the air above: its emission (emissivity ≈ 0.3) up and down, 2 · 0.3 · 4σT³
    WAVE_SPEED_MS: 50,      // m/s        the first baroclinic gravity wave, which evens out the free air's temperature (Gill 1982 §11; ≈ 50 m/s dry)
    WEATHER_LAND_C: 6.5,    // °C         the weather's own swing within a day over land (air masses, fronts, clear-night cooling) …
    WEATHER_SEA_C: 2,       // °C         … and over the open sea: fitted to the ranges without sun, the polar night's (WorldClim 6–9 °C over land,
                            //            NCEP 1–2 °C over the open sea) and to the ranges on the whole (climatev2-diurnal-compare diagnostic)
};

// The literature ranges of the parameters a tune may move (tuning: the climatev2-tune diagnostic's DTR objective)
export const DIURNAL_PRIORS = {
    CLEAR_SKY: { value: 0.73, min: 0.65, max: 0.8, source: 'clear-sky surface transmission ≈ 0.70–0.78 of the top of the air (Wild et al. 2013; drier, cleaner air higher)' },
    CLOUD_DIM: { value: 0.75, min: 0.6, max: 0.85, source: 'Kasten & Czeplak 1980: 0.75 under full cloud; overcast transmission 0.15–0.4 by cloud type' },
    ALBEDO_LAND: { value: 0.2, min: 0.15, max: 0.25, source: 'bare and vegetated ground 0.15–0.25 (Oke 1987 Table 1.1)' },
    EXCHANGE: { value: 0.0075, min: 0.0035, max: 0.015, source: 'neutral C_H = (κ / ln(10 m / z₀))² for z₀ = 0.01–0.4 m, short grass to scrub (Garratt 1992 §3, Table A5)' },
    GUST_MS: { value: 1, min: 0.5, max: 2, source: 'convective gustiness ≈ 1–1.25 × the convective velocity scale, ≈ 0.5–2 m/s (Beljaars 1995)' },
    INERTIA_DRY: { value: 620, min: 400, max: 800, source: 'dry soils: sandy 620, clay 600, with organic and gravel soils either side (Oke 1987 Table 2.1)' },
    INERTIA_WET: { value: 2000, min: 1500, max: 2600, source: 'saturated soils: clay 1590, sandy 2550 (Oke 1987 Table 2.1)' },
    AIR_LAYER_M: { value: 200, min: 150, max: 300, source: 'the shallow night mixed layer ≈ 100–300 m, which the screen-level range follows most (Stull 1988 §1.6)' },
    AIR_LOSS: { value: 3, min: 2.2, max: 4.3, source: 'the boundary-layer longwave exchange with the air above, 2 · ε · 4σT³ for an effective emissivity 0.2–0.4' },
    WEATHER_LAND_C: { value: 5, min: 3, max: 7, source: 'the day range without sun over land: WorldClim polar-night ranges 6–9 °C, added in quadrature with the sunlit range' },
};

const LAND = 0, WATER = 1, ICE = 2;
const snowShare = (T) => { const x = Math.min(1, Math.max(0, (1 - T) / 4)); return x * x * (3 - 2 * x); };
const qsatSlope = (T) => { const es = 610.94 * Math.exp(17.625 * T / (T + 243.04)); return 0.622 / 101325 * es * 17.625 * 243.04 / ((T + 243.04) ** 2); };

// cos(nθ), sin(nθ) at the day's samples
const COS = new Float64Array(SAMPLES * HARMONICS), SIN = new Float64Array(SAMPLES * HARMONICS);
for (let k = 0; k < SAMPLES; k++) for (let n = 1; n <= HARMONICS; n++) {
    COS[k * HARMONICS + n - 1] = Math.cos(n * 2 * Math.PI * k / SAMPLES); SIN[k * HARMONICS + n - 1] = Math.sin(n * 2 * Math.PI * k / SAMPLES);
}

function sunHarmonics(phi, delta, s0, out) {
    const A = Math.sin(phi) * Math.sin(delta), B = Math.cos(phi) * Math.cos(delta), x = -Math.tan(phi) * Math.tan(delta);
    const h0 = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x);
    for (let n = 1; n <= HARMONICS; n++) {
        const cosPart = n === 1 ? (h0 + Math.sin(2 * h0) / 2) / 2 : (Math.sin((n - 1) * h0) / (n - 1) + Math.sin((n + 1) * h0) / (n + 1)) / 2;
        out[n - 1] = 2 * s0 / Math.PI * (A * Math.sin(n * h0) / n + B * cosPart);
    }
    return out;
}

function tileSurface({ kind, T, rainMm, windMs, p, ps, out, cloud }) {
    const wet = kind === WATER ? 1 : rainMm === null ? 0.5 : 1 - Math.exp(-Math.max(0, rainMm) / WET_MONTH_MM);
    const snow = kind === WATER ? 0 : kind === ICE ? 1 : snowShare(T);
    const albedo = kind === WATER ? p.ALBEDO_SEA : (1 - snow) * p.ALBEDO_LAND + snow * p.ALBEDO_SNOW;
    const Tk = T + 273.15, U = Math.sqrt(windMs * windMs + p.GUST_MS * p.GUST_MS), cond = 1.2 * ps * p.EXCHANGE * U;   // ρ C_H U (ρ ∝ the pressure)
    out.sun = p.CLEAR_SKY * (1 - p.CLOUD_DIM * cloud ** p.CLOUD_POWER) * (1 - albedo);
    out.lamRad = 4 * p.EMISSIVITY * SIGMA * Tk * Tk * Tk;
    out.h = 1005 * cond;
    out.lamLat = 2.5e6 * cond * wet * qsatSlope(Math.max(-40, Math.min(45, T))) / ps;   // (q_sat ∝ 1 / p)
    out.inertia = kind === WATER ? 0 : (1 - snow) * (p.INERTIA_DRY + (p.INERTIA_WET - p.INERTIA_DRY) * wet) + snow * p.INERTIA_SNOW;
    out.slab = kind === WATER ? 1025 * 3990 * p.SEA_LAYER_M : 0;
    out.weather = kind === WATER ? p.WEATHER_SEA_C : p.WEATHER_LAND_C;
    out.Tk = Tk;
    return out;
}

function tileResponse(s, w, p, ps, out) {
    const sq = Math.sqrt(w / 2), cBl = 1.2 * ps * 1005 * p.AIR_LAYER_M, k = p.AIR_LOSS;
    const gRe = s.lamRad + s.lamLat + s.h + s.inertia * sq, gIm = s.inertia * sq + w * s.slab;      // Z_g
    const gD = gRe * gRe + gIm * gIm, igRe = gRe / gD, igIm = -gIm / gD;                            // 1 / Z_g
    const aRe = s.h + k - s.h * s.h * igRe, aIm = w * cBl - s.h * s.h * igIm;                        // Z_a
    const aD = aRe * aRe + aIm * aIm;
    out.igRe = igRe; out.igIm = igIm; out.iaRe = aRe / aD; out.iaIm = -aIm / aD;
    return out;
}

const surf = [{}, {}, {}], resp = [{}, {}, {}], respE = [{}, {}, {}];
const taRe = new Float64Array(3 * HARMONICS), taIm = new Float64Array(3 * HARMONICS);
const earthRe = new Float64Array(HARMONICS), earthIm = new Float64Array(HARMONICS);

function sunRange(re, im, o) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < SAMPLES; k++) {
        let v = 0;
        for (let n = 0; n < HARMONICS; n++) v += re[o + n] * COS[k * HARMONICS + n] - im[o + n] * SIN[k * HARMONICS + n];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }
    return hi - lo;
}

export function dayCycle({ g, P, orbit, landFrac, gamma, airAt, windAt, rainAt, cloudAt, iceAt, wind2Prev = null, params = DIURNAL_PARAMS }) {
    const { w, h } = g, G = g.size, p = params, earthDay = orbit.solarDayScale === 1, R_PLANET = g.radiusM, airCap = AIR_COLUMN_HEAT_CAP * orbit.pressureScale / orbit.gravityScale;
    const omega = 2 * Math.PI / (EARTH_SOLAR_DAY_S * orbit.solarDayScale), omegaE = 2 * Math.PI / EARTH_SOLAR_DAY_S;
    // the free air's spread: the energy balance's own, plus the gravity waves' within the Rossby radius c / f (at 45°)
    const f45 = 2 * orbit.rotation * Math.sin(Math.PI / 4), reach = Math.min(1, (p.WAVE_SPEED_MS / (Math.max(1e-12, f45) * R_PLANET)) ** 2);
    const waves = airCap * p.WAVE_SPEED_MS / (2 * R_PLANET) * reach;
    // (the free air on FIELD_GRID_DEG: on a long day its pattern is the planet's own, day side and night side, and there
    // the spread dominates — on the 1° grid the multigrid's coarsest level never settles it; the ground and the air by
    // it stay on g)
    const ratio = Math.max(1, Math.round(FIELD_GRID_DEG / g.step)), gc = ratio > 1 ? new LatLonGrid(g.step * ratio, g.radiusM) : g, Gc = gc.size;
    const toC = (src) => ratio > 1 ? coarsenField(g, gc, ratio, src) : src;
    const solver = new HelmholtzSolver(gc, P.TEMP_DIFFUSIVITY + waves, P.TEMP_DIFFUSIVITY_EW + waves);
    const cos = new Float64Array(w * SOLVED), sin = new Float64Array(w * SOLVED);
    for (let i = 0; i < w; i++) for (let n = 1; n <= SOLVED; n++) { const a = n * g.lon[i] * Math.PI / 180; cos[i * SOLVED + n - 1] = Math.cos(a); sin[i * SOLVED + n - 1] = Math.sin(a); }
    const K = DAY_TIMES.length;
    const rangeL = new Float64Array(K * G), rangeS = new Float64Array(K * G), heatK = earthDay ? null : new Float64Array(K * G), rectK = earthDay ? null : new Float64Array(K * G);
    const sr = new Float64Array(G), si = new Float64Array(G), fr = new Float64Array(G), fi = new Float64Array(G);
    const xr = new Float64Array(SOLVED * G), xi = new Float64Array(SOLVED * G);
    const xrC = new Float64Array(SOLVED * Gc), xiC = new Float64Array(SOLVED * Gc);
    const harm = new Float64Array(HARMONICS * h), tmp = new Float64Array(HARMONICS);
    const share = new Float64Array(3);
    const landC = toC(landFrac), wind2K = earthDay ? null : new Float64Array(K * G), wind2C = new Float64Array(Gc);
    const tiles = new Float64Array(3 * TILE_FIELDS * G);
    const tileAt = (c, q) => {
        const o = (c * 3 + q) * TILE_FIELDS, sf = surf[q];
        sf.sun = tiles[o]; sf.lamRad = tiles[o + 1]; sf.h = tiles[o + 2]; sf.lamLat = tiles[o + 3];
        sf.inertia = tiles[o + 4]; sf.slab = tiles[o + 5]; sf.weather = tiles[o + 6]; sf.Tk = tiles[o + 7];
        return sf;
    };
    const lowR = new Float64Array(SOLVED * G), lowI = new Float64Array(SOLVED * G), lowRC = new Float64Array(SOLVED * Gc), lowIC = new Float64Array(SOLVED * Gc);
    for (let s = 0; s < K; s++) {
        const t = DAY_TIMES[s], sun = sunAt(t, orbit), T = airAt(t), { u, v } = windAt(t), rain = rainAt(t), ice = iceAt(t), clouds = cloudAt(t);
        // (the wind the exchange feels: the month's mean and, from the previous round, the day's own swing)
        const w2 = wind2Prev ? wind2Prev.subarray(Math.round(t - 0.5) * G, (Math.round(t - 0.5) + 1) * G) : null;
        const windOf = (c) => w2 ? Math.sqrt(u[c] * u[c] + v[c] * v[c] + w2[c]) : Math.hypot(u[c], v[c]);
        for (let j = 0; j < h; j++) { sunHarmonics(g.lat[j] * Math.PI / 180, sun.delta, sun.s0, tmp); harm.set(tmp, j * HARMONICS); }
        for (let c = 0; c < G; c++) {
            const wind = windOf(c), r = rain ? rain[c] : null;
            for (let q = 0; q < 3; q++) {
                const cloud = clouds ? clouds[c] : 0.5;
                const sf = tileSurface({ kind: q, T: T[c], rainMm: r, windMs: wind, p, ps: orbit.pressureScale, out: surf[q], cloud }), o = (c * 3 + q) * TILE_FIELDS;
                tiles[o] = sf.sun; tiles[o + 1] = sf.lamRad; tiles[o + 2] = sf.h; tiles[o + 3] = sf.lamLat;
                tiles[o + 4] = sf.inertia; tiles[o + 5] = sf.slab; tiles[o + 6] = sf.weather; tiles[o + 7] = sf.Tk;
            }
        }
        // the free air, harmonic by harmonic
        for (let n = 1; n <= SOLVED; n++) {
            const wn = n * omega;
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i, a = harm[j * HARMONICS + n - 1];
                share[LAND] = landFrac[c]; share[WATER] = (1 - landFrac[c]) * (1 - ice[c]); share[ICE] = (1 - landFrac[c]) * ice[c];
                let dRe = 0, dIm = 0, bRe = 0, bIm = 0;
                for (let q = 0; q < 3; q++) {
                    if (!(share[q] > 0)) continue;
                    const sf = tileAt(c, q), z = tileResponse(sf, wn, p, orbit.pressureScale, resp[q]);
                    // k² / Z_a and k h S / (Z_g Z_a), weighted by the tile's share
                    const k = p.AIR_LOSS, S = a * sf.sun;
                    dRe += share[q] * k * k * z.iaRe; dIm += share[q] * k * k * z.iaIm;
                    const gaRe = z.igRe * z.iaRe - z.igIm * z.iaIm, gaIm = z.igRe * z.iaIm + z.igIm * z.iaRe;
                    bRe += share[q] * k * sf.h * S * gaRe; bIm += share[q] * k * sf.h * S * gaIm;
                }
                sr[c] = P.TEMP_OLR_B + p.AIR_LOSS - dRe; si[c] = wn * airCap - dIm;
                const cr = cos[i * SOLVED + n - 1], ci = sin[i * SOLVED + n - 1];                    // × e^{i n lon}: local noon
                fr[c] = bRe * cr - bIm * ci; fi[c] = bRe * ci + bIm * cr;
            }
            solver.setOperator(toC(sr), toC(si), toC(u), toC(v), gamma, null);
            const oc = (n - 1) * Gc, r0 = xrC.subarray(oc, oc + Gc), i0 = xiC.subarray(oc, oc + Gc);
            solver.solve(toC(fr), toC(fi), r0, i0, { tol: FIELD_TOL, maxCycles: FIELD_CYCLES });
            if (ratio > 1) { refineField(gc, g, ratio, r0, xr, (n - 1) * G); refineField(gc, g, ratio, i0, xi, (n - 1) * G); }
            else { xr.set(r0, (n - 1) * G); xi.set(i0, (n - 1) * G); }
        }
        const o = s * G;
        if (wind2K) { lowR.fill(0); lowI.fill(0); }
        // each tile's air and ground, the range, the heating and the extra heat radiated
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
            const c = j * w + i;
            share[LAND] = landFrac[c]; share[WATER] = (1 - landFrac[c]) * (1 - ice[c]); share[ICE] = (1 - landFrac[c]) * ice[c];
            let rect = 0;
            for (let q = 0; q < 3; q++) {
                const sf = tileAt(c, q);
                let varP = 0, varE = 0;
                for (let n = 1; n <= HARMONICS; n++) {
                    const z = tileResponse(sf, n * omega, p, orbit.pressureScale, resp[q]), S = harm[j * HARMONICS + n - 1] * sf.sun;
                    // the solved harmonics bring the free air's T_f (back in the cell's own phase: × e^{−i n lon})
                    let fRe = 0, fIm = 0;
                    if (n <= SOLVED) {
                        const cr = cos[i * SOLVED + n - 1], ci = sin[i * SOLVED + n - 1], xR = xr[(n - 1) * G + c], xI = xi[(n - 1) * G + c];
                        fRe = xR * cr + xI * ci; fIm = xI * cr - xR * ci;
                    }
                    const k = p.AIR_LOSS, nRe = sf.h * S * z.igRe + k * fRe, nIm = sf.h * S * z.igIm + k * fIm;
                    const aRe = nRe * z.iaRe - nIm * z.iaIm, aIm = nRe * z.iaIm + nIm * z.iaRe;               // T_a
                    const mRe = S + sf.h * aRe, mIm = sf.h * aIm;
                    const sRe = mRe * z.igRe - mIm * z.igIm, sIm = mRe * z.igIm + mIm * z.igRe;               // T_s
                    taRe[q * HARMONICS + n - 1] = aRe; taIm[q * HARMONICS + n - 1] = aIm;
                    if (wind2K && n <= SOLVED && share[q] > 0) {
                        // the cell's air by the ground, back in the field's phase (× e^{i n lon}), for the winds below
                        const cr = cos[i * SOLVED + n - 1], ci = sin[i * SOLVED + n - 1];
                        lowR[(n - 1) * G + c] += share[q] * (aRe * cr - aIm * ci); lowI[(n - 1) * G + c] += share[q] * (aRe * ci + aIm * cr);
                    }
                    varP += (sRe * sRe + sIm * sIm) / 2;
                    if (!earthDay) {
                        const zE = tileResponse(sf, n * omegaE, p, orbit.pressureScale, respE[q]);
                        const eRe = sf.h * S * zE.igRe, eIm = sf.h * S * zE.igIm;
                        const a2Re = eRe * zE.iaRe - eIm * zE.iaIm, a2Im = eRe * zE.iaIm + eIm * zE.iaRe;
                        const m2Re = S + sf.h * a2Re, m2Im = sf.h * a2Im;
                        const s2Re = m2Re * zE.igRe - m2Im * zE.igIm, s2Im = m2Re * zE.igIm + m2Im * zE.igRe;
                        varE += (s2Re * s2Re + s2Im * s2Im) / 2;
                    }
                }
                const sunR = sunRange(taRe, taIm, q * HARMONICS), range = Math.sqrt(sunR * sunR + sf.weather * sf.weather);
                if (q === LAND) {
                    rangeL[o + c] = range;
                    if (heatK) {
                        // the land's own range on an Earth day (its free air barely moves on one)
                        for (let n = 1; n <= HARMONICS; n++) {
                            const zE = tileResponse(sf, n * omegaE, p, orbit.pressureScale, respE[q]), S = harm[j * HARMONICS + n - 1] * sf.sun;
                            const eRe = sf.h * S * zE.igRe, eIm = sf.h * S * zE.igIm;
                            earthRe[n - 1] = eRe * zE.iaRe - eIm * zE.iaIm;
                            earthIm[n - 1] = eRe * zE.iaIm + eIm * zE.iaRe;
                        }
                        const earthR = sunRange(earthRe, earthIm, 0);
                        heatK[o + c] = earthR > 1e-6 ? sunR / earthR : 1;
                    }
                } else if (q === WATER) rangeS[o + c] = range;
                else rangeS[o + c] = (1 - ice[c]) * rangeS[o + c] + ice[c] * range;
                if (rectK) rect += share[q] * 6 * p.EMISSIVITY * SIGMA * sf.Tk * sf.Tk * (varP - varE);
            }
            if (rectK) rectK[o + c] = rect;
        }
        // the winds the day's pressure drives (their mean square over the day)
        if (wind2K) {
            for (let n = 0; n < SOLVED; n++) {
                lowRC.set(toC(lowR.subarray(n * G, (n + 1) * G)), n * Gc); lowIC.set(toC(lowI.subarray(n * G, (n + 1) * G)), n * Gc);
            }
            dayWinds(gc, lowRC, lowIC, landC, omega, orbit, P, wind2C);
            if (ratio > 1) refineField(gc, g, ratio, wind2C, wind2K, o); else wind2K.set(wind2C, o);
        }
    }
    // the six times of year → each month (mid-month) and each of the energy balance's sample times (t = 0 … 11)
    const between = (src, t, out, off) => {
        const x = ((t - DAY_TIMES[0]) / 2 % K + K) % K, a = Math.floor(x), f = x - a, b = (a + 1) % K;
        for (let c = 0; c < G; c++) out[off + c] = (1 - f) * src[a * G + c] + f * src[b * G + c];
    };
    const land = new Float32Array(12 * G), sea = new Float32Array(12 * G), heat = heatK ? new Float32Array(12 * G) : null, rect = rectK ? new Float64Array(12 * G) : null;
    const wind2 = wind2K ? new Float64Array(12 * G) : null;
    for (let m = 0; m < 12; m++) {
        between(rangeL, m + 0.5, land, m * G); between(rangeS, m + 0.5, sea, m * G);
        if (heat) between(heatK, m + 0.5, heat, m * G);
        if (rect) between(rectK, m, rect, m * G);
        if (wind2) between(wind2K, m + 0.5, wind2, m * G);
    }
    return { land, sea, heat, rect, wind2 };
}

function dayWinds(gc, xr, xi, land, omega, orbit, P, out) {
    const { w, h } = gc, G = gc.size, R_PLANET = gc.radiusM, dRad = gc.step * Math.PI / 180, rho = 1.2, k = P.CIRC_THERMAL_HPA_PER_K * 100;
    const f45 = 2 * EARTH_ROTATION * Math.sin(Math.PI / 4), tanO = Math.tan(P.CIRC_TURN_OCEAN_DEG * Math.PI / 180), tanL = Math.tan(P.CIRC_TURN_LAND_DEG * Math.PI / 180);
    out.fill(0);
    for (let n = 1; n <= SOLVED; n++) {
        const pr = xr.subarray((n - 1) * G, n * G), pi = xi.subarray((n - 1) * G, n * G), wn = n * omega;
        for (let j = 0; j < h; j++) {
            const lat = gc.lat[j] * Math.PI / 180, f = 2 * orbit.rotation * Math.sin(lat), cl = Math.max(0.05, Math.cos(lat));
            const sx = 1 / (R_PLANET * cl * 2 * dRad), sy = 1 / (R_PLANET * 2 * dRad);
            for (let i = 0; i < w; i++) {
                const c = j * w + i, ce = j * w + (i + 1) % w, cw = j * w + (i - 1 + w) % w;
                const cn = j > 0 ? c - w : c, cs = j < h - 1 ? c + w : c, ey = j > 0 && j < h - 1 ? 1 : 2;
                // p = −k T_a (Pa); gradients (rows run north → south)
                const pxR = -k * (pr[ce] - pr[cw]) * sx, pxI = -k * (pi[ce] - pi[cw]) * sx;
                const pyR = -k * (pr[cn] - pr[cs]) * sy * ey, pyI = -k * (pi[cn] - pi[cs]) * sy * ey;
                const r = f45 * (tanO + (tanL - tanO) * land[c]), sh = P.CIRC_SURFACE_WIND + (P.CIRC_SURFACE_WIND_LAND - P.CIRC_SURFACE_WIND) * land[c];
                // a = r + i wn; u = −sh (a p_x + f p_y) / (ρ (a² + f²)), v = −sh (a p_y − f p_x) / (ρ (a² + f²))
                const dRe = rho * (r * r - wn * wn + f * f), dIm = rho * 2 * r * wn, dD = dRe * dRe + dIm * dIm;
                const nuR = r * pxR - wn * pxI + f * pyR, nuI = r * pxI + wn * pxR + f * pyI;
                const nvR = r * pyR - wn * pyI - f * pxR, nvI = r * pyI + wn * pyR - f * pxI;
                const uR = -sh * (nuR * dRe + nuI * dIm) / dD, uI = -sh * (nuI * dRe - nuR * dIm) / dD;
                const vR = -sh * (nvR * dRe + nvI * dIm) / dD, vI = -sh * (nvI * dRe - nvR * dIm) / dD;
                out[c] += (uR * uR + uI * uI + vR * vR + vI * vI) / 2;
            }
        }
    }
    return out;
}

