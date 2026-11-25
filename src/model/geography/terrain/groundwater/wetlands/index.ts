import { FOCUSED_RECHARGE } from "@/model/geography/terrain/groundwater/focused-recharge"
import type { WetlandKind } from "@/model/geography/terrain/groundwater/types"
import type {
	CombineParams,
	WetlandCauses,
	WetlandKindParams,
	WetlandLayer,
	WetlandsParams,
} from "@/model/geography/terrain/groundwater/wetlands/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { MATH } from "@/model/shared/math/core"

const C = GROUNDWATER_CONFIG
const BYTE = 255
const SURFACE_CLASS = C.depthClassesM.indexOf(C.wetDepthM)

const kinds: readonly WetlandKind[] = [
	"none",
	"mangrove",
	"coastalSaltMarsh",
	"inlandSaltMarsh",
	"floodplain",
	"peatBog",
	"wetMeadow",
	"marsh",
	"swampForest",
	"forestedPeatland",
]

const code = Object.fromEntries(kinds.map((kind, i) => [kind, i])) as Record<
	WetlandKind,
	number
>

function combine({ causes }: CombineParams): number {
	const share =
		1 -
		(1 - causes.groundwater) *
			(1 - causes.floodplain) *
			(1 - causes.coast) *
			(1 - causes.lake)
	const capped = Math.min(C.wetCap, share)
	return capped < C.wetMin ? 0 : capped
}

function largest(causes: WetlandCauses): keyof WetlandCauses {
	let best: keyof WetlandCauses = "groundwater"
	for (const key of ["floodplain", "coast", "lake"] as const)
		if (causes[key] > causes[best]) best = key
	return best
}

function kindOf({
	causes,
	wetIndex,
	mean,
	coldest,
	warmest,
	seepShare,
	saltShore,
	forested,
}: WetlandKindParams): WetlandKind {
	const dominant = largest(causes)
	let base: WetlandKind
	if (dominant === "coast" && causes.coast > 0)
		base = coldest >= C.mangroveColdC ? "mangrove" : "coastalSaltMarsh"
	else if (
		(causes.lake > 0 && saltShore) ||
		(wetIndex < C.inlandSaltWet && seepShare > 0)
	)
		base = "inlandSaltMarsh"
	else if (dominant === "floodplain" && causes.floodplain > 0)
		base = "floodplain"
	else if (mean < C.peatWarmC && wetIndex >= C.peatWet) base = "peatBog"
	else if (wetIndex >= C.meadowWet[0] && wetIndex < C.meadowWet[1])
		base = "wetMeadow"
	else base = "marsh"
	const woods =
		forested &&
		warmest >= C.forestWarmC &&
		wetIndex >= C.peatWet &&
		mean > C.forestMeanC
	if (!woods) return base
	if (base === "peatBog") return "forestedPeatland"
	if (base === "marsh" || base === "wetMeadow" || base === "floodplain")
		return "swampForest"
	return base
}

function classify({
	shallowShare,
	flow,
	widthM,
	slope,
	tidalRange,
	touchesSea,
	touchesLake,
	touchesSalt,
	seepShare,
	wetIndex,
	mean,
	coldest,
	warmest,
	forested,
	active,
}: WetlandsParams): WetlandLayer {
	const n = flow.length
	const share = new Float32Array(n)
	const kind = new Uint8Array(n)
	const coastFlag = new Uint8Array(n)
	const wetGw = new Float32Array(n)
	const wetFlood = new Float32Array(n)
	const wetCoast = new Float32Array(n)
	const wetLake = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!active[r]) continue
		const gradient = Math.max(slope[r], C.shoreSlopeMin)
		const causes: WetlandCauses = {
			groundwater:
				shallowShare[r * C.depthClassesM.length + SURFACE_CLASS] / BYTE,
			floodplain:
				flow[r] >= C.floodM3s
					? Math.min(
							C.floodMaxShare,
							FOCUSED_RECHARGE.valleyWidthM({ flowM3s: flow[r] }) / widthM[r],
						) *
						MATH.smoothstep({
							edge0: C.floodSlope[0],
							edge1: C.floodSlope[1],
							x: slope[r],
						})
					: 0,
			coast: touchesSea[r]
				? Math.min(1, (C.coastSurgeM + tidalRange[r]) / (gradient * widthM[r]))
				: 0,
			lake: touchesLake[r] ? Math.min(1, C.lakeHM / (gradient * widthM[r])) : 0,
		}
		wetGw[r] = causes.groundwater
		wetFlood[r] = causes.floodplain
		wetCoast[r] = causes.coast
		wetLake[r] = causes.lake
		share[r] = combine({ causes })
		if (share[r] === 0) continue
		const wetKind = kindOf({
			causes,
			wetIndex: wetIndex[r],
			mean: mean[r],
			coldest: coldest[r],
			warmest: warmest[r],
			seepShare: seepShare[r],
			saltShore: touchesSalt[r] === 1,
			forested: forested[r] === 1,
		})
		kind[r] = code[wetKind]
		coastFlag[r] =
			wetKind === "mangrove" || wetKind === "coastalSaltMarsh" ? 1 : 0
	}
	return { share, kind, coastFlag, wetGw, wetFlood, wetCoast, wetLake }
}

export const WETLANDS = { kinds, code, combine, kindOf, classify }
