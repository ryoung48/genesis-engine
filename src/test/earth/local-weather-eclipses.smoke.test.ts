import { expect, it } from "vitest"
import { ECLIPSE_CALENDAR } from "@/model/celestial/eclipses/calendar"
import { ECLIPSE_SHADOW } from "@/model/celestial/eclipses/shadow"
import type { PlanetEclipse } from "@/model/celestial/eclipses/types"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { TIDAL_CONTRIBUTORS } from "@/model/climate/ocean/tides/tidal-schedule/contributors"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_SKY } from "@/model/climate/weather/local/sky"
import { WEATHER_ECLIPSES } from "@/model/climate/weather/local/sky/eclipses"
import { WEATHER_ECLIPSE_FORECAST } from "@/model/climate/weather/local/sky/eclipses/forecast"
import { LOCAL_ECLIPSES } from "@/model/climate/weather/local/sky/eclipses/local"
import { SKY_PRECESSION } from "@/model/climate/weather/local/sky/precession"
import type { GenesisParams } from "@/model/pipelines/types"
import { WEATHER_FIXTURE } from "@/test/earth/fixtures/local-weather"

it("interprets longitude of perihelion independently of the ascending node", () => {
	const moon = {
		...SOL_SYSTEM.solLunaDefault,
		idx: 1,
		longitudeOfAscendingNodeDeg: 90,
		longitudeOfPerihelionDeg: 90,
		inclinationDeg: 0,
		eccentricity: 0.5,
		meanAnomalyAtEpochDeg: 0,
	}
	const point = MECHANICS.keplerMoonPositionCartesian({
		moon,
		semiMajorAxisM: 2,
		t: 0,
	})
	expect(point.x).toBeCloseTo(0, 12)
	expect(point.y).toBeCloseTo(1, 12)
})

it("keeps high-eccentricity point positions inside monotone Kepler brackets", () => {
	const e = 0.999,
		mean = 0.01
	let lo = mean - e,
		hi = mean + e
	for (let iteration = 0; iteration < 100; iteration++) {
		const mid = lo + (hi - lo) / 2
		if (mid - e * Math.sin(mid) < mean) lo = mid
		else hi = mid
	}
	const anomaly = (lo + hi) / 2
	const moon = {
		...SOL_SYSTEM.solLunaDefault,
		idx: 1,
		eccentricity: e,
		inclinationDeg: 0,
		longitudeOfAscendingNodeDeg: 0,
		longitudeOfPerihelionDeg: 0,
		meanAnomalyAtEpochDeg: (mean * 180) / Math.PI,
	}
	const point = MECHANICS.keplerMoonPositionCartesian({
		moon,
		semiMajorAxisM: 1,
		t: 0,
	})
	expect(point.x).toBeCloseTo(Math.cos(anomaly) - e, 10)
	expect(point.y).toBeCloseTo(Math.sqrt(1 - e * e) * Math.sin(anomaly), 10)
})

it("rotates the shared star to the clock sun while preserving vector lengths", () => {
	for (const obliquity of [0, 23.44, 90, 177])
		for (const eccentricity of [0, 0.3])
			for (const fraction of [0, 1 / 365, 0.25, 0.5, 1 - 1e-8, 1]) {
				const params = { ...WEATHER_FIXTURE.params, obliquity, eccentricity }
				const instant = WEATHER_CLOCK.resolve({
					params,
					elapsedYears: fraction,
					manual: null,
				})
				const star: [number, number, number] = [
					Math.cos(instant.solarLongitudeRad),
					Math.sin(instant.solarLongitudeRad),
					0,
				]
				const fixed = WEATHER_SKY.bodyFixed({ instant, vector: star })
				for (let n = 0; n < 3; n++)
					expect(Math.abs(fixed[n] - instant.sun[n])).toBeLessThan(1e-9)
				const vector = WEATHER_SKY.bodyFixed({ instant, vector: [1, 2, 3] })
				expect(Math.hypot(...vector)).toBeCloseTo(Math.sqrt(14), 12)
			}
})

it("includes inclination in declination and illumination", () => {
	const base = WEATHER_FIXTURE.instant()
	const instant = {
		...base,
		seconds: 0,
		solarLongitudeRad: 0,
		tiltDeg: 23.44,
		sun: [1, 0, 0] as [number, number, number],
	}
	const moon = {
		...SOL_SYSTEM.solLunaDefault,
		idx: 1,
		inclinationDeg: 5.1,
		eccentricity: 0,
		longitudeOfAscendingNodeDeg: 0,
		longitudeOfPerihelionDeg: 0,
		meanAnomalyAtEpochDeg: 90,
	}
	const positions = WEATHER_SKY.positions({
		instant,
		xyz: [1, 0, 0],
		moons: [moon],
		params: WEATHER_FIXTURE.params,
	})
	expect((positions.moons[0].declinationRad * 180) / Math.PI).toBeCloseTo(
		28.54,
		2,
	)
	expect(
		WEATHER_SKY.moons({
			instant,
			latitudeDeg: 0,
			moons: [moon],
			params: WEATHER_FIXTURE.params,
		})[0].illumination,
	).toBeCloseTo(0.5, 12)
})

it("bounds observed star and frame rates on locked and retrograde worlds", () => {
	let violations = 0
	for (const obliquity of [23.44, 90, 177])
		for (const locked of [false, true]) {
			const params: GenesisParams = {
				...WEATHER_FIXTURE.params,
				obliquity,
				eccentricity: 0.3,
				tideLock: locked ? { type: "solar", target: 0 } : null,
			}
			const rates = WEATHER_CLOCK.rates(params)
			const year = WEATHER_CLOCK.ecliptic({ params, seconds: 0 }).yearSeconds
			const star = (seconds: number) => {
				const state = WEATHER_CLOCK.ecliptic({ params, seconds })
				return [
					Math.cos(state.solarLongitudeRad) * state.starDistanceM,
					Math.sin(state.solarLongitudeRad) * state.starDistanceM,
					0,
				]
			}
			const fixed = (seconds: number) =>
				WEATHER_SKY.bodyFixed({
					instant: WEATHER_CLOCK.resolve({
						params,
						elapsedYears: seconds / year,
						manual: null,
					}),
					vector: [0.3, 0.4, Math.sqrt(0.75)],
				})
			for (let n = 0; n < 400; n++) {
				const s = (n / 400) * year * 1.01,
					dt = 60
				const a = star(s),
					b = star(s + dt)
				const speed =
					Math.hypot(...a.map((v, k) => v - b[k])) / dt / Math.hypot(...a)
				if (speed > rates.starSpeedRatio * 1.0001) violations++
				const p = fixed(s),
					q = fixed(s + dt)
				const angle = Math.acos(
					Math.min(
						1,
						p.reduce((sum, v, k) => sum + v * q[k], 0),
					),
				)
				if (angle / dt > rates.frameRadS) violations++
			}
		}
	expect(violations).toBe(0)
})

function centralFixture() {
	const params: GenesisParams = {
		...WEATHER_FIXTURE.params,
		obliquity: 0,
		eccentricity: 0,
		moons: [],
	}
	const instant = WEATHER_CLOCK.resolve({
		params,
		elapsedYears: 0,
		manual: null,
	})
	const moon = {
		...SOL_SYSTEM.solLunaDefault,
		idx: 1,
		diameterKm: 5000,
		inclinationDeg: 0,
		eccentricity: 0,
		meanAnomalyAtEpochDeg: (instant.solarLongitudeRad * 180) / Math.PI,
		longitudeOfPerihelionDeg: 0,
		longitudeOfAscendingNodeDeg: 0,
	}
	return { params, instant, moon }
}

it("reports simultaneous current eclipses synchronously", () => {
	const { params, instant, moon } = centralFixture()
	params.moons = [moon, { ...moon, idx: 2 }]
	const input = { params, xyz: instant.sun, instant }
	const visible = WEATHER_ECLIPSES.local(input)
	expect(visible.status).toBe("complete")
	expect(visible.current).toHaveLength(2)
	for (const event of visible.current) {
		expect(event.instantaneousCoverage).toBe(1)
		expect(event.durationS).toBeGreaterThan(0)
		expect(event.visibleIntervals.some(([a, b]) => a <= 0 && b > 0)).toBe(true)
		expect(event.clippedStart).toBe(false)
		expect(event.dayOffset).toBe(0)
	}
	expect(visible.next.length).toBeGreaterThan(0)
	expect(visible.next[0].maximumS).toBeGreaterThan(0)
	const antipode = instant.sun.map((value) => -value) as [
		number,
		number,
		number,
	]
	expect(WEATHER_ECLIPSES.local({ ...input, xyz: antipode }).current).toEqual(
		[],
	)
	expect(
		WEATHER_ECLIPSES.local({ ...input, params: { ...params, moons: [] } }),
	).toMatchObject({ status: "complete", current: [], next: [] })
	expect(
		WEATHER_ECLIPSES.calendar({
			params: { ...params, starDiameterSol: 1000 },
			startS: 0,
			endS: instant.yearSeconds,
		}).status,
	).toBe("unavailable")
})

it("finds the earliest visible totality after sunrise even when geometric maximum is below the horizon", () => {
	const { params, moon } = centralFixture()
	params.moons = [{ ...moon, diameterKm: 20000 }]
	const cache = WEATHER_ECLIPSE_FORECAST.getCache(params)
	const xyz: [number, number, number] = [0, 1, 0]
	const event: PlanetEclipse = {
		moonIdx: 1,
		moonLabel: "Luna",
		occluderIdx: null,
		occluderLabel: null,
		kind: "solar-total",
		ingressS: -21600,
		egressS: 21600,
		maximumS: 0,
		penetration: 0,
		clippedStart: false,
		clippedEnd: false,
	}
	const result = LOCAL_ECLIPSES.circumstances({ cache, xyz, event })!
	expect(result.coverage).toBe(1)
	expect(result.maximumS).toBeGreaterThan(-400)
	expect(result.maximumS).toBeLessThan(400)
	const at = (seconds: number) =>
		LOCAL_ECLIPSES.point({ cache, xyz, event, seconds })
	expect(at(result.maximumS).visible).toBe(true)
	expect(
		at(result.maximumS - 2).geometry.coverage < 1 ||
			!at(result.maximumS - 2).visible,
	).toBe(true)
	for (const [a, b] of result.visibleIntervals) {
		expect(at(a + 2).visible).toBe(true)
		expect(at(b - 2).visible).toBe(true)
	}
	expect(at(-7200).visible).toBe(false)
})

it("matches a 60 s brute-force scan for Earth and Luna over one year", () => {
	const params = WEATHER_FIXTURE.params
	const cache = WEATHER_ECLIPSE_FORECAST.getCache(params)
	const year = cache.yearSeconds
	const result = WEATHER_ECLIPSES.calendar({ params, startS: 0, endS: year })
	const state = cache.ephemeris.moons[0]
	let missed = 0
	let spurious = 0
	for (const lunar of [false, true]) {
		const events = result.events.filter(
			(e) => e.kind.startsWith("lunar") === lunar,
		)
		const hits = new Set<number>()
		for (let s = 0; s < year; s += 60) {
			const moon = ECLIPSE_CALENDAR.positionAt({ moon: state, seconds: s })
			const margin = ECLIPSE_SHADOW.evaluate({
				star: cache.ephemeris.starAt(s),
				occluder: lunar ? [0, 0, 0] : moon,
				target: lunar ? moon : [0, 0, 0],
				starRadiusM: cache.ephemeris.starRadiusM,
				occluderRadiusM: lunar
					? cache.ephemeris.planetRadiusM
					: state.moon.diameterKm * 500,
				targetRadiusM: lunar
					? state.moon.diameterKm * 500
					: cache.ephemeris.planetRadiusM,
			}).penumbra
			if (margin <= 0) continue
			const n = events.findIndex(
				(e) => s >= e.ingressS - 1 && s <= e.egressS + 1,
			)
			if (n < 0) missed++
			else hits.add(n)
		}
		for (const [n, event] of events.entries())
			if (event.egressS - event.ingressS > 120 && !hits.has(n)) spurious++
	}
	expect(result.events.length).toBeGreaterThan(0)
	expect(missed).toBe(0)
	expect(spurious).toBe(0)
}, 60000)

it("reports occultations, moon shadows, combined coverage and unavailable moons at one site", () => {
	const { params, instant, moon } = centralFixture()
	params.moons = [
		{ ...moon, name: "Near", diameterKm: 3000, orbitalPeriodDays: 27.3 },
		{ ...moon, idx: 2, name: "Far", diameterKm: 1500, orbitalPeriodDays: 60 },
		{ ...moon, idx: 3, name: "Grazer", diameterKm: 2e6 },
	]
	const result = WEATHER_ECLIPSES.local({ params, xyz: instant.sun, instant })
	const kinds = result.current.map((event) => event.kind)
	expect(result.status).toBe("complete")
	expect(kinds.filter((kind) => kind.startsWith("solar"))).toHaveLength(2)
	expect(kinds).toContain("occultation-total")
	expect(kinds.some((kind) => kind.startsWith("shadow"))).toBe(true)
	const occultation = result.current.find(
		(event) => event.kind === "occultation-total",
	)!
	expect(occultation.moonLabel).toBe("Far")
	expect(occultation.occluderLabel).toBe("Near")
	const near = result.current.find(
		(event) => event.kind.startsWith("solar") && event.moonLabel === "Near",
	)!
	const combined = result.combined.find((group) => group.current)!
	expect(combined.moonLabels.sort()).toEqual(["Far", "Near"])
	expect(
		Math.abs(combined.instantaneousCoverage! - near.instantaneousCoverage!),
	).toBeLessThan(0.02)
	expect(result.unavailable).toEqual(["Grazer"])
})

it("matches a 5 s brute-force scan for a fast eccentric moon beside Luna", () => {
	const params: GenesisParams = {
		...WEATHER_FIXTURE.params,
		moons: [
			...WEATHER_FIXTURE.params.moons,
			{
				...WEATHER_FIXTURE.params.moons[0],
				idx: 2,
				name: "Fast",
				orbitalPeriodDays: 1,
				eccentricity: 0.95,
				inclinationDeg: 60,
			},
		],
	}
	const cache = WEATHER_ECLIPSE_FORECAST.getCache(params)
	const endS = 10 * 86400
	WEATHER_ECLIPSES.calendar({ params, startS: 0, endS })
	const calendar = cache.calendar!
	let missed = 0,
		spurious = 0,
		found = 0
	for (const track of calendar.tracks) {
		const events = track.events.filter(
			(event) => event.ingressS < endS && event.egressS > 0,
		)
		found += events.length
		const hits = new Set<number>()
		for (let s = 0; s < endS; s += 5) {
			if (track.margin(s) <= 0) continue
			const n = events.findIndex(
				(event) => s >= event.ingressS - 1 && s <= event.egressS + 1,
			)
			if (n < 0 && (track.state.openS === null || s < track.state.openS))
				missed++
			else hits.add(n)
		}
		for (const [n, event] of events.entries())
			if (event.egressS - event.ingressS > 10 && !hits.has(n)) spurious++
	}
	expect(found).toBeGreaterThan(0)
	expect(missed).toBe(0)
	expect(spurious).toBe(0)
}, 120000)

it("precesses Luna's node and apsides so eclipse seasons drift through the year", () => {
	const params = WEATHER_FIXTURE.params
	const luna = TIDAL_CONTRIBUTORS.prepare({ params, moons: params.moons })
		.moons[0]
	const rates = SKY_PRECESSION.rates({ params, moon: luna })
	const perYear = (rad: number) => (rad * 365.25 * 180) / Math.PI
	expect(Math.abs(perYear(rates.nodeRadPerDay) / -19.35 - 1)).toBeLessThan(0.02)
	expect(Math.abs(perYear(rates.apsisRadPerDay) / 40.7 - 1)).toBeLessThan(0.05)
	const year = WEATHER_CLOCK.ecliptic({ params, seconds: 0 }).yearSeconds
	const events = WEATHER_ECLIPSES.calendar({
		params,
		startS: 0,
		endS: 20 * year,
	}).events
	const seasons: number[][] = []
	for (const event of events) {
		const last = seasons[seasons.length - 1]
		if (last && event.maximumS - last[last.length - 1] < 60 * 86400)
			last.push(event.maximumS)
		else seasons.push([event.maximumS])
	}
	const centres = seasons.map(
		(season) => season.reduce((sum, s) => sum + s, 0) / season.length,
	)
	const spacings = centres.slice(2).map((c, n) => (c - centres[n]) / 86400)
	const mean = spacings.reduce((sum, s) => sum + s, 0) / spacings.length
	expect(Math.abs(mean - 346.6)).toBeLessThan(5)
}, 60000)
