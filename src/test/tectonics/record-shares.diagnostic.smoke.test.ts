import { mkdirSync, writeFileSync } from "node:fs"
import { describe, it } from "vitest"
import { CRUST } from "@/model/geography/tectonics/crust"
import { WORLD_SAMPLE } from "@/model/geography/tectonics/world-sample"
import { cachedWorld } from "./world-cache"

const SEEDS = [14963991, 20251107, 77031]
const PHANEROZOIC_MYR = 540
const COVERED_KM = 0.05

interface Shares {
	seed: number
	landCells: number
	cratonShare: number
	coveredShare: number
	bareShieldShare: number
	epeiricShare: number
	meanFloodedTimeShare: number
	shelfShare: number
	forelandShare: number
	riftBasinShare: number
	meanCoverKm: number
	carbonateShare: number
	evaporiteShare: number
	coalShare: number
	organicShare: number
}

function sharesOf(seed: number): Shares {
	const world = cachedWorld(seed)
	const { crust, sample } = world.presentTectonics!
	const land = WORLD_SAMPLE.gather({ sample, field: world.isLand })
	let n = 0
	let craton = 0
	let covered = 0
	let bare = 0
	let epeiric = 0
	let shelf = 0
	let foreland = 0
	let rift = 0
	let flood = 0
	let km = 0
	let carb = 0
	let salt = 0
	let coal = 0
	let organic = 0
	for (let c = 0; c < crust.numCells; c++) {
		if (!land[c] || crust.type[c] === CRUST.TYPE.OCEAN) continue
		n++
		const cover = crust.coverKm[c]
		if (crust.type[c] === CRUST.TYPE.CRATON) {
			craton++
			if (cover <= COVERED_KM) bare++
		}
		if (cover > COVERED_KM) covered++
		if (crust.geoFlags[c] & CRUST.GEO.EPEIRIC) epeiric++
		if (crust.geoFlags[c] & CRUST.GEO.SHELF) shelf++
		if (crust.geoFlags[c] & CRUST.GEO.FORELAND) foreland++
		if (crust.geoFlags[c] & CRUST.GEO.RIFT_BASIN) rift++
		flood += Math.min(PHANEROZOIC_MYR, crust.floodMyr[c]) / PHANEROZOIC_MYR
		km += cover
		carb += cover * crust.coverCarb[c]
		salt += cover * crust.coverSalt[c]
		coal += cover * crust.coverCoal[c]
		organic += cover * crust.coverOrganic[c]
	}
	const d = Math.max(1, n)
	return {
		seed,
		landCells: n,
		cratonShare: craton / d,
		coveredShare: covered / d,
		bareShieldShare: bare / d,
		epeiricShare: epeiric / d,
		meanFloodedTimeShare: flood / d,
		shelfShare: shelf / d,
		forelandShare: foreland / d,
		riftBasinShare: rift / d,
		meanCoverKm: km / d,
		carbonateShare: carb / Math.max(1e-9, km),
		evaporiteShare: salt / Math.max(1e-9, km),
		coalShare: coal / Math.max(1e-9, km),
		organicShare: organic / Math.max(1e-9, km),
	}
}

describe.skipIf(!process.env.TECTONICS_RECORD_SHARES)(
	"present tectonics: record shares against Earth",
	() => {
		it("writes the shares of the geologic record", () => {
			const rows = SEEDS.map(sharesOf)
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = `stats/tectonics/${stamp}-record-shares`
			mkdirSync(dir, { recursive: true })
			writeFileSync(`${dir}/shares.json`, JSON.stringify(rows, null, 1))
			const keys = Object.keys(rows[0]).filter((k) => k !== "seed")
			const table = [
				`| metric | ${rows.map((r) => r.seed).join(" | ")} |`,
				`|---|${rows.map(() => "---").join("|")}|`,
				...keys.map(
					(k) =>
						`| ${k} | ${rows.map((r) => (r as unknown as Record<string, number>)[k].toFixed(3)).join(" | ")} |`,
				),
			].join("\n")
			writeFileSync(`${dir}/report.md`, table)
		})
	},
)
