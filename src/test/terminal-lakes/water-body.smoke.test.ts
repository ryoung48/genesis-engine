import { describe, expect, it } from "vitest"
import { ENDORHEIC } from "@/model/geography/terrain/endorheic"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG

function lineMesh(n: number) {
	const adjOffset = new Int32Array(n + 1)
	const list: number[] = []
	for (let r = 0; r < n; r++) {
		if (r > 0) list.push(r - 1)
		if (r < n - 1) list.push(r + 1)
		adjOffset[r + 1] = list.length
	}
	return { numRegions: n, adjOffset, adjList: Int32Array.from(list) }
}

function bodies({
	elevation,
	inflow,
	floorFraction = C.panFloorFraction,
}: {
	elevation: number[]
	inflow: number
	floorFraction?: number
}) {
	const n = elevation.length
	const elev = Float32Array.from(elevation)
	const layout = ENDORHEIC.layout({
		basinId: new Int32Array(n),
		elevation: elev,
	})
	const sill = Math.max(...elevation)
	return ENDORHEIC.waterBodies({
		mesh: lineMesh(n),
		elevation: elev,
		layout,
		terminal: Uint8Array.of(1),
		inflowM3s: Float32Array.of(inflow),
		sill: Float32Array.of(sill),
		deficitMm: new Float32Array(n).fill(1000),
		areaM2: new Float64Array(n).fill(1),
		secondsPerYear: 1,
		floorFraction,
	})[0]
}

const BOWL = [5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5]

describe("terminal basin water bodies", () => {
	it("grows the lake from the lowest region within the evaporation budget", () => {
		const { lake } = bodies({ elevation: BOWL, inflow: 3.5 })
		expect(lake.length).toBe(3)
		expect(lake).toContain(5)
		expect(new Set(lake)).toEqual(new Set([4, 5, 6]))
	})

	it("the pan is the connected low floor outside the lake and stays disjoint from it", () => {
		const { lake, pan } = bodies({ elevation: BOWL, inflow: 3.5 })
		expect(pan).toEqual([3, 7])
		for (const cell of pan) expect(lake).not.toContain(cell)
	})

	it("a basin too small for a lake still gets a pan including its lowest region", () => {
		const { lake, pan } = bodies({ elevation: BOWL, inflow: 1.5 })
		expect(lake).toEqual([])
		expect(pan).toContain(5)
		expect(pan.length).toBeGreaterThan(1)
	})

	it("excludes a disconnected low pocket from the pan", () => {
		const { pan } = bodies({
			elevation: [5, 4, 3, 2, 1, 0, 1, 2, 4, 0.5, 5],
			inflow: 0,
		})
		expect(pan).not.toContain(9)
		expect(pan).toContain(5)
	})

	it("a higher floor fraction gives a wider pan", () => {
		const narrow = bodies({ elevation: BOWL, inflow: 0, floorFraction: 0.25 })
		const wide = bodies({ elevation: BOWL, inflow: 0, floorFraction: 0.75 })
		expect(wide.pan.length).toBeGreaterThan(narrow.pan.length)
	})

	it("open basins get neither", () => {
		const n = BOWL.length
		const elev = Float32Array.from(BOWL)
		const out = ENDORHEIC.waterBodies({
			mesh: lineMesh(n),
			elevation: elev,
			layout: ENDORHEIC.layout({ basinId: new Int32Array(n), elevation: elev }),
			terminal: Uint8Array.of(0),
			inflowM3s: Float32Array.of(100),
			sill: Float32Array.of(5),
			deficitMm: new Float32Array(n).fill(1000),
			areaM2: new Float64Array(n).fill(1),
			secondsPerYear: 1,
			floorFraction: 0.5,
		})
		expect(out[0]).toEqual({ lake: [], pan: [] })
	})
})
