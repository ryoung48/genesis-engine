/// <reference lib="webworker" />

import { generateOrogenWorld } from "./pipeline"
import { importOrogenWorld } from "./import"
import type {
	OrogenWorkerRequest,
	OrogenWorkerResponse,
	SerializedOrogenWorld,
} from "./worker-types"

declare const self: DedicatedWorkerGlobalScope

function serializeWorld(world: ReturnType<typeof generateOrogenWorld>): SerializedOrogenWorld {
	return {
		mesh: {
			numRegions: world.mesh.numRegions,
			numTriangles: world.mesh.numTriangles,
			numSides: world.mesh.numSides,
			r_xyz: world.mesh.r_xyz,
			t_xyz: world.mesh.t_xyz,
			halfedges: world.mesh.halfedges,
			s_begin_r: world.mesh.s_begin_r,
			s_end_r: world.mesh.s_end_r,
			s_inner_t: world.mesh.s_inner_t,
			s_outer_t: world.mesh.s_outer_t,
		},
		plateAssignment: world.plateAssignment,
		elevation: world.elevation,
		params: world.params,
		continentCount: world.continentCount,
		climate: world.climate
			? {
				temperature_avg: world.climate.temperature_avg,
				temperature_min: world.climate.temperature_min,
				temperature_max: world.climate.temperature_max,
				temperature_monthly: world.climate.temperature_monthly,
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
		climateZones: world.climateZones,
		pastaClimate: world.pastaClimate,
		koppenClimate: world.koppenClimate,
		vegetation: world.vegetation,
		isLand: world.isLand,
		riverLand: world.riverLand,
		rivers: world.rivers,
		oceanCurrents: world.oceanCurrents
			? {
				oceanWarmth: world.oceanCurrents.oceanWarmth,
				coastalWarmth: world.oceanCurrents.coastalWarmth,
			}
			: undefined,
		wind: world.wind
			? {
				wind_east_monthly: world.wind.wind_east_monthly,
				wind_north_monthly: world.wind.wind_north_monthly,
				wind_speed_monthly: world.wind.wind_speed_monthly,
			}
			: undefined,
	}
}

function buildTransferList(world: SerializedOrogenWorld): Transferable[] {
	const transfer: Transferable[] = [
		world.mesh.r_xyz.buffer,
		world.mesh.t_xyz.buffer,
		world.mesh.halfedges.buffer,
		world.mesh.s_begin_r.buffer,
		world.mesh.s_end_r.buffer,
		world.mesh.s_inner_t.buffer,
		world.mesh.s_outer_t.buffer,
		world.plateAssignment.buffer,
		world.elevation.buffer,
	]

	if (world.climate) {
		transfer.push(
			world.climate.temperature_avg.buffer,
			world.climate.temperature_min.buffer,
			world.climate.temperature_max.buffer,
			world.climate.temperature_monthly.buffer,
		)
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

	if (world.climateZones) {
		transfer.push(world.climateZones.buffer)
	}

	if (world.pastaClimate) {
		transfer.push(world.pastaClimate.buffer)
	}

	if (world.koppenClimate) {
		transfer.push(world.koppenClimate.buffer)
	}

	if (world.vegetation) {
		transfer.push(world.vegetation.buffer)
	}

	if (world.isLand) {
		transfer.push(world.isLand.buffer)
	}

	if (world.riverLand) {
		transfer.push(world.riverLand.buffer)
	}

	if (world.rivers?.lakes) {
		transfer.push(world.rivers.lakes.buffer)
		transfer.push(world.rivers.waterLevel.buffer)
	}

	if (world.oceanCurrents) {
		transfer.push(world.oceanCurrents.oceanWarmth.buffer)
		transfer.push(world.oceanCurrents.coastalWarmth.buffer)
	}

	if (world.wind) {
		transfer.push(world.wind.wind_east_monthly.buffer)
		transfer.push(world.wind.wind_north_monthly.buffer)
		transfer.push(world.wind.wind_speed_monthly.buffer)
	}

	return transfer
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
