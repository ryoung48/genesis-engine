import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { SerializedRouteKind } from "@/model/society/infrastructure/transport/types"
import type {
	TradeRoutePositionRequest,
	TradeRoutePositionSet,
	TradeRoutePositions,
	TradeRouteWorkerResponse,
} from "@/ui/genesis/renderer/types"

const SEA_ROUTE_DASH_STYLE = {
	dashSize: 0.006,
	gapSize: 0.004,
} as const
const TRADE_ROUTE_STYLE = {
	[TRANSPORT.ROUTE_LAND_MAJOR]: {
		color: 0xb91c1c,
		baseWidth: 0.5,
		opacity: 0.9,
		dashed: false,
	},
	[TRANSPORT.ROUTE_LAND_MINOR]: {
		color: 0xd97706,
		baseWidth: 0.35,
		opacity: 0.68,
		dashed: false,
	},
	[TRANSPORT.ROUTE_SEA]: {
		color: 0x2563eb,
		baseWidth: 0.55,
		opacity: 0.82,
		dashed: true,
	},
} as const

interface OverlayResolution {
	width: number
	height: number
}

interface TradeRouteOverlayBuild {
	group: THREE.Group
	materials: LineMaterial[]
}

interface PendingRequest {
	resolve: (positions: TradeRoutePositions) => void
}

let worker: Worker | null = null
let nextRequestId = 0
const pending = new Map<number, PendingRequest>()

function getWorker(): Worker {
	if (worker) return worker
	worker = new Worker(new URL("./trade-route.worker.ts", import.meta.url), {
		type: "module",
	})
	worker.onmessage = (event: MessageEvent<TradeRouteWorkerResponse>) => {
		const { requestId, positions } = event.data
		pending.get(requestId)?.resolve(positions)
		pending.delete(requestId)
	}
	return worker
}

export function computeTradeRoutePositions(
	request: TradeRoutePositionRequest,
): Promise<TradeRoutePositions> {
	const requestId = nextRequestId++
	return new Promise((resolve) => {
		pending.set(requestId, { resolve })
		getWorker().postMessage({ requestId, request })
	})
}

export function terminateTradeRouteWorker() {
	worker?.terminate()
	worker = null
	pending.clear()
}

function createBatchedLine(
	kind: SerializedRouteKind,
	positions: Float32Array,
	resolution: OverlayResolution,
): { line: LineSegments2; material: LineMaterial } | null {
	if (positions.length < 6) return null
	const style = TRADE_ROUTE_STYLE[kind]
	const geometry = new LineSegmentsGeometry()
	geometry.setPositions(positions)
	const material = new LineMaterial({
		color: style.color,
		linewidth: style.baseWidth,
		transparent: true,
		opacity: style.opacity,
		depthWrite: false,
		dashed: style.dashed,
		...(style.dashed ? SEA_ROUTE_DASH_STYLE : {}),
	})
	material.userData.baseWidth = style.baseWidth
	material.resolution.set(resolution.width, resolution.height)
	const line = new LineSegments2(geometry, material)
	line.computeLineDistances()
	line.renderOrder = 997
	return { line, material }
}

function appendBatchedLines(
	group: THREE.Group,
	materials: LineMaterial[],
	batchedPositions: TradeRoutePositionSet,
	resolution: OverlayResolution,
): void {
	for (const kind of [
		TRANSPORT.ROUTE_LAND_MAJOR,
		TRANSPORT.ROUTE_LAND_MINOR,
		TRANSPORT.ROUTE_SEA,
	] as const) {
		const line = createBatchedLine(kind, batchedPositions[kind], resolution)
		if (!line) continue
		group.add(line.line)
		materials.push(line.material)
	}
}

export function buildTradeRouteLines(
	positions: TradeRoutePositionSet,
	resolution: OverlayResolution,
): TradeRouteOverlayBuild {
	const group = new THREE.Group()
	const materials: LineMaterial[] = []
	appendBatchedLines(group, materials, positions, resolution)
	return { group, materials }
}
