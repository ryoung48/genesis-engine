import { describe, expect, it } from "vitest"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import { ERAS } from "@/model/society/eras"
import type {
	GenesisNationHierarchy,
	GenesisProvinces,
} from "@/model/society/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const SEEDS = (process.env.HM_SEEDS ?? "14963991")
	.split(",")
	.map((seed) => Number(seed))
const NUM_POINTS = Number(
	process.env.HM_POINTS ?? DEFAULT_WORLD_PARAMS.numPoints,
)

const TRIBAL = ERAS.governmentTypes.indexOf("tribal_government")
const FEUDAL = ERAS.governmentTypes.indexOf("feudal_government")
const BUREAUCRATIC = ERAS.governmentTypes.indexOf("bureaucratic_government")
const REPUBLIC = ERAS.governmentTypes.indexOf("republic_government")
const THEOCRACY = ERAS.governmentTypes.indexOf("theocracy")

const SIZE_ROWS: [number, number][] = [
	[1, 1],
	[2, 4],
	[5, 9],
	[10, 24],
	[25, Infinity],
]

interface AnalyzeParams {
	nations: GenesisNationHierarchy
	provinces: GenesisProvinces
}

interface Report {
	nationCount: number
	buckets: {
		range: string
		count: number
		tribal: number
		feudal: number
		bureaucratic: number
	}[]
	owned: number
	republic: number
	theocracy: number
	tribalMarks: number
	feudalNationProvincesSize2Plus: number
	feudalMarks: number
	tribalProvincesSize2Plus: number
	nestedMarks: number
	tribalPockets: number
	feudalPockets: number
	tribalMarkProvinces: number
	feudalMarkProvinces: number
	violations: string[]
}

function analyze({ nations, provinces }: AnalyzeParams): Report {
	const { governmentType, parent, childOffset, seeds, assignment, size } =
		nations
	if (!governmentType) throw new Error("no governmentType")
	const P = assignment.length
	const nationGov = Array.from(seeds, (root) => governmentType[root])
	const violations: string[] = []
	const buckets = SIZE_ROWS.map(([lo, hi]) => ({
		range: `${lo}-${hi}`,
		count: 0,
		tribal: 0,
		feudal: 0,
		bureaucratic: 0,
	}))
	for (let n = 0; n < nations.count; n++) {
		const row = SIZE_ROWS.findIndex(([, hi]) => size[n] <= hi)
		buckets[row].count++
		if (nationGov[n] === TRIBAL) buckets[row].tribal++
		else if (nationGov[n] === FEUDAL) buckets[row].feudal++
		else if (nationGov[n] === BUREAUCRATIC) {
			buckets[row].bureaucratic++
			if (size[n] < 10)
				violations.push(`bureaucratic nation ${n} size ${size[n]}`)
		} else violations.push(`nation ${n} has government ${nationGov[n]}`)
	}
	let owned = 0
	let republic = 0
	let theocracy = 0
	let tribalMarks = 0
	let feudalMarks = 0
	let nestedMarks = 0
	let tribalPockets = 0
	let feudalPockets = 0
	let tribalMarkProvinces = 0
	let feudalMarkProvinces = 0
	let feudalNationProvincesSize2Plus = 0
	let tribalProvincesSize2Plus = 0
	for (let p = 0; p < P; p++) {
		const n = assignment[p]
		if (n < 0) continue
		owned++
		const gov = governmentType[p]
		if (nationGov[n] === FEUDAL && size[n] >= 2)
			feudalNationProvincesSize2Plus++
		if (nationGov[n] === TRIBAL && size[n] >= 2) tribalProvincesSize2Plus++
		const isRoot = parent[p] < 0
		if (isRoot) {
			if (gov !== nationGov[n]) violations.push(`root ${p} differs from nation`)
			continue
		}
		if (nationGov[n] === BUREAUCRATIC && gov !== BUREAUCRATIC)
			violations.push(`bureaucratic nation ${n} has mark at ${p}`)
		const boundary = gov !== governmentType[parent[p]]
		if (boundary) {
			let up = parent[p]
			while (up >= 0 && governmentType[up] === gov) up = parent[up]
			if (up >= 0 && governmentType[up] !== nationGov[n]) nestedMarks++
		}
		if (gov === REPUBLIC || gov === THEOCRACY) {
			if (gov === REPUBLIC) republic++
			else theocracy++
			if (childOffset[p] !== childOffset[p + 1])
				violations.push(`civic mark ${p} is not a leaf`)
			for (
				let i = provinces.adjOffset[p];
				i < provinces.adjOffset[p + 1];
				i++
			) {
				const other = governmentType[provinces.adjList[i]]
				if (
					assignment[provinces.adjList[i]] >= 0 &&
					(other === REPUBLIC || other === THEOCRACY)
				)
					violations.push(
						`civic marks ${p} and ${provinces.adjList[i]} adjacent`,
					)
			}
		}
		if (boundary && gov === TRIBAL && nationGov[n] === FEUDAL) {
			tribalMarks++
			if (childOffset[p] !== childOffset[p + 1]) tribalPockets++
		}
		if (boundary && gov === FEUDAL && nationGov[n] === TRIBAL) {
			feudalMarks++
			if (childOffset[p] !== childOffset[p + 1]) feudalPockets++
		}
		if (gov === TRIBAL && nationGov[n] === FEUDAL) tribalMarkProvinces++
		if (gov === FEUDAL && nationGov[n] === TRIBAL) feudalMarkProvinces++
	}
	return {
		nationCount: nations.count,
		buckets,
		owned,
		republic,
		theocracy,
		tribalMarks,
		feudalNationProvincesSize2Plus,
		feudalMarks,
		tribalProvincesSize2Plus,
		nestedMarks,
		tribalPockets,
		feudalPockets,
		tribalMarkProvinces,
		feudalMarkProvinces,
		violations,
	}
}

function checkShares(report: Report): void {
	const government = ERAS.eraConfigs.highMedieval.government
	if (government.model !== "sized") throw new Error("expected sized model")
	report.buckets.forEach((bucket, row) => {
		const target = government.sizeShares[row]
		for (const kind of ["tribal", "feudal", "bureaucratic"] as const) {
			const tolerance = bucket.count < 20 ? 1 : 0.05 * bucket.count
			expect(
				Math.abs(bucket[kind] - target[kind] * bucket.count),
				`${bucket.range} ${kind}`,
			).toBeLessThanOrEqual(tolerance)
		}
	})
	expect(
		report.buckets[3].bureaucratic + report.buckets[4].bureaucratic,
	).toBeGreaterThan(0)
	expect(report.republic / report.owned).toBeGreaterThanOrEqual(0.002)
	expect(report.republic / report.owned).toBeLessThanOrEqual(0.006)
	expect(report.theocracy / report.owned).toBeGreaterThanOrEqual(0.007)
	expect(report.theocracy / report.owned).toBeLessThanOrEqual(0.013)
}

describe("highMedieval government", () => {
	for (const seed of SEEDS) {
		it(`seed ${seed}`, () => {
			const generated = GENERATE_WORLD.generateGenesisWorld({
				params: {
					...DEFAULT_WORLD_PARAMS,
					seed,
					era: "highMedieval",
					numPoints: NUM_POINTS,
					tideLock: null,
				},
			})
			const nations = generated.nations
			const provinces = generated.provinces
			if (!nations || !provinces) throw new Error("no nations")
			const report = analyze({ nations, provinces })
			process.stdout.write(`${JSON.stringify(report, null, 1)}\n`)
			expect(report.violations).toEqual([])
			checkShares(report)
		}, 3_600_000)
	}
})
