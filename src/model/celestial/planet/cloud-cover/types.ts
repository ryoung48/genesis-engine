import type { AtmosphereProfile } from "@/model/celestial/orbit-body/types"

export interface CloudCoverComputeInput {
	waterFraction: number
	temperatureMeanK: number
	/** Absent, "vacuum", or "trace" forces zero cover regardless of water. */
	atmosphereType?: AtmosphereProfile["type"]
	pressureBar?: number
}

export interface CloudCoverProfile {
	coverFraction: number
	description: string
}
