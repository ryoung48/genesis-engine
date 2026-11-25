import { describe, expect, it } from "vitest"
import { SHORE_RELIEF } from "@/model/geography/terrain/shore/relief"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"
import { LINE_RADIUS_KM, lineMesh } from "@/test/shore/line-mesh"

const COUNT = 20
const COAST = 9
const LOW = SHORE_CONFIG.reliefLowMPerKm
const STEEP = SHORE_CONFIG.reliefSteepMPerKm

function classifyCoast(elevationKm: Float32Array): number {
	const isLand = new Uint8Array(COUNT)
	const openWater = new Uint8Array(COUNT)
	const coastal = new Uint8Array(COUNT)
	for (let r = 0; r < COUNT; r++) {
		if (r <= COAST) isLand[r] = 1
		else openWater[r] = 1
	}
	coastal[COAST] = 1
	return SHORE_RELIEF.classify({
		mesh: lineMesh(COUNT),
		elevationKm,
		isLand,
		openWater,
		coastal,
		planetRadiusKm: LINE_RADIUS_KM,
	})[COAST]
}

function profile(coastKm: number, inlandRiseKm: number): Float32Array {
	const out = new Float32Array(COUNT)
	for (let r = 0; r <= COAST; r++) out[r] = coastKm + inlandRiseKm * (COAST - r)
	return out
}

describe("shore relief", () => {
	it("classifies at the configured gradients", () => {
		const codeOf = (gradientMPerKm: number) =>
			SHORE_RELIEF.codeOf({ gradientMPerKm })
		expect(codeOf(LOW - 0.01)).toBe(SHORE_RELIEF.code.low)
		expect(codeOf(LOW)).toBe(SHORE_RELIEF.code.sloping)
		expect(codeOf(STEEP - 0.01)).toBe(SHORE_RELIEF.code.sloping)
		expect(codeOf(STEEP)).toBe(SHORE_RELIEF.code.steep)
	})

	it("a flat plain is low, a modest coast is sloping, a high coast is steep", () => {
		expect(classifyCoast(profile(0.0005, 0))).toBe(SHORE_RELIEF.code.low)
		expect(classifyCoast(profile(0.02, 0))).toBe(SHORE_RELIEF.code.sloping)
		expect(classifyCoast(profile(0.1, 0))).toBe(SHORE_RELIEF.code.steep)
	})

	it("a steep rise inland makes a low coast steep", () => {
		expect(classifyCoast(profile(0.0005, 0.1))).toBe(SHORE_RELIEF.code.steep)
	})

	it("a descent inland does not raise the class", () => {
		const down = profile(0.0005, 0).map((value, r) => (r < COAST ? 0 : value))
		expect(classifyCoast(down)).toBe(SHORE_RELIEF.code.low)
	})

	it("non-coastal regions stay none", () => {
		const out = SHORE_RELIEF.classify({
			mesh: lineMesh(COUNT),
			elevationKm: profile(0.1, 0),
			isLand: new Uint8Array(COUNT).fill(1),
			openWater: new Uint8Array(COUNT),
			coastal: new Uint8Array(COUNT),
			planetRadiusKm: LINE_RADIUS_KM,
		})
		expect(out.every((code) => code === SHORE_RELIEF.code.none)).toBe(true)
	})
})
