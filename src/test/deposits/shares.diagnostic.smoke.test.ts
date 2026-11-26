import { mkdirSync, writeFileSync } from "node:fs"
import { describe, it } from "vitest"
import { COMMODITIES } from "@/model/geography/terrain/deposits/commodities"
import type { GradeShares } from "@/model/geography/terrain/deposits/commodities/types"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"
import type { StageTiming } from "@/model/shared/timing/types"
import { cachedWorld } from "@/test/tectonics/world-cache"

const DEFAULT_SEEDS = [14963991, 20251107, 77031]
const STAGE = "Post: deposits"

interface SeedShares {
	seed: number
	landRegions: number
	system: GradeShares[]
	commodity: GradeShares[]
	stageMs: number
}

function seeds(): number[] {
	const given = process.env.DEPOSIT_SEEDS
	return given ? given.split(",").map(Number) : DEFAULT_SEEDS
}

function stageMs(timings: StageTiming[] | undefined): number {
	for (const timing of timings ?? []) {
		if (timing.Stage === STAGE) return timing.ms
		const inner = stageMs(timing.children)
		if (inner > 0) return inner
	}
	return 0
}

function sharesOf(seed: number): SeedShares {
	const world = cachedWorld(seed)
	if (!world.deposits) throw new Error("world has no deposits")
	return {
		seed,
		landRegions: world.deposits.landRegions,
		system: world.deposits.shares.system,
		commodity: world.deposits.shares.commodity,
		stageMs: stageMs(world.timings),
	}
}

function atLeastPoor(g: GradeShares): number {
	return g.poor + g.moderate + g.rich
}

function table(rows: SeedShares[]): string {
	const head = `| row | ${rows.map((r) => r.seed).join(" | ")} |\n|---|${rows.map(() => "---").join("|")}|`
	const cell = (g: GradeShares) =>
		`${atLeastPoor(g).toFixed(1)} (${g.moderate.toFixed(1)}+${g.rich.toFixed(1)})`
	const commodities = COMMODITIES.list.map(
		(c, k) =>
			`| ${c.id} | ${rows.map((r) => cell(r.commodity[k])).join(" | ")} |`,
	)
	const systems = SYSTEMS.list.map(
		(s, k) => `| ${s.id} | ${rows.map((r) => cell(r.system[k])).join(" | ")} |`,
	)
	return [
		"Percent of land regions at poor or richer, with moderate+rich in brackets.",
		"",
		"## Commodities",
		head,
		...commodities,
		"",
		"## Systems",
		head,
		...systems,
		"",
		`stage ms: ${rows.map((r) => r.stageMs.toFixed(0)).join(", ")}`,
		`land regions: ${rows.map((r) => r.landRegions).join(", ")}`,
	].join("\n")
}

describe.skipIf(!process.env.DEPOSIT_SHARES)(
	"deposits: shares against expectations",
	() => {
		it("writes the share of land at each grade per commodity and system", () => {
			const rows = seeds().map(sharesOf)
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = `stats/deposits/${stamp}-shares`
			mkdirSync(dir, { recursive: true })
			writeFileSync(`${dir}/shares.json`, JSON.stringify(rows, null, 1))
			writeFileSync(`${dir}/report.md`, table(rows))
		}, 900_000)
	},
)
