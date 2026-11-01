import type { FlagHue, FlagPattern } from "@/ui/heraldry/simple/types"

export interface FlagQueryUpdate {
	key: "seed" | "pattern" | "hue"
	value: string
}

export interface FlagBatchParams {
	seed: string
	pattern: FlagPattern | "all"
	hue: FlagHue
}

export interface FlagPreview {
	pattern: FlagPattern
	seed: string
	label: string
	imageUrl: string | null
}
