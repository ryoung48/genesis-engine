import { OASES } from "@/model/geography/terrain/groundwater/oases"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import type { DotSymbolData } from "@/ui/genesis/renderer/types"
import { WATER_DOT_KEYS } from "@/ui/genesis/shared/region-colors/palette"

function keyIndex(key: (typeof WATER_DOT_KEYS)[number]): number {
	return WATER_DOT_KEYS.indexOf(key)
}

export function buildWaterSymbolData({
	r_xyz,
	spring,
	oasis,
	isLand,
}: {
	r_xyz: Float32Array
	spring: Uint8Array
	oasis: Uint8Array
	isLand: Uint8Array
}): DotSymbolData {
	const key: number[] = []
	const side: number[] = []
	const positions: number[] = []
	const push = ({
		region,
		dot,
		offset,
	}: {
		region: number
		dot: (typeof WATER_DOT_KEYS)[number]
		offset: number
	}) => {
		positions.push(
			r_xyz[3 * region],
			r_xyz[3 * region + 1],
			r_xyz[3 * region + 2],
		)
		key.push(keyIndex(dot))
		side.push(offset)
	}
	for (let r = 0; r < isLand.length; r++) {
		if (!isLand[r]) continue
		const springKind = SPRINGS.kinds[spring[r]]
		const oasisKind = OASES.kinds[oasis[r]]
		const hasSpring = springKind !== "none"
		const hasOasis = oasisKind !== "none"
		if (hasSpring)
			push({ region: r, dot: springKind, offset: hasOasis ? -1 : 0 })
		if (hasOasis) push({ region: r, dot: oasisKind, offset: hasSpring ? 1 : 0 })
	}
	return {
		r_xyz: Float32Array.from(positions),
		key: Uint8Array.from(key),
		side: Int8Array.from(side),
	}
}
