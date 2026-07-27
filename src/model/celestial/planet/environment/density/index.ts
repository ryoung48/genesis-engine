import type { DensityProfile } from "@/model/celestial/orbit-body/types"
import type {
	DensityDescriptionInput,
	DensityProfileInput,
	RollAlbedoInput,
} from "@/model/celestial/planet/environment/density/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { DICE } from "@/model/shared/dice"

function clamp({
	value,
	min,
	max,
}: {
	value: number
	min: number
	max: number
}): number {
	return Math.max(min, Math.min(max, value))
}
function describeDensity({
	earthRelative,
	classification,
}: DensityDescriptionInput): string {
	if (classification === "jovian" || classification === "chthonian") {
		return "Hydrogen-Helium Envelope"
	}
	if (earthRelative < 0.18) return "Exotic Ice"
	if (earthRelative < 0.5) return "Mostly Ice"
	if (earthRelative < 0.82) return "Mostly Rock"
	if (earthRelative < 1.15) return "Rock and Metal"
	if (earthRelative < 1.5) return "Mostly Metal"
	return "Compressed Metal"
}

function buildDensityProfile({
	massKg,
	diameterKm,
	classification,
}: DensityProfileInput): DensityProfile | null {
	if (massKg <= 0 || diameterKm <= 0) return null
	const diameterEarths = diameterKm / ORBIT_BODY.earthDiameterKm
	const massEarths = massKg / ORBIT_BODY.earthMassKg
	const earthRelative = massEarths / diameterEarths ** 3
	return {
		earthRelative,
		description: describeDensity({ earthRelative, classification }),
	}
}

function rollAlbedo({
	rng,
	composition,
	atmosphere,
	hydrosphereCode,
}: RollAlbedoInput): number {
	let albedo = 0
	if (composition === "rocky" || composition === "metallic") {
		albedo = (DICE.roll2d6(rng) - 2) * 0.02 + 0.04
	} else if (composition === "ice") {
		albedo = (DICE.roll2d6(rng) - 3) * 0.05 + 0.2
	} else if (composition === "gas") {
		albedo = 0.05 * DICE.roll2d6(rng) + 0.05
	}

	if (
		!atmosphere ||
		atmosphere.type === "vacuum" ||
		atmosphere.type === "trace" ||
		atmosphere.subtype === "very thin"
	) {
		albedo += (DICE.roll2d6(rng) - 3) * 0.01
	} else if (atmosphere.subtype === "very dense") {
		albedo += DICE.roll2d6(rng) * 0.03
	} else if (atmosphere.type === "breathable") {
		albedo += DICE.roll2d6(rng) * 0.01
	} else {
		albedo += (DICE.roll2d6(rng) - 2) * 0.05
	}

	if (hydrosphereCode >= 2 && hydrosphereCode <= 5) {
		albedo += (DICE.roll2d6(rng) - 2) * 0.02
	} else if (hydrosphereCode >= 6) {
		albedo += (DICE.roll2d6(rng) - 4) * 0.03
	}

	return clamp({ value: albedo, min: 0.02, max: 0.98 })
}

export const DENSITY = { buildProfile: buildDensityProfile, rollAlbedo }
