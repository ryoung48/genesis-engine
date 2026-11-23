import { DISTRIBUTION_TARGETS } from "@/model/history/distribution/targets"
import { DATE } from "@/model/history/earth/date"
import { STATE_CLOCK } from "@/model/history/sim/engine/state/clock"
import type {
	FarmingResult,
	WayOfLifeField,
} from "@/model/society/farming/types"
import { FARMING_WAY_OF_LIFE } from "@/model/society/farming/way-of-life"
import { TECH_LEVEL } from "@/model/society/tech-level"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export function getFarming(
	world: SerializedGenesisWorld | null | undefined,
): FarmingResult | undefined {
	return world?.farming ?? undefined
}

export function displayYear(params: {
	timeMs: number | null
	world: SerializedGenesisWorld
}): number {
	const { timeMs, world } = params
	if (world.historyMigration.pipeline === "distribution")
		return timeMs !== null
			? DATE.historyTimeMsToYear(timeMs)
			: DISTRIBUTION_TARGETS.startYear
	const planetStart =
		world.population?.startYear ?? STATE_CLOCK.defaultStartYear
	return timeMs === null
		? planetStart
		: DATE.historyTimeMsToYear(timeMs) -
				STATE_CLOCK.defaultStartYear +
				planetStart
}

const wayOfLifeCache = new WeakMap<
	SerializedGenesisWorld,
	Map<number, WayOfLifeField>
>()

// Ways of life blend across neighbours, so they are a world-level pass
// cached per world and year.
export function getWayOfLife(params: {
	world: SerializedGenesisWorld
	year: number
}): WayOfLifeField | undefined {
	const { world, year } = params
	const farming = world.farming
	const provinces = world.provinces
	if (!farming || !provinces) return undefined
	let byYear = wayOfLifeCache.get(world)
	if (!byYear) {
		byYear = new Map()
		wayOfLifeCache.set(world, byYear)
	}
	const cached = byYear.get(year)
	if (cached) return cached
	const field = FARMING_WAY_OF_LIFE.wayOfLife({
		farming,
		graph: provinces,
		year,
		techLevel: TECH_LEVEL.averageLevel({
			target: world.params.targetTechLevel,
		}),
	})
	byYear.set(year, field)
	return field
}
