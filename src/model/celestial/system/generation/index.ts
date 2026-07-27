import { BODY_GENERATION } from "@/model/celestial/system/generation/body"
import type { GenerateSystemBodiesParams } from "@/model/celestial/system/generation/types"
import { TIME } from "@/model/shared/time"

export const DAYS_PER_YEAR = TIME.astronomicalDaysPerYear

function generateSystemBodies(params: GenerateSystemBodiesParams) {
	return BODY_GENERATION.generateSystemBodies(params)
}

export const GENERATION = {
	generateSystemBodies,
	DAYS_PER_YEAR,
}

export { generateSystemBodies }
