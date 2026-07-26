import { ASTRONOMICAL_DAYS_PER_YEAR } from "@/model/shared"
import { BODY_GENERATION } from "./body"
import type { GenerateSystemBodiesParams } from "./types"

export const DAYS_PER_YEAR = ASTRONOMICAL_DAYS_PER_YEAR

function generateSystemBodies(params: GenerateSystemBodiesParams) {
	return BODY_GENERATION.generateSystemBodies(params)
}

export const GENERATION = {
	generateSystemBodies,
	DAYS_PER_YEAR,
}

export { generateSystemBodies }
