import type { MigrationParams } from "@/model/society/migration/types"

export interface MigrationWorldParams {
	// One character per region on the equator: "L" land, "~" shelf water, "#" deep water.
	layout: string
	stepDegrees: number
	// Habitability of each land region, in layout order.
	habitability: number[]
	horizonYear: number
}

export type MigrationWorld = MigrationParams
