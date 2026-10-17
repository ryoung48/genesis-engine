import type { CoalitionMember } from "@/model/history/sim/engine/military/types"
import type { HistoryState, War } from "@/model/history/sim/engine/state/types"

export interface NavalExposure {
	ports: number
	hostile: number
}

export interface NavalExposureCacheEntry {
	hierarchyVersion: number
	relationVersion: number
	exposure: NavalExposure
}

export interface FleetTarget {
	ships: number
	home: number
	campaign: number
}

export interface NavalInterval {
	time: number
	target: number
	home: number
	campaign: number
	committed: number
	pending: number
	settled: number
}

export interface NavalTotals {
	decommissions: number
	shipsLost: number
	crewDeaths: number
	reachViolations: number
}

export interface NationParams {
	state: HistoryState
	nation: number
}

export interface ExposureOfParams extends NationParams {
	provinces: number[]
}

export interface ShareParams {
	exposure: NavalExposure
}

export interface CrewParams {
	knowledge: number
}

export interface InitializeParams extends NationParams {
	target: FleetTarget
}

export interface CommitParams extends NationParams {
	wars: War[]
}

export interface RefreshParams extends InitializeParams {
	wars: War[]
}

export interface PortCountParams {
	state: HistoryState
	provinces: number[]
}

export interface ReachParams extends NationParams {
	waterBody: number
}

export interface NavalCoalitionParams {
	state: HistoryState
	war: War
	nations: number[]
	waterBody: number
}

export interface NavalCoalition {
	members: CoalitionMember[]
	ships: number
}

export interface LoseParams {
	state: HistoryState
	war: War
	nation: number
	ships: number
}

export interface SplitParams {
	ships: number
	ports: number[]
}

export interface ReleaseParams {
	state: HistoryState
	from: number
	to: number[]
}

export interface ShipYearsParams {
	before: number
	after: number
	target: number
	rate: number
	years: number
}
