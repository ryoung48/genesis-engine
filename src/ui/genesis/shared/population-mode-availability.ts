import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import {
	POPULATION_MAP_MODE_OPTIONS,
	type SocietyMapMode,
} from "@/ui/genesis/shared/map-modes"
import { getArrivalYears } from "@/ui/genesis/shared/migration-arrival"

function hasPopulationModeData(params: {
	world: SerializedGenesisWorld
	mode: SocietyMapMode
}): boolean {
	const { world, mode } = params
	if (mode === "migration") return getArrivalYears(world) !== undefined
	if (mode === "development") return world.development !== undefined
	if (mode === "knowledge") return world.knowledge !== undefined
	if (mode === "techLevel")
		return world.population?.techLevel.some(Number.isFinite) ?? false
	if (mode === "farming" || mode === "wayOfLife") return world.farming !== null
	return true
}

export function getAvailablePopulationModes(
	world: SerializedGenesisWorld | null | undefined,
): ReadonlyArray<SocietyMapMode> {
	return POPULATION_MAP_MODE_OPTIONS.map(([mode]) => mode).filter(
		(mode) => !!world && hasPopulationModeData({ world, mode }),
	)
}
