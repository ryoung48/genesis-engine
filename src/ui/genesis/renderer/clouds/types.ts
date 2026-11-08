import type { Vector3 } from "three"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface CloudLighting {
	enabled: boolean
	direction: Vector3
	ambient: Vector3
	sunlight: Vector3
}

export interface CloudDisplay {
	world: SerializedGenesisWorld | null
	month: number
	visible: boolean
}

export interface CloudWeather {
	world: SerializedGenesisWorld
	month: number
}

export interface CloudTextureInput {
	data: Uint8Array<ArrayBuffer>
	w: number
	h: number
}
