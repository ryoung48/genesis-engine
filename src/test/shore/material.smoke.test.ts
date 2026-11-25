import { describe, expect, it } from "vitest"
import { SHORE_MATERIAL } from "@/model/geography/terrain/shore/material"
import type { MaterialOfParams } from "@/model/geography/terrain/shore/material/types"
import { SHORE_RELIEF } from "@/model/geography/terrain/shore/relief"

const CODE = SHORE_MATERIAL.code
const BASE: MaterialOfParams = {
	resist: 0,
	isTill: false,
	isIce: false,
	freshVolcanic: false,
	relief: SHORE_RELIEF.code.sloping,
	exposureClass: 2,
	sandShare: 70,
	flowM3s: 0,
}

function materialOf(overrides: Partial<MaterialOfParams>) {
	return SHORE_MATERIAL.materialOf({ ...BASE, ...overrides })
}

describe("shore material", () => {
	it("ice wins over everything", () => {
		expect(materialOf({ isIce: true, resist: 1 }).material).toBe(CODE.ice)
	})

	it("resistant bedrock is rock unless it is a flat sheltered coast", () => {
		const flat = { resist: 1, relief: SHORE_RELIEF.code.low }
		expect(materialOf({ resist: 1 }).material).toBe(CODE.rock)
		expect(materialOf({ ...flat, exposureClass: 0 }).material).not.toBe(
			CODE.rock,
		)
		expect(materialOf({ ...flat, exposureClass: 1 }).material).toBe(CODE.rock)
	})

	it("weak bedrock is not rock", () => {
		expect(materialOf({ resist: 0.25 }).material).not.toBe(CODE.rock)
	})

	it("till and steep soft coasts are gravel", () => {
		expect(materialOf({ isTill: true, resist: 0.1 }).material).toBe(CODE.gravel)
		expect(materialOf({ relief: SHORE_RELIEF.code.steep }).material).toBe(
			CODE.gravel,
		)
	})

	it("fresh volcanic coasts give flagged sand, or flagged rock when steep", () => {
		expect(materialOf({ resist: 0.85, freshVolcanic: true })).toEqual({
			material: CODE.sand,
			volcanicSand: true,
		})
		expect(
			materialOf({
				resist: 0.85,
				freshVolcanic: true,
				relief: SHORE_RELIEF.code.steep,
			}),
		).toEqual({ material: CODE.rock, volcanicSand: true })
	})

	it("fine sediment in shelter or at a big river mouth is mud", () => {
		expect(materialOf({ sandShare: 30, exposureClass: 0 }).material).toBe(
			CODE.mud,
		)
		expect(materialOf({ sandShare: 30, flowM3s: 600 }).material).toBe(CODE.mud)
		expect(materialOf({ sandShare: 30 }).material).toBe(CODE.sand)
	})

	it("ice coasts are never flagged volcanic", () => {
		expect(materialOf({ isIce: true, freshVolcanic: true }).volcanicSand).toBe(
			false,
		)
	})

	it("sandy coasts are unflagged sand without fresh volcanics", () => {
		expect(materialOf({})).toEqual({ material: CODE.sand, volcanicSand: false })
	})

	it("classify leaves non-coastal regions empty", () => {
		const out = SHORE_MATERIAL.classify({
			coastal: Uint8Array.of(0, 1),
			keyCode: Uint8Array.of(0, 0),
			sand: Float32Array.of(70, 70),
			iceThickness: new Float32Array(2),
			relief: Uint8Array.of(0, SHORE_RELIEF.code.sloping),
			exposureOpenM: Float32Array.of(2, 2),
			flow: new Float32Array(2),
			volcano: new Float32Array(2),
		})
		expect(out.material[0]).toBe(CODE.none)
		expect(out.volcanicSand[0]).toBe(0)
		expect(out.material[1]).not.toBe(CODE.none)
	})
})
