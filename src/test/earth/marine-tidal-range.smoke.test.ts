import { expect, it } from "vitest"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { TIDAL_FORCE } from "@/model/climate/ocean/tides/tidal-force"
import { TIDAL_SCHEDULE } from "@/model/climate/ocean/tides/tidal-schedule"
import { TIDAL_CONTRIBUTORS } from "@/model/climate/ocean/tides/tidal-schedule/contributors"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { GenesisParams } from "@/model/pipelines/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const luna: MoonBody = { ...SOL_SYSTEM.solLunaDefault, idx: 1 }
const params: GenesisParams = {
	...DEFAULT_WORLD_PARAMS,
	seed: 14963991,
	numPoints: 8000,
	tideLock: null,
	moons: [luna],
}

it("derives a deterministic tidal range from the generated world's own moons", () => {
	const first = GENERATE_WORLD.generateGenesisWorld({ params })
	const second = GENERATE_WORLD.generateGenesisWorld({
		params: { ...params, moons: [{ ...luna }] },
	})
	expect(first.tidalRange).toBeDefined()
	expect(Buffer.from(first.tidalRange!.buffer)).toEqual(
		Buffer.from(second.tidalRange!.buffer),
	)
	expect(first.tidalSchedule!.maxForce).toBeGreaterThan(0)
	expect(first.tidalRange!.some((value) => value > 0)).toBe(true)
})

it("computes finite schedules and a star-only force without moons", () => {
	const lunar = TIDAL_SCHEDULE.computeTidalSchedule({ moons: [luna], params })
	const solar = TIDAL_SCHEDULE.computeTidalSchedule({ moons: [], params })
	let finite = true
	for (const schedule of [lunar, solar])
		for (const event of schedule.events)
			if (!Number.isFinite(event.tidalForce)) finite = false
	expect(finite).toBe(true)
	expect(Number.isFinite(lunar.maxForce) && lunar.maxForce > 0).toBe(true)

	const planetMassKg = MECHANICS.derivePlanetMassKg(params.planetRadiusKm)
	let expected = 0
	for (let day = 0; day < params.daysPerYear; day++) {
		const t = day + 0.5
		const star = TIDAL_FORCE.starTidalPosition({
			orbitalDistanceAU: params.orbitalDistanceAU,
			planetEccentricity: params.eccentricity,
			perihelionLonDeg: params.perihelion,
			t,
			daysPerYear: params.daysPerYear,
		})
		const force =
			TIDAL_FORCE.starTideContribution({
				starLatRad: star.latRad,
				starLonRad: star.lonRad,
				starDistanceM: star.distanceM,
				starMassKg: TIDAL_CONTRIBUTORS.starMassKg(params),
				surfaceLatRad: 0,
				surfaceLonRad: 0,
				planetMassKg,
				planetRadiusM: params.planetRadiusKm * 1000,
			}) / TIDAL_FORCE.earthMoonTideReference
		expected = Math.max(expected, force)
	}
	expect(expected).toBeGreaterThan(0)
	expect(Math.abs(solar.maxForce / expected - 1)).toBeLessThan(0.01)
})

it("prepares contributors with clamping, exclusion, idempotence and lock handling", () => {
	const fast = { ...luna, idx: 2, orbitalPeriodDays: 1e-6 }
	const slow = { ...luna, idx: 3, orbitalPeriodDays: 1e9 }
	const eccentric = { ...luna, idx: 4, eccentricity: 0.9999 }
	const first = TIDAL_CONTRIBUTORS.prepare({
		moons: [luna, fast, slow, eccentric],
		params,
	})
	expect(first.moonsClamped).toBe(true)
	const byIdx = new Map(first.moons.map((moon) => [moon.idx, moon]))
	expect(byIdx.get(1)).toEqual(luna)
	if (byIdx.has(2))
		expect(byIdx.get(2)!.orbitalPeriodDays).toBeGreaterThan(1e-6)
	if (byIdx.has(3)) expect(byIdx.get(3)!.orbitalPeriodDays).toBeLessThan(1e9)
	expect(byIdx.get(4)!.eccentricity).toBeLessThan(0.9999)
	expect(first.moons.every((moon) => moon.orbitalPeriodDays > 0)).toBe(true)
	const again = TIDAL_CONTRIBUTORS.prepare({ moons: first.moons, params })
	expect(again.moons).toEqual(first.moons)
	expect(again.moonsClamped).toBe(false)

	const invalid = TIDAL_CONTRIBUTORS.prepare({
		moons: [{ ...luna, massKg: 1e-3 }],
		params,
	})
	expect(invalid.moons).toEqual([])

	const tideLock = { type: "lunar" as const, target: 1 }
	expect(TIDAL_CONTRIBUTORS.lockedToMoon({ tideLock, moon: luna })).toBe(true)
	const locked = TIDAL_SCHEDULE.computeTidalSchedule({
		moons: [luna],
		params: { ...params, tideLock },
	})
	expect(locked.events.every((event) => event.moonForces[0] === 0)).toBe(true)
})
