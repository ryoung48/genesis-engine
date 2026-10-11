import { STATE } from "@/model/history/sim/engine/state"
import { ERAS } from "@/model/society/eras"
import type {
	GovernmentReport,
	GovernmentReportParams,
} from "@/test/history-run/report/government/types"

function summarize({
	engine,
	from,
	to,
}: GovernmentReportParams): GovernmentReport {
	const report: GovernmentReport = {
		types: {},
		changes: {},
		inherited: 0,
		transitions: 0,
	}
	let total = 0
	for (let realm = 0; realm < engine.P; realm++) {
		if (
			engine.desolate[realm] ||
			engine.stateless[realm] ||
			!STATE.isSovereign({ state: engine, p: realm })
		)
			continue
		const type = ERAS.governmentTypes[engine.governmentType[realm]]
		const count = (report.types[type] ??= {
			realms: 0,
			populationShare: 0,
			sizeBands: { "1": 0, "2–4": 0, "5–9": 0, "10–19": 0, "20+": 0 },
		})
		const provinces = STATE.getNationProvinces({ state: engine, root: realm })
		const population = STATE.getNationPopulation({ state: engine, root: realm })
		const size = provinces.length
		count.realms++
		count.sizeBands[
			size === 1
				? "1"
				: size <= 4
					? "2–4"
					: size <= 9
						? "5–9"
						: size <= 19
							? "10–19"
							: "20+"
		]++
		count.populationShare += population
		total += population
	}
	for (const count of Object.values(report.types))
		count.populationShare /= Math.max(1, total)
	for (const note of engine.events) {
		if (
			note.tag !== "government change" ||
			note.time < from * STATE.yearMs ||
			note.time >= to * STATE.yearMs
		)
			continue
		const key = `${note.data.from} → ${note.data.to} (${note.data.cause})`
		report.changes[key] = (report.changes[key] ?? 0) + 1
		if (note.data.cause === "inherited") report.inherited++
		else report.transitions++
	}
	return report
}

export const GOVERNMENT_REPORT = { summarize }
