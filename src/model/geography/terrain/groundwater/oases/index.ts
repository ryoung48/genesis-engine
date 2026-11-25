import type {
	DepressionParams,
	FrontSupplyParams,
	OasesParams,
	OasisLayer,
} from "@/model/geography/terrain/groundwater/oases/types"
import type { OasisKind } from "@/model/geography/terrain/groundwater/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"

const C = GROUNDWATER_CONFIG
const MM_PER_M = 1000
const BYTE = 255
const WELL_CLASS = C.depthClassesM.indexOf(C.wellM)
const SHALLOW_CLASS = C.depthClassesM.indexOf(C.shallowWellM)

const kinds: readonly OasisKind[] = [
	"none",
	"river",
	"spring",
	"foothill",
	"fossil",
	"wells",
]

const code: Record<OasisKind, number> = {
	none: 0,
	river: 1,
	spring: 2,
	foothill: 3,
	fossil: 4,
	wells: 5,
}

function frontSupply({
	wetIndex,
	effective,
	areaM2,
	heightM,
	adjOffset,
	adjList,
	active,
}: FrontSupplyParams): Float64Array {
	const n = wetIndex.length
	const supply = new Float64Array(n)
	const isDry = (r: number) => active[r] === 1 && wetIndex[r] < C.aridIndex
	for (let u = 0; u < n; u++) {
		if (!active[u] || isDry(u)) continue
		const below: number[] = []
		for (let j = adjOffset[u]; j < adjOffset[u + 1]; j++) {
			const nb = adjList[j]
			if (isDry(nb) && heightM[u] - heightM[nb] >= C.frontDropM) below.push(nb)
		}
		if (below.length === 0) continue
		const share = (C.regionalShare * effective[u] * areaM2[u]) / below.length
		for (const nb of below) supply[nb] += share
	}
	return supply
}

function isDepression({
	region,
	heightM,
	adjOffset,
	adjList,
	active,
}: DepressionParams): boolean {
	const count = adjOffset[region + 1] - adjOffset[region]
	if (count === 0) return false
	let sum = 0
	for (let j = adjOffset[region]; j < adjOffset[region + 1]; j++) {
		const nb = adjList[j]
		if (!active[nb]) return false
		sum += heightM[nb]
	}
	return sum / count - heightM[region] >= C.depressionM
}

function classify({
	wetIndex,
	pet,
	rain,
	flow,
	areaM2,
	band,
	channelM3s,
	effective,
	qem,
	shallowShare,
	heightM,
	aquifer,
	adjOffset,
	adjList,
	secondsPerYear,
	active,
}: OasesParams): OasisLayer {
	const n = wetIndex.length
	const oasis = new Uint8Array(n)
	const wellMm = new Float32Array(n)
	const wellReach = new Float32Array(n)
	const front = frontSupply({
		wetIndex,
		effective,
		areaM2,
		heightM,
		adjOffset,
		adjList,
		active,
	})
	for (let r = 0; r < n; r++) {
		if (!active[r]) continue
		wellReach[r] = shallowShare[r * C.depthClassesM.length + WELL_CLASS] / BYTE
		wellMm[r] =
			C.wellShare *
			(effective[r] * secondsPerYear * MM_PER_M +
				(MM_PER_M * channelM3s[r] * secondsPerYear) / areaM2[r])
		if (wetIndex[r] >= C.aridIndex) continue
		if (band[r] >= C.oasisMinShare && flow[r] >= C.riverOasisM3s)
			oasis[r] = code.river
		else {
			const deficitM = Math.max(0, pet[r] - rain[r]) / MM_PER_M
			const supports = (supplyM3s: number) =>
				deficitM > 0 &&
				(supplyM3s * secondsPerYear) / deficitM >= C.springOasisM2
			if (supports(qem[r])) oasis[r] = code.spring
			else if (supports(qem[r] + front[r])) oasis[r] = code.foothill
			else if (
				aquifer[r] &&
				isDepression({ region: r, heightM, adjOffset, adjList, active })
			)
				oasis[r] = code.fossil
		}
		if (
			oasis[r] === 0 &&
			wellReach[r] >= C.oasisMinShare &&
			(wellMm[r] >= C.wellMinMm ||
				(aquifer[r] === 1 &&
					shallowShare[r * C.depthClassesM.length + SHALLOW_CLASS] / BYTE >=
						C.shallowWellShare))
		)
			oasis[r] = code.wells
	}
	return { oasis, wellMm, wellReach }
}

export const OASES = { kinds, code, classify }
