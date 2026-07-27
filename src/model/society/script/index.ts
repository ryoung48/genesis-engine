import { createStringRng } from "@/model/shared"
import {
	GLYPH_MODULE,
	type GlyphSet,
} from "@/model/society/script/runegen/glyph-module"
import {
	RuneRenderer,
	type RuneRenderOptions,
} from "@/model/society/script/runegen/rune-renderer"

export interface HeritageScript {
	glyphs: GlyphSet
	compressionRatio: number
	render: RuneRenderOptions
}

const DOT_STYLES: RuneRenderOptions["dotStyle"][] = ["fill", "outline", "small"]

export const SCRIPT = {
	spawn(seed: string): HeritageScript {
		const dice = createStringRng(seed)
		const glyphSeed = `${seed}:glyphs:${Math.floor(dice.random() * 1e9).toString(36)}`
		const dotStyle = dice.choice(DOT_STYLES)
		return {
			glyphs: GLYPH_MODULE.generateGlyphSet({
				alphabet: GLYPH_MODULE.defaultGlyphAlphabet.join(""),
				options: {},
				seed: glyphSeed,
			}),
			compressionRatio: dice.uniform(0.6, 1.0),
			render: {
				...RuneRenderer.getPreset(),
				noise: 0,
				dotStyle,
			},
		}
	},
}
