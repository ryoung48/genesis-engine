import { RNG } from "@/model/shared/random/rng"
import { COMPRESS } from "@/model/society/script/compress"
import { GLYPH_MODULE } from "@/model/society/script/runegen/glyph-module"
import {
	RuneRenderer,
	type RuneRenderOptions,
} from "@/model/society/script/runegen/rune-renderer"

import type {
	CompressLabelParams,
	ScriptAppearance,
	SpawnHeritageScriptParams,
} from "@/model/society/script/types"

export interface HeritageScript extends ScriptAppearance {
	languageSeed: number
	compressionRatio: number
}

const DOT_STYLES: RuneRenderOptions["dotStyle"][] = ["fill", "outline", "small"]

export const SCRIPT = {
	spawn({
		languageSeed,
		generatorOptions,
	}: SpawnHeritageScriptParams): HeritageScript {
		const seed = `script:${languageSeed}`
		const dice = RNG.createStringRng({ seed })
		const glyphSeed = `${seed}:glyphs:${Math.floor(dice.random() * 1e9).toString(36)}`
		const dotStyle = dice.choice(DOT_STYLES)
		return {
			languageSeed,
			glyphs: GLYPH_MODULE.generateGlyphSet({
				alphabet: GLYPH_MODULE.defaultGlyphAlphabet.join(""),
				options: generatorOptions,
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
	compressLabel({ name, script }: CompressLabelParams): string {
		return COMPRESS.compressName({
			name,
			ratio: script.compressionRatio,
			languageSeed: script.languageSeed,
		})
	},
}
