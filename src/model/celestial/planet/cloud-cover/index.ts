import type {
	CloudCoverComputeInput,
	CloudCoverProfile,
} from "@/model/celestial/planet/cloud-cover/types"
import { MATH } from "@/model/shared/math/core"

// [DEVIATION] Not book-sourced -- the Handbook never rolls a cloud-cover
// stat; clouds only show up narratively, tied to temperature band ("icy
// world... few clouds" vs. "hot world... most water in the form of clouds")
// and are already folded as a fudge factor into DENSITY.rollAlbedo's
// atmosphere/hydrosphere bumps. This pulls that implicit signal back out into
// its own real fraction: cover is gated by atmosphere thickness (no
// atmosphere, no clouds), scaled by available surface water, and shaped by a
// temperature ramp -- cold worlds lock their volatiles as ice caps rather
// than clouds, hot worlds push essentially all of them into vapor. It has no
// chemistry override, so it misses a runaway-greenhouse overcast driven by
// something other than water (e.g. real Venus's sulfuric clouds).
const FREEZE_K = 200
const HOT_K = 320
const ATMOSPHERE_SATURATION_BAR = 0.5
const GAS_GIANT_COVER_FRACTION = 0.95
const NO_ATMOSPHERE_TYPES: readonly NonNullable<
	CloudCoverComputeInput["atmosphereType"]
>[] = ["vacuum", "trace"]

function temperatureRamp(temperatureMeanK: number): number {
	return MATH.clamp({
		value: (temperatureMeanK - FREEZE_K) / (HOT_K - FREEZE_K),
		lo: 0,
		hi: 1,
	})
}

function rawCoverFraction(params: {
	waterFraction: number
	temperatureMeanK: number
	pressureBar?: number
}): number {
	const atmosphereFactor = MATH.clamp({
		value: (params.pressureBar ?? 0) / ATMOSPHERE_SATURATION_BAR,
		lo: 0,
		hi: 1,
	})
	return (
		atmosphereFactor *
		Math.sqrt(Math.max(params.waterFraction, 0)) *
		temperatureRamp(params.temperatureMeanK)
	)
}

// Real Earth mean cloud cover (~two-thirds sky, per satellite climatology) at
// Earth's own inputs -- 70% surface water (hydrosphere code 7, not 10), a
// standard ~1 bar atmosphere, and a 288K mean temperature.
const EARTH_COVER_FRACTION = 0.67
const CALIBRATION =
	EARTH_COVER_FRACTION /
	rawCoverFraction({
		waterFraction: 0.7,
		temperatureMeanK: 288,
		pressureBar: 1,
	})

function describeCoverFraction(coverFraction: number): string {
	if (coverFraction < 0.1) return "Clear"
	if (coverFraction < 0.3) return "Mostly Clear"
	if (coverFraction < 0.5) return "Partly Cloudy"
	if (coverFraction < 0.7) return "Mostly Cloudy"
	if (coverFraction < 0.9) return "Overcast"
	return "Fully Overcast"
}

function computeCloudCover({
	waterFraction,
	temperatureMeanK,
	atmosphereType,
	pressureBar,
}: CloudCoverComputeInput): CloudCoverProfile {
	if (!atmosphereType || NO_ATMOSPHERE_TYPES.includes(atmosphereType)) {
		return { coverFraction: 0, description: describeCoverFraction(0) }
	}
	if (atmosphereType === "gas") {
		return {
			coverFraction: GAS_GIANT_COVER_FRACTION,
			description: describeCoverFraction(GAS_GIANT_COVER_FRACTION),
		}
	}
	const coverFraction = MATH.clamp({
		value:
			CALIBRATION *
			rawCoverFraction({ waterFraction, temperatureMeanK, pressureBar }),
		lo: 0,
		hi: 1,
	})
	return { coverFraction, description: describeCoverFraction(coverFraction) }
}

export const CLOUD_COVER = { compute: computeCloudCover }
