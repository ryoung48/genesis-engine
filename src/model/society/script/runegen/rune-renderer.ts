import { type SharedRng } from "@/model/shared"
import { Chaikin } from "./chaikin"
import { Point2D } from "./point2d"
import { Rune } from "./rune"

export type RuneRenderOptions = {
	smooth: boolean
	roundCaps: boolean
	noise: number
	oblique: number
	color: string
	scale: number
	dotStyle: "fill" | "outline" | "small"
	// A continuous bar spanning each word, like Devanagari's shirorekha;
	// independent of any per-glyph motif since it must stay visible
	// regardless of how the template's own strokes happen to land
	headline?: boolean
}

export function prepareRuneStrokes(
	rune: Rune,
	options: RuneRenderOptions,
	rng: SharedRng,
): Point2D[][] {
	return rune.strokes
		.map((originalStroke) => {
			let stroke = originalStroke.map(
				(point) =>
					new Point2D(
						point.x * options.scale - options.oblique * point.y * options.scale,
						point.y * options.scale,
					),
			)
			const closed =
				stroke.length > 1 && stroke[0].equals(stroke[stroke.length - 1])

			if (options.noise !== 0) {
				stroke = stroke.map(
					(point) =>
						new Point2D(
							point.x + (rng.random() - 0.5) * options.noise * options.scale,
							point.y + (rng.random() - 0.5) * options.noise * options.scale,
						),
				)
			}

			if (options.smooth) {
				stroke = Chaikin.render(closed ? stroke.slice(1) : stroke, closed, 4)
			}

			return stroke
		})
		.filter((stroke) => stroke.length >= 2)
}

export function getRuneDots(
	rune: Rune,
	options: Pick<RuneRenderOptions, "scale" | "oblique">,
): Point2D[] {
	const dots =
		(rune.dots?.length ?? 0) > 0
			? rune.dots
			: rune.dotx !== -1 && rune.doty !== -1
				? [new Point2D(rune.dotx, rune.doty)]
				: []
	return dots.map(
		(dot) =>
			new Point2D(
				dot.x * options.scale - options.oblique * dot.y * options.scale,
				dot.y * options.scale,
			),
	)
}

// Calibrated so a scale of 7 (the app's usual render scale) reproduces the
// original sqrt(2*scale) radius; linear beyond that so dot size stays
// proportional to stroke width at scales far from that reference instead of
// shrinking more slowly than the strokes around it
const DOT_RADIUS_REFERENCE_SCALE = 7
const DOT_RADIUS_FACTOR =
	Math.sqrt(2 * DOT_RADIUS_REFERENCE_SCALE) / DOT_RADIUS_REFERENCE_SCALE

export function getRuneDotRadius(
	options: Pick<RuneRenderOptions, "scale" | "dotStyle">,
): number {
	return (
		options.scale * DOT_RADIUS_FACTOR * (options.dotStyle === "small" ? 0.7 : 1)
	)
}

export class RuneRenderer {
	static defaultOptions: RuneRenderOptions = {
		smooth: false,
		roundCaps: false,
		noise: 0,
		oblique: 0,
		color: "#222222",
		scale: 4,
		dotStyle: "fill",
		headline: false,
	}

	static getPreset(scale = 4): RuneRenderOptions {
		return { ...RuneRenderer.defaultOptions, scale }
	}
}
