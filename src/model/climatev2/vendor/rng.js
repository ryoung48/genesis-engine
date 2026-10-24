// Vendored verbatim from github.com/raguilar011095/planet_heightmap_generation@47edc28acc17719b6bed03e211d20eb87441c2be js/rng.js (GPL-3.0, see LICENSE).
// Seeded RNG — deterministic pseudo-random number generators.

export function makeRng(seed) {
    let s = (Math.abs(Math.floor(seed * 9301 + 49297)) % 2147483646) + 1;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function makeRandInt(seed) {
    const r = makeRng(seed);
    return (n) => Math.floor(r() * n);
}
