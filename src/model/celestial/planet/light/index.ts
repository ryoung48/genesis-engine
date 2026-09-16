import type {
	ComputeLightProfileInput,
	LightProfile,
} from "@/model/celestial/planet/light/types"

// World Builder's Handbook p.119's Star Apparent Magnitude formula:
// -26.74 - 2.5 x log10(luminositySol / orbitalDistanceAU^2). -26.74 is Sol's
// own real apparent magnitude from Earth, which doubles as the calibration
// anchor here: luminositySol=1, orbitalDistanceAU=1 -> ratio=1 ->
// magnitude=-26.74 exactly.
const SOL_FROM_EARTH_MAGNITUDE = -26.74

// [DEVIATION] Not book-sourced -- the Handbook's formula is geometric only
// and never accounts for weather. coverFraction here is a climate-average
// (this codebase's own CLOUD_COVER, not a single storm cell), so a fully
// overcast sky (coverFraction 1) is calibrated to retain ~2% of clear-sky
// light (~4.7 magnitudes dimmer) -- real severe/persistent overcast can drop
// illuminance by ~1,000x versus full sun, well past the ~10x a milder "hazy"
// reading would suggest. coverFraction 0 leaves apparentMagnitude untouched.
const CLOUD_ATTENUATION_AT_FULL_COVER = 0.98

// [DEVIATION] Not book-sourced -- thresholds calibrated against the book's
// own reference table (p.119): Sol from Earth -26.74, full Luna -12.74,
// naked-eye daylight-visibility limit -4.00. "Dark" sits well past that
// daylight-visibility limit; "poorly lit" is the noticeably-dim band above
// it (a heavy-overcast-day feel, not full daylight).
const POORLY_LIT_MAGNITUDE_THRESHOLD = -18
const DARK_MAGNITUDE_THRESHOLD = -10

function computeApparentMagnitude(irradianceRelativeToEarth: number): number {
	if (irradianceRelativeToEarth <= 0) return Number.POSITIVE_INFINITY
	return SOL_FROM_EARTH_MAGNITUDE - 2.5 * Math.log10(irradianceRelativeToEarth)
}

function computeLightProfile({
	luminositySol,
	orbitalDistanceAU,
	cloudCoverFraction,
}: ComputeLightProfileInput): LightProfile {
	const irradianceRelativeToEarth =
		orbitalDistanceAU > 0
			? luminositySol / orbitalDistanceAU ** 2
			: Number.POSITIVE_INFINITY
	const apparentMagnitude = computeApparentMagnitude(irradianceRelativeToEarth)

	const retainedLightFraction =
		1 - CLOUD_ATTENUATION_AT_FULL_COVER * cloudCoverFraction
	const cloudMagnitudePenalty =
		retainedLightFraction > 0
			? -2.5 * Math.log10(retainedLightFraction)
			: Number.POSITIVE_INFINITY
	const effectiveApparentMagnitude = apparentMagnitude + cloudMagnitudePenalty

	return {
		irradianceRelativeToEarth,
		apparentMagnitude,
		effectiveApparentMagnitude,
		poorlyLit: effectiveApparentMagnitude > POORLY_LIT_MAGNITUDE_THRESHOLD,
		looksDark: effectiveApparentMagnitude > DARK_MAGNITUDE_THRESHOLD,
	}
}

export const LIGHT = { computeLightProfile }
