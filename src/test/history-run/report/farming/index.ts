import type { WayOfLife } from "@/model/society/farming/types"
import { FARMING_WAY_OF_LIFE } from "@/model/society/farming/way-of-life"
import { MIGRATION } from "@/model/society/migration"
import { TECH_LEVEL } from "@/model/society/tech-level"
import type {
	FarmingReport,
	FarmingReportParams,
	PercentParams,
	QuantilesParams,
	SampleQuantiles,
	WayOfLifePercents,
} from "@/test/history-run/report/farming/types"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics"

const REPORT_YEARS = [-5000, 1, 867, 1500]
const WAYS: WayOfLife[] = ["uninhabited", "forage", "farm", "herd"]

function quantiles({ values }: QuantilesParams): SampleQuantiles {
	if (!values.length) return { samples: 0, p10: null, p50: null, p90: null }
	const at = (fraction: number) =>
		REPORT_STATISTICS.percentile({ values, fraction })
	return { samples: values.length, p10: at(0.1), p50: at(0.5), p90: at(0.9) }
}

function percent({ count, total }: PercentParams): number | null {
	return total > 0 ? (100 * count) / total : null
}

function summarize({ generated }: FarmingReportParams): FarmingReport | null {
	const farming = generated.farming
	const provinces = generated.provinces
	if (!farming || !provinces) return null
	const settled: number[] = []
	for (let p = 0; p < provinces.count; p++)
		if (!provinces.desolate[p] && farming.settledYear[p] !== MIGRATION.sentinel)
			settled.push(p)
	const finite = settled
		.map((p) => farming.farmingYear[p])
		.filter((year) => year !== MIGRATION.sentinel)
	const lags = settled
		.filter(
			(p) =>
				farming.farmingYear[p] !== MIGRATION.sentinel &&
				farming.adoptionYear[p] !== MIGRATION.sentinel &&
				farming.adoptionYear[p] > farming.farmingYear[p],
		)
		.map((p) => farming.adoptionYear[p] - farming.farmingYear[p])
	const fired = farming.hearths.filter((hearth) => hearth.fired)
	const firstHearth = fired.length
		? Math.min(...fired.map((hearth) => hearth.startYear))
		: null
	const arrivalYears = quantiles({ values: finite })
	const wayOfLifePercentAt: Record<string, WayOfLifePercents> = {}
	for (const year of REPORT_YEARS) {
		const counts: Record<WayOfLife, number> = {
			uninhabited: 0,
			forage: 0,
			farm: 0,
			herd: 0,
		}
		const field = FARMING_WAY_OF_LIFE.wayOfLife({
			farming,
			graph: provinces,
			year,
			techLevel: TECH_LEVEL.averageLevel({
				target: generated.params.targetTechLevel,
			}),
		})
		for (const province of settled)
			counts[FARMING_WAY_OF_LIFE.modeOf({ field, province })]++
		wayOfLifePercentAt[String(year)] = Object.fromEntries(
			WAYS.map((way) => [
				way,
				percent({ count: counts[way], total: settled.length }),
			]),
		) as WayOfLifePercents
	}
	const sinceFirst = (year: number | null) =>
		year === null || firstHearth === null ? null : year - firstHearth
	return {
		scheduledHearths: farming.hearths.length,
		firedHearths: fired.length,
		firedPerMillionFarmableKm2:
			farming.summary.farmableKm2 > 0
				? fired.length / (farming.summary.farmableKm2 / 1e6)
				: null,
		firstFarmingYear: finite.length ? Math.min(...finite) : null,
		hearths: farming.hearths,
		arrivalYears,
		yearsFromFirstHearthToP50: sinceFirst(arrivalYears.p50),
		yearsFromFirstHearthToP90: sinceFirst(arrivalYears.p90),
		landEdgeSpeedKmPerYear: farming.summary.landEdgeSpeed,
		pastoralYear: farming.summary.pastoralYear,
		livestockKnotYears: farming.summary.livestockKnotYears,
		settledProvinces: settled.length,
		neverReachedPercent: percent({
			count: settled.length - finite.length,
			total: settled.length,
		}),
		neverAdoptingPercent: percent({
			count: settled.filter(
				(p) => farming.adoptionYear[p] === MIGRATION.sentinel,
			).length,
			total: settled.length,
		}),
		adoptionLagYears: quantiles({ values: lags }),
		wayOfLifePercentAt,
	}
}

export const FARMING_REPORT = { summarize }
