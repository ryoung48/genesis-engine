import type { ApplyWavesParams } from "@/ui/genesis/shared/colors/types"

const WAVE_CONTOURS_KM = [20, 50, 110, 250, 380]

const WAVE_DEEP_FACTOR = [0.33, 0.54, 0.81]

export function applyWaves({
	rgb,
	isLand,
	distCoast,
}: ApplyWavesParams): Float32Array {
	const out = new Float32Array(rgb)
	const bandCount = WAVE_CONTOURS_KM.length
	for (let r = 0; r < isLand.length; r++) {
		if (isLand[r]) continue
		let band = 0
		while (band < bandCount && distCoast[r] > WAVE_CONTOURS_KM[band]) band++
		const t = band / bandCount
		for (let c = 0; c < 3; c++) {
			out[3 * r + c] *= 1 + (WAVE_DEEP_FACTOR[c] - 1) * t
		}
	}
	return out
}
