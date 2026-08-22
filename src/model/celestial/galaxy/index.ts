import { GALAXY_PACKING } from "@/model/celestial/galaxy/packing"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { GALAXY_TOPOLOGY } from "@/model/celestial/galaxy/topology"
import type {
	Galaxy,
	GalaxyParams,
	GalaxyStageTiming,
} from "@/model/celestial/galaxy/types"

/**
 * Places and connects a galaxy's star systems, then rolls every system's
 * star tree (shape + spectral class, not bodies -- see
 * GALAXY_SYSTEMS.buildPackedGalaxyStars) into flat typed arrays here in the
 * worker, mirroring galaxy-gen's SCALED_GALAXY.spawn. Per-system planet/moon
 * generation (see GALAXY_SYSTEMS.generate) still stays lazy/on-demand,
 * hydrated from the packed star tree instead of re-rolled, matching how the
 * existing solar-system view already hydrates one system's bodies
 * synchronously on selection. See plans/galaxy-view-port.md's axiomatic-
 * design section for why packing/topology/systems stay separate modules.
 */
function spawn(
	{
		size,
		seed,
		radius,
		dimensions,
		eccentricityInner,
		eccentricityOuter,
		angleWindPerUnit,
		pertN,
		pertAmp,
	}: GalaxyParams,
	progressCb?: (label: string, pct: number) => void,
): { galaxy: Galaxy; timings: GalaxyStageTiming[] } {
	const timings: GalaxyStageTiming[] = []
	let t0 = performance.now()

	progressCb?.("Placing systems...", 20)
	const packing = GALAXY_PACKING.place({
		size,
		seed,
		radius,
		dimensions,
		eccentricityInner,
		eccentricityOuter,
		angleWindPerUnit,
		pertN,
		pertAmp,
	})
	timings.push({ stage: "Point placement", ms: performance.now() - t0 })
	t0 = performance.now()

	progressCb?.("Routing hyperlanes...", 60)
	const coreRadius = radius.min
	const { adjOffset, adjList, lanes, laneCount } = GALAXY_TOPOLOGY.build({
		packing,
		seed,
		dimensions,
		coreRadius,
	})
	timings.push({ stage: "Topology + hyperlanes", ms: performance.now() - t0 })
	t0 = performance.now()

	progressCb?.("Rolling star trees...", 85)
	const packedStars = GALAXY_SYSTEMS.buildPackedGalaxyStars({
		galaxySeed: seed,
		numSystems: size,
		r_edge: packing.r_edge,
	})
	timings.push({ stage: "Star tree packing", ms: performance.now() - t0 })

	progressCb?.("Done", 100)

	return {
		galaxy: {
			seed,
			numSystems: size,
			r_xy: packing.r_xy,
			r_edge: packing.r_edge,
			adjOffset,
			adjList,
			lanes,
			laneCount,
			...packedStars,
			radius,
			dimensions,
		},
		timings,
	}
}

export const GALAXY = { spawn }
