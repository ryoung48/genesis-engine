import type {
	TransmissivityAtParams,
	TransmissivityParams,
} from "@/model/geography/terrain/groundwater/transmissivity/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG

function frostFactor(coldest: number): number {
	if (coldest > -5) return 1
	if (coldest > -14) return Math.min(1, 1.5 + 0.1 * coldest)
	return Math.max(0.05, 0.17 + 0.005 * coldest)
}

function at({
	logK,
	ksMs,
	soilDepthM,
	slope,
	coldest,
}: TransmissivityAtParams): number {
	const efold = Math.max(C.efoldMinM, C.efoldM / (1 + C.efoldSlope * slope))
	return (
		(ksMs * soilDepthM + 10 ** logK * C.rhoGOverMu * efold) *
		frostFactor(coldest)
	)
}

function perRegion({
	logK,
	ksMs,
	soilDepthM,
	slope,
	coldest,
	active,
}: TransmissivityParams): Float64Array {
	const out = new Float64Array(logK.length)
	for (let r = 0; r < logK.length; r++) {
		if (!active[r]) continue
		out[r] = at({
			logK: logK[r],
			ksMs: ksMs[r],
			soilDepthM: soilDepthM[r],
			slope: slope[r],
			coldest: coldest[r],
		})
	}
	return out
}

export const TRANSMISSIVITY = { frostFactor, at, perRegion }
