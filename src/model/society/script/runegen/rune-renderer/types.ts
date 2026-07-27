import type { Rune } from "@/model/society/script/runegen/rune"
import type { RuneRenderOptions } from "@/model/society/script/runegen/rune-renderer"
import type { SharedRng } from "@/model/shared/rng"

export interface PrepareRuneStrokesParams {
	rune: Rune
	options: RuneRenderOptions
	rng: SharedRng
}

export interface GetRuneDotsParams {
	rune: Rune
	options: Pick<RuneRenderOptions, "scale" | "oblique">
}
