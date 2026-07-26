export type { RingProfile, SolarSystemState, SystemBody } from "./types"

import {
	DAYS_PER_YEAR,
	generateStarName,
	generateSystemBodies,
	getStarAgeGyr,
} from "./generation"
import {
	SOL_LUNA_DEFAULT,
	SOL_MAIN_WORLD_DEFAULTS,
	SOL_SEED,
} from "./sol-system"

export const SYSTEM = {
	DAYS_PER_YEAR,
	generateStarName,
	generateSystemBodies,
	getStarAgeGyr,
	SOL_SEED,
	SOL_LUNA_DEFAULT,
	SOL_MAIN_WORLD_DEFAULTS,
}
