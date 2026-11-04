import type { WeatherInstant } from "@/model/climate/weather/local/clock/types"
import type {
	HalfArcParams,
	MoonPhase,
	MoonSky,
	MoonSkyParams,
	RiseSetParams,
	SkyCycle,
	SkyParams,
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

function moons({
	instant,
	latitudeDeg,
	moons: bodies,
}: MoonSkyParams): MoonSky[] {
	const hours = dayHours(instant)
	const latitudeRad = latitudeDeg * RAD
	const tilt = instant.tiltDeg * RAD
	return bodies
		.filter((moon) => moon.orbitalPeriodDays > 0)
		.map((moon, index) => {
			const longitude =
				(moon.longitudeOfAscendingNodeDeg +
					moon.longitudeOfPerihelionDeg +
					moon.meanAnomalyAtEpochDeg) *
					RAD +
				(TAU * instant.seconds) / (moon.orbitalPeriodDays * TIME.secondsPerDay)
			const elongation = wrap((longitude - instant.solarLongitudeRad) / TAU)
			const base = {
				label: moon.name ?? `Moon ${index + 1}`,
				phase: phases[Math.round(elongation * 8) % 8],
				illumination: (1 - Math.cos(elongation * TAU)) / 2,
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
			const declinationRad = Math.asin(Math.sin(tilt) * Math.sin(longitude))
			const transitHour =
				wrap(0.5 + (instant.retrograde ? -1 : 1) * elongation) * hours
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

export const WEATHER_SKY = { sun, moons }
