import {
	DAYS_PER_YEAR,
	generateSystemBodies,
} from "@/model/celestial/system/generation"
import { STAR_IDENTITY } from "@/model/celestial/system/generation/star-identity"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { DATA } from "@/model/celestial/system/sol-system/data"

export const SYSTEM = {
	DAYS_PER_YEAR,
	generateStarName: STAR_IDENTITY.generateStarName,
	generateSystemBodies,
	getStarAgeGyr: STAR_IDENTITY.getStarAgeGyr,
	SOL_SEED: DATA.solSeed,
	SOL_LUNA_DEFAULT: SOL_SYSTEM.solLunaDefault,
	SOL_MAIN_WORLD_DEFAULTS: SOL_SYSTEM.solMainWorldDefaults,
}
