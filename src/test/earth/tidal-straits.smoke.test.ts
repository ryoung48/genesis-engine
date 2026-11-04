import { expect, it } from "vitest"
import { TIDAL_STRAITS } from "@/model/climate/ocean/tides/tidal-map/straits"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"

const STEP_RAD = 0.02
const RADIUS_KM = 6371
const COLUMNS = 34
const ROWS = 17
const WALL = 22

function basin({
	gapRows,
	waterType,
}: {
	gapRows: number[]
	waterType: number
}) {
	const index = (i: number, j: number) => j * COLUMNS + i
	const N = COLUMNS * ROWS
	const isLand = new Uint8Array(N)
	const adjOffset = new Int32Array(N + 1)
	const adjList: number[] = []
	for (let j = 0; j < ROWS; j++)
		for (let i = 0; i < COLUMNS; i++) {
			const r = index(i, j)
			const border = i === 0 || j === 0 || i === COLUMNS - 1 || j === ROWS - 1
			if (border || (i === WALL && !gapRows.includes(j))) isLand[r] = 1
			adjOffset[r] = adjList.length
			for (const [di, dj] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1],
			]) {
				const ni = i + di
				const nj = j + dj
				if (ni >= 0 && nj >= 0 && ni < COLUMNS && nj < ROWS)
					adjList.push(index(ni, nj))
			}
		}
	adjOffset[N] = adjList.length
	const landmarks = {
		regionLandmark: Int32Array.from(isLand, (land) => (land ? 1 : 0)),
		type: new Uint8Array([waterType, 0]),
	}
	const damping = TIDAL_STRAITS.damping({
		mesh: {
			numRegions: N,
			adjOffset,
			adjList: Int32Array.from(adjList),
			neighborDist: new Float32Array(adjList.length).fill(STEP_RAD),
		},
		isOcean: (r) => !isLand[r],
		landmarks,
		planetRadiusKm: RADIUS_KM,
	})
	return { ocean: damping[index(10, 8)], basin: damping[index(28, 8)] }
}

it("damps a basin behind a narrow strait and leaves the open ocean alone", () => {
	const narrow = basin({ gapRows: [8], waterType: LANDMARKS.landmarkTypeOcean })
	expect(narrow.ocean).toBe(1)
	expect(narrow.basin).toBeLessThan(0.3)
	expect(narrow.basin).toBeGreaterThanOrEqual(0.1)
	const open = basin({
		gapRows: Array.from({ length: ROWS }, (_, j) => j),
		waterType: LANDMARKS.landmarkTypeOcean,
	})
	expect(open.basin).toBe(1)
})

it("floors enclosed seas with no ocean connection", () => {
	const sea = basin({ gapRows: [8], waterType: LANDMARKS.landmarkTypeSea })
	expect(sea.ocean).toBeCloseTo(0.1, 6)
	expect(sea.basin).toBeCloseTo(0.1, 6)
})
