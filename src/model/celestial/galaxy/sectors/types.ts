export interface Colony {
	id: number
	empireId: number
	systemId: number
	// [JUSTIFICATION] Only generated stand-in anchors set this; founded colonies omit it.
	provisional?: boolean
}

export interface Sector {
	id: number
	empireId: number
	capitalColonyId: number
	leaderId: number | null
	core: boolean
}

export interface SectorState {
	colonies: Colony[]
	sectors: Sector[]
	assignment: Int32Array
	nextSectorId: number
}

export interface RebuildSectorsParams {
	state: SectorState
	ownership: Int32Array
	empireCapitals: Int32Array
	laneAdjOffset: Int32Array
	laneAdjList: Int32Array
}

export interface CreateSectorParams extends RebuildSectorsParams {
	colonyId: number
}

export interface MoveSectorCapitalParams extends RebuildSectorsParams {
	sectorId: number
	colonyId: number
}

export interface GalaxyTerritoryEventParams extends RebuildSectorsParams {
	systemId: number
	empireId: number
}

export interface GalaxyColonyEventParams extends RebuildSectorsParams {
	colony: Colony
}

export interface GalaxyColonyLossParams extends RebuildSectorsParams {
	colonyId: number
}

export interface GalaxyCapitalEventParams extends RebuildSectorsParams {
	empireId: number
	systemId: number
}

export interface ColonyAtSystemParams {
	colonies: Colony[]
	empireId: number
	systemId: number
}

export interface SectorDistancesParams {
	start: number
	empireId: number
	ownership: Int32Array
	laneAdjOffset: Int32Array
	laneAdjList: Int32Array
	allowed: (systemId: number) => boolean
}

export interface SectorPriorityParams {
	sector: Sector
	other: Sector
}

export interface ExpandSectorsParams {
	sectors: Sector[]
	colonies: Colony[]
	assignment: Int32Array
	ownership: Int32Array
	laneAdjOffset: Int32Array
	laneAdjList: Int32Array
}

export interface CreateAtColonyParams {
	state: SectorState
	colony: Colony
}

export interface AssignSectorLeaderParams {
	state: SectorState
	sectorId: number
	leaderId: number | null
}

export interface SectorLeaderAtColonyParams {
	state: SectorState
	colonyId: number
}

export interface ProvisionalSectorAnchorsParams {
	ownership: Int32Array
	empireCapitals: Int32Array
	laneAdjOffset: Int32Array
	laneAdjList: Int32Array
	seed: number
}
