import type { SstNoiseParams } from "@/model/climatev2/sst-noise/types"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"

const SCALE = 0.24
const AMPLITUDE_C = 2
const RAD = Math.PI / 180

function field({ grid, seed }: SstNoiseParams): Float32Array {
	const noise = new SimplexNoise(seed ^ 0x5ea1ce)
	const out = new Float32Array(grid.size)
	for (let j = 0; j < grid.h; j++) {
		const lat = grid.lat[j] * RAD
		for (let i = 0; i < grid.w; i++) {
			const lon = grid.lon[i] * RAD
			out[j * grid.w + i] =
				AMPLITUDE_C *
				noise.noise3D(
					(Math.cos(lat) * Math.cos(lon)) / SCALE,
					(Math.cos(lat) * Math.sin(lon)) / SCALE,
					Math.sin(lat) / SCALE,
				)
		}
	}
	return out
}

export const SST_NOISE = { field }
