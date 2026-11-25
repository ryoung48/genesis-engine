import { describe, expect, it } from "vitest"
import { OASES } from "@/model/geography/terrain/groundwater/oases"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG
const SECONDS = 3.15576e7
const WELL_CLASS = C.depthClassesM.indexOf(C.wellM)
const SHALLOW_CLASS = C.depthClassesM.indexOf(C.shallowWellM)

function springs({
	qem = 0,
	qin = 1,
	qkarst = 0,
	dry = 0,
	seepShare = 0,
	slope = 0,
}: {
	qem?: number
	qin?: number
	qkarst?: number
	dry?: number
	seepShare?: number
	slope?: number
}): number {
	return SPRINGS.classify({
		qem: Float64Array.of(qem),
		qin: Float64Array.of(qin),
		qkarst: Float64Array.of(qkarst),
		dry: Uint8Array.of(dry),
		seepShare: Float32Array.of(seepShare),
		slope: Float32Array.of(slope),
		active: Uint8Array.of(1),
	})[0]
}

describe("springs", () => {
	it("lateral classes appear only where emergence reaches the minimum", () => {
		expect(springs({ qem: C.springMinM3s * 0.99 })).toBe(SPRINGS.code.none)
		expect(springs({ qem: C.springMinM3s })).toBe(SPRINGS.code.contact)
	})

	it("karst needs the karst share of inflow, piedmont needs a dry region", () => {
		const emerging = { qem: C.springMinM3s * 2, qin: 1 }
		expect(springs({ ...emerging, qkarst: C.karstShare })).toBe(
			SPRINGS.code.karst,
		)
		expect(springs({ ...emerging, qkarst: C.karstShare * 0.9 })).toBe(
			SPRINGS.code.contact,
		)
		expect(springs({ ...emerging, dry: 1 })).toBe(SPRINGS.code.piedmont)
		expect(springs({ ...emerging, dry: 1, qkarst: 1 })).toBe(SPRINGS.code.karst)
	})

	it("seepage needs both the seep share and the slope, and yields to lateral classes", () => {
		expect(
			springs({ seepShare: C.seepMin * 1.01, slope: C.springSlope * 1.01 }),
		).toBe(SPRINGS.code.seepage)
		expect(
			springs({ seepShare: C.seepMin * 0.9, slope: C.springSlope * 1.01 }),
		).toBe(SPRINGS.code.none)
		expect(
			springs({ seepShare: C.seepMin * 1.01, slope: C.springSlope * 0.5 }),
		).toBe(SPRINGS.code.none)
		expect(
			springs({
				seepShare: 1,
				slope: 1,
				qem: C.springMinM3s * 2,
			}),
		).toBe(SPRINGS.code.contact)
	})

	it("a karst-over-shale edge gives a karst spring on the shale region", () => {
		const out = SPRINGS.classify({
			qem: Float64Array.of(0, C.springMinM3s * 10),
			qin: Float64Array.of(0, 1),
			qkarst: Float64Array.of(0, 0.9),
			dry: Uint8Array.of(0, 0),
			seepShare: new Float32Array(2),
			slope: new Float32Array(2),
			active: Uint8Array.of(1, 1),
		})
		expect(out[1]).toBe(SPRINGS.code.karst)
	})
})

function oasis({
	wetIndex = 0.1,
	pet = 1500,
	rain = 100,
	flow = 0,
	areaM2 = 1e10,
	band = 0,
	channelM3s = 0,
	effective = 0,
	qem = 0,
	wellReach = 0,
	shallowReach = 0,
	aquifer = 0,
}: {
	wetIndex?: number
	pet?: number
	rain?: number
	flow?: number
	areaM2?: number
	band?: number
	channelM3s?: number
	effective?: number
	qem?: number
	wellReach?: number
	shallowReach?: number
	aquifer?: number
}) {
	const shallowShare = new Uint8Array(C.depthClassesM.length)
	shallowShare[WELL_CLASS] = Math.round(wellReach * 255)
	shallowShare[SHALLOW_CLASS] = Math.round(shallowReach * 255)
	return OASES.classify({
		wetIndex: Float32Array.of(wetIndex),
		pet: Float32Array.of(pet),
		rain: Float32Array.of(rain),
		flow: Float32Array.of(flow),
		areaM2: Float64Array.of(areaM2),
		band: Float32Array.of(band),
		channelM3s: Float32Array.of(channelM3s),
		effective: Float64Array.of(effective),
		qem: Float64Array.of(qem),
		shallowShare,
		heightM: Float32Array.of(0),
		aquifer: Uint8Array.of(aquifer),
		adjOffset: Int32Array.of(0, 0),
		adjList: Int32Array.of(),
		secondsPerYear: SECONDS,
		active: Uint8Array.of(1),
	})
}

function terrain({
	wetIndex,
	heightM,
	aquifer = wetIndex.map(() => 0),
	effective = wetIndex.map(() => 0),
	active = wetIndex.map(() => 1),
	qem = wetIndex.map(() => 0),
	adjacency,
}: {
	wetIndex: number[]
	heightM: number[]
	aquifer?: number[]
	effective?: number[]
	active?: number[]
	qem?: number[]
	adjacency: number[][]
}) {
	const n = wetIndex.length
	const offsets = [0]
	const list: number[] = []
	for (const nbs of adjacency) {
		list.push(...nbs)
		offsets.push(list.length)
	}
	return OASES.classify({
		wetIndex: Float32Array.from(wetIndex),
		pet: new Float32Array(n).fill(1500),
		rain: new Float32Array(n).fill(100),
		flow: new Float32Array(n),
		areaM2: new Float64Array(n).fill(1e10),
		band: new Float32Array(n),
		channelM3s: new Float32Array(n),
		effective: Float64Array.from(effective),
		qem: Float64Array.from(qem),
		shallowShare: new Uint8Array(n * C.depthClassesM.length),
		heightM: Float32Array.from(heightM),
		aquifer: Uint8Array.from(aquifer),
		adjOffset: Int32Array.from(offsets),
		adjList: Int32Array.from(list),
		secondsPerYear: SECONDS,
		active: Uint8Array.from(active),
	}).oasis
}

const FRONT_NEEDED = (C.springOasisM2 * 1.4) / SECONDS

describe("oases", () => {
	it("occur only in dry regions and a region at the arid index is not dry", () => {
		const args = { band: 0.5, flow: C.riverOasisM3s * 2 }
		expect(oasis({ ...args, wetIndex: C.aridIndex - 1e-6 }).oasis[0]).toBe(
			OASES.code.river,
		)
		expect(oasis({ ...args, wetIndex: C.aridIndex }).oasis[0]).toBe(
			OASES.code.none,
		)
	})

	it("classes are ordered river, spring, wells", () => {
		const everything = {
			band: 0.5,
			flow: C.riverOasisM3s * 2,
			qem: 50,
			effective: 1e-9,
			wellReach: 1,
		}
		expect(oasis(everything).oasis[0]).toBe(OASES.code.river)
		expect(oasis({ ...everything, flow: 0 }).oasis[0]).toBe(OASES.code.spring)
		expect(oasis({ ...everything, flow: 0, qem: 0 }).oasis[0]).toBe(
			OASES.code.wells,
		)
	})

	it("a spring oasis needs emergence to irrigate springOasisM2 against net evaporation", () => {
		const pet = 1500
		const rain = 100
		const deficitM = (pet - rain) / 1000
		const needed = (C.springOasisM2 * deficitM) / SECONDS
		expect(oasis({ qem: needed * 1.01, pet, rain }).oasis[0]).toBe(
			OASES.code.spring,
		)
		expect(oasis({ qem: needed * 0.99, pet, rain }).oasis[0]).toBe(
			OASES.code.none,
		)
		expect(oasis({ qem: 100, pet: rain, rain }).oasis[0]).toBe(OASES.code.none)
	})

	it("a dry region below a wet upland gets the upland's regional share as a foothill oasis", () => {
		const e = (FRONT_NEEDED * 1.01) / (C.regionalShare * 1e10)
		const base = {
			wetIndex: [1, 0.1],
			heightM: [1000, 1000 - C.frontDropM],
			effective: [e, 0],
			adjacency: [[1], [0]],
		}
		expect(terrain(base)[1]).toBe(OASES.code.foothill)
		expect(terrain({ ...base, effective: [e / 1.05, 0] })[1]).toBe(
			OASES.code.none,
		)
		expect(
			terrain({ ...base, heightM: [1000, 1000 - C.frontDropM + 1] })[1],
		).toBe(OASES.code.none)
		expect(terrain({ ...base, wetIndex: [0.1, 0.1] })[1]).toBe(OASES.code.none)
		expect(terrain({ ...base, qem: [0, FRONT_NEEDED * 1.01] })[1]).toBe(
			OASES.code.spring,
		)
	})

	it("an upland splits its regional share between its dry lower neighbours", () => {
		const e = (FRONT_NEEDED * 1.01) / (C.regionalShare * 1e10)
		const out = terrain({
			wetIndex: [1, 0.1, 0.1],
			heightM: [1000, 500, 500],
			effective: [e, 0, 0],
			adjacency: [[1, 2], [0], [0]],
		})
		expect(out[1]).toBe(OASES.code.none)
		expect(out[2]).toBe(OASES.code.none)
		const doubled = terrain({
			wetIndex: [1, 0.1, 0.1],
			heightM: [1000, 500, 500],
			effective: [e * 2.02, 0, 0],
			adjacency: [[1, 2], [0], [0]],
		})
		expect(doubled[1]).toBe(OASES.code.foothill)
		expect(doubled[2]).toBe(OASES.code.foothill)
	})

	it("a dry aquifer region depressionM below its neighbour mean is a fossil oasis", () => {
		const base = {
			wetIndex: [0.1, 0.1, 0.1],
			heightM: [0, C.depressionM, C.depressionM],
			aquifer: [1, 0, 0],
			adjacency: [[1, 2], [0], [0]],
		}
		expect(terrain(base)[0]).toBe(OASES.code.fossil)
		expect(terrain({ ...base, aquifer: [0, 0, 0] })[0]).toBe(OASES.code.none)
		expect(
			terrain({
				...base,
				heightM: [0, C.depressionM - 1, C.depressionM - 1],
			})[0],
		).toBe(OASES.code.none)
		expect(
			terrain({ ...base, heightM: [0, C.depressionM * 3, -C.depressionM] })[0],
		).toBe(OASES.code.fossil)
		expect(
			terrain({
				...base,
				heightM: [0, C.depressionM * 3, -C.depressionM * 3],
			})[0],
		).toBe(OASES.code.none)
		expect(terrain({ ...base, active: [1, 1, 0] })[0]).toBe(OASES.code.none)
		expect(terrain({ ...base, wetIndex: [C.aridIndex, 0.1, 0.1] })[0]).toBe(
			OASES.code.none,
		)
	})

	it("well yield is the well share of effective recharge plus channel recharge per area", () => {
		const effective = 2e-9
		const channelM3s = 0.5
		const areaM2 = 1e10
		const result = oasis({ effective, channelM3s, areaM2 })
		expect(result.wellMm[0]).toBeCloseTo(
			C.wellShare *
				(effective * SECONDS * 1000 + (1000 * channelM3s * SECONDS) / areaM2),
			3,
		)
	})

	it("wells need reach and yield", () => {
		expect(oasis({ wellReach: 1, effective: 1e-9 }).oasis[0]).toBe(
			OASES.code.wells,
		)
		expect(oasis({ wellReach: 0, effective: 1e-9 }).oasis[0]).toBe(
			OASES.code.none,
		)
		expect(oasis({ wellReach: 1, effective: 0 }).oasis[0]).toBe(OASES.code.none)
		const fossil = { wellReach: 1, effective: 0, aquifer: 1 }
		expect(
			oasis({ ...fossil, shallowReach: C.shallowWellShare * 1.01 }).oasis[0],
		).toBe(OASES.code.wells)
		expect(
			oasis({ ...fossil, shallowReach: C.shallowWellShare * 0.9 }).oasis[0],
		).toBe(OASES.code.none)
		expect(oasis({ ...fossil, aquifer: 0, shallowReach: 1 }).oasis[0]).toBe(
			OASES.code.none,
		)
		expect(oasis({ ...fossil, wellReach: 0, shallowReach: 1 }).oasis[0]).toBe(
			OASES.code.none,
		)
	})
})
