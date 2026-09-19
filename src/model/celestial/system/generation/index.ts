import { STAR } from "@/model/celestial/star"
import type { HostStarAttributes } from "@/model/celestial/star/types"
import { BODY_GENERATION } from "@/model/celestial/system/generation/body"
import { SINGLE_STAR_BUDGET } from "@/model/celestial/system/generation/single-star-budget"
import type { GenerateSystemBodiesParams } from "@/model/celestial/system/generation/types"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"

function resolveHostStar({
	hostStar,
	spectralClass = STAR.defaultSpectralClass,
	starSubtype = STAR.defaultStarSubtype,
	starAgeGyrOverride = 4.5,
}: GenerateSystemBodiesParams): HostStarAttributes {
	if (hostStar) return hostStar
	return {
		spectralClass,
		luminosityClass: "V",
		subtype: starSubtype,
		massSol: STAR.getStarMassSol({ cls: spectralClass, subtype: starSubtype }),
		temperatureK: STAR.getStarTemperatureK({
			cls: spectralClass,
			subtype: starSubtype,
		}),
		diameterSol: STAR.getStarDiameterSol({
			cls: spectralClass,
			subtype: starSubtype,
		}),
		luminositySol: STAR.getStarLuminositySol({
			cls: spectralClass,
			subtype: starSubtype,
		}),
		ageGyr: starAgeGyrOverride,
		mao: STAR.getStarMAO({ cls: spectralClass, subtype: starSubtype }),
	}
}

function generateSystemBodies(params: GenerateSystemBodiesParams) {
	if (params.orbitSlots !== undefined || params.seed === SOL_DATA.solSeed) {
		return BODY_GENERATION.generateSystemBodies(params)
	}
	const { worldTypeAllocation } = SINGLE_STAR_BUDGET.roll({
		seed: params.seed,
		hostStar: resolveHostStar(params),
		exactHZC: params.exactHZC,
	})
	return BODY_GENERATION.generateSystemBodies({
		...params,
		orbitSlots: worldTypeAllocation.orbitSlots,
	})
}

export const SYSTEM_GENERATION = {
	generateSystemBodies,
}
