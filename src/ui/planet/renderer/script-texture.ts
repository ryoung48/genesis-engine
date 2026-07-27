import { createStringRng } from "@/model/shared"
import type { HeritageScript } from "@/model/society/script"
import { GLYPH_MODULE } from "@/model/society/script/runegen/glyph-module"
import { RUNE_RENDERER } from "@/model/society/script/runegen/rune-renderer"
import { LABEL_OUTLINE_COLOR } from "@/ui/planet/renderer/nation-label-overlay"

const CELL_SCALE = 7
// Layout spacing scales with the render scale (like stroke width already
// does below), so a smaller scale doesn't leave fixed-pixel gaps looking
// disproportionately wide next to shrunken glyphs
const GLYPH_PADDING_FACTOR = 2 / CELL_SCALE
const GLYPH_GAP_FACTOR = 3 / CELL_SCALE
const LINE_GAP_FACTOR = 6 / CELL_SCALE
const TEXTURE_MARGIN_FACTOR = 8 / CELL_SCALE
const SPACE_WIDTH_FACTOR = 0.7
const OUTLINE_WIDTH_FACTOR = 1.5
const STROKE_WIDTH_FACTOR = 0.45
const DOT_RING_RADIUS_FACTOR = 1.2
const DOT_RING_WIDTH_FACTOR = 0.2
const DOT_RING_HALO_WIDTH_FACTOR = 0.45
const CURSIVE_CONNECTOR_Y = 4
const CURSIVE_CONNECTOR_OVERLAP_FACTOR = 0.6

interface ScriptTextureRender {
	canvas: HTMLCanvasElement
	aspect: number
}

const LABEL_DARK = `#${LABEL_OUTLINE_COLOR.toString(16).padStart(6, "0")}`

function drawOutlineDot(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	dotRadius: number,
	scale: number,
) {
	const ringRadius = Math.max(dotRadius * DOT_RING_RADIUS_FACTOR, scale * 0.7)

	ctx.strokeStyle = LABEL_DARK
	ctx.lineWidth = Math.max(1, scale * DOT_RING_HALO_WIDTH_FACTOR)
	ctx.beginPath()
	ctx.arc(x, y, ringRadius, 0, Math.PI * 2)
	ctx.stroke()

	ctx.lineWidth = Math.max(1, scale * DOT_RING_WIDTH_FACTOR)
	ctx.beginPath()
	ctx.arc(x, y, ringRadius, 0, Math.PI * 2)
	ctx.stroke()
}

function drawHeadlineBars(
	ctx: CanvasRenderingContext2D,
	layout: NonNullable<ReturnType<typeof GLYPH_MODULE.layoutGlyphText>>,
	padding: number,
	margin: number,
) {
	for (const segment of layout.headlines) {
		const y = segment.y + padding + margin
		ctx.beginPath()
		ctx.moveTo(segment.from + margin, y)
		ctx.lineTo(segment.to + margin, y)
		ctx.stroke()
	}
}

function drawCursiveConnectors(
	ctx: CanvasRenderingContext2D,
	script: HeritageScript,
	layout: NonNullable<ReturnType<typeof GLYPH_MODULE.layoutGlyphText>>,
	scale: number,
	padding: number,
	margin: number,
) {
	const overlap = Math.max(0.75, scale * CURSIVE_CONNECTOR_OVERLAP_FACTOR)
	for (const word of layout.words) {
		for (let index = 0; index < word.letters.length - 1; index++) {
			const left = word.letters[index]
			const right = word.letters[index + 1]
			const leftRune = script.glyphs[left.char]
			const rightRune = script.glyphs[right.char]
			if (!leftRune || !rightRune) continue
			if (
				leftRune.getTemplate() !== "cursive" ||
				rightRune.getTemplate() !== "cursive"
			) {
				continue
			}
			const x1 = left.x + padding + margin + leftRune.width * scale - overlap
			const x2 = right.x + padding + margin + overlap
			if (x2 <= x1) continue
			const y1 = left.y + padding + margin + CURSIVE_CONNECTOR_Y * scale
			const y2 = right.y + padding + margin + CURSIVE_CONNECTOR_Y * scale
			ctx.beginPath()
			ctx.moveTo(x1, y1)
			ctx.lineTo(x2, y2)
			ctx.stroke()
		}
	}
}

export function renderScriptTexture(
	script: HeritageScript,
	text: string,
	options?: { scale?: number; targetLineHeight?: number; wrapWidth?: number },
): ScriptTextureRender | null {
	const sample = Object.values(script.glyphs)[0]
	if (!sample) return null

	// wrapWidth is interpreted in the same raw pixel space as the render
	// scale, so a caller that wants wrapWidth to line up with an on-screen
	// container width should pick the scale that puts glyphs at that size —
	// targetLineHeight solves for that scale instead of the caller guessing it
	const scale =
		options?.scale ??
		(options?.targetLineHeight
			? Math.max(
					0.5,
					options.targetLineHeight / (sample.height + 2 * GLYPH_PADDING_FACTOR),
				)
			: CELL_SCALE)
	const renderOptions = { ...script.render, scale }
	const padding = scale * GLYPH_PADDING_FACTOR
	const gap = scale * GLYPH_GAP_FACTOR
	const lineGap = scale * LINE_GAP_FACTOR
	const margin = scale * TEXTURE_MARGIN_FACTOR
	const glyphWidth = sample.width * renderOptions.scale
	const glyphHeight = sample.height * renderOptions.scale
	const paddedWidth = glyphWidth + padding * 2
	const paddedHeight = glyphHeight + padding * 2
	const spaceWidth = Math.max(1, Math.round(paddedWidth * SPACE_WIDTH_FACTOR))
	const layout = GLYPH_MODULE.layoutGlyphText({
		text,
		config: {
			paddedWidth,
			paddedHeight,
			spaceWidth,
			gap,
			lineGap,
			wrapWidth: options?.wrapWidth,
		},
	})
	if (!layout) return null

	const canvas = document.createElement("canvas")
	canvas.width = Math.max(1, Math.ceil(layout.width + margin * 2))
	canvas.height = Math.max(1, Math.ceil(layout.height + margin * 2))
	const ctx = canvas.getContext("2d")
	if (!ctx) return null

	ctx.clearRect(0, 0, canvas.width, canvas.height)
	ctx.lineCap = script.render.roundCaps ? "round" : "butt"

	for (let index = 0; index < layout.placements.length; index++) {
		const placement = layout.placements[index]
		const rune = script.glyphs[placement.char]
		if (!rune) continue

		const rng = createStringRng(`${text}:${placement.char}:${index}`)
		const strokes = RUNE_RENDERER.prepareRuneStrokes({
			rune,
			options: renderOptions,
			rng,
		})
		const dots = RUNE_RENDERER.getRuneDots({ rune, options: renderOptions })
		const dotRadius = RUNE_RENDERER.getRuneDotRadius(renderOptions)
		const tx = placement.x + padding + margin
		const ty = placement.y + padding + margin

		for (const width of [
			renderOptions.scale * STROKE_WIDTH_FACTOR * OUTLINE_WIDTH_FACTOR,
			renderOptions.scale * STROKE_WIDTH_FACTOR,
		]) {
			ctx.strokeStyle = LABEL_DARK
			ctx.lineWidth = width

			for (const stroke of strokes) {
				ctx.beginPath()
				stroke.forEach((point, pointIndex) => {
					const x = tx + point.x
					const y = ty + point.y
					if (pointIndex === 0) {
						ctx.moveTo(x, y)
					} else {
						ctx.lineTo(x, y)
					}
				})
				ctx.stroke()
			}
		}

		ctx.fillStyle = LABEL_DARK
		for (const dot of dots) {
			const x = tx + dot.x
			const y = ty + dot.y
			if (script.render.dotStyle === "outline") {
				drawOutlineDot(ctx, x, y, dotRadius, renderOptions.scale)
				continue
			}
			if (script.render.dotStyle === "small") {
				ctx.fillRect(
					x - dotRadius * 0.7,
					y - dotRadius * 0.7,
					dotRadius * 1.4,
					dotRadius * 1.4,
				)
				continue
			}
			ctx.beginPath()
			ctx.arc(x, y, dotRadius, 0, Math.PI * 2)
			ctx.fill()
		}
	}

	for (const width of [
		renderOptions.scale * STROKE_WIDTH_FACTOR * OUTLINE_WIDTH_FACTOR,
		renderOptions.scale * STROKE_WIDTH_FACTOR,
	]) {
		ctx.strokeStyle = LABEL_DARK
		ctx.lineWidth = width
		drawCursiveConnectors(
			ctx,
			script,
			layout,
			renderOptions.scale,
			padding,
			margin,
		)
		if (script.render.headline) {
			drawHeadlineBars(ctx, layout, padding, margin)
		}
	}

	return {
		canvas,
		aspect: canvas.width / Math.max(1, canvas.height),
	}
}
