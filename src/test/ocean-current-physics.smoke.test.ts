import { describe, expect, it } from "vitest"
import { CLIMATE } from "@/model/climate/classification/climate"
import { OCEAN_CIRCULATION } from "@/model/climate/ocean/currents/circulation"
import { OCEAN_GRID } from "@/model/climate/ocean/currents/grid"
import { OCEAN_HEAT } from "@/model/climate/ocean/currents/heat"
import { MESH } from "@/model/mesh"
import type { GenesisParams } from "@/model/pipelines/types"
import { RNG } from "@/model/shared/random/rng"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const params: GenesisParams = {
	...DEFAULT_WORLD_PARAMS,
	seed: 1,
	tideLock: null,
	numPoints: 512,
}
const mesh = MESH.buildSphereMesh({
	n: 512,
	jitter: 0,
	rng: RNG.createRng({ seed: 1 }),
})
const n = mesh.numRegions
const elevation = new Float32Array(n).fill(-4)
const ocean = new Uint8Array(n).fill(1)
const climate = CLIMATE.computeTemperature({
	mesh,
	elevation: new Float32Array(n),
	landFraction: Array(36).fill(0),
	params,
	isLand: new Uint8Array(n),
	elevation_km: elevation,
})
climate.temperature_avg.fill(20)
climate.temperature_monthly.fill(20)
climate.temperature_monthly_nolapse.fill(20)
const grid = OCEAN_GRID.build({
	mesh,
	elevation,
	ocean,
	climate,
	radius: params.planetRadiusKm * 1000,
})
const yearSeconds = params.daysPerYear * params.hoursPerDay * 3600

describe("ocean physical invariants", () => {
	it("keeps an unforced uniform ocean at rest without inventing heat", () => {
		const circulation = OCEAN_CIRCULATION.solve({
			grid,
			params,
			wind: { u: new Float32Array(n * 12), v: new Float32Array(n * 12) },
		})
		expect(circulation.u.every((value) => value === 0)).toBe(true)
		expect(circulation.v.every((value) => value === 0)).toBe(true)
		const heat = OCEAN_HEAT.solve({ grid, circulation, yearSeconds })
		expect(heat.delta.every((value) => Math.abs(value) < 1e-7)).toBe(true)
	})
	it("keeps disconnected basins isolated under asymmetric forcing", () => {
		const wet = Uint8Array.from(Array(n).keys(), (r) =>
			Math.abs(mesh.r_xyz[3 * r]) > 0.25 ? 1 : 0,
		)
		const basinGrid = OCEAN_GRID.build({
			mesh,
			elevation,
			ocean: wet,
			climate,
			radius: params.planetRadiusKm * 1000,
		})
		const windU = Float32Array.from(Array(n * 12).keys(), (i) =>
			mesh.r_xyz[3 * (i % n)] > 0.25 ? 6 : 0,
		)
		const circulation = OCEAN_CIRCULATION.solve({
			grid: basinGrid,
			params,
			wind: { u: windU, v: new Float32Array(n * 12) },
		})
		let moving = 0
		for (let i = 0; i < n * 12; i++) {
			if (mesh.r_xyz[3 * (i % n)] < 0.25) {
				expect(circulation.u[i]).toBe(0)
				expect(circulation.v[i]).toBe(0)
			} else moving += Math.hypot(circulation.u[i], circulation.v[i])
		}
		expect(moving).toBeGreaterThan(1)
	})
	it("reverses Coriolis turning with rotation while remaining finite near the equator", () => {
		const wind = {
			u: new Float32Array(n * 12).fill(6),
			v: new Float32Array(n * 12),
		}
		const prograde = OCEAN_CIRCULATION.solve({ grid, params, wind })
		const retrograde = OCEAN_CIRCULATION.solve({
			grid,
			params: { ...params, obliquity: 180 },
			wind,
		})
		let northPrograde = 0,
			northRetrograde = 0
		for (let r = 0; r < n; r++) {
			if (mesh.r_xyz[3 * r + 2] > 0.3) {
				northPrograde += prograde.v[r]
				northRetrograde += retrograde.v[r]
			}
		}
		expect(northPrograde).toBeLessThan(0)
		expect(northRetrograde).toBeGreaterThan(0)
		expect(prograde.u.every(Number.isFinite)).toBe(true)
		expect(retrograde.u.every(Number.isFinite)).toBe(true)
	})
	it.each([
		{ radius: 1500, hours: 6, pressure: 0.2 },
		{ radius: 14000, hours: 2400, pressure: 3 },
		{ radius: 6000, hours: 8766, pressure: 1 },
	])("supports radius=$radius km, rotation=$hours hours, pressure=$pressure bar", (scenario) => {
		const planet = {
			...params,
			planetRadiusKm: scenario.radius,
			hoursPerDay: scenario.hours,
			daysPerYear: yearSeconds / (scenario.hours * 3600),
			pressure: scenario.pressure,
		}
		const planetGrid = OCEAN_GRID.build({
			mesh,
			elevation,
			ocean,
			climate,
			radius: scenario.radius * 1000,
		})
		const wind = {
			u: new Float32Array(n * 12).fill(4),
			v: new Float32Array(n * 12),
		}
		const circulation = OCEAN_CIRCULATION.solve({
			grid: planetGrid,
			params: planet,
			wind,
		})
		expect(circulation.u.every(Number.isFinite)).toBe(true)
		expect(circulation.v.every(Number.isFinite)).toBe(true)
		const heat = OCEAN_HEAT.solve({
			grid: planetGrid,
			circulation,
			yearSeconds,
		})
		expect(heat.delta.every((value) => Math.abs(value) < 1e-5)).toBe(true)
	})
})
