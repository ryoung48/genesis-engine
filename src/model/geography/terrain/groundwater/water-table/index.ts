import type {
	DensityParams,
	HillMeanParams,
	HillParams,
	StreamSpacingParams,
	WaterTable,
	WaterTableParams,
} from "@/model/geography/terrain/groundwater/water-table/types"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { MATH } from "@/model/shared/math/core"

const C = GROUNDWATER_CONFIG
const CLASSES = C.depthClassesM
const HALF_SPACING_PER_DENSITY_M = 500
const BYTE = 255
const TINY = 1e-12

function hillShare({ mound, rise, depth }: HillParams): number {
	if (mound <= TINY * rise) return MATH.clamp01(depth / rise)
	const b = rise - 2 * mound
	const disc = b * b + 4 * mound * depth
	if (disc < 0) return 0
	const root = Math.sqrt(disc)
	const upper = (-b + root) / (2 * mound)
	const lower = (-b - root) / (2 * mound)
	return MATH.clamp01(upper) - MATH.clamp01(lower)
}

function hillMeanDepth({ mound, rise }: HillMeanParams): number {
	const total = rise / 2 - (2 * mound) / 3
	if (rise >= 2 * mound) return total
	const u0 = Math.min(1, (2 * mound - rise) / mound)
	const seep = (mound * u0 ** 3) / 3 + ((rise - 2 * mound) * u0 ** 2) / 2
	return total - seep
}

function density({ dissect, slope, glaciated }: DensityParams): number {
	return (
		C.densityBase *
		10 ** (C.densityPower * dissect) *
		(C.densityFlatMin +
			(1 - C.densityFlatMin) *
				MATH.smoothstep({
					edge0: C.densityFlat[0],
					edge1: C.densityFlat[1],
					x: slope,
				})) *
		(glaciated ? C.densityGlaciated : 1)
	)
}

function halfSpacing({
	density: drainage,
	transmissivity,
	rise,
	recharge,
}: StreamSpacingParams): number {
	const natural = HALF_SPACING_PER_DENSITY_M / drainage
	const critical =
		recharge > 0 ? Math.sqrt((transmissivity * rise) / recharge) : Infinity
	return Math.max(C.lFloorM, Math.min(natural, critical))
}

function depth({
	transmissivity,
	effective,
	incisionM,
	offsetM,
	headM,
	heightM,
	slope,
	widthM,
	dissect,
	glaciated,
	band,
	shore,
	active,
}: WaterTableParams): WaterTable {
	const n = transmissivity.length
	const meanDepthM = new Float32Array(n)
	const shallowShare = new Uint8Array(n * CLASSES.length)
	const seepShare = new Float32Array(n)
	for (let r = 0; r < n; r++) {
		if (!active[r]) continue
		const rise = incisionM[r]
		const shoreSlope = Math.max(slope[r], C.shoreSlopeMin)
		const half = halfSpacing({
			density: density({
				dissect: dissect[r],
				slope: slope[r],
				glaciated: glaciated[r] === 1,
			}),
			transmissivity: transmissivity[r],
			rise,
			recharge: effective[r],
		})
		const mound = (effective[r] * half * half) / (2 * transmissivity[r])
		const offset = offsetM[r]
		const hillMean = offset + hillMeanDepth({ mound, rise })
		const bandShare = band[r]
		const base = bandShare * (C.ripM / 2) + (1 - bandShare) * hillMean
		const shoreStrip = shore[r]
			? Math.min(1, base / (shoreSlope * widthM[r]))
			: 0
		const cap = Math.max(
			0,
			Math.min(heightM[r] + rise, heightM[r] - headM[r] + rise),
		)
		meanDepthM[r] = Math.min(cap, Math.max(0, base * (1 - shoreStrip / 2)))
		seepShare[r] =
			mound > 0 ? MATH.clamp({ value: 2 - rise / mound, lo: 0, hi: 1 }) : 0
		for (let k = 0; k < CLASSES.length; k++) {
			const d0 = CLASSES[k]
			const hill = hillShare({ mound, rise, depth: d0 - offset })
			const inBand = bandShare * Math.min(1, d0 / C.ripM)
			const inShore = shore[r] ? Math.min(1, d0 / (shoreSlope * widthM[r])) : 0
			shallowShare[r * CLASSES.length + k] = Math.round(
				BYTE * (1 - (1 - hill) * (1 - inBand) * (1 - inShore)),
			)
		}
	}
	return { meanDepthM, shallowShare, seepShare }
}

export const WATER_TABLE = {
	hillShare,
	hillMeanDepth,
	density,
	halfSpacing,
	depth,
}
