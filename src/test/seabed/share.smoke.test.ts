import { describe, expect, it } from "vitest"
import { SEABED_HABITAT } from "@/model/geography/terrain/seabed/habitat"
import { SEABED_CONFIG } from "@/model/geography/terrain/seabed-config"
import { LINE_RADIUS_KM, lineMesh } from "@/test/shore/line-mesh"

const COUNT = 80
const COAST = 4
const EDGE_KM = (0.05 * Math.PI * LINE_RADIUS_KM) / 180

function world() {
	const mesh = lineMesh(COUNT)
	const isLand = new Uint8Array(COUNT)
	for (let r = 0; r <= COAST; r++) isLand[r] = 1
	const openWater = Uint8Array.from(isLand, (land) => (land ? 0 : 1))
	return { mesh, isLand, openWater }
}

describe("seabed reach and share", () => {
	it("reaches ocean cells within the reach distance of the coast and no further", () => {
		const { mesh, isLand, openWater } = world()
		const source = SEABED_HABITAT.reach({
			mesh,
			isLand,
			openWater,
			planetRadiusKm: LINE_RADIUS_KM,
		})
		const cells = Math.floor(SEABED_CONFIG.reachKm / EDGE_KM)
		expect(source[COAST]).toBe(COAST)
		expect(source[COAST + cells]).toBe(COAST)
		expect(source[COAST + cells + 2]).toBe(-1)
		expect(source[0]).toBe(-1)
	})

	it("does not enter lake cells", () => {
		const { mesh, isLand, openWater } = world()
		openWater[COAST + 1] = 0
		const source = SEABED_HABITAT.reach({
			mesh,
			isLand,
			openWater,
			planetRadiusKm: LINE_RADIUS_KM,
		})
		expect(source[COAST + 1]).toBe(-1)
		expect(source[COAST + 2]).toBe(-1)
	})

	it("share is the photic fraction of the cell", () => {
		const source = Int32Array.from([-1, 0, 0, 0, 0])
		const elevationKm = Float32Array.from([0, -0.01, -0.03, -0.3, -3])
		const flow = new Float32Array(5)
		const share = SEABED_HABITAT.share({ source, elevationKm, flow })
		expect(Array.from(share)).toEqual([0, 100, 100, 10, 1])
	})

	it("a river plume removes the share and a small river leaves it", () => {
		const source = Int32Array.from([-1, 0])
		const elevationKm = Float32Array.from([0, -0.03])
		const shareAt = (flowM3s: number) =>
			SEABED_HABITAT.share({
				source,
				elevationKm,
				flow: Float32Array.from([flowM3s, 0]),
			})[1]
		expect(shareAt(500)).toBe(0)
		expect(shareAt(50)).toBe(100)
		expect(shareAt(275)).toBeGreaterThan(0)
		expect(shareAt(275)).toBeLessThan(100)
	})
})
