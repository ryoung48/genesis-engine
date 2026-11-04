import type { TerrainSnapshot } from "@/model/pipelines/types"
import { TIMING } from "@/model/shared/timing"
import type { StageTiming } from "@/model/shared/timing/types"
import type { GeometryBuffers } from "@/ui/genesis/renderer/geometry-preparation/data/types"
import {
	computeMapGeometryArrays,
	computeTerrainGeometryArrays,
} from "@/ui/genesis/renderer/terrain-geometry"

function snapshot(world: TerrainSnapshot): TerrainSnapshot {
	const { mesh, elevation, elevation_km } = world
	return {
		elevation,
		elevation_km,
		mesh: {
			numRegions: mesh.numRegions,
			numTriangles: mesh.numTriangles,
			numSides: mesh.numSides,
			s_begin_r: mesh.s_begin_r,
			s_inner_t: mesh.s_inner_t,
			s_outer_t: mesh.s_outer_t,
			r_xyz: mesh.r_xyz,
			t_xyz: mesh.t_xyz,
		},
	}
}

function compute(world: TerrainSnapshot) {
	const timings: StageTiming[] = []
	const terrain = TIMING.measure({
		stage: "Globe geometry",
		timings,
		fn: () => computeTerrainGeometryArrays(world, "terrain", null, true),
	})
	const map = TIMING.measure({
		stage: "Map geometry",
		timings,
		fn: () => computeMapGeometryArrays(world, "terrain", null, 0, 0),
	})
	return { terrain, map, timings }
}

function transferList(geometry: GeometryBuffers): ArrayBuffer[] {
	return [
		...Object.values(geometry.terrain),
		...Object.values(geometry.map),
	].map((array) => array.buffer as ArrayBuffer)
}

export const GEOMETRY_DATA = { snapshot, compute, transferList }
