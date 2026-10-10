import type { Route } from "@/model/society/infrastructure/transport/types"
export interface CanonicalRoute {
	from: number
	to: number
	kind: number
	path: number[]
}
export interface CanonicalRoutesParams {
	routes: readonly Route[]
}
