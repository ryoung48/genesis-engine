import type {
	BuildWorldSampleParams,
	GatherParams,
	PushFrontsParams,
	SampleFrontsParams,
	SimFront,
	TypedField,
	WorldSample,
} from "@/model/geography/tectonics/world-sample/types"
import { MESH } from "@/model/mesh"

function nearestMap({
	from,
	to,
}: {
	from: { numRegions: number; r_xyz: Float32Array }
	to: { numRegions: number; r_xyz: Float32Array }
}): Int32Array {
	const index = MESH.buildRegionSpatialIndex(to)
	const out = new Int32Array(from.numRegions)
	for (let c = 0; c < from.numRegions; c++) {
		const x = from.r_xyz[3 * c]
		const y = from.r_xyz[3 * c + 1]
		const z = from.r_xyz[3 * c + 2]
		out[c] = index.nearest(
			(Math.atan2(y, x) * 180) / Math.PI,
			(Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
		)
	}
	return out
}

function build({ simMesh, mesh }: BuildWorldSampleParams): WorldSample {
	return {
		regionOfCell: nearestMap({ from: simMesh.mesh, to: mesh }),
		cellOfRegion: nearestMap({ from: mesh, to: simMesh.mesh }),
	}
}

function gather<T extends TypedField>({ sample, field }: GatherParams<T>): T {
	const n = sample.regionOfCell.length
	const out = new (field.constructor as new (length: number) => T)(n)
	for (let c = 0; c < n; c++) out[c] = field[sample.regionOfCell[c]]
	return out
}

function pushFronts({
	into,
	kind,
	list,
	sample,
	fronts,
	minCells,
}: PushFrontsParams): void {
	const { edges } = fronts
	for (const front of list) {
		const acc = new Map<number, [number, number, number]>()
		const votes = new Map<number, number>()
		let closing = 0
		for (const i of front.edges) {
			for (const region of [edges.cellA[i], edges.cellB[i]]) {
				const cell = sample.cellOfRegion[region]
				const entry = acc.get(cell) ?? [0, 0, 0]
				entry[0] += edges.closingCmYr[i]
				entry[1] += edges.alongCmYr[i]
				entry[2]++
				acc.set(cell, entry)
			}
			closing += edges.closingCmYr[i]
			const over = edges.overA[i] ? edges.plateA[i] : edges.plateB[i]
			votes.set(over, (votes.get(over) ?? 0) + 1)
		}
		if (acc.size < minCells) continue
		let overPlate = -1
		if (kind === "subduction") {
			let best = -1
			for (const [plate, n] of votes)
				if (n > best || (n === best && plate < overPlate)) {
					best = n
					overPlate = plate
				}
		}
		const cells = Int32Array.from(acc.keys()).sort()
		into.push({
			kind,
			plateA: front.pa,
			plateB: front.pb,
			id: front.id,
			cells,
			cellClosingCmYr: Float32Array.from(
				cells,
				(c) => acc.get(c)![0] / acc.get(c)![2],
			),
			cellAlongCmYr: Float32Array.from(
				cells,
				(c) => acc.get(c)![1] / acc.get(c)![2],
			),
			overPlate,
			rateCmYr: closing / front.edges.length,
			activeMyr: front.activeMyr,
		})
	}
}

function anyBits({ sample, field }: GatherParams<Uint32Array>): Uint32Array {
	const out = new Uint32Array(sample.regionOfCell.length)
	for (let r = 0; r < sample.cellOfRegion.length; r++)
		out[sample.cellOfRegion[r]] |= field[r]
	return out
}

function sampleFronts({
	sample,
	fronts,
	minCells,
}: SampleFrontsParams): SimFront[] {
	const out: SimFront[] = []
	const common = { into: out, sample, fronts, minCells }
	pushFronts({ ...common, kind: "ridge", list: fronts.ridge })
	pushFronts({ ...common, kind: "rift", list: fronts.rift })
	pushFronts({ ...common, kind: "subduction", list: fronts.subduction })
	pushFronts({ ...common, kind: "collision", list: fronts.collision })
	pushFronts({ ...common, kind: "transform", list: fronts.transform })
	return out
}

export const WORLD_SAMPLE = { build, gather, anyBits, sampleFronts }
