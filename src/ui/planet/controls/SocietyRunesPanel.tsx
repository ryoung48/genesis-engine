import { useEffect, useMemo, useRef, useState } from "react"
import {
	GLYPH_MODULE,
	type GlyphSet,
} from "@/model/society/script/runegen/glyph-module"
import type {
	RuneGeneratorOptions,
	RuneTemplate,
} from "@/model/society/script/runegen/rune"
import {
	RuneRenderer,
	type RuneRenderOptions,
} from "@/model/society/script/runegen/rune-renderer"
import { renderScriptTexture } from "@/ui/planet/renderer/script-texture"
import { RNG } from "@/model/shared/rng"

type TemplateOption = {
	value: RuneTemplate
	label: string
}

type GeneratedPreview = {
	glyphs: GlyphSet
	render: RuneRenderOptions
	seed: string
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
	{ value: "random1", label: "Classic 1" },
	{ value: "random2", label: "Classic 2" },
	{ value: "random4", label: "Hollow" },
	{ value: "random5", label: "Spine" },
	{ value: "cursive", label: "Cursive" },
]
const TEMPLATE_VALUES = TEMPLATE_OPTIONS.map((option) => option.value)

const LOREM_IPSUM =
	"Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua"

// Swatch grid is denser than the alphabet itself; cycle the real a-z glyphs
// to fill it rather than inventing extra non-letter characters (the text
// layout only understands a-z, so anything else renders blank)
const GRID_COLUMNS = 8
const GRID_ROWS = 4
const GRID_CHARS = Array.from(
	{ length: GRID_COLUMNS * GRID_ROWS },
	(_, i) =>
		GLYPH_MODULE.defaultGlyphAlphabet[
			i % GLYPH_MODULE.defaultGlyphAlphabet.length
		],
)
// Target on-screen line height for the wrapped text preview, well below the
// canvas's native raw pixel size
const PREVIEW_LINE_HEIGHT_PX = 10

function buildPreview(
	generatorOptions: RuneGeneratorOptions,
	renderKnobs: Pick<
		RuneRenderOptions,
		"smooth" | "roundCaps" | "dotStyle" | "headline"
	>,
	seed: string,
): GeneratedPreview {
	const dice = RNG.createStringRng({ seed })
	const glyphSeed = `${seed}:glyphs:${Math.floor(dice.random() * 1e9).toString(36)}`
	return {
		glyphs: GLYPH_MODULE.generateGlyphSet({
			alphabet: GLYPH_MODULE.defaultGlyphAlphabet.join(""),
			options: generatorOptions,
			seed: glyphSeed,
		}),
		render: {
			...RuneRenderer.getPreset(6),
			...renderKnobs,
			noise: 0,
		},
		seed,
	}
}

export function SocietyRunesPanel() {
	const [seed, setSeed] = useState(() => Date.now().toString(36))
	const [seedTemplate, setSeedTemplate] = useState<RuneTemplate>("random1")
	const [maxDots, setMaxDots] = useState(1)
	const [dotStyle, setDotStyle] =
		useState<RuneRenderOptions["dotStyle"]>("outline")
	const [smooth, setSmooth] = useState(true)
	const [roundCaps, setRoundCaps] = useState(true)
	const [headline, setHeadline] = useState(false)
	const [textInput, setTextInput] = useState(LOREM_IPSUM)
	const previewContainerRef = useRef<HTMLDivElement>(null)
	const [previewWidth, setPreviewWidth] = useState(240)

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

	const preview = useMemo<GeneratedPreview>(
		() =>
			buildPreview(
				{
					symmetryBias: "none",
					weightBand: "any",
					seedTemplate,
					maxDots,
					allowDiscontinuousStrokes: false,
				},
				{ smooth, roundCaps, dotStyle, headline },
				seed,
			),
		[seedTemplate, maxDots, headline, smooth, roundCaps, dotStyle, seed],
	)

	const handleGenerate = () => {
		const nextSeed = Date.now().toString(36)
		const dice = RNG.createStringRng({ seed: nextSeed })
		setSeed(nextSeed)
		setSeedTemplate(dice.choice(TEMPLATE_VALUES))
		setMaxDots(dice.choice([0, 1, 2]))
		setDotStyle(dice.choice<RuneRenderOptions["dotStyle"]>(["fill", "outline"]))
		setSmooth(dice.random() < 0.5)
		setRoundCaps(dice.random() < 0.5)
	}

	const glyphImages = useMemo(
		() =>
			GRID_CHARS.map((char) => {
				const rendered = renderScriptTexture(
					{
						glyphs: { [char]: preview.glyphs[char] },
						compressionRatio: 1,
						render: preview.render,
					},
					char,
				)
				return {
					char,
					src: rendered?.canvas.toDataURL() ?? null,
				}
			}),
		[preview],
	)

	const textPreview = useMemo(() => {
		// Render oversampled by the device pixel ratio and display it back down
		// at the intended CSS size; otherwise a canvas sized to exactly its CSS
		// footprint looks blurry once the browser upscales it on a HiDPI screen
		const dpr = window.devicePixelRatio || 1
		const rendered = renderScriptTexture(
			{
				glyphs: preview.glyphs,
				compressionRatio: 1,
				render: preview.render,
			},
			textInput,
			{
				targetLineHeight: PREVIEW_LINE_HEIGHT_PX * dpr,
				wrapWidth: previewWidth * dpr,
			},
		)
		if (!rendered) return null
		return {
			src: rendered.canvas.toDataURL(),
			width: rendered.canvas.width / dpr,
			height: rendered.canvas.height / dpr,
		}
	}, [preview, textInput, previewWidth])

	return (
		<div className="space-y-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
			<div className="flex items-center justify-between gap-2">
				<p className="font-mono text-[9px] text-slate-400">
					seed {preview.seed}
				</p>
				<button
					type="button"
					onClick={handleGenerate}
					className="rounded-md border border-slate-900 bg-slate-900 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-slate-800"
				>
					Regenerate
				</button>
			</div>

			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
				<label className="flex items-center gap-1">
					Template
					<select
						value={seedTemplate}
						onChange={(e) => setSeedTemplate(e.target.value as RuneTemplate)}
						className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] text-slate-700"
					>
						{TEMPLATE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>

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

			<div
				className="grid gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-1.5"
				style={{
					gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
				}}
			>
				{glyphImages.map((glyph, i) => (
					<div
						key={i}
						className="flex h-4 items-center justify-center overflow-hidden"
						title={glyph.char}
					>
						{glyph.src ? (
							<img
								src={glyph.src}
								alt={`glyph ${glyph.char}`}
								className="max-h-full max-w-full object-contain"
							/>
						) : (
							<span className="text-[6px] text-slate-300">·</span>
						)}
					</div>
				))}
			</div>

			<textarea
				value={textInput}
				onChange={(e) => setTextInput(e.target.value)}
				placeholder="Preview text"
				rows={3}
				className="w-full resize-none rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] leading-snug text-slate-700"
			/>

			<div
				ref={previewContainerRef}
				className="flex min-h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-2"
			>
				{textPreview ? (
					<img
						src={textPreview.src}
						alt="script text preview"
						width={textPreview.width}
						height={textPreview.height}
						className="max-w-full"
					/>
				) : (
					<p className="text-[9px] text-slate-400">Enter text to preview</p>
				)}
			</div>
		</div>
	)
}
