import { RAIN } from "@/model/climate/precipitation/rain"
import type {
	BalancedWind,
	BalanceParams,
	MeshGradient,
	MeshGradientParams,
} from "@/model/climate/weather/wind/surface-balance/types"

// Per-radian (east, north) gradient of a mesh field from neighbour
// differences.
function meshGradient({ mesh, field }: MeshGradientParams): MeshGradient {
	const N = mesh.numRegions
	const { adjOffset, adjList, neighborDist } = mesh
	const { edgeEastward, edgeNorthward } = RAIN.getClimateGeometry(mesh)
	const east = new Float32Array(N)
	const north = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		let sumEast = 0
		let sumNorth = 0
		let count = 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const dist = Math.max(neighborDist[j], 1e-6)
			const slope = (field[adjList[j]] - field[r]) / dist
			sumEast += slope * edgeEastward[j]
			sumNorth += slope * edgeNorthward[j]
			count++
		}
		if (count > 0) {
			east[r] = sumEast / count
			north[r] = sumNorth / count
		}
	}
	return { east, north }
}

// Steady boundary-layer balance: friction*V + f k×V = F. Friction turns the
// flow across isobars toward low pressure, Coriolis turns it along them; the
// cross-isobar angle is atan(friction/f).
function balance({
	friction,
	coriolis,
	forceEast,
	forceNorth,
}: BalanceParams): BalancedWind {
	const denom = friction * friction + coriolis * coriolis
	return {
		u: (friction * forceEast + coriolis * forceNorth) / denom,
		v: (friction * forceNorth - coriolis * forceEast) / denom,
	}
}

export const SURFACE_BALANCE = {
	meshGradient,
	balance,
}
