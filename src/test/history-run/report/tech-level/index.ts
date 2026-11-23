import { TECH_LEVEL } from "@/model/society/tech-level"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics"
import type {
	TechLevelReport,
	TechLevelReportParams,
} from "@/test/history-run/report/tech-level/types"

function summarize({
	generated,
}: TechLevelReportParams): TechLevelReport | null {
	const population = generated.population
	const area = generated.provinces?.areaKm2
	if (!population || !area) return null
	const levels: number[] = []
	const weights: number[] = []
	const densities: number[] = []
	let people = 0
	let mass = 0
	for (let p = 0; p < population.techLevel.length; p++) {
		const level = population.techLevel[p]
		const count = population.population[p]
		if (!Number.isFinite(level) || !(count > 0) || !(area[p] > 0)) continue
		levels.push(level)
		weights.push(count)
		densities.push(Math.log10(count / area[p]))
		people += count
		mass += count * level
	}
	if (people <= 0) return null
	const mean = mass / people
	let variance = 0
	for (let i = 0; i < levels.length; i++)
		variance += weights[i] * (levels[i] - mean) ** 2
	const at = (fraction: number) =>
		REPORT_STATISTICS.weightedPercentile({ values: levels, weights, fraction })
	const power = TECH_LEVEL.worldPower({
		population: population.population,
		techLevel: population.techLevel,
	})
	const urban = generated.urbanPopulation
	let urbanPeople = 0
	if (urban) for (let p = 0; p < urban.length; p++) urbanPeople += urban[p]
	return {
		requested: TECH_LEVEL.averageLevel({
			target: generated.params.targetTechLevel,
		}),
		settledScore: population.habitabilityScore,
		totalPopulation: population.totalPopulation,
		mean,
		sd: Math.sqrt(variance / people),
		p5: at(0.05),
		p50: at(0.5),
		p99: at(0.99),
		densitySpearman: REPORT_STATISTICS.spearman({ a: levels, b: densities }),
		wattsPerPerson: power.watts / people,
		kardashev: power.kardashev,
		urbanSharePercent: urban ? (100 * urbanPeople) / people : null,
	}
}

export const TECH_LEVEL_REPORT = { summarize }
