import { useEffect, useMemo, useRef, useState } from "react"
import { GLYPH_MODULE } from "@/model/society/script/runegen/glyph-module"
import type { RuneTemplate } from "@/model/society/script/runegen/rune/types"
import {
	RuneRenderer,
	type RuneRenderOptions,
} from "@/model/society/script/runegen/rune-renderer"
import { Button } from "@/ui/components/primitives/Button"
import { uiTokens } from "@/ui/components/tokens"
import { ScriptGlyphGrid } from "@/ui/genesis/controls/ScriptGlyphGrid"
import { SCRIPT_TEMPLATE_OPTIONS } from "@/ui/genesis/controls/script-overrides"
import { renderScriptTexture } from "@/ui/genesis/renderer/script-texture"

const ALPHABET = GLYPH_MODULE.defaultGlyphAlphabet.join("")
const SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog"
const PREVIEW_LINE_HEIGHT = 10

export function SocietyRunesPanel() {
	const [seed, setSeed] = useState(() => Date.now().toString(36))
	const [seedTemplate, setSeedTemplate] = useState<RuneTemplate>("random1")
	const [maxDots, setMaxDots] = useState(1)
	const [dotStyle, setDotStyle] =
		useState<RuneRenderOptions["dotStyle"]>("outline")
	const [smooth, setSmooth] = useState(true)
	const [roundCaps, setRoundCaps] = useState(true)
	const [headline, setHeadline] = useState(false)
	const [chipped, setChipped] = useState(true)
	const [textInput, setTextInput] = useState(SAMPLE_TEXT)
	const previewContainerRef = useRef<HTMLDivElement>(null)
	const [previewWidth, setPreviewWidth] = useState(240)
	const carved = seedTemplate === "carved"
	const dotCount = carved ? 0 : maxDots

	useEffect(() => {
		const el = previewContainerRef.current
		if (!el) return
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width
			if (width) setPreviewWidth(width)
		})
		observer.observe(el)
		return () => observer.disconnect()
	}, [])

	const glyphs = useMemo(
		() =>
			GLYPH_MODULE.generateGlyphSet({
				alphabet: ALPHABET,
				options: { seedTemplate, maxDots: dotCount },
				seed: `${seed}:glyphs`,
			}),
		[seedTemplate, dotCount, seed],
	)
	const preview = useMemo(
		() => ({
			glyphs,
			compressionRatio: 1,
			render: {
				...RuneRenderer.getPreset(),
				smooth,
				roundCaps,
				dotStyle,
				headline: !carved && headline,
				carvingWear: chipped ? 1 : 0,
			},
		}),
		[glyphs, smooth, roundCaps, dotStyle, carved, headline, chipped],
	)

	const textPreview = useMemo(() => {
		// Render oversampled by the device pixel ratio and display it back down
		// at the intended CSS size; otherwise a canvas sized to exactly its CSS
		// footprint looks blurry once the browser upscales it on a HiDPI screen
		const dpr = window.devicePixelRatio || 1
		const rendered = renderScriptTexture(preview, textInput, {
			targetLineHeight: PREVIEW_LINE_HEIGHT * dpr,
			wrapWidth: previewWidth * dpr,
		})
		if (!rendered) return null
		return {
			src: rendered.canvas.toDataURL(),
			width: rendered.canvas.width / dpr,
			height: rendered.canvas.height / dpr,
		}
	}, [preview, textInput, previewWidth])

	return (
		<div
			className={`space-y-1.5 border px-2.5 py-2 ${uiTokens.radius.lg} ${uiTokens.border.default} ${uiTokens.surface.panel}`}
		>
			<div className="flex items-center justify-between gap-2">
				<p
					className={`font-mono ${uiTokens.type.controlSm} ${uiTokens.text.muted}`}
				>
					Seed {seed}
				</p>
				<Button selected onClick={() => setSeed(Date.now().toString(36))}>
					New seed
				</Button>
			</div>

			<div
				className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${uiTokens.type.controlSm} ${uiTokens.text.muted}`}
			>
				<label className="flex items-center gap-1">
					Template
					<select
						value={seedTemplate}
						onChange={(e) => setSeedTemplate(e.target.value as RuneTemplate)}
						className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] text-slate-700"
					>
						{SCRIPT_TEMPLATE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>

				{carved ? (
					<label className="flex items-center gap-1">
						<input
							type="checkbox"
							checked={chipped}
							onChange={(event) => setChipped(event.target.checked)}
						/>
						Chipped edges
					</label>
				) : (
					<div className="contents">
						<label className="flex items-center gap-1">
							Dots
							<select
								value={maxDots}
								onChange={(e) => setMaxDots(Number(e.target.value))}
								className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] text-slate-700"
							>
								<option value={0}>0</option>
								<option value={1}>1</option>
								<option value={2}>2</option>
							</select>
						</label>

						<label className="flex items-center gap-1">
							Dot style
							<select
								value={dotStyle}
								onChange={(e) =>
									setDotStyle(e.target.value as RuneRenderOptions["dotStyle"])
								}
								className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] text-slate-700"
							>
								<option value="fill">Fill</option>
								<option value="outline">Outline</option>
							</select>
						</label>

						<label className="flex items-center gap-1">
							<input
								type="checkbox"
								checked={smooth}
								onChange={(e) => setSmooth(e.target.checked)}
								className="h-3 w-3"
							/>
							Smooth
						</label>

						<label className="flex items-center gap-1">
							<input
								type="checkbox"
								checked={roundCaps}
								onChange={(e) => setRoundCaps(e.target.checked)}
								className="h-3 w-3"
							/>
							Round caps
						</label>

						<label className="flex items-center gap-1">
							<input
								type="checkbox"
								checked={headline}
								onChange={(e) => setHeadline(e.target.checked)}
								className="h-3 w-3"
							/>
							Headline
						</label>
					</div>
				)}
			</div>

			<ScriptGlyphGrid script={preview} expanded={false} />

			<textarea
				aria-label="Specimen text"
				value={textInput}
				onChange={(e) => setTextInput(e.target.value)}
				placeholder="Preview text"
				rows={3}
				maxLength={400}
				className={`resize-none ${uiTokens.generator.input} ${uiTokens.type.controlSm}`}
			/>

			<div
				ref={previewContainerRef}
				className={`flex min-h-10 items-center overflow-auto border px-2 py-2 ${uiTokens.radius.md} ${uiTokens.border.default} ${uiTokens.surface.panelMuted}`}
			>
				{textPreview ? (
					<img
						src={textPreview.src}
						alt="script text preview"
						width={textPreview.width}
						height={textPreview.height}
						className="max-w-none"
					/>
				) : (
					<p className="text-[9px] text-slate-400">Enter text to preview</p>
				)}
			</div>
		</div>
	)
}
