import type { RuneGeneratorOptions } from "@/model/society/script/runegen/rune/types"

export interface GenerateGlyphSetParams {
	alphabet: string
	options?: RuneGeneratorOptions
	seed?: string
}

export interface LayoutGlyphTextParams {
	text: string
	config: {
		paddedWidth: number
		glyphWidths: Record<string, number>
		paddedHeight: number
		spaceWidth: number
		gap: number
		lineGap: number
		wrapWidth?: number
	}
}
