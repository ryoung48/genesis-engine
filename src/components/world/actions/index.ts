import {
	pointers as d3Pointers,
	mean,
	pointer,
	select,
	ZoomBehavior,
	zoom,
} from "d3"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import versor from "versor"

import { MAP_SHAPES } from "../shapes"
import { MouseoverParams, MoveToParams, ZoomEvent, ZoomParams } from "./types"

let zoomRef: ZoomBehavior<Element, unknown> = null
let v0: number, r0: [number, number, number], q0: number

function getPointerCoords(zoomEv: ZoomEvent, node: Element) {
	const pointers = d3Pointers(zoomEv, node)
	return pointers && pointers.length > 1
		? [0, 1].map((idx) => mean(pointers.map((t) => t[idx]))) // calc centroid of all points if multi-touch
		: pointers.length
			? pointers[0] // single point click
			: [undefined, undefined]
}

export const ACTION = {
	zoom: ({ projection, node, onMove }: ZoomParams) => {
		function zoomStarted(ev: ZoomEvent) {
			if (!projection) return
			v0 = versor.cartesian(
				projection.invert(
					getPointerCoords(ev, node) as unknown as [number, number],
				),
			)
			r0 = projection.rotate()
			q0 = versor(r0)
		}

		function zoomed(ev: ZoomEvent) {
			if (!projection) return
			const scale = ev.transform.k * MAP_SHAPES.scale.init
			projection.scale(scale)
			const v1 = versor.cartesian(
					projection
						.rotate(r0)
						.invert(getPointerCoords(ev, node) as unknown as [number, number]),
				),
				q1 = versor.multiply(q0, versor.delta(v0, v1)),
				rotation = versor.rotation(q1)
			projection.rotate(rotation)
			onMove({ rotation, scale })
		}

		zoomRef = zoom()
			.scaleExtent([2, 200])
			.on("start", zoomStarted)
			.on("zoom", zoomed)
		const selection = select(node)
		selection.call(zoomRef)
		return zoomRef
	},
	mouseover: ({ projection, node, onMove }: MouseoverParams) => {
		const selection = select(node)
		selection.on("mousemove", (event: MouseEvent) => {
			const [x, y] = projection.invert(pointer(event))
			onMove({ x, y })
		})
	},
	moveTo: ({ node, projection, scale, x, y, onComplete }: MoveToParams) => {
		if (!zoomRef) return
		const selection = select(node)
		zoomRef.scaleTo(selection, scale)
		projection.rotate([-x, -y, 0])
		onComplete?.()
	},
}
