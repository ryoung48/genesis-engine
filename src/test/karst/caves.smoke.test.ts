import { describe, expect, it } from "vitest"
import { CAVE_CONFIG } from "@/model/geography/terrain/cave-config"
import { GLACIER_CAVE } from "@/model/geography/terrain/caves/glacier"
import { GROTTO_CAVE } from "@/model/geography/terrain/caves/grotto"
import { LAVA_CAVE } from "@/model/geography/terrain/caves/lava"
import { SEA_CAVE } from "@/model/geography/terrain/caves/sea"
import { SINKHOLE_CAVE } from "@/model/geography/terrain/caves/sinkhole"
import { TALUS_CAVE } from "@/model/geography/terrain/caves/talus"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { KARST } from "@/model/geography/terrain/karst"
import { ROCKS } from "@/model/geography/terrain/rocks"
import { SHORE } from "@/model/geography/terrain/shore"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"

const code = ROCKS.code
const kind = KARST.kindCode

describe("sinkhole potential", () => {
	it("is 0 off exposed carbonate, 0 at the lower water edge and 1 at the upper", () => {
		const out = SINKHOLE_CAVE.potential({
			kind: Uint8Array.from([
				kind.carbonate,
				kind.carbonate,
				kind.carbonate,
				kind.coveredCarbonate,
				kind.evaporite,
				kind.none,
			]),
			water: Float32Array.from([
				CAVE_CONFIG.sinkWet[0],
				CAVE_CONFIG.sinkWet[1],
				CAVE_CONFIG.sinkWet[0] - 0.2,
				1,
				1,
				1,
			]),
		})
		expect(out[0]).toBeCloseTo(0, 6)
		expect(out[1]).toBeCloseTo(1, 6)
		expect(out[2]).toBe(0)
		expect(out[3]).toBe(0)
		expect(out[4]).toBe(0)
		expect(out[5]).toBe(0)
	})

	it("rises with the water term and stays within 0..1", () => {
		let last = 0
		for (let w = 0; w <= 1; w += 0.05) {
			const sink = SINKHOLE_CAVE.potential({
				kind: Uint8Array.from([kind.carbonate]),
				water: Float32Array.from([w]),
			})
			expect(sink[0]).toBeGreaterThanOrEqual(last)
			expect(sink[0]).toBeLessThanOrEqual(1)
			last = sink[0]
		}
	})
})

describe("grotto potential", () => {
	it("needs exposed carbonate and a karst spring and equals the solution potential", () => {
		const out = GROTTO_CAVE.potential({
			kind: Uint8Array.from([
				kind.carbonate,
				kind.carbonate,
				kind.coveredCarbonate,
				kind.evaporite,
			]),
			solution: Float32Array.from([0.8, 0.8, 0.8, 0.8]),
			spring: Uint8Array.from([
				SPRINGS.code.karst,
				SPRINGS.code.seepage,
				SPRINGS.code.karst,
				SPRINGS.code.karst,
			]),
		})
		expect(out[0]).toBeCloseTo(0.8, 6)
		expect(out[1]).toBe(0)
		expect(out[2]).toBe(0)
		expect(out[3]).toBe(0)
	})
})

describe("lava potential", () => {
	it("is 0 off basalt, the old-basalt floor at zero hazard and 1 at the volcanic-sand activity", () => {
		const out = LAVA_CAVE.potential({
			rock: Uint8Array.from([code.limestone, code.basalt, code.basalt]),
			volcano: Float32Array.from([1, 0, SHORE_CONFIG.volcanicSandActivity]),
		})
		expect(out[0]).toBe(0)
		expect(out[1]).toBeCloseTo(CAVE_CONFIG.oldBasaltFloor, 6)
		expect(out[2]).toBeCloseTo(1, 6)
	})
})

describe("sea potential", () => {
	it("needs a cliff or rocky shore, with cliff above rocky at equal exposure", () => {
		const out = SEA_CAVE.potential({
			label: Uint8Array.from([
				SHORE.labelCode.cliff,
				SHORE.labelCode.rockyShore,
				SHORE.labelCode.sandyBeach,
				SHORE.labelCode.cliff,
				SHORE.labelCode.none,
			]),
			exposureOpenM: Float32Array.from([2, 2, 2, 0.1, 2]),
		})
		expect(out[0]).toBeCloseTo(1, 6)
		expect(out[1]).toBeCloseTo(CAVE_CONFIG.seaRockyTerm, 6)
		expect(out[2]).toBe(0)
		expect(out[3]).toBe(0)
		expect(out[4]).toBe(0)
		expect(out[0]).toBeGreaterThan(out[1])
	})
})

describe("talus potential", () => {
	it("needs mountains and is 0 on young sediment, half on shale", () => {
		const mountain = CLASSIFICATION.topoMountain
		const out = TALUS_CAVE.potential({
			topography: Uint8Array.from([
				mountain,
				mountain,
				mountain,
				CLASSIFICATION.topoHill,
			]),
			slopeScore: Float32Array.from([1, 1, 1, 1]),
			rock: Uint8Array.from([
				code.granite,
				code.young,
				code.shale,
				code.granite,
			]),
		})
		expect(out[0]).toBeCloseTo(1, 6)
		expect(out[1]).toBe(0)
		expect(out[2]).toBeCloseTo(CAVE_CONFIG.talusShale, 6)
		expect(out[3]).toBe(0)
	})
})

describe("glacier potential", () => {
	it("needs ice on mountains and a warmest month above the melt floor", () => {
		const mountain = CLASSIFICATION.topoMountain
		const out = GLACIER_CAVE.potential({
			isLand: Uint8Array.from([1, 1, 1, 1, 0, 1]),
			iceMinMonthly: Float32Array.from([1, 1, 1, 0, 1, 1]),
			topography: Uint8Array.from([
				mountain,
				mountain,
				mountain,
				mountain,
				mountain,
				CLASSIFICATION.topoHill,
			]),
			warmest: Float32Array.from([0, -9, -4, 0, 0, 0]),
		})
		expect(out[0]).toBeCloseTo(1, 6)
		expect(out[1]).toBe(0)
		expect(out[2]).toBeGreaterThan(0)
		expect(out[2]).toBeLessThan(1)
		expect(out[3]).toBe(0)
		expect(out[4]).toBe(0)
		expect(out[5]).toBe(0)
	})
})
