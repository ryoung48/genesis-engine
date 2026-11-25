import { mkdirSync, writeFileSync } from "node:fs"
import { describe, it } from "vitest"
import { CAVES } from "@/model/geography/terrain/caves"
import { KARST } from "@/model/geography/terrain/karst"
import { KARST_CAVES } from "@/model/geography/terrain/karst-caves"
import type { GenesisWorld } from "@/model/pipelines/types"
import { cachedWorld } from "@/test/tectonics/world-cache"

const SEEDS = (process.env.KARST_SEEDS ?? "14963991,20251107,77031")
	.split(",")
	.map(Number)

interface Shares {
	seed: number
	values: Record<string, number>
}

function percentRecord({
	prefix,
	shares,
	values,
}: {
	prefix: string
	shares: Record<string, number>
	values: Record<string, number>
}) {
	for (const [kind, share] of Object.entries(shares))
		values[`${prefix} ${kind} %`] = 100 * share
}

function crossShares({
	world,
	values,
}: {
	world: GenesisWorld
	values: Record<string, number>
}) {
	const { karst } = world
	if (!karst) throw new Error("world has no karst layers")
	let land = 0
	for (let r = 0; r < world.isLand.length; r++) {
		if (!world.isLand[r]) continue
		land++
		const kind = KARST.kinds[karst.kind[r]]
		const key = `${kind}/${KARST_CAVES.classes[karst.karstClass[r]]} %`
		values[key] = (values[key] ?? 0) + 1
		const act = `${kind}/${KARST.activities[karst.activity[r]]} activity %`
		values[act] = (values[act] ?? 0) + 1
	}
	for (const key of Object.keys(values))
		if (key.includes("/")) values[key] = (100 * values[key]) / land
}

function lengthQuantiles({
	world,
	values,
}: {
	world: GenesisWorld
	values: Record<string, number>
}) {
	const { caveSites } = world
	if (!caveSites) throw new Error("world has no cave sites")
	for (let t = 0; t < CAVES.types.length; t++) {
		const lengths: number[] = []
		for (let i = 0; i < caveSites.type.length; i++)
			if (caveSites.type[i] === t) lengths.push(caveSites.lengthM[i])
		lengths.sort((a, b) => a - b)
		const name = CAVES.types[t]
		values[`${name} sites`] = lengths.length
		for (const p of [0.1, 0.5, 0.9])
			values[`${name} length p${100 * p} m`] = lengths.length
				? lengths[Math.min(lengths.length - 1, Math.floor(p * lengths.length))]
				: 0
	}
}

function sharesOf(seed: number): Shares {
	const world = cachedWorld(seed)
	const stats = world.karstStats
	if (!stats) throw new Error("world has no karst stats")
	const values: Record<string, number> = {
		"land regions": stats.landRegions,
		"sites per 100 land regions": stats.sitesPer100,
		"long solution sites %": 100 * stats.longSolutionShare,
		"stage ms": stats.stageMs,
	}
	percentRecord({ prefix: "kind", shares: stats.kindShare, values })
	percentRecord({ prefix: "class", shares: stats.classShare, values })
	percentRecord({ prefix: "activity", shares: stats.activityShare, values })
	percentRecord({ prefix: "presence", shares: stats.presenceShare, values })
	percentRecord({ prefix: "sites", shares: stats.siteShare, values })
	crossShares({ world, values })
	lengthQuantiles({ world, values })
	return { seed, values }
}

function table(rows: Shares[]): string {
	const head = `| metric | ${rows.map((r) => r.seed).join(" | ")} |\n|---|${rows.map(() => "---").join("|")}|`
	const lines = Object.keys(rows[0].values).map(
		(key) =>
			`| ${key} | ${rows.map((r) => (r.values[key] ?? 0).toPrecision(4)).join(" | ")} |`,
	)
	return [head, ...lines].join("\n")
}

describe.skipIf(!process.env.KARST_SHARES)("karst: shares", () => {
	it("writes kind, class, activity, presence and site shares", () => {
		const rows = SEEDS.map(sharesOf)
		const stamp = new Date().toISOString().replace(/[:.]/g, "-")
		const dir = `stats/karst/${stamp}-shares`
		mkdirSync(dir, { recursive: true })
		writeFileSync(`${dir}/shares.json`, JSON.stringify(rows, null, 1))
		writeFileSync(`${dir}/report.md`, table(rows))
	}, 900_000)
})
