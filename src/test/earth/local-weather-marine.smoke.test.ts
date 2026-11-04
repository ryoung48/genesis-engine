import { expect, it, vi } from "vitest"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { TIDAL_FORCE } from "@/model/climate/ocean/tides/tidal-force"
import { TIDAL_CONTRIBUTORS } from "@/model/climate/ocean/tides/tidal-schedule/contributors"
import { LOCAL_WEATHER } from "@/model/climate/weather/local"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"
import { WEATHER_MARINE } from "@/model/climate/weather/local/marine"
import { MARINE_TIDE } from "@/model/climate/weather/local/marine/tide"
import type { MarineShore } from "@/model/climate/weather/local/marine/types"
import { MARINE_WAVES } from "@/model/climate/weather/local/marine/waves"
import type { MarineWaveField } from "@/model/climate/weather/local/marine/waves/types"
import { WEATHER_OUTLOOK } from "@/model/climate/weather/local/outlook"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { PROVINCE_LOCATIONS } from "@/model/geography/terrain/provinces/locations"
import type { GenesisParams } from "@/model/pipelines/types"
import { TIME } from "@/model/shared/time"
import type { GenesisProvinces } from "@/model/society/types"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const STEP_RAD = 0.01
const RADIUS_KM = 6371

function grid({ centerLon }: { centerLon: number }) {
	const size = 9
	const index = (i: number, j: number) => j * size + i
	const r_xyz = new Float32Array(size * size * 3)
	const adjOffset = new Int32Array(size * size + 1)
	const adjList: number[] = []
	const neighborDist: number[] = []
	for (let j = 0; j < size; j++)
		for (let i = 0; i < size; i++) {
			const lon = centerLon + (i - 4) * STEP_RAD
			const lat = (j - 4) * STEP_RAD
			const r = index(i, j)
			r_xyz.set(
				[
					Math.cos(lat) * Math.cos(lon),
					Math.cos(lat) * Math.sin(lon),
					Math.sin(lat),
				],
				3 * r,
			)
			adjOffset[r] = adjList.length
			for (const [di, dj] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			]) {
				const ni = i + di
				const nj = j + dj
				if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue
				adjList.push(index(ni, nj))
				neighborDist.push(STEP_RAD)
			}
		}
	adjOffset[size * size] = adjList.length
	const field: MarineWaveField = {
		adjOffset,
		adjList: Int32Array.from(adjList),
		neighborDist: Float32Array.from(neighborDist),
		r_xyz,
		openWater: Uint8Array.from({ length: size * size }, (_, r) => {
			const i = r % size
			const j = Math.floor(r / size)
			return i > 0 && j > 0 && i < size - 1 && j < size - 1 ? 1 : 0
		}),
		radiusKm: RADIUS_KM,
		gravityMs2: 9.81,
	}
	return { field, center: index(4, 4), index }
}

it("selects open-water shores, excluding lake-only coasts", () => {
	const adjacency = [[4, 5, 3], [6], [7], [0, 4], [0, 3, 5], [0, 4], [1], [2]]
	const adjOffset = new Int32Array(adjacency.length + 1)
	let offset = 0
	adjacency.forEach((list, r) => {
		adjOffset[r] = offset
		offset += list.length
	})
	adjOffset[adjacency.length] = offset
	const r_xyz = new Float32Array(adjacency.length * 3)
	for (let r = 0; r < adjacency.length; r++)
		r_xyz.set([Math.cos(r), Math.sin(r), 0], 3 * r)
	const isLand = new Uint8Array([1, 1, 1, 1, 0, 0, 0, 0])
	const landmarks = {
		regionLandmark: new Int32Array([3, 3, 3, 3, 0, 0, 1, 2]),
		type: new Uint8Array([
			LANDMARKS.landmarkTypeOcean,
			LANDMARKS.landmarkTypeLake,
			LANDMARKS.landmarkTypeSea,
			0,
		]),
	}
	const locations = PROVINCE_LOCATIONS.build({
		mesh: {
			numRegions: adjacency.length,
			r_xyz,
			regionArea: new Float32Array(adjacency.length).fill(1),
			adjOffset,
			adjList: Int32Array.from(adjacency.flat()),
		},
		provinces: {
			count: 3,
			seeds: new Int32Array([0, 1, 2]),
			regionProvince: new Int32Array([0, 1, 2, 0, -1, -1, -1, -1]),
		} as GenesisProvinces,
		isLand,
		representatives: new Map(),
		openWater: LANDMARKS.openWaterMask({ isLand, landmarks }),
		tidalRange: null,
	})
	expect(locations[0].marine?.shore).toBe(0)
	expect(locations[0].marine?.sea.region).toBe(4)
	expect(locations[1].marine).toBeNull()
	expect(locations[2].marine?.shore).toBe(2)
	expect(locations[2].marine?.sea.region).toBe(7)
})

it("grows waves with wind and fetch up to a fully developed sea", () => {
	const height = (windSpeedMs: number, fetchKm: number) =>
		MARINE_WAVES.height({ windSpeedMs, fetchKm, gravityMs2: 9.81 })
	expect(Math.abs(height(10, 100) - 1.59)).toBeLessThan(0.02)
	expect(Math.abs(height(10, 1e6) - 2.41)).toBeLessThan(0.03)
	expect(Math.abs(height(20, 1e6) - 9.62)).toBeLessThan(0.1)
	expect(height(10, 0)).toBe(0)
	expect(MARINE_WAVES.seaState(0.5)).toBe("slight")
	expect(MARINE_WAVES.seaState(0.49)).toBe("smooth")
	expect(MARINE_WAVES.seaState(20)).toBe("phenomenal")
})

it("walks fetch straight upwind and stops at obstructions", () => {
	const edgeKm = STEP_RAD * RADIUS_KM
	const { field, center, index } = grid({ centerLon: 0 })
	const fetch = (windU: number, windV: number, f = field) =>
		MARINE_WAVES.fetch({ field: f, sea: center, windU, windV })
	expect(fetch(5, 0)).toBeCloseTo(3 * edgeKm, 1)
	expect(fetch(0, -5)).toBeCloseTo(3 * edgeKm, 1)
	expect(fetch(0, 0)).toBe(0)

	const peninsula = { ...field, openWater: field.openWater.slice() }
	peninsula.openWater[index(2, 4)] = 0
	expect(fetch(5, 0, peninsula)).toBeCloseTo(edgeKm, 1)
	const offshore = { ...field, openWater: field.openWater.slice() }
	offshore.openWater[index(3, 4)] = 0
	expect(fetch(5, 0, offshore)).toBe(0)
	expect(
		MARINE_WAVES.height({
			windSpeedMs: 15,
			fetchKm: fetch(5, 0, offshore),
			gravityMs2: 9.81,
		}),
	).toBe(0)

	const capped = { ...field, radiusKm: 100000 }
	expect(fetch(5, 0, capped)).toBe(2000)

	const seam = grid({ centerLon: Math.PI })
	expect(
		MARINE_WAVES.fetch({
			field: seam.field,
			sea: seam.center,
			windU: 5,
			windV: 0,
		}),
	).toBeCloseTo(3 * edgeKm, 1)
})

it("freezes the sea for perennial ice or seasonal ice below seawater freezing", () => {
	const ice = (
		perennial: boolean,
		seasonal: boolean,
		temperatureNormalC: number,
	) =>
		MARINE_WAVES.iceCovered({
			ice: { perennial, seasonal },
			temperatureNormalC,
		})
	expect(ice(true, false, 5)).toBe(true)
	expect(ice(false, true, -1.8)).toBe(true)
	expect(ice(false, true, -1.7)).toBe(false)
	expect(ice(false, false, -30)).toBe(false)
})

const luna: MoonBody = { ...SOL_SYSTEM.solLunaDefault, idx: 1 }
const baseParams: GenesisParams = {
	...DEFAULT_WORLD_PARAMS,
	seed: 14963991,
	tideLock: null,
	obliquity: 0,
	moons: [luna],
}
const equator: MarineShore = {
	region: 0,
	latitudeDeg: 0,
	xyz: [1, 0, 0],
	springRangeM: 2,
	lagDraw: 0,
}

function resolve(params: GenesisParams, seconds: number): WeatherInstant {
	const year = WEATHER_CLOCK.resolve({ params, elapsedYears: 0, manual: null })
	return WEATHER_CLOCK.resolve({
		params,
		elapsedYears: seconds / year.yearSeconds,
		manual: null,
	})
}

function moonAt({
	instant,
	elongationDeg,
}: {
	instant: WeatherInstant
	elongationDeg: number
}): MoonBody {
	const longitude =
		instant.solarLongitudeRad +
		(elongationDeg * Math.PI) / 180 -
		(2 * Math.PI * instant.seconds) /
			(luna.orbitalPeriodDays * TIME.secondsPerDay)
	return {
		...luna,
		longitudeOfAscendingNodeDeg: 0,
		longitudeOfPerihelionDeg: 0,
		meanAnomalyAtEpochDeg: (longitude * 180) / Math.PI,
	}
}

function strengths(params: GenesisParams) {
	const planetMassKg = MECHANICS.derivePlanetMassKg(params.planetRadiusKm)
	const contribution = (massKg: number, distanceM: number) =>
		TIDAL_FORCE.tideContribution({
			bodyLatRad: 0,
			bodyLonRad: 0,
			bodyDistanceM: distanceM,
			bodyMassKg: massKg,
			surfaceLatRad: 0,
			surfaceLonRad: 0,
			planetMassKg,
			planetRadiusM: params.planetRadiusKm * 1000,
		})
	return {
		moon: contribution(
			luna.massKg,
			MECHANICS.moonSemiMajorAxisM({ moon: luna, planetMassKg }),
		),
		star: contribution(
			TIDAL_CONTRIBUTORS.starMassKg(params),
			params.orbitalDistanceAU * ORBIT_BODY.astronomicalUnitM,
		),
	}
}

it("gives two highs per transit for a single equatorial contributor", () => {
	const params = { ...baseParams, orbitalDistanceAU: 50 }
	const instant = resolve(params, 1e6)
	const tide = (at: WeatherInstant) =>
		MARINE_TIDE.tide({ instant: at, moons: [luna], shore: equator, params })
	const first = tide(instant)!.high!
	const second = tide(resolve(params, first.seconds + 60))!.high!
	const rate =
		(2 * Math.PI) / instant.rotationSeconds -
		(2 * Math.PI) / (luna.orbitalPeriodDays * TIME.secondsPerDay)
	const transit = (2 * Math.PI) / rate
	expect(Math.abs(second.seconds - first.seconds - transit / 2)).toBeLessThan(
		transit / 144 + 60,
	)
})

it("calibrates spring range to alignment and neap range to quadrature", () => {
	const instant = resolve(baseParams, 1e6)
	const { moon, star } = strengths(baseParams)
	const range = (elongationDeg: number) =>
		MARINE_TIDE.tide({
			instant,
			moons: [moonAt({ instant, elongationDeg })],
			shore: equator,
			params: baseParams,
		})!.dayRangeM!
	expect(Math.abs(range(0) / equator.springRangeM - 1)).toBeLessThan(0.02)
	expect(
		Math.abs(range(90) / equator.springRangeM - (moon - star) / (moon + star)),
	).toBeLessThan(0.05)
	const neap = MARINE_TIDE.tide({
		instant,
		moons: [moonAt({ instant, elongationDeg: 90 })],
		shore: equator,
		params: baseParams,
	})!
	expect(neap.phase).toBe("neap")
})

it("shifts high water by the shore's lag and has no cycle on locked worlds", () => {
	const instant = resolve(baseParams, 1e6)
	const high = (lagDraw: number) =>
		MARINE_TIDE.tide({
			instant,
			moons: [luna],
			shore: { ...equator, lagDraw },
			params: baseParams,
		})!.high!.seconds
	expect(high(0)).not.toBe(high(0.5))
	expect(
		MARINE_TIDE.tide({
			instant: { ...instant, solarDaySeconds: null },
			moons: [luna],
			shore: equator,
			params: baseParams,
		}),
	).toBeNull()
	expect(
		MARINE_TIDE.tide({
			instant,
			moons: [luna],
			shore: { ...equator, springRangeM: 0 },
			params: baseParams,
		}),
	).toBeNull()
})

it("handles polar, synchronous, retrograde and slow-rotation edge cases", () => {
	const instant = resolve(baseParams, 1e6)
	const polar = MARINE_TIDE.tide({
		instant,
		moons: [luna],
		shore: { ...equator, latitudeDeg: 90, xyz: [0, 0, 1] },
		params: baseParams,
	})!
	expect(Number.isFinite(polar.levelM)).toBe(true)
	expect(polar.high).toBeNull()
	expect(polar.low).toBeNull()

	const synchronous = {
		...luna,
		orbitalPeriodDays: instant.rotationSeconds / TIME.secondsPerDay,
	}
	const locked = MARINE_TIDE.tide({
		instant,
		moons: [synchronous],
		shore: equator,
		params: baseParams,
	})!
	expect(Number.isFinite(locked.levelM)).toBe(true)

	const retrogradeParams = { ...baseParams, obliquity: 170 }
	const retrograde = MARINE_TIDE.tide({
		instant: resolve(retrogradeParams, 1e6),
		moons: [luna],
		shore: equator,
		params: retrogradeParams,
	})!
	expect(Number.isFinite(retrograde.levelM)).toBe(true)
	expect(retrograde.high).not.toBeNull()

	const slowParams = { ...baseParams, hoursPerDay: 2000 }
	const slowInstant = resolve(slowParams, 1e6)
	const slow = MARINE_TIDE.tide({
		instant: slowInstant,
		moons: [luna],
		shore: equator,
		params: slowParams,
	})!
	expect(Number.isFinite(slow.levelM)).toBe(true)
	for (const event of [slow.high, slow.low])
		if (event)
			expect(event.seconds - slowInstant.seconds).toBeLessThanOrEqual(
				7 * TIME.secondsPerDay + 1,
			)

	const fast = Array.from({ length: 6 }, (_, k) => ({
		...luna,
		idx: k + 1,
		orbitalPeriodDays: 0.3 + k * 0.05,
		massKg: luna.massKg / 100,
	}))
	const many = MARINE_TIDE.tide({
		instant,
		moons: fast,
		shore: {
			...equator,
			latitudeDeg: 40,
			xyz: [Math.cos(0.7), 0, Math.sin(0.7)],
		},
		params: baseParams,
	})!
	expect(Number.isFinite(many.levelM)).toBe(true)
})

it("keeps province weather values unchanged by the marine sample", () => {
	const context = WEATHER_FIXTURE.context()
	const baseline = context.provinces[0].baselines[0]
	context.marine = {
		adjOffset: new Int32Array([0, 1, 2]),
		adjList: new Int32Array([1, 0]),
		neighborDist: new Float32Array([0.01, 0.01]),
		r_xyz: new Float32Array([1, 0, 0, Math.cos(0.01), Math.sin(0.01), 0]),
		openWater: new Uint8Array([0, 1]),
		radiusKm: RADIUS_KM,
		gravityMs2: 9.81,
	}
	const plain = structuredClone(context)
	context.provinces[0].marine = {
		baseline: {
			...baseline,
			isLand: false,
			location: {
				region: 1,
				weight: 1,
				xyz: [Math.cos(0.01), Math.sin(0.01), 0],
			},
		},
		shore: equator,
		ice: { perennial: false, seasonal: false },
	}
	const instant = WEATHER_FIXTURE.instant()
	const query = { context, province: 0, instant }
	const withMarine = LOCAL_WEATHER.sampleProvince(query)
	const without = LOCAL_WEATHER.sampleProvince({ ...query, context: plain })
	expect(withMarine.marine?.waves).not.toBeNull()
	expect(without.marine).toBeNull()
	expect(withMarine.values).toEqual(without.values)
	expect(withMarine.samples).toEqual(without.samples)
	expect(LOCAL_WEATHER.sampleProvinceValues(query)).toEqual(without.values)

	const spy = vi.spyOn(WEATHER_MARINE, "waves")
	try {
		const hourly = WEATHER_OUTLOOK.hourly(query)
		const monthly = WEATHER_OUTLOOK.monthly(query)
		expect(spy).not.toHaveBeenCalled()
		expect(hourly).toEqual(WEATHER_OUTLOOK.hourly({ ...query, context: plain }))
		expect(monthly).toEqual(
			WEATHER_OUTLOOK.monthly({ ...query, context: plain }),
		)
		LOCAL_WEATHER.sampleProvince(query)
		expect(spy).toHaveBeenCalledTimes(1)
	} finally {
		spy.mockRestore()
	}
})
