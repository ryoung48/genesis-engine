import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"
import { SKY_PRECESSION } from "@/model/climate/weather/local/sky/precession"
import type {
	BodyFixedParams,
	HalfArcParams,
	MoonOrbitParams,
	MoonOrbitState,
	MoonPhase,
	MoonSky,
	MoonSkyParams,
	RiseSetParams,
	SkyBodyPosition,
	SkyCycle,
	SkyParams,
	SkyPositions,
	SkyPositionsParams,
	SunSky,
} from "@/model/climate/weather/local/sky/types"
import { TIME } from "@/model/shared/time"

const TAU = 2 * Math.PI
const RAD = Math.PI / 180
const SUN_HORIZON = -0.833 * RAD
const MOON_HORIZON = 0.125 * RAD
const phases: MoonPhase[] = [
	"new",
	"waxingCrescent",
	"firstQuarter",
	"waxingGibbous",
	"full",
	"waningGibbous",
	"lastQuarter",
	"waningCrescent",
]

const wrap = (value: number) => ((value % 1) + 1) % 1

function halfArc({
	latitudeRad,
	declinationRad,
	horizonRad,
}: HalfArcParams): number | SkyCycle {
	const cosine =
		(Math.sin(horizonRad) - Math.sin(latitudeRad) * Math.sin(declinationRad)) /
		(Math.cos(latitudeRad) * Math.cos(declinationRad))
	if (cosine > 1) return "neverUp"
	if (cosine < -1) return "alwaysUp"
	return Math.acos(cosine)
}

function riseSet({ halfArc: arc, transitHour, dayHours }: RiseSetParams) {
	if (arc === null) return { riseHour: null, setHour: null }
	const offset = (arc / TAU) * dayHours
	return {
		riseHour: wrap((transitHour - offset) / dayHours) * dayHours,
		setHour: wrap((transitHour + offset) / dayHours) * dayHours,
	}
}

function dayHours(instant: WeatherInstant): number | null {
	return instant.solarDaySeconds === null
		? null
		: instant.solarDaySeconds / 3600
}

function sun({ instant, latitudeDeg }: SkyParams): SunSky {
	const hours = dayHours(instant)
	if (hours === null)
		return {
			cycle: "locked",
			riseHour: null,
			setHour: null,
			daylightHours: null,
		}
	const arc = halfArc({
		latitudeRad: latitudeDeg * RAD,
		declinationRad: Math.asin(Math.max(-1, Math.min(1, instant.sun[2]))),
		horizonRad: SUN_HORIZON,
	})
	if (typeof arc === "string")
		return {
			cycle: arc,
			riseHour: null,
			setHour: null,
			daylightHours: arc === "alwaysUp" ? hours : 0,
		}
	return {
		cycle: "cycle",
		...riseSet({ halfArc: arc, transitHour: hours / 2, dayHours: hours }),
		daylightHours: (arc / Math.PI) * hours,
	}
}

function bodyFixed({
	instant,
	vector,
}: BodyFixedParams): [number, number, number] {
	const tilt = instant.tiltDeg * RAD
	const c = Math.cos(tilt),
		s = Math.sin(tilt)
	const lambda = instant.solarLongitudeRad
	const starY = Math.sin(lambda) * c,
		starZ = Math.sin(lambda) * s
	const longitude = Math.atan2(instant.sun[1], instant.sun[0])
	const theta = Math.atan2(starY, Math.cos(lambda)) - longitude
	const eqY = vector[1] * c - vector[2] * s
	const eqZ = vector[1] * s + vector[2] * c
	const x = vector[0] * Math.cos(theta) + eqY * Math.sin(theta)
	const y = -vector[0] * Math.sin(theta) + eqY * Math.cos(theta)
	const correction =
		Math.asin(Math.max(-1, Math.min(1, instant.sun[2]))) -
		Math.asin(Math.max(-1, Math.min(1, starZ)))
	const radial = x * Math.cos(longitude) + y * Math.sin(longitude)
	const east = -x * Math.sin(longitude) + y * Math.cos(longitude)
	const aligned = radial * Math.cos(correction) - eqZ * Math.sin(correction)
	return [
		aligned * Math.cos(longitude) - east * Math.sin(longitude),
		aligned * Math.sin(longitude) + east * Math.cos(longitude),
		radial * Math.sin(correction) + eqZ * Math.cos(correction),
	]
}

function moonOrbit({ instant, moon }: MoonOrbitParams): MoonOrbitState {
	const vector = MECHANICS.keplerMoonPositionCartesian({
		moon,
		semiMajorAxisM: 1,
		t: instant.seconds / TIME.secondsPerDay,
	})
	const length = Math.hypot(vector.x, vector.y, vector.z)
	const unit: [number, number, number] = [
		vector.x / length,
		vector.y / length,
		vector.z / length,
	]
	const longitude = Math.atan2(unit[1], unit[0])
	const elongation = wrap((longitude - instant.solarLongitudeRad) / TAU)
	const fixed = bodyFixed({ instant, vector: unit })
	const declinationRad = Math.asin(Math.max(-1, Math.min(1, fixed[2])))
	const delta =
		Math.atan2(fixed[1], fixed[0]) - Math.atan2(instant.sun[1], instant.sun[0])
	const transitPhase = wrap(0.5 + ((instant.retrograde ? -1 : 1) * delta) / TAU)
	const illumination =
		(1 -
			unit[0] * Math.cos(instant.solarLongitudeRad) -
			unit[1] * Math.sin(instant.solarLongitudeRad)) /
		2
	return { elongation, illumination, declinationRad, transitPhase }
}

function transitHours(relativeRateRadS: number): number | null {
	return Math.abs(relativeRateRadS) > 0
		? TAU / Math.abs(relativeRateRadS) / 3600
		: null
}

function rotationRateRadS(instant: WeatherInstant): number {
	return ((instant.retrograde ? -1 : 1) * TAU) / instant.rotationSeconds
}

function moonRateRadS(moon: MoonBody): number {
	return (
		((Math.cos(moon.inclinationDeg * RAD) < 0 ? -1 : 1) * TAU) /
		(moon.orbitalPeriodDays * TIME.secondsPerDay)
	)
}

function positions({
	instant,
	xyz,
	moons: epoch,
	params,
}: SkyPositionsParams): SkyPositions {
	const bodies = SKY_PRECESSION.moons({
		params,
		moons: epoch,
		seconds: instant.seconds,
	})
	const localPhase = WEATHER_CLOCK.localSolar({ instant, xyz }).phase
	const rotation = rotationRateRadS(instant)
	const star: SkyBodyPosition = {
		declinationRad: Math.asin(Math.max(-1, Math.min(1, instant.sun[2]))),
		hourAngleRad: TAU * (localPhase - 0.5),
		transitHours: dayHours(instant),
	}
	return {
		star,
		moons: bodies.map((moon) => {
			const orbit = moonOrbit({ instant, moon })
			return {
				declinationRad: orbit.declinationRad,
				hourAngleRad: TAU * (localPhase - orbit.transitPhase),
				transitHours: transitHours(rotation - moonRateRadS(moon)),
			}
		}),
	}
}

function moons({
	instant,
	latitudeDeg,
	moons: epoch,
	params,
}: MoonSkyParams): MoonSky[] {
	const bodies = SKY_PRECESSION.moons({
		params,
		moons: epoch,
		seconds: instant.seconds,
	})
	const hours = dayHours(instant)
	const latitudeRad = latitudeDeg * RAD
	return bodies
		.filter((moon) => moon.orbitalPeriodDays > 0)
		.map((moon, index) => {
			const { elongation, illumination, declinationRad, transitPhase } =
				moonOrbit({
					instant,
					moon,
				})
			const base = {
				label: moon.name ?? `Moon ${index + 1}`,
				phase: phases[Math.round(elongation * 8) % 8],
				illumination,
				waxing: elongation < 0.5,
			}
			if (hours === null)
				return {
					...base,
					cycle: "locked" as const,
					riseHour: null,
					setHour: null,
					upHours: null,
				}
			const transitHour = transitPhase * hours
			const arc = halfArc({
				latitudeRad,
				declinationRad,
				horizonRad: MOON_HORIZON,
			})
			return {
				...base,
				cycle: typeof arc === "string" ? arc : ("cycle" as const),
				...riseSet({
					halfArc: typeof arc === "string" ? null : arc,
					transitHour,
					dayHours: hours,
				}),
				upHours:
					typeof arc === "string"
						? arc === "alwaysUp"
							? hours
							: 0
						: (arc / Math.PI) * hours,
			}
		})
}

export const WEATHER_SKY = {
	sun,
	moons,
	positions,
	bodyFixed,
	sunHorizonRad: SUN_HORIZON,
	moonHorizonRad: MOON_HORIZON,
}
