import { mkdirSync, writeFileSync } from "node:fs"
import { describe, it } from "vitest"
import { cachedWorld } from "@/test/tectonics/world-cache"

const SEEDS = (process.env.SHORE_SEEDS ?? "14963991,20251107,77031")
	.split(",")
	.map(Number)

interface Shares {
	seed: number
	values: Record<string, number>
}

function percentRecord({
	prefix,
	counts,
	total,
	values,
}: {
	prefix: string
	counts: Record<string, number>
	total: number
	values: Record<string, number>
}) {
	for (const [kind, count] of Object.entries(counts))
		values[`${prefix} ${kind} %`] = (100 * count) / Math.max(1, total)
}

function sharesOf(seed: number): Shares {
	const world = cachedWorld(seed)
	const stats = world.shoreStats
	if (!stats) throw new Error("world has no shore stats")
	let land = 0
	for (let r = 0; r < world.mesh.numRegions; r++) land += world.isLand[r]
	const total = stats.coastalRegions
	const values: Record<string, number> = {
		"land regions": land,
		"coastal land regions": total,
		"coastal share of land %": (100 * total) / Math.max(1, land),
		"volcanic sand %": (100 * stats.volcanicSand) / Math.max(1, total),
		"stage ms": stats.stageMs,
	}
	percentRecord({ prefix: "label", counts: stats.label, total, values })
	percentRecord({ prefix: "open", counts: stats.exposureOpen, total, values })
	percentRecord({ prefix: "lee", counts: stats.exposureLee, total, values })
	percentRecord({ prefix: "relief", counts: stats.relief, total, values })
	percentRecord({ prefix: "material", counts: stats.material, total, values })
	percentRecord({ prefix: "habitat", counts: stats.habitat, total, values })
	percentRecord({ prefix: "setting", counts: stats.setting, total, values })
	return { seed, values }
}

function table(rows: Shares[]): string {
	const head = `| metric | ${rows.map((r) => r.seed).join(" | ")} |\n|---|${rows.map(() => "---").join("|")}|`
	const lines = Object.keys(rows[0].values).map(
		(key) =>
			`| ${key} | ${rows.map((r) => r.values[key].toPrecision(4)).join(" | ")} |`,
	)
	return [head, ...lines].join("\n")
}

describe.skipIf(!process.env.SHORE_SHARES)("shoreline: shares", () => {
	it("writes label, exposure, relief, material, habitat and setting shares", () => {
		const rows = SEEDS.map(sharesOf)
		const stamp = new Date().toISOString().replace(/[:.]/g, "-")
		const dir = `stats/shore/${stamp}-shares`
		mkdirSync(dir, { recursive: true })
		writeFileSync(`${dir}/shares.json`, JSON.stringify(rows, null, 1))
		writeFileSync(`${dir}/report.md`, table(rows))
	})
})
