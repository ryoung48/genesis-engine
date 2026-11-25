import type {
	ReliefClassParams,
	ShoreRelief,
	ShoreReliefParams,
} from "@/model/geography/terrain/shore/relief/types"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"

const C = SHORE_CONFIG
const M_PER_KM = 1000

const kinds: readonly ShoreRelief[] = ["none", "low", "sloping", "steep"]

const code = Object.fromEntries(kinds.map((kind, i) => [kind, i])) as Record<
	ShoreRelief,
	number
>

function codeOf({ gradientMPerKm }: ReliefClassParams): number {
	if (gradientMPerKm < C.reliefLowMPerKm) return code.low
	return gradientMPerKm < C.reliefSteepMPerKm ? code.sloping : code.steep
}

function classify({
	mesh,
	elevationKm,
	isLand,
	openWater,
	coastal,
	planetRadiusKm,
}: ShoreReliefParams): Uint8Array {
	const { adjOffset, adjList, neighborDist } = mesh
	const out = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (!coastal[r]) continue
		const heightM = Math.max(0, elevationKm[r]) * M_PER_KM
		let seaEdgeKm = Infinity
		let gradient = 0
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			const neighbor = adjList[j]
			const edgeKm = neighborDist[j] * planetRadiusKm
			if (openWater[neighbor]) {
				seaEdgeKm = Math.min(seaEdgeKm, edgeKm)
			} else if (isLand[neighbor]) {
				const rise =
					(Math.max(0, elevationKm[neighbor]) - Math.max(0, elevationKm[r])) *
					M_PER_KM
				gradient = Math.max(gradient, rise / edgeKm)
			}
		}
		gradient = Math.max(gradient, heightM / (seaEdgeKm / 2))
		out[r] = codeOf({ gradientMPerKm: gradient })
	}
	return out
}

export const SHORE_RELIEF = { kinds, code, codeOf, classify }
