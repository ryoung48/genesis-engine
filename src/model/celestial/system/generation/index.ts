import { BODY_GENERATION } from "@/model/celestial/system/generation/body"
import type { GenerateSystemBodiesParams } from "@/model/celestial/system/generation/types"

function generateSystemBodies(params: GenerateSystemBodiesParams) {
	return BODY_GENERATION.generateSystemBodies(params)
}

export const SYSTEM_GENERATION = {
	generateSystemBodies,
}
