import { describe, expect, it } from "vitest"
import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisRainfall,
} from "@/model/climate/types"
import { LAKES } from "@/model/geography/terrain/lakes"
import { RIVERS } from "@/model/geography/terrain/rivers"
import { MESH } from "@/model/mesh"
import { RNG } from "@/model/shared/random/rng"
import { UNITS } from "@/model/shared/units"

const REGIONS = 3000
const PLANET_RADIUS_KM = 6371
const BOWL_RAD = 0.12
const CATCHMENT_RAD = 0.35
const BOWL_LAT = 50
const MONTHS = 12

function build() {
	const mesh = MESH.buildSphereMesh({
		n: REGIONS,
		jitter: 0.5,
		rng: RNG.createRng({ seed: 7 }),
	})
	const N = mesh.numRegions
	const lat = new Float32Array(N)
	const angle = new Float32Array(N)
	const bowl = (BOWL_LAT * Math.PI) / 180
	const center = [Math.cos(bowl), 0, Math.sin(bowl)]
	for (let r = 0; r < N; r++) {
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]
		lat[r] = Math.asin(z)
		angle[r] = Math.acos(
			Math.max(-1, Math.min(1, x * center[0] + y * center[1] + z * center[2])),
		)
	}
	const isLand = new Uint8Array(N)
	const elevation = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		isLand[r] = lat[r] > 0 ? 1 : 0
		const slope = 0.05 + 0.6 * Math.max(0, Math.sin(lat[r]))
		const dip = 0.35 * Math.exp(-((angle[r] / BOWL_RAD) ** 2))
		elevation[r] = isLand[r] ? slope - dip + 0.02 * Math.sin(37 * r) : -0.1
	}
	let bowlRegion = 0
	for (let r = 0; r < N; r++) if (angle[r] < angle[bowlRegion]) bowlRegion = r
	return { mesh, N, isLand, elevation, angle, lat, bowlRegion }
}

type World = ReturnType<typeof build>

function isArid({ world, region }: { world: World; region: number }): boolean {
	return (
		world.angle[region] < CATCHMENT_RAD ||
		world.lat[region] > (BOWL_LAT * Math.PI) / 180
	)
}

function weather({
	world,
	runoffMmPerMonth,
}: {
	world: World
	runoffMmPerMonth: number
}) {
	const { N, isLand } = world
	const rain = new Float32Array(MONTHS * N)
	const pet = new Float32Array(MONTHS * N)
	const aet = new Float32Array(MONTHS * N)
	const aridity = new Float32Array(MONTHS * N).fill(0.5)
	const annual = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const arid = isArid({ world, region: r })
		for (let m = 0; m < MONTHS; m++) {
			const i = m * N + r
			rain[i] = arid ? 40 : 150
			pet[i] = arid ? 100 : 50
			aet[i] = isLand[r]
				? arid
					? Math.max(0, rain[i] - runoffMmPerMonth)
					: 50
				: 0
			annual[r] += rain[i]
		}
	}
	return {
		rainfall: { monthly: rain, annual } as GenesisRainfall,
		climate: {
			pet_monthly: pet,
			temperature_monthly: new Float32Array(MONTHS * N).fill(15),
		} as GenesisClimate,
		hydrology: {
			aet_monthly: aet,
			aridity_monthly: aridity,
			baseflow_monthly: new Float32Array(MONTHS * N),
			runoff_annual: new Float32Array(N),
		} as GenesisHydrology,
	}
}

function run({
	world,
	runoffMmPerMonth,
}: {
	world: World
	runoffMmPerMonth: number
}) {
	const inputs = weather({ world, runoffMmPerMonth })
	const rivers = RIVERS.computeRivers({
		mesh: world.mesh,
		elevation: world.elevation,
		isLand: world.isLand,
		params: {
			planetRadiusKm: PLANET_RADIUS_KM,
			daysPerYear: 365,
			hoursPerDay: 24,
		},
		...inputs,
	})
	return { rivers, inputs }
}

function downstreamFlow({
	world,
	flow,
}: {
	world: World
	flow: Float32Array
}): number {
	let sum = 0
	for (let r = 0; r < world.N; r++)
		if (world.isLand[r] && !isArid({ world, region: r })) sum += flow[r]
	return sum
}

describe("terminal basin routing", () => {
	const world = build()

	it("the bowl is a depression basin", () => {
		const { rivers } = run({ world, runoffMmPerMonth: 20 })
		expect(rivers.basinId[world.bowlRegion]).toBeGreaterThanOrEqual(0)
	})

	it("a wet catchment keeps the bowl open and a dry one makes it terminal", () => {
		const wet = run({ world, runoffMmPerMonth: 30 }).rivers
		const dry = run({ world, runoffMmPerMonth: 1 }).rivers
		const bid = wet.basinId[world.bowlRegion]
		expect(wet.basinTerminal[bid]).toBe(0)
		expect(dry.basinTerminal[dry.basinId[world.bowlRegion]]).toBe(1)
	})

	it("a terminal basin passes nothing downstream, so downstream flow drops", () => {
		const open = run({ world, runoffMmPerMonth: 30 }).rivers
		const closed = run({ world, runoffMmPerMonth: 1 }).rivers
		expect(downstreamFlow({ world, flow: closed.flow })).toBeLessThan(
			downstreamFlow({ world, flow: open.flow }),
		)
	})

	it("flow into the bowl is unchanged by the verdict", () => {
		const open = run({ world, runoffMmPerMonth: 30 }).rivers
		const closed = run({ world, runoffMmPerMonth: 30 }).rivers
		expect(Array.from(closed.flow)).toEqual(Array.from(open.flow))
	})

	it("verdicts are deterministic", () => {
		const a = run({ world, runoffMmPerMonth: 1 }).rivers
		const b = run({ world, runoffMmPerMonth: 1 }).rivers
		expect(Array.from(a.basinTerminal)).toEqual(Array.from(b.basinTerminal))
		expect(Array.from(a.flow)).toEqual(Array.from(b.flow))
	})
})

describe("terminal basin lakes", () => {
	const world = build()

	function lakes(runoffMmPerMonth: number) {
		const { rivers, inputs } = run({ world, runoffMmPerMonth })
		const isLand = Uint8Array.from(world.isLand)
		const elevation = Float32Array.from(world.elevation)
		LAKES.computeLakes({
			mesh: world.mesh,
			planetRadiusKm: PLANET_RADIUS_KM,
			secondsPerYear: UNITS.secondsPerYear({
				daysPerYear: 365,
				hoursPerDay: 24,
			}),
			elevation,
			rainfall: inputs.rainfall,
			petMonthly: inputs.climate.pet_monthly,
			waterLevel: rivers.waterLevel,
			basinId: rivers.basinId,
			basinTerminal: rivers.basinTerminal,
			basinInflow: rivers.basinInflow,
			lakeKind: rivers.lakeKind,
			isLand,
		})
		return { rivers, isLand }
	}

	it("every region has a lake kind from 0 to 3", () => {
		const { rivers } = lakes(1)
		for (const kind of rivers.lakeKind) {
			expect(kind).toBeGreaterThanOrEqual(0)
			expect(kind).toBeLessThanOrEqual(3)
		}
	})

	it("a terminal bowl holds a salt lake or a pan and never a fresh lake", () => {
		const { rivers, isLand } = lakes(1)
		const kinds = new Set<number>()
		const bid = rivers.basinId[world.bowlRegion]
		for (let r = 0; r < world.N; r++)
			if (rivers.basinId[r] === bid) kinds.add(rivers.lakeKind[r])
		expect(kinds.has(2) || kinds.has(3)).toBe(true)
		expect(kinds.has(1)).toBe(false)
		for (let r = 0; r < world.N; r++)
			if (rivers.lakeKind[r] === 3) expect(isLand[r]).toBe(1)
	})

	it("an open bowl holds only fresh lakes", () => {
		const { rivers } = lakes(30)
		const bid = rivers.basinId[world.bowlRegion]
		expect(rivers.basinTerminal[bid]).toBe(0)
		for (let r = 0; r < world.N; r++)
			if (rivers.basinId[r] === bid)
				expect(rivers.lakeKind[r] === 0 || rivers.lakeKind[r] === 1).toBe(true)
	})
})
