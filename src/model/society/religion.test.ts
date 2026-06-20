import { describe, expect, it } from "vitest"

import {
	assignReligionTypes,
	buildReligionColors,
	computeReligions,
	RELIGION_TYPE_NAMES,
} from "./religion"

function assignTypes(params?: {
	religionCount?: number
	governmentType?: number
	migrationWave?: number
	sizeWeight?: number
	seed?: number
}) {
	const religionCount = params?.religionCount ?? 512
	const cultureToReligion = Int32Array.from(
		{ length: religionCount },
		(_, index) => index,
	)
	const cultureAssignment = Int32Array.from(
		{ length: religionCount },
		(_, index) => index,
	)

	return assignReligionTypes({
		religionCount,
		cultureToReligion,
		cultureCount: religionCount,
		provinceCount: religionCount,
		cultureAssignment,
		governmentType: new Uint8Array(religionCount).fill(
			params?.governmentType ?? 8,
		),
		migrationWave: new Float32Array(religionCount).fill(
			params?.migrationWave ?? 0.1,
		),
		sizeWeight: params?.sizeWeight ?? 0.3,
		seed: params?.seed ?? 12345,
	})
}

describe("religions", () => {
	it("clusters active cultures into roughly a quarter as many religions", () => {
		const religions = computeReligions(
			{
				assignment: new Int32Array([0, 1, 2, 3]),
				seeds: new Int32Array([0, 1, 2, 3]),
				count: 4,
				adjOffset: new Int32Array([0, 1, 3, 5, 6]),
				adjList: new Int32Array([1, 0, 2, 1, 3, 2]),
				size: new Int32Array([1, 1, 1, 1]),
				colors: new Float32Array(12),
			},
			7,
		)

		expect(religions.count).toBe(1)
		expect(new Set(Array.from(religions.assignment))).toEqual(new Set([0]))
	})

	it("uses the renamed non-theistic and non-religious labels", () => {
		expect(RELIGION_TYPE_NAMES).toContain("Non-theistic")
		expect(RELIGION_TYPE_NAMES).toContain("Non-religious")
		expect(RELIGION_TYPE_NAMES).not.toContain("Pluralistic")
		expect(RELIGION_TYPE_NAMES).not.toContain("Nontheistic")
		expect(RELIGION_TYPE_NAMES).not.toContain("Atheistic")
	})

	it("disallows non-religious types before the industrial era", () => {
		const types = assignTypes({
			governmentType: 8,
			migrationWave: 0.1,
			sizeWeight: 0.45,
		})

		expect(Array.from(types)).not.toContain(5)
	})

	it("still allows non-religious types in industrial-era societies", () => {
		const types = assignTypes({
			governmentType: 8,
			migrationWave: 0.1,
			sizeWeight: 0.3,
		})

		expect(Array.from(types)).toContain(5)
	})

	it("keeps dualistic outcomes below their prior frequency in theocratic societies", () => {
		const types = assignTypes({
			religionCount: 1000,
			governmentType: 13,
			migrationWave: 0.5,
			sizeWeight: 0.55,
		})

		const dualisticCount = Array.from(types).filter((type) => type === 2).length
		expect(dualisticCount).toBeLessThan(175)
	})

	it("gives religions of the same type identical colors", () => {
		const colors = buildReligionColors({
			religionCount: 3,
			religionTypes: new Uint8Array([3, 3, 3]),
		})

		expect(Array.from(colors.slice(0, 3))).toEqual(
			Array.from(colors.slice(3, 6)),
		)
		expect(Array.from(colors.slice(3, 6))).toEqual(
			Array.from(colors.slice(6, 9)),
		)
	})
})
