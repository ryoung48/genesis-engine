import type { GlacialTillParams } from "@/model/geography/terrain/rocks/glacial/types"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MATH } from "@/model/shared/math/core"
import { SPREAD } from "@/model/shared/spread"

const C = SURFACE_CONFIG

function till({
	mesh,
	planetRadiusKm,
	isLand,
	glaciated,
	pastIce,
	morainesKm,
}: GlacialTillParams): Float32Array {
	const { adjOffset, adjList, numRegions: n } = mesh
	const past = new Float64Array(n).fill(Infinity)
	const drift = new Uint8Array(n)
	const ice = (r: number) => glaciated[r] === 1 || pastIce[r] === 1
	for (let r = 0; r < n; r++) {
		if (!isLand[r] || glaciated[r]) continue
		if (pastIce[r]) {
			past[r] = 0
			drift[r] = 1
			continue
		}
		for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++)
			if (ice(adjList[k])) {
				past[r] = 0
				break
			}
	}
	SPREAD.km({
		mesh,
		radiusKm: planetRadiusKm,
		dist: past,
		maxKm: C.outwashKm,
		canEnter: ({ to }) => isLand[to] === 1 && !ice(to),
		onReach: () => undefined,
	})
	const out = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (drift[r]) {
			out[r] = 1
			continue
		}
		if (!(past[r] < C.outwashKm)) continue
		out[r] = MATH.clamp01(
			Math.max(1 - past[r] / C.outwashKm, morainesKm[r] / C.moraineKm),
		)
	}
	return out
}

export const GLACIAL = { till }
