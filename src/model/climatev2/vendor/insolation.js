// Vendored from github.com/raguilar011095/planet_heightmap_generation@47edc28acc17719b6bed03e211d20eb87441c2be v2/js/climate/insolation.js (GPL-3.0, see LICENSE). Modified in chaos-machine: an eccentric orbit, the planet's rotation and the length of its year (orbitOf, sunAt); Earth's rotation and year and a circular orbit compute exactly what the original did.
// Sunlight at the top of the atmosphere: daily-mean insolation by latitude and time of year, for any axial tilt
// and orbital eccentricity. DOM-free.
//
// Calendar: t in months from the start of the month after the northern winter solstice (Earth: 1 January); month m
// is centred on t = m + 0.5. The northern spring equinox falls at t = 2.63 (Earth: 20 March).

export const SOLAR_CONSTANT = 1361;          // W/m²
export const EQUINOX_MONTH = 2.63;

/** Daily-mean insolation (W/m²) at latitude φ (radians) when the solar declination is δ (radians). */
export function dailyInsolation(phi, delta, S0 = SOLAR_CONSTANT) {
    const x = -Math.tan(phi) * Math.tan(delta);
    const h0 = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x);           // hour angle of sunset (polar night / day)
    return (S0 / Math.PI) * (h0 * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(h0));
}

/** Solar declination (radians) at time t (months), for axial tilt in degrees. */
export function declination(t, tiltDeg) {
    const L = 2 * Math.PI * (t - EQUINOX_MONTH) / 12;                    // solar longitude
    return Math.asin(Math.sin(tiltDeg * Math.PI / 180) * Math.sin(L));
}

/**
 * Insolation per latitude row at NT evenly spaced times of year (t_k = 12·k / NT months).
 * @param {Float64Array} latDeg  row latitudes
 * @returns {Float64Array} NT × rows, time-major
 */
/**
 * The day's mean cosine of the sun's zenith angle at latitude φ, weighted by the sunlight (radians; 0 in the polar
 * night): ∫cos²z dt / ∫cos z dt over the daylight — the average that keeps the absorbed sunlight right (Cronin 2014).
 */
export function dailyMeanCosZenith(phi, delta) {
    const A = Math.sin(phi) * Math.sin(delta), B = Math.cos(phi) * Math.cos(delta), x = -Math.tan(phi) * Math.tan(delta);
    const h0 = x >= 1 ? 0 : x <= -1 ? Math.PI : Math.acos(x);
    const q = A * h0 + B * Math.sin(h0), q2 = A * A * h0 + 2 * A * B * Math.sin(h0) + B * B * (h0 / 2 + Math.sin(2 * h0) / 4);
    return q > 1e-9 ? q2 / q : 0;
}

/** dailyMeanCosZenith per latitude row at NT evenly spaced times of year (as insolationTable). */
export function zenithTable(latDeg, orbit, NT = 24) {
    const rows = latDeg.length, out = new Float64Array(NT * rows);
    for (let k = 0; k < NT; k++) {
        const sun = sunAt(12 * k / NT, orbit);
        for (let j = 0; j < rows; j++) out[k * rows + j] = dailyMeanCosZenith(latDeg[j] * Math.PI / 180, sun.delta);
    }
    return out;
}

export function insolationTable(latDeg, orbit, NT = 24) {
    const rows = latDeg.length, out = new Float64Array(NT * rows);
    for (let k = 0; k < NT; k++) {
        const sun = sunAt(12 * k / NT, orbit);
        for (let j = 0; j < rows; j++) out[k * rows + j] = dailyInsolation(latDeg[j] * Math.PI / 180, sun.delta, sun.s0);
    }
    return out;
}

const DEG = Math.PI / 180;
const monthlyAt = (values, t) => { const pos = t - 0.5, m0 = Math.floor(pos), f = pos - m0, a = ((m0 % 12) + 12) % 12, b = (a + 1) % 12; return values[a] * (1 - f) + values[b] * f; };

/**
 * Sunlight on a planet locked to its star (orbit.locked: substellarLon °, and libration, declination (radians) and flux
 * (W/m²) by month): at time t (months), each cell's instantaneous flux S·max(0, cos θ) (θ, its angle from the
 * substellar point) into q, and cos θ itself into mu. Row-major over the latitude and longitude rows given.
 */
export function lockedSunAt(latDeg, lonDeg, orbit, t, q, mu) {
    const L = orbit.locked, lon = L.substellarLon * DEG + monthlyAt(L.libration, t), dec = monthlyAt(L.declination, t), s0 = monthlyAt(L.flux, t);
    const sx = Math.cos(dec) * Math.cos(lon), sy = Math.cos(dec) * Math.sin(lon), sz = Math.sin(dec), w = lonDeg.length;
    for (let j = 0; j < latDeg.length; j++) {
        const cl = Math.cos(latDeg[j] * DEG), sl = Math.sin(latDeg[j] * DEG);
        for (let i = 0; i < w; i++) {
            const c = Math.max(0, cl * Math.cos(lonDeg[i] * DEG) * sx + cl * Math.sin(lonDeg[i] * DEG) * sy + sl * sz);
            q[j * w + i] = s0 * c;
            if (mu) mu[j * w + i] = c;
        }
    }
}

/** lockedSunAt at NT evenly spaced times of year: { q, mu }, each NT × cells, time-major. */
export function lockedTables(latDeg, lonDeg, orbit, NT = 24) {
    const cells = latDeg.length * lonDeg.length, q = new Float64Array(NT * cells), mu = new Float64Array(NT * cells);
    for (let k = 0; k < NT; k++) lockedSunAt(latDeg, lonDeg, orbit, 12 * k / NT, q.subarray(k * cells, (k + 1) * cells), mu.subarray(k * cells, (k + 1) * cells));
    return { q, mu };
}

export const EARTH_ROTATION = 7.292e-5;      // s⁻¹, Earth's (sidereal) rotation

/**
 * The orbit and spin from the climate options: tiltDeg (axial tilt, °); eccentricity; perihelion (°), the solar
 * longitude at aphelion, i.e. the solar longitude at perihelion − 180 (Earth: 102.9, perihelion on 3 January);
 * rotationRateRadS (sidereal, s⁻¹); yearScale, the year's length in seconds relative to Earth's; solarDayScale, the
 * solar day (sunrise to sunrise) relative to Earth's; sunScale, the sunlight at the semi-major axis relative to Earth's (the star's
 * luminosity over the distance squared, against Sol's at 1 AU); pressureScale, the surface pressure relative to Earth's.
 */
export function orbitOf(options) {
    return {
        tiltDeg: options?.tiltDeg ?? 23.44, eccentricity: options?.eccentricity ?? 0, perihelion: options?.perihelion ?? 102.94719,
        rotation: options?.rotationRateRadS ?? EARTH_ROTATION, yearScale: options?.yearScale ?? 1, solarDayScale: options?.solarDayScale ?? 1,
        sunScale: options?.sunScale ?? 1, radiusScale: options?.radiusScale ?? 1, gravityScale: options?.gravityScale ?? 1,
        pressureScale: options?.pressureScale ?? 1, locked: options?.locked ?? null,
    };
}

/**
 * The solar declination δ (radians) and the sunlight at the planet's distance s0 (W/m²) at time t (months). Time runs
 * evenly in mean anomaly (Kepler's second law) from the northern spring equinox at EQUINOX_MONTH; the semi-major
 * axis receives SOLAR_CONSTANT × sunScale.
 */
export function sunAt(t, orbit) {
    const e = orbit.eccentricity;
    if (!(e > 0)) return { delta: declination(t, orbit.tiltDeg), s0: SOLAR_CONSTANT * orbit.sunScale };
    const lp = (orbit.perihelion + 180) * Math.PI / 180;                 // solar longitude at perihelion
    const Eeq = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(-lp / 2));   // eccentric anomaly at the equinox
    const M = Eeq - e * Math.sin(Eeq) + 2 * Math.PI * (t - EQUINOX_MONTH) / 12;
    let E = M;
    for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    const near = (1 + e * Math.cos(nu)) / (1 - e * e);                  // a / r
    return { delta: Math.asin(Math.sin(orbit.tiltDeg * Math.PI / 180) * Math.sin(nu + lp)), s0: SOLAR_CONSTANT * orbit.sunScale * near * near };
}
