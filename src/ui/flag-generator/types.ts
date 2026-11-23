import type { HeraldryShape } from "@/ui/heraldry/shield/types"
import type { FlagHue, FlagPattern } from "@/ui/heraldry/simple/types"

export interface FlagQueryUpdate {
	key: "seed" | "pattern" | "hue" | "shape"
	value: string
}

export interface FlagBatchParams {
	seed: string
	pattern: FlagPattern | "all"
	hue: FlagHue
	shape: HeraldryShape
}

export interface FlagPreview {
	pattern: FlagPattern
	seed: string
	label: string
	imageUrl: string | null
}
