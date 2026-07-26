import type { SphereMesh } from ".."
import { piecewise, SimplexNoise } from "../shared"

export const ceilingScale = (x: number) =>
	piecewise(
		[-14, -8, 2, 12, 18, 40, 60, 90],
		[40, 62, 83, 125, 165, 300, 150, 0],
		x,
	)

export function getPressureRainFactor(pressure: number | undefined): number {
	return Math.pow(1 / (pressure ?? 1.0), 0.4)
}

export function buildRegionGraph(mesh: SphereMesh, mask: Uint8Array) {
	const { adjOffset, adjList } = mesh
	const landRegions: number[] = []
	for (let r = 0; r < mesh.numRegions; r++) {
		if (mask[r]) landRegions.push(r)
	}

	const landNeighborOffset = new Int32Array(landRegions.length + 1)
	let landNeighborCount = 0
	for (let i = 0; i < landRegions.length; i++) {
		const r = landRegions[i]
		landNeighborOffset[i] = landNeighborCount
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (mask[adjList[j]]) landNeighborCount++
		}
	}
	landNeighborOffset[landRegions.length] = landNeighborCount

	const landNeighborList = new Int32Array(landNeighborCount)
	let landNeighborIndex = 0
	for (let i = 0; i < landRegions.length; i++) {
		const r = landRegions[i]
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (mask[nb]) landNeighborList[landNeighborIndex++] = nb
		}
	}

	return { landRegions, landNeighborOffset, landNeighborList }
}

export function computeRainBandWarpField(
	mesh: SphereMesh,
	seed: number,
	amplitudeDeg: number,
	regions?: ArrayLike<number>,
): Float32Array {
	const N = mesh.numRegions
	const warpXNoise = new SimplexNoise(seed + 4011)
	const warpYNoise = new SimplexNoise(seed + 4012)
	const warpZNoise = new SimplexNoise(seed + 4013)
	const bandNoise = new SimplexNoise(seed + 4014)
	const detailNoise = new SimplexNoise(seed + 4015)
	const warp = new Float32Array(N)
	const regionCount = regions?.length ?? N

	for (let i = 0; i < regionCount; i++) {
		const r = regions ? regions[i] : i
		const x = mesh.r_xyz[3 * r]
		const y = mesh.r_xyz[3 * r + 1]
		const z = mesh.r_xyz[3 * r + 2]

		const dx = warpXNoise.fbm(
			x * 1.25 + 17.3,
			y * 1.25 + 9.1,
			z * 1.25 + 23.7,
			3,
			0.55,
		)
		const dy = warpYNoise.fbm(
			x * 1.25 + 31.9,
			y * 1.25 + 14.7,
			z * 1.25 + 5.3,
			3,
			0.55,
		)
		const dz = warpZNoise.fbm(
			x * 1.25 + 7.1,
			y * 1.25 + 28.4,
			z * 1.25 + 12.9,
			3,
			0.55,
		)
		const wx = x + dx * 0.3
		const wy = y + dy * 0.3
		const wz = z + dz * 0.3

		const broad = bandNoise.fbm(wx * 1.8, wy * 1.8, wz * 1.8, 4, 0.55)
		const detail = detailNoise.fbm(
			wx * 5.0 + 43.1,
			wy * 5.0 + 18.7,
			wz * 5.0 + 29.4,
			3,
			0.5,
		)
		warp[r] = (broad * 0.72 + detail * 0.28) * amplitudeDeg
	}

	return warp
}
