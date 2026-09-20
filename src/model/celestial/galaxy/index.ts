import { GALAXY_CULTURES } from "@/model/celestial/galaxy/cultures"
import { GALAXY_NATIONS } from "@/model/celestial/galaxy/nations"
import { GALAXY_PACKING } from "@/model/celestial/galaxy/packing"
import { SECTORS } from "@/model/celestial/galaxy/sectors"
import type {
	RebuildSectorsParams,
	Sector,
} from "@/model/celestial/galaxy/sectors/types"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { GALAXY_TOPOLOGY } from "@/model/celestial/galaxy/topology"
import type {
	Galaxy,
	GalaxyAssignSectorLeaderAction,
	GalaxyCapitalAction,
	GalaxyColonyAction,
	GalaxyColonyLossAction,
	GalaxyCreateSectorAction,
	GalaxyMoveSectorCapitalAction,
	GalaxyOwnershipAction,
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
	const { adjOffset, adjList, lanes, laneCount, laneAdjOffset, laneAdjList } =
		GALAXY_TOPOLOGY.build({
			packing,
			seed,
			dimensions,
			coreRadius,
		})
	timings.push({ stage: "Topology + hyperlanes", ms: performance.now() - t0 })
	t0 = performance.now()

	progressCb?.("Assigning nations...", 75)
	const nations = GALAXY_NATIONS.build({
		numSystems: size,
		r_edge: packing.r_edge,
		r_xy: packing.r_xy,
		adjOffset: laneAdjOffset,
		adjList: laneAdjList,
		seed,
	})
	timings.push({ stage: "Nations", ms: performance.now() - t0 })
	t0 = performance.now()

	progressCb?.("Assigning cultures...", 80)
	const cultures = GALAXY_CULTURES.build({
		numSystems: size,
		r_edge: packing.r_edge,
		adjOffset: laneAdjOffset,
		adjList: laneAdjList,
		seed,
	})
	timings.push({ stage: "Cultures", ms: performance.now() - t0 })
	t0 = performance.now()

	progressCb?.("Rolling star trees...", 85)
	const packedStars = GALAXY_SYSTEMS.forceCapitalsMainWorldCapable({
		packed: GALAXY_SYSTEMS.buildPackedGalaxyStars({
			galaxySeed: seed,
			numSystems: size,
			r_edge: packing.r_edge,
		}),
		capitalSystemIndices: nations.seeds,
		galaxySeed: seed,
	})
	timings.push({ stage: "Star tree packing", ms: performance.now() - t0 })
	const sectorAnchors = SECTORS.seedProvisionalAnchors({
		ownership: nations.assignment,
		empireCapitals: nations.seeds,
		laneAdjOffset,
		laneAdjList,
		seed,
	})
	const initialSectors: Sector[] = sectorAnchors.map((colony, id) => ({
		id,
		empireId: colony.empireId,
		capitalColonyId: colony.id,
		leaderId: null as number | null,
		core: !colony.provisional,
	}))
	const sectorState = SECTORS.rebuild({
		state: {
			colonies: sectorAnchors,
			sectors: initialSectors,
			assignment: new Int32Array(size).fill(-1),
			nextSectorId: initialSectors.length,
		},
		ownership: nations.assignment,
		empireCapitals: nations.seeds,
		laneAdjOffset,
		laneAdjList,
	})

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
			nationAssignment: nations.assignment,
			nationSeeds: nations.seeds,
			nationSize: nations.size,
			nationColors: nations.colors,
			sectorState,
			cultureAssignment: cultures.assignment,
			cultureSeeds: cultures.seeds,
			cultureSize: cultures.size,
			cultureColors: cultures.colors,
			cultureBlendSecondary: cultures.blendSecondary,
			cultureBlendWeight: cultures.blendWeight,
			radius,
			dimensions,
		},
		timings,
	}
}

function sectorInputs(galaxy: Galaxy): RebuildSectorsParams {
	const { laneAdjOffset, laneAdjList } = GALAXY_TOPOLOGY.buildLaneCSR({
		lanes: galaxy.lanes,
		numSystems: galaxy.numSystems,
	})
	return {
		state: galaxy.sectorState,
		ownership: galaxy.nationAssignment,
		empireCapitals: galaxy.nationSeeds,
		laneAdjOffset,
		laneAdjList,
	}
}

function colonize({ galaxy, colony }: GalaxyColonyAction): Galaxy {
	return {
		...galaxy,
		sectorState: SECTORS.colonize({ ...sectorInputs(galaxy), colony }),
	}
}

function loseColony({ galaxy, colonyId }: GalaxyColonyLossAction): Galaxy {
	return {
		...galaxy,
		sectorState: SECTORS.loseColony({ ...sectorInputs(galaxy), colonyId }),
	}
}

function changeOwnership({
	galaxy,
	systemId,
	empireId,
}: GalaxyOwnershipAction): Galaxy {
	if (
		systemId < 0 ||
		systemId >= galaxy.numSystems ||
		galaxy.r_edge[systemId] ||
		empireId < -1 ||
		empireId >= galaxy.nationSeeds.length
	)
		throw new Error("Invalid territory change")
	const ownership = galaxy.nationAssignment.slice()
	const previous = ownership[systemId]!
	if (previous === empireId) return galaxy
	const nationSize = galaxy.nationSize.slice()
	if (previous >= 0) nationSize[previous]!--
	if (empireId >= 0) nationSize[empireId]!++
	const sectorState = SECTORS.changeOwnership({
		...sectorInputs(galaxy),
		ownership,
		systemId,
		empireId,
	})
	return { ...galaxy, nationAssignment: ownership, nationSize, sectorState }
}

function moveEmpireCapital({
	galaxy,
	empireId,
	systemId,
}: GalaxyCapitalAction): Galaxy {
	const empireCapitals = galaxy.nationSeeds.slice()
	const sectorState = SECTORS.moveEmpireCapital({
		...sectorInputs(galaxy),
		empireCapitals,
		empireId,
		systemId,
	})
	return { ...galaxy, nationSeeds: empireCapitals, sectorState }
}

function createSector({ galaxy, colonyId }: GalaxyCreateSectorAction): Galaxy {
	return {
		...galaxy,
		sectorState: SECTORS.create({ ...sectorInputs(galaxy), colonyId }),
	}
}

function moveSectorCapital({
	galaxy,
	colonyId,
	sectorId,
}: GalaxyMoveSectorCapitalAction): Galaxy {
	return {
		...galaxy,
		sectorState: SECTORS.moveCapital({
			...sectorInputs(galaxy),
			colonyId,
			sectorId,
		}),
	}
}

function assignSectorLeader({
	galaxy,
	sectorId,
	leaderId,
}: GalaxyAssignSectorLeaderAction): Galaxy {
	return {
		...galaxy,
		sectorState: SECTORS.assignLeader({
			state: galaxy.sectorState,
			sectorId,
			leaderId,
		}),
	}
}

export const GALAXY = {
	spawn,
	colonize,
	loseColony,
	changeOwnership,
	moveEmpireCapital,
	createSector,
	moveSectorCapital,
	assignSectorLeader,
}
