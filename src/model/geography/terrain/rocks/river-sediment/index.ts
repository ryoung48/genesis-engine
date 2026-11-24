import type {
	PlainEdgesParams,
	RiverSedimentMask,
	RiverSedimentParams,
} from "@/model/geography/terrain/rocks/river-sediment/types"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MATH } from "@/model/shared/math/core"
import { SPREAD } from "@/model/shared/spread"

const C = SURFACE_CONFIG

function plainEdges({ sedimentKm, isLand }: PlainEdgesParams): {
	low: number
	high: number
} {
	const land: number[] = []
	for (let r = 0; r < sedimentKm.length; r++)
		if (isLand[r]) land.push(sedimentKm[r])
	land.sort((a, b) => a - b)
	const at = (p: number) =>
		land[
			Math.max(0, Math.min(land.length - 1, Math.round(p * (land.length - 1))))
		] ?? 0
	const low = Math.max(C.alluviumKm[0], at(1 - C.plainsShare - C.plainsBand))
	const high = Math.max(
		low + 1e-4,
		C.alluviumKm[0] * 2,
		at(1 - C.plainsShare + C.plainsBand),
	)
	return { low, high }
}

function mask({
	mesh,
	planetRadiusKm,
	isLand,
	sedimentKm,
	discharge,
	elevationKm,
}: RiverSedimentParams): RiverSedimentMask {
	const n = mesh.numRegions
	const edges = plainEdges({ sedimentKm, isLand })
	const river = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!isLand[r]) continue
		river[r] = MATH.ramp({ range: [edges.low, edges.high], x: sedimentKm[r] })
	}
	const [qMin, qRef] = C.floodplainQ
	const [reachMin, reachRef, reachMax] = C.floodplainKm
	const [handFull, handNone] = C.floodplainHandKm
	const dist = new Float64Array(n).fill(Infinity)
	const base = new Float32Array(n)
	const reach = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!isLand[r] || discharge[r] < qMin) continue
		dist[r] = 0
		base[r] = elevationKm[r]
		reach[r] = Math.min(
			reachMax,
			Math.max(
				reachMin,
				reachRef * (discharge[r] / qRef) ** C.floodplainExponent,
			),
		)
	}
	const cellKm = Math.sqrt((4 * Math.PI * planetRadiusKm * planetRadiusKm) / n)
	SPREAD.km({
		mesh,
		radiusKm: planetRadiusKm,
		dist,
		maxKm: reachMax + cellKm,
		canEnter: ({ from, to }) =>
			isLand[to] === 1 && elevationKm[to] - base[from] < handNone,
		onReach: ({ from, to }) => {
			base[to] = base[from]
			reach[to] = reach[from]
		},
	})
	for (let r = 0; r < n; r++) {
		if (!(dist[r] <= reach[r] + 0.5 * cellKm)) continue
		const part =
			dist[r] === 0
				? Math.min(1, (2 * reach[r]) / cellKm)
				: MATH.clamp01((reach[r] - dist[r]) / cellKm + 0.5)
		if (part < C.floodplainPart) continue
		const level = MATH.smoothstep({
			edge0: handNone,
			edge1: handFull,
			x: elevationKm[r] - base[r],
		})
		river[r] = Math.max(river[r], level)
	}
	return { river, plainLowKm: edges.low, plainHighKm: edges.high }
}

export const RIVER_SEDIMENT = { mask }
