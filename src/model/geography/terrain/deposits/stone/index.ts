import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import type {
	AccessParams,
	ClayParams,
	SandParams,
	StoneRichnessParams,
} from "@/model/geography/terrain/deposits/stone/types"
import { MATH } from "@/model/shared/math/core"

const C = DEPOSIT_CONFIG
const BS = C.buildingStone

function access({ young, hills, deepRed, glaciated }: AccessParams): number {
	return Math.min(
		1,
		(young ? 0 : 1) *
			(BS.plainAccess + (1 - BS.plainAccess) * hills) *
			(1 - BS.weatheredLoss * deepRed * (1 - hills)) *
			(glaciated ? BS.scouredGain : 1),
	)
}

function richness({
	share,
	access: got,
	quarry: q,
}: StoneRichnessParams): number {
	return Math.min(1, BS.gain * share * got * q)
}

function quarry(district: number): number {
	return 1 - BS.quarry + BS.quarry * district
}

function clay({ host, hills, variety }: ClayParams): number {
	return Math.min(
		1,
		BS.clayGain *
			host *
			(BS.clayHills + (1 - BS.clayHills) * (1 - hills)) *
			(1 - BS.clayVariety + BS.clayVariety * variety),
	)
}

function sand({
	erg,
	coastal,
	sandPercent,
	glaciated,
	variety,
}: SandParams): number {
	if (glaciated) return 0
	const beach = coastal
		? C.sandBeach * MATH.ramp({ range: C.sandCoast, x: sandPercent })
		: 0
	const [floor, peak] = C.sandErg
	return Math.max(erg ? floor + (peak - floor) * variety : 0, beach)
}

export const STONE = { access, richness, quarry, clay, sand }
