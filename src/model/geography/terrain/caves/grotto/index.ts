import type { GrottoPotentialParams } from "@/model/geography/terrain/caves/grotto/types"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { KARST } from "@/model/geography/terrain/karst"

function potential({
	kind,
	solution,
	spring,
}: GrottoPotentialParams): Float32Array {
	const out = new Float32Array(kind.length)
	for (let r = 0; r < kind.length; r++)
		if (
			kind[r] === KARST.kindCode.carbonate &&
			spring[r] === SPRINGS.code.karst
		)
			out[r] = solution[r]
	return out
}

export const GROTTO_CAVE = { potential }
