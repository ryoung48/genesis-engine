import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import type {
	KarstActivity,
	KarstClassifyParams,
	KarstKind,
	KarstKindOfParams,
	KarstKindResult,
	KarstLayers,
} from "@/model/geography/terrain/karst/types"
import { KARST_CONFIG } from "@/model/geography/terrain/karst-config"
import { ROCKS } from "@/model/geography/terrain/rocks"
import { MATH } from "@/model/shared/math/core"

const C = KARST_CONFIG

function carbonateWater({
	rain,
	mean,
}: {
	rain: number
	mean: number
}): number {
	return (
		MATH.ramp({ range: C.carbonateRainMm, x: rain }) *
		MATH.ramp({ range: GROUNDWATER_CONFIG.solubleTempC, x: mean })
	)
}

const kinds: readonly KarstKind[] = [
	"none",
	"carbonate",
	"coveredCarbonate",
	"evaporite",
]

const kindCode = Object.fromEntries(
	kinds.map((kind, i) => [kind, i]),
) as Record<KarstKind, number>

const activities: readonly KarstActivity[] = [
	"none",
	"relict",
	"active",
	"spring",
]

const activityCode = Object.fromEntries(
	activities.map((kind, i) => [kind, i]),
) as Record<KarstActivity, number>

function kindOf({ rock, bedrock }: KarstKindOfParams): KarstKindResult {
	const young = ROCKS.code.young
	if (rock === ROCKS.code.limestone)
		return { kind: kindCode.carbonate, covered: false }
	if (rock === ROCKS.code.salt)
		return { kind: kindCode.evaporite, covered: false }
	if (rock !== young) return { kind: kindCode.none, covered: false }
	if (bedrock === ROCKS.code.limestone)
		return { kind: kindCode.coveredCarbonate, covered: true }
	if (bedrock === ROCKS.code.salt)
		return { kind: kindCode.evaporite, covered: true }
	return { kind: kindCode.none, covered: false }
}

function classify({
	numRegions,
	isLand,
	iced,
	rock,
	bedrock,
	rain,
	mean,
	spring,
}: KarstClassifyParams): KarstLayers {
	const kind = new Uint8Array(numRegions)
	const potential = new Float32Array(numRegions)
	const activity = new Uint8Array(numRegions)
	const water = new Float32Array(numRegions)
	for (let r = 0; r < numRegions; r++) {
		if (!isLand[r] || iced[r]) continue
		const found = kindOf({ rock: rock[r], bedrock: bedrock[r] })
		if (found.kind === kindCode.none) continue
		kind[r] = found.kind
		const wet =
			found.kind === kindCode.evaporite
				? MATH.ramp({ range: C.evapRainMm, x: rain[r] })
				: carbonateWater({ rain: rain[r], mean: mean[r] })
		water[r] = wet
		const rockTerm = found.covered ? C.coverFactor : 1
		potential[r] = rockTerm * (C.relictFloor + (1 - C.relictFloor) * wet)
		if (spring[r] === SPRINGS.code.karst) activity[r] = activityCode.spring
		else if (wet >= C.activeWater) activity[r] = activityCode.active
		else activity[r] = activityCode.relict
	}
	return { kind, potential, activity, water }
}

export const KARST = { kinds, kindCode, activities, activityCode, classify }
