/// <reference lib="webworker" />

import { HISTORY } from "@/model/history"
import { HISTORY_RNG } from "@/model/history/history-rng"
import { SNAPSHOT } from "@/model/history/snapshot"
import { STATE } from "@/model/history/state"
import type { HistoryState } from "@/model/history/state/types"
import { PATHFIND } from "@/model/pathfinding"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { TRANSPORT } from "@/model/transport"
import type {
	GenesisWorkerRequest,
	GenesisWorkerResponse,
	SerializedGenesisWorld,
	SerializedHistoryFrame,
} from "@/model/transport/types"
import {
	computeMapGeometryArrays,
	computeTerrainGeometryArrays,
} from "@/ui/planet/renderer/terrain-geometry"

declare const self: DedicatedWorkerGlobalScope

// Live-play sim state: the sim only ever advances as far as "simulate" has
// ticked it, never precomputed ahead of what's been played (see
// PROCEDURAL-HISTORY-PLAN.md). historyState is (re)seeded at generate/import
// time via initHistory (cheap - just seeds the start year, no simulateUntil).
let historyState: HistoryState | null = null
let historyRng: ReturnType<typeof HISTORY_RNG.createHistoryRng> | null = null
let historyTime = 800 * STATE.yearMs
let simulationRunning = false
// Index into historyState.events already sent to the main thread, so each
// "sim-progress" only carries newly-pushed events instead of the whole log.
let historyEventCursor = 0

function buildFrameTransferList(frame: SerializedHistoryFrame): Transferable[] {
	return [
		frame.assignment.buffer,
		frame.parent.buffer,
		frame.sovereign.buffer,
		frame.leaderDynasty.buffer,
		frame.leaderNameSeed.buffer,
		frame.leaderClaim.buffer,
		frame.leaderBirthYear.buffer,
		frame.colors.buffer,
		frame.populationTotal.buffer,
		frame.populationUrban.buffer,
		frame.development.buffer,
		frame.consumption.buffer,
		frame.nationWealth.buffer,
		frame.nationOptimalWealth.buffer,
		frame.relationA.buffer,
		frame.relationB.buffer,
		frame.relationValues.buffer,
		frame.cultureBlendSecondary.buffer,
		frame.cultureBlendWeight.buffer,
	]
}

async function runSimulation(tickMs = STATE.yearMs): Promise<void> {
	if (!historyState || !historyRng) return
	simulationRunning = true

	while (simulationRunning) {
		try {
			historyTime += tickMs
			HISTORY.simulateUntil({
				state: historyState,
				targetTimeMs: historyTime,
				rng: historyRng,
				validate: false,
			})
			const frame = SNAPSHOT.buildHistoryFrame({ state: historyState })
			const newEvents = historyState.events.slice(historyEventCursor)
			historyEventCursor = historyState.events.length
			const progress: GenesisWorkerResponse = {
				type: "sim-progress",
				timeMs: historyTime,
				frame,
				newEvents,
			}
			self.postMessage(progress, buildFrameTransferList(frame))
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error))
			self.postMessage({
				type: "error",
				message: `Simulation error at ${historyTime}: ${err.message}`,
				stack: err.stack,
			} satisfies GenesisWorkerResponse)
			simulationRunning = false
			return
		}
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}

interface PathfindSeedWorld {
	params: { planetRadiusKm?: number }
	mesh: { r_xyz: Float32Array; adjOffset: Int32Array; adjList: Int32Array }
	isLand: Uint8Array | null
	vegetation: Uint8Array | null
	topography: Uint8Array | null
	regionProvince: Int32Array | null
	desolate: Uint8Array | null
}

// Retained across messages so a later "pathfind" request can route over the
// most recently generated world without regenerating it. This used to be a
// much larger HistorySeedWorld carrying nations/population/cultures so the
// worker could seed the procedural history sim; only the routing inputs
// remain.
let lastGeneratedWorld: PathfindSeedWorld | null = null

function clonePathfindSeedWorld(
	world: ReturnType<typeof GENERATE_WORLD.generateGenesisWorld>,
): PathfindSeedWorld {
	return {
		params: { planetRadiusKm: world.params.planetRadiusKm },
		mesh: {
			r_xyz: world.mesh.r_xyz.slice(),
			adjOffset: world.mesh.adjOffset.slice(),
			adjList: world.mesh.adjList.slice(),
		},
		isLand: world.isLand ? world.isLand.slice() : null,
		vegetation: world.vegetation ? world.vegetation.slice() : null,
		topography: world.topography ? world.topography.slice() : null,
		regionProvince: world.provinces?.regionProvince.slice() ?? null,
		desolate: world.provinces?.desolate.slice() ?? null,
	}
}
function serializeWorld(
	world: ReturnType<typeof GENERATE_WORLD.generateGenesisWorld>,
): SerializedGenesisWorld {
	return {
		mesh: world.mesh,
		plateAssignment: world.plateAssignment,
		elevation: world.elevation,
		terrainFeatures: world.terrainFeatures,
		elevation_km: world.elevation_km,
		params: world.params,
		isEarthImport: world.isEarthImport,
		timings: world.timings,
		continentCount: world.continentCount,
		climate: world.climate,
		oceanDist: world.oceanDist,
		distCoast: world.distFields?.distCoast,
		rainfall: world.rainfall,
		hazards: world.hazards,
		cycloneRisk: world.cycloneRisk,
		tornadoRisk: world.tornadoRisk,
		tidalRange: world.tidalRange,
		tidalSchedule: world.tidalSchedule,
		volcanism: world.volcanism,
		climateZones: world.climateZones,
		pastaClimate: world.pastaClimate,
		pastaDebug: world.pastaDebug,
		iceThickness: world.iceThickness,
		iceMinMonthly: world.iceMinMonthly,
		iceMaxMonthly: world.iceMaxMonthly,
		koppenClimate: world.koppenClimate,
		realKoppenClimate: world.realKoppenClimate,
		realPastaClimate: world.realPastaClimate,
		vegetation: world.vegetation,
		topography: world.topography,
		eu5Topography: world.eu5Topography,
		eu5Vegetation: world.eu5Vegetation,
		eu5Climate: world.eu5Climate,
		coastal: world.coastal,
		waterAccess: world.waterAccess,
		riverAccess: world.riverAccess,
		lakeAccess: world.lakeAccess,
		slopeScore: world.slopeScore,
		isLand: world.isLand,
		riverLand: world.riverLand,
		rivers: world.rivers
			? {
					flow: world.rivers.flow,
					flow_monthly: world.rivers.flow_monthly,
					riverId: world.rivers.riverId,
					riverLengthKm: world.rivers.riverLengthKm,
					riverNames: world.rivers.riverNames,
					visible: world.rivers.visible,
					basinId: world.rivers.basinId,
					waterLevel: world.rivers.waterLevel,
					lines: world.rivers.lines,
					maxFlow: world.rivers.maxFlow,
					minFlow: world.rivers.minFlow,
				}
			: world.rivers,
		oceanCurrents: world.oceanCurrents,
		provinces: world.provinces,
		locations: world.locations,
		nations: world.nations,
		cultures: world.cultures,
		heritages: world.heritages,
		religions: world.religions,
		religionTypes: world.religionTypes,
		landmarks: world.landmarks
			? {
					regionLandmark: world.landmarks.regionLandmark,
					type: world.landmarks.type,
					size: world.landmarks.size,
					dominantCulture: world.landmarks.dominantCulture,
					nameSeeds: world.landmarks.nameSeeds,
					realNames: world.landmarks.realNames,
					count: world.landmarks.count,
				}
			: undefined,
		development: world.development,
		urbanPopulation: world.urbanPopulation,
		population: world.population,
		monthlyTEQ: world.monthlyTEQ,
		dtr_annual: world.dtr_annual,
		dtr_monthly: world.dtr_monthly,
		hydrology: world.hydrology
			? { aet_monthly: world.hydrology.aet_monthly }
			: undefined,
		observedDtr: world.observedDtr,
		observedHumidity: world.observedHumidity,
		tradeGoods: world.tradeGoods?.material,
		settlementRegions: world.settlementRegions,
		settlementWaterLandmarks: world.settlementWaterLandmarks,
		settlementPortRegions: world.settlementPortRegions,
		routes: world.routes ? TRANSPORT.packRoutes(world.routes) : undefined,
		network: world.network ? TRANSPORT.packNetwork(world.network) : undefined,
	}
}

/** Precomputes the default-display-state terrain/map geometry (see
 * SerializedGenesisWorld's doc comment) so create-genesis-scene.ts's first
 * rebuildTerrain() after "Generate"/"Load Earth" can skip straight to
 * wrapping these arrays in THREE.BufferGeometry instead of running the
 * per-vertex color/normal-averaging pass on the main thread. */
function attachPrecomputedGeometry(
	world: SerializedGenesisWorld,
): SerializedGenesisWorld {
	const terrain = computeTerrainGeometryArrays(world, "terrain", null, true)
	const map = computeMapGeometryArrays(world, "terrain", null, 0, 0)
	world.precomputedTerrainGeometry = terrain
	world.precomputedMapGeometry = map
	return world
}

function partitionBuffers(p: {
	assignment: Int32Array
	seeds: Int32Array
	languageSeeds?: Int32Array
	nameSeeds?: Int32Array
	genderSystems?: Uint8Array
	adjOffset: Int32Array
	adjList: Int32Array
	size: Int32Array
	colors: Float32Array
}): Transferable[] {
	const languageSeeds = p.languageSeeds ?? new Int32Array(0)
	const nameSeeds = p.nameSeeds ?? new Int32Array(0)
	const genderSystems = p.genderSystems ?? new Uint8Array(0)
	return [
		p.assignment.buffer as ArrayBuffer,
		p.seeds.buffer as ArrayBuffer,
		languageSeeds.buffer as ArrayBuffer,
		nameSeeds.buffer as ArrayBuffer,
		genderSystems.buffer as ArrayBuffer,
		p.adjOffset.buffer as ArrayBuffer,
		p.adjList.buffer as ArrayBuffer,
		p.size.buffer as ArrayBuffer,
		p.colors.buffer as ArrayBuffer,
	]
}

function nationBuffers(n: {
	assignment: Int32Array
	seeds: Int32Array
	languageSeeds?: Int32Array
	nameSeeds?: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
	size: Int32Array
	colors: Float32Array
	parent: Int32Array
	depth: Int32Array
	childOffset: Int32Array
	childList: Int32Array
	sovereign: Int32Array
	gravity: Float32Array
	governmentType?: Uint8Array
}): Transferable[] {
	const nameSeeds = n.nameSeeds ?? new Int32Array(0)
	return [
		...partitionBuffers(n),
		nameSeeds.buffer as ArrayBuffer,
		n.parent.buffer as ArrayBuffer,
		n.depth.buffer as ArrayBuffer,
		n.childOffset.buffer as ArrayBuffer,
		n.childList.buffer as ArrayBuffer,
		n.sovereign.buffer as ArrayBuffer,
		n.gravity.buffer as ArrayBuffer,
		...(n.governmentType ? [n.governmentType.buffer as ArrayBuffer] : []),
	]
}

function locationBuffers(l: {
	regionLocation: Int32Array
	locationProvince: Int32Array
	seeds: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
	size: Int32Array
	colors: Float32Array
}): Transferable[] {
	return [
		l.regionLocation.buffer as ArrayBuffer,
		l.locationProvince.buffer as ArrayBuffer,
		l.seeds.buffer as ArrayBuffer,
		l.adjOffset.buffer as ArrayBuffer,
		l.adjList.buffer as ArrayBuffer,
		l.size.buffer as ArrayBuffer,
		l.colors.buffer as ArrayBuffer,
	]
}

function provinceBuffers(p: {
	regionProvince: Int32Array
	seeds: Int32Array
	desolate: Uint8Array
	landmassId: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
	size: Int32Array
	colors: Float32Array
}): Transferable[] {
	return [
		p.regionProvince.buffer as ArrayBuffer,
		p.seeds.buffer as ArrayBuffer,
		p.desolate.buffer as ArrayBuffer,
		p.landmassId.buffer as ArrayBuffer,
		p.adjOffset.buffer as ArrayBuffer,
		p.adjList.buffer as ArrayBuffer,
		p.size.buffer as ArrayBuffer,
		p.colors.buffer as ArrayBuffer,
	]
}

function buildTransferList(world: SerializedGenesisWorld): Transferable[] {
	const transfer = new Set<Transferable>([
		world.mesh.r_xyz.buffer,
		world.mesh.t_xyz.buffer,
		world.mesh.triangles.buffer,
		world.mesh.halfedges.buffer,
		world.mesh.adjOffset.buffer,
		world.mesh.adjList.buffer,
		world.mesh.neighborDist.buffer,
		world.mesh.s_begin_r.buffer,
		world.mesh.s_end_r.buffer,
		world.mesh.s_inner_t.buffer,
		world.mesh.s_outer_t.buffer,
		world.plateAssignment.buffer,
		world.elevation.buffer,
		world.elevation_km.buffer,
	])
	const add = (...items: Transferable[]) => {
		for (const item of items) transfer.add(item)
	}
	if (world.terrainFeatures) {
		add(
			world.terrainFeatures.featureMask.buffer,
			world.terrainFeatures.dominantFeature.buffer,
		)
	}
	if (world.climate) {
		add(
			world.climate.temperature_avg.buffer,
			world.climate.temperature_min.buffer,
			world.climate.temperature_max.buffer,
			world.climate.temperature_monthly.buffer,
			world.climate.temperature_monthly_nolapse.buffer,
			world.climate.temperature_monthly_range.buffer,
			world.climate.insolation_monthly.buffer,
			world.climate.pet_monthly.buffer,
			world.climate.daylight_hours_monthly.buffer,
		)
		if (world.climate.real_temperature_avg) {
			add(world.climate.real_temperature_avg.buffer)
		}
		if (world.climate.real_temperature_monthly) {
			add(world.climate.real_temperature_monthly.buffer)
		}
		if (world.climate.temperature_diff_avg) {
			add(world.climate.temperature_diff_avg.buffer)
		}
		if (world.climate.temperature_diff_monthly) {
			add(world.climate.temperature_diff_monthly.buffer)
		}
	}
	if (world.oceanDist) add(world.oceanDist.buffer)
	if (world.distCoast) add(world.distCoast.buffer)
	if (world.rainfall) {
		add(
			world.rainfall.monthly.buffer,
			world.rainfall.annual.buffer,
			world.rainfall.east.buffer,
			world.rainfall.west.buffer,
		)
		if (world.rainfall.real_monthly) add(world.rainfall.real_monthly.buffer)
		if (world.rainfall.real_annual) add(world.rainfall.real_annual.buffer)
		if (world.rainfall.diff_monthly) add(world.rainfall.diff_monthly.buffer)
		if (world.rainfall.diff_annual) add(world.rainfall.diff_annual.buffer)
	}
	if (world.cycloneRisk) add(world.cycloneRisk.buffer)
	if (world.tornadoRisk) add(world.tornadoRisk.buffer)
	if (world.tidalRange) add(world.tidalRange.buffer)
	if (world.hazards) {
		add(
			world.hazards.earthquake.buffer,
			world.hazards.volcano.buffer,
			world.hazards.danger.buffer,
		)
	}
	if (world.volcanism)
		add(world.volcanism.hotspot.buffer, world.volcanism.mantleUpwelling.buffer)
	if (world.climateZones) add(world.climateZones.buffer)
	if (world.pastaClimate) add(world.pastaClimate.buffer)
	if (world.pastaDebug) {
		for (const arr of Object.values(world.pastaDebug)) {
			add((arr as Float32Array).buffer)
		}
	}
	if (world.koppenClimate) add(world.koppenClimate.buffer)
	if (world.realKoppenClimate) add(world.realKoppenClimate.buffer)
	if (world.realPastaClimate) add(world.realPastaClimate.buffer)
	if (world.iceThickness) add(world.iceThickness.buffer)
	if (world.iceMinMonthly) add(world.iceMinMonthly.buffer)
	if (world.iceMaxMonthly) add(world.iceMaxMonthly.buffer)
	if (world.vegetation) add(world.vegetation.buffer)
	if (world.topography) add(world.topography.buffer)
	if (world.coastal) add(world.coastal.buffer)
	if (world.waterAccess) add(world.waterAccess.buffer)
	if (world.riverAccess) add(world.riverAccess.buffer)
	if (world.lakeAccess) add(world.lakeAccess.buffer)
	if (world.slopeScore) add(world.slopeScore.buffer)
	if (world.dtr_annual) add(world.dtr_annual.buffer)
	if (world.dtr_monthly) add(world.dtr_monthly.buffer)
	if (world.observedDtr?.real_monthly)
		add(world.observedDtr.real_monthly.buffer)
	if (world.observedDtr?.real_annual) add(world.observedDtr.real_annual.buffer)
	if (world.observedDtr?.diff_monthly)
		add(world.observedDtr.diff_monthly.buffer)
	if (world.observedDtr?.diff_annual) add(world.observedDtr.diff_annual.buffer)
	if (world.observedHumidity?.real_monthly)
		add(world.observedHumidity.real_monthly.buffer)
	if (world.observedHumidity?.real_annual)
		add(world.observedHumidity.real_annual.buffer)
	if (world.hydrology) add(world.hydrology.aet_monthly.buffer)
	if (world.isLand) add(world.isLand.buffer)
	if (world.riverLand) add(world.riverLand.buffer)
	if (world.settlementRegions) add(world.settlementRegions.buffer)
	if (world.settlementWaterLandmarks) add(world.settlementWaterLandmarks.buffer)
	if (world.settlementPortRegions) add(world.settlementPortRegions.buffer)
	if (world.routes) {
		add(
			world.routes.fromProvince.buffer,
			world.routes.toProvince.buffer,
			world.routes.kind.buffer,
			world.routes.pathOffsets.buffer,
			world.routes.pathRegions.buffer,
		)
	}
	if (world.network) {
		add(
			world.network.fromRegion.buffer,
			world.network.toRegion.buffer,
			world.network.kind.buffer,
			world.network.usage.buffer,
			world.network.weight.buffer,
		)
	}
	if (world.provinces) add(...provinceBuffers(world.provinces))
	if (world.locations) add(...locationBuffers(world.locations))
	if (world.rivers) {
		add(
			world.rivers.flow.buffer,
			world.rivers.flow_monthly.buffer,
			world.rivers.riverId.buffer,
			world.rivers.riverLengthKm.buffer,
			world.rivers.visible.buffer,
			world.rivers.basinId.buffer,
			world.rivers.waterLevel.buffer,
		)
	}
	if (world.oceanCurrents) {
		add(
			world.oceanCurrents.oceanWarmth.buffer,
			world.oceanCurrents.coastalWarmth.buffer,
			world.oceanCurrents.temperatureDelta.buffer,
		)
		if (world.oceanCurrents.oceanWarmthMonthly) {
			add(world.oceanCurrents.oceanWarmthMonthly.buffer)
		}
		if (world.oceanCurrents.coastalWarmthMonthly) {
			add(world.oceanCurrents.coastalWarmthMonthly.buffer)
		}
		if (world.oceanCurrents.temperatureDeltaMonthly) {
			add(world.oceanCurrents.temperatureDeltaMonthly.buffer)
		}
	}
	if (world.monthlyTEQ) {
		for (const teq of world.monthlyTEQ) add(teq.buffer)
	}
	if (world.nations) add(...nationBuffers(world.nations))
	if (world.leaderDynasty) add(world.leaderDynasty.buffer)
	if (world.leaderNameSeed) add(world.leaderNameSeed.buffer)
	if (world.leaderClaim) add(world.leaderClaim.buffer)
	if (world.leaderBirthYear) add(world.leaderBirthYear.buffer)
	if (world.cultures) add(...partitionBuffers(world.cultures))
	if (world.heritages) add(...partitionBuffers(world.heritages))
	if (world.religions) add(...partitionBuffers(world.religions))
	if (world.religionTypes) add(world.religionTypes.buffer)
	if (world.landmarks) {
		add(
			world.landmarks.regionLandmark.buffer,
			world.landmarks.type.buffer,
			world.landmarks.size.buffer,
		)
		if (world.landmarks.dominantCulture) {
			add(world.landmarks.dominantCulture.buffer)
		}
		if (world.landmarks.nameSeeds) {
			add(world.landmarks.nameSeeds.buffer)
		}
	}
	if (world.development) add(world.development.buffer)
	if (world.urbanPopulation) add(world.urbanPopulation.buffer)
	if (world.population) {
		add(
			world.population.habitability.buffer,
			world.population.population.buffer,
		)
		if (world.population.migrationWave)
			add(world.population.migrationWave.buffer)
		if (world.population.cradleProvinces)
			add(world.population.cradleProvinces.buffer)
	}
	if (world.tradeGoods) add(world.tradeGoods.buffer)
	if (world.precomputedTerrainGeometry) {
		add(
			world.precomputedTerrainGeometry.positions.buffer,
			world.precomputedTerrainGeometry.normals.buffer,
			world.precomputedTerrainGeometry.colors.buffer,
			world.precomputedTerrainGeometry.faceToRegion.buffer,
		)
	}
	if (world.precomputedMapGeometry) {
		add(
			world.precomputedMapGeometry.positions.buffer,
			world.precomputedMapGeometry.colors.buffer,
			world.precomputedMapGeometry.lonLat.buffer,
			world.precomputedMapGeometry.faceToRegion.buffer,
		)
	}
	return Array.from(transfer)
}

self.onmessage = (event: MessageEvent<GenesisWorkerRequest>) => {
	const message = event.data

	if (message.type === "pause") {
		simulationRunning = false
		return
	}

	if (message.type === "simulate") {
		if (!historyState || !historyRng) {
			self.postMessage({
				type: "error",
				message: "No world generated yet - generate a world first",
			} satisfies GenesisWorkerResponse)
			return
		}
		void runSimulation(message.tickMs ?? STATE.yearMs)
		return
	}

	if (message.type === "pathfind") {
		if (!lastGeneratedWorld) {
			self.postMessage({
				type: "error",
				message: "No world generated yet",
			} satisfies GenesisWorkerResponse)
			return
		}

		const world = lastGeneratedWorld
		const numRegions = world.mesh.r_xyz.length / 3

		// Build route edge set from network
		const routeEdges = new Set<number>()
		if (message.network) {
			const span = numRegions
			for (let i = 0; i < message.network.kind.length; i++) {
				const from = message.network.fromRegion[i]
				const to = message.network.toRegion[i]
				const key = Math.min(from, to) * span + Math.max(from, to)
				routeEdges.add(key)
			}
		}

		const result = PATHFIND.pathfind({
			graph: {
				numRegions,
				adjOffset: world.mesh.adjOffset,
				adjList: world.mesh.adjList,
				r_xyz: world.mesh.r_xyz,
				regionIsLand: world.isLand ?? null,
				vegetation: world.vegetation ?? null,
				topography: world.topography ?? null,
				waterDepth: null,
				routeEdges,
				planetRadiusKm: world.params.planetRadiusKm ?? 6371,
				regionProvince: world.regionProvince,
				desolate: world.desolate,
			},
			request: {
				startRegion: message.startRegion,
				endRegion: message.endRegion,
				allowLand: message.allowLand,
				allowSea: message.allowSea,
			},
		})

		self.postMessage({
			type: "pathfind-result",
			pathRegions: Int32Array.from(result.pathRegions),
			distanceKm: result.distanceKm,
			landKm: result.landKm,
			seaKm: result.seaKm,
			travelDays: result.travelDays,
			reachable: result.reachable,
		} satisfies GenesisWorkerResponse)
		return
	}

	const progressCb = (label: string, pct?: number) => {
		self.postMessage({
			type: "progress",
			label,
			pct,
		} satisfies GenesisWorkerResponse)
	}

	try {
		let generated: ReturnType<typeof GENERATE_WORLD.generateGenesisWorld>
		if (message.type === "generate") {
			generated = GENERATE_WORLD.generateGenesisWorld({
				params: message.params,
				onProgress: progressCb,
			})
		} else if (message.type === "import") {
			generated = IMPORT_HEIGHTMAP.importGenesisWorld({
				params: message.params,
				onProgress: progressCb,
			})
		} else {
			return
		}

		historyState = null
		historyRng = null
		historyTime = 800 * STATE.yearMs
		simulationRunning = false
		historyEventCursor = 0
		if (
			generated.nations &&
			generated.provinces &&
			generated.population &&
			generated.coastal &&
			generated.waterAccess &&
			generated.rivers?.visible &&
			generated.cultures
		) {
			progressCb("Initializing history", 95)
			historyRng = HISTORY_RNG.createHistoryRng(generated.params.seed + 99999)
			historyState = HISTORY.initHistory({
				nations: generated.nations,
				provinces: generated.provinces,
				population: generated.population,
				coastal: generated.coastal,
				waterAccess: generated.waterAccess,
				riverVisible: generated.rivers.visible,
				r_xyz: generated.mesh.r_xyz,
				cultures: generated.cultures,
				era: generated.params.era,
				seed: generated.params.seed,
				landmarks: generated.landmarks,
				regionProvince: generated.provinces.regionProvince,
				regionAdjOffset: generated.mesh.adjOffset,
				regionAdjList: generated.mesh.adjList,
				regionIsLand: generated.isLand,
				planetRadiusKm: generated.params.planetRadiusKm,
				settlementRegions: generated.settlementRegions,
				settlementWaterLandmarks: generated.settlementWaterLandmarks,
				settlementPortRegions: generated.settlementPortRegions,
			})
			historyTime = historyState.time
		}

		lastGeneratedWorld = clonePathfindSeedWorld(generated)

		const world = attachPrecomputedGeometry(serializeWorld(generated))
		progressCb("Done", 100)
		const frame = historyState
			? SNAPSHOT.buildHistoryFrame({ state: historyState })
			: undefined
		self.postMessage(
			{ type: "done", world, frame } satisfies GenesisWorkerResponse,
			frame
				? [...buildTransferList(world), ...buildFrameTransferList(frame)]
				: buildTransferList(world),
		)
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error))
		self.postMessage({
			type: "error",
			message: err.message,
			stack: err.stack,
		} satisfies GenesisWorkerResponse)
	}
}
