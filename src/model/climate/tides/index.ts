import type { SphereMesh } from "@/model/mesh/types"

function computeCoastalMask(args: {
	mesh: SphereMesh
	isLand: Uint8Array
}): Uint8Array {
	const { mesh, isLand } = args
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const coastal = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (!isLand[adjList[j]]) {
				coastal[r] = 1
				break
			}
		}
	}
	return coastal
}

export const TIDES = {
	computeCoastalMask,
}
