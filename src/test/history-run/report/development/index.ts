import type {
	DevelopmentReport,
	DevelopmentReportParams,
} from "@/test/history-run/report/development/types"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics"

const BAND_EDGES = [0.05, 0.1, 0.25, 0.5]

function summarize({
	generated,
}: DevelopmentReportParams): DevelopmentReport | null {
	const development = generated.development
	const provinces = generated.provinces
	const area = provinces?.areaKm2
	const population = generated.population?.population
	if (!development || !provinces || !area || !population) return null
	const land = new Array<number>(BAND_EDGES.length + 1).fill(0)
	const people = new Array<number>(BAND_EDGES.length + 1).fill(0)
	const values: number[] = []
	const weights: number[] = []
	let landTotal = 0
	let peopleTotal = 0
	for (let p = 0; p < provinces.count; p++) {
		if (provinces.desolate[p] || !(area[p] > 0)) continue
		const value = development[p]
		let band = 0
		while (band < BAND_EDGES.length && value >= BAND_EDGES[band]) band++
		land[band] += area[p]
		people[band] += population[p]
		landTotal += area[p]
		peopleTotal += population[p]
		values.push(value)
		weights.push(area[p])
	}
	const at = (fraction: number) =>
		REPORT_STATISTICS.weightedPercentile({ values, weights, fraction })
	return {
		bandEdges: BAND_EDGES,
		landPercent: land.map((value) => (100 * value) / landTotal),
		peoplePercent: people.map((value) =>
			peopleTotal > 0 ? (100 * value) / peopleTotal : 0,
		),
		landP50: at(0.5),
		landP90: at(0.9),
		landP99: at(0.99),
	}
}

export const DEVELOPMENT_REPORT = { summarize }
