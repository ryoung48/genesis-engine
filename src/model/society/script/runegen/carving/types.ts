import type { SharedRng } from "@/model/shared/random/rng"
import type { RuneData } from "@/model/society/script/runegen/rune/types"
import type { RuneRenderOptions } from "@/model/society/script/runegen/rune-renderer"

export type CarvingPoint = [x: number, y: number]

export type CarvingFamily =
	| "frame"
	| "spiral"
	| "compartments"
	| "fork"
	| "gate"
	| "split-stack"
	| "flanked"
	| "notched-stem"

export type CarvingWidthParams = {
	family: CarvingFamily
	rng: SharedRng
}

export type ApplyCarvingParams = {
	rune: RuneData
	family: CarvingFamily
}

export type CarvingAxisParams = {
	size: number
	rng: SharedRng
	mirrored: boolean
	noise: number
}

export type CarvingGeometryParams = {
	rune: RuneData
	options: Pick<
		RuneRenderOptions,
		"smooth" | "roundCaps" | "noise" | "oblique" | "carvingWear"
	>
}
