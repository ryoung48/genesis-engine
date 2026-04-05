/// <reference lib="webworker" />

import { importOrogenWorld } from "./import"
import { generateOrogenWorld } from "./pipeline"
import type {
	OrogenWorkerRequest,
	OrogenWorkerResponse,
	SerializedOrogenWorld,
} from "./worker-types"

declare const self: DedicatedWorkerGlobalScope

function serializeWorld(
	world: ReturnType<typeof generateOrogenWorld>,
): SerializedOrogenWorld {
	return {
		mesh: {
			numRegions: world.mesh.numRegions,
			numTriangles: world.mesh.numTriangles,
			numSides: world.mesh.numSides,
			r_xyz: world.mesh.r_xyz,
			t_xyz: world.mesh.t_xyz,
			triangles: world.mesh.triangles,
			halfedges: world.mesh.halfedges,
			adjOffset: world.mesh.adjOffset,
			adjList: world.mesh.adjList,
			neighborDist: world.mesh.neighborDist,
			s_begin_r: world.mesh.s_begin_r,
			s_end_r: world.mesh.s_end_r,
			s_inner_t: world.mesh.s_inner_t,
			s_outer_t: world.mesh.s_outer_t,
		},
		plateAssignment: world.plateAssignment,
		elevation: world.elevation,
		terrainFeatures: world.terrainFeatures
			? {
					featureMask: world.terrainFeatures.featureMask,
					dominantFeature: world.terrainFeatures.dominantFeature,
				}
			: undefined,
		elevation_km: world.elevation_km,
		params: world.params,
		timings: world.timings,
		continentCount: world.continentCount,
		climate: world.climate
			? {
					temperature_avg: world.climate.temperature_avg,
					temperature_min: world.climate.temperature_min,
					temperature_max: world.climate.temperature_max,
					temperature_monthly: world.climate.temperature_monthly,
					temperature_monthly_nolapse:
						world.climate.temperature_monthly_nolapse,
					temperature_monthly_range: world.climate.temperature_monthly_range,
					insolation_monthly: world.climate.insolation_monthly,
					pet_monthly: world.climate.pet_monthly,
					daylight_hours_monthly: world.climate.daylight_hours_monthly,
					landFraction: world.climate.landFraction,
				}
			: undefined,
		oceanDist: world.oceanDist,
		distCoast: world.distFields?.distCoast,
		rainfall: world.rainfall
			? {
					monthly: world.rainfall.monthly,
					annual: world.rainfall.annual,
					east: world.rainfall.east,
					west: world.rainfall.west,
				}
			: undefined,
		hazards: world.hazards
			? {
					earthquake: world.hazards.earthquake,
					volcano: world.hazards.volcano,
					danger: world.hazards.danger,
				}
			: undefined,
		volcanism: world.volcanism
			? {
					hotspot: world.volcanism.hotspot,
				}
			: undefined,
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
		rivers: world.rivers,
		oceanCurrents: world.oceanCurrents
			? {
					oceanWarmth: world.oceanCurrents.oceanWarmth,
					coastalWarmth: world.oceanCurrents.coastalWarmth,
					oceanWarmthMonthly: world.oceanCurrents.oceanWarmthMonthly,
					coastalWarmthMonthly: world.oceanCurrents.coastalWarmthMonthly,
					temperatureDeltaMonthly: world.oceanCurrents.temperatureDeltaMonthly,
					temperatureDelta: world.oceanCurrents.temperatureDelta,
				}
			: undefined,
		wind: world.wind
			? {
					wind_east_monthly: world.wind.wind_east_monthly,
					wind_north_monthly: world.wind.wind_north_monthly,
					wind_speed_monthly: world.wind.wind_speed_monthly,
				}
			: undefined,
		provinces: world.provinces
			? {
					regionProvince: world.provinces.regionProvince,
					seeds: world.provinces.seeds,
					count: world.provinces.count,
					desolate: world.provinces.desolate,
					landmassId: world.provinces.landmassId,
					adjOffset: world.provinces.adjOffset,
					adjList: world.provinces.adjList,
					size: world.provinces.size,
					colors: world.provinces.colors,
				}
			: undefined,
		nations: world.nations
			? {
					assignment: world.nations.assignment,
					seeds: world.nations.seeds,
					count: world.nations.count,
					adjOffset: world.nations.adjOffset,
					adjList: world.nations.adjList,
					size: world.nations.size,
					colors: world.nations.colors,
					parent: world.nations.parent,
					depth: world.nations.depth,
					childOffset: world.nations.childOffset,
					childList: world.nations.childList,
					sovereign: world.nations.sovereign,
					gravity: world.nations.gravity,
				}
			: undefined,
		cultures: world.cultures
			? {
					assignment: world.cultures.assignment,
					seeds: world.cultures.seeds,
					count: world.cultures.count,
					adjOffset: world.cultures.adjOffset,
					adjList: world.cultures.adjList,
					size: world.cultures.size,
					colors: world.cultures.colors,
				}
			: undefined,
		heritages: world.heritages
			? {
					assignment: world.heritages.assignment,
					seeds: world.heritages.seeds,
					count: world.heritages.count,
					adjOffset: world.heritages.adjOffset,
					adjList: world.heritages.adjList,
					size: world.heritages.size,
					colors: world.heritages.colors,
				}
			: undefined,
		faiths: world.faiths
			? {
					assignment: world.faiths.assignment,
					seeds: world.faiths.seeds,
					count: world.faiths.count,
					adjOffset: world.faiths.adjOffset,
					adjList: world.faiths.adjList,
					size: world.faiths.size,
					colors: world.faiths.colors,
				}
			: undefined,
		religions: world.religions
			? {
					assignment: world.religions.assignment,
					seeds: world.religions.seeds,
					count: world.religions.count,
					adjOffset: world.religions.adjOffset,
					adjList: world.religions.adjList,
					size: world.religions.size,
					colors: world.religions.colors,
				}
			: undefined,
		landmarks: world.landmarks
			? {
					regionLandmark: world.landmarks.regionLandmark,
					type: world.landmarks.type,
					size: world.landmarks.size,
					count: world.landmarks.count,
				}
			: undefined,
		population: world.population
			? {
					habitability: world.population.habitability,
					population: world.population.population,
					habitabilityScore: world.population.habitabilityScore,
					totalPopulation: world.population.totalPopulation,
				}
			: undefined,
		monthlyTEQ: world.monthlyTEQ,
	}
}

function buildTransferList(world: SerializedOrogenWorld): Transferable[] {
	const transfer: Transferable[] = [
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
	]

	if (world.terrainFeatures) {
		transfer.push(
			world.terrainFeatures.featureMask.buffer,
			world.terrainFeatures.dominantFeature.buffer,
		)
	}

	if (world.climate) {
		transfer.push(
			world.climate.temperature_avg.buffer,
			world.climate.temperature_min.buffer,
			world.climate.temperature_max.buffer,
			world.climate.temperature_monthly.buffer,
			world.climate.temperature_monthly_nolapse.buffer,
			world.climate.temperature_monthly_range.buffer,
			world.climate.insolation_monthly.buffer,
			world.climate.pet_monthly.buffer,
		)
		if (world.climate.daylight_hours_monthly) {
			transfer.push(world.climate.daylight_hours_monthly.buffer)
		}
	}

	if (world.oceanDist) {
		transfer.push(world.oceanDist.buffer)
	}

	if (world.distCoast) {
		transfer.push(world.distCoast.buffer)
	}

	if (world.rainfall) {
		transfer.push(
			world.rainfall.monthly.buffer,
			world.rainfall.annual.buffer,
			world.rainfall.east.buffer,
			world.rainfall.west.buffer,
		)
	}

	if (world.hazards) {
		transfer.push(
			world.hazards.earthquake.buffer,
			world.hazards.volcano.buffer,
			world.hazards.danger.buffer,
		)
	}

	if (world.volcanism) {
		transfer.push(world.volcanism.hotspot.buffer)
	}

	if (world.climateZones) {
		transfer.push(world.climateZones.buffer)
	}

	if (world.pastaClimate) {
		transfer.push(world.pastaClimate.buffer)
	}

	if (world.pastaDebug) {
		for (const arr of Object.values(world.pastaDebug)) {
			transfer.push((arr as Float32Array).buffer)
		}
	}

	if (world.koppenClimate) {
		transfer.push(world.koppenClimate.buffer)
	}

	if (world.iceThickness) {
		transfer.push(world.iceThickness.buffer)
	}

	if (world.iceMinMonthly) {
		transfer.push(world.iceMinMonthly.buffer)
	}

	if (world.iceMaxMonthly) {
		transfer.push(world.iceMaxMonthly.buffer)
	}

	if (world.vegetation) {
		transfer.push(world.vegetation.buffer)
	}

	if (world.topography) {
		transfer.push(world.topography.buffer)
	}

	if (world.coastal) {
		transfer.push(world.coastal.buffer)
	}

	if (world.slopeScore) {
		transfer.push(world.slopeScore.buffer)
	}

	if (world.isLand) {
		transfer.push(world.isLand.buffer)
	}

	if (world.riverLand) {
		transfer.push(world.riverLand.buffer)
	}

	if (world.provinces) {
		transfer.push(
			world.provinces.regionProvince.buffer,
			world.provinces.seeds.buffer,
			world.provinces.desolate.buffer,
			world.provinces.landmassId.buffer,
			world.provinces.adjOffset.buffer,
			world.provinces.adjList.buffer,
			world.provinces.size.buffer,
			world.provinces.colors.buffer,
		)
	}

	if (world.rivers?.lakes) {
		transfer.push(world.rivers.flow.buffer)
		transfer.push(world.rivers.flow_monthly.buffer)
		transfer.push(world.rivers.riverId.buffer)
		transfer.push(world.rivers.riverLengthKm.buffer)
		transfer.push(world.rivers.visible.buffer)
		transfer.push(world.rivers.lakes.buffer)
		transfer.push(world.rivers.basinId.buffer)
		transfer.push(world.rivers.waterLevel.buffer)
	}

	if (world.oceanCurrents) {
		transfer.push(world.oceanCurrents.oceanWarmth.buffer)
		transfer.push(world.oceanCurrents.coastalWarmth.buffer)
		if (world.oceanCurrents.oceanWarmthMonthly)
			transfer.push(world.oceanCurrents.oceanWarmthMonthly.buffer)
		if (world.oceanCurrents.coastalWarmthMonthly)
			transfer.push(world.oceanCurrents.coastalWarmthMonthly.buffer)
		if (world.oceanCurrents.temperatureDeltaMonthly)
			transfer.push(world.oceanCurrents.temperatureDeltaMonthly.buffer)
		transfer.push(world.oceanCurrents.temperatureDelta.buffer)
	}

	if (world.wind) {
		transfer.push(world.wind.wind_east_monthly.buffer)
		transfer.push(world.wind.wind_north_monthly.buffer)
		transfer.push(world.wind.wind_speed_monthly.buffer)
	}

	if (world.monthlyTEQ) {
		for (const teq of world.monthlyTEQ) {
			transfer.push(teq.buffer)
		}
	}

	if (world.nations) {
		transfer.push(world.nations.assignment.buffer)
		transfer.push(world.nations.seeds.buffer)
		transfer.push(world.nations.adjOffset.buffer)
		transfer.push(world.nations.adjList.buffer)
		transfer.push(world.nations.size.buffer)
		transfer.push(world.nations.colors.buffer)
		transfer.push(world.nations.parent.buffer)
		transfer.push(world.nations.depth.buffer)
		transfer.push(world.nations.childOffset.buffer)
		transfer.push(world.nations.childList.buffer)
		transfer.push(world.nations.sovereign.buffer)
		transfer.push(world.nations.gravity.buffer)
	}

	if (world.cultures) {
		transfer.push(world.cultures.assignment.buffer)
		transfer.push(world.cultures.seeds.buffer)
		transfer.push(world.cultures.adjOffset.buffer)
		transfer.push(world.cultures.adjList.buffer)
		transfer.push(world.cultures.size.buffer)
		transfer.push(world.cultures.colors.buffer)
	}

	if (world.heritages) {
		transfer.push(world.heritages.assignment.buffer)
		transfer.push(world.heritages.seeds.buffer)
		transfer.push(world.heritages.adjOffset.buffer)
		transfer.push(world.heritages.adjList.buffer)
		transfer.push(world.heritages.size.buffer)
		transfer.push(world.heritages.colors.buffer)
	}

	if (world.faiths) {
		transfer.push(world.faiths.assignment.buffer)
		transfer.push(world.faiths.seeds.buffer)
		transfer.push(world.faiths.adjOffset.buffer)
		transfer.push(world.faiths.adjList.buffer)
		transfer.push(world.faiths.size.buffer)
		transfer.push(world.faiths.colors.buffer)
	}

	if (world.religions) {
		transfer.push(world.religions.assignment.buffer)
		transfer.push(world.religions.seeds.buffer)
		transfer.push(world.religions.adjOffset.buffer)
		transfer.push(world.religions.adjList.buffer)
		transfer.push(world.religions.size.buffer)
		transfer.push(world.religions.colors.buffer)
	}

	if (world.landmarks) {
		transfer.push(world.landmarks.regionLandmark.buffer)
		transfer.push(world.landmarks.type.buffer)
		transfer.push(world.landmarks.size.buffer)
	}

	if (world.population) {
		transfer.push(world.population.habitability.buffer)
		transfer.push(world.population.population.buffer)
	}

	return Array.from(new Set(transfer))
}

self.onmessage = (event: MessageEvent<OrogenWorkerRequest>) => {
	const message = event.data

	const progressCb = (label: string, pct?: number) => {
		const progress: OrogenWorkerResponse = { type: "progress", label, pct }
		self.postMessage(progress)
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

		const world = serializeWorld(generated)
		const done: OrogenWorkerResponse = { type: "done", world }
		self.postMessage(done, buildTransferList(world))
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error))
		const failure: OrogenWorkerResponse = {
			type: "error",
			message: err.message,
			stack: err.stack,
		}
		self.postMessage(failure)
	}
}
