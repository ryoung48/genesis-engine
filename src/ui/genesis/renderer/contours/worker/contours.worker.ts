/// <reference lib="webworker" />

import { CONTOUR_SURFACE } from "@/ui/genesis/renderer/contours/surface"
import type { ContourWorld } from "@/ui/genesis/renderer/contours/surface/types"
import type {
	ContourWorkerRequest,
	ContourWorkerResponse,
} from "@/ui/genesis/renderer/contours/worker/types"

declare const self: DedicatedWorkerGlobalScope

let world: ContourWorld | null = null

self.onmessage = (event: MessageEvent<ContourWorkerRequest>) => {
	const message = event.data
	if (message.type === "initialize") {
		world = message.world
		return
	}
	if (!world) throw new Error("Contour world is not initialized")
	const surface = CONTOUR_SURFACE.create(world)
	const controls = new Float32Array(message.sides.length * 30)
	for (let face = 0; face < message.sides.length; face++) {
		const side = message.sides[face]
		CONTOUR_SURFACE.writeControls({
			world,
			surface,
			innerTriangle: world.mesh.s_inner_t[side],
			outerTriangle: world.mesh.s_outer_t[side],
			region: world.mesh.s_begin_r[side],
			mapOrder: message.mapOrder,
			controls,
			face,
		})
	}
	self.postMessage(
		{ id: message.id, controls } satisfies ContourWorkerResponse,
		[controls.buffer],
	)
}
