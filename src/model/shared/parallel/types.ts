export type SharedFloatArray = Float32Array | Float64Array

export type SharedArray =
	| Float32Array
	| Float64Array
	| Int32Array
	| Uint8Array
	| Int8Array

export interface CellRange {
	start: number
	end: number
}

export type CellKernel<Payload> = (params: CellRange & Payload) => void

export interface MapCellsParams<Payload> {
	// Name the kernel is registered under in the worker's kernel table.
	task: string
	kernel: CellKernel<Payload>
	count: number
	payload: Payload
}

export interface WorkerJob {
	task: string
	payload: unknown
	start: number
	end: number
	// [0] finished chunks, [1] failed chunks.
	control: Int32Array
}

export interface PoolWorker {
	postMessage: (job: WorkerJob) => void
}
