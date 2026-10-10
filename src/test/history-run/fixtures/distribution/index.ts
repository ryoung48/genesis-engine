import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"
import type { GenesisProvinces } from "@/model/society/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { FixtureParams } from "@/test/history-run/fixtures/distribution/types"

function world({
	neighbors,
	desolate,
	seed,
}: FixtureParams): SerializedGenesisWorld {
	const count = neighbors.length,
		adjOffset = new Int32Array(count + 1),
		adjList = Int32Array.from(neighbors.flat())
	for (let i = 0; i < count; i++)
		adjOffset[i + 1] = adjOffset[i] + neighbors[i].length
	const indices = Int32Array.from({ length: count }, (_, i) => i)
	const provinces: GenesisProvinces = {
		count,
		seeds: indices,
		regionProvince: indices,
		desolate: Uint8Array.from({ length: count }, (_, i) =>
			desolate.includes(i) ? 1 : 0,
		),
		landmassId: new Int32Array(count),
		adjOffset,
		adjList,
		size: new Int32Array(count).fill(1),
		colors: new Float32Array(count * 3),
		waterAccess: new Uint8Array(count),
		riverAccess: new Uint8Array(count),
		lakeAccess: new Uint8Array(count),
	}
	const r_xyz = Float32Array.from({ length: count * 3 }, (_, i) =>
		i % 3 === 0 ? 1 : 0,
	)
	const { nations } = DISTRIBUTION_TERRITORY.place({
		provinces,
		habitability: new Float32Array(count).fill(1),
		waterAccess: provinces.waterAccess,
		provinceContinent: undefined,
		migrationWave: undefined,
		r_xyz,
		seed,
	})
	return {
		params: { seed, historyPipeline: "distribution" },
		provinces,
		nations,
		mesh: { r_xyz },
	} as unknown as SerializedGenesisWorld
}
export const DISTRIBUTION_FIXTURE = { world }
