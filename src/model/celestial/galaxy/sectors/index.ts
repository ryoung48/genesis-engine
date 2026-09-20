import type {
	AssignSectorLeaderParams,
	Colony,
	ColonyAtSystemParams,
	CreateAtColonyParams,
	CreateSectorParams,
	ExpandSectorsParams,
	GalaxyCapitalEventParams,
	GalaxyColonyEventParams,
	GalaxyColonyLossParams,
	GalaxyTerritoryEventParams,
	MoveSectorCapitalParams,
	ProvisionalSectorAnchorsParams,
	RebuildSectorsParams,
	Sector,
	SectorDistancesParams,
	SectorLeaderAtColonyParams,
	SectorPriorityParams,
	SectorState,
} from "@/model/celestial/galaxy/sectors/types"
import { RNG } from "@/model/shared/random/rng"

const MAX_LANES = 4

function colonyAtSystem({
	colonies,
	empireId,
	systemId,
}: ColonyAtSystemParams): Colony | undefined {
	return colonies.find(
		(colony) => colony.empireId === empireId && colony.systemId === systemId,
	)
}

function distances({
	start,
	empireId,
	ownership,
	laneAdjOffset,
	laneAdjList,
	allowed,
}: SectorDistancesParams): Int8Array {
	const distance = new Int8Array(ownership.length).fill(-1)
	if (start < 0 || ownership[start] !== empireId || !allowed(start))
		return distance
	const queue = [start]
	distance[start] = 0
	for (let head = 0; head < queue.length; head++) {
		const systemId = queue[head]!
		const nextDistance = distance[systemId]! + 1
		if (nextDistance > MAX_LANES) continue
		for (
			let edge = laneAdjOffset[systemId]!;
			edge < laneAdjOffset[systemId + 1]!;
			edge++
		) {
			const neighbor = laneAdjList[edge]!
			if (
				distance[neighbor] >= 0 ||
				ownership[neighbor] !== empireId ||
				!allowed(neighbor)
			)
				continue
			distance[neighbor] = nextDistance
			queue.push(neighbor)
		}
	}
	return distance
}

function seedProvisionalAnchors({
	ownership,
	empireCapitals,
	laneAdjOffset,
	laneAdjList,
	seed,
}: ProvisionalSectorAnchorsParams): Colony[] {
	const colonies: Colony[] = Array.from(
		empireCapitals,
		(systemId, empireId) => ({
			id: empireId,
			empireId,
			systemId,
			provisional: false,
		}),
	)
	const order = RNG.createRng({ seed: seed ^ 0x5ec70f }).shuffle(
		Array.from({ length: ownership.length }, (_, systemId) => systemId),
	)
	for (;;) {
		const nearest = new Int32Array(ownership.length).fill(-1)
		const queue: number[] = []
		for (const colony of colonies) {
			nearest[colony.systemId] = 0
			queue.push(colony.systemId)
		}
		for (let head = 0; head < queue.length; head++) {
			const systemId = queue[head]!
			for (
				let edge = laneAdjOffset[systemId]!;
				edge < laneAdjOffset[systemId + 1]!;
				edge++
			) {
				const neighbor = laneAdjList[edge]!
				if (
					nearest[neighbor] >= 0 ||
					ownership[neighbor] !== ownership[systemId]
				)
					continue
				nearest[neighbor] = nearest[systemId]! + 1
				queue.push(neighbor)
			}
		}
		let bestSystem = -1
		let bestCoverage = -1
		let bestDistance = -1
		for (const systemId of order) {
			const empireId = ownership[systemId]!
			const laneDistance = nearest[systemId]!
			if (empireId < 0 || (laneDistance >= 0 && laneDistance <= MAX_LANES))
				continue
			const candidateDistance = laneDistance < 0 ? Infinity : laneDistance
			const reachable = distances({
				start: systemId,
				empireId,
				ownership,
				laneAdjOffset,
				laneAdjList,
				allowed: () => true,
			})
			let uncovered = 0
			for (let index = 0; index < reachable.length; index++) {
				if (
					reachable[index] >= 0 &&
					(nearest[index] < 0 || nearest[index] > MAX_LANES)
				)
					uncovered++
			}
			if (
				uncovered > bestCoverage ||
				(uncovered === bestCoverage && candidateDistance > bestDistance)
			) {
				bestSystem = systemId
				bestDistance = candidateDistance
				bestCoverage = uncovered
			}
		}
		if (bestSystem < 0) break
		colonies.push({
			id: colonies.length,
			empireId: ownership[bestSystem]!,
			systemId: bestSystem,
			provisional: true,
		})
	}
	const coverage = new Int16Array(ownership.length)
	const reaches = colonies.map((colony) => {
		const reachable = distances({
			start: colony.systemId,
			empireId: colony.empireId,
			ownership,
			laneAdjOffset,
			laneAdjList,
			allowed: () => true,
		})
		const systems: number[] = []
		for (let systemId = 0; systemId < reachable.length; systemId++) {
			if (reachable[systemId] < 0) continue
			coverage[systemId]++
			systems.push(systemId)
		}
		return systems
	})
	const retained = new Uint8Array(colonies.length).fill(1)
	for (
		let index = colonies.length - 1;
		index >= empireCapitals.length;
		index--
	) {
		const systems = reaches[index]!
		if (!systems.every((systemId) => coverage[systemId] > 1)) continue
		retained[index] = 0
		for (const systemId of systems) coverage[systemId]--
	}
	return colonies.flatMap((colony, index) =>
		retained[index] === 1 ? [colony] : [],
	)
}

function sectorPriority({ sector, other }: SectorPriorityParams): number {
	return Number(other.core) - Number(sector.core) || sector.id - other.id
}

function expand({
	sectors,
	colonies,
	assignment,
	ownership,
	laneAdjOffset,
	laneAdjList,
}: ExpandSectorsParams): void {
	const ordered = [...sectors].sort((sector, other) =>
		sectorPriority({ sector, other }),
	)
	for (let distance = 1; distance <= MAX_LANES; distance++) {
		const claims = new Map<number, Sector>()
		for (const sector of ordered) {
			const capital = colonies.find(
				(colony) => colony.id === sector.capitalColonyId,
			)!
			const reachable = distances({
				start: capital.systemId,
				empireId: sector.empireId,
				ownership,
				laneAdjOffset,
				laneAdjList,
				allowed: (systemId) =>
					assignment[systemId] === sector.id || assignment[systemId] === -1,
			})
			for (let systemId = 0; systemId < assignment.length; systemId++) {
				if (assignment[systemId] !== -1 || reachable[systemId] !== distance)
					continue
				if (!claims.has(systemId)) claims.set(systemId, sector)
			}
		}
		for (const [systemId, sector] of claims) assignment[systemId] = sector.id
	}
}

function createAtColony({ state, colony }: CreateAtColonyParams): SectorState {
	const sector: Sector = {
		id: state.nextSectorId,
		empireId: colony.empireId,
		capitalColonyId: colony.id,
		leaderId: null,
		core: false,
	}
	return {
		...state,
		sectors: [...state.sectors, sector],
		nextSectorId: state.nextSectorId + 1,
	}
}

function rebuild({
	state,
	ownership,
	empireCapitals,
	laneAdjOffset,
	laneAdjList,
}: RebuildSectorsParams): SectorState {
	const colonies = state.colonies.filter(
		(colony) => ownership[colony.systemId] === colony.empireId,
	)
	const sectors: Sector[] = []
	let nextSectorId = state.nextSectorId
	for (let empireId = 0; empireId < empireCapitals.length; empireId++) {
		const empireColonies = colonies.filter(
			(colony) => colony.empireId === empireId,
		)
		if (empireColonies.length === 0) continue
		const capital = colonyAtSystem({
			colonies,
			empireId,
			systemId: empireCapitals[empireId]!,
		})
		if (!capital) throw new Error(`Empire ${empireId} has no capital colony`)
		const previous = state.sectors.find(
			(sector) => sector.empireId === empireId && sector.core,
		)
		sectors.push(
			previous
				? { ...previous, capitalColonyId: capital.id }
				: {
						id: nextSectorId++,
						empireId,
						capitalColonyId: capital.id,
						leaderId: null,
						core: true,
					},
		)
	}
	const usedCapitals = new Set(sectors.map((sector) => sector.capitalColonyId))
	for (const sector of state.sectors) {
		if (
			sector.core ||
			!sectors.some((core) => core.empireId === sector.empireId)
		)
			continue
		const capital = colonies.find(
			(colony) => colony.id === sector.capitalColonyId,
		)
		const replacement =
			capital?.empireId === sector.empireId && !usedCapitals.has(capital.id)
				? capital
				: colonies
						.filter(
							(colony) =>
								colony.empireId === sector.empireId &&
								state.assignment[colony.systemId] === sector.id &&
								!usedCapitals.has(colony.id),
						)
						.sort((a, b) => a.id - b.id)[0]
		if (replacement) {
			sectors.push({ ...sector, capitalColonyId: replacement.id })
			usedCapitals.add(replacement.id)
		}
	}
	const assignment = new Int32Array(ownership.length).fill(-1)
	const reservedCapitals = new Map(
		sectors.map((sector) => [
			colonies.find((colony) => colony.id === sector.capitalColonyId)!.systemId,
			sector.id,
		]),
	)
	for (const sector of sectors) {
		const capital = colonies.find(
			(colony) => colony.id === sector.capitalColonyId,
		)!
		const retained = distances({
			start: capital.systemId,
			empireId: sector.empireId,
			ownership,
			laneAdjOffset,
			laneAdjList,
			allowed: (systemId) =>
				(reservedCapitals.get(systemId) === undefined ||
					reservedCapitals.get(systemId) === sector.id) &&
				(state.assignment[systemId] === sector.id ||
					systemId === capital.systemId),
		})
		for (let systemId = 0; systemId < assignment.length; systemId++) {
			if (retained[systemId] >= 0) assignment[systemId] = sector.id
		}
	}
	for (const [systemId, sectorId] of reservedCapitals) {
		assignment[systemId] = sectorId
	}
	expand({
		sectors,
		colonies,
		assignment,
		ownership,
		laneAdjOffset,
		laneAdjList,
	})
	let result: SectorState = { colonies, sectors, assignment, nextSectorId }
	for (;;) {
		let best: Colony | undefined
		let bestColonies = -1
		let bestSystems = -1
		for (const colony of colonies) {
			if (assignment[colony.systemId] !== -1) continue
			const reachable = distances({
				start: colony.systemId,
				empireId: colony.empireId,
				ownership,
				laneAdjOffset,
				laneAdjList,
				allowed: (systemId) => assignment[systemId] === -1,
			})
			let colonyCount = 0
			let systemCount = 0
			for (const other of colonies) {
				if (reachable[other.systemId] >= 0) colonyCount++
			}
			for (const distance of reachable) if (distance >= 0) systemCount++
			if (
				colonyCount > bestColonies ||
				(colonyCount === bestColonies && systemCount > bestSystems) ||
				(colonyCount === bestColonies &&
					systemCount === bestSystems &&
					colony.id < (best?.id ?? Infinity))
			) {
				best = colony
				bestColonies = colonyCount
				bestSystems = systemCount
			}
		}
		if (!best) break
		result = createAtColony({ state: result, colony: best })
		assignment[best.systemId] = result.sectors[result.sectors.length - 1]!.id
		expand({
			sectors: result.sectors,
			colonies,
			assignment,
			ownership,
			laneAdjOffset,
			laneAdjList,
		})
	}
	return result
}

function create(params: CreateSectorParams): SectorState {
	const colony = params.state.colonies.find(
		(candidate) => candidate.id === params.colonyId,
	)
	if (!colony || params.state.assignment[colony.systemId] !== -1)
		throw new Error("Sector capital must be an unsectored colony")
	const state = createAtColony({ state: params.state, colony })
	return rebuild({ ...params, state })
}

function moveCapital(params: MoveSectorCapitalParams): SectorState {
	const sector = params.state.sectors.find(
		(candidate) => candidate.id === params.sectorId,
	)
	const colony = params.state.colonies.find(
		(candidate) => candidate.id === params.colonyId,
	)
	if (!sector || !colony || sector.empireId !== colony.empireId)
		throw new Error("Sector capital must be an owned colony")
	if (sector.core)
		throw new Error("Move the empire capital to move its core sector")
	if (params.state.assignment[colony.systemId] !== sector.id)
		throw new Error("New capital must belong to its sector")
	return rebuild({
		...params,
		state: {
			...params.state,
			sectors: params.state.sectors.map((candidate) =>
				candidate.id === sector.id
					? { ...candidate, capitalColonyId: colony.id }
					: candidate,
			),
		},
	})
}

function colonize(params: GalaxyColonyEventParams): SectorState {
	if (params.ownership[params.colony.systemId] !== params.colony.empireId)
		throw new Error("Colony system must belong to its empire")
	const existing = params.state.colonies.find(
		(colony) => colony.systemId === params.colony.systemId,
	)
	if (existing && !existing.provisional)
		throw new Error("System already has a colony")
	if (
		params.state.colonies.some(
			(colony) => colony.id === params.colony.id && colony.id !== existing?.id,
		)
	)
		throw new Error("Colony ID already exists")
	return rebuild({
		...params,
		state: {
			...params.state,
			colonies: existing
				? params.state.colonies.map((colony) =>
						colony.id === existing.id ? params.colony : colony,
					)
				: [...params.state.colonies, params.colony],
			sectors: existing
				? params.state.sectors.map((sector) =>
						sector.capitalColonyId === existing.id
							? { ...sector, capitalColonyId: params.colony.id }
							: sector,
					)
				: params.state.sectors,
		},
	})
}

function loseColony(params: GalaxyColonyLossParams): SectorState {
	return rebuild({
		...params,
		state: {
			...params.state,
			colonies: params.state.colonies.filter(
				(colony) => colony.id !== params.colonyId,
			),
		},
	})
}

function changeOwnership(params: GalaxyTerritoryEventParams): SectorState {
	params.ownership[params.systemId] = params.empireId
	return rebuild(params)
}

function moveEmpireCapital(params: GalaxyCapitalEventParams): SectorState {
	if (params.ownership[params.systemId] !== params.empireId)
		throw new Error("Empire capital must be owned")
	if (
		!colonyAtSystem({
			colonies: params.state.colonies,
			empireId: params.empireId,
			systemId: params.systemId,
		})
	)
		throw new Error("Empire capital must be a colony")
	params.empireCapitals[params.empireId] = params.systemId
	return rebuild(params)
}

function assignLeader({
	state,
	sectorId,
	leaderId,
}: AssignSectorLeaderParams): SectorState {
	if (!state.sectors.some((sector) => sector.id === sectorId))
		throw new Error("Sector does not exist")
	return {
		...state,
		sectors: state.sectors.map((sector) =>
			sector.id === sectorId ? { ...sector, leaderId } : sector,
		),
	}
}

function leaderAtColony({
	state,
	colonyId,
}: SectorLeaderAtColonyParams): number | null {
	const colony = state.colonies.find((candidate) => candidate.id === colonyId)
	if (!colony) return null
	const sectorId = state.assignment[colony.systemId]
	return (
		state.sectors.find((sector) => sector.id === sectorId)?.leaderId ?? null
	)
}

export const SECTORS = {
	seedProvisionalAnchors,
	rebuild,
	create,
	moveCapital,
	colonize,
	loseColony,
	changeOwnership,
	moveEmpireCapital,
	assignLeader,
	leaderAtColony,
}
