import { expect, it } from "vitest"
import { ECLIPSES } from "@/model/celestial/eclipses"
import { ECLIPSE_CALENDAR } from "@/model/celestial/eclipses/calendar"
import { ECLIPSE_DISKS } from "@/model/celestial/eclipses/disks"
import { ECLIPSE_SHADOW } from "@/model/celestial/eclipses/shadow"
import type {
	EclipseConfiguration,
	EclipseEphemeris,
} from "@/model/celestial/eclipses/types"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import { MOON_PRECESSION } from "@/model/celestial/moons/mechanics/precession"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SCAN } from "@/model/shared/math/scan"

const aligned: EclipseConfiguration = {
	star: [10000, 0, 0],
	moon: [100, 0, 0],
	starRadiusM: 100,
	moonRadiusM: 2,
	planetRadiusM: 10,
}

it("handles every disk overlap branch including equal concentric disks", () => {
	expect(
		ECLIPSE_DISKS.overlap({ starRadius: 1, moonRadius: 1, separation: 0 }),
	).toBe(1)
	expect(
		ECLIPSE_DISKS.overlap({ starRadius: 1, moonRadius: 0.5, separation: 0 }),
	).toBe(0.25)
	expect(
		ECLIPSE_DISKS.overlap({ starRadius: 1, moonRadius: 1, separation: 2 }),
	).toBe(0)
	expect(
		ECLIPSE_DISKS.overlap({ starRadius: 1, moonRadius: 1, separation: 1 }),
	).toBeCloseTo(((2 * Math.PI) / 3 - Math.sqrt(3) / 2) / Math.PI, 8)
})

it("uses finite observer vectors and foreground ordering", () => {
	expect(ECLIPSES.solar({ ...aligned, observer: [10, 0, 0] }).kind).toBe(
		"solar-total",
	)
	expect(
		ECLIPSES.solar({ ...aligned, moonRadiusM: 0.5, observer: [10, 0, 0] }).kind,
	).toBe("solar-annular")
	expect(
		ECLIPSES.solar({ ...aligned, moon: [20000, 0, 0], observer: [10, 0, 0] })
			.kind,
	).toBeNull()
	expect(
		ECLIPSES.solar({ ...aligned, moon: [5, 0, 0], observer: [10, 0, 0] })
			.status,
	).toBe("unavailable")
	expect(ECLIPSES.solar({ ...aligned, observer: [0, 10, 0] }).coverage).toBe(0)
})

it("intersects the whole planet with finite cones and distinguishes lunar phases", () => {
	expect(ECLIPSES.global(aligned).kind).toBe("solar-total")
	expect(ECLIPSES.global({ ...aligned, moonRadiusM: 0.1 }).kind).toBe(
		"solar-annular",
	)
	expect(
		ECLIPSES.global({ ...aligned, moon: [100, 11, 0], moonRadiusM: 0.1 }).kind,
	).toBe("solar-partial")
	expect(ECLIPSES.lunar({ ...aligned, moon: [-100, 0, 0] }).kind).toBe(
		"lunar-total",
	)
	expect(
		ECLIPSES.lunar({ ...aligned, moon: [-1000, 0, 0], planetRadiusM: 1 }).kind,
	).toBe("lunar-penumbral")
	expect(ECLIPSES.lunar({ ...aligned, moon: [-100, 30, 0] }).kind).toBeNull()
})

it("matches an independently constructed tangent ray", () => {
	const sine = 102 / 10000,
		cosine = Math.sqrt(1 - sine * sine)
	const radius = 2 / cosine + (100 * sine) / cosine
	for (const displacement of [-0.001, 0, 0.001]) {
		const result = ECLIPSE_SHADOW.evaluate({
			star: [-10000, 0, 0],
			occluder: [0, 0, 0],
			target: [100, radius + 10 / cosine + displacement, 0],
			starRadiusM: 100,
			occluderRadiusM: 2,
			targetRadiusM: 10,
		})
		expect(result.penumbra).toBeCloseTo(-displacement * cosine, 10)
	}
})

it("scans every positive run with rate-bounded steps", () => {
	const sine = SCAN.positive({
		f: Math.sin,
		startS: 0.5,
		endS: 20,
		rate: () => ({ rate: 1, untilS: Infinity }),
	})
	expect(sine).toHaveLength(4)
	expect(sine[0][0]).toBe(0.5)
	const roots = [1, 2, 3, 4, 5, 6].map((n) => n * Math.PI)
	for (const [n, value] of sine.flat().slice(1, 7).entries())
		expect(Math.abs(value - roots[n])).toBeLessThanOrEqual(1)
	const grazing = (s: number) => 0.5 - ((s - 5000) / 2) ** 2
	const found = SCAN.positive({
		f: grazing,
		startS: 0,
		endS: 10000,
		rate: () => ({ rate: 5000, untilS: Infinity }),
	})
	expect(found).toHaveLength(1)
	expect(found[0][0]).toBeGreaterThan(4997)
	expect(found[0][1]).toBeLessThan(5003)
	const tangent = (s: number) => -((s - 50.25) ** 2)
	expect(
		SCAN.positive({
			f: tangent,
			startS: 0,
			endS: 100,
			rate: () => ({ rate: 101, untilS: Infinity }),
		}),
	).toEqual([])
	expect(
		SCAN.positive({
			f: () => 1,
			startS: 0,
			endS: 1e6,
			rate: () => ({ rate: 1e-6, untilS: Infinity }),
		}),
	).toEqual([[0, 1e6]])
	const vee = (s: number) => -Math.abs(s - 1e6)
	const state = SCAN.create({ f: vee, startS: 0 })
	SCAN.advance({
		f: vee,
		state,
		endS: 2e6,
		rate: () => ({ rate: 1, untilS: Infinity }),
	})
	expect(state.evaluations).toBeLessThan(120)
})

it("finds golden-section maxima and plateau edges", () => {
	const parabola = SCAN.maximum({
		f: (s) => -((s - 1234.5) ** 2),
		startS: 0,
		endS: 10000,
	})
	expect(Math.abs(parabola.seconds - 1234.5)).toBeLessThanOrEqual(1)
	expect(parabola.evaluations).toBeLessThan(40)
	expect(SCAN.maximum({ f: () => 3, startS: 10, endS: 20 }).seconds).toBe(10)
	const plateau = (s: number) => Math.min(1, s / 100)
	const peak = SCAN.maximum({ f: plateau, startS: 0, endS: 1000 })
	const edge = SCAN.earliest({
		f: plateau,
		startS: 0,
		endS: peak.seconds,
		threshold: peak.value - 1e-9,
	})
	expect(Math.abs(edge - 100)).toBeLessThanOrEqual(1)
})

const period = 10 * 86400
const still = { nodeRadPerDay: 0, apsisRadPerDay: 0 }
const lunaLike = {
	...SOL_SYSTEM.solLunaDefault,
	idx: 1,
	eccentricity: 0,
	inclinationDeg: 0,
	longitudeOfAscendingNodeDeg: 0,
	longitudeOfPerihelionDeg: 0,
	meanAnomalyAtEpochDeg: 90,
	orbitalPeriodDays: 10,
	diameterKm: 0.004,
}
const fixedStar: EclipseEphemeris = {
	moons: [{ moon: lunaLike, semiMajorAxisM: 100, rates: still }],
	starRadiusM: 100,
	planetRadiusM: 10,
	starAt: () => [10000, 0, 0],
	starSpeedRatio: 0,
}

function bruteForce(input: {
	ephemeris: EclipseEphemeris
	lunar: boolean
	startS: number
	endS: number
	stepS: number
}): [number, number][] {
	const state = input.ephemeris.moons[0]
	const runs: [number, number][] = []
	let open: number | null = null
	for (let s = input.startS; s <= input.endS; s += input.stepS) {
		const v = MECHANICS.keplerMoonPositionCartesian({
			moon: state.moon,
			semiMajorAxisM: state.semiMajorAxisM,
			t: s / 86400,
		})
		const moon: [number, number, number] = [v.x, v.y, v.z]
		const margin = ECLIPSE_SHADOW.evaluate({
			star: input.ephemeris.starAt(s),
			occluder: input.lunar ? [0, 0, 0] : moon,
			target: input.lunar ? moon : [0, 0, 0],
			starRadiusM: input.ephemeris.starRadiusM,
			occluderRadiusM: input.lunar
				? input.ephemeris.planetRadiusM
				: state.moon.diameterKm * 500,
			targetRadiusM: input.lunar
				? state.moon.diameterKm * 500
				: input.ephemeris.planetRadiusM,
		}).penumbra
		if (margin > 0 && open === null) open = s
		if (margin <= 0 && open !== null) {
			runs.push([open, s])
			open = null
		}
	}
	return runs
}

it("matches 1 s brute-force contacts on a coplanar circular orbit", () => {
	const result = ECLIPSE_CALENDAR.events({
		calendar: ECLIPSE_CALENDAR.create({ ephemeris: fixedStar, startS: 0 }),
		startS: 0,
		endS: period,
		followS: 2 * period,
	})
	const solar = result.events.filter((e) => e.kind.startsWith("solar"))
	const lunar = result.events.filter((e) => e.kind.startsWith("lunar"))
	expect(solar).toHaveLength(1)
	expect(lunar).toHaveLength(1)
	for (const [events, isLunar, centre] of [
		[solar, false, (3 * period) / 4],
		[lunar, true, period / 4],
	] as const) {
		const [brute] = bruteForce({
			ephemeris: fixedStar,
			lunar: isLunar,
			startS: centre - 60000,
			endS: centre + 60000,
			stepS: 1,
		})
		expect(Math.abs(events[0].ingressS - brute[0])).toBeLessThanOrEqual(2)
		expect(Math.abs(events[0].egressS - brute[1])).toBeLessThanOrEqual(2)
		expect(Math.abs(events[0].maximumS - centre)).toBeLessThanOrEqual(2)
	}
	expect(solar[0].kind).toBe("solar-total")
	expect(result.evaluations).toBeLessThan(2000)
})

it("separates node conjunctions from maximum-latitude misses", () => {
	const run = (node: number) =>
		ECLIPSE_CALENDAR.events({
			calendar: ECLIPSE_CALENDAR.create({
				ephemeris: {
					...fixedStar,
					moons: [
						{
							moon: {
								...lunaLike,
								inclinationDeg: 60,
								longitudeOfAscendingNodeDeg: node,
								longitudeOfPerihelionDeg: node,
								meanAnomalyAtEpochDeg: 90 - node,
							},
							semiMajorAxisM: 100,
							rates: still,
						},
					],
				},
				startS: 0,
			}),
			startS: 0,
			endS: period,
			followS: 2 * period,
		}).events
	expect(run(0)).toHaveLength(2)
	expect(run(90)).toEqual([])
})

it("matches a brute-force scan for an eccentric retrograde moon", () => {
	const eccentric: EclipseEphemeris = {
		...fixedStar,
		moons: [
			{
				moon: {
					...lunaLike,
					eccentricity: 0.6,
					inclinationDeg: 170,
					meanAnomalyAtEpochDeg: 10,
				},
				semiMajorAxisM: 100,
				rates: still,
			},
		],
	}
	const result = ECLIPSE_CALENDAR.events({
		calendar: ECLIPSE_CALENDAR.create({ ephemeris: eccentric, startS: 0 }),
		startS: 0,
		endS: 3 * period,
		followS: 4 * period,
	})
	for (const lunar of [false, true]) {
		const brute = bruteForce({
			ephemeris: eccentric,
			lunar,
			startS: 0,
			endS: 4 * period,
			stepS: 30,
		}).filter(([a]) => a < 3 * period)
		const found = result.events.filter(
			(e) => e.kind.startsWith("lunar") === lunar,
		)
		expect(brute.length).toBeGreaterThan(0)
		expect(found.length).toBe(brute.length)
		for (const [n, [a, b]] of brute.entries()) {
			expect(Math.abs(found[n].ingressS - a)).toBeLessThanOrEqual(31)
			expect(Math.abs(found[n].egressS - b)).toBeLessThanOrEqual(31)
		}
	}
})

it("handles persistent alignment, ongoing edges and invalid inputs", () => {
	const persistent = ECLIPSE_CALENDAR.events({
		calendar: ECLIPSE_CALENDAR.create({
			ephemeris: {
				...fixedStar,
				moons: [
					{
						moon: {
							...lunaLike,
							orbitalPeriodDays: 1e12,
							meanAnomalyAtEpochDeg: 0,
						},
						semiMajorAxisM: 100,
						rates: still,
					},
				],
			},
			startS: 0,
		}),
		startS: 0,
		endS: 1e6,
		followS: 2e6,
	})
	expect(persistent.events).toHaveLength(1)
	expect(persistent.events[0]).toMatchObject({
		ingressS: 0,
		clippedStart: true,
		clippedEnd: true,
	})
	const ongoing = ECLIPSE_CALENDAR.events({
		calendar: ECLIPSE_CALENDAR.create({ ephemeris: fixedStar, startS: 0 }),
		startS: (3 * period) / 4,
		endS: (3 * period) / 4 + 10,
		followS: period,
	}).events
	expect(ongoing).toHaveLength(1)
	expect(ongoing[0].ingressS).toBeLessThan((3 * period) / 4)
	expect(ongoing[0].clippedStart).toBe(false)
	expect(
		ECLIPSE_CALENDAR.events({
			calendar: ECLIPSE_CALENDAR.create({
				ephemeris: { ...fixedStar, planetRadiusM: 101 },
				startS: 0,
			}),
			startS: 0,
			endS: 100,
			followS: 200,
		}),
	).toMatchObject({ status: "complete", events: [], unavailableMoons: [1] })
	expect(
		ECLIPSE_CALENDAR.events({
			calendar: ECLIPSE_CALENDAR.create({
				ephemeris: { ...fixedStar, starAt: () => [50, 0, 0] },
				startS: 0,
			}),
			startS: 0,
			endS: 100,
			followS: 200,
		}).status,
	).toBe("unavailable")
	expect(
		ECLIPSE_CALENDAR.events({
			calendar: ECLIPSE_CALENDAR.create({
				ephemeris: { ...fixedStar, moons: [] },
				startS: 0,
			}),
			startS: 0,
			endS: 100,
			followS: 200,
		}),
	).toMatchObject({ status: "complete", events: [] })
})

function crossCheck(input: {
	calendar: ReturnType<typeof ECLIPSE_CALENDAR.create>
	endS: number
	stepS: number
}) {
	const result = ECLIPSE_CALENDAR.events({
		calendar: input.calendar,
		startS: input.calendar.startS,
		endS: input.endS,
		followS: input.endS + 10 * input.stepS,
	})
	let missed = 0,
		spurious = 0
	const counts: Record<string, number> = {}
	for (const track of input.calendar.tracks) {
		const events = result.events.filter(
			(event) =>
				ECLIPSES.category(event.kind) === track.category &&
				track.events.includes(event),
		)
		counts[track.category] = (counts[track.category] ?? 0) + events.length
		const hits = new Set<number>()
		for (let s = input.calendar.startS; s < input.endS; s += input.stepS) {
			if (track.margin(s) <= 0) continue
			const n = events.findIndex(
				(event) => s >= event.ingressS - 1 && s <= event.egressS + 1,
			)
			if (n < 0 && (track.state.openS === null || s < track.state.openS))
				missed++
			else hits.add(n)
		}
		for (const [n, event] of events.entries())
			if (event.egressS - event.ingressS > 2 * input.stepS && !hits.has(n))
				spurious++
	}
	return { missed, spurious, counts, result }
}

const outer = {
	...lunaLike,
	idx: 2,
	name: "Outer",
	orbitalPeriodDays: 27,
	diameterKm: 0.008,
	meanAnomalyAtEpochDeg: 0,
	inclinationDeg: 3,
}
const pairEphemeris: EclipseEphemeris = {
	...fixedStar,
	moons: [
		{
			moon: { ...lunaLike, inclinationDeg: 2 },
			semiMajorAxisM: 100,
			rates: still,
		},
		{ moon: outer, semiMajorAxisM: 300, rates: still },
	],
}

it("finds moon shadows and occultations matching a brute-force scan", () => {
	const { missed, spurious, counts } = crossCheck({
		calendar: ECLIPSE_CALENDAR.create({ ephemeris: pairEphemeris, startS: 0 }),
		endS: 3 * 27 * 86400,
		stepS: 60,
	})
	expect(missed).toBe(0)
	expect(spurious).toBe(0)
	expect(counts.shadow).toBeGreaterThan(0)
	expect(counts.occultation).toBeGreaterThan(0)
}, 60000)

it("keeps valid moons when another moon or pair is unavailable", () => {
	const result = ECLIPSE_CALENDAR.events({
		calendar: ECLIPSE_CALENDAR.create({
			ephemeris: {
				...fixedStar,
				moons: [
					fixedStar.moons[0],
					{ moon: { ...lunaLike, idx: 2 }, semiMajorAxisM: 5, rates: still },
					{ moon: { ...lunaLike, idx: 3 }, semiMajorAxisM: 101, rates: still },
				],
			},
			startS: 0,
		}),
		startS: 0,
		endS: period,
		followS: 2 * period,
	})
	expect(result.status).toBe("complete")
	expect(result.unavailableMoons).toEqual([2])
	expect(result.unavailablePairs).toEqual([[1, 3]])
	expect(result.events.some((event) => event.moonIdx === 1)).toBe(true)
	expect(
		result.events.every((event) => ECLIPSES.category(event.kind) !== "shadow"),
	).toBe(true)
})

it("integrates the union of several moon disks over the star", () => {
	const single = ECLIPSE_DISKS.union({
		starRadius: 1,
		disks: [{ x: 0.7, y: 0, radius: 0.6 }],
	})
	expect(single.coverage).toBe(
		ECLIPSE_DISKS.overlap({ starRadius: 1, moonRadius: 0.6, separation: 0.7 }),
	)
	const separate = ECLIPSE_DISKS.union({
		starRadius: 1,
		disks: [
			{ x: 0.6, y: 0, radius: 0.3 },
			{ x: -0.6, y: 0, radius: 0.3 },
		],
	})
	expect(Math.abs(separate.coverage - 0.18)).toBeLessThan(0.01)
	expect(separate.total).toBe(false)
	const halves = [
		{ x: 0.6, y: 0, radius: 1.2 },
		{ x: -0.6, y: 0, radius: 1.2 },
	]
	expect(
		ECLIPSE_DISKS.overlap({ starRadius: 1, moonRadius: 1.2, separation: 0.6 }),
	).toBeLessThan(1)
	expect(ECLIPSE_DISKS.union({ starRadius: 1, disks: halves })).toEqual({
		coverage: 1,
		total: true,
	})
})

it("never steps past the end of a piecewise rate bound", () => {
	const state = SCAN.create({ f: () => -1e6, startS: 0 })
	SCAN.advance({
		f: () => -1e6,
		state,
		endS: 10000,
		rate: (s) => ({ rate: 1e-9, untilS: (Math.floor(s / 100) + 1) * 100 }),
	})
	expect(state.evaluations).toBe(101)
})

it("keeps the sidereal period while nodes and apsides precess", () => {
	const rates = { nodeRadPerDay: -0.001, apsisRadPerDay: 0.002 }
	const circle = { ...lunaLike, meanAnomalyAtEpochDeg: 30 }
	for (const t of [0, 3.3, 100, 1000]) {
		const plain = MECHANICS.keplerMoonPositionCartesian({
			moon: circle,
			semiMajorAxisM: 1,
			t,
		})
		const moved = MECHANICS.keplerMoonPositionCartesian({
			moon: MOON_PRECESSION.at({ moon: circle, rates, t }),
			semiMajorAxisM: 1,
			t,
		})
		expect(moved.x).toBeCloseTo(plain.x, 10)
		expect(moved.y).toBeCloseTo(plain.y, 10)
	}
	const earthJ2 = MOON_PRECESSION.oblateness({
		planetRadiusM: 6.371e6,
		planetMassKg: 5.972e24,
		spinRateRadS: 7.2921e-5,
	})
	expect(Math.abs(earthJ2 / 1.0826e-3 - 1)).toBeLessThan(0.05)
})
