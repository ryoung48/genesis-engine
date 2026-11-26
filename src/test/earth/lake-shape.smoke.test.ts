import { expect, it } from "vitest"
import { LAKES } from "@/model/geography/terrain/lakes"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { generateWorld } from "@/test/tectonics/world-cache"

it("trims a narrow salt flat while keeping its cells on land", () => {
	const n = 9
	const adjOffset = new Int32Array(n + 1)
	const neighbors: number[] = []
	for (let r = 0; r < n; r++) {
		if (r > 0) neighbors.push(r - 1)
		if (r < n - 1) neighbors.push(r + 1)
		adjOffset[r + 1] = neighbors.length
	}
	const lakeKind = new Uint8Array(n)
	const isLand = new Uint8Array(n).fill(1)
	LAKES.computeLakes({
		mesh: {
			numRegions: n,
			adjOffset,
			adjList: Int32Array.from(neighbors),
			regionArea: new Float32Array(n).fill(1),
		},
		planetRadiusKm: 1,
		secondsPerYear: 1,
		elevation: new Float32Array(n),
		rainfall: { annual: new Float32Array(n) },
		petMonthly: new Float32Array(12 * n).fill(100),
		waterLevel: new Float32Array(n).fill(1),
		basinId: new Int32Array(n),
		basinTerminal: Uint8Array.of(1),
		basinInflow: new Float32Array(1),
		basinEvaporation: new Float32Array(1),
		lakeKind,
		isLand,
	})
	expect(
		[...lakeKind].filter((kind) => kind === LAKES.kindCode.pan),
	).toHaveLength(2)
	expect([...isLand].every((land) => land === 1)).toBe(true)
})

it("trims branching freshwater and salt lakes on seed loylrj", () => {
	const world = generateWorld({ seed: Number.parseInt("loylrj", 36) })
	const sizes = new Map<number, number>()
	const saltSizes = new Map<number, number>()
	let saltPan = 0
	for (let r = 0; r < world.mesh.numRegions; r++) {
		const kind = world.rivers.lakeKind[r]
		if (world.rivers.basinId[r] === 451 && kind === LAKES.kindCode.pan)
			saltPan++
		const id = world.landmarks.regionLandmark[r]
		if (id < 0 || world.landmarks.type[id] !== LANDMARKS.landmarkTypeLake)
			continue
		if (kind === LAKES.kindCode.fresh) sizes.set(id, (sizes.get(id) ?? 0) + 1)
		if (kind === LAKES.kindCode.salt && world.rivers.basinId[r] === 451)
			saltSizes.set(id, (saltSizes.get(id) ?? 0) + 1)
	}
	expect(sizes.size).toBeGreaterThan(0)
	expect(Math.max(...sizes.values())).toBeLessThan(50)
	expect(saltSizes.size).toBeGreaterThan(0)
	expect(Math.max(...saltSizes.values())).toBeLessThan(30)
	expect(saltPan).toBeGreaterThan(0)
}, 300_000)
