import { MIGRATION } from "@/model/society/migration"
import type { MigrationRoutes } from "@/model/society/migration/types"
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

const routesCache = new WeakMap<Int32Array, MigrationRoutes>()

export function getMigrationRoutes(
	world: SerializedGenesisWorld | null | undefined,
): MigrationRoutes | undefined {
	const arrivalYear = getArrivalYears(world)
	const predecessor =
		world?.historyMigration.pipeline === "distribution"
			? world.historyMigration.data.predecessor
			: world?.population?.predecessor
	if (!world || !arrivalYear || !predecessor) return undefined
	const cached = routesCache.get(arrivalYear)
	if (cached) return cached
	const routes = MIGRATION.routes({
		provinces: world.provinces,
		r_xyz: world.mesh.r_xyz,
		arrivalYear,
		predecessor,
	})
	routesCache.set(arrivalYear, routes)
	return routes
}

const rampCache = new WeakMap<Int32Array, Int32Array>()

export function getArrivalRampYears(
	world: SerializedGenesisWorld | null | undefined,
): Int32Array | undefined {
	const arrivalYear = getArrivalYears(world)
	if (!world || !arrivalYear) return undefined
	const cached = rampCache.get(arrivalYear)
	if (cached) return cached
	const ramp = MIGRATION.rampYears({
		arrivalYear,
		desolate: world.provinces.desolate,
	})
	rampCache.set(arrivalYear, ramp)
	return ramp
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
