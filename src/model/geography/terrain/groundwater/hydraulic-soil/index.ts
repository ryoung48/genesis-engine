import type {
	HydraulicSoilLayer,
	HydraulicSoilParams,
	SoilDepthParams,
	SoilTextureParams,
} from "@/model/geography/terrain/groundwater/hydraulic-soil/types"
import { ROCK_KEY } from "@/model/geography/terrain/groundwater/rock-key"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { MATH } from "@/model/shared/math/core"

const C = GROUNDWATER_CONFIG
const COSBY_KS_MS = 7.06e-6
const WEDGE_BASE = 3
const WEDGE_SPAN = 15
const WEIGHT_RAIN = 6
const DEPTH_NORMALISER = 4.8
const PERCENT = 100

function texture({
	base,
	rain,
	mean,
	wetIndex,
}: SoilTextureParams): [number, number, number] {
	const clay =
		base[2] +
		C.clayGain *
			MATH.smoothstep({ edge0: 1200, edge1: 2500, x: rain }) *
			MATH.smoothstep({ edge0: 15, edge1: 24, x: mean })
	const sand =
		base[0] +
		C.sandGain * MATH.smoothstep({ edge0: 0.3, edge1: 0.1, x: wetIndex })
	const silt = base[1]
	const total = sand + silt + clay
	return [
		(sand / total) * PERCENT,
		(silt / total) * PERCENT,
		(clay / total) * PERCENT,
	]
}

function depth({
	mass,
	rate,
	rain,
	coldest,
	warmest,
	slope,
	halved,
	young,
}: SoilDepthParams): number {
	const pm = rain / WEIGHT_RAIN
	const wedge =
		coldest < 0 && warmest > 0
			? (WEDGE_BASE + Math.min(-coldest, warmest)) / WEDGE_SPAN
			: 0
	const weathering =
		(1 + wedge + 0.3 + pm / 100 + 1 + pm / 200) * (mass / 100) * rate
	let metres =
		(C.soilRefM * weathering) / DEPTH_NORMALISER / (1 + slope / C.soilSlope)
	if (halved) metres /= 2
	if (young) metres = Math.max(metres, C.youngSoilM)
	return MATH.clamp({ value: metres, lo: C.soilMinM, hi: C.soilMaxM })
}

function layer({
	keyCode,
	glaciated,
	slope,
	climate,
	active,
}: HydraulicSoilParams): HydraulicSoilLayer {
	const n = keyCode.length
	const sand = new Float32Array(n)
	const clay = new Float32Array(n)
	const depthM = new Float32Array(n)
	const ksMs = new Float64Array(n)
	const infiltration = new Float32Array(n)
	const awcMm = new Float32Array(n)
	const textures = ROCK_KEY.keys.map((key) => C.texture[key])
	const mass = ROCK_KEY.table({ values: C.soilMass })
	const rate = ROCK_KEY.table({ values: C.soilRate })
	const halvable = ROCK_KEY.flags({ members: C.glaciatedHalved })
	const youngSediment = ROCK_KEY.flags({ members: ROCK_KEY.youngKeys })

	for (let r = 0; r < n; r++) {
		if (!active[r]) continue
		const code = keyCode[r]
		const [s, silt, c] = texture({
			base: textures[code],
			rain: climate.rain[r],
			mean: climate.mean[r],
			wetIndex: climate.wetIndex[r],
		})
		const d = depth({
			mass: mass[code],
			rate: rate[code],
			rain: climate.rain[r],
			coldest: climate.coldest[r],
			warmest: climate.warmest[r],
			slope: slope[r],
			halved: glaciated[r] === 1 && halvable[code] === 1,
			young: youngSediment[code] === 1,
		})
		sand[r] = s
		clay[r] = c
		depthM[r] = d
		ksMs[r] = COSBY_KS_MS * 10 ** (-0.6 + 0.0126 * s - 0.0064 * c)
		infiltration[r] = (0.9 * s + 0.75 * silt + 0.1 * c) / PERCENT
		awcMm[r] =
			(C.awcScale * (0.25 * s + 0.75 * silt + c) * Math.min(d, C.rootM)) /
			PERCENT
	}
	return { sand, clay, depthM, ksMs, infiltration, awcMm }
}

export const HYDRAULIC_SOIL = { texture, depth, layer }
