import type {
	AtmosphereProfile,
	TemperatureTraceEntry,
} from "@/model/celestial/orbit-body/types"
import type {
	BiosphereInput,
	BiosphereResult,
} from "@/model/celestial/planet/biosphere/types"
import { TEMPERATURE } from "@/model/celestial/planet/environment/temperature"
import { DICE } from "@/model/shared/random/dice"

const VACUUM_ATMOSPHERE: AtmosphereProfile = {
	code: 0,
	pressureBar: 0,
	type: "vacuum",
	breathable: false,
}

// Ported from galaxy-gen's BIOSPHERE.get (orbits/biosphere/index.ts). Only
// `get` is ported -- biomass/complexity/diversity/compatibility are not.
function get(params: BiosphereInput): BiosphereResult {
	const { rng, starAgeGyr, temperatureMeanK, classification, impactZone, isMainWorld } =
		params
	const atmosphere = params.atmosphere ?? VACUUM_ATMOSPHERE
	const hydrosphereCode = params.hydrosphereCode ?? 0

	let modifier = 0
	const base = DICE.roll2d6(rng) - 2
	const trace: TemperatureTraceEntry[] = [
		{ value: base, description: "base roll (2d6)" },
	]
	const add = (value: number, description: string) => {
		modifier += value
		trace.push({ value, description })
	}

	// Atmosphere modifiers
	if (atmosphere.code === 0) add(-6, "vacuum")
	else if (atmosphere.code === 1) add(-4, "trace atmosphere")
	else if ([2, 3, 14].includes(atmosphere.code)) add(-3, "very thin atmosphere")
	else if ([4, 5].includes(atmosphere.code)) add(-2, "thin atmosphere")
	else if ([8, 9, 13].includes(atmosphere.code)) add(2, "dense atmosphere")
	else if (atmosphere.code === 10) add(-3, "exotic atmosphere")
	else if (atmosphere.code === 11) add(-5, "hostile atmosphere")
	else if (atmosphere.code === 12) add(-6, "very hostile atmosphere")
	else if (atmosphere.code >= 15) add(-5, "unusual or gaseous atmosphere")

	if (atmosphere.hazard === "low oxygen") add(-1, "low oxygen")

	// Hydrographic modifiers
	if (hydrosphereCode === 0) add(-4, "lack of accessible water")
	else if (hydrosphereCode >= 1 && hydrosphereCode <= 3)
		add(-2, "desert conditions prevalent")
	else if (hydrosphereCode >= 6 && hydrosphereCode <= 8) add(1, "ocean-dominated")
	else if (hydrosphereCode >= 9 && hydrosphereCode < 12) add(2, "no continents")
	else if (hydrosphereCode === 13) add(-4, "gas giant core")

	// System age modifiers
	if (starAgeGyr < 1) add(-10, "system age less than 1 Gyr")
	else if (starAgeGyr < 2) add(-8, "system age less than 2 Gyrs")
	else if (starAgeGyr < 3) add(-4, "system age less than 3 Gyrs")
	else if (starAgeGyr < 4) add(-2, "system age less than 4 Gyrs")

	// Temperature modifiers
	const climate = TEMPERATURE.describe(temperatureMeanK)
	if (climate === "burning") add(-6, "burning conditions")
	else if (climate === "temperate") add(2, "temperate conditions")
	else if (climate === "cold") add(-2, "cold conditions")
	else if (climate === "frozen") add(-6, "frozen conditions")

	if (climate === "frozen" && hydrosphereCode < 10 && hydrosphereCode > 1) {
		add(2, "subsurface oceans")
	}

	let value = Math.max(0, base + modifier)

	if (value > 10) {
		const collapse = rng.randint(0, 8)
		trace.push({ value: -(value - collapse), description: "rare sapience" })
		value = collapse
	}

	const hostile =
		climate === "burning" ||
		climate === "frozen" ||
		atmosphere.code === 11 ||
		atmosphere.code === 12 ||
		atmosphere.code === 0 ||
		atmosphere.code === 1
	if (hostile && value > 5) {
		value = DICE.rollDice({ rng, count: 2, sides: 4 }) - 2
	}

	if (starAgeGyr < 0.1 || classification === "asteroid belt") value = 0

	const oxygenHazard =
		atmosphere.hazard === "low oxygen" || atmosphere.hazard === "high oxygen"

	if (value <= 0 && atmosphere.hazard === "biologic") {
		trace.push({ value: 1 - value, description: "biologic hazard" })
		value = 1
	} else if (value <= 0 && oxygenHazard) {
		trace.push({ value: 1 - value, description: "oxygen hazard" })
		value = 1
	}

	const oxygen =
		(atmosphere.code >= 2 && atmosphere.code <= 9) ||
		atmosphere.code === 13 ||
		atmosphere.code === 14
	if (oxygen && isMainWorld) value = Math.max(1, value)

	let converted = false
	let convertedAtmosphere: AtmosphereProfile | undefined
	if (oxygen && value <= 0 && rng.random() <= 0.8) {
		converted = true
		convertedAtmosphere = { ...atmosphere, code: 10, type: "exotic", breathable: false }
		trace.push({ value: 0, description: "breathable converted to exotic" })
	}

	if (!(atmosphere.code >= 2 && atmosphere.code <= 9) && value >= 9) {
		const collapse = rng.randint(2, 8)
		trace.push({ value: -(value - collapse), description: "biosphere collapse" })
		value = collapse
	}

	if (value >= 10 && rng.random() > 0.8) {
		const collapse = rng.randint(2, 8)
		trace.push({ value: -(value - collapse), description: "rare sapience" })
		value = collapse
	}

	const biosphere: BiosphereResult["biosphere"] = { code: value, trace }

	if ((impactZone || rng.random() < 0.05) && biosphere.code > 0) {
		biosphere.label = "remnants"
	} else if (biosphere.code < 7 && rng.random() > 0.998) {
		biosphere.code = rng.randint(2, 8)
		biosphere.trace = [
			{ value: biosphere.code, description: "bio-engineered life" },
		]
		biosphere.label = "engineered"
	} else if (biosphere.code > 0) {
		const simple = biosphere.code <= 5
		biosphere.label =
			rng.weightedChoice([
				{ w: oxygen && !converted ? (simple ? 2 : 1) : 0, v: "miscible" as const },
				{ w: oxygen && !converted ? (simple ? 1 : 2) : 0, v: "hybrid" as const },
				{ w: 2, v: "immiscible" as const },
			]) ?? "immiscible"
	}

	return { biosphere, atmosphere: convertedAtmosphere }
}

export const BIOSPHERE = { get }
