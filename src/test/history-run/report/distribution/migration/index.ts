import { DISTRIBUTION_STATUS } from "@/model/history/distribution/status"
import { DATE } from "@/model/history/earth/date"
import type { MigrationReportParams } from "@/test/history-run/report/distribution/migration/types"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics"

function summarize({ engine: e }: MigrationReportParams) {
	const m = e.migration,
		arrivals: number[] = [],
		byComponent = new Map<number, number[]>(),
		byTier = new Array<number>(5).fill(0)
	let unreachableCount = 0,
		unreachableAreaKm2 = 0,
		afterHorizonCount = 0,
		afterHorizonAreaKm2 = 0,
		routeViolations = 0,
		originViolations = 0,
		settlementViolations = 0,
		recordOrderViolations = 0,
		settlementRecordBytes = 0,
		habitableAreaKm2 = 0,
		inhabitedAreaKm2 = 0
	for (let p = 0; p < e.territory.owner.length; p++) {
		if (e.territory.provinces.desolate[p]) continue
		const area = e.territory.provinces.areaKm2?.[p] ?? 0
		habitableAreaKm2 += area
		if (e.territory.owner[p] !== DISTRIBUTION_STATUS.uninhabited) {
			inhabitedAreaKm2 += area
			if (m.arrivalYear[p] > e.year) settlementViolations++
		}
		if (!Number.isFinite(m.continuousArrival[p])) {
			unreachableCount++
			unreachableAreaKm2 += area
		} else if (m.arrivalYear[p] === 2147483647) {
			afterHorizonCount++
			afterHorizonAreaKm2 += area
		} else {
			arrivals.push(m.arrivalYear[p])
			byTier[m.arrivalTier[p]]++
			const component = m.componentId[p]
			let list = byComponent.get(component)
			if (!list) byComponent.set(component, (list = []))
			list.push(m.arrivalYear[p])
		}
		if (
			p !== m.origin &&
			Number.isFinite(m.continuousArrival[p]) &&
			(m.predecessor[p] < 0 ||
				m.continuousArrival[m.predecessor[p]] >= m.continuousArrival[p])
		)
			routeViolations++
		if (m.arrivalYear[p] === -79999 && p !== m.origin) originViolations++
	}
	if (m.origin >= 0 && m.arrivalYear[m.origin] !== -79999) originViolations++
	for (const [province, log] of e.history.record.events.provinceEvents) {
		let previous = -Infinity
		for (const event of log.events) {
			if (event.timeMs < previous) recordOrderViolations++
			previous = event.timeMs
			if (
				(event.kind === "owner" || event.kind === "controller") &&
				event.payload.nationId === DISTRIBUTION_STATUS.stateless
			) {
				settlementRecordBytes += Buffer.byteLength(JSON.stringify(event))
				if (
					event.timeMs !==
					DATE.eu4DateToTimeMs(`${m.arrivalYear[province]}.1.1`)
				)
					settlementViolations++
			}
		}
	}
	return {
		origin: m.origin,
		...m.diagnostics,
		arrivalQuantiles: REPORT_STATISTICS.summarize(arrivals),
		arrivalsByComponent: [...byComponent].map(([componentId, values]) => ({
			componentId,
			count: values.length,
			years: REPORT_STATISTICS.summarize(values),
		})),
		arrivalsBySeaCapabilityTier: byTier,
		unreachableCount,
		unreachableAreaKm2,
		afterHorizonCount,
		afterHorizonAreaKm2,
		inHorizonCount: m.order.length,
		settlementCursor: e.settlement.cursor,
		inhabitedProvinceShare: e.habitableCount
			? e.settlement.cursor / e.habitableCount
			: 0,
		inhabitedAreaShare: habitableAreaKm2
			? inhabitedAreaKm2 / habitableAreaKm2
			: 0,
		cradles: e.cradles.schedule,
		routeViolations,
		originViolations,
		settlementViolations,
		foundingViolations: e.foundingViolations,
		recordOrderViolations,
		settlementRecordBytes,
		settlementEvents: e.settlementEvents,
		preStateAdvanceMs: e.preStateAdvanceMs,
		politicalAdvanceMs: e.politicalAdvanceMs,
		preStatePoliticalSteps: e.preStatePoliticalSteps,
		executionStepCount: e.executionStepCount,
		endpointClampExtraSteps: e.endpointClampExtraSteps,
		retainedArrayBytes: [
			m.arrivalYear,
			m.continuousArrival,
			m.predecessor,
			m.edgeKind,
			m.order,
			m.componentId,
			m.arrivalTier,
			m.contextMask,
			e.cradles.nearestId,
			e.cradles.nearestDistanceKm,
			e.provincePositions,
		].reduce((sum, array) => sum + array.byteLength, 0),
	}
}
export const DISTRIBUTION_MIGRATION_REPORT = { summarize }
