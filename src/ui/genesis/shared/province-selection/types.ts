import type { Eu4ProvinceFillGeometry } from "@/model/history/earth/data-source/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { ColorMode } from "@/ui/genesis/shared/colors"

export interface ResolvePickedProvinceParams {
	world: SerializedGenesisWorld | null
	geometry: Eu4ProvinceFillGeometry | null
	region: number
	longitude: number
	latitude: number
}

export interface ProvinceClickTargetParams {
	province: number | null
	owner: number | null
	colorMode: ColorMode
	toolActive: boolean
}

export interface UnprojectMapPointParams {
	x: number
	y: number
	centerLongitude: number
	centerLatitude: number
}

export interface ProvinceClickTarget {
	kind: "none" | "province" | "nation"
	id: number | null
}

export interface ProvinceRepresentativesParams {
	world: SerializedGenesisWorld | null
	geometry: Eu4ProvinceFillGeometry | null
}
