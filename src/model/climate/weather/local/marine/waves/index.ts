import type {
	MarineFetchParams,
	MarineIceCoveredParams,
	MarineSeaState,
	MarineWaveHeightParams,
	MarineWaves,
	MarineWavesParams,
} from "@/model/climate/weather/local/marine/waves/types"

const MAX_FETCH_KM = 2000
const SEAWATER_FREEZING_C = -1.8
const PIERSON_MOSKOWITZ_WIND_FACTOR = 1.06
const DOUGLAS_BANDS: [number, MarineSeaState][] = [
	[0.1, "calm"],
	[0.5, "smooth"],
	[1.25, "slight"],
	[2.5, "moderate"],
	[4, "rough"],
	[6, "veryRough"],
	[9, "high"],
	[14, "veryHigh"],
]

type Vec3 = [number, number, number]

const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
function normalize(v: Vec3): Vec3 | null {
	const length = Math.hypot(v[0], v[1], v[2])
	return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : null
}

function fetch({ field, sea, windU, windV }: MarineFetchParams): number {
	const { adjOffset, adjList, neighborDist, r_xyz, openWater, radiusKm } = field
	const position = (r: number): Vec3 => [
		r_xyz[3 * r],
		r_xyz[3 * r + 1],
		r_xyz[3 * r + 2],
	]
	const origin = position(sea)
	const east = normalize([-origin[1], origin[0], 0]) ?? [0, 1, 0]
	const north = cross(origin, east)
	const upwind = normalize([
		-windU * east[0] - windV * north[0],
		-windU * east[1] - windV * north[1],
		-windU * east[2] - windV * north[2],
	])
	if (!upwind) return 0
	const normal = cross(origin, upwind)
	const visited = new Set([sea])
	let current = sea
	let fetchKm = 0
	while (fetchKm < MAX_FETCH_KM) {
		const here = position(current)
		const forward = normalize(cross(normal, here))
		if (!forward) break
		let best = -1
		let bestEdge = -1
		let bestDot = -Infinity
		for (let j = adjOffset[current]; j < adjOffset[current + 1]; j++) {
			const neighbor = adjList[j]
			const step = normalize([
				r_xyz[3 * neighbor] - here[0],
				r_xyz[3 * neighbor + 1] - here[1],
				r_xyz[3 * neighbor + 2] - here[2],
			])
			if (!step) continue
			const alignment = dot(step, forward)
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
}: MarineWaveHeightParams): number {
	if (windSpeedMs <= 0 || fetchKm <= 0) return 0
	const drag = 0.001 * (1.1 + 0.035 * windSpeedMs)
	const friction = Math.sqrt(drag) * windSpeedMs
	const fetchLimited =
		4.13e-2 * friction * Math.sqrt((fetchKm * 1000) / gravityMs2)
	const fullyDeveloped =
		(0.21 * (PIERSON_MOSKOWITZ_WIND_FACTOR * windSpeedMs) ** 2) / gravityMs2
	return Math.min(fetchLimited, fullyDeveloped)
}

function seaState(heightM: number): MarineSeaState {
	for (const [upper, state] of DOUGLAS_BANDS) if (heightM < upper) return state
	return "phenomenal"
}

function iceCovered({ ice, temperatureNormalC }: MarineIceCoveredParams) {
	return (
		ice.perennial || (ice.seasonal && temperatureNormalC <= SEAWATER_FREEZING_C)
	)
}

function waves({ field, sea, ice, values }: MarineWavesParams): MarineWaves {
	if (iceCovered({ ice, temperatureNormalC: values.temperatureNormalC }))
		return { heightM: 0, state: "iceCovered", fromDeg: null, fetchKm: 0 }
	const fetchKm = fetch({
		field,
		sea,
		windU: values.windU,
		windV: values.windV,
	})
	const heightM = height({
		windSpeedMs: values.windSpeedMs,
		fetchKm,
		gravityMs2: field.gravityMs2,
	})
	return {
		heightM,
		state: seaState(heightM),
		fromDeg: values.windDirectionDeg,
		fetchKm,
	}
}

export const MARINE_WAVES = { waves, fetch, height, seaState, iceCovered }
