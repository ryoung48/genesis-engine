import { OCEAN_WAVES } from "@/model/climate/ocean/waves"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import type {
	SeabedClassifyParams,
	SeabedHabitat,
	SeabedHabitatOfParams,
	SeabedReachParams,
	SeabedShareParams,
	SeabedSubstrateParams,
} from "@/model/geography/terrain/seabed/habitat/types"
import { SEABED_CONFIG } from "@/model/geography/terrain/seabed-config"
import { SHORE_MATERIAL } from "@/model/geography/terrain/shore/material"
import { MATH } from "@/model/shared/math/core"
import { SPREAD } from "@/model/shared/spread"

const C = SEABED_CONFIG
const MATERIAL = SHORE_MATERIAL.code
const M_PER_KM = 1000
const PERCENT = 100

const habitats: readonly SeabedHabitat[] = [
	"none",
	"coral",
	"kelp",
	"seagrass",
	"rockyReef",
]

const habitatCode = Object.fromEntries(
	habitats.map((kind, i) => [kind, i]),
) as Record<SeabedHabitat, number>

function reach({
	mesh,
	isLand,
	openWater,
	planetRadiusKm,
}: SeabedReachParams): Int32Array {
	const coastal = LANDMARKS.coastalLandMask({ mesh, isLand, openWater })
	const source = new Int32Array(mesh.numRegions).fill(-1)
	const dist = new Float64Array(mesh.numRegions).fill(Infinity)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (!coastal[r]) continue
		dist[r] = 0
		source[r] = r
	}
	SPREAD.km({
		mesh,
		radiusKm: planetRadiusKm,
		dist,
		maxKm: C.reachKm,
		canEnter: ({ to }) => openWater[to] === 1,
		onReach: ({ from, to }) => {
			source[to] = source[from]
		},
	})
	return source
}

function share({ source, elevationKm, flow }: SeabedShareParams): Uint8Array {
	const out = new Uint8Array(source.length)
	for (let r = 0; r < source.length; r++) {
		if (source[r] < 0 || source[r] === r) continue
		const depthM = Math.max(1, -elevationKm[r] * M_PER_KM)
		const photic = Math.min(1, C.photicDepthM / depthM)
		const plume =
			1 -
			MATH.smoothstep({
				edge0: C.plumeFlowM3s[0],
				edge1: C.plumeFlowM3s[1],
				x: flow[source[r]],
			})
		out[r] = Math.round(PERCENT * photic * plume)
	}
	return out
}

function substrateOf({
	source,
	shoreMaterial,
}: SeabedSubstrateParams): Uint8Array {
	const out = new Uint8Array(source.length)
	for (let r = 0; r < source.length; r++)
		if (source[r] >= 0 && source[r] !== r) out[r] = shoreMaterial[source[r]]
	return out
}

function habitatOf({
	substrate,
	coldestC,
	warmestC,
	iceMonths,
	leeM,
}: SeabedHabitatOfParams): number {
	const rock = substrate === MATERIAL.rock
	const gravel = substrate === MATERIAL.gravel
	const sand = substrate === MATERIAL.sand
	const mud = substrate === MATERIAL.mud
	const iceFree = iceMonths <= C.iceMonthsMax
	if (coldestC >= C.coralMinColdC && (rock || sand || gravel))
		return habitatCode.coral
	if (warmestC <= C.kelpMaxWarmC && iceFree && (rock || gravel))
		return habitatCode.kelp
	if (iceFree && (sand || mud) && leeM <= C.seagrassLeeMaxM)
		return habitatCode.seagrass
	if (rock) return habitatCode.rockyReef
	return habitatCode.none
}

function classify({
	numRegions,
	source,
	share: shareLayer,
	substrate,
	exposureLeeM,
	temperatureMonthly,
	iceMinMonthly,
	iceMaxMonthly,
}: SeabedClassifyParams): Uint8Array {
	const out = new Uint8Array(numRegions)
	for (let r = 0; r < numRegions; r++) {
		if (shareLayer[r] < C.shareMinPercent) continue
		const ice = {
			perennial: iceMinMonthly[r] > 0,
			seasonal: iceMaxMonthly[r] > 0,
		}
		let coldestC = Infinity
		let warmestC = -Infinity
		let iceMonths = 0
		for (let m = 0; m < C.monthsPerYear; m++) {
			const t = temperatureMonthly[m * numRegions + r]
			if (t < coldestC) coldestC = t
			if (t > warmestC) warmestC = t
			if (OCEAN_WAVES.iceCovered({ ice, temperatureNormalC: t })) iceMonths++
		}
		out[r] = habitatOf({
			substrate: substrate[r],
			coldestC,
			warmestC,
			iceMonths,
			leeM: exposureLeeM[source[r]],
		})
	}
	return out
}

export const SEABED_HABITAT = {
	habitats,
	habitatCode,
	reach,
	share,
	substrateOf,
	habitatOf,
	classify,
}
