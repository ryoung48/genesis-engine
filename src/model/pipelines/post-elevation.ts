/**
 * Shared post-elevation pipeline: runs from climate computation through
 * population for both the tectonic generation path (generate-world.ts) and the
 * heightmap import path (import-heightmap.ts).
 */

import type {
	BoundaryInfo,
	DistanceFields,
	GenesisClimate,
	GenesisHazards,
	GenesisHydrology,
	GenesisLocations,
	GenesisOceanCurrents,
	GenesisParams,
	GenesisProvinces,
	GenesisRainfall,
	GenesisRivers,
	GenesisTerrainFeatures,
	GenesisWorld,
	SphereMesh,
	StageTiming,
} from ".."
import {
	generateMoons,
	M_SOL_KG,
	resolveMoonOrbitHoursPerDay,
} from "../celestial/moons/orbital-mechanics"
import type { MainSequenceClass } from "../celestial/star/star-types"
import {
	DEFAULT_SPECTRAL_CLASS,
	getStarMassSol,
	isValidSpectralClass,
} from "../celestial/star/star-types"
import {
	applyDtrToClimateMinMax,
	computeLandFraction,
	computeTemperature,
} from "../climate/climate"
import { computeCycloneRisk } from "../climate/cyclones"
import { computeDiurnalRange } from "../climate/dtr"
import {
	computeHydrologyFields,
	fillPetMonthlyHargreaves,
	refreshClimatePetMonthly,
} from "../climate/hydrology"
import { computeIceAccumulation } from "../climate/ice"
import { assignKoppenClimate } from "../climate/koppen"
import {
	applyCurrentTemperatureEffect,
	computeOceanCurrents,
} from "../climate/ocean-currents"
import type { PastaDebug } from "../climate/pasta"
import { assignPastaClimate } from "../climate/pasta"
import {
	computeAdvection,
	computeMonthlyRain,
	computeThermalEquator,
} from "../climate/rain"
import { computeCoastalMask, computeSpringTideMap } from "../climate/tidal-map"
import { computeTidalSchedule } from "../climate/tidal-schedule"
import { computeTornadoRisk } from "../climate/tornadoes"
import { assignClimateZones, assignVegetation } from "../climate/vegetation"
import {
	computeTradeGoods,
	type LocationTradeGoods,
} from "../economy/trade-goods"
import { makeRng } from "../shared/rng"
import { computeCoastDistances, computeOceanDistanceBFS } from "../shared/stats"
import { getEraConfig, wavePercentileThreshold } from "../society/eras"
import type { ProvincePopulation } from "../society/population"
import {
	computeMigration,
	computePopulation,
	computeProvinceHabitability,
} from "../society/population"
import { classifyTopography } from "../terrain/classification"
import { computeHazards } from "../terrain/hazards"
import { computeLakes } from "../terrain/lakes"
import type { GenesisLandmarks } from "../terrain/landmarks"
import {
	computeLandmarks,
	LANDMARK_TYPE_LAKE,
	LANDMARK_TYPE_OCEAN,
} from "../terrain/landmarks"
import { computeLocations } from "../terrain/locations"
import { computeProvinces } from "../terrain/provinces"
import { computeRivers } from "../terrain/rivers"

/**
 * Real (non-procedural) river network for the Earth-import path, already
 * snapped onto mesh regions by import-heightmap.ts. Supplying this skips
 * computeRivers/computeLakes entirely — the fields that would normally come
 * from flow-accumulation simulation (flow, flow_monthly, basinId, terminal*)
 * are left at zero-filled defaults since there's no simulated discharge to
 * report for a real river; lines/visible/riverId/riverLengthKm are real.
 */
interface RealRiversInput {
	lines: [number, number, number, number][][]
	visible: Uint8Array
	riverId: Int32Array
	riverLengthKm: Float32Array
	minFlow: number
	maxFlow: number
}

interface PostPipelineInput {
	mesh: SphereMesh
	/** Raw [0,1] elevation */
	elevation: Float32Array
	/** Physical elevation in km */
	elevation_km: Float32Array
	/** Final land mask (will be mutated to clear lake cells) */
	isLand: Uint8Array
	/** Land mask used for river routing (may include small ocean patches) */
	riverLand: Uint8Array
	distCoast: Float32Array
	oceanDist: Float32Array
	params: GenesisParams
	/** Cells that emerged above the baseline shoreline after sea-level lowering. */
	emergedLand?: Uint8Array
	tectonicMode: "active"
	boundary: BoundaryInfo
	distFields: DistanceFields
	r_hotspot: Float32Array
	r_mantleUpwelling?: Float32Array
	terrainFeatures?: GenesisTerrainFeatures
	enableOceanCurrents: boolean
	onProgress?: (label: string, pct?: number) => void
	/** Real lake cells (from a vector lake mask) that must survive the arid/rainfall-based lake-draining heuristic below — real lakes (e.g. the Aral Sea) can sit in regions too dry for computeLakes' own rainfall model to have created them procedurally. */
	realLakeRegions?: Uint8Array
	/** Real river network — see RealRiversInput. */
	realRivers?: RealRiversInput
}

interface PostPipelineOutput {
	climate: GenesisClimate
	rainfall: GenesisRainfall
	monthlyTEQ: Float32Array[]
	hydrology: GenesisHydrology
	vegetation: Uint8Array
	rivers: GenesisRivers
	iceThickness: Float32Array
	iceMinMonthly: Float32Array
	iceMaxMonthly: Float32Array
	topography: Uint8Array
	coastal: Uint8Array
	slopeScore: Float32Array
	climateZones: Uint8Array
	koppenClimate: Uint8Array
	pastaClimate: Uint8Array | undefined
	pastaDebug: PastaDebug | undefined
	dtr_annual: Float32Array
	dtr_monthly: Float32Array
	observedDtr?: GenesisWorld["observedDtr"]
	waterAccess: Uint8Array
	riverAccess: Uint8Array
	lakeAccess: Uint8Array
	provinces: GenesisProvinces | undefined
	locations: GenesisLocations | undefined
	population: ProvincePopulation | undefined
	tradeGoods: LocationTradeGoods | undefined
	hazards: GenesisHazards
	cycloneRisk: Float32Array
	tornadoRisk: Float32Array
	tidalRange: Float32Array
	tidalSchedule: import("../climate/tidal-schedule").TidalSchedule
	landmarks: GenesisLandmarks
	oceanCurrents: GenesisOceanCurrents | undefined
	timings: StageTiming[]
	eraSettledMask: Uint8Array | undefined
	eraStatehoodMask: Uint8Array | undefined
}

const LAKE_RETENTION_THRESHOLD = 100 // mm/yr

function reconcileClosedWaterBodies(params: {
	isLand: Uint8Array
	riverLand: Uint8Array
	landmarks: Pick<GenesisLandmarks, "regionLandmark" | "type" | "count">
	rainfall: Pick<GenesisRainfall, "annual">
	protectedRegions?: Uint8Array
}): boolean {
	const { isLand, riverLand, landmarks, rainfall, protectedRegions } = params
	const rainfallSum = new Float32Array(landmarks.count)
	const rainfallCount = new Int32Array(landmarks.count)

	for (let r = 0; r < isLand.length; r++) {
		if (isLand[r]) continue
		const landmarkId = landmarks.regionLandmark[r]
		if (landmarkId < 0 || landmarks.type[landmarkId] !== LANDMARK_TYPE_LAKE)
			continue
		rainfallSum[landmarkId] += rainfall.annual[r]
		rainfallCount[landmarkId]++
	}

	let changed = false
	for (let r = 0; r < isLand.length; r++) {
		if (isLand[r]) continue
		if (protectedRegions?.[r]) continue
		const landmarkId = landmarks.regionLandmark[r]
		if (landmarkId < 0 || landmarks.type[landmarkId] !== LANDMARK_TYPE_LAKE)
			continue

		const avgRain =
			rainfallCount[landmarkId] > 0
				? rainfallSum[landmarkId] / rainfallCount[landmarkId]
				: 0
		if (avgRain < LAKE_RETENTION_THRESHOLD) {
			isLand[r] = 1
			riverLand[r] = 1
			changed = true
		}
	}

	return changed
}

export function runPostElevationPipeline(
	input: PostPipelineInput,
): PostPipelineOutput {
	const {
		mesh,
		elevation,
		elevation_km,
		isLand,
		riverLand,
		distCoast,
		oceanDist,
		params,
		emergedLand,
		boundary,
		distFields,
		r_hotspot,
		enableOceanCurrents,
		onProgress,
		realLakeRegions,
		realRivers,
	} = input
	const timings: StageTiming[] = []
	function record(stage: string, startMs: number) {
		timings.push({
			Stage: stage,
			ms: (performance.now() - startMs).toFixed(1),
		})
	}

	// ── Climate ────────────────────────────────────────────────────────
	let t0 = performance.now()
	const landFraction = computeLandFraction(mesh, isLand)
	let climate = computeTemperature(
		mesh,
		elevation,
		landFraction,
		params,
		oceanDist,
		isLand,
		elevation_km,
	)
	record("Post: climate", t0)
	onProgress?.("Post: climate", 42)

	t0 = performance.now()
	const currentLandmarks = computeLandmarks(mesh, isLand)
	record("Post: current landmarks", t0)

	const N = mesh.numRegions
	t0 = performance.now()
	const monthlyTEQ: Float32Array[] = new Array(12)
	for (let month = 0; month < 12; month++) {
		monthlyTEQ[month] = computeThermalEquator(
			mesh,
			climate.temperature_monthly.subarray(month * N, (month + 1) * N),
		)
	}
	record("Post: thermal equator", t0)
	onProgress?.("Post: thermal equator", 44)

	// ── Moisture advection ─────────────────────────────────────────────
	t0 = performance.now()
	const { east: eastAdv, west: westAdv } = computeAdvection(
		mesh,
		elevation,
		distCoast,
		climate,
		params,
		isLand,
		elevation_km,
	)
	record("Post: moisture advection", t0)
	onProgress?.("Post: moisture advection", 50)

	// ── Ocean currents ─────────────────────────────────────────────────
	t0 = performance.now()
	const oceanCurrents = enableOceanCurrents
		? computeOceanCurrents(
				mesh,
				isLand,
				distCoast,
				currentLandmarks!,
				params,
				monthlyTEQ,
			)
		: undefined
	if (enableOceanCurrents) record("Post: ocean currents", t0)
	if (oceanCurrents) {
		t0 = performance.now()
		applyCurrentTemperatureEffect(
			mesh,
			climate,
			isLand,
			oceanCurrents,
			monthlyTEQ,
			params,
		)
		refreshClimatePetMonthly(climate, params)
		record("Post: current temperature effect", t0)
	}

	// ── Rainfall ───────────────────────────────────────────────────────
	t0 = performance.now()
	const rain = computeMonthlyRain(
		mesh,
		climate,
		eastAdv,
		westAdv,
		isLand,
		params,
		monthlyTEQ,
		distCoast,
		currentLandmarks,
	)
	record("Post: rainfall", t0)
	onProgress?.("Post: rainfall", 54)
	const rainfall: GenesisRainfall = {
		monthly: rain.monthly,
		annual: rain.annual,
		east: eastAdv,
		west: westAdv,
	}

	const drainedClosedWater = reconcileClosedWaterBodies({
		isLand,
		riverLand,
		landmarks: currentLandmarks,
		rainfall,
		protectedRegions: realLakeRegions,
	})
	if (drainedClosedWater) {
		t0 = performance.now()
		const updatedLandFraction = computeLandFraction(mesh, isLand)
		climate = computeTemperature(
			mesh,
			elevation,
			updatedLandFraction,
			params,
			oceanDist,
			isLand,
			elevation_km,
		)
		for (let month = 0; month < 12; month++) {
			monthlyTEQ[month] = computeThermalEquator(
				mesh,
				climate.temperature_monthly.subarray(month * N, (month + 1) * N),
			)
		}
		if (oceanCurrents) {
			applyCurrentTemperatureEffect(
				mesh,
				climate,
				isLand,
				oceanCurrents,
				monthlyTEQ,
				params,
			)
			refreshClimatePetMonthly(climate, params)
		}
		record("Post: drain arid closed water", t0)
	}

	// ── Diurnal temperature range + PET ───────────────────────────────
	t0 = performance.now()
	let { monthly: dtr_monthly, annual: dtr_annual } = computeDiurnalRange(
		rainfall,
		elevation_km,
		oceanDist,
		isLand,
		params,
		climate.daylight_hours_monthly,
	)
	fillPetMonthlyHargreaves(
		climate.temperature_monthly,
		dtr_monthly,
		climate.insolation_monthly,
		climate.pet_monthly,
		params.daysPerYear / 12,
	)
	applyDtrToClimateMinMax(climate, dtr_monthly, N)
	record("Post: dtr + pet", t0)
	onProgress?.("Post: dtr + pet", 56)

	t0 = performance.now()
	const hydrology = computeHydrologyFields(climate, rainfall, riverLand)
	record("Post: hydrology", t0)
	onProgress?.("Post: hydrology", 57)

	// ── Rivers ─────────────────────────────────────────────────────────
	// Real river/lake data (Earth import) replaces the whole procedural
	// flow-accumulation + lake-flooding simulation: real lake cells are
	// already reflected in `isLand` by import-heightmap.ts, and the
	// `rivers` object is built directly from real polylines rather than
	// simulated. Fields that only make sense for a simulated discharge
	// (flow, flow_monthly, basinId, terminal*) stay zero-filled.
	t0 = performance.now()
	let rivers: GenesisRivers
	if (realRivers) {
		rivers = {
			lines: realRivers.lines,
			maxFlow: realRivers.maxFlow,
			minFlow: realRivers.minFlow,
			flow: new Float32Array(N),
			flow_monthly: new Float32Array(12 * N),
			visible: realRivers.visible,
			riverId: realRivers.riverId,
			riverLengthKm: realRivers.riverLengthKm,
			terminal: new Uint8Array(N),
			terminalCoastal: new Uint8Array(N),
			terminalInterior: new Uint8Array(N),
			basinId: new Int32Array(N).fill(-1),
			waterLevel: new Float32Array(N),
		}
		if (realLakeRegions) {
			for (let r = 0; r < N; r++) {
				if (realLakeRegions[r]) rivers.waterLevel[r] = elevation_km[r]
			}
		}
		record("Post: rivers (real)", t0)
	} else {
		rivers = computeRivers(
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			riverLand,
			params,
		)
		record("Post: rivers", t0)

		t0 = performance.now()
		computeLakes(
			mesh,
			elevation,
			rainfall,
			rivers.waterLevel,
			rivers.basinId,
			isLand,
			emergedLand,
			elevation_km,
		)
		record("Post: lakes", t0)
	}
	onProgress?.("Post: rivers", 62)

	// ── Landmarks + distances + temperature (post-lake) ────────────────
	// Lakes are now final — recompute landmarks so ocean vs lake cells are
	// correctly classified, then update coast/ocean distances and re-run
	// temperature so continentality reflects the finalized water geometry.
	// Ice, pasta climate, and vegetation run below on the corrected climate.
	t0 = performance.now()
	const landmarks = computeLandmarks(mesh, isLand)
	distCoast.set(
		computeCoastDistances(mesh, isLand, params.planetRadiusKm).distCoast,
	)
	oceanDist.set(computeOceanDistanceBFS(mesh, isLand, params.planetRadiusKm))
	climate = computeTemperature(
		mesh,
		elevation,
		landFraction,
		params,
		oceanDist,
		isLand,
		elevation_km,
	)
	for (let month = 0; month < 12; month++) {
		monthlyTEQ[month] = computeThermalEquator(
			mesh,
			climate.temperature_monthly.subarray(month * N, (month + 1) * N),
		)
	}
	if (oceanCurrents) {
		applyCurrentTemperatureEffect(
			mesh,
			climate,
			isLand,
			oceanCurrents,
			monthlyTEQ,
			params,
		)
		refreshClimatePetMonthly(climate, params)
	}
	;({ monthly: dtr_monthly, annual: dtr_annual } = computeDiurnalRange(
		rainfall,
		elevation_km,
		oceanDist,
		isLand,
		params,
		climate.daylight_hours_monthly,
	))
	fillPetMonthlyHargreaves(
		climate.temperature_monthly,
		dtr_monthly,
		climate.insolation_monthly,
		climate.pet_monthly,
		params.daysPerYear / 12,
	)
	applyDtrToClimateMinMax(climate, dtr_monthly, N)
	record("Post: landmarks + distances + temperature (post-lake)", t0)
	onProgress?.("Post: landmarks", 62)

	// ── Ice (needed for pasta climate) ─────────────────────────────────
	t0 = performance.now()
	const { iceThickness, iceMinMonthly, iceMaxMonthly } = computeIceAccumulation(
		mesh,
		climate,
		rainfall,
		isLand,
		distCoast,
		15,
		params.planetRadiusKm,
	)
	record("Post: ice", t0)
	onProgress?.("Post: ice", 58)

	// ── Pasta climate (needed before vegetation) ───────────────────────
	t0 = performance.now()
	const pastaResult = assignPastaClimate(
		mesh,
		isLand,
		climate,
		rainfall,
		hydrology,
		params,
		iceThickness,
		iceMinMonthly,
		iceMaxMonthly,
	)
	record("Post: pasta climate", t0)
	const pastaClimate: Uint8Array = pastaResult.zones
	const pastaDebug: PastaDebug = pastaResult.debug
	onProgress?.("Post: pasta climate", 59)

	// ── Vegetation ─────────────────────────────────────────────────────
	t0 = performance.now()
	// Compute GAr (growing-season aridity ratio) per cell for cold/extraseasonal forest transition
	const garField = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let petGdd = 0
		let aetGdd = 0
		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			const temp = climate.temperature_monthly[idx]
			const g5 =
				temp > 5 ? Math.min(temp - 5, 20) * (params.daysPerYear / 12) : 0
			petGdd += climate.pet_monthly[idx] * g5
			aetGdd += hydrology.aet_monthly[idx] * g5
		}
		garField[r] = petGdd > 0 ? aetGdd / petGdd : 1
	}
	const vegetation = assignVegetation(
		mesh,
		isLand,
		climate,
		rainfall,
		makeRng(params.seed),
		pastaClimate,
		pastaDebug.gdd,
		garField,
	)
	record("Post: vegetation", t0)
	onProgress?.("Post: vegetation", 60)

	// ── Tidal range ────────────────────────────────────────────────────
	// Computed before topography so the tidal bonus can nudge coastal marsh
	// formation in classifyTopography.
	t0 = performance.now()
	const coastalMask = computeCoastalMask(mesh, isLand)
	const cls = isValidSpectralClass(params.spectralClass)
		? (params.spectralClass as MainSequenceClass)
		: DEFAULT_SPECTRAL_CLASS
	const starMassKg = getStarMassSol(cls, params.starSubtype ?? 5) * M_SOL_KG
	const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
		params.hoursPerDay,
		params.tideLock,
	)
	const tidalSchedule = computeTidalSchedule(
		generateMoons(
			params.moonCount ?? 0,
			params.moonSeed ?? params.seed + 8831,
			params.planetRadiusKm,
			params.orbitalDistanceAU,
			moonOrbitHoursPerDay,
			starMassKg,
		),
		params,
	)
	const tidalRange = computeSpringTideMap(
		mesh,
		isLand,
		coastalMask,
		tidalSchedule,
		params,
		landmarks,
	)
	record("Post: tidal range", t0)

	// ── Topography ─────────────────────────────────────────────────────
	t0 = performance.now()
	const { topography, coastal, oceanCoastal, lakeCoastal, slopeScore } =
		classifyTopography({
			mesh,
			elevationKm: elevation_km,
			isLand,
			rivers,
			landmarks,
			vegetation,
			planetRadiusKm: params.planetRadiusKm,
			seed: params.seed,
			tidalRange,
		})
	record("Post: topography", t0)
	onProgress?.("Post: topography", 65)

	// Demote sea-adjacent regions from ocean to lake coastal tier.
	// A region only touching seas (not true oceans) gets the lake hab bonus (1.5×)
	// instead of the ocean bonus (2.0×).
	for (let r = 0; r < mesh.numRegions; r++) {
		if (!oceanCoastal[r]) continue
		let touchesOcean = false
		for (let j = mesh.adjOffset[r], end = mesh.adjOffset[r + 1]; j < end; j++) {
			const nb = mesh.adjList[j]
			if (isLand[nb]) continue
			if (
				landmarks.type[landmarks.regionLandmark[nb]] === LANDMARK_TYPE_OCEAN
			) {
				touchesOcean = true
				break
			}
		}
		if (!touchesOcean) {
			oceanCoastal[r] = 0
			lakeCoastal[r] = 1
		}
	}

	// ── Climate zones ──────────────────────────────────────────────────
	t0 = performance.now()
	const climateZones = assignClimateZones(mesh, isLand, climate)
	record("Post: climate zones", t0)
	onProgress?.("Post: climate zones", 64)

	// ── Koppen climate ─────────────────────────────────────────────────
	t0 = performance.now()
	const koppenClimate = assignKoppenClimate(mesh, isLand, climate, rainfall)
	record("Post: koppen climate", t0)
	onProgress?.("Post: koppen climate", 69)

	// ── Hazards ────────────────────────────────────────────────────────
	t0 = performance.now()
	const hazards = computeHazards(
		mesh,
		boundary,
		distFields,
		elevation_km,
		isLand,
		r_hotspot,
	)
	record("Post: hazards", t0)
	onProgress?.("Post: hazards", 70)

	t0 = performance.now()
	const cycloneRisk = computeCycloneRisk(
		mesh,
		climate,
		isLand,
		topography,
		params,
		oceanCurrents,
	)
	record("Post: cyclones", t0)

	t0 = performance.now()
	const tornadoRisk = computeTornadoRisk(
		mesh,
		climate.temperature_avg,
		climate.temperature_max,
		climate.temperature_min,
		isLand,
		topography,
		vegetation,
		oceanDist,
		params,
	)
	record("Post: tornadoes", t0)

	// ── Provinces ──────────────────────────────────────────────────────
	t0 = performance.now()
	const provinces: GenesisProvinces = computeProvinces(
		mesh,
		isLand,
		topography,
		params.seed,
		{
			climateZones,
			rainfall,
			oceanCoastal,
			lakeCoastal,
			riverVisible: rivers.visible,
			planetRadiusKm: params.planetRadiusKm,
		},
	)
	record("Post: provinces", t0)
	onProgress?.("Post: provinces", 72)

	const { waterAccess, riverAccess, lakeAccess } = provinces

	t0 = performance.now()
	const locations: GenesisLocations = computeLocations(
		provinces,
		mesh,
		params.seed,
		{ planetRadiusKm: params.planetRadiusKm },
	)
	record("Post: locations", t0)
	onProgress?.("Post: locations", 73)

	// ── Migration diffusion ─────────────────────────────────────────────
	// Migration runs before full population so that provinces unreachable
	// from any cradle can be marked desolate, which in turn zeroes their
	// population and habitability in the population pass below.
	t0 = performance.now()
	const rawHabitability = computeProvinceHabitability(
		provinces,
		landmarks,
		climateZones,
		vegetation,
		topography,
		oceanCoastal,
		lakeCoastal,
		rivers.visible,
		params.seed,
	)
	const migration = computeMigration(
		provinces,
		rawHabitability,
		mesh,
		params.planetRadiusKm,
		N,
	)
	// Mark provinces unreachable from any cradle as desolate so they are
	// excluded from the population pass.
	for (let p = 0; p < provinces.count; p++) {
		if (migration.migrationWave[p] < 0) provinces.desolate[p] = 1
	}
	record("Post: migration", t0)
	onProgress?.("Post: migration", 74)

	// ── Population ─────────────────────────────────────────────────────
	t0 = performance.now()
	const eraConfig = getEraConfig(params.era)

	// Percentile-based wave thresholds computed here where migrationWave is
	// guaranteed. Both are passed through to derive-province-society.
	const actualSettlementWave = wavePercentileThreshold(
		migration.migrationWave,
		provinces.desolate,
		eraConfig.settlementFraction,
	)
	const statehoodOverallFraction =
		eraConfig.settlementFraction * eraConfig.statehoodFraction
	const actualStatehoodWave = wavePercentileThreshold(
		migration.migrationWave,
		provinces.desolate,
		statehoodOverallFraction,
	)

	// Build per-province era masks using migration.migrationWave directly.
	// settledMask: provinces within the settlement percentile (get cultures/pop)
	// statehoodMask: provinces within the statehood percentile (get nations)
	let eraSettledMask: Uint8Array | undefined
	let eraStatehoodMask: Uint8Array | undefined
	if (provinces.count > 0 && eraConfig.settlementFraction < 1.0) {
		eraSettledMask = new Uint8Array(provinces.count)
		for (let p = 0; p < provinces.count; p++) {
			const w = migration.migrationWave[p]
			if (!provinces.desolate[p] && w >= 0 && w <= actualSettlementWave) {
				eraSettledMask[p] = 1
			}
		}
	}
	if (
		provinces.count > 0 &&
		eraConfig.hasNations &&
		statehoodOverallFraction < 1.0
	) {
		eraStatehoodMask = new Uint8Array(provinces.count)
		for (let p = 0; p < provinces.count; p++) {
			const w = migration.migrationWave[p]
			if (!provinces.desolate[p] && w >= 0 && w <= actualStatehoodWave) {
				eraStatehoodMask[p] = 1
			}
		}
	}

	const population: ProvincePopulation = computePopulation(
		provinces,
		landmarks,
		climateZones,
		vegetation,
		topography,
		oceanCoastal,
		lakeCoastal,
		rivers.visible,
		params.seed,
		params.planetRadiusKm,
		N,
		eraConfig.targetPopulation,
		migration.migrationWave,
		actualSettlementWave,
		eraConfig.migrationFalloff,
	)
	population.migrationWave = migration.migrationWave
	population.cradleProvinces = migration.cradleProvinces
	record("Post: population", t0)
	onProgress?.("Post: population", 74)

	// ── Trade goods ─────────────────────────────────────────────────────
	t0 = performance.now()
	const tradeGoods = locations
		? computeTradeGoods({
				seed: params.seed,
				locations,
				provinces,
				climateZones,
				vegetation,
				topography,
				coastal,
				numRegions: N,
				pastaClimate,
			})
		: undefined
	record("Post: trade goods", t0)
	onProgress?.("Post: trade goods", 75)

	return {
		climate,
		rainfall,
		monthlyTEQ,
		hydrology,
		vegetation,
		rivers,
		iceThickness,
		iceMinMonthly,
		iceMaxMonthly,
		topography,
		coastal,
		slopeScore,
		climateZones,
		koppenClimate,
		pastaClimate,
		pastaDebug,
		dtr_annual,
		dtr_monthly,
		waterAccess,
		riverAccess,
		lakeAccess,
		provinces,
		locations,
		population,
		tradeGoods,
		hazards,
		cycloneRisk,
		tornadoRisk,
		tidalRange,
		tidalSchedule,
		landmarks,
		oceanCurrents,
		timings,
		eraSettledMask,
		eraStatehoodMask,
	}
}
