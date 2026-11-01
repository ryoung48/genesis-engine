/// <reference lib="webworker" />

import { TRADE_ROUTE_POSITIONS } from "@/ui/genesis/renderer/trade-route-positions"
import type {
	TradeRouteWorkerRequest,
	TradeRouteWorkerResponse,
} from "@/ui/genesis/renderer/types"

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<TradeRouteWorkerRequest>) => {
	const { requestId, request } = event.data
	const positions = TRADE_ROUTE_POSITIONS.compute(request)
	const response: TradeRouteWorkerResponse = { requestId, positions }
	self.postMessage(response, [
		...Object.values(positions.globe).map((array) => array.buffer),
		...Object.values(positions.map).map((array) => array.buffer),
	])
}
