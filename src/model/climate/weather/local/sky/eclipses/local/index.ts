import { ECLIPSES } from "@/model/celestial/eclipses"
import { ECLIPSE_CALENDAR } from "@/model/celestial/eclipses/calendar"
import { ECLIPSE_DISKS } from "@/model/celestial/eclipses/disks"
import type { EclipseDiskUnion } from "@/model/celestial/eclipses/disks/types"
import { ECLIPSE_SHADOW } from "@/model/celestial/eclipses/shadow"
import type {
	EclipseGeometry,
	EclipseKind,
	EclipseMoonState,
	EclipseVector,
} from "@/model/celestial/eclipses/types"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_SKY } from "@/model/climate/weather/local/sky"
import type {
	EclipseAltitudeParams,
	EclipseCombineParams,
	EclipseLocalEventParams,
	EclipseLocalFrameParams,
	EclipseLocalPointParams,
	EclipseLocalStateParams,
	EclipseLocalUnionParams,
} from "@/model/climate/weather/local/sky/eclipses/local/types"
import type {
	CombinedCircumstances,
	LocalCircumstances,
} from "@/model/climate/weather/local/sky/eclipses/types"
import { SCAN } from "@/model/shared/math/scan"
import type { ScanInterval } from "@/model/shared/math/scan/types"

const occultationKinds: Partial<Record<EclipseKind, EclipseKind>> = {
	"solar-partial": "occultation-partial",
	"solar-annular": "occultation-annular",
	"solar-total": "occultation-total",
}

function stateOf(input: EclipseLocalStateParams) {
	return input.cache.ephemeris.moons.find((m) => m.moon.idx === input.idx)!
}

function frame({ cache, seconds }: EclipseLocalFrameParams) {
	const instant = WEATHER_CLOCK.resolve({
		params: cache.params,
		elapsedYears: seconds / cache.yearSeconds,
		manual: null,
	})
	const fixed = (vector: EclipseVector) =>
		WEATHER_SKY.bodyFixed({ instant, vector })
	return {
		instant,
		star: fixed(cache.ephemeris.starAt(seconds)),
		moon: (state: EclipseMoonState) =>
			fixed(ECLIPSE_CALENDAR.positionAt({ moon: state, seconds })),
	}
}

function altitude(input: EclipseAltitudeParams): number {
	const relative = input.body.map((v, n) => v - input.observer[n])
	return Math.asin(
		Math.max(
			-1,
			Math.min(
				1,
				relative.reduce((sum, v, n) => sum + v * input.xyz[n], 0) /
					Math.hypot(...relative),
			),
		),
	)
}

function point({ cache, xyz, event, seconds }: EclipseLocalPointParams) {
	const { instant, star, moon } = frame({ cache, seconds })
	const category = ECLIPSES.category(event.kind)
	const target = stateOf({ cache, idx: event.moonIdx })
	const occluder =
		event.occluderIdx === null
			? null
			: stateOf({ cache, idx: event.occluderIdx })
	const a = moon(target)
	const radius = (state: EclipseMoonState) => state.moon.diameterKm * 500
	const observer = xyz.map(
		(v) => v * cache.ephemeris.planetRadiusM,
	) as EclipseVector
	const base = {
		star,
		moon: a,
		planetRadiusM: cache.ephemeris.planetRadiusM,
		starRadiusM: cache.ephemeris.starRadiusM,
		moonRadiusM: radius(target),
	}
	let geometry: EclipseGeometry
	let body: EclipseVector
	let value: number
	if (category === "solar") {
		geometry = ECLIPSES.solar({ ...base, observer })
		body = star
		value = geometry.coverage
	} else if (category === "occultation" && occluder) {
		const b = moon(occluder)
		const aFar =
			Math.hypot(...a.map((v, n) => v - observer[n])) >=
			Math.hypot(...b.map((v, n) => v - observer[n]))
		const solar = ECLIPSES.solar({
			...base,
			star: aFar ? a : b,
			moon: aFar ? b : a,
			starRadiusM: radius(aFar ? target : occluder),
			moonRadiusM: radius(aFar ? occluder : target),
			observer,
		})
		geometry = {
			...solar,
			kind: solar.kind ? (occultationKinds[solar.kind] ?? null) : null,
		}
		body = aFar ? a : b
		value = solar.coverage
	} else {
		const shadow = ECLIPSE_SHADOW.evaluate({
			star,
			occluder: occluder ? moon(occluder) : [0, 0, 0],
			target: a,
			starRadiusM: cache.ephemeris.starRadiusM,
			occluderRadiusM: occluder
				? radius(occluder)
				: cache.ephemeris.planetRadiusM,
			targetRadiusM: radius(target),
		})
		const depth =
			shadow.umbra > 0 ? (shadow.contained ? "total" : "partial") : "penumbral"
		geometry = {
			status: shadow.valid ? "available" : "unavailable",
			kind:
				shadow.penumbra > 0
					? category === "shadow"
						? `shadow-${depth}`
						: `lunar-${depth}`
					: null,
			coverage: 0,
			margin: shadow.penumbra,
			penetration: shadow.umbra > 0 ? shadow.umbra : shadow.penumbra,
		}
		body = a
		value = geometry.penetration
	}
	const horizon =
		category === "solar"
			? WEATHER_SKY.sunHorizonRad
			: WEATHER_SKY.moonHorizonRad
	const above = altitude({ body, observer, xyz }) - horizon
	return {
		geometry,
		instant,
		above,
		visible: above > 0 && geometry.kind !== null,
		value,
	}
}

function union({
	cache,
	xyz,
	moonIdxs,
	seconds,
}: EclipseLocalUnionParams): EclipseDiskUnion {
	const { star, moon } = frame({ cache, seconds })
	const observer = xyz.map((v) => v * cache.ephemeris.planetRadiusM)
	const relative = (body: EclipseVector) => body.map((v, n) => v - observer[n])
	const s = relative(star)
	const ds = Math.hypot(...s)
	const axis = s.map((v) => v / ds)
	const helper = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
	const cross = (p: number[], q: number[]) => [
		p[1] * q[2] - p[2] * q[1],
		p[2] * q[0] - p[0] * q[2],
		p[0] * q[1] - p[1] * q[0],
	]
	const u0 = cross(helper, axis)
	const u = u0.map((v) => v / Math.hypot(...u0))
	const w = cross(axis, u)
	const dot = (p: number[], q: number[]) =>
		p.reduce((sum, v, n) => sum + v * q[n], 0)
	const disks = moonIdxs.flatMap((idx) => {
		const state = stateOf({ cache, idx })
		const m = relative(moon(state))
		const dm = Math.hypot(...m)
		if (dm >= ds) return []
		const direction = m.map((v) => v / dm)
		const separation = Math.acos(
			Math.max(-1, Math.min(1, dot(direction, axis))),
		)
		const azimuth = Math.atan2(dot(direction, w), dot(direction, u))
		return [
			{
				x: separation * Math.cos(azimuth),
				y: separation * Math.sin(azimuth),
				radius: Math.asin(Math.min(1, (state.moon.diameterKm * 500) / dm)),
			},
		]
	})
	return ECLIPSE_DISKS.union({
		starRadius: Math.asin(cache.ephemeris.starRadiusM / ds),
		disks,
	})
}

function circumstances({
	cache,
	xyz,
	event,
}: EclipseLocalEventParams): LocalCircumstances | null {
	const category = ECLIPSES.category(event.kind)
	const radius = cache.ephemeris.planetRadiusM
	const frameRate = cache.rates.frameRadS
	const star = cache.ephemeris.starSpeedRatio
	const angular = (idx: number, seconds: number) => {
		const state = stateOf({ cache, idx })
		const k = ECLIPSE_CALENDAR.kinematics({ moon: state, seconds })
		const base = k.rMin - radius
		return {
			rate: (k.speed + frameRate * radius) / base,
			semidiameter: Math.asin(
				Math.min(1, ECLIPSE_CALENDAR.motion(state).radius / base),
			),
			untilS: k.untilS,
		}
	}
	const at = (seconds: number) => point({ cache, xyz, event, seconds })
	const startS = event.ingressS,
		endS = event.egressS
	const safety = ECLIPSE_CALENDAR.rateSafety
	const moons = (seconds: number) => ({
		target: angular(event.moonIdx, seconds),
		occluder:
			event.occluderIdx === null ? null : angular(event.occluderIdx, seconds),
	})
	const above = SCAN.positive({
		f: (s) => at(s).above,
		startS,
		endS,
		rate: (s) => {
			if (category === "solar")
				return { rate: safety * (frameRate + star), untilS: Infinity }
			const { target, occluder } = moons(s)
			return {
				rate:
					safety *
					(frameRate + Math.max(target.rate, occluder ? occluder.rate : 0)),
				untilS: Math.min(target.untilS, occluder ? occluder.untilS : Infinity),
			}
		},
	})
	const disk = category === "solar" || category === "occultation"
	const overlap: ScanInterval[] = disk
		? SCAN.positive({
				f: (s) => Math.max(-Math.PI, at(s).geometry.margin),
				startS,
				endS,
				rate: (s) => {
					const { target, occluder } = moons(s)
					const moving = (1 + target.semidiameter) * target.rate
					return {
						rate:
							safety *
							(occluder
								? moving + (1 + occluder.semidiameter) * occluder.rate
								: moving + (1 + Math.PI / 2) * star),
						untilS: Math.min(
							target.untilS,
							occluder ? occluder.untilS : Infinity,
						),
					}
				},
			})
		: [[startS, endS]]
	const visibleIntervals = SCAN.intersect({ a: overlap, b: above })
	if (!visibleIntervals.length) return null
	const value = (s: number) => at(s).value
	let maximumS: number
	if (disk) {
		const best = visibleIntervals
			.map(([a, b]) => ({
				startS: a,
				...SCAN.maximum({ f: value, startS: a, endS: b }),
			}))
			.reduce((x, y) => (y.value > x.value ? y : x))
		maximumS = SCAN.earliest({
			f: value,
			startS: best.startS,
			endS: best.seconds,
			threshold: best.value - 1e-9,
		})
	} else {
		const inside = visibleIntervals.some(
			([a, b]) => event.maximumS >= a && event.maximumS <= b,
		)
		maximumS = inside
			? event.maximumS
			: visibleIntervals
					.flat()
					.reduce((best, s) => (value(s) > value(best) ? s : best))
	}
	const evaluation = at(maximumS)
	return {
		kind: evaluation.geometry.kind ?? event.kind,
		visibleIntervals,
		maximumS,
		coverage: disk ? evaluation.geometry.coverage : null,
		localHour: WEATHER_CLOCK.localSolar({ instant: evaluation.instant, xyz })
			.hour,
	}
}

function combine({
	cache,
	xyz,
	events,
}: EclipseCombineParams): CombinedCircumstances | null {
	const windows = events.flatMap((a, n) =>
		events
			.slice(n + 1)
			.flatMap((b) =>
				SCAN.intersect({ a: a.visibleIntervals, b: b.visibleIntervals }),
			),
	)
	if (!windows.length) return null
	const moonIdxs = events.map((event) => event.moonIdx)
	const coverage = (seconds: number) =>
		union({ cache, xyz, moonIdxs, seconds }).coverage
	const best = windows
		.map(([a, b]) => ({
			startS: a,
			...SCAN.maximum({ f: coverage, startS: a, endS: b }),
		}))
		.reduce((x, y) => (y.value > x.value ? y : x))
	const maximumS = SCAN.earliest({
		f: coverage,
		startS: best.startS,
		endS: best.seconds,
		threshold: best.value - 1e-9,
	})
	const result = union({ cache, xyz, moonIdxs, seconds: maximumS })
	const { instant } = frame({ cache, seconds: maximumS })
	return {
		maximumS,
		coverage: result.coverage,
		total: result.total,
		localHour: WEATHER_CLOCK.localSolar({ instant, xyz }).hour,
	}
}

export const LOCAL_ECLIPSES = { point, union, circumstances, combine }
