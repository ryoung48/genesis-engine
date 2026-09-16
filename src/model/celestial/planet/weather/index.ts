import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { WeatherProfile } from "@/model/celestial/orbit-body/types"
import type { ComputeWeatherProfileInput } from "@/model/celestial/planet/weather/types"

// [DEVIATION] Not book-sourced -- the Handbook explicitly puts weather
// patterns beyond its own scope ("Detailed climatic classifications and
// weather patterns are beyond the scope of this book but temperature can
// inform local conditions"). Homebrew, built from raw orbital/atmospheric
// inputs rather than the already-composite temperatureEstimate.deltaK (which
// conflates diurnal and seasonal swing, and isn't computed per-body at bulk-
// generation scale anyway -- see TemperatureEstimate's own doc).
//
// stormHazard -- atmosphereFactor (substrate gate), rotationFactor (Coriolis
// proxy, Earth-normalized: real tropical cyclones can't organize within ~5
// degrees of the equator because Coriolis is too weak there), and
// energyFactor (axial tilt, period-modulated, plus eccentricity) combine
// multiplicatively -- a storm needs wind capacity AND a destabilizing
// trigger simultaneously.
//
// windSpeed -- deliberately NOT built from rotation rate directly: real
// data (a GCM-style day-length experiment, see reference below) shows
// *faster* rotation produces *weaker* average surface winds (more, smaller,
// "Ferrel-like" cells vs. fewer, broader, more efficient ones), which also
// coherently explains Venus's extreme super-rotation despite its
// near-static 243-day rotation, without needing rotation as an input at
// all. Instead:
//   - sizeFactor: bigger bodies retain deeper atmospheres and, empirically,
//     are the windiest bodies in the solar system (the gas giants) --
//     size (diameterKm) stands in for that without needing to branch the
//     formula by body type.
//   - dayLengthFactor: day length relative to Earth's, exponent 0.37 fit
//     from that same day-length source (6h day -> ~60% of baseline speed),
//     clamped to [0.25x, 10x] Earth's day before applying the exponent so a
//     Mercury-scale 59x day (far outside that source's tested range) can't
//     extrapolate the relationship into nonsense.
//   - pressureDamping: thicker atmosphere -> *slower* average wind (a
//     second GCM-style source: Earth's own baseline at 2 bar/10 bar dropped
//     to ~86%/~59% of 1-bar speed) -- exponent -0.22 fit from those two
//     points. Unlike dayLengthFactor, this is only floored, not ceilinged:
//     tested against real Venus (92 bar) and Mars (0.006 bar), continuing
//     the same curve unbounded on the high end actually matched reality
//     *better* than an earlier 10-bar ceiling did (Venus's real surface wind
//     is slower than Earth's, which only the unceilinged curve reproduces).
//     The floor stays, but far lower than that same earlier attempt (0.001,
//     not 0.1) -- low enough to leave Mars's real 0.006 bar alone (which the
//     old floor caught and wrongly flattened), while still stopping the
//     exponent from driving speed toward infinity as pressure approaches
//     true vacuum. True vacuum itself (pressureBar exactly 0, e.g. the real
//     Moon) is handled separately below by atmospherePresenceFactor, a hard
//     gate rather than a floor -- a body with literally no atmosphere has no
//     medium to have a wind speed *at all*, which a floor alone can't
//     express (it would still return whatever sizeFactor/dayLengthFactor
//     alone predict).
//   - jovian heat boost: the real reason Jupiter/Saturn/Neptune are so
//     extreme isn't geometric at all -- these planets radiate more energy
//     than they receive from the Sun (Neptune ~2.6x, Jupiter ~1.7x), an
//     internal heat engine no rocky world has, and the actual established
//     driver of their wind speeds. No per-body internal-heat figure exists
//     for a jovian in this model (temperature's own effectiveSeismology
//     excludes jovians for the same reason: the residual-heating formula
//     isn't tuned for their huge sizeClass) -- insolation is used as a
//     proxy instead (colder/more distant giants trend toward proportionally
//     more internal-heat dominance in reality, e.g. Neptune vs. Jupiter).
//   - internal heat boost (non-jovian): seismology.totalHeating (residual +
//     tidal), when it exceeds Earth's own real value, gives a genuine
//     energy-availability bonus a purely geometric formula can't capture --
//     an Io-analog moon should register stronger winds than its size/day-
//     length/pressure alone would predict.
//   - deliberately excludes landCoverage/temperatureEstimate.deltaK/
//     cloudCover for the same reasons as stormHazard above.
//
// windForce: the actual drag equation (force ~ density x velocity^2,
// confirmed against a third GCM-style source using the same 2/10-bar
// scenarios: wind force there was ~54%/~3x+ higher than Earth's despite
// *slower* wind, precisely because the density term dominates the
// velocity^2 term). pressureBar stands in for density (same simplification
// CLOUD_COVER's own atmosphereFactor makes). Gated by the same atmosphere
// floor as before (no medium, no force) -- moved out of windSpeed itself,
// since a thin atmosphere (Mars) can still carry real wind *speed*, it just
// can't exert real *force*. Undefined for a jovian: no solid surface for
// wind to push against, so "force" has no meaningful reference point.
//
// Calibration source (all three): a GCM-style day-length/pressure/force
// worldbuilding blog series -- not a peer-reviewed source, but the closest
// available real modeling data for a mechanic this codebase has no better
// source for at all (see the Handbook's own explicit scope exclusion above).
const EARTH_DIAMETER_KM = 12_742
const EARTH_SIDEREAL_DAY_HOURS = 24
const EARTH_BASELINE_WIND_KMH = 10
// Earth's own computeResidualHeating output (sizeClass 8, ageGyr 4.6,
// densityEarthRelative 1, one sizeClass-6 moon (Luna)): floor(8 - 4.6 + 6)^2
// = floor(9.4)^2 = 81. Earth has no meaningful tidal heating of its own, so
// this is Earth's whole totalHeating baseline.
const EARTH_TOTAL_HEATING_REFERENCE = 81
const DAY_LENGTH_RATIO_MIN = 0.25
const DAY_LENGTH_RATIO_MAX = 10
const DAY_LENGTH_EXPONENT = 0.37
// Floored only, not ceilinged -- see the doc block above.
const PRESSURE_RATIO_MIN = 0.001
const PRESSURE_DAMPING_EXPONENT = -0.22
const ATMOSPHERE_GATE_SATURATION_BAR = 0.1
const JOVIAN_HEAT_BOOST_SCALE = 0.9
const JOVIAN_HEAT_BOOST_EXPONENT = 0.6
// Fit against the four real Sol giants, whose insolation ranges only from
// Jupiter's 5.2 AU to Neptune's 30 AU -- Neptune's own real implied boost is
// ~53x. This generator can place a jovian on a far wider orbit around a far
// dimmer star than anything in the real solar system, and 1/insolation has
// no ceiling of its own, so without a cap this term blows up to nonsense
// (observed: over 5 billion km/h for a distant-enough case). Capped at ~3x
// Neptune's own real value -- generous headroom for a genuinely more
// extreme case without an unbounded runaway.
const JOVIAN_HEAT_BOOST_MAX = 150
const INTERNAL_HEAT_BOOST_EXPONENT = 0.4
const STORM_HAZARD_THRESHOLD = 0.6
// Real Beaufort "Gale" threshold. Measured (2000-system galaxy, seed 1) at
// ~3.9% of non-jovian bodies, in line with every other rare-hazard flag
// (belt crossing/asteroid impacts/stormHazard all ~4%).
const STRONG_WINDS_THRESHOLD_KMH = 62

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value))
}

function computeProfile({
	pressureBar,
	siderealDayHours,
	axialTiltDeg,
	orbitalPeriodDays,
	eccentricity,
	diameterKm,
	group,
	orbitalDistanceAU,
	luminositySol,
	totalHeating,
}: ComputeWeatherProfileInput): WeatherProfile {
	const atmosphereFactor = clamp01(pressureBar / 1.0)
	const rotationFactor = clamp01(EARTH_SIDEREAL_DAY_HOURS / siderealDayHours)
	const tiltFactor = ORBIT_BODY.computeSeasonalTiltFactor({
		axialTiltDeg,
		orbitalPeriodDays,
	})
	const stormEnergyFactor = Math.min(1, tiltFactor + eccentricity)
	const stormScore = atmosphereFactor * rotationFactor * stormEnergyFactor

	const sizeFactor = diameterKm / EARTH_DIAMETER_KM
	const dayLengthRatio = Math.min(
		DAY_LENGTH_RATIO_MAX,
		Math.max(DAY_LENGTH_RATIO_MIN, siderealDayHours / EARTH_SIDEREAL_DAY_HOURS),
	)
	const dayLengthFactor = dayLengthRatio ** DAY_LENGTH_EXPONENT
	const pressureRatio = Math.max(PRESSURE_RATIO_MIN, pressureBar)
	const pressureDamping = pressureRatio ** PRESSURE_DAMPING_EXPONENT
	// True vacuum (no medium at all) means no wind speed, period -- not just
	// weak or floored. This is a hard gate, deliberately separate from the
	// floor above, which only guards against near-vacuum blowing up the
	// exponent, not against there being literally nothing to move.
	const atmospherePresenceFactor = pressureBar > 0 ? 1 : 0

	let windSpeedRelative =
		sizeFactor * dayLengthFactor * pressureDamping * atmospherePresenceFactor
	if (group === "jovian") {
		const insolationRelativeToEarth = luminositySol / orbitalDistanceAU ** 2
		const heatBoost = Math.min(
			JOVIAN_HEAT_BOOST_MAX,
			JOVIAN_HEAT_BOOST_SCALE *
				(1 / insolationRelativeToEarth) ** JOVIAN_HEAT_BOOST_EXPONENT,
		)
		windSpeedRelative *= heatBoost
	} else {
		const internalHeatBoost = Math.max(
			1,
			(totalHeating / EARTH_TOTAL_HEATING_REFERENCE) **
				INTERNAL_HEAT_BOOST_EXPONENT,
		)
		windSpeedRelative *= internalHeatBoost
	}

	const atmosphereGate = clamp01(pressureBar / ATMOSPHERE_GATE_SATURATION_BAR)
	const windForce =
		group === "jovian"
			? undefined
			: atmosphereGate * pressureBar * windSpeedRelative ** 2

	const windSpeedKmh = windSpeedRelative * EARTH_BASELINE_WIND_KMH
	const strongWinds =
		group === "jovian" ? undefined : windSpeedKmh > STRONG_WINDS_THRESHOLD_KMH

	return {
		stormHazard: stormScore > STORM_HAZARD_THRESHOLD,
		windSpeedRelative,
		windSpeedKmh,
		windForce,
		strongWinds,
	}
}

export const WEATHER = { computeProfile }
