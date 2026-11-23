import { describe, expect, it } from "vitest"
import { FARMING_HEARTHS } from "@/model/society/farming/hearths"
import type { FarmingHearth } from "@/model/society/farming/hearths/types"
import { LIVESTOCK_VOYAGES } from "@/model/society/farming/livestock-voyages"
import { FARMING_LIVING } from "@/model/society/farming/living"
import { FARMING_ODDS } from "@/model/society/farming/odds"
import { FARMING_SPREAD } from "@/model/society/farming/spread"
import type { SpreadParams } from "@/model/society/farming/spread/types"
import { FARMING_WAY_OF_LIFE } from "@/model/society/farming/way-of-life"
import { MIGRATION } from "@/model/society/migration"
import { FARMING_FIXTURE } from "@/test/history-run/fixtures/farming"
import type {
	HerdCaseParams,
	SpreadCaseParams,
	WayCaseParams,
} from "@/test/history-run/fixtures/farming/types"

const STEP_KM = (0.5 * Math.PI * 6371) / 180
const FIRST_YEAR = -9600
const SPEED = 0.35
const ADOPTION_LAG = Math.round(650 * Math.LN2)

function hearth(province: number, startYear: number): FarmingHearth {
	return {
		province,
		startYear,
		odds: 1,
		timing: 1,
		dependence: 1,
		fired: false,
	}
}

function spread({
	layout,
	stepDegrees,
	hearths,
	measures,
	postMode,
	continuousArrival,
	configure,
}: SpreadCaseParams) {
	const { world, migration } = FARMING_FIXTURE.world({ layout, stepDegrees })
	const count = world.provinces.count
	if (continuousArrival)
		migration.result.continuousArrival = Float64Array.from(continuousArrival)
	const params: SpreadParams = {
		provinces: world.provinces,
		migration,
		measures: FARMING_FIXTURE.measures({ count, overrides: measures ?? {} }),
		r_xyz: world.mesh.r_xyz,
		planetRadiusKm: 6371,
		hearths,
		postMode: Uint8Array.from(postMode ?? new Array<number>(count).fill(0)),
		traversable: new Uint8Array(count).fill(1),
		horizonYear: 2025,
		voyageYear: null,
		colonial: null,
	}
	configure?.(params)
	return { params, migration, result: FARMING_SPREAD.search(params) }
}

describe("farming spread", () => {
	it("walks land at the base speed and rounds arrivals up to whole years", () => {
		const { result } = spread({
			layout: "LLLL",
			stepDegrees: 0.5,
			hearths: [hearth(0, FIRST_YEAR)],
		})
		for (let p = 0; p < 4; p++) {
			const exact = FIRST_YEAR + (p * STEP_KM) / SPEED
			expect(result.farmingYear[p]).toBeGreaterThanOrEqual(Math.ceil(exact) - 1)
			expect(result.farmingYear[p]).toBeLessThanOrEqual(Math.ceil(exact) + 1)
			expect(Number.isInteger(result.farmingYear[p])).toBe(true)
		}
		expect([...result.farmingFrom]).toEqual([-1, 0, 1, 2])
		expect([...result.hearthOf]).toEqual([0, 0, 0, 0])
	})

	it("makes farmers wait for foragers at a relay and delays the outgoing edge", () => {
		const { result } = spread({
			layout: "LLLL",
			stepDegrees: 0.5,
			hearths: [hearth(0, FIRST_YEAR)],
			continuousArrival: [-80000, -80000, -3000, -80000],
		})
		expect(result.farmingYear[2]).toBe(-3000)
		expect(
			Math.abs(result.farmingYear[3] - (-3000 + STEP_KM / SPEED)),
		).toBeLessThanOrEqual(2)
	})

	it("leaves land the horizon cuts off and unreachable land at the sentinel", () => {
		const { result } = spread({
			layout: "LLLL",
			stepDegrees: 0.5,
			hearths: [hearth(0, FIRST_YEAR)],
			continuousArrival: [-80000, -80000, 2030, -80000],
		})
		expect(result.farmingYear[1]).not.toBe(MIGRATION.sentinel)
		expect(result.farmingYear[2]).toBe(MIGRATION.sentinel)
		expect(result.farmingYear[3]).toBe(MIGRATION.sentinel)
		expect(result.farmingFrom[3]).toBe(-1)
		expect(result.hearthOf[3]).toBe(-1)
	})

	it("crosses open water exactly as the migration sea transit does", () => {
		const { result, migration, params } = spread({
			layout: "LL##LL",
			stepDegrees: 0.9,
			hearths: [hearth(0, FIRST_YEAR)],
		})
		const link = migration.seaLinks[1][0]
		const stepKm = (0.9 * Math.PI * 6371) / 180
		const expected = MIGRATION.transit({
			sourceArrival: FIRST_YEAR + stepKm / SPEED,
			sourceOriginKm: 0,
			distanceKm: link.distanceKm,
			meanSuitability: 1,
			destinationLandmassKm2:
				migration.result.areaKm2[2] + migration.result.areaKm2[3],
			corridorBonus: 1,
			kind: "sea",
		})
		expect(params.provinces.landmassId[2]).not.toBe(
			params.provinces.landmassId[1],
		)
		expect(result.farmingYear[2]).toBe(Math.ceil(expected))
		expect(result.farmingFrom[2]).toBe(1)
	})

	it("does not relay farming over a cross-water adjacency that has no sea link", () => {
		const { result } = spread({
			layout: "LLLL",
			stepDegrees: 0.5,
			hearths: [hearth(0, FIRST_YEAR)],
			configure: (params) => {
				params.provinces.landmassId = Int32Array.of(0, 0, 1, 1)
				params.migration.landGraph.adjOffset = Int32Array.of(0, 1, 2, 3, 4)
				params.migration.landGraph.adjList = Int32Array.of(1, 0, 3, 2)
			},
		})
		expect(result.farmingYear[1]).not.toBe(MIGRATION.sentinel)
		expect(result.farmingYear[2]).toBe(MIGRATION.sentinel)
		expect(result.farmingYear[3]).toBe(MIGRATION.sentinel)
	})

	it("keeps the first label at a junction and skips a hearth already reached", () => {
		const late = spread({
			layout: "LLLLL",
			stepDegrees: 0.5,
			hearths: [hearth(0, FIRST_YEAR), hearth(4, FIRST_YEAR + 100)],
		})
		expect([...late.result.hearthOf]).toEqual([0, 0, 0, 4, 4])
		expect(late.result.fired).toEqual([true, true])
		const reached = spread({
			layout: "LLLLL",
			stepDegrees: 0.5,
			hearths: [hearth(0, FIRST_YEAR), hearth(4, FIRST_YEAR + 1000)],
		})
		expect([...reached.result.hearthOf]).toEqual([0, 0, 0, 0, 0])
		expect(reached.result.fired).toEqual([true, false])
	})

	it("gives the same labels whatever order equal-key hearths are listed in", () => {
		const run = (hearths: FarmingHearth[]) =>
			spread({ layout: "LLLLL", stepDegrees: 0.5, hearths }).result
		const forward = run([hearth(0, FIRST_YEAR), hearth(4, FIRST_YEAR)])
		const backward = run([hearth(4, FIRST_YEAR), hearth(0, FIRST_YEAR)])
		expect([...backward.hearthOf]).toEqual([...forward.hearthOf])
		expect([...backward.farmingYear]).toEqual([...forward.farmingYear])
	})

	it("sends herd land at the pastoral speed with no climate likeness or river channel", () => {
		const { result } = spread({
			layout: "LL",
			stepDegrees: 0.5,
			hearths: [hearth(0, FIRST_YEAR)],
			postMode: [0, 2],
			measures: { pasture: 0.8, T: 15 },
			configure: (params) => {
				params.provinces.riverAccess = Uint8Array.of(0, 1)
				params.measures.T[1] = 30
				params.measures.P[1] = 100
			},
		})
		expect(
			Math.abs(result.farmingYear[1] - (FIRST_YEAR + STEP_KM / 3)),
		).toBeLessThanOrEqual(2)
		expect(result.landEdgeSpeed.p50).toBeCloseTo(3)
		expect(result.landEdgeSpeed.samples).toBe(1)
	})

	it("slows farmland by climate unlikeness and speeds it along rivers", () => {
		const { result } = spread({
			layout: "LL",
			stepDegrees: 0.5,
			hearths: [hearth(0, FIRST_YEAR)],
			configure: (params) => {
				params.provinces.riverAccess = Uint8Array.of(0, 1)
				params.measures.T[1] = 21
			},
		})
		const like = 0.05 + 0.95 * Math.exp(-1)
		expect(result.landEdgeSpeed.p50).toBeCloseTo(SPEED * like * 4)
	})

	it("measures climate likeness against the province the front leaves, not the hearth", () => {
		const { result } = spread({
			layout: "LLL",
			stepDegrees: 0.5,
			hearths: [hearth(0, FIRST_YEAR)],
			configure: (params) => {
				params.measures.T.set([10, 16, 22])
			},
		})
		const like = 0.05 + 0.95 * Math.exp(-1)
		expect(result.landEdgeSpeed.samples).toBe(2)
		expect(result.landEdgeSpeed.p10).toBeCloseTo(SPEED * like)
		expect(result.landEdgeSpeed.p90).toBeCloseTo(SPEED * like)
	})
})

const HERD = 2
const KNOT_YEARS = [-8000, 1000, 1500]

function herdSpread({
	layout,
	stepDegrees,
	hearths,
	knotYears,
	blocked,
	links,
}: HerdCaseParams) {
	return spread({
		layout,
		stepDegrees,
		hearths,
		postMode: new Array<number>(
			[...layout].filter((c) => c === "L").length,
		).fill(HERD),
		measures: { pasture: 0.8, T: 15 },
		configure: (params) => {
			if (links) params.migration.seaLinks = links
			params.voyageYear = ({ distanceKm, source, sourceArrival }) =>
				blocked?.includes(source)
					? Number.POSITIVE_INFINITY
					: Math.max(
							sourceArrival,
							LIVESTOCK_VOYAGES.crossingYear({ distanceKm, knotYears }),
						)
		},
	})
}

describe("livestock voyages", () => {
	it("interpolates the crossing year in log distance and holds beyond the knots", () => {
		const at = (distanceKm: number) =>
			LIVESTOCK_VOYAGES.crossingYear({ distanceKm, knotYears: KNOT_YEARS })
		expect(at(1)).toBe(KNOT_YEARS[0])
		expect(at(80)).toBe(KNOT_YEARS[0])
		expect(at(400)).toBeCloseTo(KNOT_YEARS[1], 6)
		expect(at(1000)).toBeCloseTo(KNOT_YEARS[2], 6)
		expect(at(20000)).toBe(KNOT_YEARS[2])
		expect(at(179)).toBeCloseTo((KNOT_YEARS[0] + KNOT_YEARS[1]) / 2, -1)
		expect(at(200)).toBeLessThan(at(300))
	})

	it("follows the coastal curve up to 900 km and opens every longer gap at one year", () => {
		const at = (distanceKm: number) =>
			LIVESTOCK_VOYAGES.crossingYear({ distanceKm, knotYears: KNOT_YEARS })
		expect(at(900)).toBeGreaterThan(KNOT_YEARS[1])
		expect(at(900)).toBeLessThan(KNOT_YEARS[2])
		expect(at(900)).toBeGreaterThan(at(600))
		expect(at(1200)).toBe(KNOT_YEARS[2])
		expect(at(4000)).toBe(at(1200))
	})

	it("lands herds on the far shore no earlier than the gap allows, then walks on", () => {
		const { result, migration } = herdSpread({
			layout: "LL##LL",
			stepDegrees: 0.9,
			hearths: [hearth(0, FIRST_YEAR)],
			knotYears: KNOT_YEARS,
		})
		const link = migration.seaLinks[1][0]
		const contact = LIVESTOCK_VOYAGES.crossingYear({
			distanceKm: link.distanceKm,
			knotYears: KNOT_YEARS,
		})
		expect(contact).toBeGreaterThanOrEqual(KNOT_YEARS[0])
		expect(result.farmingYear[2]).toBe(Math.ceil(contact))
		expect(result.farmingFrom[2]).toBe(1)
		expect(result.farmingYear[3]).toBeGreaterThan(result.farmingYear[2])
		expect(result.hearthOf[3]).toBe(0)
	})

	it("holds herds back when the gap is wider", () => {
		const landing = (stepDegrees: number) => {
			const { result, migration } = herdSpread({
				layout: "LL##LL",
				stepDegrees,
				hearths: [hearth(0, FIRST_YEAR)],
				knotYears: KNOT_YEARS,
			})
			return {
				year: result.farmingYear[2],
				km: migration.seaLinks[1][0].distanceKm,
			}
		}
		const narrow = landing(0.9)
		const wide = landing(1.8)
		expect(wide.km).toBeGreaterThan(narrow.km)
		expect(wide.year).toBeGreaterThan(narrow.year)
	})

	it("passes herds on from a landmass they have reached", () => {
		const { result } = herdSpread({
			layout: "LL#LL#LL",
			stepDegrees: 0.9,
			hearths: [hearth(0, FIRST_YEAR)],
			knotYears: KNOT_YEARS,
		})
		expect(result.farmingYear[2]).toBeGreaterThan(result.farmingYear[1])
		expect(result.farmingYear[4]).toBeGreaterThanOrEqual(result.farmingYear[3])
		expect(result.farmingYear[4]).toBeGreaterThan(result.farmingYear[2])
		expect(result.farmingFrom[4]).toBe(3)
		expect(result.hearthOf[5]).toBe(0)
	})

	it("relays herds across a chain only through islands that adopt herding", () => {
		const run = (blocked: number[]) =>
			herdSpread({
				layout: "LL#LL#LL",
				stepDegrees: 0.9,
				hearths: [hearth(0, FIRST_YEAR)],
				knotYears: KNOT_YEARS,
				blocked,
			}).result
		const passes = run([])
		expect(passes.farmingYear[4]).not.toBe(MIGRATION.sentinel)
		const stops = run([2, 3])
		expect(stops.farmingYear[2]).toBe(passes.farmingYear[2])
		expect(stops.farmingYear[3]).toBe(passes.farmingYear[3])
		expect(stops.farmingYear[4]).toBe(MIGRATION.sentinel)
		expect(stops.farmingYear[5]).toBe(MIGRATION.sentinel)
	})

	it("joins herds to farmed land a short delay after landing, without the domestication lag", () => {
		const mixed = (arrivalYear: number, farmingAdoptionYear: number) =>
			FARMING_LIVING.mixedHerdAdoption({
				arrivalYear,
				farmingAdoptionYear,
				horizonYear: 2025,
			})
		expect(mixed(1494, -2000)).toBe(1524)
		expect(mixed(1494, 1500)).toBe(1530)
		expect(mixed(MIGRATION.sentinel, 0)).toBe(MIGRATION.sentinel)
		expect(mixed(1494, MIGRATION.sentinel)).toBe(MIGRATION.sentinel)
		expect(mixed(2000, 0)).toBe(MIGRATION.sentinel)
		const pastoral = FARMING_LIVING.adoptionYear({
			farmingYear: 1494,
			forage: 1,
			capacity: 20,
			hearthTiming: 1,
			horizonYear: 5000,
		})
		expect(pastoral - 1494).toBe(ADOPTION_LAG)
		expect(mixed(1494, -2000)).toBeLessThan(pastoral)
	})

	it("relays on from a farmed island once the herds have been adopted there", () => {
		const delay = 30
		const { result } = spread({
			layout: "LL#LL#LL",
			stepDegrees: 0.9,
			hearths: [hearth(0, FIRST_YEAR)],
			postMode: new Array<number>(6).fill(HERD),
			measures: { pasture: 0.8, T: 15 },
			configure: (params) => {
				params.voyageYear = ({ distanceKm, sourceArrival }) =>
					Math.max(
						sourceArrival + delay,
						LIVESTOCK_VOYAGES.crossingYear({
							distanceKm,
							knotYears: KNOT_YEARS,
						}),
					)
			},
		})
		expect(result.farmingYear[4]).not.toBe(MIGRATION.sentinel)
		expect(result.farmingYear[4]).toBeGreaterThanOrEqual(
			result.farmingYear[2] + delay,
		)
	})

	it("opens a direct route between landmasses with no adjacent link, only within range", () => {
		const routed = (stepDegrees: number) => {
			const { world, migration } = FARMING_FIXTURE.world({
				layout: "LL##LL",
				stepDegrees,
			})
			const provinces = world.provinces
			provinces.waterAccess.fill(2)
			const links = LIVESTOCK_VOYAGES.routes({
				provinces,
				r_xyz: world.mesh.r_xyz,
				planetRadiusKm: 6371,
				traversable: new Uint8Array(provinces.count).fill(1),
			})
			return { provinces, migration, links }
		}
		const near = routed(0.9)
		expect(near.links[1].map((link) => link.b)).toEqual([2])
		expect(near.links[0].map((link) => link.b)).toEqual([2])
		expect(near.links[1][0].distanceKm).toBeGreaterThan(0)
		const far = routed(20)
		expect(far.links.every((list) => list.length === 0)).toBe(true)
		const { result } = herdSpread({
			layout: "LL##LL",
			stepDegrees: 0.9,
			hearths: [hearth(0, FIRST_YEAR)],
			knotYears: KNOT_YEARS,
			links: near.links.map((list) => [...list]),
		})
		const contact = LIVESTOCK_VOYAGES.crossingYear({
			distanceKm: near.links[1][0].distanceKm,
			knotYears: KNOT_YEARS,
		})
		expect(result.farmingYear[2]).toBeGreaterThanOrEqual(Math.ceil(contact))
		expect(result.farmingFrom[2]).toBe(1)
	})

	it("keeps an earlier herd date on a landmass the voyage reaches later", () => {
		const { result } = herdSpread({
			layout: "LL##LL",
			stepDegrees: 0.9,
			hearths: [hearth(0, FIRST_YEAR), hearth(2, FIRST_YEAR + 300)],
			knotYears: KNOT_YEARS,
		})
		expect(result.farmingYear[2]).toBe(FIRST_YEAR + 300)
		expect(result.hearthOf[2]).toBe(2)
		expect(result.hearthOf[3]).toBe(2)
	})

	it("opens specialised pastoralism a fixed span after the first hearth fires", () => {
		const open = (startYears: number[]) =>
			FARMING_LIVING.pastoralYear({ startYears, horizonYear: 2025 })
		expect(open([-9600, -7000])).toBe(-1000)
		expect(open([-6000, -7000])).toBe(open([-7000]))
		expect(open([-7000])).toBe(open([-9600]) + 2600)
		expect(open([])).toBe(2025)
	})
})

describe("farming hearths", () => {
	it("starts the best site in 9600 BCE and the poorest in 2050 BCE, never before settlement", () => {
		expect(FARMING_HEARTHS.startYear({ odds: 1, settledYear: -80000 })).toBe(
			-9600,
		)
		expect(FARMING_HEARTHS.startYear({ odds: 0, settledYear: -80000 })).toBe(
			-2050,
		)
		expect(FARMING_HEARTHS.startYear({ odds: 0.5, settledYear: -80000 })).toBe(
			-5825,
		)
		expect(FARMING_HEARTHS.startYear({ odds: 1, settledYear: -7000 })).toBe(
			-7000,
		)
	})

	function schedule({
		count,
		odds,
		areaKm2,
	}: {
		count: number
		odds: Record<number, number>
		areaKm2: number
	}) {
		const { world, migration } = FARMING_FIXTURE.world({
			layout: "L".repeat(count),
			stepDegrees: 0.5,
		})
		return FARMING_HEARTHS.schedule({
			provinces: world.provinces,
			landGraph: migration.landGraph,
			r_xyz: world.mesh.r_xyz,
			planetRadiusKm: 6371,
			odds: Float64Array.from({ length: count }, (_, p) => odds[p] ?? 0),
			timing: Float64Array.from({ length: count }, (_, p) => odds[p] ?? 0),
			dependence: Float64Array.from({ length: count }, (_, p) => odds[p] ?? 0),
			traversable: new Uint8Array(count).fill(1),
			suitability: new Float64Array(count).fill(1),
			areaKm2: new Float64Array(count).fill(areaKm2),
			continuousArrival: new Float64Array(count).fill(-80000),
		})
	}

	it("skips a candidate closer than the spacing to an accepted hearth", () => {
		const { hearths } = schedule({
			count: 40,
			odds: { 5: 1, 20: 0.8, 35: 0.6 },
			areaKm2: 555556,
		})
		expect(hearths.map((h) => h.province)).toEqual([5, 35])
	})

	it("keeps only local maxima within 300 km and at most 12 hearths", () => {
		const peaks: Record<number, number> = {}
		for (let p = 0; p < 150; p += 8) peaks[p] = 0.9
		peaks[3] = 0.5
		const { hearths } = schedule({ count: 150, odds: peaks, areaKm2: 1 })
		expect(hearths).toHaveLength(12)
		expect(hearths.some((h) => h.province === 3)).toBe(false)
		expect(hearths.every((h) => !h.fired)).toBe(true)
	})

	it("gives no hearths when no odds clear the candidate floor", () => {
		expect(
			schedule({ count: 10, odds: { 4: 0.1 }, areaKm2: 1000 }).hearths,
		).toEqual([])
	})

	it("returns zero odds when nothing is eligible or the coldest month is -10 C, and rank 1 for a lone province", () => {
		const { world, migration } = FARMING_FIXTURE.world({
			layout: "L",
			stepDegrees: 0.5,
		})
		const base = {
			provinces: world.provinces,
			landGraph: migration.landGraph,
			mesh: world.mesh,
			planetRadiusKm: 6371,
		}
		const measures = FARMING_FIXTURE.measures({ count: 1, overrides: {} })
		expect(
			FARMING_ODDS.compute({
				...base,
				measures,
				traversable: Uint8Array.of(0),
			}).odds,
		).toEqual(new Float64Array(1))
		expect(
			FARMING_ODDS.compute({
				...base,
				measures,
				traversable: Uint8Array.of(1),
			}).odds[0],
		).toBe(1)
		const dead = FARMING_FIXTURE.measures({ count: 1, overrides: { npp: 0 } })
		expect(
			FARMING_ODDS.compute({
				...base,
				measures: dead,
				traversable: Uint8Array.of(1),
			}).odds[0],
		).toBe(0)
		for (const [Tc, expected] of [
			[-10, 0],
			[-4, 1],
		] as const) {
			const cold = FARMING_FIXTURE.measures({ count: 1, overrides: { Tc } })
			expect(
				FARMING_ODDS.compute({
					...base,
					measures: cold,
					traversable: Uint8Array.of(1),
				}).odds[0],
			).toBe(expected)
		}
	})
})

describe("way of life", () => {
	function mode(inputs: WayCaseParams) {
		const measures = FARMING_FIXTURE.measures({
			count: 1,
			overrides: {
				arid: inputs.arid,
				npp: inputs.npp,
				pasture: inputs.pasture,
				forager: inputs.forager,
				floodShare: inputs.floodShare ?? 0,
			},
		})
		const c = FARMING_LIVING.capacities({
			measures,
			suitability: Float64Array.of(inputs.suitability),
		})
		const cropFit = FARMING_LIVING.cropFit({ measures })
		const herdShare = FARMING_LIVING.herdShare({ measures, cropFit })
		return {
			c,
			cropFit: cropFit[0],
			herdShare: herdShare[0],
			mode: FARMING_LIVING.modeOfCode({
				code: FARMING_LIVING.postMode({
					forage: c.forage[0],
					farm: c.farm[0],
					herd: c.herd[0],
					farmShare: cropFit[0],
					herdShare: herdShare[0],
				}),
			}),
		}
	}

	it("picks herding on cold semi-arid steppe and farming in the millet belt", () => {
		const steppe = mode({
			suitability: 0.1,
			arid: 0.25,
			npp: 150,
			pasture: 0.8,
			forager: 0.1,
		})
		expect(steppe.c.farm[0]).toBeCloseTo(0.44, 1)
		expect(steppe.c.herd[0]).toBeCloseTo(1.6)
		expect(steppe.mode).toBe("herd")
		const millet = mode({
			suitability: 0.3,
			arid: 0.35,
			npp: 600,
			pasture: 0.5,
			forager: 0.1,
		})
		expect(millet.c.farm[0]).toBeCloseTo(9)
		expect(millet.mode).toBe("farm")
	})

	it("labels a mode only where its land share reaches 0.27", () => {
		const thin = mode({
			suitability: 0.4,
			arid: 1.2,
			npp: 330,
			pasture: 0,
			forager: 0.01,
		})
		expect(thin.c.farm[0]).toBeGreaterThan(thin.c.forage[0])
		expect(thin.cropFit).toBeCloseTo(0.0417, 3)
		expect(thin.mode).toBe("none")
		const grassy = mode({
			suitability: 0.01,
			arid: 1.2,
			npp: 330,
			pasture: 0.4,
			forager: 0.01,
		})
		expect(grassy.herdShare).toBeCloseTo(0.4 * (1 - 0.0417), 2)
		expect(grassy.mode).toBe("herd")
		const sparse = mode({
			suitability: 0.01,
			arid: 1.2,
			npp: 330,
			pasture: 0.25,
			forager: 0.01,
		})
		expect(sparse.herdShare).toBeLessThan(0.27)
		expect(sparse.mode).toBe("none")
	})

	it("irrigates desert river valleys and herds the desert interior", () => {
		const valley = mode({
			suitability: 0.05,
			arid: 0.05,
			npp: 100,
			pasture: 0.1,
			forager: 0.1,
			floodShare: 0.3,
		})
		expect(valley.c.farm[0]).toBeCloseTo(45)
		expect(valley.mode).toBe("farm")
		const interior = mode({
			suitability: 0.03,
			arid: 0.05,
			npp: 100,
			pasture: 0.3,
			forager: 0.01,
		})
		expect(interior.c.farm[0]).toBe(0)
		expect(interior.mode).toBe("herd")
	})

	it("farms rich forager coasts and lets weaker ones forage for a while", () => {
		const rich = mode({
			suitability: 0.4,
			arid: 1.2,
			npp: 1000,
			pasture: 0,
			forager: 1,
		})
		expect(rich.c.farm[0]).toBeCloseTo(24)
		expect(rich.mode).toBe("farm")
		const weak = mode({
			suitability: 0.15,
			arid: 1.2,
			npp: 1000,
			pasture: 0,
			forager: 1,
		})
		expect(weak.c.farm[0]).toBeCloseTo(9)
		expect(
			FARMING_LIVING.adoptionYear({
				farmingYear: -5000,
				forage: 1,
				capacity: 9,
				hearthTiming: 1,
				horizonYear: 2025,
			}),
		).toBe(-5000 + ADOPTION_LAG + Math.ceil(1500 * Math.log(9 / 8)))
		expect(
			mode({
				suitability: 0.01,
				arid: 1.2,
				npp: 1000,
				pasture: 0,
				forager: 1,
			}).mode,
		).toBe("none")
	})

	it("adopts one ramp half-life after arrival, after a decaying hold, or never", () => {
		const adopt = (ratio: number, farmingYear: number) =>
			FARMING_LIVING.adoptionYear({
				farmingYear,
				forage: 1,
				capacity: ratio,
				hearthTiming: 1,
				horizonYear: 2025,
			})
		expect(adopt(10, -3000)).toBe(-3000 + ADOPTION_LAG)
		expect(adopt(25, -3000)).toBe(-3000 + ADOPTION_LAG)
		expect(adopt(5, -3000)).toBe(
			-3000 + ADOPTION_LAG + Math.ceil(1500 * Math.log(9 / 4)),
		)
		expect(adopt(2, -3000)).toBe(
			-3000 + ADOPTION_LAG + Math.ceil(1500 * Math.log(9)),
		)
		expect(adopt(10, 1700)).toBe(MIGRATION.sentinel)
		expect(adopt(1, -3000)).toBe(MIGRATION.sentinel)
		expect(adopt(0.5, -3000)).toBe(MIGRATION.sentinel)
		expect(adopt(2, 1500)).toBe(MIGRATION.sentinel)
		expect(adopt(10, MIGRATION.sentinel)).toBe(MIGRATION.sentinel)
	})

	it("reports uninhabited before settlement, forage before adoption and forage when never farmed", () => {
		const farming = {
			settledYear: Int32Array.of(-4000, -4000, MIGRATION.sentinel, -4000),
			adoptionYear: Int32Array.of(-2000, MIGRATION.sentinel, -2000, -3000),
			herdAdoptionYear: Int32Array.of(
				-2000,
				-3500,
				MIGRATION.sentinel,
				MIGRATION.sentinel,
			),
			forageDensity: Float32Array.of(1, 1, 1, 1),
			farmCapacity: Float32Array.of(0, 0, 0, 60),
			herdCapacity: Float32Array.of(10, 10, 10, 0),
			farmFit: Float32Array.of(0, 0, 0, 0.5),
			herdFit: Float32Array.of(0.8, 0.8, 0.8, 0),
			herdColonial: new Uint8Array(4),
			farmModern: new Uint8Array(4),
		}
		const graph = {
			count: 4,
			desolate: new Uint8Array(4),
			adjOffset: new Int32Array(5),
			adjList: new Int32Array(0),
		}
		const fieldAt = (year: number) =>
			FARMING_WAY_OF_LIFE.wayOfLife({ farming, graph, year, techLevel: 2.35 })
		const at = (province: number, year: number) =>
			FARMING_WAY_OF_LIFE.modeOf({ field: fieldAt(year), province })
		expect(at(0, -4001)).toBe("uninhabited")
		expect(at(0, -4000)).toBe("forage")
		expect(at(0, -2000)).toBe("forage")
		expect(at(0, 0)).toBe("herd")
		expect(at(1, -3501)).toBe("forage")
		expect(at(1, 2000)).toBe("herd")
		expect(at(2, 2000)).toBe("uninhabited")
		const mixed = fieldAt(2000)
		expect(mixed.forage[3] + mixed.farm[3] + mixed.herd[3]).toBeCloseTo(1, 6)
		expect(mixed.forage[3]).toBeGreaterThan(0)
		expect(mixed.farm[3]).toBeGreaterThan(mixed.forage[3])
		expect(fieldAt(-2900).farm[3]).toBeLessThan(mixed.farm[3])
	})
})

describe("colonial herds", () => {
	it("spreads at the colonial pace only over land flagged colonial", () => {
		const run = (colonial: number[] | null) =>
			spread({
				layout: "LL",
				stepDegrees: 0.5,
				hearths: [hearth(0, FIRST_YEAR)],
				postMode: [0, HERD],
				measures: { pasture: 0.8, T: 15 },
				configure: (params) => {
					params.colonial = colonial ? Uint8Array.from(colonial) : null
				},
			}).result
		const colonial = run([0, 1])
		expect(colonial.landEdgeSpeed.p50).toBeCloseTo(30)
		expect(
			Math.abs(colonial.farmingYear[1] - (FIRST_YEAR + STEP_KM / 30)),
		).toBeLessThanOrEqual(2)
		expect(run([1, 0]).landEdgeSpeed.p50).toBeCloseTo(3)
		expect(run(null).landEdgeSpeed.p50).toBeCloseTo(3)
	})

	it("fills herd land and density within a century or two of adoption, where native herding takes millennia", () => {
		const farming = (colonial: number) => ({
			settledYear: Int32Array.of(-4000),
			adoptionYear: Int32Array.of(MIGRATION.sentinel),
			herdAdoptionYear: Int32Array.of(1000),
			forageDensity: Float32Array.of(1),
			farmCapacity: Float32Array.of(0),
			herdCapacity: Float32Array.of(1.1),
			farmFit: Float32Array.of(0),
			herdFit: Float32Array.of(0.8),
			herdColonial: Uint8Array.of(colonial),
			farmModern: Uint8Array.of(0),
		})
		const graph = {
			count: 1,
			desolate: new Uint8Array(1),
			adjOffset: new Int32Array(2),
			adjList: new Int32Array(0),
		}
		const at = (colonial: number, year: number) =>
			FARMING_WAY_OF_LIFE.wayOfLife({
				farming: farming(colonial),
				graph,
				year,
				techLevel: 2.35,
			})
		const fast = at(1, 1150)
		const slow = at(0, 1150)
		expect(fast.herd[0]).toBeGreaterThan(0.5)
		expect(slow.herd[0]).toBeLessThan(0.05)
		const filled = 1 - Math.exp(-3)
		expect(fast.density[0]).toBeCloseTo(
			1 - 0.8 * filled + 0.8 * filled * (1 + 0.1 * filled),
			6,
		)
		expect(at(1, 999).herd[0]).toBe(0)
		const noGain = farming(1)
		noGain.herdCapacity = Float32Array.of(0.9)
		expect(
			FARMING_WAY_OF_LIFE.wayOfLife({
				farming: noGain,
				graph,
				year: 1500,
				techLevel: 2.35,
			}).herd[0],
		).toBe(0)
	})

	it("fills farm land and density within about 150 years when adopted after the ocean year, where earlier adoption ramps for millennia", () => {
		const farming = (modern: number) => ({
			settledYear: Int32Array.of(-4000),
			adoptionYear: Int32Array.of(1000),
			herdAdoptionYear: Int32Array.of(MIGRATION.sentinel),
			forageDensity: Float32Array.of(1),
			farmCapacity: Float32Array.of(60),
			herdCapacity: Float32Array.of(0),
			farmFit: Float32Array.of(0.8),
			herdFit: Float32Array.of(0),
			herdColonial: Uint8Array.of(0),
			farmModern: Uint8Array.of(modern),
		})
		const graph = {
			count: 1,
			desolate: new Uint8Array(1),
			adjOffset: new Int32Array(2),
			adjList: new Int32Array(0),
		}
		const at = (modern: number, year: number) =>
			FARMING_WAY_OF_LIFE.wayOfLife({
				farming: farming(modern),
				graph,
				year,
				techLevel: 5,
			})
		const potential = at(1, 5000).farm[0]
		const fast = at(1, 1150)
		const slow = at(0, 1150)
		expect(fast.farm[0]).toBeGreaterThan(0.9 * potential)
		expect(slow.farm[0]).toBeLessThan(0.5 * potential)
		expect(fast.density[0]).toBeGreaterThan(5 * slow.density[0])
		expect(at(1, 999).farm[0]).toBe(0)
	})
})

describe("carrying density", () => {
	it("ramps from forager density toward capacity with farming age", () => {
		expect(FARMING_LIVING.density({ forage: 1, capacity: 61, years: 0 })).toBe(
			1,
		)
		const at = (years: number) =>
			1 + 60 * (1 - Math.exp(-years / 650)) * (1 - Math.exp(-years / 16000))
		expect(
			FARMING_LIVING.density({ forage: 1, capacity: 61, years: 2000 }),
		).toBeCloseTo(at(2000), 9)
		expect(
			FARMING_LIVING.density({ forage: 1, capacity: 61, years: -50 }),
		).toBe(1)
		expect(
			FARMING_LIVING.density({ forage: 5, capacity: 2, years: 3000 }),
		).toBe(5)
	})

	it("cubes rain-fed yield and squares irrigated yield above full rain-fed", () => {
		expect(FARMING_LIVING.farmDensity({ capacity: 60 })).toBeCloseTo(60, 9)
		expect(FARMING_LIVING.farmDensity({ capacity: 30 })).toBeCloseTo(7.5, 9)
		expect(FARMING_LIVING.farmDensity({ capacity: 150 })).toBeCloseTo(
			60 * 2.5 ** 2,
			9,
		)
	})
})

describe("dependence lag", () => {
	it("delays adoption by the hearth's weak seasonality", () => {
		const adopt = (hearthTiming: number) =>
			FARMING_LIVING.adoptionYear({
				farmingYear: -6000,
				forage: 1,
				capacity: 20,
				hearthTiming,
				horizonYear: 2025,
			})
		expect(adopt(1)).toBe(-6000 + ADOPTION_LAG)
		expect(adopt(0)).toBe(-6000 + ADOPTION_LAG + 4250)
		expect(adopt(0.5)).toBe(-6000 + ADOPTION_LAG + 2125)
	})

	it("ends the dependence lag once the ocean year arrives, never delaying adoption", () => {
		const base = {
			farmingYear: -3000,
			forage: 1,
			capacity: 20,
			horizonYear: 2025,
		}
		const dependent = FARMING_LIVING.adoptionYear({ ...base, hearthTiming: 0 })
		expect(dependent).toBe(-3000 + ADOPTION_LAG + 4250)
		const exchange = (oceanYear: number) =>
			Math.min(
				dependent,
				FARMING_LIVING.exchangeAdoptionYear({ ...base, oceanYear }),
			)
		expect(exchange(1000)).toBe(1000 + ADOPTION_LAG)
		expect(exchange(-5000)).toBe(-3000 + ADOPTION_LAG)
		expect(exchange(dependent)).toBe(dependent)
		expect(exchange(1500)).toBe(dependent)
		expect(
			FARMING_LIVING.exchangeAdoptionYear({
				...base,
				farmingYear: MIGRATION.sentinel,
				oceanYear: 1500,
			}),
		).toBe(MIGRATION.sentinel)
	})
})
