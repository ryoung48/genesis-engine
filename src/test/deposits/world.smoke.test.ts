import { beforeAll, describe, expect, it } from "vitest"
import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import { COMMODITIES } from "@/model/geography/terrain/deposits/commodities"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import type { SystemId } from "@/model/geography/terrain/deposits/systems/types"
import { LAKES } from "@/model/geography/terrain/lakes"
import { ROCKS } from "@/model/geography/terrain/rocks"
import type { RockKind } from "@/model/geography/terrain/rocks/types"
import type { GenesisWorld } from "@/model/pipelines/types"
import { cachedWorld } from "@/test/tectonics/world-cache"

const SEED = 77031
const BYTE = 255
const LATERITE_MIN_C = 15
const SAND_COAST_MIN = 50
const GEM_SHARE_MAX = 5
const REST = 0.15
const GARNET_WEIGHT = 0.25

const STONE_ROCKS: RockKind[] = [
	"limestone",
	"sandstone",
	"granite",
	"gneiss",
	"shield",
	"greenstone",
	"basalt",
	"volcanic",
	"ophiolite",
	"slate",
]

let world: GenesisWorld
let rows: Uint8Array
let n: number

function row(system: SystemId, r: number): number {
	return rows[SYSTEMS.index[system] * n + r] / BYTE
}

function failures(check: (bad: string[]) => void): string[] {
	const bad: string[] = []
	check(bad)
	return bad.slice(0, 5)
}

function rockKind(r: number): RockKind {
	return ROCKS.kinds[world.rock?.[r] ?? 0]
}

describe("deposits on a generated world", () => {
	beforeAll(() => {
		world = cachedWorld(SEED)
		if (!world.deposits) throw new Error("world has no deposits")
		rows = world.deposits.rows
		n = world.isLand.length
	}, 300_000)

	it("stores one byte row per system and no commodity rows", () => {
		expect(rows.length).toBe(SYSTEMS.count * n)
	})

	it("records the deposits stage in the timings", () => {
		const names: string[] = []
		const walk = (list: NonNullable<GenesisWorld["timings"]>) => {
			for (const timing of list) {
				names.push(timing.Stage)
				if (timing.children) walk(timing.children)
			}
		}
		walk(world.timings ?? [])
		expect(names).toContain("Post: deposits")
	})

	it("leaves sea regions empty except for salt lakes and shelf oil and gas", () => {
		const allowed = new Set<SystemId>(["salt", "oil", "gas"])
		const bad = failures((out) => {
			for (let r = 0; r < n; r++) {
				if (world.isLand[r]) continue
				for (const system of SYSTEMS.list)
					if (!allowed.has(system.id) && row(system.id, r) !== 0)
						out.push(`${system.id} at ${r}`)
			}
		})
		expect(bad).toEqual([])
	})

	it("has no iron laterite where the climate is cooler than 15 C", () => {
		const temperature = world.climate.temperature_avg
		const bad = failures((out) => {
			for (let r = 0; r < n; r++)
				if (
					world.isLand[r] &&
					temperature[r] < LATERITE_MIN_C &&
					row("ironLaterite", r) !== 0
				)
					out.push(`region ${r}`)
		})
		expect(bad).toEqual([])
	})

	it("puts salt on every salt lake and pan region", () => {
		const lakeKind = world.rivers.lakeKind
		let seen = 0
		for (let r = 0; r < n; r++) {
			if (
				lakeKind[r] !== LAKES.kindCode.salt &&
				lakeKind[r] !== LAKES.kindCode.pan
			)
				continue
			seen++
			expect(row("salt", r), `region ${r}`).toBeGreaterThan(0)
		}
		expect(seen).toBeGreaterThan(0)
	})

	it("keeps building stone to stone rocks and clay richest on young sediment", () => {
		const allowed = new Set<RockKind>(STONE_ROCKS)
		let young = 0
		let youngCount = 0
		let other = 0
		let otherCount = 0
		const bad = failures((out) => {
			for (let r = 0; r < n; r++)
				if (
					world.isLand[r] &&
					!allowed.has(rockKind(r)) &&
					row("stone", r) !== 0
				)
					out.push(`region ${r}`)
		})
		expect(bad).toEqual([])
		for (let r = 0; r < n; r++) {
			if (!world.isLand[r]) continue
			if (rockKind(r) === "young") {
				young += row("clay", r)
				youngCount++
			} else {
				other += row("clay", r)
				otherCount++
			}
		}
		expect(young / youngCount).toBeGreaterThan(other / otherCount)
	})

	it("makes sand of every erg, none under ice or at sea, and coastal sand only on sandy coasts", () => {
		const { youngKind, glaciated } = world
		const sand = world.groundwater?.sand
		if (!youngKind || !glaciated || !sand) throw new Error("no surface")
		const bad = failures((out) => {
			for (let r = 0; r < n; r++) {
				const value = row("sand", r)
				if (!world.isLand[r] || glaciated[r]) {
					if (value !== 0) out.push(`sea or ice ${r}`)
					continue
				}
				const erg =
					rockKind(r) === "young" && youngKind[r] === ROCKS.youngCode.erg
				if (erg) {
					const [floor, peak] = DEPOSIT_CONFIG.sandErg
					if (value < floor - 1 / BYTE || value > peak + 1 / BYTE)
						out.push(`erg ${r}`)
				} else if (
					value > 0 &&
					!(world.coastal[r] === 1 && sand[r] >= SAND_COAST_MIN)
				)
					out.push(`coast ${r}`)
			}
		})
		expect(bad).toEqual([])
	})

	it("holds each rock-derived mineral to its host rock", () => {
		const bad = failures((out) => {
			for (let r = 0; r < n; r++) {
				if (!world.isLand[r]) continue
				const kind = rockKind(r)
				if (row("alum", r) > 0 && kind !== "volcanic" && kind !== "shale")
					out.push(`alum ${r}`)
				if (
					row("mercury", r) > 0 &&
					!["volcanic", "ophiolite", "slate"].includes(kind)
				)
					out.push(`mercury ${r}`)
				if (row("amber", r) > 0 && world.coastal[r] !== 1)
					out.push(`amber ${r}`)
				if (world.glaciated?.[r] && row("saltpeter", r) > 0)
					out.push(`saltpeter ${r}`)
			}
		})
		expect(bad).toEqual([])
	})

	it("holds each gem to its setting", () => {
		const bad = failures((out) => {
			for (let r = 0; r < n; r++) {
				if (!world.isLand[r]) continue
				const kind = rockKind(r)
				if (row("amethyst", r) > 0 && kind !== "basalt")
					out.push(`amethyst ${r}`)
				if (row("lapis", r) > 0 && kind !== "granite") out.push(`lapis ${r}`)
				if (
					row("opal", r) > 0 &&
					!["sandstone", "shale", "volcanic"].includes(kind)
				)
					out.push(`opal ${r}`)
				if (row("basaltGems", r) > 0 && kind !== "basalt" && kind !== "young")
					out.push(`basaltGems ${r}`)
			}
		})
		expect(bad).toEqual([])
	})

	it("keeps every single gem system under 5% of land at poor or richer", () => {
		const shares = world.deposits?.shares.system
		if (!shares) throw new Error("no shares")
		for (const id of [
			"pegmatite",
			"emerald",
			"corundum",
			"lapis",
			"basaltGems",
			"amethyst",
			"opal",
			"turquoise",
			"gemPlacer",
		] as const) {
			const g = shares[SYSTEMS.index[id]]
			expect(g.poor + g.moderate + g.rich, id).toBeLessThan(GEM_SHARE_MAX)
		}
	})

	it("rolls commodities up from the stored bytes as the strongest source plus a seventh of the rest", () => {
		const gems = COMMODITIES.list[COMMODITIES.index.gems]
		const bad = failures((out) => {
			for (let r = 0; r < n; r += 7) {
				let strongest = 0
				let total = 0
				for (const [id, weight] of gems.sources) {
					const v = weight * row(id, r)
					strongest = Math.max(strongest, v)
					total += v
				}
				const expected = Math.min(1, strongest + REST * (total - strongest))
				const got = COMMODITIES.richness({
					rows,
					numRegions: n,
					region: r,
					commodity: COMMODITIES.index.gems,
				})
				if (Math.abs(got - expected) > 1e-9) out.push(`region ${r}`)
			}
		})
		expect(bad).toEqual([])
		const garnet = gems.sources.find(([id]) => id === "garnet")
		expect(garnet?.[1]).toBe(GARNET_WEIGHT)
	})

	it("feeds every stored system into some commodity", () => {
		const used = new Set<SystemId>()
		for (const commodity of COMMODITIES.list)
			for (const [id] of commodity.sources) used.add(id)
		for (const system of SYSTEMS.list)
			expect(used.has(system.id), system.id).toBe(true)
	})

	it("has every commodity somewhere and orders iron above copper above gold above tin", () => {
		const shares = world.deposits?.shares.commodity
		if (!shares) throw new Error("no shares")
		const reach = (id: keyof typeof COMMODITIES.index) => {
			const g = shares[COMMODITIES.index[id]]
			return g.poor + g.moderate + g.rich
		}
		for (const commodity of COMMODITIES.list)
			expect(reach(commodity.id), commodity.id).toBeGreaterThan(0)
		expect(reach("iron")).toBeGreaterThan(reach("copper"))
		expect(reach("copper")).toBeGreaterThan(reach("gold"))
		expect(reach("gold")).toBeGreaterThan(reach("tin"))
	})
})
