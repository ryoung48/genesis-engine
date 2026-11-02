import { MIGRATION } from "@/model/society/migration"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

const UPPER_QUANTILE = 0.98

export function getArrivalYears(
	world: SerializedGenesisWorld | null | undefined,
): Int32Array | undefined {
	if (!world) return undefined
	return world.historyMigration.pipeline === "distribution"
		? world.historyMigration.data.arrivalYear
		: world.population?.arrivalYear
}

export function getArrivalScale(params: {
	years: Int32Array
	desolate: Uint8Array
}): { min: number; span: number } {
	const { years, desolate } = params
	const reached: number[] = []
	for (let p = 0; p < years.length; p++)
		if (!desolate[p] && years[p] !== MIGRATION.sentinel) reached.push(years[p])
	if (reached.length === 0) return { min: 0, span: 0 }
	reached.sort((a, b) => a - b)
	const min = reached[0]
	const upper = reached[Math.floor((reached.length - 1) * UPPER_QUANTILE)]
	return { min, span: upper - min }
}
