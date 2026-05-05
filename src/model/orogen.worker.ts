/// <reference lib="webworker" />

import type { OrogenNationHierarchy, OrogenProvinces } from "."
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
import { generateOrogenWorld } from "./pipelines/generate-world"
import { importOrogenWorld } from "./pipelines/import-heightmap"
import type { ProvincePopulation } from "./society/population"
import type {
	OrogenWorkerRequest,
	OrogenWorkerResponse,
	SerializedHistoryFrame,
	SerializedOrogenWorld,
	SerializedTimelines,
} from "./transport/worker-types"

declare const self: DedicatedWorkerGlobalScope

let historyState: HistoryState | null = null
let historyRng: ReturnType<typeof createHistoryRng> | null = null
let historyTime = 800 * YEAR_MS
let simulationRunning = false

interface HistorySeedWorld {
	params: { seed: number }
	mesh: { r_xyz: Float32Array }
	nations: OrogenNationHierarchy | null
	provinces: OrogenProvinces | null
	population: ProvincePopulation | null
	coastal: Uint8Array | null
	riverVisible: Uint8Array | null
	cultures: { assignment: Int32Array; genderSystems?: Uint8Array } | null
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
		params: { seed: world.params.seed },
		mesh: { r_xyz: world.mesh.r_xyz.slice() },
		nations: world.nations ? cloneNations(world.nations) : null,
		provinces: world.provinces ? cloneProvinces(world.provinces) : null,
		population: world.population
			? {
					habitability: world.population.habitability.slice(),
					population: world.population.population.slice(),
					habitabilityScore: world.population.habitabilityScore,
					totalPopulation: world.population.totalPopulation,
				}
			: null,
		coastal: world.coastal ? world.coastal.slice() : null,
		riverVisible: world.rivers?.visible ? world.rivers.visible.slice() : null,
		cultures: world.cultures
			? {
					assignment: world.cultures.assignment.slice(),
					genderSystems: world.cultures.genderSystems?.slice(),
				}
			: null,
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
		frame.adjOffset.buffer,
		frame.adjList.buffer,
		frame.populationTotal.buffer,
		frame.populationUrban.buffer,
		frame.development.buffer,
		frame.consumption.buffer,
		frame.nationWealth.buffer,
		frame.nationOptimalWealth.buffer,
		frame.relationA.buffer,
		frame.relationB.buffer,
		frame.relationValues.buffer,
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
					lakes: world.rivers.lakes,
					basinId: world.rivers.basinId,
					waterLevel: world.rivers.waterLevel,
					lines: world.rivers.lines,
					maxFlow: world.rivers.maxFlow,
					minFlow: world.rivers.minFlow,
				}
			: world.rivers,
		oceanCurrents: world.oceanCurrents,
		provinces: world.provinces,
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
	if (world.slopeScore) add(world.slopeScore.buffer)
	if (world.dtr_annual) add(world.dtr_annual.buffer)
	if (world.dtr_monthly) add(world.dtr_monthly.buffer)
	if (world.hydrology) add(world.hydrology.aet_monthly.buffer)
	if (world.isLand) add(world.isLand.buffer)
	if (world.riverLand) add(world.riverLand.buffer)
	if (world.provinces) add(...provinceBuffers(world.provinces))
	if (world.rivers) {
		add(
			world.rivers.flow.buffer,
			world.rivers.flow_monthly.buffer,
			world.rivers.riverId.buffer,
			world.rivers.riverLengthKm.buffer,
			world.rivers.visible.buffer,
			world.rivers.lakes.buffer,
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
	}
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
				riverVisible: world.riverVisible,
				r_xyz: world.mesh.r_xyz,
				cultures: world.cultures,
				seed: world.params.seed,
			})
			historyTime = historyState.time
		}
		void runSimulation(message.tickMs ?? YEAR_MS)
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
		const seedHistoryState =
			generated.nations &&
			generated.provinces &&
			generated.population &&
			generated.coastal &&
			generated.rivers?.visible &&
			generated.cultures
				? initHistory({
						nations: generated.nations,
						provinces: generated.provinces,
						population: generated.population,
						coastal: generated.coastal,
						riverVisible: generated.rivers.visible,
						r_xyz: generated.mesh.r_xyz,
						cultures: generated.cultures,
						seed: generated.params.seed,
					})
				: null

		const world = serializeWorld(generated, seedHistoryState)
		const frame = seedHistoryState
			? buildHistoryFrame(seedHistoryState)
			: undefined
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
