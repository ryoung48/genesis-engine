import type {
	EclipseAdvanceParams,
	EclipseBodyTrackParams,
	EclipseCalendar,
	EclipseCalendarCreateParams,
	EclipseCalendarEventsParams,
	EclipseCalendarExtendParams,
	EclipseEventParams,
	EclipseKinematics,
	EclipseMoonAtParams,
	EclipseMoonMotion,
	EclipseMoonValidityParams,
	EclipseOccultationMarginParams,
	EclipseRateTable,
	EclipseTrack,
	EclipseTrackBuildParams,
	EclipseTrackKind,
} from "@/model/celestial/eclipses/calendar/types"
import { ECLIPSE_SHADOW } from "@/model/celestial/eclipses/shadow"
import type { ShadowState } from "@/model/celestial/eclipses/shadow/types"
import type {
	EclipseCalendarResult,
	EclipseMoonState,
	EclipseVector,
	PlanetEclipse,
} from "@/model/celestial/eclipses/types"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import { MOON_PRECESSION } from "@/model/celestial/moons/mechanics/precession"
import { SCAN } from "@/model/shared/math/scan"
import type { ScanRate } from "@/model/shared/math/scan/types"
import { TIME } from "@/model/shared/time"

const RATE_SAFETY = 1.25
const origin: EclipseVector = [0, 0, 0]

const RATE_BINS = 16
const BIN_MIN_ECCENTRICITY = 0.2
const bins = new WeakMap<EclipseMoonState, EclipseRateTable>()

function positionAt({ moon, seconds }: EclipseMoonAtParams): EclipseVector {
	const t = seconds / TIME.secondsPerDay
	const vector = MECHANICS.keplerMoonPositionCartesian({
		moon: MOON_PRECESSION.elements({ moon: moon.moon, rates: moon.rates, t }),
		semiMajorAxisM: moon.semiMajorAxisM,
		t,
	})
	return [vector.x, vector.y, vector.z]
}

function binsFor(moon: EclipseMoonState): EclipseRateTable {
	const previous = bins.get(moon)
	if (previous) return previous
	const e = moon.moon.eccentricity
	const a = moon.semiMajorAxisM
	const n = (2 * Math.PI) / (moon.moon.orbitalPeriodDays * TIME.secondsPerDay)
	const turning =
		(Math.abs(moon.rates.nodeRadPerDay) +
			2 * Math.abs(moon.rates.apsisRadPerDay)) /
		TIME.secondsPerDay
	const count = e < BIN_MIN_ECCENTRICITY ? 1 : RATE_BINS
	const anomalies = [...Array(count + 1).keys()].map(
		(index) => (2 * Math.PI * index) / count,
	)
	const radius = (E: number) => a * (1 - e * Math.cos(E))
	const table: EclipseRateTable = {
		edges: anomalies.map((E) => E - e * Math.sin(E)),
		bins: anomalies.slice(1).map((end, index) => {
			const ends = [radius(anomalies[index]), radius(end)]
			const rMin = count === 1 ? a * (1 - e) : Math.min(...ends)
			const rMax = count === 1 ? a * (1 + e) : Math.max(...ends)
			return {
				rMin,
				rMax,
				speed:
					n * a * Math.sqrt(Math.max(0, (2 * a) / rMin - 1)) + rMax * turning,
			}
		}),
	}
	bins.set(moon, table)
	return table
}

function kinematics({ moon, seconds }: EclipseMoonAtParams): EclipseKinematics {
	const table = binsFor(moon)
	const rate =
		(2 * Math.PI) / (moon.moon.orbitalPeriodDays * TIME.secondsPerDay) -
		moon.rates.apsisRadPerDay / TIME.secondsPerDay
	if (table.bins.length === 1 || !(rate > 0)) {
		const worst = table.bins.reduce((x, y) => (y.speed > x.speed ? y : x))
		return {
			speed: worst.speed,
			rMin: Math.min(...table.bins.map((bin) => bin.rMin)),
			rMax: Math.max(...table.bins.map((bin) => bin.rMax)),
			untilS: Infinity,
		}
	}
	const turn = 2 * Math.PI
	const mean =
		((((moon.moon.meanAnomalyAtEpochDeg * Math.PI) / 180 + rate * seconds) %
			turn) +
			turn) %
		turn
	let index = table.bins.length - 1
	for (let k = 0; k < table.bins.length; k++)
		if (mean < table.edges[k + 1] - 1e-12) {
			index = k
			break
		}
	return {
		...table.bins[index],
		untilS: seconds + Math.max(1e-9, table.edges[index + 1] - mean) / rate,
	}
}

function motion(moon: EclipseMoonState): EclipseMoonMotion {
	const e = moon.moon.eccentricity
	const n = (2 * Math.PI) / (moon.moon.orbitalPeriodDays * TIME.secondsPerDay)
	return {
		speed: n * moon.semiMajorAxisM * Math.sqrt((1 + e) / (1 - e)),
		periapsis: moon.semiMajorAxisM * (1 - e),
		apoapsis: moon.semiMajorAxisM * (1 + e),
		radius: moon.moon.diameterKm * 500,
	}
}

function validMoon(input: EclipseMoonValidityParams): boolean {
	const { moon, semiMajorAxisM } = input.moon
	return (
		Number.isFinite(semiMajorAxisM + moon.diameterKm) &&
		moon.diameterKm > 0 &&
		moon.eccentricity >= 0 &&
		moon.eccentricity < 1 &&
		moon.orbitalPeriodDays > 0 &&
		semiMajorAxisM * (1 - moon.eccentricity) >
			input.planetRadiusM + moon.diameterKm * 500
	)
}

function validPair({ moon, other }: EclipseTrackBuildParams): boolean {
	const a = motion(moon),
		b = motion(other)
	const [inner, outer] = a.apoapsis <= b.apoapsis ? [a, b] : [b, a]
	return outer.periapsis - inner.apoapsis > a.radius + b.radius
}

function shadowKind(state: ShadowState): "total" | "partial" | "penumbral" {
	return state.umbra > 0 ? (state.contained ? "total" : "partial") : "penumbral"
}

function bodyTracks(input: EclipseBodyTrackParams): EclipseTrack[] {
	const { ephemeris, moon } = input
	const m = motion(moon)
	const rate = (seconds: number): ScanRate => {
		const k = kinematics({ moon, seconds })
		return {
			rate:
				RATE_SAFETY *
				(k.speed +
					(k.rMax + ephemeris.planetRadiusM) * ephemeris.starSpeedRatio),
			untilS: k.untilS,
		}
	}
	return [false, true].map((lunar): EclipseTrack => {
		const state = (seconds: number) => {
			const position = positionAt({ moon, seconds })
			return ECLIPSE_SHADOW.evaluate({
				star: ephemeris.starAt(seconds),
				occluder: lunar ? origin : position,
				target: lunar ? position : origin,
				starRadiusM: ephemeris.starRadiusM,
				occluderRadiusM: lunar ? ephemeris.planetRadiusM : m.radius,
				targetRadiusM: lunar ? m.radius : ephemeris.planetRadiusM,
			})
		}
		return {
			category: lunar ? "lunar" : "solar",
			rate,
			margin: (seconds: number) => state(seconds).penumbra,
			kindAt: (seconds: number): EclipseTrackKind => {
				const shadow = state(seconds)
				return {
					moon,
					occluder: null,
					kind: lunar
						? `lunar-${shadowKind(shadow)}`
						: shadow.umbra > 0
							? "solar-total"
							: shadow.antumbra > 0
								? "solar-annular"
								: "solar-partial",
				}
			},
			events: [],
			state: { t: 0, value: 0, openS: null, evaluations: 0 },
		}
	})
}

function shadowTrack({
	ephemeris,
	moon,
	other,
}: EclipseTrackBuildParams): EclipseTrack {
	const a = motion(moon),
		b = motion(other)
	const state = (seconds: number) =>
		ECLIPSE_SHADOW.evaluate({
			star: ephemeris.starAt(seconds),
			occluder: positionAt({ moon: other, seconds }),
			target: positionAt({ moon, seconds }),
			starRadiusM: ephemeris.starRadiusM,
			occluderRadiusM: b.radius,
			targetRadiusM: a.radius,
		})
	return {
		category: "shadow",
		rate: (seconds) => {
			const p = kinematics({ moon, seconds }),
				q = kinematics({ moon: other, seconds })
			return {
				rate:
					RATE_SAFETY *
					(p.speed +
						q.speed +
						(p.rMax + q.rMax + ephemeris.planetRadiusM) *
							ephemeris.starSpeedRatio),
				untilS: Math.min(p.untilS, q.untilS),
			}
		},
		margin: (seconds) => state(seconds).penumbra,
		kindAt: (seconds) => ({
			moon,
			occluder: other,
			kind: `shadow-${shadowKind(state(seconds))}`,
		}),
		events: [],
		state: { t: 0, value: 0, openS: null, evaluations: 0 },
	}
}

function occultationMargin({
	near,
	far,
	planetRadiusM,
	nearPosition,
	farPosition,
}: EclipseOccultationMarginParams): number {
	const reach = (moon: EclipseMoonState, distance: number) =>
		Math.asin(Math.min(1, motion(moon).radius / (distance - planetRadiusM))) +
		Math.asin(Math.min(1, planetRadiusM / distance))
	const dn = Math.hypot(...nearPosition),
		df = Math.hypot(...farPosition)
	const cosine =
		nearPosition.reduce((sum, v, n) => sum + v * farPosition[n], 0) / (dn * df)
	return (
		reach(near, dn) +
		reach(far, df) -
		Math.acos(Math.max(-1, Math.min(1, cosine)))
	)
}

function occultationTrack({
	ephemeris,
	moon,
	other,
}: EclipseTrackBuildParams): EclipseTrack {
	const angular = (state: EclipseMoonState, seconds: number) => {
		const k = kinematics({ moon: state, seconds })
		const base = k.rMin - ephemeris.planetRadiusM
		const semidiameter = Math.asin(Math.min(1, motion(state).radius / base))
		const parallax = Math.asin(ephemeris.planetRadiusM / k.rMin)
		return {
			rate:
				k.speed *
				((1 + Math.tan(parallax)) / k.rMin + Math.tan(semidiameter) / base),
			untilS: k.untilS,
		}
	}
	const ordered = (seconds: number) => {
		const p = positionAt({ moon, seconds }),
			q = positionAt({ moon: other, seconds })
		return Math.hypot(...p) >= Math.hypot(...q)
			? { far: moon, near: other, farPosition: p, nearPosition: q }
			: { far: other, near: moon, farPosition: q, nearPosition: p }
	}
	return {
		category: "occultation",
		rate: (seconds) => {
			const p = angular(moon, seconds),
				q = angular(other, seconds)
			return {
				rate: RATE_SAFETY * (p.rate + q.rate),
				untilS: Math.min(p.untilS, q.untilS),
			}
		},
		margin: (seconds) =>
			occultationMargin({
				...ordered(seconds),
				planetRadiusM: ephemeris.planetRadiusM,
			}),
		kindAt: (seconds) => {
			const { far, near, farPosition, nearPosition } = ordered(seconds)
			const df = Math.hypot(...farPosition),
				dn = Math.hypot(...nearPosition)
			const sf = Math.asin(motion(far).radius / df),
				sn = Math.asin(motion(near).radius / dn)
			const separation = Math.acos(
				Math.max(
					-1,
					Math.min(
						1,
						nearPosition.reduce((sum, v, n) => sum + v * farPosition[n], 0) /
							(dn * df),
					),
				),
			)
			return {
				moon: far,
				occluder: near,
				kind:
					separation <= Math.abs(sn - sf)
						? sn >= sf
							? "occultation-total"
							: "occultation-annular"
						: "occultation-partial",
			}
		},
		events: [],
		state: { t: 0, value: 0, openS: null, evaluations: 0 },
	}
}

function create({
	ephemeris,
	startS,
}: EclipseCalendarCreateParams): EclipseCalendar {
	const star = Number.isFinite(startS) ? ephemeris.starAt(startS) : [NaN]
	const invalid =
		!Number.isFinite(startS) ||
		!Number.isFinite(ephemeris.starRadiusM + ephemeris.planetRadiusM) ||
		Math.min(ephemeris.starRadiusM, ephemeris.planetRadiusM) <= 0 ||
		!star.every(Number.isFinite) ||
		Math.hypot(...star) <= ephemeris.starRadiusM + ephemeris.planetRadiusM
	const calendar: EclipseCalendar = {
		ephemeris,
		startS,
		tracks: [],
		invalid,
		unavailableMoons: [],
		unavailablePairs: [],
	}
	if (invalid) return calendar
	const moons = ephemeris.moons.filter((moon) => {
		const valid = validMoon({ moon, planetRadiusM: ephemeris.planetRadiusM })
		if (!valid) calendar.unavailableMoons.push(moon.moon.idx)
		return valid
	})
	const tracks = moons.flatMap((moon) => bodyTracks({ ephemeris, moon }))
	for (const [n, moon] of moons.entries())
		for (const other of moons.slice(n + 1)) {
			if (!validPair({ ephemeris, moon, other })) {
				calendar.unavailablePairs.push([moon.moon.idx, other.moon.idx])
				continue
			}
			tracks.push(
				shadowTrack({ ephemeris, moon, other }),
				shadowTrack({ ephemeris, moon: other, other: moon }),
				occultationTrack({ ephemeris, moon, other }),
			)
		}
	for (const track of tracks)
		track.state = SCAN.create({ f: track.margin, startS })
	calendar.tracks = tracks
	return calendar
}

function label(moon: EclipseMoonState): string {
	return moon.moon.name ?? `Moon ${moon.moon.idx}`
}

function event({
	calendar,
	track,
	ingressS,
	egressS,
	clippedEnd,
}: EclipseEventParams): PlanetEclipse {
	const maximum = SCAN.maximum({
		f: track.margin,
		startS: ingressS,
		endS: egressS,
	})
	const { kind, moon, occluder } = track.kindAt(maximum.seconds)
	track.state.evaluations += maximum.evaluations + 1
	return {
		moonIdx: moon.moon.idx,
		moonLabel: label(moon),
		occluderIdx: occluder ? occluder.moon.idx : null,
		occluderLabel: occluder ? label(occluder) : null,
		kind,
		ingressS,
		egressS,
		maximumS: maximum.seconds,
		penetration: maximum.value,
		clippedStart: ingressS === calendar.startS,
		clippedEnd,
	}
}

function advance({ calendar, track, endS }: EclipseAdvanceParams): void {
	const closed = SCAN.advance({
		f: track.margin,
		state: track.state,
		endS,
		rate: track.rate,
	})
	for (const [ingressS, egressS] of closed)
		track.events.push(
			event({ calendar, track, ingressS, egressS, clippedEnd: false }),
		)
}

function extend({ calendar, endS }: EclipseCalendarExtendParams): void {
	for (const track of calendar.tracks)
		if (track.state.t < endS) advance({ calendar, track, endS })
}

function events({
	calendar,
	startS,
	endS,
	followS,
}: EclipseCalendarEventsParams): EclipseCalendarResult {
	const base = {
		unavailableMoons: calendar.unavailableMoons,
		unavailablePairs: calendar.unavailablePairs,
	}
	if (calendar.invalid)
		return { ...base, status: "unavailable", events: [], evaluations: 0 }
	extend({ calendar, endS })
	const result: PlanetEclipse[] = []
	for (const track of calendar.tracks) {
		const step = (followS - endS) / 16
		while (track.state.openS !== null && track.state.t < followS)
			advance({
				calendar,
				track,
				endS: Math.min(followS, track.state.t + step),
			})
		for (const known of track.events)
			if (known.egressS > startS && known.ingressS < endS) result.push(known)
		if (track.state.openS !== null && track.state.openS < endS)
			result.push(
				event({
					calendar,
					track,
					ingressS: track.state.openS,
					egressS: track.state.t,
					clippedEnd: true,
				}),
			)
	}
	result.sort(
		(a, b) =>
			a.maximumS - b.maximumS ||
			a.moonIdx - b.moonIdx ||
			a.kind.localeCompare(b.kind),
	)
	return {
		...base,
		status: "complete",
		events: result,
		evaluations: calendar.tracks.reduce(
			(sum, track) => sum + track.state.evaluations,
			0,
		),
	}
}

export const ECLIPSE_CALENDAR = {
	create,
	events,
	motion,
	positionAt,
	kinematics,
	rateSafety: RATE_SAFETY,
}
