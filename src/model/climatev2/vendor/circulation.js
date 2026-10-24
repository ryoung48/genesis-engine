// Vendored from github.com/raguilar011095/planet_heightmap_generation@47edc28acc17719b6bed03e211d20eb87441c2be v2/js/climate/circulation.js (GPL-3.0, see LICENSE). Modified in chaos-machine: the planet's rotation (rotation.js), the winds' friction and speed, further Ferrel cells on faster planets, and the Hadley cells from Hill, Bordoni & Mitchell 2022's theory (below) in place of Held & Hou's scaling.
// Circulation stage: sea-level pressure and near-surface winds, derived from the temperature stage. DOM-free.
//
// Pressure has two parts, both set by the planet's own temperatures (nothing is placed at Earth's latitudes):
//  • The zonal belts — the tropical low (ITCZ), the subtropical highs, the subpolar lows, the polar highs. The ITCZ
//    sits where the air by the sea holds the most moist static energy (the tropical rain belt follows the warmest ocean) — per longitude at that
//    longitude's warmest latitude, into a summer continent's heat low (the monsoon trough reaching the Himalaya), the
//    subtropical high there making way for it; each Hadley cell
//    reaches as far as its upper wind stays baroclinically stable (Hill et al. 2022) for this planet's rotation, size and stability;
//    a Ferrel cell further out lies the subpolar low. The trough is deep only where the westerlies run round the
//    planet over open sea (the Southern Ocean's ≈ 30 hPa below the subtropical highs; the land-broken north's ≈ 6,
//    where the lows sit over the oceans and highs over the winter continents), and grows with the temperature contrast
//    across the storm belt (stronger westerlies in winter, on colder planets).
//  • Thermal lows and highs — air over ground warmer than its latitude's average rises and leaves low pressure; over
//    colder ground it sinks and piles up (hydrostatic: the lower troposphere warmer or colder). Smoothed at the
//    scale the atmosphere responds on (the Rossby radius). Summer continents get lows and the cooler oceans beside
//    them highs (the summer highs over the eastern oceans); winter continents get highs and the oceans lows. Heat lows
//    need hot ground (a deep, dry boundary layer: the Sahara, Arabia to Pakistan, inland Australia) and are weaker over
//    mild land and in the deep tropics, where the sun's heat goes into convection and rain rather than into the
//    air near the ground (the rain belt's own low is the trough above); cold highs grow over very cold ground (the
//    Siberian and Canadian highs). The subtropical highs sit over the oceans in every season (the Azores, Pacific and
//    southern-ocean highs; over the land beside them in winter only weak ridges): within the subtropical belt the
//    pressure is shifted toward the sea, the zonal mean kept.
//
// Winds follow from pressure with surface friction: along the isobars where the Coriolis force dominates, turned
// toward low pressure by friction (more over land), and straight down the pressure gradient at the equator — one
// linear balance (f k×u + r u = −∇p/ρ) covers all three. Near the ground the wind is a smaller share of that over
// rough land than over the sea.

import { LatLonGrid, coarsenField, refineField } from './grid.js';
import { PARAMS } from './config.js';
import { orbitOf, EARTH_ROTATION } from './insolation.js';
import { spinScaled, spinRatio } from './rotation.js';
import { sizeScaled } from './size.js';

const G_ACC = 9.81;               // m/s²
const RHO_AIR = 1.2;              // kg/m³
// The Hadley cells (below): Hill, Bordoni & Mitchell 2022's theory and its stated values
const HADLEY_H = 10000;           // m, the tropopause height (Hill et al. 2022: Bu ≈ 0.46 for Earth)
const HADLEY_RO = 1;              // the cells' Rossby number: 1 conserves angular momentum (Held 2000); Kang & Lu 2012 fit 0.45–1
const HADLEY_CD = 1;              // the descending edge's constant (Faulk et al. 2017, seasonal: 1.0; 0.75–1.4 across models)
const HADLEY_CA = 1.8;            // the ascending edge's constant (Hill et al. 2022, Earth-like seasonal aquaplanet)
const HADLEY_DV_MIN = 0.02;       // the least static stability, Δ_v: a dry troposphere still rises ≈ 6 K in θ (6 / 300)
const HADLEY_MIN_DEG = 3;         // °, a cell spans at least the circulation grid's step from its ITCZ
const SEA_RH = 0.8;               // the air's relative humidity by the sea (≈ 0.8: Held & Soden 2006)
const CONVECTIVE_DEG = 10;        // the convective, rainy tropics: a Gaussian of this width (degrees) about the rain belt
const OCEAN_HIGH_DEG = 15;        // half-width of the subtropical ridge the oceanic highs sit on (degrees)
const DEG = Math.PI / 180;
const HADLEY_MAX_LAT = 80;         // °, the subtropical highs stand no further poleward (a slow planet's cells reach far)
const LAST_LOW_LAT = 88;          // °, further Ferrel cells fit while their low stands equatorward of this

/** Weight of the tropics' regime at a latitude: 1 from the ITCZ to halfway to each subtropical high, fading smoothly
 *  to 0 at the high (convective and wet; the Hadley circulation evens the temperature aloft). */
export function tropicsWeight(lat, itcz, hiN, hiS) {
    const x = lat >= itcz ? (lat - itcz) / Math.max(5, hiN - itcz) : (itcz - lat) / Math.max(5, itcz - hiS);
    const y = 2 * x - 1;
    return y <= 0 ? 1 : y >= 1 ? 0 : 1 - y * y * (3 - 2 * y);
}

/**
 * The circulation stage. stage(ctx, temperature) → { u, v (12 × G, m/s, east / north), slp (12 × G, hPa),
 * conv (12 × G, low-level convergence, 1/s), itczLat (12 × grid.w, degrees), belts (per month), ms }.
 * temperature.monthly: surface air temperature, 12 × G (°C).
 */
export function derivedCirculation() {
    return (ctx, temperature) => {
        // (friction is the boundary layer's own: Earth's, whatever the rotation — so the wind turns further toward low
        // pressure on a slower planet, and its speed for a given pressure field stays Earth's — below)
        const orbit = orbitOf(ctx.options), OMEGA_ROT = orbit.rotation, spin = spinRatio(orbit), F45 = 2 * EARTH_ROTATION * Math.sin(Math.PI / 4);
        const t0 = performance.now();
        const P = sizeScaled(spinScaled({ ...PARAMS }, orbit), orbit);
        const core = ctx.grid;
        const ratio = Math.round(P.CIRC_GRID_DEG / core.step);
        const g = ratio > 1 ? new LatLonGrid(core.step * ratio, core.radiusM) : core;
        const R_PLANET = core.radiusM;
        const G = g.size, w = g.w, h = g.h;
        const land = coarsen(core, g, ratio, ctx.surface.landFrac);
        const cosLat = Float64Array.from(g.lat, l => Math.cos(l * DEG));
        const dRad = g.step * DEG;

        const U = new Float32Array(12 * core.size), V = new Float32Array(12 * core.size), SLP = new Float32Array(12 * core.size);
        const CONV = new Float32Array(12 * core.size);
        const itczLat = new Float32Array(12 * core.w);
        const belts = [];
        const T = new Float64Array(G), p = new Float64Array(G), u = new Float64Array(G), v = new Float64Array(G), cv = new Float64Array(G);
        const Tz = new Float64Array(h), Tzs = new Float64Array(h), pz = new Float64Array(G);
        const tmp = new Float64Array(G), anom = new Float64Array(G);

        // The air's warmth as the atmosphere feels it: surface temperature brought to sea level at the free air's
        // lapse rate. A sunlit plateau is far warmer than free air at its height (an elevated heat source — the
        // summer low over Tibet and South Asia); an ice sheet colder (the highs over Antarctica and Greenland).
        // (an ice sheet's surface at the height its temperature was reported for — its dome, temperature.js: brought down
        // from the ground under it, a low sheet read as air ~10 °C too cold, and its cold high shifted the hemisphere's belts)
        const freeLapse = (ctx.options.lapseRateCPerKm ?? 6.5) * orbit.gravityScale;
        const href = new Float64Array(core.size), dome = temperature.domeKm;
        for (let c = 0; c < core.size; c++) { const hr = ctx.surface.meanLandKm[c]; href[c] = Math.max(hr === hr ? Math.max(0, hr) : 0, dome ? dome[c] : 0); }
        const Tfree = new Float64Array(core.size);
        const sea = new Float64Array(G);
        for (let c = 0; c < G; c++) sea[c] = 1 - land[c];
        // the sea share around each cell at the Rossby scale, as a departure from its latitude's (for the oceanic highs)
        const seaAround = Float64Array.from(sea), seaDep = new Float64Array(G);
        gaussianSmooth(g, seaAround, new Float64Array(G), P.CIRC_ROSSBY_KM);
        for (let j = 0; j < h; j++) { let s = 0; for (let i = 0; i < w; i++) s += seaAround[j * w + i] / w; for (let i = 0; i < w; i++) seaDep[j * w + i] = seaAround[j * w + i] - s; }

        // A month's zonal picture: the air's warmth on the grid (T), its zonal means — all cells, and weighted toward the
        // sea (for the ITCZ) — the ITCZ, and each hemisphere's equator-to-pole contrast
        const zAt = (lat) => { const y = Math.max(0, Math.min(h - 1, (90 - lat) / g.step - 0.5)); const j0 = Math.floor(y), f = y - j0; return Tz[j0] * (1 - f) + Tz[Math.min(h - 1, j0 + 1)] * f; };
        const Bu = G_ACC * HADLEY_H / ((OMEGA_ROT * R_PLANET) ** 2);         // the planetary Burger number
        const zonalMonth = (m) => {
            // (above the winter inversion: the surface layer of cold air over snow is not the air the belts feel — its
            // shallow cold highs come from CIRC_COLD_HIGH_BOOST on very cold ground)
            const src = temperature.monthly.subarray(m * core.size, (m + 1) * core.size), inv = temperature.inversion ? temperature.inversion.subarray(m * core.size, (m + 1) * core.size) : null;
            for (let c = 0; c < core.size; c++) Tfree[c] = src[c] + freeLapse * href[c] - (inv ? inv[c] : 0);
            T.set(coarsen(core, g, ratio, Tfree));
            for (let j = 0; j < h; j++) {
                let s = 0, ss = 0, ws = 0;
                for (let i = 0; i < w; i++) { const c = j * w + i, sw = (1 - land[c]) + 0.02; s += T[c]; ss += thetaE(T[c]) * sw; ws += sw; }
                Tz[j] = s / w; Tzs[j] = ss / ws;
            }
            return rising(g, smoothProfile(g, Tzs, 5), Bu);
        };
        // The Hadley cells (Hill, Bordoni & Mitchell 2022, after Held 2000 and Kang & Lu 2012). They rise at the ITCZ —
        // the latitude where the air by the sea holds the most moist static energy (Privé & Plumb 2007), as far from the
        // equator as the angular-momentum budget lets it go (rising) — and each reaches poleward until its upper wind,
        // spun up as angular momentum is carried out from the ITCZ (Rossby number HADLEY_RO), turns baroclinically
        // unstable: sin⁴φ/cos²φ − sin²φ_a·sin²φ/cos²φ = Bu·Δ_v/Ro, Bu = gH/(Ωa)². The cell beyond the equator from a
        // summer ITCZ is the wide one, the summer cell the narrow (sin²φ is the same either side). Δ_v, the troposphere's
        // static stability, is the moist adiabat's from the ITCZ against the surface under the cell's edge: warmer and
        // wetter tropics stand more stably, and the cells widen (as in warmer GCM climates, Frierson et al. 2007). The edges
        // follow the ITCZ by a month (Hill et al. 2022).
        const months = [], TzM = new Float64Array(12 * h);
        for (let m = 0; m < 12; m++) { months.push(zonalMonth(m)); TzM.set(Tz, m * h); }
        const edge = (m, sgn) => {
            const { itcz, thetaA } = months[m], zm = (lat) => { const y = Math.max(0, Math.min(h - 1, (90 - lat) / g.step - 0.5)); const j0 = Math.floor(y), f = y - j0; return TzM[m * h + j0] * (1 - f) + TzM[m * h + Math.min(h - 1, j0 + 1)] * f; };
            const sa = Math.sin(itcz * DEG) ** 2;
            let lat = 30;
            for (let it = 0; it < 6; it++) {
                const ts = zm(sgn * lat) + 273.15, dv = Math.max(HADLEY_DV_MIN, (thetaA - ts) / ts), K = Bu * dv / HADLEY_RO;
                const s = (-(K - sa) + Math.sqrt((K - sa) * (K - sa) + 4 * K)) / 2;
                lat = HADLEY_CD * Math.asin(Math.sqrt(Math.min(1, s))) / DEG;
            }
            return Math.min(lat, HADLEY_MAX_LAT);
        };

        for (let m = 0; m < 12; m++) {
            const { itcz } = zonalMonth(m), lag = (m + 11) % 12;
            const hiN = Math.max(edge(lag, 1), itcz + HADLEY_MIN_DEG), hiS = Math.min(-edge(lag, -1), itcz - HADLEY_MIN_DEG);
            const loN = Math.min(hiN + P.CIRC_FERREL_DEG, 82), loS = Math.max(hiS - P.CIRC_FERREL_DEG, -82);
            // pressure drops: tropical (ITCZ to the highs); midlatitude — the trough below the subtropical highs,
            // CIRC_MIDLAT_HPA × (the belt's sea share)^CIRC_OPEN_SEA_POWER × √(the belt's temperature contrast / 25 K):
            // continents and their mountains break up the zonal flow, and the storms grow with the contrast, less than
            // in proportion
            const beltSea = (a, b) => {                              // sea share of the belt between latitudes a and b
                let s = 0, n = 0;
                for (let j = 0; j < h; j++) { const la = g.lat[j]; if (la < Math.min(a, b) || la > Math.max(a, b)) continue; for (let i = 0; i < w; i++) { s += sea[j * w + i] * cosLat[j]; n += cosLat[j]; } }
                return n ? s / n : 0.5;
            };
            const contrast = (a, b) => Math.sqrt(Math.max(0, zAt(a) - zAt(b)) / 25);
            const midN = P.CIRC_MIDLAT_HPA * beltSea(hiN, loN) ** P.CIRC_OPEN_SEA_POWER * contrast(hiN, loN);
            const midS = P.CIRC_MIDLAT_HPA * beltSea(hiS, loS) ** P.CIRC_OPEN_SEA_POWER * contrast(hiS, loS);
            belts.push({ itcz, hiN, hiS, loN, loS, midN, midS });

            // ── Thermal lows and highs: temperature against its latitude's average, at the Rossby scale ──
            // Over land, a heat low is CIRC_HEAT_LOW_MILD of its full depth on mild ground (≤ 15 °C at the surface) and
            // in the rainy tropics (within ~CONVECTIVE_DEG of the rain belt), × (1 + CIRC_HEAT_LOW_HOT) on hot, dry
            // ground (≥ 35 °C) between the rain belt and the subtropical highs; a cold high is
            // × (1 + CIRC_COLD_HIGH_BOOST) on very cold ground (≤ −25 °C)
            const Ts = coarsen(core, g, ratio, temperature.monthly.subarray(m * core.size, (m + 1) * core.size));
            const smooth01 = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
            for (let j = 0; j < h; j++) {
                const dry = 1 - P.CIRC_HEAT_LOW_TROPICS * Math.exp(-(((g.lat[j] - itcz) / CONVECTIVE_DEG) ** 2));
                for (let i = 0; i < w; i++) {
                    const c = j * w + i, a = T[c] - Tz[j], L = land[c];
                    const hot = dry * smooth01((Ts[c] - 15) / 20);
                    const wgt = a > 0 ? 1 - L * (1 - P.CIRC_HEAT_LOW_MILD) * (1 - hot) + L * P.CIRC_HEAT_LOW_HOT * hot
                        : 1 + L * P.CIRC_COLD_HIGH_BOOST * smooth01(-Ts[c] / 25);
                    anom[c] = a * wgt;
                }
            }
            gaussianSmooth(g, anom, tmp, P.CIRC_ROSSBY_KM);
            // The tropical trough follows each longitude's own warmest latitude (over the sea the warmest water,
            // over a summer continent its heat low — the monsoon trough), smoothed along ~20° of longitude, as far as
            // CIRC_TROUGH_MAX_LAT. Where it runs poleward into a heat low (Tibet and the Ganges plain, the Sahara, the
            // Mexican and Australian deserts), the rain belt's trough and the heat low are one: that longitude's
            // subtropical high stands CIRC_TROUGH_HIGH_DEG beyond it instead of on top of it (a ridge between the two
            // left the Himalayan foothills in dry northerlies off the mountains, not in the monsoon's flow).
            // A trough drawn away from the rain belt (fully by CONVECTIVE_DEG) is a monsoon trough, deeper than the rain
            // belt by CIRC_MONSOON_HPA_PER_K per degree its heat low is warmer than the latitude (the thermal anomaly
            // above, at the trough): deep where a plateau heats the air aloft over a large continent (South Asia ≈ 996
            // hPa in July), shallow over a flat desert (the Sahara ≈ 1008) — the monsoon's push from the sea, by the
            // planet's own terrain (with the trough no deeper than the rain belt, the Ganges plain and the Himalayan
            // foothills had too little of it).
            // (within the Hadley cells, or as far as CIRC_TROUGH_MAX_LAT, whichever reaches further: a summer continent's
            // heat low draws the trough beyond the zonal cells' edge)
            const trough = localTrough(g, T, h, w, Math.min(-P.CIRC_TROUGH_MAX_LAT, hiS), Math.max(P.CIRC_TROUGH_MAX_LAT, hiN), itcz);
            for (let i = 0; i < w; i++) {
                const hiNi = Math.min(HADLEY_MAX_LAT, Math.max(hiN, trough[i] + P.CIRC_TROUGH_HIGH_DEG)), hiSi = Math.max(-HADLEY_MAX_LAT, Math.min(hiS, trough[i] - P.CIRC_TROUGH_HIGH_DEG));
                const loNi = Math.max(loN, hiNi + 10), loSi = Math.min(loS, hiSi - 10);
                const away = Math.abs(trough[i] - itcz), jt = Math.max(0, Math.min(h - 1, Math.round((90 - trough[i]) / g.step - 0.5)));
                const deep = P.CIRC_MONSOON_HPA_PER_K * Math.max(0, anom[jt * w + i]) * smooth01(away / CONVECTIVE_DEG);
                const knots = [
                    ...extraCells(-1, loSi, -midS, P), [loSi, -midS], [hiSi, 0], [trough[i], -P.CIRC_TROPICAL_HPA - deep], [hiNi, 0], [loNi, -midN], ...extraCells(1, loNi, -midN, P),
                ];
                for (let j = 0; j < h; j++) pz[j * w + i] = profileAt(knots, g.lat[j]);
            }

            // oceanic subtropical highs: CIRC_OCEAN_HIGH_HPA per unit of sea share above the latitude's, over a ridge
            // ±OCEAN_HIGH_DEG about each hemisphere's high (cos²)
            const ridge = (lat) => { let r = 0; for (const hi of [hiN, hiS]) { const x = (lat - hi) / OCEAN_HIGH_DEG; if (Math.abs(x) < 1) r += Math.cos(x * Math.PI / 2) ** 2; } return r; };
            let mean = 0, mw = 0;
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                const c = j * w + i;
                p[c] = pz[c] - P.CIRC_THERMAL_HPA_PER_K * anom[c] + P.CIRC_OCEAN_HIGH_HPA * seaDep[c] * ridge(g.lat[j]);
                mean += p[c] * cosLat[j]; mw += cosLat[j];
            }
            mean /= mw;
            for (let c = 0; c < G; c++) p[c] += 1011 - mean;                  // the planet's mean sea-level pressure

            // ── Winds: f k×u + r u = −∇p/ρ, friction turning more over land ──
            const tanO = Math.tan(P.CIRC_TURN_OCEAN_DEG * DEG), tanL = Math.tan(P.CIRC_TURN_LAND_DEG * DEG);
            for (let j = 0; j < h; j++) {
                const f = 2 * OMEGA_ROT * Math.sin(g.lat[j] * DEG);
                const sx = 100 / (R_PLANET * Math.max(0.05, cosLat[j]) * 2 * dRad), sy = 100 / (R_PLANET * 2 * dRad);   // hPa → Pa, centred
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    const px = (p[j * w + (i + 1) % w] - p[j * w + (i - 1 + w) % w]) * sx;
                    const pn = j > 0 ? p[c - w] : p[c], ps = j < h - 1 ? p[c + w] : p[c];
                    const py = (pn - ps) * sy * (j > 0 && j < h - 1 ? 1 : 2);
                    const r = F45 * (tanO + (tanL - tanO) * land[c]);
                    const fE = 2 * EARTH_ROTATION * Math.sin(g.lat[j] * DEG);
                    const d = RHO_AIR * (spin === 1 ? r * r + f * f : Math.sqrt(r * r + f * f) * Math.sqrt(r * r + fE * fE)), sh = P.CIRC_SURFACE_WIND + (P.CIRC_SURFACE_WIND_LAND - P.CIRC_SURFACE_WIND) * land[c];
                    u[c] = -sh * (r * px + f * py) / d;
                    v[c] = -sh * (r * py - f * px) / d;
                }
            }
            // low-level convergence (−divergence), for the rain belt and later the rain stage
            for (let j = 0; j < h; j++) {
                const cj = Math.max(0.05, cosLat[j]);
                for (let i = 0; i < w; i++) {
                    const c = j * w + i;
                    const dudx = (u[j * w + (i + 1) % w] - u[j * w + (i - 1 + w) % w]) / (2 * dRad * R_PLANET * cj);
                    const vn = j > 0 ? v[c - w] * cosLat[j - 1] : 0, vs = j < h - 1 ? v[c + w] * cosLat[j + 1] : 0;
                    const dvdy = (vn - vs) / (2 * dRad * R_PLANET * cj);
                    cv[c] = -(dudx + dvdy);
                }
            }
            refine(g, core, ratio, u, U, m * core.size);
            refine(g, core, ratio, v, V, m * core.size);
            refine(g, core, ratio, p, SLP, m * core.size);
            refine(g, core, ratio, cv, CONV, m * core.size);
            // the rain belt per longitude: strongest convergence within 30° of the equator, or within the Hadley cells where they reach further (smoothed)
            itczPerLongitude(g, cv, h, w, itczLat, m, core, Math.min(-30, hiS), Math.max(30, hiN));
        }
        return { u: U, v: V, slp: SLP, conv: CONV, itczLat, belts, surfaceShare: P.CIRC_SURFACE_WIND, surfaceShareLand: P.CIRC_SURFACE_WIND_LAND,
            ms: performance.now() - t0, source: 'derived circulation' };
    };
}

/**
 * Latitude of the tropical trough per longitude: the warmest latitude between lo and hi (°), from temperature smoothed ~20°
 * along longitude and ~5° in latitude (the subtropical highs then make way for it — the caller).
 */
function localTrough(g, T, h, w, lo, hi, zonalItcz) {
    const out = new Float64Array(w), col = new Float64Array(h);
    const sLon = 10 / g.step, rLon = Math.ceil(2 * sLon);
    const lonW = Array.from({ length: 2 * rLon + 1 }, (_, k) => Math.exp(-0.5 * ((k - rLon) / sLon) ** 2));
    for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
            let s = 0, ws = 0;
            for (let d = -rLon; d <= rLon; d++) { const wt = lonW[d + rLon]; s += T[j * w + (i + d + w) % w] * wt; ws += wt; }
            col[j] = s / ws;
        }
        const sm = smoothProfile(g, col, 5);
        let best = -Infinity, bestLat = zonalItcz;
        for (let j = 0; j < h; j++) { const la = g.lat[j]; if (la < lo || la > hi) continue; if (sm[j] > best) { best = sm[j]; bestLat = la; } }
        out[i] = bestLat;
    }
    // a little smoothing along longitude so the trough is a continuous line
    const sm2 = new Float64Array(w);
    for (let i = 0; i < w; i++) { let s = 0, n = 0; for (let d = -3; d <= 3; d++) { s += out[(i + d + w) % w]; n++; } sm2[i] = s / n; }
    return sm2;
}

/** Smooth piecewise-cosine profile through (latitude, value) knots (sorted south → north). */
/**
 * The knots poleward of a hemisphere's first subpolar low (sgn: 1 north, −1 south; lo, its latitude; low, its
 * pressure): on Earth the polar high only; on a faster planet, whose Ferrel cells are narrower, further cells while
 * they fit — each a secondary high CIRC_POLAR_HPA above the low (an easterly band, as the polar easterlies), then a low
 * as deep, CIRC_FERREL_DEG on (the next jet).
 */
function extraCells(sgn, lo, low, P) {
    const out = [], F = P.CIRC_FERREL_DEG;
    for (let at = Math.abs(lo); at + F <= LAST_LOW_LAT && F < PARAMS.CIRC_FERREL_DEG; at += F) {
        out.push([sgn * (at + F / 2), low + P.CIRC_POLAR_HPA], [sgn * (at + F), low]);
    }
    out.push([sgn * 90, low + P.CIRC_POLAR_HPA]);
    return sgn > 0 ? out : out.reverse();
}

function profileAt(knots, lat) {
    for (let k = 1; k < knots.length; k++) {
        const [l0, v0] = knots[k - 1], [l1, v1] = knots[k];
        if (lat <= l1 || k === knots.length - 1) {
            const s = l1 > l0 ? Math.max(0, Math.min(1, (lat - l0) / (l1 - l0))) : 0;
            return v0 + (v1 - v0) * (1 - Math.cos(Math.PI * s)) / 2;
        }
    }
    return knots[knots.length - 1][1];
}

/** Equivalent potential temperature (K) of air at T (°C) and SEA_RH: T + L·q / c_p (its moist static energy / c_p). */
function thetaE(T) {
    const t = Math.max(-80, Math.min(50, T)), es = 6.112 * Math.exp(17.67 * t / (t + 243.5));      // hPa (Bolton 1980)
    return T + 273.15 + 2.5e6 * SEA_RH * 0.622 * es / 1013.25 / 1005;
}

/**
 * The ITCZ from the zonal mean θ_e by the sea (sm, rows north → south): its maximum at any latitude (parabolic
 * refinement within half a row), φ_m — as far from the equator as the angular momentum allows: an ITCZ moved off
 * the equator by heating there stays within φ_a = c_a (Ro_th / 2)^⅓, Ro_th = Bu·Δ_h·sin φ_m (Hill et al. 2021, 2022:
 * supercritical forcing), Δ_h the profile's fractional range. → { itcz (°), thetaA (θ_e there, K) }.
 */
function rising(g, sm, Bu) {
    const h = sm.length;
    let jBest = 0, lo = Infinity;
    for (let j = 0; j < h; j++) { if (sm[j] > sm[jBest]) jBest = j; lo = Math.min(lo, sm[j]); }
    let latM = g.lat[jBest];
    if (jBest > 0 && jBest < h - 1) {                             // (rows run north → south)
        const a = sm[jBest - 1], b = sm[jBest], c = sm[jBest + 1], den = a - 2 * b + c;
        if (den < 0) latM = g.lat[jBest] - g.step * Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den));
    }
    const hi = sm[jBest], dh = (hi - lo) / hi, roTh = Bu * dh * Math.abs(Math.sin(latM * DEG));
    const cap = HADLEY_CA * Math.cbrt(roTh / 2) / DEG;
    const itcz = Math.sign(latM) * Math.min(Math.abs(latM), cap);
    const y = Math.max(0, Math.min(h - 1, (90 - itcz) / g.step - 0.5)), j0 = Math.floor(y), f = y - j0;
    return { itcz, thetaA: sm[j0] * (1 - f) + sm[Math.min(h - 1, j0 + 1)] * f };
}

function smoothProfile(g, prof, sigmaDeg) {
    const h = g.h, out = new Float64Array(h), r = Math.ceil(2.5 * sigmaDeg / g.step);
    for (let j = 0; j < h; j++) {
        let s = 0, ws = 0;
        for (let d = -r; d <= r; d++) { const jj = j + d; if (jj < 0 || jj >= h) continue; const wt = Math.exp(-0.5 * (d * g.step / sigmaDeg) ** 2); s += prof[jj] * wt; ws += wt; }
        out[j] = s / ws;
    }
    return out;
}

/** Separable Gaussian smoothing on the sphere (σ in km): along latitude circles (wider in degrees toward the poles), then across. */
export function gaussianSmooth(g, f, tmp, sigmaKm) {
    const w = g.w, h = g.h, K = smoothKernels(g, sigmaKm);
    // along each latitude circle: the row padded by its own wrap on both sides, then for every cell the centre and each
    // pair of taps out to r, nearest first (the same sums, in the same order, as tap by tap with the wrap worked out)
    const row = K.row;
    for (let j = 0; j < h; j++) {
        const { r, wt, norm } = K.lon[j], o = j * w;
        for (let k = 0; k < w + 2 * r; k++) row[k] = f[o + (((k - r) % w) + w) % w];
        for (let i = 0; i < w; i++) {
            let s = row[i + r] * wt[0];
            for (let d = 1; d <= r; d++) s += (row[i + r + d] + row[i + r - d]) * wt[d];
            tmp[o + i] = s / norm;
        }
    }
    // across: each row from the rows within r, nearest the pole first (as before), a row at a time
    const { r, wLat } = K, acc = K.acc;
    for (let j = 0; j < h; j++) {
        let norm = 0;
        for (let d = -r; d <= r; d++) { const jj = j + d; if (jj >= 0 && jj < h) norm += wLat[d + r]; }
        acc.fill(0);
        for (let d = -r; d <= r; d++) {
            const jj = j + d; if (jj < 0 || jj >= h) continue;
            const wd = wLat[d + r], o = jj * w;
            for (let i = 0; i < w; i++) acc[i] += tmp[o + i] * wd;
        }
        for (let i = 0; i < w; i++) f[j * w + i] = acc[i] / norm;
    }
}

/** gaussianSmooth's weights, per grid and σ (the rows' along the circle, and across), built once. */
const kernelCache = new Map();
function smoothKernels(g, sigmaKm) {
    const key = `${g.step}|${g.w}|${g.h}|${g.radiusM}|${sigmaKm}`;
    let K = kernelCache.get(key);
    if (K) return K;
    const w = g.w, h = g.h, sigDeg = sigmaKm / (g.radiusM / 1000 * DEG), lon = [];
    let rMax = 0;
    for (let j = 0; j < h; j++) {
        const cl = Math.max(0.02, Math.cos(g.lat[j] * DEG));
        const sLon = Math.min(180, sigDeg / cl) / g.step;                      // σ in cells along the circle
        const r = Math.min(Math.floor(w / 2), Math.ceil(2.5 * sLon));
        const wt = new Float64Array(r + 1);
        let norm = 0;
        for (let d = 0; d <= r; d++) { wt[d] = Math.exp(-0.5 * (d / sLon) ** 2); norm += d ? 2 * wt[d] : wt[d]; }
        lon.push({ r, wt, norm }); rMax = Math.max(rMax, r);
    }
    const sLat = sigDeg / g.step, r = Math.ceil(2.5 * sLat);
    const wLat = new Float64Array(2 * r + 1);
    for (let d = -r; d <= r; d++) wLat[d + r] = Math.exp(-0.5 * (d / sLat) ** 2);
    K = { lon, r, wLat, row: new Float64Array(w + 2 * rMax), acc: new Float64Array(w) };
    if (kernelCache.size > 32) kernelCache.clear();
    kernelCache.set(key, K);
    return K;
}

function itczPerLongitude(g, cv, h, w, out, m, core, lo, hi) {
    const lat = new Float64Array(w);
    for (let i = 0; i < w; i++) {
        let best = -Infinity, bestLat = 0;
        for (let j = 0; j < h; j++) {
            if (g.lat[j] < lo || g.lat[j] > hi) continue;
            let s = 0, n = 0;
            for (let di = -5; di <= 5; di++) for (let dj = -1; dj <= 1; dj++) {
                const jj = j + dj; if (jj < 0 || jj >= h) continue;
                s += cv[jj * w + (i + di + w) % w]; n++;
            }
            if (s / n > best) { best = s / n; bestLat = g.lat[j]; }
        }
        lat[i] = bestLat;
    }
    // to the core grid's longitudes (nearest circulation column)
    for (let i = 0; i < core.w; i++) out[m * core.w + i] = lat[Math.min(w - 1, Math.floor(i * w / core.w))];
}

// Grid transfers (shared with the temperature stage)
const coarsen = (core, g, ratio, src) => coarsenField(core, g, ratio, src);
const refine = (g, core, ratio, src, out, offset) => refineField(g, core, ratio, src, out, offset);
