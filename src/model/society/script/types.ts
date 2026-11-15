import type { HeritageScript } from "@/model/society/script"
import type { GlyphSet } from "@/model/society/script/runegen/glyph-module"
import type { RuneGeneratorOptions } from "@/model/society/script/runegen/rune/types"
import type { RuneRenderOptions } from "@/model/society/script/runegen/rune-renderer"

export interface ScriptAppearance {
	glyphs: GlyphSet
	render: RuneRenderOptions
}

export interface SpawnHeritageScriptParams {
	languageSeed: number
	// [JUSTIFICATION] Map callers use automatic glyph settings.
	generatorOptions?: RuneGeneratorOptions
}

export interface CompressLabelParams {
	name: string
	script: HeritageScript
}
