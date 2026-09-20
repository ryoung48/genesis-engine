import type { TemperatureTraceEntry } from "@/model/celestial/orbit-body/types"
import type {
	HabitabilityInput,
	HabitabilityProfile,
} from "@/model/celestial/planet/habitability/types"

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
		asteroidImpacts,
	} = params
	const atmosphereCode = params.atmosphere?.code ?? 0

	let habitability = 10
	const trace: TemperatureTraceEntry[] = [
		{ value: 10, description: "base habitability" },
	]
	const add = (value: number, description: string) => {
		habitability += value
		trace.push({ value, description })
	}

	if (sizeClass <= 4) {
		add(-1, "limited surface area")
	} else if (sizeClass >= 9) {
		add(1, "additional surface area")
	}

	if (atmosphereCode === 12 || atmosphereCode >= 15) {
		add(-12, "very hostile atmosphere")
	} else if (atmosphereCode === 11) {
		add(-10, "hostile atmosphere")
	} else if (
		atmosphereCode === 0 ||
		atmosphereCode === 1 ||
		atmosphereCode === 10
	) {
		add(-8, "non-breathable atmosphere")
	} else if (atmosphereCode === 2 || atmosphereCode === 14) {
		add(-4, "tainted very thin or thin, low atmosphere")
	} else if (atmosphereCode === 3 || atmosphereCode === 13) {
		add(-3, "very thin or very dense atmosphere")
	} else if (atmosphereCode === 4 || atmosphereCode === 9) {
		add(-2, "tainted thin or dense atmosphere")
	} else if (
		atmosphereCode === 5 ||
		atmosphereCode === 7 ||
		atmosphereCode === 8
	) {
		add(-1, "thin, tainted (standard), dense atmospheres")
	}

	if (
		params.atmosphere?.hazards?.some((hazard) => hazard.kind === "low oxygen")
	) {
		add(-2, "low oxygen taint")
	}

	if (hydrosphereCode === 0) {
		add(-4, "lack of accessible water")
	} else if (hydrosphereCode <= 3) {
		add(-2, "desert conditions prevalent")
	} else if (hydrosphereCode === 9) {
		add(-1, "little usable land surface area")
	} else if (hydrosphereCode === 10 || hydrosphereCode === 11) {
		add(-2, "very little usable land surface area")
	}

	if (temperatureMeanK < 253) add(-4, "freezing conditions")
	if (temperatureLowK < 253) add(-2, "too cold")
	if (temperatureMeanK > 323) add(-4, "burning conditions")
	if (temperatureHighK > 323) add(-2, "too hot")

	if (gravityG === undefined) {
		add(1 - Math.abs(6 - sizeClass), "undefined gravity")
	} else if (gravityG <= 0.2) {
		add(-4, "unhealthy low gravity levels")
	} else if (gravityG <= 0.4) {
		add(-2, "very low gravity")
	} else if (gravityG <= 0.7) {
		add(-1, "low gravity")
	} else if (gravityG <= 0.9) {
		add(1, "comfortable gravity")
	} else if (gravityG <= 1.1) {
		// no-op
	} else if (gravityG <= 1.4) {
		add(-1, "somewhat high gravity")
	} else if (gravityG <= 2) {
		add(-3, "uncomfortable high gravity")
	} else {
		add(-6, "gravity too high for acclimation")
	}

	if (tideLockedToStar) {
		add(-2, "solar tidal lock")
	}

	const seismic = Math.min(Math.floor(seismologyTotal / 100), 5)
	if (seismic > 0) {
		add(-seismic, "seismic activity")
	}
	const tides = Math.min(Math.floor(surfaceTidesHeating / 5), 2)
	if (tides > 0) {
		add(-tides, "extreme tides")
	}

	if (asteroidImpacts) add(-2, "frequent asteroid impacts")

	return { code: Math.max(0, habitability), trace }
}

export const HABITABILITY = { get }
