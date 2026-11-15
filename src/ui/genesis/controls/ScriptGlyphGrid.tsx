import { useMemo } from "react"
import type { ScriptAppearance } from "@/model/society/script/types"
import { uiTokens } from "@/ui/components/tokens"
import { renderScriptTexture } from "@/ui/genesis/renderer/script-texture"

type ScriptGlyphGridProps = {
	script: ScriptAppearance
	expanded: boolean
}

export function ScriptGlyphGrid({ script, expanded }: ScriptGlyphGridProps) {
	const glyphImages = useMemo(
		() =>
			Object.entries(script.glyphs).map(([char, rune]) => {
				const rendered = renderScriptTexture(
					{ ...script, glyphs: { [char]: rune } },
					char,
				)
				return { char, src: rendered?.canvas.toDataURL() }
			}),
		[script],
	)

	return (
		<div
			aria-label="Script alphabet"
			className={`grid border ${uiTokens.radius.md} ${uiTokens.border.default} ${uiTokens.surface.panelMuted} ${expanded ? "grid-cols-5 gap-2 p-3 sm:grid-cols-9 lg:grid-cols-13" : "grid-cols-8 gap-0.5 p-1.5"}`}
		>
			{glyphImages.map(({ char, src }) => (
				<div
					key={char}
					className={`flex flex-col items-center justify-center overflow-hidden ${expanded ? "gap-1" : "h-4"}`}
					title={char}
				>
					{src && (
						<img
							src={src}
							alt={`glyph ${char}`}
							className={`max-w-full object-contain ${expanded ? "h-12" : "max-h-full"}`}
						/>
					)}
					{expanded && (
						<span
							aria-hidden="true"
							className={`font-mono ${uiTokens.type.controlSm} ${uiTokens.text.muted}`}
						>
							{char}
						</span>
					)}
				</div>
			))}
		</div>
	)
}
