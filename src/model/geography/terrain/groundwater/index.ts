import { VEGETATION } from "@/model/climate/classification/vegetation"
import { DRAINAGE } from "@/model/geography/terrain/drainage"
import { DRAIN_LEVEL } from "@/model/geography/terrain/groundwater/drain-level"
import { FOCUSED_RECHARGE } from "@/model/geography/terrain/groundwater/focused-recharge"
import { HYDRAULIC_SOIL } from "@/model/geography/terrain/groundwater/hydraulic-soil"
import { LATERAL_FLUX } from "@/model/geography/terrain/groundwater/lateral-flux"
import { OASES } from "@/model/geography/terrain/groundwater/oases"
import { RECHARGE } from "@/model/geography/terrain/groundwater/recharge"
import { ROCK_KEY } from "@/model/geography/terrain/groundwater/rock-key"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { TRANSMISSIVITY } from "@/model/geography/terrain/groundwater/transmissivity"
import type {
	GroundwaterComputeParams,
	GroundwaterLayers,
	GroundwaterResult,
	GroundwaterStats,
	OasisKind,
	RegionClimate,
	RegionClimateParams,
	SpringKind,
	StatisticsParams,
	WetlandKind,
} from "@/model/geography/terrain/groundwater/types"
import { WATER_TABLE } from "@/model/geography/terrain/groundwater/water-table"
import { WETLANDS } from "@/model/geography/terrain/groundwater/wetlands"
import { GROUNDWATER_CONFIG } from "@/model/geography/terrain/groundwater-config"
import { HEIGHT_SCALE } from "@/model/geography/terrain/height-scale"
import { LAKES } from "@/model/geography/terrain/lakes"
import { TERRAIN_SLOPE } from "@/model/geography/terrain/slope"
import { UNITS } from "@/model/shared/units"

const C = GROUNDWATER_CONFIG
const MONTHS = 12
const M_PER_KM = 1000
const M2_PER_KM2 = 1e6
const MM_PER_KM = 1e6
const MM_PER_M = 1000
const BYTE = 255
const FOREST_BIOMES = [
	VEGETATION.biomeLabels.indexOf("forest"),
	VEGETATION.biomeLabels.indexOf("jungle"),
]

function regionClimate({
	numRegions,
	temperatureMonthly,
	temperatureAvg,
	petMonthly,
	rainfallAnnual,
}: RegionClimateParams): RegionClimate {
	const pet = new Float32Array(numRegions)
	const coldest = new Float32Array(numRegions).fill(Infinity)
	const warmest = new Float32Array(numRegions).fill(-Infinity)
	const wetIndex = new Float32Array(numRegions)
	for (let m = 0; m < MONTHS; m++) {
		for (let r = 0; r < numRegions; r++) {
			const t = temperatureMonthly[m * numRegions + r]
			pet[r] += petMonthly[m * numRegions + r]
			if (t < coldest[r]) coldest[r] = t
			if (t > warmest[r]) warmest[r] = t
		}
	}
	for (let r = 0; r < numRegions; r++)
		wetIndex[r] = rainfallAnnual[r] / Math.max(1, pet[r])
	return {
		rain: rainfallAnnual,
		pet,
		mean: temperatureAvg,
		coldest,
		warmest,
		wetIndex,
	}
}

function compute(params: GroundwaterComputeParams): GroundwaterResult {
	const startedAt = performance.now()
	const {
		mesh,
		elevationKm,
		isLand,
		lakeKind,
		openWater,
		iceThickness,
		rivers,
		surface,
		planetRadiusKm,
		secondsPerYear,
	} = params
	const N = mesh.numRegions
	const { adjOffset, adjList, neighborDist } = mesh
	const areaKm2 = UNITS.regionAreasKm2({ mesh, planetRadiusKm })
	const areaM2 = Float64Array.from(areaKm2, (a) => a * M2_PER_KM2)
	const widthM = Float64Array.from(areaM2, Math.sqrt)

	const active = new Uint8Array(N)
	const water = new Uint8Array(N)
	const pan = new Uint8Array(N)
	const lake = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) {
			water[r] = 1
			lake[r] =
				lakeKind[r] === LAKES.kindCode.fresh ||
				lakeKind[r] === LAKES.kindCode.salt
					? 1
					: 0
			continue
		}
		if (iceThickness[r] > 0) continue
		active[r] = 1
		pan[r] = lakeKind[r] === LAKES.kindCode.pan ? 1 : 0
	}

	const heightM = new Float32Array(N)
	const levelM = new Float32Array(N)
	const surfaceKm = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (isLand[r]) {
			heightM[r] = elevationKm[r] * M_PER_KM
			surfaceKm[r] = elevationKm[r]
		} else if (lake[r]) {
			levelM[r] =
				HEIGHT_SCALE.elevToHeightKm({
					elev: rivers.waterLevel[r],
					maxElevKm: params.maxElevKm,
					maxDepthKm: params.maxDepthKm,
				}) * M_PER_KM
			heightM[r] = levelM[r]
			surfaceKm[r] = levelM[r] / M_PER_KM
		}
	}
	const slope = TERRAIN_SLOPE.local({
		mesh,
		elevationKm: surfaceKm,
		planetRadiusKm,
	})
	const reliefM = new Float32Array(N)
	const touchesSea = new Uint8Array(N)
	const touchesLake = new Uint8Array(N)
	const touchesSalt = new Uint8Array(N)
	const shore = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		if (!active[r]) continue
		let lo = Infinity
		let hi = -Infinity
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			const nb = adjList[j]
			const h = surfaceKm[nb] * M_PER_KM
			if (h < lo) lo = h
			if (h > hi) hi = h
			if (!isLand[nb]) {
				shore[r] = 1
				if (lake[nb]) {
					touchesLake[r] = 1
					if (lakeKind[nb] === LAKES.kindCode.salt) touchesSalt[r] = 1
				}
				if (openWater[nb]) touchesSea[r] = 1
			} else if (pan[nb]) {
				touchesLake[r] = 1
				touchesSalt[r] = 1
			}
		}
		reliefM[r] = (hi - lo) / 2
	}

	const climate = regionClimate({
		numRegions: N,
		temperatureMonthly: params.climate.temperature_monthly,
		temperatureAvg: params.climate.temperature_avg,
		petMonthly: params.climate.pet_monthly,
		rainfallAnnual: params.rainfall.annual,
	})

	const keyCode = ROCK_KEY.codes({
		rock: surface.rock,
		youngKind: surface.youngKind,
	})
	const soil = HYDRAULIC_SOIL.layer({
		keyCode,
		glaciated: surface.glaciated,
		slope,
		climate,
		active,
	})
	const recharge = RECHARGE.perRegion({
		keyCode,
		runoffMm: params.hydrology.runoff_annual,
		infiltration: soil.infiltration,
		slope,
		climate,
		active,
		secondsPerYear,
	})
	const transmissivity = TRANSMISSIVITY.perRegion({
		logK: recharge.logK,
		ksMs: soil.ksMs,
		soilDepthM: soil.depthM,
		slope,
		coldest: climate.coldest,
		active,
	})

	const drainage = DRAINAGE.order({
		mesh,
		elevation: elevationKm,
		isLand,
		sinks: pan,
	})
	const wet = new Uint8Array(N)
	const dry = new Uint8Array(N)
	for (let r = 0; r < N; r++) {
		if (!active[r]) continue
		if (climate.wetIndex[r] >= C.baseWet) wet[r] = 1
		else dry[r] = 1
	}
	const drain = DRAIN_LEVEL.compute({
		drainTarget: drainage.drainTarget,
		processOrder: drainage.processOrder,
		heightM,
		reliefM,
		waterLevelM: levelM,
		water,
		pan,
		wet,
	})
	const channel = FOCUSED_RECHARGE.perRegion({
		flowMonthly: rivers.flow_monthly,
		flowAnnual: rivers.flow,
		areaM2,
		widthM,
		pet: climate.pet,
		rain: climate.rain,
		dry,
		secondsPerYear,
	})

	const targetDistM = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const target = drainage.drainTarget[r]
		if (target < 0 || !isLand[r]) continue
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++)
			if (adjList[j] === target)
				targetDistM[r] = neighborDist[j] * planetRadiusKm * M_PER_KM
	}
	const karst = new Uint8Array(N)
	const limestone = ROCK_KEY.keys.indexOf("limestone")
	for (let r = 0; r < N; r++)
		if (
			active[r] &&
			keyCode[r] === limestone &&
			recharge.dissolving[r] >= C.karstShare
		)
			karst[r] = 1
	const aquiferKey = ROCK_KEY.flags({ members: C.aquiferKeys })
	const aquifer = Uint8Array.from(keyCode, (code) =>
		code === ROCK_KEY.none ? 0 : aquiferKey[code],
	)
	const flux = LATERAL_FLUX.cascade({
		drainTarget: drainage.drainTarget,
		processOrder: drainage.processOrder,
		targetDistM,
		headM: heightM,
		active,
		pan,
		karst,
		recharge: recharge.rechargeMs,
		areaM2,
		transmissivity,
	})

	const dissect = ROCK_KEY.table({ values: C.dissect })
	const table = WATER_TABLE.depth({
		transmissivity,
		effective: flux.effective,
		incisionM: drain.incisionM,
		offsetM: drain.offsetM,
		headM: drain.headM,
		heightM,
		slope,
		widthM,
		dissect: Float32Array.from(keyCode, (code) =>
			code === ROCK_KEY.none ? 0 : dissect[code],
		),
		glaciated: surface.glaciated,
		band: channel.sustainedBand,
		shore,
		active,
	})
	const spring = SPRINGS.classify({
		qem: flux.qem,
		qin: flux.qin,
		qkarst: flux.qkarst,
		dry,
		seepShare: table.seepShare,
		slope,
		active,
	})
	const oases = OASES.classify({
		wetIndex: climate.wetIndex,
		pet: climate.pet,
		rain: climate.rain,
		flow: rivers.flow,
		areaM2,
		band: channel.sustainedBand,
		channelM3s: channel.channelM3s,
		effective: flux.effective,
		qem: flux.qem,
		shallowShare: table.shallowShare,
		heightM,
		aquifer,
		adjOffset,
		adjList,
		secondsPerYear,
		active,
	})
	const forested = Uint8Array.from(params.vegetation, (biome) =>
		FOREST_BIOMES.includes(biome) ? 1 : 0,
	)
	const wetlands = WETLANDS.classify({
		shallowShare: table.shallowShare,
		flow: rivers.flow,
		widthM,
		slope,
		tidalRange: params.tidalRange,
		shelter: params.shelter,
		touchesSea,
		touchesLake,
		touchesSalt,
		seepShare: table.seepShare,
		wetIndex: climate.wetIndex,
		mean: climate.mean,
		coldest: climate.coldest,
		warmest: climate.warmest,
		forested,
		active,
	})

	const rechargeEffMm = Float32Array.from(
		flux.effective,
		(effective) => effective * secondsPerYear * MM_PER_M,
	)
	const layers: GroundwaterLayers = {
		sand: soil.sand,
		clay: soil.clay,
		soilDepthM: soil.depthM,
		awcMm: soil.awcMm,
		logK: recharge.logK,
		transmissivity: Float32Array.from(transmissivity),
		rechargeMm: recharge.rechargeMm,
		rechargeEffMm,
		lateralInM3s: Float32Array.from(flux.qin),
		surfaceM3s: Float32Array.from(flux.qem),
		waterTableM: table.meanDepthM,
		shallowShare: table.shallowShare,
		seepShare: table.seepShare,
		channelRechargeM3s: channel.channelM3s,
		wellMm: oases.wellMm,
		spring,
		oasis: oases.oasis,
		wetlandShare: wetlands.share,
		wetlandKind: wetlands.kind,
		coastFlag: wetlands.coastFlag,
		wetGw: wetlands.wetGw,
		wetFlood: wetlands.wetFlood,
		wetCoast: wetlands.wetCoast,
		wetLake: wetlands.wetLake,
	}
	let rechargeM3s = 0
	for (let r = 0; r < N; r++)
		if (active[r]) rechargeM3s += recharge.rechargeMs[r] * areaM2[r]
	const stats = statistics({
		layers,
		active,
		areaKm2,
		baseflowMonthly: params.hydrology.baseflow_monthly,
		exportedM3s: flux.exportedM3s,
		dischargedM3s: flux.dischargedM3s,
		rechargeM3s,
		stageMs: performance.now() - startedAt,
	})
	return { layers, stats }
}

function statistics({
	layers,
	active,
	areaKm2,
	baseflowMonthly,
	exportedM3s,
	dischargedM3s,
	rechargeM3s,
	stageMs,
}: StatisticsParams): GroundwaterStats {
	const N = active.length
	const bounds = C.depthColourBoundsM
	const classes = C.depthClassesM.length
	const wellClass = C.depthClassesM.indexOf(C.wellM)
	const depthClassShare = new Array<number>(bounds.length + 1).fill(0)
	const shallow = new Array<number>(classes).fill(0)
	const springCount = Object.fromEntries(
		SPRINGS.kinds.map((kind) => [kind, 0]),
	) as Record<SpringKind, number>
	const oasisCount = Object.fromEntries(
		OASES.kinds.map((kind) => [kind, 0]),
	) as Record<OasisKind, number>
	const wetlandAreaKm2 = Object.fromEntries(
		WETLANDS.kinds.map((kind) => [kind, 0]),
	) as Record<WetlandKind, number>
	const cause = { groundwater: 0, floodplain: 0, coast: 0, lake: 0 }
	let land = 0
	let landAreaKm2 = 0
	let rechargeMmArea = 0
	let rechargeKm3 = 0
	let baseflowKm3 = 0
	let surfaceArea = 0
	let wellArea = 0
	let wetArea = 0
	let marsh = 0
	for (let r = 0; r < N; r++) {
		if (!active[r]) continue
		const a = areaKm2[r]
		land++
		landAreaKm2 += a
		rechargeMmArea += layers.rechargeMm[r] * a
		rechargeKm3 += (layers.rechargeMm[r] * a) / MM_PER_KM
		let baseflow = 0
		for (let m = 0; m < MONTHS; m++) baseflow += baseflowMonthly[m * N + r]
		baseflowKm3 += (baseflow * a) / MM_PER_KM
		let depthClass: number = bounds.length
		for (let k = 0; k < bounds.length; k++)
			if (layers.waterTableM[r] <= bounds[k]) {
				depthClass = k
				break
			}
		depthClassShare[depthClass] += a
		for (let k = 0; k < classes; k++)
			shallow[k] += (layers.shallowShare[r * classes + k] / BYTE) * a
		if (layers.waterTableM[r] <= bounds[0]) surfaceArea += a
		springCount[SPRINGS.kinds[layers.spring[r]]]++
		oasisCount[OASES.kinds[layers.oasis[r]]]++
		wellArea += (layers.shallowShare[r * classes + wellClass] / BYTE) * a
		wetArea += layers.wetlandShare[r] * a
		wetlandAreaKm2[WETLANDS.kinds[layers.wetlandKind[r]]] +=
			layers.wetlandShare[r] * a
		cause.groundwater += layers.wetGw[r] * a
		cause.floodplain += layers.wetFlood[r] * a
		cause.coast += layers.wetCoast[r] * a
		cause.lake += layers.wetLake[r] * a
		if (layers.wetlandShare[r] >= C.marshShare) marsh++
	}
	const d = Math.max(1e-9, landAreaKm2)
	return {
		landRegions: land,
		meanRechargeMm: rechargeMmArea / d,
		rechargeKm3PerYear: rechargeKm3,
		hydrologyBaseflowKm3PerYear: baseflowKm3,
		exportedShare: exportedM3s / Math.max(1e-30, rechargeM3s),
		dischargedShare: dischargedM3s / Math.max(1e-30, rechargeM3s),
		depthClassShare: depthClassShare.map((v) => v / d),
		shallowShare: shallow.map((v) => v / d),
		surfaceShare: surfaceArea / d,
		springCount,
		oasisCount,
		wellReachableShare: wellArea / d,
		wetlandShare: wetArea / d,
		wetlandAreaKm2,
		wetlandCauseShare: {
			groundwater: cause.groundwater / d,
			floodplain: cause.floodplain / d,
			coast: cause.coast / d,
			lake: cause.lake / d,
		},
		marshRegions: marsh,
		stageMs,
	}
}

export const GROUNDWATER = { compute, regionClimate }
