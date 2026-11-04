import { MECHANICS } from "@/model/celestial/moons/mechanics"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { TIDAL_FORCE } from "@/model/climate/ocean/tides/tidal-force"
import { TIDAL_CONTRIBUTORS } from "@/model/climate/ocean/tides/tidal-schedule/contributors"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type {
	MarineTide,
	MarineTideBody,
	MarineTideEventParams,
	MarineTideLevelParams,
	MarineTideParams,
	MarineTidePhase,
	MarineTidePhaseParams,
	MarineTideStrengthParams,
} from "@/model/climate/weather/local/marine/tide/types"
import { WEATHER_SKY } from "@/model/climate/weather/local/sky"
import { TIME } from "@/model/shared/time"

const RAD = Math.PI / 180
const LATITUDE_CAP_DEG = 60
const HORIZON_TRANSITS = 1.25
const MAX_HORIZON_SECONDS = 7 * TIME.secondsPerDay
const STEPS_PER_SHORTEST_TRANSIT = 144
const MIN_STEPS_PER_HORIZON = 180
const MAX_STEPS = 4096
const SPRING_SHARE = 0.8
const NEAP_SHARE = 0.5

function strength({
	massKg,
	distanceM,
	planetMassKg,
	planetRadiusM,
}: MarineTideStrengthParams): number {
	return TIDAL_FORCE.tideContribution({
		bodyLatRad: 0,
		bodyLonRad: 0,
		bodyDistanceM: distanceM,
		bodyMassKg: massKg,
		surfaceLatRad: 0,
		surfaceLonRad: 0,
		planetMassKg,
		planetRadiusM,
	})
}

function phaseOf({
	dayRangeM,
	springRangeM,
}: MarineTidePhaseParams): MarineTidePhase {
	if (dayRangeM >= SPRING_SHARE * springRangeM) return "spring"
	if (dayRangeM <= NEAP_SHARE * springRangeM) return "neap"
	return "between"
}

function tide({
	instant,
	moons,
	shore,
	params,
}: MarineTideParams): MarineTide | null {
	if (instant.solarDaySeconds === null || shore.springRangeM <= 0) return null
	const planetMassKg = MECHANICS.derivePlanetMassKg(params.planetRadiusKm)
	const planetRadiusM = params.planetRadiusKm * 1000
	const active = moons.filter(
		(moon) =>
			!TIDAL_CONTRIBUTORS.lockedToMoon({ tideLock: params.tideLock, moon }),
	)
	const rotation =
		((instant.retrograde ? -1 : 1) * 2 * Math.PI) / instant.rotationSeconds
	const transit = (rate: number) =>
		Math.abs(rate) > 0 ? (2 * Math.PI) / Math.abs(rate) : null
	const star: MarineTideBody = {
		strength:
			params.tideLock?.type === "solar"
				? 0
				: strength({
						massKg: TIDAL_CONTRIBUTORS.starMassKg(params),
						distanceM: params.orbitalDistanceAU * ORBIT_BODY.astronomicalUnitM,
						planetMassKg,
						planetRadiusM,
					}),
		transitSeconds: transit(rotation - (2 * Math.PI) / instant.yearSeconds),
	}
	const bodies: MarineTideBody[] = [
		star,
		...active.map((moon) => ({
			strength: strength({
				massKg: moon.massKg,
				distanceM: MECHANICS.moonSemiMajorAxisM({ moon, planetMassKg }),
				planetMassKg,
				planetRadiusM,
			}),
			transitSeconds: transit(
				rotation -
					(2 * Math.PI) / (moon.orbitalPeriodDays * TIME.secondsPerDay),
			),
		})),
	]
	const total = bodies.reduce((sum, body) => sum + body.strength, 0)
	if (!(total > 0)) return null

	const latitudeRad = shore.latitudeDeg * RAD
	const sinLat = Math.sin(latitudeRad)
	const cosLat = Math.cos(latitudeRad)
	const capped = Math.min(Math.abs(shore.latitudeDeg), LATITUDE_CAP_DEG) * RAD
	const scale = shore.springRangeM / (1.5 * Math.cos(capped) ** 2 * total)

	const cycling = bodies.filter(
		(body): body is MarineTideBody & { transitSeconds: number } =>
			body.transitSeconds !== null && Number.isFinite(body.transitSeconds),
	)
	const dominant = cycling.reduce<(typeof cycling)[number] | null>(
		(best, body) => (!best || body.strength > best.strength ? body : best),
		null,
	)
	const lag = dominant ? (shore.lagDraw * dominant.transitSeconds) / 2 : 0

	const level = ({ seconds }: MarineTideLevelParams) => {
		const lagged = WEATHER_CLOCK.resolve({
			params,
			elapsedYears: (seconds - lag) / instant.yearSeconds,
			manual: null,
		})
		const sky = WEATHER_SKY.positions({
			instant: lagged,
			xyz: shore.xyz,
			moons: active,
		})
		const positions = [sky.star, ...sky.moons]
		let sum = 0
		for (let k = 0; k < bodies.length; k++) {
			const body = bodies[k]
			const { declinationRad, hourAngleRad } = positions[k]
			const along = sinLat * Math.sin(declinationRad)
			const across = cosLat * Math.cos(declinationRad)
			const cosine = along + across * Math.cos(hourAngleRad)
			const p2 = 1.5 * cosine * cosine - 0.5
			const mean = 1.5 * along * along + 0.75 * across * across - 0.5
			sum += body.strength * (p2 - mean)
		}
		return scale * sum
	}

	const current = level({ seconds: instant.seconds })
	if (!dominant)
		return {
			levelM: current,
			direction: "steady",
			high: null,
			low: null,
			dayRangeM: null,
			phase: null,
			springRangeM: shore.springRangeM,
		}

	const shortest = Math.min(...cycling.map((body) => body.transitSeconds))
	const targetHorizon = Math.min(
		HORIZON_TRANSITS * dominant.transitSeconds,
		MAX_HORIZON_SECONDS,
	)
	const step = Math.min(
		shortest / STEPS_PER_SHORTEST_TRANSIT,
		targetHorizon / MIN_STEPS_PER_HORIZON,
	)
	const steps = Math.min(MAX_STEPS, Math.ceil(targetHorizon / step))
	const levels = [current]
	for (let i = 1; i <= steps; i++)
		levels.push(level({ seconds: instant.seconds + i * step }))

	const localPhase = WEATHER_CLOCK.localSolar({ instant, xyz: shore.xyz }).phase
	const solarDaySeconds = instant.solarDaySeconds
	const event = ({ index, level: levelM }: MarineTideEventParams) => {
		const seconds = instant.seconds + index * step
		const at = WEATHER_CLOCK.resolve({
			params,
			elapsedYears: seconds / instant.yearSeconds,
			manual: null,
		})
		return {
			seconds,
			levelM,
			localHour: WEATHER_CLOCK.localSolar({ instant: at, xyz: shore.xyz }).hour,
			dayOffset: Math.floor(localPhase + (index * step) / solarDaySeconds),
		}
	}
	let high: MarineTide["high"] = null
	let low: MarineTide["low"] = null
	for (let i = 1; i < levels.length - 1 && (!high || !low); i++) {
		if (!high && levels[i] > levels[i - 1] && levels[i] > levels[i + 1])
			high = event({ index: i, level: levels[i] })
		if (!low && levels[i] < levels[i - 1] && levels[i] < levels[i + 1])
			low = event({ index: i, level: levels[i] })
	}

	const covered = steps * step >= dominant.transitSeconds
	let dayRangeM: number | null = null
	if (covered) {
		let max = -Infinity
		let min = Infinity
		for (
			let i = 0;
			i < levels.length && i * step <= dominant.transitSeconds;
			i++
		) {
			max = Math.max(max, levels[i])
			min = Math.min(min, levels[i])
		}
		dayRangeM = max - min
	}
	const next = levels[1]
	return {
		levelM: current,
		direction:
			next > current ? "rising" : next < current ? "falling" : "steady",
		high,
		low,
		dayRangeM,
		phase:
			dayRangeM === null
				? null
				: phaseOf({ dayRangeM, springRangeM: shore.springRangeM }),
		springRangeM: shore.springRangeM,
	}
}

export const MARINE_TIDE = { tide }
