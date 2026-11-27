import { mkdirSync, writeFileSync } from "node:fs"
import { describe, it } from "vitest"
import { cachedWorld } from "@/test/tectonics/world-cache"

const SEEDS = (process.env.SEABED_SEEDS ?? "14963991,20251107,77031")
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
	const stats = world.seabedStats
	const seabed = world.seabed
	if (!stats || !seabed) throw new Error("world has no seabed stats")
	let habitatCells = 0
	let shareSum = 0
	const shares: number[] = []
	for (let r = 0; r < world.mesh.numRegions; r++)
		if (seabed.habitat[r] > 0) {
			habitatCells++
			shareSum += seabed.share[r]
			shares.push(seabed.share[r])
		}
	shares.sort((a, b) => a - b)
	const total = stats.oceanCells
	const values: Record<string, number> = {
		"ocean cells": total,
		"reached cells": stats.reachedCells,
		"reached share of ocean %": (100 * stats.reachedCells) / Math.max(1, total),
		"habitat cells": habitatCells,
		"habitat share of ocean %": (100 * habitatCells) / Math.max(1, total),
		"mean habitat share %": shareSum / Math.max(1, habitatCells),
		"median habitat share %": shares[Math.floor(shares.length / 2)] ?? 0,
		"stage ms": stats.stageMs,
	}
	percentRecord({
		prefix: "habitat",
		counts: stats.habitat,
		total: habitatCells,
		values,
	})
	percentRecord({
		prefix: "substrate",
		counts: stats.substrate,
		total: stats.reachedCells,
		values,
	})
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

describe.skipIf(!process.env.SEABED_SHARES)("seabed: shares", () => {
	it("writes habitat shares", () => {
		const rows = SEEDS.map(sharesOf)
		const stamp = new Date().toISOString().replace(/[:.]/g, "-")
		const dir = `stats/seabed/${stamp}-shares`
		mkdirSync(dir, { recursive: true })
		writeFileSync(`${dir}/shares.json`, JSON.stringify(rows, null, 1))
		writeFileSync(`${dir}/report.md`, table(rows))
	})
})
