import { KOPPEN } from "@/model/climate/classification/koppen"
import type {
	NeighbourAverageParams,
	SandSeaParams,
} from "@/model/geography/terrain/rocks/sand-sea/types"
import { SURFACE_CONFIG } from "@/model/geography/terrain/surface-config"
import { MATH } from "@/model/shared/math/core"

const C = SURFACE_CONFIG
const DESERT_WEIGHT = new Map<number, number>(
	(Object.keys(C.sandDesert) as Array<keyof typeof C.sandDesert>).map(
		(label) => [KOPPEN.koppenLabels.indexOf(label), C.sandDesert[label]],
	),
)

function neighbourAverage({
	mesh,
	field,
	include,
	passes,
}: NeighbourAverageParams): Float32Array {
	const { adjOffset, adjList, numRegions: n } = mesh
	let current = Float32Array.from(field)
	for (let pass = 0; pass < passes; pass++) {
		const next = Float32Array.from(current)
		for (let r = 0; r < n; r++) {
			if (!include[r]) continue
			let sum = current[r]
			let count = 1
			for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
				const nb = adjList[k]
				if (!include[nb]) continue
				sum += current[nb]
				count++
			}
			next[r] = sum / count
		}
		current = next
	}
	return current
}

function extent({
	mesh,
	planetRadiusKm,
	isLand,
	koppen,
	elevationKm,
}: SandSeaParams): Float32Array {
	const { adjOffset, adjList, r_xyz, numRegions: n } = mesh
	const cellKm = Math.sqrt((4 * Math.PI * planetRadiusKm * planetRadiusKm) / n)
	const passesFor = (km: number) => Math.max(1, Math.round(km / cellKm))
	const desert = new Float32Array(n)
	const slope = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!isLand[r]) continue
		desert[r] = DESERT_WEIGHT.get(koppen[r]) ?? 0
		if (!desert[r]) continue
		let steepest = 0
		for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
			const nb = adjList[k]
			const dot =
				r_xyz[3 * r] * r_xyz[3 * nb] +
				r_xyz[3 * r + 1] * r_xyz[3 * nb + 1] +
				r_xyz[3 * r + 2] * r_xyz[3 * nb + 2]
			const km =
				Math.acos(Math.max(-1, Math.min(1, dot))) * planetRadiusKm || cellKm
			steepest = Math.max(
				steepest,
				Math.abs(elevationKm[nb] - elevationKm[r]) / km,
			)
		}
		slope[r] = steepest
	}
	const around = neighbourAverage({
		mesh,
		field: elevationKm,
		include: isLand,
		passes: passesFor(C.sandAroundKm),
	})
	const raw = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!desert[r]) continue
		raw[r] =
			desert[r] *
			MATH.smoothstep({
				edge0: 1.5 * C.sandSlope,
				edge1: 0.5 * C.sandSlope,
				x: slope[r],
			}) *
			MATH.smoothstep({
				edge0: 0.2 * C.sandBelowKm,
				edge1: 1.5 * C.sandBelowKm,
				x: around[r] - elevationKm[r],
			})
	}
	const sea = neighbourAverage({
		mesh,
		field: raw,
		include: isLand,
		passes: passesFor(C.sandExtentKm),
	})
	const out = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!desert[r]) continue
		out[r] =
			MATH.ramp({ range: C.sandExtent, x: sea[r] }) *
			(desert[r] > 0.5 ? 1 : desert[r])
	}
	return out
}

export const SAND_SEA = { extent }
