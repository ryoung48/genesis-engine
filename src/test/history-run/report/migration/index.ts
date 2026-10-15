import { MIGRATION } from "@/model/society/migration"
import type {
	MigrationReport,
	MigrationReportParams,
} from "@/test/history-run/report/migration/types"

function summarize({
	generated,
	startYear,
}: MigrationReportParams): MigrationReport {
	const population = generated.population
	const provinces = generated.provinces
	const arrival = population?.arrivalYear
	const reached: number[] = []
	let habitable = 0
	let settled = 0
	let never = 0
	if (provinces && arrival)
		for (let p = 0; p < provinces.count; p++) {
			if (provinces.desolate[p]) continue
			habitable++
			if (arrival[p] === MIGRATION.sentinel) never++
			else reached.push(arrival[p])
			if (arrival[p] <= startYear) settled++
		}
	reached.sort((a, b) => a - b)
	const percent = (count: number) => (100 * count) / Math.max(1, habitable)
	return {
		diagnostics: population?.migrationDiagnostics ?? null,
		cradles: population?.cradles ?? [],
		provinces: habitable,
		settledAtStartPercent: percent(settled),
		uninhabitedAtStartPercent: percent(habitable - settled),
		neverReachedPercent: percent(never),
		arrivalYearQuantiles: [0, 0.25, 0.5, 0.75, 1].map((q) =>
			reached.length ? reached[Math.floor(q * (reached.length - 1))] : 0,
		),
	}
}

export const MIGRATION_REPORT = { summarize }
