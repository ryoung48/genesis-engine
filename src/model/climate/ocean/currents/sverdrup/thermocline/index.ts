import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import type { ThermoclineDepthParams } from "@/model/climate/ocean/currents/sverdrup/thermocline/types"

const W = SVERDRUP_RASTER.width
const H = SVERDRUP_RASTER.height
const CELLS = W * H
const DEG2RAD = Math.PI / 180

// Reduced-gravity upper layer: the wind-driven gyre rides on a warm layer
// over a motionless abyss, and the Sverdrup transport is carried inside it.
// h^2 = h_east^2 + 2 f psi / g' makes the layer deep in the middle of a
// subtropical gyre and shallow at eastern walls and in subpolar gyres.
const EASTERN_DEPTH_M = 100
const MIN_DEPTH_M = 30
const MAX_DEPTH_M = 900
const REDUCED_GRAVITY_M_S2 = 0.02

function depth({ interior, ocean, planet }: ThermoclineDepthParams) {
	const out = new Float32Array(CELLS)
	for (let j = 0; j < H; j++) {
		const f =
			planet.coriolisSign *
			2 *
			planet.rotationRateRadS *
			Math.sin((j - 90) * DEG2RAD)
		for (let i = 0; i < W; i++) {
			const idx = j * W + i
			if (!ocean[idx]) continue
			const squared =
				EASTERN_DEPTH_M ** 2 + (2 * f * interior[idx]) / REDUCED_GRAVITY_M_S2
			out[idx] = Math.min(
				MAX_DEPTH_M,
				Math.sqrt(Math.max(MIN_DEPTH_M ** 2, squared)),
			)
		}
	}
	return out
}

export const THERMOCLINE = {
	depth,
	easternDepthM: EASTERN_DEPTH_M,
}
