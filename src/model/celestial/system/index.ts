import { DAYS_PER_YEAR, generateSystemBodies } from "./generation"
import { STAR_IDENTITY } from "./generation/star-identity"
import {
	SOL_LUNA_DEFAULT,
	SOL_MAIN_WORLD_DEFAULTS,
	SOL_SEED,
} from "./sol-system"

export const SYSTEM = {
	DAYS_PER_YEAR,
	generateStarName: STAR_IDENTITY.generateStarName,
	generateSystemBodies,
	getStarAgeGyr: STAR_IDENTITY.getStarAgeGyr,
	SOL_SEED,
	SOL_LUNA_DEFAULT,
	SOL_MAIN_WORLD_DEFAULTS,
}
