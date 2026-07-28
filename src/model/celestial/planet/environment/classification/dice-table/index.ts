import type {
	OrbitChemistry,
	OrbitClassification,
	OrbitComposition,
} from "@/model/celestial/orbit-body/types"
import type {
	ChooseChemistryInput,
	ClassifiedEnvironment,
} from "@/model/celestial/planet/environment/classification/dice-table/types"
import type { Zone } from "@/model/celestial/planet/types"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { MATH } from "@/model/shared/math/core"
import { DICE } from "@/model/shared/random/dice"
import { RNG } from "@/model/shared/random/rng"

function chooseColdChemistry({
	rng,
	zone,
	primary,
	chemMod,
	waterMax,
}: ChooseChemistryInput): OrbitChemistry {
	const chemRoll = rng.randint(1, 6) + (zone === "outer" ? 2 : 0) + chemMod
	if (primary || chemRoll <= waterMax) return "water"
	if (chemRoll <= 8) return "ammonia"
	return "methane"
}

function rollClassificationAssignment(params: {
	rng: ReturnType<typeof RNG.createRng>
	classification: OrbitClassification
	sizeClass: number
	zone: Zone
	deviation: number
	spectralClass: MainSequenceClass
	isPrimaryWorld: boolean
}): ClassifiedEnvironment {
	const {
		rng,
		classification,
		sizeClass,
		zone,
		spectralClass,
		isPrimaryWorld,
	} = params
	const primary = isPrimaryWorld
	const spectralChemMod =
		spectralClass === "K" ? 2 : spectralClass === "M" ? 4 : 0
	switch (classification) {
		case "acheronian":
		case "asphodelian":
			return {
				atmosphereCode: 1,
				hydrosphereCode: 0,
				composition: "rocky",
			}
		case "asteroid belt":
			return {
				atmosphereCode: 0,
				hydrosphereCode: 0,
				composition: "rocky",
			}
		case "asteroid": {
			const composition =
				rng.weightedChoice<OrbitComposition>([
					{ v: "metallic", w: params.deviation >= 1.5 ? 1 : 0 },
					{ v: "rocky", w: 3 },
					{ v: "ice", w: params.deviation < -1.5 ? 6 : 0 },
				]) ?? "rocky"
			return {
				atmosphereCode: 0,
				hydrosphereCode: 0,
				composition,
				subtype: composition,
			}
		}
		case "chthonian":
			return {
				atmosphereCode: 1,
				hydrosphereCode: 0,
				composition: "gas",
			}
		case "arid": {
			const chemistry = chooseColdChemistry({
				rng,
				zone,
				primary,
				chemMod: spectralChemMod,
				waterMax: 6,
			})
			const atmosphereCode =
				chemistry === "water"
					? MATH.clamp({ value: DICE.roll2d6(rng) - 7 + sizeClass, lo: 2, hi: 9 })
					: (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
			return {
				atmosphereCode,
				hydrosphereCode: rng.randint(1, 3),
				chemistry,
				subtype:
					chemistry === "water"
						? "darwinian"
						: chemistry === "ammonia"
							? "saganian"
							: "asimovian",
				composition: "rocky",
			}
		}
		case "geo-cyclic": {
			const atmosphereRoll = Math.max(rng.randint(1, 6), 1)
			const atmosphereCode =
				atmosphereRoll > 3
					? (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
					: 1
			const hydrosphereCode = Math.max(
				0,
				DICE.roll2d6(rng) + sizeClass - 7 - (atmosphereCode === 1 ? 4 : 0),
			)
			const chemRoll = rng.randint(1, 6) + (zone === "outer" ? 2 : 0)
			const chemistry =
				primary || chemRoll <= 4
					? "water"
					: chemRoll <= 6
						? "ammonia"
						: "methane"
			return {
				atmosphereCode,
				hydrosphereCode,
				chemistry,
				subtype:
					chemistry === "water"
						? "arean"
						: chemistry === "ammonia"
							? "utgardian"
							: "titanian",
				composition: "rocky",
			}
		}
		case "geo-tidal": {
			let chemMod = 0
			if (zone === "epistellar") chemMod -= 2
			if (zone === "outer") chemMod += 2
			const chemRoll = rng.randint(1, 6) + chemMod
			const chemistry =
				primary || chemRoll <= 4
					? "water"
					: chemRoll <= 6
						? "ammonia"
						: "methane"
			const atmosphereCode =
				chemistry === "water"
					? MATH.clamp({ value: DICE.roll2d6(rng) - 7 + sizeClass, lo: 2, hi: 9 })
					: (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
			return {
				atmosphereCode,
				hydrosphereCode: DICE.rollDice({ rng, count: 2, sides: 3 }) - 2,
				chemistry,
				subtype:
					chemistry === "water"
						? "promethean"
						: chemistry === "ammonia"
							? "burian"
							: "atlan",
				composition: chemistry === "methane" ? "ice" : "rocky",
				eccentric: true,
			}
		}
		case "hebean": {
			let atmosphereCode = Math.max(1, rng.randint(1, 6) + sizeClass - 6)
			if (atmosphereCode >= 2) atmosphereCode = 10
			return {
				atmosphereCode,
				hydrosphereCode: MATH.clamp({
					value: DICE.roll2d6(rng) + sizeClass - 11,
					lo: 0,
					hi: 11,
				}),
				eccentric: true,
				composition: "rocky",
			}
		}
		case "helian": {
			const hydroRoll = rng.randint(1, 6)
			return {
				atmosphereCode: 13,
				hydrosphereCode: hydroRoll <= 2 ? 0 : DICE.roll2d6(rng) - 1,
				composition: "rocky",
			}
		}
		case "jani-lithic": {
			const atmosphereRoll = rng.randint(1, 6)
			return {
				atmosphereCode:
					atmosphereRoll <= 3
						? 0
						: (rng.weightedChoice([
								{ v: 10, w: 8 },
								{ v: 11, w: 2 },
							]) ?? 10),
				hydrosphereCode: 0,
				composition: "rocky",
			}
		}
		case "jovian": {
			let subtype = "unknown"
			if (sizeClass === 16) {
				if (params.deviation >= 1) subtype = "osirian"
				else if (params.deviation >= -1) subtype = "brammian"
				else if (params.deviation >= -1.5) subtype = "khonsonian"
				else subtype = "neptunian"
			} else if (sizeClass === 17) {
				subtype = params.deviation >= -1.5 ? "junic" : "jovic"
			} else {
				subtype = params.deviation >= -1.5 ? "super-junic" : "super-jovic"
			}
			return {
				atmosphereCode: 14,
				hydrosphereCode: 13,
				composition: "gas",
				subtype,
			}
		}
		case "meltball":
			return {
				atmosphereCode: 1,
				hydrosphereCode: 12,
				eccentric: true,
				composition:
					rng.weightedChoice<OrbitComposition>([
						{ v: "rocky", w: 5 },
						{ v: "metallic", w: zone === "epistellar" ? 1 : 0 },
					]) ?? "rocky",
			}
		case "oceanic": {
			const chemistry = chooseColdChemistry({
				rng,
				zone,
				primary,
				chemMod: spectralChemMod,
				waterMax: 6,
			})
			const atmosphereRoll = rng.randint(1, 6)
			const atmosphereCode =
				chemistry === "water"
					? MATH.clamp({
							value:
								DICE.roll2d6(rng) +
								sizeClass -
								6 -
								(spectralClass === "K" ? 1 : spectralClass === "M" ? 2 : 0),
							lo: 2,
							hi: 12,
						})
					: atmosphereRoll === 1
						? 1
						: atmosphereRoll <= 4
							? 10
							: 12
			return {
				atmosphereCode,
				hydrosphereCode:
					rng.weightedChoice([
						{ v: 10, w: 5 },
						{ v: 11, w: 1 },
					]) ?? 10,
				chemistry,
				subtype:
					chemistry === "water"
						? "pelagic"
						: chemistry === "ammonia"
							? "nunnic"
							: "teathic",
				composition: "rocky",
			}
		}
		case "panthalassic": {
			const chemRoll = rng.randint(1, 6) + spectralChemMod
			const secondChemRoll = DICE.roll2d6(rng)
			const chemistry =
				chemRoll <= 6
					? secondChemRoll <= 8
						? "water"
						: secondChemRoll <= 11
							? "sulfur"
							: "chlorine"
					: "methane"
			return {
				atmosphereCode: Math.min(rng.randint(1, 6) + 8, 13),
				hydrosphereCode: 11,
				chemistry,
				composition: "rocky",
			}
		}
		case "rockball": {
			let hydrosphereCode = DICE.roll2d6(rng) + sizeClass - 11
			if (zone === "epistellar") hydrosphereCode -= 2
			if (zone === "outer") hydrosphereCode += 2
			return {
				atmosphereCode: 0,
				hydrosphereCode: MATH.clamp({ value: hydrosphereCode, lo: 0, hi: 10 }),
				composition:
					rng.weightedChoice<OrbitComposition>([
						{ v: "rocky", w: 5 },
						{ v: "metallic", w: zone === "outer" ? 0 : 1 },
					]) ?? "rocky",
			}
		}
		case "snowball": {
			const chemRoll = rng.randint(1, 6) + (zone === "outer" ? 2 : 0)
			return {
				atmosphereCode: rng.randint(1, 6) <= 4 ? 0 : 1,
				hydrosphereCode:
					rng.randint(1, 6) <= 2 ? 10 : Math.max(1, DICE.roll2d6(rng) - 2),
				chemistry:
					chemRoll <= 4 ? "water" : chemRoll <= 6 ? "ammonia" : "methane",
				composition: "ice",
			}
		}
		case "stygian":
			return {
				atmosphereCode: 0,
				hydrosphereCode: 0,
				composition:
					rng.weightedChoice<OrbitComposition>([
						{ v: "rocky", w: 5 },
						{ v: "metallic", w: zone === "outer" ? 0 : 1 },
					]) ?? "rocky",
			}
		case "tectonic": {
			const chemRoll =
				rng.randint(1, 6) + spectralChemMod + (zone === "outer" ? 2 : 0)
			const secondChemRoll = DICE.roll2d6(rng)
			const chemistry =
				primary || chemRoll <= 6
					? secondChemRoll <= 8
						? "water"
						: secondChemRoll <= 11
							? "sulfur"
							: "chlorine"
					: chemRoll <= 8
						? "ammonia"
						: "methane"
			const atmosphereCode =
				chemistry === "water"
					? MATH.clamp({ value: DICE.roll2d6(rng) + sizeClass - 7, lo: 2, hi: 9 })
					: (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
			return {
				atmosphereCode,
				hydrosphereCode: rng.randint(4, 9),
				chemistry,
				subtype:
					chemistry === "water"
						? "gaian"
						: chemistry === "sulfur"
							? "thio-gaian"
							: chemistry === "chlorine"
								? "chloritic-gaian"
								: chemistry === "ammonia"
									? "amunian"
									: "tartarian",
				composition: "rocky",
			}
		}
		case "telluric":
			return {
				atmosphereCode: rng.choice([11, 12, 12]),
				hydrosphereCode: 0,
				composition: "rocky",
				subtype: params.deviation >= 1 ? "phosphorian" : "cytherean",
			}
		case "vesperian": {
			const chemRoll = rng.randint(1, 6)
			const chemistry = primary || chemRoll <= 11 ? "water" : "chlorine"
			const atmosphereCode =
				chemistry === "water"
					? MATH.clamp({ value: DICE.roll2d6(rng) + sizeClass - 7, lo: 2, hi: 9 })
					: (rng.weightedChoice([
							{ v: 10, w: 8 },
							{ v: 11, w: 2 },
						]) ?? 10)
			return {
				atmosphereCode,
				hydrosphereCode: Math.max(1, DICE.roll2d6(rng) - 2),
				chemistry,
				composition: "rocky",
			}
		}
	}
}

export const DICE_TABLE = { rollClassificationAssignment }
