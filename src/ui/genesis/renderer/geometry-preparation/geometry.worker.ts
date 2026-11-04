/// <reference lib="webworker" />

import type { TerrainSnapshot } from "@/model/pipelines/types"
import { GEOMETRY_DATA } from "@/ui/genesis/renderer/geometry-preparation/data"
import type { GeometryWorkerResponse } from "@/ui/genesis/renderer/geometry-preparation/types"

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<TerrainSnapshot>) => {
	try {
		const geometry = GEOMETRY_DATA.compute(event.data)
		self.postMessage(
			{ type: "ready", geometry } satisfies GeometryWorkerResponse,
			GEOMETRY_DATA.transferList(geometry),
		)
	} catch (error) {
		self.postMessage({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		} satisfies GeometryWorkerResponse)
	}
}
