import type {
	MapCellsParams,
	PoolWorker,
	SharedArray,
} from "@/model/shared/parallel/types"

// Below this many cells a chunked run costs more in hand-off than it saves.
const MIN_PARALLEL_CELLS = 50_000

const MAX_WORKERS = 7

let pool: PoolWorker[] | null = null

// Worker threads exist only under Node; elsewhere every kernel runs in place.
function startPool(): PoolWorker[] {
	const threads =
		typeof process !== "undefined" && process.versions?.node
			? process.getBuiltinModule?.("node:worker_threads")
			: undefined
	const os =
		typeof process !== "undefined"
			? process.getBuiltinModule?.("node:os")
			: undefined
	if (
		!threads ||
		!os ||
		!threads.isMainThread ||
		process.env.GENESIS_WORKERS === "0"
	)
		return []
	const size = Math.min(
		MAX_WORKERS,
		Number(process.env.GENESIS_WORKERS ?? os.availableParallelism() - 1),
	)
	const workers: PoolWorker[] = []
	for (let i = 0; i < size; i++) {
		const worker = new threads.Worker(
			new URL("./worker/node-entry.mjs", import.meta.url),
		)
		worker.unref()
		workers.push(worker)
	}
	return workers
}

// Copies an array into memory the pool workers can see; a no-op without a pool.
function shared<T extends SharedArray>(source: T): T {
	pool ??= startPool()
	if (pool.length === 0 || source.buffer instanceof SharedArrayBuffer)
		return source
	const copy = new (source.constructor as new (buffer: SharedArrayBuffer) => T)(
		new SharedArrayBuffer(source.byteLength),
	)
	copy.set(source)
	return copy
}

// Runs a kernel over every cell index, split across the pool. The kernel must
// compute each cell from read-only inputs so the split cannot change results.
function mapCells<Payload>(params: MapCellsParams<Payload>): void {
	if (params.count < MIN_PARALLEL_CELLS)
		params.kernel({ ...params.payload, start: 0, end: params.count })
	else mapItems(params)
}

// Same split for a handful of heavy independent items, such as months.
function mapItems<Payload>({
	task,
	kernel,
	count,
	payload,
}: MapCellsParams<Payload>): void {
	pool ??= startPool()
	if (pool.length === 0 || count < 2) {
		kernel({ ...payload, start: 0, end: count })
		return
	}
	const chunks = Math.min(count, pool.length + 1)
	const size = Math.ceil(count / chunks)
	const control = new Int32Array(new SharedArrayBuffer(8))
	const helpers = chunks - 1
	for (let i = 0; i < helpers; i++)
		pool[i].postMessage({
			task,
			payload,
			start: (i + 1) * size,
			end: Math.min(count, (i + 2) * size),
			control,
		})
	kernel({ ...payload, start: 0, end: Math.min(count, size) })
	let finished = Atomics.load(control, 0)
	while (finished < helpers) {
		Atomics.wait(control, 0, finished)
		finished = Atomics.load(control, 0)
	}
	if (Atomics.load(control, 1) > 0)
		throw new Error(`Parallel task "${task}" failed in a worker`)
}

// Returns results to ordinary memory so later stages can transfer or clone them.
function local<T extends SharedArray>(source: T): T {
	if (!(source.buffer instanceof SharedArrayBuffer)) return source
	const copy = new (source.constructor as new (length: number) => T)(
		source.length,
	)
	copy.set(source)
	return copy
}

// Starts the workers ahead of first use so they load while earlier stages run.
function warm(): void {
	pool ??= startPool()
}

export const PARALLEL = { mapCells, mapItems, shared, local, warm }
