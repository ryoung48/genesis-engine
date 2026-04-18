/// <reference lib="webworker" />

import {
	createHistoryRng,
	initHistory,
	simulateUntil,
	YEAR_MS,
} from "./history"
import { PROV } from "./history/fields"
import {
	ensureHierarchyClean,
	type HistoryState,
	validateLiveHierarchy,
} from "./history/state"
import type { Timeline } from "./history/timeline"
import { importOrogenWorld } from "./import"
import type { ProvincePopulation } from "./partitions/population"
import { generateOrogenWorld } from "./pipeline"
import type { OrogenNationHierarchy, OrogenProvinces } from "./types"
import type {
	OrogenWorkerRequest,
	OrogenWorkerResponse,
	SerializedHistoryFrame,
	SerializedOrogenWorld,
	SerializedProvinceTimelineFloat,
	SerializedProvinceTimelineInt,
	SerializedTimelines,
} from "./worker-types"

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
	cultures: { assignment: Int32Array } | null
}

let lastGeneratedWorld: HistorySeedWorld | null = null

function cloneNations(n: OrogenNationHierarchy): OrogenNationHierarchy {
	return {
		assignment: n.assignment.slice(),
		seeds: n.seeds.slice(),
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
			? { assignment: world.cultures.assignment.slice() }
			: null,
	}
}

function flattenIntTimelineField(
	field: Timeline<number>[],
): SerializedProvinceTimelineInt {
	const offsets = new Int32Array(field.length + 1)
	let total = 0
	for (let i = 0; i < field.length; i++) {
		total += field[i].length
		offsets[i + 1] = total
	}
	const times = new Float64Array(total)
	const values = new Int32Array(total)
	let cursor = 0
	for (const timeline of field) {
		for (const entry of timeline) {
			times[cursor] = entry.time
			values[cursor] = Math.round(entry.value)
			cursor++
		}
	}
	return { times, values, offsets }
}

function flattenFloatTimelineField(
	field: Timeline<number>[],
): SerializedProvinceTimelineFloat {
	const offsets = new Int32Array(field.length + 1)
	let total = 0
	for (let i = 0; i < field.length; i++) {
		total += field[i].length
		offsets[i + 1] = total
	}
	const times = new Float64Array(total)
	const values = new Float32Array(total)
	let cursor = 0
	for (const timeline of field) {
		for (const entry of timeline) {
			times[cursor] = entry.time
			values[cursor] = entry.value
			cursor++
		}
	}
	return { times, values, offsets }
}

function serializeTimelines(state: HistoryState): SerializedTimelines {
	const relationEntries = Array.from(state._relations.entries()).sort(
		([a], [b]) => a - b,
	)
	const relationOffsets = new Int32Array(relationEntries.length + 1)
	let relationCount = 0
	for (let i = 0; i < relationEntries.length; i++) {
		relationCount += relationEntries[i][1].length
		relationOffsets[i + 1] = relationCount
	}
	const relationTimes = new Float64Array(relationCount)
	const relationValues = new Int32Array(relationCount)
	const relationA = new Int32Array(relationEntries.length)
	const relationB = new Int32Array(relationEntries.length)
	let cursor = 0
	for (let i = 0; i < relationEntries.length; i++) {
		const [key, timeline] = relationEntries[i]
		relationA[i] = Math.floor(key / state.P)
		relationB[i] = key % state.P
		for (const entry of timeline) {
			relationTimes[cursor] = entry.time
			relationValues[cursor] = entry.value
			cursor++
		}
	}

	const nationColorKeys = new Int32Array(state.nationColors.size)
	const nationColorValues = new Float32Array(state.nationColors.size * 3)
	let colorIndex = 0
	for (const [key, value] of state.nationColors.entries()) {
		nationColorKeys[colorIndex] = key
		nationColorValues[colorIndex * 3] = value[0]
		nationColorValues[colorIndex * 3 + 1] = value[1]
		nationColorValues[colorIndex * 3 + 2] = value[2]
		colorIndex++
	}

	return {
		P: state.P,
		startTimeMs: 800 * YEAR_MS,
		endTimeMs: historyTime,
		parent: flattenIntTimelineField(state._parent),
		assignment: flattenIntTimelineField(state._assignment),
		populationRural: flattenFloatTimelineField(state._pop_rural),
		populationUrban: flattenFloatTimelineField(state._pop_urban),
		development: flattenFloatTimelineField(state._development),
		consumption: flattenFloatTimelineField(state._consumption),
		leaderDynasty: flattenIntTimelineField(state._leader_dyn),
		leaderClaim: flattenIntTimelineField(state._leader_claim),
		occupation: flattenIntTimelineField(state._occupation),
		relations: {
			aIdx: relationA,
			bIdx: relationB,
			offsets: relationOffsets,
			times: relationTimes,
			values: relationValues,
		},
		nationColorKeys,
		nationColorValues,
		wars: state.wars.map((war) => ({ ...war })),
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
		timelines.leaderClaim.times.buffer,
		timelines.leaderClaim.values.buffer,
		timelines.leaderClaim.offsets.buffer,
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

function buildFrame(state: HistoryState): SerializedHistoryFrame {
	const P = state.P
	const assignment = new Int32Array(P)
	const parent = new Int32Array(P)
	const sovereign = new Int32Array(P)
	const colors = new Float32Array(P * 3)
	const adjOffset = new Int32Array(P + 1)
	const populationTotal = new Float32Array(P)
	const populationUrban = new Float32Array(P)
	const development = new Float32Array(P)
	const consumption = new Float32Array(P)
	const nationWealth = new Float32Array(P)
	const nationOptimalWealth = new Float32Array(P)

	ensureHierarchyClean(state)
	for (let p = 0; p < P; p++) {
		parent[p] = PROV.parent.get(state, p)
	}

	for (let p = 0; p < P; p++) {
		assignment[p] = PROV.assignment.get(state, p)
		sovereign[p] = state.sovereignCurrent[p]
		populationUrban[p] = PROV.population.urban.get(state, p)
		populationTotal[p] =
			PROV.population.rural.get(state, p) + populationUrban[p]
		development[p] = PROV.development.get(state, p)
		consumption[p] = PROV.consumption.get(state, p)
		const color = state.nationColors.get(assignment[p])
		if (color) {
			const base = p * 3
			colors[base] = color[0]
			colors[base + 1] = color[1]
			colors[base + 2] = color[2]
		}
	}

	const neighborSets = new Map<number, Set<number>>()
	for (let p = 0; p < P; p++) {
		const nation = assignment[p]
		if (nation < 0) continue
		if (!neighborSets.has(nation)) neighborSets.set(nation, new Set())
		for (
			let i = state.provinceAdjOffset[p];
			i < state.provinceAdjOffset[p + 1];
			i++
		) {
			const nbNation = assignment[state.provinceAdjList[i]]
			if (nbNation >= 0 && nbNation !== nation) {
				neighborSets.get(nation)?.add(nbNation)
			}
		}
	}

	let totalAdj = 0
	for (let p = 0; p < P; p++) {
		totalAdj += neighborSets.get(p)?.size ?? 0
		adjOffset[p + 1] = totalAdj
	}
	const adjList = new Int32Array(totalAdj)
	for (let p = 0; p < P; p++) {
		let idx = adjOffset[p]
		for (const nb of neighborSets.get(p) ?? []) adjList[idx++] = nb
	}

	const activeWars = state.wars
		.filter(
			(war) =>
				war.startTime <= state.time &&
				(war.endTime ?? Number.POSITIVE_INFINITY) > state.time,
		)
		.map((war) => ({
			idx: war.idx,
			attacker: war.attacker,
			defender: war.defender,
			rebel: war.rebel,
			occupied: Array.from({ length: P }, (_, p) => p).filter(
				(p) => PROV.occupation.get(state, p) === war.idx,
			),
		}))

	let sovereignCount = 0
	let totalPopulation = 0
	for (let p = 0; p < P; p++) {
		if (parent[p] < 0 && assignment[p] >= 0) {
			sovereignCount++
			nationWealth[p] = Math.max(0, state.habitability[p] - consumption[p])
			nationOptimalWealth[p] = state.habitability[p]
		}
		totalPopulation += populationTotal[p]
	}

	return {
		timeMs: state.time,
		assignment,
		parent,
		sovereign,
		colors,
		adjOffset,
		adjList,
		populationTotal,
		populationUrban,
		development,
		consumption,
		nationWealth,
		nationOptimalWealth,
		activeWars,
		sovereignCount,
		totalPopulation,
	}
}

function buildFrameTransferList(frame: SerializedHistoryFrame): Transferable[] {
	return [
		frame.assignment.buffer,
		frame.parent.buffer,
		frame.sovereign.buffer,
		frame.colors.buffer,
		frame.adjOffset.buffer,
		frame.adjList.buffer,
		frame.populationTotal.buffer,
		frame.populationUrban.buffer,
		frame.development.buffer,
		frame.consumption.buffer,
		frame.nationWealth.buffer,
		frame.nationOptimalWealth.buffer,
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
		wind: world.wind,
		provinces: world.provinces,
		nations: world.nations,
		cultures: world.cultures,
		heritages: world.heritages,
		faiths: world.faiths,
		religions: world.religions,
		landmarks: world.landmarks
			? {
					regionLandmark: world.landmarks.regionLandmark,
					type: world.landmarks.type,
					size: world.landmarks.size,
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
	adjOffset: Int32Array
	adjList: Int32Array
	size: Int32Array
	colors: Float32Array
}): Transferable[] {
	return [
		p.assignment.buffer as ArrayBuffer,
		p.seeds.buffer as ArrayBuffer,
		p.adjOffset.buffer as ArrayBuffer,
		p.adjList.buffer as ArrayBuffer,
		p.size.buffer as ArrayBuffer,
		p.colors.buffer as ArrayBuffer,
	]
}

function nationBuffers(n: {
	assignment: Int32Array
	seeds: Int32Array
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
	return [
		...partitionBuffers(n),
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
	if (world.volcanism) add(world.volcanism.hotspot.buffer)
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
	if (world.wind) {
		add(
			world.wind.wind_east_monthly.buffer,
			world.wind.wind_north_monthly.buffer,
			world.wind.wind_speed_monthly.buffer,
		)
	}
	if (world.monthlyTEQ) {
		for (const teq of world.monthlyTEQ) add(teq.buffer)
	}
	if (world.nations) add(...nationBuffers(world.nations))
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
	const timelines = serializeTimelines(historyState)
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
			const frame = buildFrame(historyState)
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
		self.postMessage(
			{ type: "done", world } satisfies OrogenWorkerResponse,
			buildTransferList(world),
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
