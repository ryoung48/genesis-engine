import type { SharedRng } from "@/model/shared/random/rng"
import type { RuneData } from "@/model/society/script/runegen/rune/types"
import type { RuneRenderOptions } from "@/model/society/script/runegen/rune-renderer"

export interface PrepareRuneStrokesParams {
	rune: RuneData
	options: RuneRenderOptions
	rng: SharedRng
}

export interface GetRuneDotsParams {
	rune: RuneData
	options: Pick<RuneRenderOptions, "scale" | "oblique">
}
