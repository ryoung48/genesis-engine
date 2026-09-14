import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { DensityProfile } from "@/model/celestial/orbit-body/types"
import type {
	DensityDescriptionInput,
	DensityProfileInput,
	RollAlbedoInput,
} from "@/model/celestial/planet/environment/density/types"
import type { SpectralClass } from "@/model/celestial/star/types"
import { MATH } from "@/model/shared/math/core"
import { DICE } from "@/model/shared/random/dice"

// [DEVIATION] Not book-sourced -- a rare, purely cosmetic override on top
// of an already-rolled silicate-range density (never its own density
// value): real carbon-world models put carbide/graphite worlds in roughly
// the same density range as ordinary silicate worlds of the same mass, so
// this only relabels Mostly Rock / Rock and Metal results -- a
// metal-dominated interior implies a differentiated iron core, which a
// carbon-rich bulk composition shouldn't have. Gated on a young-ish
// galactic population being more likely to have the high carbon-to-oxygen
// protoplanetary disks carbon worlds need -- approximated here by simply
// excluding O/B/A hosts (those stars are always young by virtue of their
// short main-sequence lifespan, but so is plenty of the G-M population;
// this is a coarse exclusion, not a real metallicity model).
const CARBON_WORLD_CHANCE = 0.03
const CARBON_EXCLUDED_HOST_CLASSES: readonly SpectralClass[] = ["O", "B", "A"]

function describeDensity({
	rng,
	earthRelative,
	classification,
	hostSpectralClass,
}: DensityDescriptionInput): string {
	if (classification === "jovian" || classification === "chthonian") {
		return "Hydrogen-Helium Envelope"
	}
	if (earthRelative < 0.18) return "Exotic Ice"
	if (earthRelative < 0.5) return "Mostly Ice"
	const rockOrMetal =
		earthRelative < 0.82
			? "Mostly Rock"
			: earthRelative < 1.15
				? "Rock and Metal"
				: earthRelative < 1.5
					? "Mostly Metal"
					: "Compressed Metal"
	const carbonEligible =
		(rockOrMetal === "Mostly Rock" || rockOrMetal === "Rock and Metal") &&
		rng !== undefined &&
		hostSpectralClass !== undefined &&
		!CARBON_EXCLUDED_HOST_CLASSES.includes(hostSpectralClass)
	if (carbonEligible && rng.uniform(0, 1) < CARBON_WORLD_CHANCE) return "Carbon"
	return rockOrMetal
}

function buildDensityProfile({
	rng,
	massKg,
	diameterKm,
	classification,
	hostSpectralClass,
}: DensityProfileInput): DensityProfile | null {
	if (massKg <= 0 || diameterKm <= 0) return null
	const diameterEarths = diameterKm / ORBIT_BODY.earthDiameterKm
	const massEarths = massKg / ORBIT_BODY.earthMassKg
	const earthRelative = massEarths / diameterEarths ** 3
	return {
		earthRelative,
		description: describeDensity({
			rng,
			earthRelative,
			classification,
			hostSpectralClass,
		}),
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

	return MATH.clamp({ value: albedo, lo: 0.02, hi: 0.98 })
}

export const DENSITY = { buildProfile: buildDensityProfile, rollAlbedo }
