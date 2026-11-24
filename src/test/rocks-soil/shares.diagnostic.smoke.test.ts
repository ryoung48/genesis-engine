import { mkdirSync, writeFileSync } from "node:fs"
import { describe, it } from "vitest"
import { KOPPEN } from "@/model/climate/classification/koppen"
import { ROCKS } from "@/model/geography/terrain/rocks"
import type { RockFamily } from "@/model/geography/terrain/rocks/types"
import type { GenesisWorld } from "@/model/pipelines/types"
import type { StageTiming } from "@/model/shared/timing/types"
import { cachedWorld } from "@/test/tectonics/world-cache"

const SEEDS = [14963991, 20251107, 77031]
const SOIL_REF = 0.5
const SOIL_MAX_LOSS = 0.92
const STAGE = "Post: rocks and soil"
const HISTOGRAM_BINS = 10
const FAMILIES: RockFamily[] = [
	"young",
	"sedimentary",
	"metamorphic",
	"plutonic",
	"volcanic",
]

interface Shares {
	seed: number
	landRegions: number
	family: Record<string, number>
	kind: Record<string, number>
	young: Record<string, number>
	glaciatedShare: number
	fertilityBelowRefShare: number
	meanFertility: number
	meanSoilFactor: number
	desertMeanFertility: number
	fertilityHistogram: number[]
	stageMs: number
}

function stageMs(timings: StageTiming[] | undefined): number {
	for (const timing of timings ?? []) {
		if (timing.Stage === STAGE) return timing.ms
		const inner = stageMs(timing.children)
		if (inner > 0) return inner
	}
	return 0
}

function sharesOf(seed: number): Shares {
	const world: GenesisWorld = cachedWorld(seed)
	const { rock, youngKind, glaciated, soilFertility, isLand } = world
	if (!rock || !youngKind || !glaciated || !soilFertility)
		throw new Error("world has no rock and soil")
	let land = 0
	const family: Record<string, number> = {}
	const kind: Record<string, number> = {}
	const young: Record<string, number> = {}
	const histogram = new Array<number>(HISTOGRAM_BINS).fill(0)
	let glacial = 0
	let below = 0
	let fertility = 0
	let factor = 0
	let desert = 0
	let desertFertility = 0
	for (let r = 0; r < isLand.length; r++) {
		if (!isLand[r]) continue
		land++
		const name = ROCKS.kinds[rock[r]]
		kind[name] = (kind[name] ?? 0) + 1
		const group = ROCKS.info[name].family
		if (group) family[group] = (family[group] ?? 0) + 1
		if (name === "young") {
			const tag = ROCKS.youngKinds[youngKind[r]]
			young[tag] = (young[tag] ?? 0) + 1
		}
		if (glaciated[r]) glacial++
		const f = soilFertility[r]
		fertility += f
		if (KOPPEN.koppenLabels[world.koppenClimate[r]].startsWith("BW")) {
			desert++
			desertFertility += f
		}
		if (f < SOIL_REF) below++
		factor += Math.max(1 - SOIL_MAX_LOSS, Math.min(1, f / SOIL_REF))
		histogram[Math.min(HISTOGRAM_BINS - 1, Math.floor(f * HISTOGRAM_BINS))]++
	}
	const d = Math.max(1, land)
	const share = (counts: Record<string, number>) =>
		Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / d]))
	return {
		seed,
		landRegions: land,
		family: share(family),
		kind: share(kind),
		young: share(young),
		glaciatedShare: glacial / d,
		fertilityBelowRefShare: below / d,
		meanFertility: fertility / d,
		meanSoilFactor: factor / d,
		desertMeanFertility: desertFertility / Math.max(1, desert),
		fertilityHistogram: histogram.map((v) => v / d),
		stageMs: stageMs(world.timings),
	}
}

function table(rows: Shares[]): string {
	const head = `| metric | ${rows.map((r) => r.seed).join(" | ")} |\n|---|${rows.map(() => "---").join("|")}|`
	const line = (label: string, pick: (row: Shares) => number) =>
		`| ${label} | ${rows.map((r) => pick(r).toFixed(3)).join(" | ")} |`
	return [
		head,
		line("land regions", (r) => r.landRegions),
		...FAMILIES.map((f) => line(`family ${f}`, (r) => r.family[f] ?? 0)),
		...ROCKS.kinds
			.filter((k) => k !== "sea")
			.map((k) => line(`kind ${k}`, (r) => r.kind[k] ?? 0)),
		...ROCKS.youngKinds
			.filter((k) => k !== "none")
			.map((k) => line(`young ${k}`, (r) => r.young[k] ?? 0)),
		line("glaciated", (r) => r.glaciatedShare),
		line("fertility below ref", (r) => r.fertilityBelowRefShare),
		line("mean fertility", (r) => r.meanFertility),
		line("mean soil factor", (r) => r.meanSoilFactor),
		line("desert mean fertility", (r) => r.desertMeanFertility),
		line("rocks and soil stage ms", (r) => r.stageMs),
		...Array.from({ length: HISTOGRAM_BINS }, (_, b) =>
			line(
				`fertility ${(b / HISTOGRAM_BINS).toFixed(1)}..${((b + 1) / HISTOGRAM_BINS).toFixed(1)}`,
				(r) => r.fertilityHistogram[b],
			),
		),
	].join("\n")
}

describe.skipIf(!process.env.ROCK_SOIL_SHARES)(
	"rocks and soil: shares against expectations",
	() => {
		it("writes the shares of rock, young sediment and soil", () => {
			const rows = SEEDS.map(sharesOf)
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = `stats/rocks-soil/${stamp}-shares`
			mkdirSync(dir, { recursive: true })
			writeFileSync(`${dir}/shares.json`, JSON.stringify(rows, null, 1))
			writeFileSync(`${dir}/report.md`, table(rows))
		})
	},
)
