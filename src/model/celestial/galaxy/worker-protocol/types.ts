import type { GalaxySystem } from "@/model/celestial/galaxy/systems/types"
import type {
	Galaxy,
	GalaxyParams,
	GalaxyStageTiming,
} from "@/model/celestial/galaxy/types"

export interface GalaxyWorkerGenerateRequest {
	type: "generate"
	params: GalaxyParams
}

export type GalaxyWorkerRequest = GalaxyWorkerGenerateRequest

export interface GalaxyWorkerProgressResponse {
	type: "progress"
	label: string
	pct: number
}

export interface GalaxyWorkerDoneResponse {
	type: "done"
	galaxy: Galaxy
	timings: GalaxyStageTiming[]
	/** Present only when the request had `params.pregenerateAllSystems` set --
	 * every non-edge system's fully generated bodies (no climate), indexed by
	 * systemIndex order (edge systems omitted). */
	systems?: GalaxySystem[]
}

export interface GalaxyWorkerErrorResponse {
	type: "error"
	message: string
	stack?: string
}

export type GalaxyWorkerResponse =
	| GalaxyWorkerProgressResponse
	| GalaxyWorkerDoneResponse
	| GalaxyWorkerErrorResponse
