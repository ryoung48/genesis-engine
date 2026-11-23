import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export type TerranWorldInput = Pick<
	SerializedGenesisWorld,
	| "mesh"
	| "landmarks"
	| "params"
	| "rivers"
	| "realKoppenClimate"
	| "koppenClimate"
	| "climate"
	| "rainfall"
	| "elevation_km"
	| "isLand"
	| "topography"
	| "isEarthImport"
>
