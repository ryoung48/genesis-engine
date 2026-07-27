import type { RuneGeneratorOptions } from "@/model/society/script/runegen/rune"

export interface GenerateGlyphSetParams {
	alphabet: string
	options?: RuneGeneratorOptions
	seed?: string
}

export interface LayoutGlyphTextParams {
	text: string
	config: {
		paddedWidth: number
		paddedHeight: number
		spaceWidth: number
		gap: number
		lineGap: number
		wrapWidth?: number
	}
}
