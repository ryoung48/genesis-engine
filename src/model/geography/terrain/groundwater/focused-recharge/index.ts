import type {
	ChannelBand,
	ChannelBandParams,
	ValleyWidthParams,
} from "@/model/geography/terrain/groundwater/focused-recharge/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { MATH } from "@/model/shared/math/core"

const C = GROUNDWATER_CONFIG
const MONTHS = 12
const KM_TO_M = 1000
const MM_PER_M = 1000

function valleyWidthM({ flowM3s }: ValleyWidthParams): number {
	return (
		MATH.clamp({
			value: C.floodWidthKm * Math.sqrt(flowM3s / 1000),
			lo: C.floodWidthMinKm,
			hi: C.floodWidthMaxKm,
		}) * KM_TO_M
	)
}

function channelWidthM({ flowM3s }: ValleyWidthParams): number {
	return C.hgWidthA * Math.sqrt(flowM3s)
}

function perRegion({
	flowMonthly,
	flowAnnual,
	areaM2,
	widthM,
	pet,
	rain,
	dry,
	secondsPerYear,
}: ChannelBandParams): ChannelBand {
	const n = flowAnnual.length
	const channelM3s = new Float32Array(n)
	const valleyShare = new Float32Array(n)
	const sustainedBand = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!dry[r] || flowAnnual[r] <= 0) continue
		let loss = 0
		for (let m = 0; m < MONTHS; m++) {
			const q = flowMonthly[m * n + r]
			loss += Math.min(q, channelWidthM({ flowM3s: q }) * widthM[r] * C.kBed)
		}
		const channel = loss / MONTHS
		channelM3s[r] = channel
		const share = Math.min(
			C.fVMax,
			valleyWidthM({ flowM3s: flowAnnual[r] }) / widthM[r],
		)
		valleyShare[r] = share
		const demand =
			(share * areaM2[r] * Math.max(0, pet[r] - rain[r])) /
			MM_PER_M /
			secondsPerYear
		const supplied =
			demand > 0 ? Math.min(1, channel / demand) : channel > 0 ? 1 : 0
		sustainedBand[r] = share * supplied
	}
	return { channelM3s, valleyShare, sustainedBand }
}

export const FOCUSED_RECHARGE = { valleyWidthM, channelWidthM, perRegion }
