/// <reference lib="webworker" />

import type { OrogenNationHierarchy, OrogenProvinces, StageTiming } from "."
import {
	createHistoryRng,
	initHistory,
	simulateUntil,
	YEAR_MS,
} from "./history"
import { PROV } from "./history/fields"
import {
	buildHistoryFrame,
	serializeHistoryTimelines,
} from "./history/snapshot"
import { type HistoryState, validateLiveHierarchy } from "./history/state"
import { pathfind } from "./pathfinding/pathfind"
import { generateOrogenWorld } from "./pipelines/generate-world"
import { importOrogenWorld } from "./pipelines/import-heightmap"
import type { ProvincePopulation } from "./society/population"
import type { OrogenLandmarks } from "./terrain/landmarks"
import type {
	OrogenWorkerRequest,
	OrogenWorkerResponse,
	SerializedHistoryFrame,
	SerializedOrogenWorld,
	SerializedTimelines,
} from "./transport/worker-types"
import { packNetwork, packRoutes } from "./transport/worker-types"

declare const self: DedicatedWorkerGlobalScope

let historyState: HistoryState | null = null
let historyRng: ReturnType<typeof createHistoryRng> | null = null
let historyTime = 800 * YEAR_MS
let simulationRunning = false

interface HistorySeedWorld {
	params: { seed: number; planetRadiusKm?: number }
	mesh: { r_xyz: Float32Array; adjOffset: Int32Array; adjList: Int32Array }
	nations: OrogenNationHierarchy | null
	provinces: OrogenProvinces | null
	population: ProvincePopulation | null
	coastal: Uint8Array | null
	waterAccess: Uint8Array | null
	riverAccess: Uint8Array | null
	lakeAccess: Uint8Array | null
	riverVisible: Uint8Array | null
	isLand: Uint8Array | null
	vegetation: Uint8Array | null
	topography: Uint8Array | null
	cultures: {
		assignment: Int32Array
		count: number
		genderSystems?: Uint8Array
	} | null
	landmarks: OrogenLandmarks | null
	settlementRegions: Int32Array | null
	settlementWaterLandmarks: Int32Array | null
	settlementPortRegions: Int32Array | null
}

let lastGeneratedWorld: HistorySeedWorld | null = null

function cloneNations(n: OrogenNationHierarchy): OrogenNationHierarchy {
	return {
		assignment: n.assignment.slice(),
		seeds: n.seeds.slice(),
		languageSeeds: n.languageSeeds?.slice() ?? new Int32Array(0),
		nameSeeds: n.nameSeeds?.slice() ?? new Int32Array(0),
		count: n.count,
		adjOffset: n.adjOffset.slice(),
		adjList: n.adjList.slice(),
		size: n.size.slice(),
		colors: n.colors.slice(),
		parent: n.parent.slice(),
		depth: n.depth.slice(),
		childOffset: n.childOffset.slice(),
		childList: n.childList.slice(),
		sovereign: n.sovereign.slice(),
		gravity: n.gravity.slice(),
		governmentType: n.governmentType?.slice(),
		nationColonizer: n.nationColonizer?.slice(),
	}
}

function cloneProvinces(p: OrogenProvinces): OrogenProvinces {
	return {
		regionProvince: p.regionProvince.slice(),
		seeds: p.seeds.slice(),
		count: p.count,
		desolate: p.desolate.slice(),
		landmassId: p.landmassId.slice(),
		adjOffset: p.adjOffset.slice(),
		adjList: p.adjList.slice(),
		size: p.size.slice(),
		colors: p.colors.slice(),
	}
}

function cloneHistorySeedWorld(
	world: ReturnType<typeof generateOrogenWorld>,
): HistorySeedWorld {
	return {
		params: {
			seed: world.params.seed,
			planetRadiusKm: world.params.planetRadiusKm,
		},
		mesh: {
			r_xyz: world.mesh.r_xyz.slice(),
			adjOffset: world.mesh.adjOffset.slice(),
			adjList: world.mesh.adjList.slice(),
		},
		nations: world.nations ? cloneNations(world.nations) : null,
		provinces: world.provinces ? cloneProvinces(world.provinces) : null,
		population: world.population
			? {
					habitability: world.population.habitability.slice(),
					population: world.population.population.slice(),
					habitabilityScore: world.population.habitabilityScore,
					totalPopulation: world.population.totalPopulation,
					...(world.population.migrationWave && {
						migrationWave: world.population.migrationWave.slice(),
					}),
					...(world.population.cradleProvinces && {
						cradleProvinces: world.population.cradleProvinces.slice(),
					}),
					...(world.population.settlementWave !== undefined && {
						settlementWave: world.population.settlementWave,
					}),
				}
			: null,
		coastal: world.coastal ? world.coastal.slice() : null,
		waterAccess: world.waterAccess ? world.waterAccess.slice() : null,
		riverAccess: world.riverAccess ? world.riverAccess.slice() : null,
		lakeAccess: world.lakeAccess ? world.lakeAccess.slice() : null,
		riverVisible: world.rivers?.visible ? world.rivers.visible.slice() : null,
		isLand: world.isLand ? world.isLand.slice() : null,
		vegetation: world.vegetation ? world.vegetation.slice() : null,
		topography: world.topography ? world.topography.slice() : null,
		cultures: world.cultures
			? {
					assignment: world.cultures.assignment.slice(),
					count: world.cultures.count,
					genderSystems: world.cultures.genderSystems?.slice(),
				}
			: null,
		landmarks: world.landmarks
			? {
					regionLandmark: world.landmarks.regionLandmark.slice(),
					type: world.landmarks.type.slice(),
					size: world.landmarks.size.slice(),
					count: world.landmarks.count,
				}
			: null,
		settlementRegions: world.settlementRegions?.slice() ?? null,
		settlementWaterLandmarks: world.settlementWaterLandmarks?.slice() ?? null,
		settlementPortRegions: world.settlementPortRegions?.slice() ?? null,
	}
}

function buildTimelineTransferList(
	timelines: SerializedTimelines,
): Transferable[] {
	return [
		timelines.parent.times.buffer,
		timelines.parent.values.buffer,
		timelines.parent.offsets.buffer,
		timelines.assignment.times.buffer,
		timelines.assignment.values.buffer,
		timelines.assignment.offsets.buffer,
		timelines.populationRural.times.buffer,
		timelines.populationRural.values.buffer,
		timelines.populationRural.offsets.buffer,
		timelines.populationUrban.times.buffer,
		timelines.populationUrban.values.buffer,
		timelines.populationUrban.offsets.buffer,
		timelines.development.times.buffer,
		timelines.development.values.buffer,
		timelines.development.offsets.buffer,
		timelines.consumption.times.buffer,
		timelines.consumption.values.buffer,
		timelines.consumption.offsets.buffer,
		timelines.leaderDynasty.times.buffer,
		timelines.leaderDynasty.values.buffer,
		timelines.leaderDynasty.offsets.buffer,
		...(timelines.leaderNameSeed
			? [
					timelines.leaderNameSeed.times.buffer,
					timelines.leaderNameSeed.values.buffer,
					timelines.leaderNameSeed.offsets.buffer,
				]
			: []),
		timelines.leaderClaim.times.buffer,
		timelines.leaderClaim.values.buffer,
		timelines.leaderClaim.offsets.buffer,
		...(timelines.leaderBirthYear
			? [
					timelines.leaderBirthYear.times.buffer,
					timelines.leaderBirthYear.values.buffer,
					timelines.leaderBirthYear.offsets.buffer,
				]
			: []),
		timelines.occupation.times.buffer,
		timelines.occupation.values.buffer,
		timelines.occupation.offsets.buffer,
		timelines.relations.aIdx.buffer,
		timelines.relations.bIdx.buffer,
		timelines.relations.offsets.buffer,
		timelines.relations.times.buffer,
		timelines.relations.values.buffer,
		timelines.nationColorKeys.buffer,
		timelines.nationColorValues.buffer,
	]
}

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

function serializeWorld(
	world: ReturnType<typeof generateOrogenWorld>,
	seedHistoryState: HistoryState | null,
): SerializedOrogenWorld {
	return {
		mesh: world.mesh,
		plateAssignment: world.plateAssignment,
		elevation: world.elevation,
		terrainFeatures: world.terrainFeatures,
		elevation_km: world.elevation_km,
		params: world.params,
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
		volcanism: world.volcanism,
		climateZones: world.climateZones,
		pastaClimate: world.pastaClimate,
		pastaDebug: world.pastaDebug,
		iceThickness: world.iceThickness,
		iceMinMonthly: world.iceMinMonthly,
		iceMaxMonthly: world.iceMaxMonthly,
		koppenClimate: world.koppenClimate,
		vegetation: world.vegetation,
		topography: world.topography,
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
		leaderDynasty: seedHistoryState?.leaderDynCurrent.slice(),
		leaderNameSeed: seedHistoryState?.leaderNameSeedCurrent.slice(),
		leaderClaim: seedHistoryState
			? Int32Array.from(seedHistoryState.leaderClaimCurrent)
			: undefined,
		leaderBirthYear: seedHistoryState?.leaderBirthYearCurrent.slice(),
		cultures: world.cultures,
		heritages: world.heritages,
		faiths: world.faiths,
		religions: world.religions,
		landmarks: world.landmarks
			? {
					regionLandmark: world.landmarks.regionLandmark,
					type: world.landmarks.type,
					size: world.landmarks.size,
					dominantCulture: world.landmarks.dominantCulture,
					nameSeeds: world.landmarks.nameSeeds,
					count: world.landmarks.count,
				}
			: undefined,
		development: world.provinces
			? Float32Array.from({ length: world.provinces.count }, (_, province) =>
					seedHistoryState
						? PROV.development.get(seedHistoryState, province)
						: 0,
				)
			: undefined,
		urbanPopulation: world.provinces
			? Float32Array.from({ length: world.provinces.count }, (_, province) =>
					seedHistoryState
						? PROV.population.urban.get(seedHistoryState, province)
						: 0,
				)
			: undefined,
		population: world.population,
		monthlyTEQ: world.monthlyTEQ,
		dtr_annual: world.dtr_annual,
		dtr_monthly: world.dtr_monthly,
		hydrology: world.hydrology
			? { aet_monthly: world.hydrology.aet_monthly }
			: undefined,
		tradeGoods: world.tradeGoods?.material,
		settlementRegions: world.settlementRegions,
		settlementWaterLandmarks: world.settlementWaterLandmarks,
		settlementPortRegions: world.settlementPortRegions,
		routes: seedHistoryState ? packRoutes(seedHistoryState.routes) : undefined,
		network: seedHistoryState
			? packNetwork(seedHistoryState.network)
			: undefined,
	}
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

function buildTransferList(world: SerializedOrogenWorld): Transferable[] {
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
	if (world.faiths) add(...partitionBuffers(world.faiths))
	if (world.religions) add(...partitionBuffers(world.religions))
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
	return Array.from(transfer)
}

function emitSimulationDone(): void {
	if (!historyState) return
	const timelines = serializeHistoryTimelines(historyState, historyTime)
	const done: OrogenWorkerResponse = {
		type: "sim-done",
		timeMs: historyTime,
		timelines,
		events: historyState.events,
	}
	self.postMessage(done, buildTimelineTransferList(timelines))
}

async function runSimulation(tickMs = YEAR_MS): Promise<void> {
	if (!historyState || !historyRng) return
	simulationRunning = true

	while (simulationRunning) {
		try {
			historyTime += tickMs
			simulateUntil(historyState, historyTime, historyRng)
			validateLiveHierarchy(historyState, `worker-post-simulate ${historyTime}`)
			const frame = buildHistoryFrame(historyState)
			const progress: OrogenWorkerResponse = {
				type: "sim-progress",
				timeMs: historyTime,
				frame,
			}
			self.postMessage(progress, buildFrameTransferList(frame))
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error))
			const failure: OrogenWorkerResponse = {
				type: "error",
				message: `Simulation error at ${historyTime}: ${err.message}`,
				stack: err.stack,
			}
			self.postMessage(failure)
			simulationRunning = false
			return
		}
		await new Promise((resolve) => setTimeout(resolve, 0))
	}

	emitSimulationDone()
}

self.onmessage = (event: MessageEvent<OrogenWorkerRequest>) => {
	const message = event.data

	if (message.type === "pause") {
		simulationRunning = false
		return
	}

	if (message.type === "simulate") {
		if (!lastGeneratedWorld) {
			self.postMessage({
				type: "error",
				message: "No world generated yet - generate a world first",
			} satisfies OrogenWorkerResponse)
			return
		}
		if (!historyState) {
			const world = lastGeneratedWorld
			if (
				!world.nations ||
				!world.provinces ||
				!world.population ||
				!world.coastal ||
				!world.riverVisible ||
				!world.cultures
			) {
				self.postMessage({
					type: "error",
					message:
						"World is missing nations/provinces/population - cannot simulate",
				} satisfies OrogenWorkerResponse)
				return
			}
			historyRng = createHistoryRng(world.params.seed + 99999)
			historyState = initHistory({
				nations: world.nations,
				provinces: world.provinces,
				population: world.population,
				coastal: world.coastal,
				waterAccess: world.waterAccess,
				riverVisible: world.riverVisible,
				r_xyz: world.mesh.r_xyz,
				cultures: world.cultures,
				seed: world.params.seed,
				landmarks: world.landmarks ?? undefined,
				regionProvince: world.provinces?.regionProvince,
				regionAdjOffset: world.mesh.adjOffset,
				regionAdjList: world.mesh.adjList,
				regionIsLand: world.isLand ?? undefined,
				planetRadiusKm: world.params.planetRadiusKm,
				settlementRegions: world.settlementRegions ?? undefined,
				settlementWaterLandmarks: world.settlementWaterLandmarks ?? undefined,
				settlementPortRegions: world.settlementPortRegions ?? undefined,
			})
			historyTime = historyState.time
		}
		void runSimulation(message.tickMs ?? YEAR_MS)
		return
	}

	if (message.type === "pathfind") {
		if (!lastGeneratedWorld) {
			self.postMessage({
				type: "error",
				message: "No world generated yet",
			} satisfies OrogenWorkerResponse)
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

		const result = pathfind(
			{
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
				regionProvince: world.provinces.regionProvince ?? null,
				desolate: world.provinces.desolate ?? null,
			},
			{
				startRegion: message.startRegion,
				endRegion: message.endRegion,
				allowLand: message.allowLand,
				allowSea: message.allowSea,
			},
		)

		self.postMessage({
			type: "pathfind-result",
			pathRegions: Int32Array.from(result.pathRegions),
			distanceKm: result.distanceKm,
			landKm: result.landKm,
			seaKm: result.seaKm,
			travelDays: result.travelDays,
			reachable: result.reachable,
		} satisfies OrogenWorkerResponse)
		return
	}

	const progressCb = (label: string, pct?: number) => {
		self.postMessage({
			type: "progress",
			label,
			pct,
		} satisfies OrogenWorkerResponse)
	}

	try {
		let generated: ReturnType<typeof generateOrogenWorld>
		if (message.type === "generate") {
			generated = generateOrogenWorld(message.params, progressCb)
		} else if (message.type === "import") {
			generated = importOrogenWorld(message.params, progressCb)
		} else {
			return
		}

		historyState = null
		historyRng = null
		historyTime = 800 * YEAR_MS
		simulationRunning = false
		lastGeneratedWorld = cloneHistorySeedWorld(generated)
		const seedWorld = lastGeneratedWorld
		if (
			seedWorld.nations &&
			seedWorld.provinces &&
			seedWorld.population &&
			seedWorld.coastal &&
			seedWorld.waterAccess &&
			seedWorld.riverVisible &&
			seedWorld.cultures
		) {
			const t0 = performance.now()
			progressCb("Initializing history", 80)
			const historyTimings: StageTiming[] = []
			historyRng = createHistoryRng(generated.params.seed + 99999)
			historyState = initHistory({
				nations: seedWorld.nations,
				provinces: seedWorld.provinces,
				population: seedWorld.population,
				coastal: seedWorld.coastal,
				waterAccess: seedWorld.waterAccess,
				riverVisible: seedWorld.riverVisible,
				r_xyz: seedWorld.mesh.r_xyz,
				cultures: seedWorld.cultures,
				seed: generated.params.seed,
				landmarks: seedWorld.landmarks,
				regionProvince: seedWorld.provinces.regionProvince,
				regionAdjOffset: seedWorld.mesh.adjOffset,
				regionAdjList: seedWorld.mesh.adjList,
				regionIsLand: seedWorld.isLand,
				planetRadiusKm: seedWorld.params.planetRadiusKm,
				settlementRegions: seedWorld.settlementRegions,
				settlementWaterLandmarks: seedWorld.settlementWaterLandmarks,
				settlementPortRegions: seedWorld.settlementPortRegions,
				timings: historyTimings,
			})
			historyTime = historyState.time
			progressCb("Computing trade routes", 90)
			generated.timings.push({
				Stage: "initHistory",
				ms: (performance.now() - t0).toFixed(1),
			})
			generated.timings.push(...historyTimings)
		}

		const world = serializeWorld(generated, historyState)
		progressCb("Done", 100)
		const frame = historyState ? buildHistoryFrame(historyState) : undefined
		self.postMessage(
			{ type: "done", world, frame } satisfies OrogenWorkerResponse,
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
		} satisfies OrogenWorkerResponse)
	}
}
