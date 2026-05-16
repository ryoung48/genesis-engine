import { describe, expect, it, vi } from "vitest"
import {
	buildCultureBlendOverlay,
	buildPoliticalOccupationOverlay,
	getPoliticalHoverNationId,
	getPoliticalHoverOccupation,
	getRebelDisplayColorNationId,
} from "./political-conflict-display"

describe("political-conflict-display", () => {
	it("maps rebel defenders to their loyalist display color nation", () => {
		expect(
			getRebelDisplayColorNationId(
				[
					{ idx: 3, attacker: 2, defender: 5, rebel: true, occupied: [6] },
					{ idx: 4, attacker: 1, defender: 0, rebel: false, occupied: [2] },
				],
				5,
			),
		).toBe(2)
		expect(
			getRebelDisplayColorNationId(
				[{ idx: 4, attacker: 1, defender: 0, rebel: false, occupied: [2] }],
				0,
			),
		).toBeNull()
	})

	it("builds regular-war overlays from attacker occupations", () => {
		const overlay = buildPoliticalOccupationOverlay({
			regionProvince: new Int32Array([0, 1, 2]),
			assignment: new Int32Array([0, 1, 2]),
			activeWars: [
				{ idx: 4, attacker: 1, defender: 0, rebel: false, occupied: [2] },
			],
			getNationColorRgb: vi.fn((nationId: number) =>
				nationId === 1 ? ([0.2, 0.4, 0.6] as [number, number, number]) : null,
			),
		})

		expect(overlay).not.toBeNull()
		expect(Array.from(overlay!.subarray(0, 8))).toEqual([
			0, 0, 0, 0, 0, 0, 0, 0,
		])
		expect(overlay![8]).toBeCloseTo(0.2)
		expect(overlay![9]).toBeCloseTo(0.4)
		expect(overlay![10]).toBeCloseTo(0.6)
		expect(overlay![11]).toBe(1)
	})

	it("builds rebel overlays on rebel-held provinces and clears loyalist occupations", () => {
		const overlay = buildPoliticalOccupationOverlay({
			regionProvince: new Int32Array([0, 1, 2, 3]),
			assignment: new Int32Array([7, 7, 7, 1]),
			activeWars: [
				{ idx: 5, attacker: 1, defender: 7, rebel: true, occupied: [1] },
			],
			getNationColorRgb: vi.fn(
				() => [0.9, 0.1, 0.2] as [number, number, number],
			),
		})

		expect(Array.from(overlay ?? [])).toEqual([
			0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
		])
	})

	it("returns no overlay when conflict inputs are missing or produce no stripes", () => {
		expect(
			buildPoliticalOccupationOverlay({
				regionProvince: null,
				assignment: new Int32Array([0]),
				activeWars: [],
				getNationColorRgb: vi.fn(
					() => [0.1, 0.2, 0.3] as [number, number, number],
				),
			}),
		).toBeNull()
		expect(
			buildPoliticalOccupationOverlay({
				regionProvince: new Int32Array([0]),
				assignment: new Int32Array([0]),
				activeWars: [
					{ idx: 4, attacker: 1, defender: 0, rebel: false, occupied: [0] },
				],
				getNationColorRgb: vi.fn(() => null),
			}),
		).toBeNull()
	})

	it("reports rebel hover occupation on rebel-held provinces only", () => {
		const activeWars = [
			{ idx: 5, attacker: 1, defender: 7, rebel: true, occupied: [1] },
		]
		const assignment = new Int32Array([7, 7, 7, 1])

		expect(
			getPoliticalHoverOccupation({
				hoverProvince: 0,
				assignment,
				activeWars,
			}),
		).toEqual({ id: 7, displayColorNationId: 1, rebel: true })
		expect(
			getPoliticalHoverOccupation({
				hoverProvince: 1,
				assignment,
				activeWars,
			}),
		).toBeNull()
	})

	it("reports regular-war hover occupation and handles empty hover inputs", () => {
		expect(
			getPoliticalHoverOccupation({
				hoverProvince: null,
				assignment: new Int32Array([0]),
				activeWars: [],
			}),
		).toBeNull()

		expect(
			getPoliticalHoverOccupation({
				hoverProvince: 2,
				assignment: new Int32Array([0, 1, 2]),
				activeWars: [
					{ idx: 4, attacker: 1, defender: 0, rebel: false, occupied: [2] },
				],
			}),
		).toEqual({ id: 1, displayColorNationId: 1, rebel: false })
	})

	it("uses the loyalist as the hover nation for rebel-held provinces", () => {
		expect(
			getPoliticalHoverNationId({
				hoverProvince: 0,
				assignment: new Int32Array([7, 7, 1]),
				activeWars: [
					{ idx: 5, attacker: 1, defender: 7, rebel: true, occupied: [1] },
				],
			}),
		).toBe(1)
		expect(
			getPoliticalHoverNationId({
				hoverProvince: 1,
				assignment: new Int32Array([7, 7, 1]),
				activeWars: [
					{ idx: 5, attacker: 1, defender: 7, rebel: true, occupied: [1] },
				],
			}),
		).toBe(7)
	})
})

describe("buildCultureBlendOverlay", () => {
	it("sets occColor and mask=1 for regions in provinces with an active blend", () => {
		// 3 regions: province 0 (region 0,1) has blend to culture 1; province 1 (region 2) has no blend
		const overlay = buildCultureBlendOverlay({
			regionProvince: new Int32Array([0, 0, 1]),
			cultureBlendSecondary: new Int32Array([1, -1]), // province 0 → secondary culture 1
			cultureBlendWeight: new Float32Array([0.3, 0]),
			cultureAssignment: new Int32Array([0, 1]), // province 0 = culture 0, province 1 = culture 1
			getOverlayColor: (sec) => {
				const colors = [0.4, 0.5, 0.6, 0.8, 0.3, 0.1]
				return [
					colors[3 * sec],
					colors[3 * sec + 1],
					colors[3 * sec + 2],
				] as const
			},
		})

		expect(overlay).not.toBeNull()
		// Regions 0 and 1 (province 0): secondary culture 1 color, mask=1
		const r0 = Array.from(overlay!.subarray(0, 4))
		const r1 = Array.from(overlay!.subarray(4, 8))
		expect(r0[0]).toBeCloseTo(0.8)
		expect(r0[1]).toBeCloseTo(0.3)
		expect(r0[2]).toBeCloseTo(0.1)
		expect(r0[3]).toBe(1)
		expect(r1[0]).toBeCloseTo(0.8)
		expect(r1[1]).toBeCloseTo(0.3)
		expect(r1[2]).toBeCloseTo(0.1)
		expect(r1[3]).toBe(1)
		// Region 2 (province 1, no blend): zeroed
		expect(Array.from(overlay!.subarray(8, 12))).toEqual([0, 0, 0, 0])
	})

	it("suppresses the stripe when getOverlayColor returns null (e.g. same heritage)", () => {
		const overlay = buildCultureBlendOverlay({
			regionProvince: new Int32Array([0]),
			cultureBlendSecondary: new Int32Array([1]),
			cultureBlendWeight: new Float32Array([0.3]),
			cultureAssignment: new Int32Array([0]),
			getOverlayColor: () => null, // same heritage on both sides
		})
		expect(overlay).toBeNull()
	})

	it("returns null when no provinces have an active blend", () => {
		expect(
			buildCultureBlendOverlay({
				regionProvince: new Int32Array([0, 1]),
				cultureBlendSecondary: new Int32Array([-1, -1]),
				cultureBlendWeight: new Float32Array([0, 0]),
				cultureAssignment: new Int32Array([0, 1]),
				getOverlayColor: () => [0.1, 0.2, 0.3] as const,
			}),
		).toBeNull()
	})

	it("returns null when required inputs are missing", () => {
		expect(
			buildCultureBlendOverlay({
				regionProvince: null,
				cultureBlendSecondary: new Int32Array([1]),
				cultureBlendWeight: new Float32Array([0.3]),
				cultureAssignment: new Int32Array([0]),
				getOverlayColor: () => [0.1, 0.2, 0.3] as const,
			}),
		).toBeNull()
	})
})
