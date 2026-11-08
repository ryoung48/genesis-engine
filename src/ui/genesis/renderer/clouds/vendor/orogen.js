// Copyright (C) 2026 Robert Aguilar. GPL-3.0, see src/model/climatev2/vendor/LICENSE.
// Vendored from github.com/raguilar011095/planet_heightmap_generation@9432fa2b11d6058550fbc5eb0abdd986992739e4 v2/js/view/clouds.js.
// Adapted for Chaos Machine: flat climate input, live shader only, rounded cumulus and filtered frontal detail; the
// latitudes, pressures, radius and tropical storms are the planet's own (beltLatitude, slp as the anomaly from the
// planet's mean, radiusKm, the modeled cyclone risk).
export const CLOUDS = {
    sizeKm: 5400, stretch: 1.5, warp1: 0.7, warp2: 0.16, w0: 0.7, w1: 0.25, w2: 0.05, contrast: 1.4,
    edgeLow: 0.08, edgeConv: 0.065, edgeFront: 0.09, edgeCirrus: 0.08, veil: 0.16, veilWidth: 0.1, erosion: 0.45, detail: 4, sharp: 1.2,
    opLow: 0.78, opConv: 0.97, opFront: 0.92, opCirrus: 0.38, greyLow: 0.86, greyCirrus: 0.97, light: 0.3,
    billow: 0.7, relief: 0.55, thick: 0.14, thinOp: 0.68, thinGrey: 0.82, streakLat: [0.25, 18, 38],
    lowScale: 3.2, convScale: 2.6, cirrusScale: 1.7, streakFrontKm: 155, streakCirrusKm: 700, windFull: 6,
    shadow: 0.25, shadowKm: 30,
    // (each layer's noise's steepness — its 90 % quantile, noise units a radian, measured — so an edge is at least this × a
    // pixel wide: none sharper than about two pixels, however far out; up close each keeps its own width)
    aa: [22.6, 38.7, 30.8, 63.0],
    storms: 10, stormKm: 1100, stormTwist: 0.7, stormCover: 0.06, tropical: 3, tropicalTwist: 1.1,
    weatherScale: 0.11, weatherAmp: 0.45, streakVary: 0.45, cirrusWarp: 0.45, cirrusFine: 0.3,
    driftDegPerS: 0.25, evolve: 0.009, flowPeriod: 12, flowKm: 160, flowLat: [0.55, 1.35],
    QLow: [0.358, 0.437, 0.494, 0.553, 0.638], QConv: [0.36, 0.442, 0.5, 0.559, 0.64], QFront: [0.309, 0.442, 0.533, 0.626, 0.759], QCirrus: [0.362, 0.458, 0.525, 0.594, 0.689],
};

const NOISE_N = 64;
// (how far a cell's layers are scaled toward the climate's cover before the rest is made low cloud: 4×, so a rule's
// trace — a little cirrus — never stands in for a whole deck; and the cover the layers are held under, as cloudCut
// thins a layer's coverage only down to 5 % clear)
const MAX_LAYER_SCALE = 4, MAX_COVER = 0.95;
export const MAX_STORMS = 16;

const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// (the rules' latitudes are Earth's as climatev2 has it — the ITCZ at 0°, the subtropical highs at ±30°, the subpolar
// lows at ±65° (its Earth: highs 29–31°, lows 64–66°, seed 14963991) — and a planet's own are read through its belts,
// piecewise linear between them and on to the poles. A faster planet's further Ferrel cells (circulation.js extraLows:
// a low, a secondary high halfway, the next low) fold back over Earth's 65° → 30° → 65°, each with its own storm
// track; no belts (a locked planet): the latitude as it is)
const EARTH_HIGH = 30, EARTH_LOW = 65;
export const MAX_LOWS = 9;
const lowsOf = (b, n) => [n ? b.loN : b.loS, ...(n ? b.extraLowsN : b.extraLowsS)].slice(0, MAX_LOWS);
export function beltLatitude(lat, b) {
    if (!b) return lat;
    const n = lat >= b.itcz, s = n ? 1 : -1, d = s * lat, I = s * b.itcz, H = s * (n ? b.hiN : b.hiS), L = lowsOf(b, n).map(l => s * l);
    if (d <= H) return s * EARTH_HIGH * (d - I) / (H - I);
    if (d <= L[0]) return s * (EARTH_HIGH + (EARTH_LOW - EARTH_HIGH) * (d - H) / (L[0] - H));
    for (let k = 1; k < L.length; k++) {
        const mid = (L[k - 1] + L[k]) / 2;
        if (d <= mid) return s * (EARTH_LOW - (EARTH_LOW - EARTH_HIGH) * (d - L[k - 1]) / (mid - L[k - 1]));
        if (d <= L[k]) return s * (EARTH_HIGH + (EARTH_LOW - EARTH_HIGH) * (d - mid) / (L[k] - mid));
    }
    const last = L[L.length - 1];
    return s * (EARTH_LOW + (90 - EARTH_LOW) * (d - last) / (90 - last));
}
export function cloudBeltUniforms(b) {
    const n = b ? lowsOf(b, true) : [EARTH_LOW], so = b ? lowsOf(b, false) : [-EARTH_LOW];
    const lowsN = new Float32Array(MAX_LOWS), lowsS = new Float32Array(MAX_LOWS);
    lowsN.set(n); lowsS.set(so);
    return { itcz: b ? b.itcz : 0, high: [b ? b.hiN : EARTH_HIGH, b ? b.hiS : -EARTH_HIGH], lowsN, lowsS, lowCount: [n.length, so.length] };
}
// (the storm tracks, by Earth latitude: from the highs' poleward flank to past the subpolar lows)
const stormTrack = al => sm(28, 40, al) * (1 - sm(64, 76, al));

export function cloudFields({ P, T, slp: S, u: U, v: V, sstAnom: sa, seaIce: ice, sea, cloud, belts }) {
    const w = 360, h = 180, G = w * h;
    const L = [0, 1, 2, 3].map(() => new Float32Array(G)), wind = new Uint8Array(4 * G);
    if (P && T && S) {
        for (let j = 0; j < h; j++) {
            const al = Math.abs(beltLatitude(90 - (j + 0.5), belts));
            let zm = 0, zn = 0;
            for (let i = 0; i < w; i++) { const v = S[j * w + i]; if (v === v) { zm += v; zn++; } }
            zm = zn ? zm / zn : 0;
            // (no belts, no storm tracks: a locked planet's day-to-night flow has no baroclinic zone)
            const track = belts ? stormTrack(al) : 0;
            for (let i = 0; i < w; i++) {
                const c = j * w + i, p = Math.max(0, P[c] || 0), wet = 1 - Math.exp(-p / 100), t = T[c], isSea = sea ? sea[c] === 1 : false;
                // (the pressures against the planet's mean, Earth's 1011 hPa: 1014–1024 hPa is +3–13)
                const warm = sm(18, 26, t), highP = sm(3, 13, S[c]), lowP = sm(2, -8, S[c] - zm);
                // convective: the warm wet tropics; fair-weather cumulus over warm summer land
                const conv = Math.max(0.7 * warm * sm(0.45, 0.92, wet), isSea ? 0 : 0.3 * sm(14, 24, t) * sm(0.1, 0.45, wet));
                // frontal: the storm tracks (wetter, lower pressure, more), the cool rainy country elsewhere; less under highs
                const front = Math.max(0, track * (0.15 + 0.5 * wet + 0.45 * lowP) + (1 - track) * (1 - warm) * 0.45 * wet - 0.45 * highP);
                // low decks: cool upwelling seas under the subtropical highs; polar sea stratus
                const cool = sm(0, -4, sa[c]);
                const band = belts ? sm(8, 18, al) * (1 - sm(42, 55, al)) : 1;
                const deck = isSea ? cool * sm(-3, 7, S[c]) * band * sm(28, 18, t) : 0;
                const polar = isSea && belts ? 0.65 * sm(48, 62, al) * (1 - sm(0.5, 0.95, ice?.[c] ?? 0)) : 0;
                const low = Math.min(1, Math.max(deck, polar));
                // cirrus: the storm tracks' and the tropical anvils'; fewer under highs
                const cirr = Math.min(1, (0.02 + 0.4 * front + 0.4 * conv * warm) * (1 - 0.7 * highP));
                L[0][c] = low; L[1][c] = Math.min(1, conv); L[2][c] = Math.min(1, front); L[3][c] = cirr;
                const o = 4 * c;
                wind[o] = Math.round(Math.max(0, Math.min(255, 127.5 + 127.5 * (U?.[c] ?? 0) / 40))); wind[o + 1] = Math.round(Math.max(0, Math.min(255, 127.5 + 127.5 * (V?.[c] ?? 0) / 40)));
                wind[o + 3] = 255;
            }
        }
    }
    // (each smoothed — ±3°, the cirrus ±5° — so the climate's coasts and its 1° grid are not drawn in cloud)
    const tmp = new Float32Array(G), blur = (a, r) => {
        for (let pass = 0; pass < 2; pass++) {
            for (let j = 0; j < h; j++) { const cl = Math.max(0.2, Math.cos((90 - (j + 0.5)) * Math.PI / 180)), rx = Math.min(90, Math.round(r / cl)); for (let i = 0; i < w; i++) { let t = 0; for (let d = -rx; d <= rx; d++) t += a[j * w + ((i + d) % w + w) % w]; tmp[j * w + i] = t / (2 * rx + 1); } }
            for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) { let t = 0, n = 0; for (let d = -r; d <= r; d++) { const jj = j + d; if (jj < 0 || jj >= h) continue; t += tmp[jj * w + i]; n++; } a[j * w + i] = t / n; }
        }
    };
    blur(L[0], 3); blur(L[1], 3); blur(L[2], 3); blur(L[3], 5);
    // (how much is the climate's own cloud fraction; the rules above say only which kind: each cell's layers scaled
    // together, at most MAX_LAYER_SCALE×, until their union is the climate's cover — the shortfall, where the rules
    // have too little, as low broken cloud — so a locked planet's substellar deck and clear night side are the
    // climate's, and none of the rules' cool-sea decks under its cold dry night)
    if (cloud) {
        const want = Float32Array.from(cloud);
        blur(want, 3);
        const union = (c, k) => 1 - (1 - Math.min(1, k * L[0][c])) * (1 - Math.min(1, k * L[1][c])) * (1 - Math.min(1, k * L[2][c])) * (1 - Math.min(1, k * L[3][c]));
        for (let c = 0; c < G; c++) {
            const target = Math.max(0, Math.min(MAX_COVER, want[c]));
            let lo = 0, hi = MAX_LAYER_SCALE;
            if (union(c, hi) > target) for (let it = 0; it < 20; it++) { const mid = (lo + hi) / 2; if (union(c, mid) > target) hi = mid; else lo = mid; }
            for (let k = 0; k < 4; k++) L[k][c] = Math.min(1, hi * L[k][c]);
            const rest = (1 - L[1][c]) * (1 - L[2][c]) * (1 - L[3][c]);
            if (1 - (1 - L[0][c]) * rest < target) L[0][c] = 1 - (1 - target) / rest;
        }
    }
    const cover = new Uint8Array(4 * G);
    for (let c = 0; c < G; c++) for (let k = 0; k < 4; k++) cover[4 * c + k] = Math.round(255 * Math.max(0, Math.min(1, L[k][c])));
    return { w, h, cover, wind };
}

// ── the noise texture: tileable Perlin (gradient) and Worley (cellular) noise on an integer hash ──
function hash(x, y, z, s) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440670441) ^ Math.imul(s, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const wrap = (i, p) => ((i % p) + p) % p, lerp = (a, b, t) => a + (b - a) * t, fade = t => t * t * t * (t * (t * 6 - 15) + 10);
// (each lattice's random gradients and cell points worked out once — the same values, the hash not called per sample)
const latticeCache = new Map();
function lattice(kind, p, s) {
    const key = `${kind}|${p}|${s}`;
    let L = latticeCache.get(key);
    if (L) return L;
    L = new Float64Array(3 * p * p * p);
    for (let c = 0; c < p; c++) for (let b = 0; b < p; b++) for (let a = 0; a < p; a++) {
        const o = 3 * ((c * p + b) * p + a);
        if (kind === 'g') {
            const th = hash(a, b, c, s) * 6.283185, ph = Math.acos(2 * hash(a, b, c, s + 7) - 1);
            L[o] = Math.sin(ph) * Math.cos(th); L[o + 1] = Math.sin(ph) * Math.sin(th); L[o + 2] = Math.cos(ph);
        } else { L[o] = hash(a, b, c, s); L[o + 1] = hash(a, b, c, s + 1); L[o + 2] = hash(a, b, c, s + 2); }
    }
    latticeCache.set(key, L);
    return L;
}
function perlin(x, y, z, p, s) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z, G = lattice('g', p, s);
    const g = (i, j, k, dx, dy, dz) => { const o = 3 * ((wrap(k, p) * p + wrap(j, p)) * p + wrap(i, p)); return G[o] * dx + G[o + 1] * dy + G[o + 2] * dz; };
    const u = fade(fx), v = fade(fy), w = fade(fz);
    return lerp(lerp(lerp(g(X, Y, Z, fx, fy, fz), g(X + 1, Y, Z, fx - 1, fy, fz), u), lerp(g(X, Y + 1, Z, fx, fy - 1, fz), g(X + 1, Y + 1, Z, fx - 1, fy - 1, fz), u), v),
        lerp(lerp(g(X, Y, Z + 1, fx, fy, fz - 1), g(X + 1, Y, Z + 1, fx - 1, fy, fz - 1), u), lerp(g(X, Y + 1, Z + 1, fx, fy - 1, fz - 1), g(X + 1, Y + 1, Z + 1, fx - 1, fy - 1, fz - 1), u), v), w);
}
function worley(x, y, z, c, s) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), P = lattice('w', c, s);
    let best = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = X + i, cy = Y + j, cz = Z + k, o = 3 * ((wrap(cz, c) * c + wrap(cy, c)) * c + wrap(cx, c));
        const d = (cx + P[o] - x) ** 2 + (cy + P[o + 1] - y) ** 2 + (cz + P[o + 2] - z) ** 2;
        if (d < best) best = d;
    }
    return Math.max(0, 1 - Math.sqrt(best));
}
let noiseTex = null;

export function cloudNoiseTexture() {
    if (noiseTex) return noiseTex;
    const N = NOISE_N, out = new Uint8Array(N * N * N * 4), R = new Float32Array(N * N * N);
    // (each Worley fbm's octaves no finer than two texels a cell — a cell a texel is noise per texel, faceted where it is cut)
    const wfbm = (u, v, w, c) => {
        let s = 0.625 * worley(u * c, v * c, w * c, c, 11), t = 0.625;
        if (2 * c <= N / 2) { s += 0.25 * worley(u * 2 * c, v * 2 * c, w * 2 * c, 2 * c, 23); t += 0.25; }
        if (4 * c <= N / 2) { s += 0.125 * worley(u * 4 * c, v * 4 * c, w * 4 * c, 4 * c, 37); t += 0.125; }
        return s / t;
    };
    let mn = Infinity, mx = -Infinity;
    for (let z = 0, i = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++, i++) {
        const u = (x + 0.5) / N, v = (y + 0.5) / N, w = (z + 0.5) / N;
        let pf = 0, a = 1, t = 0;
        for (let o = 0, c = 4; o < 3; o++, c *= 2, a *= 0.6) { pf += a * perlin(u * c, v * c, w * c, c, 101 + o); t += a; }
        R[i] = pf / t; if (R[i] < mn) mn = R[i]; if (R[i] > mx) mx = R[i];
        out[4 * i + 1] = Math.round(255 * wfbm(u, v, w, 4)); out[4 * i + 2] = Math.round(255 * wfbm(u, v, w, 8)); out[4 * i + 3] = Math.round(255 * wfbm(u, v, w, 16));
    }
    for (let i = 0; i < R.length; i++) out[4 * i] = Math.round(255 * (R[i] - mn) / (mx - mn));
    noiseTex = { N, data: out };
    return noiseTex;
}

export function cloudStorms(seed, { slp: S, P, T: Ts, cyclone, belts }, K = CLOUDS) {
    const out = [], s0 = (seed | 0) ^ 0x5bd1e995, w = 360, h = 180;
    const at = (lat, lon) => { const d = Math.PI / 180; return [-Math.cos(lon * d + Math.PI) * Math.cos(lat * d), Math.sin(lat * d), Math.sin(lon * d + Math.PI) * Math.cos(lat * d)]; };
    const far = (lat, lon, deg) => out.every(s => { const p = at(lat, lon); return Math.acos(Math.min(1, p[0] * s[0] + p[1] * s[1] + p[2] * s[2])) * 180 / Math.PI > deg; });
    if (S && belts) {
        // (the lows: local minima against the row's mean, deepest first)
        const zm = new Float32Array(h);
        for (let j = 0; j < h; j++) { let t = 0; for (let i = 0; i < w; i++) t += S[j * w + i]; zm[j] = t / w; }
        const lows = [];
        for (let j = 0; j < h; j++) {
            const lat = 90 - (j + 0.5), al = Math.abs(beltLatitude(lat, belts));
            if (al < 35 || al > 68) continue;
            for (let i = 0; i < w; i += 2) {
                const v = S[j * w + i] - zm[j];
                if (v > -2) continue;
                let min = true;
                for (let dj = -5; dj <= 5 && min; dj++) for (let di = -8; di <= 8; di++) { const jj = j + dj; if (jj < 0 || jj >= h) continue; if (S[jj * w + ((i + di) % w + w) % w] - zm[jj] < v) { min = false; break; } }
                if (min) lows.push([v, lat, i + 0.5 - 180]);
            }
        }
        lows.sort((a, b) => a[0] - b[0]);
        for (const [v, lat, lon] of lows) {
            if (out.length >= Math.ceil(K.storms / 2)) break;
            if (!far(lat, lon, 18)) continue;
            out.push([...at(lat, lon), Math.sign(lat) * Math.min(1, 0.5 + 0.06 * -v), 1.1 + 0.4 * hash(out.length, 3, 7, s0)]);
        }
    }
    // (more along the tracks, where wet and low — from the seed: equal-area tries, each kept with its track's weight,
    // so a faster planet's further cells have theirs)
    for (let k = 0; belts && out.length < K.storms && k < 2000; k++) {
        const lat = Math.asin(2 * hash(k, 3, 5, s0) - 1) * 180 / Math.PI, north = lat >= 0, lon = hash(k, 7, 9, s0) * 360 - 180;
        if (hash(k, 1, 2, s0) >= stormTrack(Math.abs(beltLatitude(lat, belts)))) continue;
        if (P) { const c = Math.min(h - 1, Math.floor(90 - lat)) * w + Math.min(w - 1, Math.floor(lon + 180)); if (hash(k, 21, 23, s0) > 0.25 + 0.75 * (1 - Math.exp(-(P[c] || 0) / 60))) continue; }
        if (!far(lat, lon, 16)) continue;
        out.push([...at(lat, lon), (north ? 1 : -1) * (0.35 + 0.55 * hash(k, 11, 13, s0) ** 1.5), 0.6 + 0.7 * hash(k, 17, 19, s0)]);
    }
    // (tropical cyclones where the climate's cyclone risk has them — its own Coriolis, ITCZ and SST rules — the
    // month's sea at least 27 °C, near Gray's 26.5 °C (1968): equal-area tries, each kept with the cell's risk)
    let tc = 0;
    for (let k = 0; tc < K.tropical && k < 4000 && Ts && cyclone; k++) {
        const lat = Math.asin(2 * hash(k, 33, 5, s0) - 1) * 180 / Math.PI, north = lat >= 0, lon = hash(k, 37, 9, s0) * 360 - 180;
        const c = Math.min(h - 1, Math.floor(90 - lat)) * w + Math.min(w - 1, Math.floor(lon + 180));
        if (!(hash(k, 31, 2, s0) < cyclone[c]) || !(Ts[c] >= 27) || !far(lat, lon, 12) || out.length >= MAX_STORMS) continue;
        out.push([...at(lat, lon), (north ? 1 : -1) * (0.8 + 0.2 * hash(k, 41, 13, s0)), 0.32 + 0.12 * hash(k, 43, 19, s0)]);
        tc++;
    }
    return out.slice(0, MAX_STORMS);
}

export const CLOUD_GLSL = `
#if __VERSION__ >= 300
uniform highp sampler3D uCloudNoise; uniform sampler2D uCloudCover, uCloudWind;
uniform float uCloudScale, uCloudStretch, uCloudWarp1, uCloudWarp2, uCloudW0, uCloudW1, uCloudW2, uCloudContrast;
uniform vec4 uCloudAA; uniform float uCloudEdge[4], uCloudQ[20], uCloudVeil, uCloudVeilWidth, uCloudErosion, uCloudDetail, uCloudSharp;
uniform float uCloudLowScale, uCloudConvScale, uCloudCirrusScale, uCloudStreakFront, uCloudStreakCirrus, uCloudWindFull;
uniform float uCloudTime, uCloudDrift, uCloudEvolve, uCloudFlowPeriod, uCloudFlowKm, uCloudStormKm, uCloudStormTwist, uCloudStormCover, uCloudTropicalTwist;
uniform vec2 uCloudFlowLat, uCloudHigh; uniform float uCloudItcz, uCloudZonal, uCloudRadiusKm, uCloudLowsN[${MAX_LOWS}], uCloudLowsS[${MAX_LOWS}]; uniform ivec2 uCloudLowCount; uniform vec3 uCloudStreakLat, uCloudSeason; uniform float uCloudCirrusWarp, uCloudCirrusFine; uniform float uCloudWeatherScale, uCloudWeatherAmp, uCloudStreakVary; uniform float uCloudBillow, uCloudRelief, uCloudThick, uCloudThinOp, uCloudThinGrey;

// (beltLatitude: uCloudHigh the highs', uCloudLowsN/S each hemisphere's lows' latitudes)
float cloudBeltLat(float lat) {
    const float EH = ${EARTH_HIGH.toFixed(1)}, EL = ${EARTH_LOW.toFixed(1)};
    bool n = lat >= uCloudItcz; float s = n ? 1.0 : -1.0, d = s * lat, I = s * uCloudItcz, H = s * (n ? uCloudHigh.x : uCloudHigh.y);
    int count = n ? uCloudLowCount.x : uCloudLowCount.y;
    if (d <= H) return s * EH * (d - I) / (H - I);
    float prev = s * (n ? uCloudLowsN[0] : uCloudLowsS[0]);
    if (d <= prev) return s * (EH + (EL - EH) * (d - H) / (prev - H));
    for (int k = 1; k < ${MAX_LOWS}; k++) {
        if (k >= count) break;
        float L = s * (n ? uCloudLowsN[k] : uCloudLowsS[k]), mid = 0.5 * (prev + L);
        if (d <= mid) return s * (EL - (EL - EH) * (d - prev) / (mid - prev));
        if (d <= L) return s * (EH + (EL - EH) * (d - mid) / (L - mid));
        prev = L;
    }
    return s * (EL + (90.0 - EL) * (d - prev) / (90.0 - prev));
}
float cloudDriftRate(float lat) {
    float d = cloudBeltLat(degrees(lat)), v = -0.55 * exp(-(d / 20.0) * (d / 20.0)) + 0.95 * exp(-((abs(d) - 52.0) / 22.0) * ((abs(d) - 52.0) / 22.0));
    return uCloudZonal * v / max(cos(lat), 0.2);
}
uniform vec4 uCloudStorm[${MAX_STORMS}]; uniform float uCloudStormSize[${MAX_STORMS}]; uniform int uCloudStorms;
const mat3 cloudM3 = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
vec4 cloudN(vec3 p) { return textureLod(uCloudNoise, p, 0.0); }
float cloudR(vec3 p) { return cloudN(p).r; }
float cloudNoiseLod(float texelsPerPixel) { return log2(max(1.0, texelsPerPixel)); }
vec3 cloudV3(vec3 a, vec3 o) { return vec3(cloudR(a + o), cloudR(a.yzx + o.yzx), cloudR(a.zxy + o.zxy)) - 0.5; }

float cloudCut(int k, float c) {
    float u = clamp(1.0 - c, 0.05, 1.0);
    float a = uCloudQ[5 * k], b = uCloudQ[5 * k + 1], m = uCloudQ[5 * k + 2], d = uCloudQ[5 * k + 3], e = uCloudQ[5 * k + 4];
    return u < 0.25 ? mix(a, b, (u - 0.05) / 0.2) : u < 0.5 ? mix(b, m, (u - 0.25) / 0.25) : u < 0.75 ? mix(m, d, (u - 0.5) / 0.25) : u < 0.95 ? mix(d, e, (u - 0.75) / 0.2) : mix(e, e + 2.0 * (e - d), (u - 0.95) / 0.05);
}
float cloudStep(float n, float cut, float e) { float t = clamp((n - (cut - e)) / (2.0 * e), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

vec3 cloudPoint(vec2 uv) {
    float phi = uv.x * 6.283185307, th = 3.141592654 * (1.0 - uv.y);
    return vec3(-cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
}

vec4 cloudRaw(vec3 q0, vec3 r, vec3 Wq, float ss, float px, float tm, vec4 need, float fast, vec2 puffWeights, vec3 puffLightStep, out vec3 wOut, out vec2 puffOut) {
    float sc = uCloudScale, N = float(textureSize(uCloudNoise, 0).x), ev = tm * uCloudEvolve;
    vec3 w = q0 + uCloudWarp2 * r + ev * vec3(0.15, -0.1, 0.3);
    wOut = w;
    puffOut = vec2(0.0);
    // (only the layers with cover here — the rest are clear; a shadow's pass, fast, without the wind's smear)
    float nF = 0.0, nL = 0.0, nC = 0.0, nR = 0.0;
    if (need.z > 0.5) {
        vec3 sf = Wq * (uCloudStreakFront / uCloudRadiusKm) * 0.5;
        float n = uCloudW0 * (fast > 0.5 ? cloudR(w * 0.5) : 0.25 * cloudR(w * 0.5 - sf) + 0.5 * cloudR(w * 0.5) + 0.25 * cloudR(w * 0.5 + sf));
        vec3 a1 = cloudM3 * w * 1.03; n += uCloudW1 * cloudR(a1 + vec3(0.4, 0.0, 0.0));
        vec3 a2 = cloudM3 * w * 2.07;
        float fineFootprint = px * sc * N * 2.07;
        float fine = textureLod(uCloudNoise, a2.yzx + vec3(0.7, 0.0, 0.0), max(1.0, cloudNoiseLod(fineFootprint))).r;
        n += uCloudW2 * mix(fine, 0.5, smoothstep(0.5, 1.5, fineFootprint));
        float ws = uCloudW0 + uCloudW1 + uCloudW2; nF = 0.5 + (n - 0.5 * ws) / ws * uCloudContrast;
    }
    if (need.x > 0.5) {
    vec3 ql = q0 * uCloudLowScale + 0.3 * r;
    float fl = clamp(px * sc * N * uCloudLowScale * 0.5 - 0.5, 0.0, 1.0);
    nL = 0.6 * mix(cloudN(ql * 0.5 + vec3(0.21, 0.0, 0.0)).b, 0.48, fl) + 0.4 * cloudR(q0 * 0.7 + vec3(0.5, 0.13, 0.0) + 0.5 * ev * vec3(0.3, 0.0, 0.4));
    }
    if (need.y > 0.5) {
        // Gentle warping keeps the coarse cells rounded as the view gets closer.
        vec3 qc = q0 * (uCloudConvScale * 0.5) + 0.12 * r + vec3(0.0, 0.37, 0.0) + 1.5 * ev * vec3(0.0, 0.3, 0.2);
        vec2 cells = cloudN(qc).gb;
        puffOut.x = dot(cells - 0.48, puffWeights);
        nC = 0.55 * (0.48 + puffOut.x) + 0.45 * cloudR(q0 * 0.9 + vec3(0.0, 0.0, 0.61) + ev * vec3(-0.3, 0.2, 0.0));
        if (dot(puffLightStep, puffLightStep) > 0.0) {
            puffOut.y = dot(cells - cloudN(qc + puffLightStep).gb, puffWeights);
        }
    }
    if (need.w > 0.5) {
    vec3 qr = (q0 + uCloudCirrusWarp * r) * uCloudCirrusScale + vec3(0.77, 0.0, 0.33) + ev * vec3(0.2, 0.3, -0.2), sr = Wq * uCloudCirrusScale * (uCloudStreakCirrus / uCloudRadiusKm) * 0.25;
    // (three taps along the wind, half again as far apart as five were: the same streaks' length)
    for (int k = -1; k <= 1; k++) nR += (1.0 - uCloudCirrusFine) * cloudR(qr + float(k) * 1.6 * sr) + uCloudCirrusFine * cloudR(qr * 2.3 + vec3(0.13, 0.57, 0.0) + float(k) * 1.6 * sr * 2.3);
    nR = 0.5 + (nR / 3.0 - 0.5) * (1.0 + 0.8 * ss);
    }
    return vec4(nL, nC, nF, nR);
}

vec4 cloudLayers(vec3 p, vec2 uv, float px, float fast, float lit, out float veil, out vec3 look) {
    vec4 cv = texture(uCloudCover, vec2(uv.x, 1.0 - uv.y)), wd = texture(uCloudWind, vec2(uv.x, 1.0 - uv.y));
    vec3 east = normalize(vec3(p.z + 1e-6, 0.0, -p.x)), north = cross(p, east);
    vec2 uvw = (wd.rg - 0.5) * 80.0;
    float speed = length(uvw);
    vec3 W = speed > 1e-3 ? (uvw.x * east + uvw.y * north) / speed : east, Lt = normalize(north - east);
    float lat = asin(clamp(p.y, -1.0, 1.0)), beltLat = abs(cloudBeltLat(degrees(lat)));
    // (smeared along the wind: the jets' streets toward the mid-latitudes, broken cells — not ribbons — in the trades)
    float ss = smoothstep(0.5, uCloudWindFull, speed) * mix(uCloudStreakLat.x, 1.0, smoothstep(uCloudStreakLat.y, uCloudStreakLat.z, beltLat));
    float flowLat = mix(uCloudFlowLat.x, uCloudFlowLat.y, smoothstep(10.0, 45.0, beltLat));
    // (the storms: the point turned about each centre, more the nearer — Rodrigues' rotation — and cloudier there)
    for (int i = 0; i < ${MAX_STORMS}; i++) {
        if (i >= uCloudStorms) break;
        // (each storm where the drift has carried it — cloudStormsAt, on the CPU once a frame)
        // (its reach 2.2 of its sizes — the largest's ~33°: past it, none; its turn and cloud fading to nothing there)
        vec3 C = uCloudStorm[i].xyz; float dt = dot(C, p);
        if (dt < 0.83) continue;
        float r = acos(min(1.0, dt)) / (uCloudStormKm * uCloudStormSize[i] / uCloudRadiusKm);
        if (r > 2.2) continue;
        float g = (exp(-r * r) - 7.907e-3) / (1.0 - 7.907e-3), th = uCloudStorm[i].w * g * (uCloudStormSize[i] < 0.6 ? uCloudTropicalTwist : uCloudStormTwist), co = cos(th), si = sin(th);
        p = p * co + cross(C, p) * si + C * dt * (1.0 - co);
        float boost = uCloudStormCover * abs(uCloudStorm[i].w) * g;
        if (uCloudStormSize[i] < 0.6) cv.g = min(1.0, cv.g + 3.0 * boost); else cv.b = min(1.0, cv.b + boost);
        cv.a = min(1.0, cv.a + 0.5 * boost); ss *= 1.0 - g;
    }
    float sc = uCloudScale;
    vec3 q0 = vec3(p.x, p.y * uCloudStretch, p.z) * sc + uCloudSeason;
    // (the weather: whole regions cloudier or clearer, and streakier or not — the noise far larger, slowly evolving)
    vec3 qw = q0 * uCloudWeatherScale + uCloudTime * uCloudEvolve * vec3(0.12, 0.05, -0.08);
    float wk = clamp((cloudR(qw + vec3(0.57, 0.11, 0.39)) - 0.5) * 2.5, -1.0, 1.0), wk2 = clamp((cloudR(qw * 1.7 + vec3(0.31, 0.83, 0.07)) - 0.5) * 2.5, -1.0, 1.0);
    cv = clamp(cv * (1.0 + uCloudWeatherAmp * wk), 0.0, 1.0);
    ss *= 1.0 - uCloudStreakVary * (1.0 - smoothstep(-0.4, 0.4, wk2));
    // (the layers with cover here — none: clear sky, nothing more to work out; a shadow's pass without the cirrus)
    vec4 need = step(vec4(0.01), cv) * vec4(1.0, 1.0, 1.0, 1.0 - fast), fadeOut = smoothstep(vec4(0.01), vec4(0.04), cv);
    veil = 0.0; look = vec3(1.0, 0.0, 1.0);
    if (need.x + need.y + need.z + need.w < 0.5) return vec4(0.0);
    vec3 Wn = vec3(W.x, W.y * uCloudStretch, W.z) * sc, Wq = Wn * ss;
    // (the flow: each phase's pattern carried along the wind for a period, the two half a period apart and cross-faded —
    // smoothly, sin²; each period a fresh place in the noise (no pattern comes round again), entered and left unseen)
    float ph = uCloudTime / uCloudFlowPeriod, ca = floor(ph), cb = floor(ph + 0.5), fa = ph - ca, fb = ph + 0.5 - cb;
    float wa = sin(3.141592654 * fa); wa *= wa; float wb = 1.0 - wa;
    vec3 oa = fract(ca * vec3(0.7548776662, 0.5698402910, 0.4142135624)), ob = fract(cb * vec3(0.7548776662, 0.5698402910, 0.4142135624));
    // (the flow's way and distance a period: the climate's wind, and the drift east or west by latitude — reset each
    // period like the wind's, so it never shears the clouds into threads as a turn by latitude did)
    // (the warp of a warp, once — both phases flow through it)
    float ev0 = uCloudTime * uCloudEvolve;
    vec3 wq = cloudV3(q0 * 0.5 + ev0 * vec3(0.6, 0.2, -0.3), vec3(0.11, 0.53, 0.77));
    vec3 wr = cloudV3(q0 * 0.5 + uCloudWarp1 * wq + ev0 * vec3(-0.4, 0.5, 0.25), vec3(0.29, 0.91, 0.37));
    vec3 L = Wn * speed * flowLat * (uCloudFlowKm / uCloudRadiusKm) + vec3(east.x, east.y * uCloudStretch, east.z) * sc * (uCloudDrift * cloudDriftRate(lat) * cos(lat) * uCloudFlowPeriod), wA = vec3(0.0), wB = vec3(0.0);
    // Filter the two cellular scales independently as their lobes approach pixel size.
    vec2 puffFades = 1.0 - smoothstep(vec2(0.2), vec2(0.55), (px * sc * uCloudConvScale * 0.5) * vec2(4.0, 8.0));
    vec2 puffWeights = vec2(0.78, 0.22) * puffFades;
    vec3 lightDir = normalize(vec3(Lt.x, Lt.y * uCloudStretch, Lt.z));
    vec3 puffLightStep = lit > 0.5 && puffFades.x > 0.0 ? lightDir * 0.02 : vec3(0.0);
    vec2 puffA = vec2(0.0), puffB = vec2(0.0);
    vec4 nA = vec4(0.0), nB = vec4(0.0);
    if (wa > 0.001) nA = cloudRaw(q0 + oa - L * (fa - 0.5), wr, Wq, ss, px, uCloudTime, need, fast, puffWeights, puffLightStep, wA, puffA);
    if (wb > 0.001) nB = cloudRaw(q0 + ob - L * (fb - 0.5), wr, Wq, ss, px, uCloudTime, need, fast, puffWeights, puffLightStep, wB, puffB);
    vec4 med = vec4(uCloudQ[2], uCloudQ[7], uCloudQ[12], uCloudQ[17]);
    float nw = sqrt(wa * wa + wb * wb);
    vec4 n = med + (wa * nA + wb * nB - med) / nw;
    // (each layer cut by its cover; the frontal one crisp, a veil under it, its edges eroded)
    // (each edge its own width, or about two pixels where that is sharper)
    vec4 eW = max(vec4(uCloudEdge[0], uCloudEdge[1], uCloudEdge[2], uCloudEdge[3]), uCloudAA * px);
    float cut = cloudCut(2, cv.b), dF = need.z * fadeOut.z * cloudStep(n.z, cut, eW.z);
    float tv = clamp((n.z - (cut - uCloudVeilWidth)) / uCloudVeilWidth, 0.0, 1.0);
    veil = fast > 0.5 ? 0.0 : uCloudVeil * tv * tv * fadeOut.z;
    float cutC = cloudCut(1, cv.g), dC = need.y * fadeOut.y * cloudStep(n.y, cutC, eW.y);
    vec4 dens = vec4(need.x * fadeOut.x * cloudStep(n.x, cloudCut(0, cv.r), eW.x), dC, pow(dF, uCloudSharp), need.w * fadeOut.w * cloudStep(n.w, cloudCut(3, cv.a), eW.w));
    if (dC > 0.0) {
        vec2 puff = (wa * puffA + wb * puffB) / nw;
        float gap = 1.0 - smoothstep(-0.16, 0.16, puff.x);
        float erosion = 0.28 * gap * puffFades.x * (1.0 - dC);
        dC = clamp((dC - erosion) / (1.0 - erosion), 0.0, 1.0);
        look.z += uCloudRelief * 4.0 * puff.y;
        dens.y = dC;
    }
    if (fast > 0.5) return dens;
    look.y = smoothstep(cutC, cutC + uCloudThick, n.y) * step(0.001, dC);
    if (dF <= 0.0) return dens;

    // Average the frontal relief over neighboring texels so tiny curls don't dominate at close zoom.
    float N = float(textureSize(uCloudNoise, 0).x), D = uCloudDetail * 0.5;
    float footprint = px * sc * N * D;
    float lod = max(1.5, cloudNoiseLod(footprint));
    float fe = smoothstep(0.5, 1.5, footprint);
    vec3 lq = lightDir * (0.25 / (16.0 * D));
    vec3 weights = vec3(0.625, 0.25, 0.125);
    vec2 billow = vec2(0.45);
    for (int phase = 0; phase < 2; phase++) {
        float weight = phase == 0 ? wa : wb;
        if (weight <= 0.02) continue;
        vec3 q = (phase == 0 ? wA : wB) * D;
        float density = dot(textureLod(uCloudNoise, q, lod).gba, weights);
        float litDensity = lit > 0.5 ? dot(textureLod(uCloudNoise, q + lq * D, lod).gba, weights) : density;
        billow += (vec2(density, litDensity) - 0.45) * (weight / nw);
    }
    vec2 filteredBillow = mix(clamp(billow, 0.0, 1.0), vec2(0.45), fe);
    if (dF > 0.0 && dF < 1.0) {
        float k = mix(filteredBillow.x, 1.0 - filteredBillow.x, uCloudBillow) * uCloudErosion * (1.0 - dF);
        dF = clamp((dF - k) / (1.0 - k + 1e-6), 0.0, 1.0);
    }
    dF = pow(dF, uCloudSharp);
    // (how thick: past its cut — thin edges, dense cores; and the relief's light)
    look.x += uCloudRelief * (filteredBillow.x - filteredBillow.y) * 4.0 * (1.0 - fe);
    look.y = max(look.y, smoothstep(cut, cut + uCloudThick, n.z) * step(0.001, dF));
    dens.z = dF;
    return dens;
}

vec3 cloudTowardLight(vec3 p, float stepL) {
    vec3 e = normalize(vec3(p.z + 1e-6, 0.0, -p.x)), n = cross(p, e);
    return normalize(p + stepL * normalize(n - e));
}

vec4 cloudColour(vec3 p, vec2 uv, float px, vec4 op, vec2 grey, float light, float lit) {
    float veil; vec3 look; vec4 d = cloudLayers(p, uv, px, 0.0, lit, veil, look);
    float th = look.y, aL = op.x * d.x, aC = op.y * d.y * (uCloudThinOp + (1.0 - uCloudThinOp) * th), aF = min(1.0, op.z * d.z * (uCloudThinOp + (1.0 - uCloudThinOp) * th) + veil * (1.0 - d.z)), aR = op.w * d.w;
    if (aL + aC + aF + aR <= 0.0) return vec4(0.0);
    float relief = mix(look.x, look.z, aC / max(aC + aF, 1e-4));
    float aM = max(aC, aF), gM = (uCloudThinGrey + (1.0 - uCloudThinGrey) * th) * clamp(relief, 1.0 - light, 1.0 + 0.5 * light);
    float pr = grey.x * aL, A = aL;
    pr = gM * aM + pr * (1.0 - aM); A = aM + A * (1.0 - aM);
    pr = grey.y * aR + pr * (1.0 - aR); A = aR + A * (1.0 - aR);
    float g = pr / max(A, 1e-4);
    return vec4(g, g, min(1.0, g * 1.02), A);
}

float cloudShade(vec3 p, vec2 uv, float px) { float v; vec3 l; vec4 d = cloudLayers(p, uv, px, 1.0, 0.0, v, l); return max(max(d.y, d.z), 0.7 * d.x); }
#endif
`;

export function cloudStormsAt(S, t, belts, K = CLOUDS) {
    return S.map(([x, y, z, s, sz]) => { const a = -t * driftRadPerS(K) * cloudDriftRate(Math.asin(Math.max(-1, Math.min(1, y))), belts), c = Math.cos(a), n = Math.sin(a); return [c * x - n * z, y, n * x + c * z, s, sz]; });
}

function cloudDriftRate(lat, belts) {
    if (!belts) return 0;
    const d = beltLatitude(lat * 180 / Math.PI, belts), v = -0.55 * Math.exp(-((d / 20) ** 2)) + 0.95 * Math.exp(-(((Math.abs(d) - 52) / 22) ** 2));
    return v / Math.max(Math.cos(lat), 0.2);
}

export const scaleOf = (radiusKm, K = CLOUDS) => 2 * radiusKm / K.sizeKm;
export const driftRadPerS = (K = CLOUDS) => K.driftDegPerS * Math.PI / 180;

export const cloudEdges = (K = CLOUDS) => [K.edgeLow, K.edgeConv, K.edgeFront, K.edgeCirrus];
export const cloudQuantileList = (K = CLOUDS) => [...K.QLow, ...K.QConv, ...K.QFront, ...K.QCirrus];
