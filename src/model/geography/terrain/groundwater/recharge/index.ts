import type {
	RechargeFractionParams,
	RechargeLayer,
	RechargeParams,
} from "@/model/geography/terrain/groundwater/recharge/types"
import { ROCK_KEY } from "@/model/geography/terrain/groundwater/rock-key"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { MATH } from "@/model/shared/math/core"

const C = GROUNDWATER_CONFIG
const MM_PER_M = 1000

function permafrost(meanC: number): number {
	return MATH.smoothstep({ edge0: -1, edge1: -8, x: meanC })
}

function dissolving({ rain, mean }: { rain: number; mean: number }): number {
	return (
		MATH.ramp({ range: C.solubleRainMm, x: rain }) *
		MATH.ramp({ range: C.solubleTempC, x: mean })
	)
}

function rechargeMmOf({
	runoffMm,
	logK,
	infiltration,
	slope,
	permafrost: frozen,
}: RechargeFractionParams): number {
	const permeability =
		C.rechMin + C.rechSpan * MATH.ramp({ range: C.permRange, x: logK })
	const soil = C.soilBase + (1 - C.soilBase) * infiltration
	return (
		(runoffMm * permeability * soil * (1 - C.frostCut * frozen)) /
		(1 + slope / C.slopeHalf)
	)
}

function perRegion({
	keyCode,
	runoffMm,
	infiltration,
	slope,
	climate,
	active,
	secondsPerYear,
}: RechargeParams): RechargeLayer {
	const n = keyCode.length
	const logK = new Float32Array(n)
	const dissolved = new Float32Array(n)
	const rechargeMm = new Float32Array(n)
	const rechargeMs = new Float64Array(n)
	const base = ROCK_KEY.table({ values: C.logK })
	const limestone = ROCK_KEY.keys.indexOf("limestone")
	for (let r = 0; r < n; r++) {
		if (!active[r]) continue
		const code = keyCode[r]
		let k = base[code]
		if (code === limestone) {
			dissolved[r] = dissolving({
				rain: climate.rain[r],
				mean: climate.mean[r],
			})
			k += C.karstLogK * dissolved[r]
		}
		logK[r] = k
		rechargeMm[r] = rechargeMmOf({
			runoffMm: runoffMm[r],
			logK: k,
			infiltration: infiltration[r],
			slope: slope[r],
			permafrost: permafrost(climate.mean[r]),
		})
		rechargeMs[r] = rechargeMm[r] / MM_PER_M / secondsPerYear
	}
	return { logK, dissolving: dissolved, rechargeMm, rechargeMs }
}

export const RECHARGE = { permafrost, dissolving, rechargeMmOf, perRegion }
