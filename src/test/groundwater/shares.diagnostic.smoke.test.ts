import { mkdirSync, writeFileSync } from "node:fs"
import { describe, it } from "vitest"
import { OASES } from "@/model/geography/terrain/groundwater/oases"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { WETLANDS } from "@/model/geography/terrain/groundwater/wetlands"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { UNITS } from "@/model/shared/units"
import { cachedWorld } from "@/test/tectonics/world-cache"

const SEEDS = (process.env.GROUNDWATER_SEEDS ?? "14963991,20251107,77031")
	.split(",")
	.map(Number)
const C = GROUNDWATER_CONFIG
const BINS = 10
const MARSH_STEPS = [C.marshShare - 1 / 3, C.marshShare, C.marshShare + 1 / 3]

interface Shares {
	seed: number
	values: Record<string, number>
}

function sharesOf(seed: number): Shares {
	const world = cachedWorld(seed)
	const {
		groundwater: g,
		groundwaterStats: stats,
		mesh,
		isLand,
		iceThickness,
	} = world
	if (!g || !stats) throw new Error("world has no groundwater")
	const N = mesh.numRegions
	const areaKm2 = UNITS.regionAreasKm2({
		mesh,
		planetRadiusKm: world.params.planetRadiusKm,
	})
	const values: Record<string, number> = {}
	let land = 0
	let landArea = 0
	let emergent = 0
	let springDischarge = 0
	let channel = 0
	let dry = 0
	let dryWithChannel = 0
	const sandHistogram = new Array<number>(BINS).fill(0)
	const marsh = MARSH_STEPS.map(() => 0)
	for (let r = 0; r < N; r++) {
		if (!isLand[r] || iceThickness[r] > 0) continue
		land++
		landArea += areaKm2[r]
		if (g.surfaceM3s[r] > 0) emergent++
		if (g.spring[r] !== 0) springDischarge += g.surfaceM3s[r]
		channel += g.channelRechargeM3s[r]
		sandHistogram[Math.min(BINS - 1, Math.floor((g.sand[r] / 100) * BINS))]++
		MARSH_STEPS.forEach((step, i) => {
			if (g.wetlandShare[r] >= step) marsh[i]++
		})
		if (g.channelRechargeM3s[r] > 0) dryWithChannel++
		dry++
	}
	values["land regions"] = land
	values["land area km2"] = landArea
	values["mean recharge mm"] = stats.meanRechargeMm
	values["recharge km3/yr"] = stats.rechargeKm3PerYear
	values["hydrology baseflow km3/yr"] = stats.hydrologyBaseflowKm3PerYear
	values["recharge exported share"] = stats.exportedShare
	values["recharge discharged share"] = stats.dischargedShare
	values["regions with surfacing flux"] = emergent / Math.max(1, land)
	values["spring discharge m3/s"] = springDischarge
	values["channel recharge m3/s"] = channel
	values["regions with channel recharge"] = dryWithChannel / Math.max(1, dry)
	values["surface share"] = stats.surfaceShare
	values["well reachable share"] = stats.wellReachableShare
	values["wetland share"] = stats.wetlandShare
	values["stage ms"] = stats.stageMs
	stats.depthClassShare.forEach((v, i) => {
		values[`depth class ${i}`] = v
	})
	stats.shallowShare.forEach((v, i) => {
		values[`within ${C.depthClassesM[i]} m`] = v
	})
	for (const kind of SPRINGS.kinds)
		values[`spring ${kind}`] = stats.springCount[kind]
	for (const kind of OASES.kinds)
		values[`oasis ${kind}`] = stats.oasisCount[kind]
	for (const kind of WETLANDS.kinds)
		values[`wetland km2 ${kind}`] = stats.wetlandAreaKm2[kind]
	for (const [cause, share] of Object.entries(stats.wetlandCauseShare))
		values[`wetland cause ${cause}`] = share
	MARSH_STEPS.forEach((step, i) => {
		values[`marsh regions at ${step.toFixed(2)}`] = marsh[i]
	})
	sandHistogram.forEach((v, i) => {
		values[`sand ${i * 10}-${(i + 1) * 10}%`] = v / Math.max(1, land)
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

describe.skipIf(!process.env.GROUNDWATER_SHARES)(
	"groundwater: shares against expectations",
	() => {
		it("writes recharge, water table, spring, oasis and wetland shares", () => {
			const rows = SEEDS.map(sharesOf)
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = `stats/groundwater/${stamp}-shares`
			mkdirSync(dir, { recursive: true })
			writeFileSync(`${dir}/shares.json`, JSON.stringify(rows, null, 1))
			writeFileSync(`${dir}/report.md`, table(rows))
		})
	},
)
