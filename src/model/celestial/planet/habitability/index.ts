import type { TemperatureTraceEntry } from "@/model/celestial/orbit-body/types"
import { TEMPERATURE } from "@/model/celestial/planet/environment/temperature"
import type {
	HabitabilityInput,
	HabitabilityProfile,
} from "@/model/celestial/planet/habitability/types"

// Ported from galaxy-gen's DESIRABILITY.habitability (orbits/desirability/
// index.ts). Vacuum/atmosphere-less bodies (no `atmosphere`) are treated the
// same as galaxy-gen's implicit code-0 vacuum.
function get(params: HabitabilityInput): HabitabilityProfile {
	const {
		sizeClass,
		hydrosphereCode,
		temperatureMeanK,
		temperatureHighK,
		temperatureLowK,
		gravityG,
		tideLockedToStar,
		seismologyTotal,
		surfaceTidesHeating,
	} = params
	const atmosphereCode = params.atmosphere?.code ?? 0
	const atmosphereType = params.atmosphere?.type
	// galaxy-gen's `atmosphere.unusual` flagged the "unusual" pressure/mix
	// variant -- chaos-machine's nearest equivalent is the "unusual" subtype
	// (a tainted breathable/exotic atmosphere already has its own code path).
	const atmosphereUnusual = params.atmosphere?.subtype === "unusual"

	let habitability = 10
	const trace: TemperatureTraceEntry[] = [
		{ value: 10, description: "base habitability" },
	]
	const add = (value: number, description: string) => {
		habitability += value
		trace.push({ value, description })
	}

	// limited surface area
	if (sizeClass <= 4 && hydrosphereCode < 12) {
		add(-1, "limited surface area")
	}
	// additional surface area
	else if (sizeClass >= 9 && hydrosphereCode < 12) {
		add(1, "additional surface area")
	}

	// very hostile atmosphere
	if (atmosphereCode === 12 || atmosphereType === "gas") {
		add(-12, "very hostile atmosphere")
	}
	// hostile atmosphere
	else if (atmosphereCode === 11 || atmosphereUnusual) {
		add(-10, "hostile atmosphere")
	}
	// non-breathable atmosphere
	else if ([0, 1, 10].includes(atmosphereCode)) {
		add(-8, "non-breathable atmosphere")
	}
	// tainted very thin or thin, low atmosphere
	else if (atmosphereCode === 2 || atmosphereCode === 14) {
		add(-4, "tainted very thin or thin, low atmosphere")
	}
	// very thin or very dense atmosphere
	else if (atmosphereCode === 3 || atmosphereCode === 13) {
		add(-3, "very thin or very dense atmosphere")
	}
	// tainted thin or dense atmosphere
	else if (atmosphereCode === 4 || atmosphereCode === 9) {
		add(-2, "tainted thin or dense atmosphere")
	}
	// thin, tainted (standard), dense atmospheres
	else if ([5, 7, 8].includes(atmosphereCode)) {
		add(-1, "thin, tainted (standard), dense atmospheres")
	}

	// lack of accessible water
	if (hydrosphereCode === 0) {
		add(-4, "lack of accessible water")
	}
	// desert conditions prevalent
	else if (hydrosphereCode <= 3) {
		add(-2, "desert conditions prevalent")
	}
	// little usable land surface area
	else if (hydrosphereCode === 9) {
		add(-1, "little usable land surface area")
	}
	// very little usable land surface area
	else if (hydrosphereCode === 10 || hydrosphereCode === 11) {
		add(-2, "very little usable land surface area")
	}

	const climate = TEMPERATURE.describe(temperatureMeanK)

	// molten seas
	if (hydrosphereCode === 12) {
		add(-12, "molten surface")
	}
	// gas giant core
	else if (hydrosphereCode === 13) {
		add(-10, "gas giant core")
	}
	// scorching hot most of the time
	else if (climate === "burning") {
		add(-6, "burning conditions")
	}
	// too hot most of the time
	else if (climate === "hot") {
		add(-2, "hot conditions")
	}
	// too cold most of the time
	else if (climate === "cold") {
		add(-2, "cold conditions")
	}
	// frozen most of the time
	else if (climate === "frozen") {
		add(-6, "frozen conditions")
	}

	// temperature swings
	const variability = Math.min(
		Math.floor((temperatureHighK - temperatureLowK) / 60),
		2,
	)
	if (variability > 0 && atmosphereCode > 1 && !tideLockedToStar) {
		add(-variability, "variable conditions")
	}

	// unhealthy low gravity levels
	if (gravityG <= 0.2) {
		add(-4, "unhealthy low gravity levels")
	}
	// very low gravity
	else if (gravityG <= 0.4) {
		add(-2, "very low gravity")
	}
	// low gravity
	else if (gravityG <= 0.7) {
		add(-1, "low gravity")
	}
	// comfortable gravity
	else if (gravityG <= 0.9) {
		add(1, "comfortable gravity")
	}
	// standard gravity: no adjustment
	else if (gravityG <= 1.1) {
		// no-op
	}
	// somewhat high gravity
	else if (gravityG <= 1.4) {
		add(-1, "somewhat high gravity")
	}
	// uncomfortable high gravity
	else if (gravityG <= 2) {
		add(-2, "uncomfortable high gravity")
	}
	// gravity too high for acclimation
	else {
		add(-6, "gravity too high for acclimation")
	}

	// solar tidal lock
	if (tideLockedToStar) {
		add(-2, "solar tidal lock")
	}

	// seismic activity
	const seismic = Math.min(Math.floor(seismologyTotal / 100), 5)
	if (seismic > 0) {
		add(-seismic, "seismic activity")
	}
	// extreme tides -- see HabitabilityInput's doc on surfaceTidesHeating
	// standing in for galaxy-gen's tides.stress.
	const tides = Math.min(Math.floor(surfaceTidesHeating / 5), 2)
	if (tides > 0) {
		add(-tides, "extreme tides")
	}

	return { code: habitability, trace }
}

export const HABITABILITY = { get }
