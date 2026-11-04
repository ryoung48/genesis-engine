import type { TerrainSnapshot } from "@/model/pipelines/types"
import { GEOMETRY_DATA } from "@/ui/genesis/renderer/geometry-preparation/data"
import type {
	GeometryPreparation,
	GeometryPreparationInput,
	GeometryWorkerResponse,
	PreparedGeometry,
} from "@/ui/genesis/renderer/geometry-preparation/types"

function create(input: GeometryPreparationInput): GeometryPreparation {
	const worker = new Worker(new URL("./geometry.worker.ts", import.meta.url), {
		type: "module",
	})
	let started = false
	let settled = false
	let resolveResult: (geometry: PreparedGeometry | null) => void = () =>
		undefined
	const result = new Promise<PreparedGeometry | null>((resolve) => {
		resolveResult = resolve
	})
	function cancel() {
		settled = true
		worker.terminate()
		resolveResult(null)
	}
	function fail(error: Error) {
		if (settled) return
		cancel()
		input.onError(error)
	}
	worker.onmessage = (event: MessageEvent<GeometryWorkerResponse>) => {
		if (settled) return
		if (event.data.type === "error") {
			fail(new Error(event.data.message))
			return
		}
		settled = true
		worker.terminate()
		resolveResult(event.data.geometry)
		input.onReady(event.data.geometry)
	}
	worker.onerror = (event) =>
		fail(new Error(event.message || "Geometry worker crashed"))
	worker.onmessageerror = () =>
		fail(new Error("Geometry worker response could not be read"))
	function start(terrain: TerrainSnapshot) {
		if (started || settled) return
		started = true
		worker.postMessage(GEOMETRY_DATA.snapshot(terrain))
	}
	return { start, result, cancel }
}

export const GEOMETRY_PREPARATION = { create }
