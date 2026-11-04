import type { BufferGeometry, Material, Mesh } from "three"
import type { ContourWorld } from "@/ui/genesis/renderer/contours/surface/types"

export type ContourWorkerRequest =
	| { type: "initialize"; world: ContourWorld }
	| { type: "generate"; id: number; sides: Int32Array; mapOrder: boolean }

export type ContourWorkerResponse = { id: number; controls: Float32Array }

export type PrepareContoursInput = {
	world: ContourWorld
	geometry: BufferGeometry
	sides: Int32Array
	mapOrder: boolean
}

export type SetContoursVisibleInput = {
	mesh: Mesh
	visible: boolean
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
	ready: boolean
	pending: boolean
}

export type ContourWorkerState = {
	worker: Worker | null
	jobs: Map<number, ContourJob>
	users: number
	nextId: number
	world: ContourWorld
}
