import { MECHANICS } from "@/model/celestial/moons/mechanics"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	OceanFetchParams,
	OceanIceCoveredParams,
	OceanWaveField,
	OceanWaveFieldParams,
	OceanWaveHeightParams,
} from "@/model/climate/ocean/waves/types"

const MAX_FETCH_KM = 2000
const SEAWATER_FREEZING_C = -1.8
const PIERSON_MOSKOWITZ_WIND_FACTOR = 1.06
const M_PER_KM = 1000

function field({
	mesh,
	openWater,
	planetRadiusKm,
}: OceanWaveFieldParams): OceanWaveField {
	const radiusM = planetRadiusKm * M_PER_KM
	return {
		adjOffset: mesh.adjOffset,
		adjList: mesh.adjList,
		neighborDist: mesh.neighborDist,
		r_xyz: mesh.r_xyz,
		openWater,
		radiusKm: planetRadiusKm,
		gravityMs2:
			(ORBIT_BODY.gravitationalConstantM3KgS2 *
				MECHANICS.derivePlanetMassKg(planetRadiusKm)) /
			(radiusM * radiusM),
	}
}

function fetch({ field: waveField, sea, windU, windV }: OceanFetchParams) {
	const { adjOffset, adjList, neighborDist, r_xyz, openWater, radiusKm } =
		waveField
	const ox = r_xyz[3 * sea]
	const oy = r_xyz[3 * sea + 1]
	const oz = r_xyz[3 * sea + 2]
	const eastLength = Math.hypot(-oy, ox, 0)
	const ex = eastLength > 0 ? -oy / eastLength : 0
	const ey = eastLength > 0 ? ox / eastLength : 1
	const ez = 0
	const nx = oy * ez - oz * ey
	const ny = oz * ex - ox * ez
	const nz = ox * ey - oy * ex
	const ux = -windU * ex - windV * nx
	const uy = -windU * ey - windV * ny
	const uz = -windU * ez - windV * nz
	const upwindLength = Math.hypot(ux, uy, uz)
	if (!(upwindLength > 0)) return 0
	const wx = ux / upwindLength
	const wy = uy / upwindLength
	const wz = uz / upwindLength
	const px = oy * wz - oz * wy
	const py = oz * wx - ox * wz
	const pz = ox * wy - oy * wx
	const visited = new Set([sea])
	let current = sea
	let fetchKm = 0
	while (fetchKm < MAX_FETCH_KM) {
		const hx = r_xyz[3 * current]
		const hy = r_xyz[3 * current + 1]
		const hz = r_xyz[3 * current + 2]
		const fx = py * hz - pz * hy
		const fy = pz * hx - px * hz
		const fz = px * hy - py * hx
		const forwardLength = Math.hypot(fx, fy, fz)
		if (!(forwardLength > 0)) break
		const gx = fx / forwardLength
		const gy = fy / forwardLength
		const gz = fz / forwardLength
		let best = -1
		let bestEdge = -1
		let bestDot = -Infinity
		for (let j = adjOffset[current]; j < adjOffset[current + 1]; j++) {
			const neighbor = adjList[j]
			const dx = r_xyz[3 * neighbor] - hx
			const dy = r_xyz[3 * neighbor + 1] - hy
			const dz = r_xyz[3 * neighbor + 2] - hz
			const stepLength = Math.hypot(dx, dy, dz)
			if (!(stepLength > 0)) continue
			const alignment =
				(dx / stepLength) * gx + (dy / stepLength) * gy + (dz / stepLength) * gz
			if (alignment > bestDot || (alignment === bestDot && neighbor < best)) {
				bestDot = alignment
				best = neighbor
				bestEdge = j
			}
		}
		if (best < 0 || bestDot <= 0 || visited.has(best) || !openWater[best]) break
		fetchKm = Math.min(
			MAX_FETCH_KM,
			fetchKm + neighborDist[bestEdge] * radiusKm,
		)
		visited.add(best)
		current = best
	}
	return fetchKm
}

function height({
	windSpeedMs,
	fetchKm,
	gravityMs2,
}: OceanWaveHeightParams): number {
	if (windSpeedMs <= 0 || fetchKm <= 0) return 0
	const drag = 0.001 * (1.1 + 0.035 * windSpeedMs)
	const friction = Math.sqrt(drag) * windSpeedMs
	const fetchLimited =
		4.13e-2 * friction * Math.sqrt((fetchKm * M_PER_KM) / gravityMs2)
	const fullyDeveloped =
		(0.21 * (PIERSON_MOSKOWITZ_WIND_FACTOR * windSpeedMs) ** 2) / gravityMs2
	return Math.min(fetchLimited, fullyDeveloped)
}

function iceCovered({ ice, temperatureNormalC }: OceanIceCoveredParams) {
	return (
		ice.perennial || (ice.seasonal && temperatureNormalC <= SEAWATER_FREEZING_C)
	)
}

export const OCEAN_WAVES = { field, fetch, height, iceCovered }
