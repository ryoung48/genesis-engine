import { describe, expect, it } from "vitest"
import { HOSTS } from "@/model/geography/terrain/deposits/hosts"
import { ROCKS } from "@/model/geography/terrain/rocks"

const T = HOSTS.tables
const BARED = { young: 0.3, cover: 0.25, basement: 1 }

describe("host gating", () => {
	it("shows a basement ore under young sediment at 0.3 of its bared value", () => {
		expect(T.bared[ROCKS.code.young]).toBeCloseTo(BARED.young, 6)
	})

	it("shows it under cover at 0.25 and on exposed basement at 1", () => {
		for (const kind of ["sandstone", "shale", "limestone", "salt"] as const)
			expect(T.bared[ROCKS.code[kind]]).toBeCloseTo(BARED.cover, 6)
		for (const kind of ["granite", "gneiss", "slate", "volcanic"] as const)
			expect(T.bared[ROCKS.code[kind]]).toBeCloseTo(BARED.basement, 6)
	})

	it("keeps every host term in 0..1.5 and the bared term zero at sea", () => {
		for (const table of Object.values(T))
			for (let code = 0; code < table.length; code++) {
				expect(table[code]).toBeGreaterThanOrEqual(0)
				expect(table[code]).toBeLessThanOrEqual(1.5)
			}
		expect(T.bared[ROCKS.code.sea]).toBe(0)
	})

	it("hosts clay on young sediment, amethyst on basalt and coal in sandstone", () => {
		expect(T.clay[ROCKS.code.young]).toBeGreaterThan(T.clay[ROCKS.code.granite])
		expect(T.amethyst[ROCKS.code.basalt]).toBeGreaterThan(0)
		expect(T.amethyst[ROCKS.code.granite]).toBe(0)
		expect(T.coal[ROCKS.code.sandstone]).toBeGreaterThan(
			T.coal[ROCKS.code.granite],
		)
	})
})
