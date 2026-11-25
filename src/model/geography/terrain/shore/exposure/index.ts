import { OCEAN_WAVES } from "@/model/climate/ocean/waves"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import type {
	EffectiveFetchParams,
	ExposureClassParams,
	SeaExposureParams,
	ShelterParams,
	ShoreExposure,
	ShoreExposureClass,
	ShoreExposureParams,
} from "@/model/geography/terrain/shore/exposure/types"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"
import { MATH } from "@/model/shared/math/core"

const C = SHORE_CONFIG
const MONTHS = 12

const classes: readonly ShoreExposureClass[] = [
	"sheltered",
	"moderate",
	"exposed",
]

const radials = C.radialDeg.map((deg) => {
	const angle = (deg * Math.PI) / 180
	return { cos: Math.cos(angle), sin: Math.sin(angle) }
})
const radialWeightSum = radials.reduce((sum, radial) => sum + radial.cos, 0)

function effectiveFetchKm({
	field,
	sea,
	windU,
	windV,
}: EffectiveFetchParams): number {
	let weighted = 0
	for (const radial of radials) {
		const fetchKm = OCEAN_WAVES.fetch({
			field,
			sea,
			windU: windU * radial.cos - windV * radial.sin,
			windV: windU * radial.sin + windV * radial.cos,
		})
		weighted += fetchKm * radial.cos * radial.cos
	}
	return weighted / radialWeightSum
}

function seaExposure({
	field,
	sea,
	numRegions,
	windMonthly,
	temperatureMonthly,
	iceMinMonthly,
	iceMaxMonthly,
}: SeaExposureParams): number {
	const ice = {
		perennial: iceMinMonthly[sea] > 0,
		seasonal: iceMaxMonthly[sea] > 0,
	}
	let weightSum = 0
	let energySum = 0
	for (let m = 0; m < MONTHS; m++) {
		const index = m * numRegions + sea
		const windU = windMonthly.u[index]
		const windV = windMonthly.v[index]
		const speed = Math.hypot(windU, windV)
		if (speed <= 0) continue
		if (
			OCEAN_WAVES.iceCovered({
				ice,
				temperatureNormalC: temperatureMonthly[index],
			})
		)
			continue
		const heightM = OCEAN_WAVES.height({
			windSpeedMs: C.refWindMs,
			fetchKm: effectiveFetchKm({ field, sea, windU, windV }),
			gravityMs2: field.gravityMs2,
		})
		weightSum += speed * speed
		energySum += speed * speed * heightM * heightM
	}
	return weightSum > 0 ? Math.sqrt(energySum / weightSum) : 0
}

function compute({
	mesh,
	isLand,
	openWater,
	windMonthly,
	temperatureMonthly,
	iceMinMonthly,
	iceMaxMonthly,
	planetRadiusKm,
}: ShoreExposureParams): ShoreExposure {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const field = OCEAN_WAVES.field({ mesh, openWater, planetRadiusKm })
	const coastal = LANDMARKS.coastalLandMask({ mesh, isLand, openWater })
	const seaIndex = new Float32Array(N).fill(-1)
	const exposureOpenM = new Float32Array(N)
	const exposureLeeM = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!coastal[r]) continue
		let open = 0
		let lee = Infinity
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			const sea = adjList[j]
			if (!openWater[sea]) continue
			if (seaIndex[sea] < 0)
				seaIndex[sea] = seaExposure({
					field,
					sea,
					numRegions: N,
					windMonthly,
					temperatureMonthly,
					iceMinMonthly,
					iceMaxMonthly,
				})
			open = Math.max(open, seaIndex[sea])
			lee = Math.min(lee, seaIndex[sea])
		}
		exposureOpenM[r] = open
		exposureLeeM[r] = lee
	}
	return { exposureOpenM, exposureLeeM }
}

function classOf({ exposureM }: ExposureClassParams): number {
	if (exposureM < C.exposureEdgesM[0]) return 0
	return exposureM < C.exposureEdgesM[1] ? 1 : 2
}

function shelter({ exposureLeeM }: ShelterParams): Float32Array {
	return Float32Array.from(
		exposureLeeM,
		(exposureM) =>
			1 -
			MATH.smoothstep({
				edge0: C.shelterEdgesM[0],
				edge1: C.shelterEdgesM[1],
				x: exposureM,
			}),
	)
}

export const SHORE_EXPOSURE = { classes, compute, classOf, shelter }
