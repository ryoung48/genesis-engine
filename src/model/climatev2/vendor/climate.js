// Vendored from github.com/raguilar011095/planet_heightmap_generation@47edc28acc17719b6bed03e211d20eb87441c2be v2/js/climate/climate.js (GPL-3.0, see LICENSE). Modified in chaos-machine: the stages read the orbit from the options.
// The new climate for any planet — the one call a generator makes. DOM-free; runs in a worker or in Node.
//
//   planetClimate({ xyz, elevKm, axes, land? }, options?) → computeClimate's result: per terrain cell
//   cell.koppen (Köppen id, V1's class table), cell.tAnnual (°C), cell.pAnnual (mm/year); on the 1° climate grid
//   months.T and months.P (12 monthly layers, °C at each grid cell's reference height, mm/month) and every stage's
//   fields (stages.temperature, .circulation, .ocean, .rain); timing.
//
// Evolution's frames: xyz on the unit sphere with z north (axes 'z-up'), heights in km with the sea at 0. V1's planets:
// y north ('y-up'). The climate is computed on a fixed lat-lon grid, so it is the same at every terrain resolution.

import { computeClimate } from './core.js';
import { CLIMATEV2_LOCKED_CLOUDS } from '../clouds/locked/index.ts';
import { CLIMATEV2_LOCKED_RAIN } from '../rain/locked/index.ts';
import { energyBalanceTemperature } from './temperature.js';
import { derivedCirculation } from './circulation.js';
import { windDrivenOcean } from './ocean.js';
import { columnWaterRain } from './rain.js';

/** The stages of the whole new climate: temperature ↔ pressure and wind ↔ ocean, then rain, then clouds. */
export function climateStages() {
    return { temperature: energyBalanceTemperature(), circulation: derivedCirculation(), ocean: windDrivenOcean(), rain: columnWaterRain() };
}

/** A planet locked to its star: its temperature, its substellar cloud deck and its rain; no winds or ocean yet. */
export function lockedClimate(input, options = {}) {
    const stages = { temperature: energyBalanceTemperature(), clouds: ({ ctx, temperature }) => CLIMATEV2_LOCKED_CLOUDS.estimate({ ctx, temperatureMonthly: temperature.monthly }), rain: (ctx, winds, temperature) => CLIMATEV2_LOCKED_RAIN.estimate({ ctx, temperature }) };
    return computeClimate(input, { ...options, stages, cloudsFromRain: false });
}

/**
 * @param {{xyz: Float32Array|Float64Array, elevKm: Float32Array, axes: 'y-up'|'z-up', land?: Uint8Array}} input
 * @param {object} [options]  core options (anchors, lapseRateCPerKm, greenhouseWm2, precipScale, …) and the orbit (tiltDeg, eccentricity, perihelion, rotationRateRadS, yearScale: see orbitOf in insolation.js)
 */
export function planetClimate(input, options = {}) {
    return computeClimate(input, { ...options, stages: climateStages() });
}
