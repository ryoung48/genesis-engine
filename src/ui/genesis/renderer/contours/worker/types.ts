import type { BufferGeometry, Material, Mesh } from "three"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type {
	ContourField,
	ContourWorld,
} from "@/ui/genesis/renderer/contours/surface/types"

export type ContourWorkerRequest =
	| { type: "initialize"; world: ContourWorld }
	| {
			type: "generate"
			id: number
			field: ContourField
			sides: Int32Array
			mapOrder: boolean
	  }

export type ContourWorkerResponse = {
	id: number
	field: ContourField
	controls: Float32Array
}

export type ContourSource = Pick<
	SerializedGenesisWorld,
	"mesh" | "elevation_km" | "isLand" | "tidalRange"
>

export type PrepareContoursInput = {
	world: ContourSource
	geometry: BufferGeometry
	sides: Int32Array
	mapOrder: boolean
}

export type SetContourControlsInput = {
	job: ContourJob
	controls: Float32Array
}

export type SetContoursVisibleInput = {
	mesh: Mesh
	visible: boolean
	field: ContourField
	requestRender: () => void
}

export type ContourJob = {
	geometry: BufferGeometry
	sides: Int32Array
	mapOrder: boolean
	state: ContourWorkerState
	material: Material | null
	requestRender: (() => void) | null
	visible: boolean
	field: ContourField
	readyField: ContourField | null
	pendingField: ContourField | null
}

export type ContourWorkerState = {
	worker: Worker | null
	jobs: Map<number, ContourJob>
	users: number
	nextId: number
	world: ContourWorld
}
