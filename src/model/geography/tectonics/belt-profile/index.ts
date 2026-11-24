import type { BroadProfileParams } from "@/model/geography/tectonics/belt-profile/types"
import { CRUST } from "@/model/geography/tectonics/crust"

const clamp = (v: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, v))

const smooth = (a: number, b: number, x: number) => {
	const t = clamp((x - a) / (b - a), 0, 1)
	return t * t * (3 - 2 * t)
}

const bump = (x: number, c: number, s: number) => {
	const t = (x - c) / s
	return Math.exp(-t * t)
}

const plateau = (u: number, a: number, b: number, edge: number) =>
	smooth(a - edge, a + edge, u) * (1 - smooth(b - edge, b + edge, u))

function broad({ type, side, d, reach }: BroadProfileParams): number {
	const W = Math.max(40, reach)
	const u = d / W
	const fade = 1 - smooth(0.7, 1.05, u)
	const O = CRUST.OROGENY
	switch (type) {
		case O.ANDEAN: {
			const mature = smooth(180, 450, W)
			return (
				fade *
				(0.575 * bump(d, clamp(0.3 * W, 70, 260), Math.max(110, 0.2 * W)) +
					0.55 * mature * plateau(u, 0.33, 0.72, 0.1) +
					0.3 *
						smooth(200, 350, W) *
						bump(d, 0.76 * W, Math.max(100, 0.12 * W)))
			)
		}
		case O.LARAMIDE:
			return (
				fade *
				(0.3 * bump(d, clamp(0.1 * W, 40, 150), Math.max(100, 0.1 * W)) +
					0.55 * plateau(u, 0.15, 0.86, 0.1) +
					0.45 * bump(d, 0.88 * W, Math.max(100, 0.08 * W)))
			)
		case O.URAL:
			return side === CRUST.SIDE.LOWER
				? fade *
						(0.5 * bump(d, 0, Math.max(100, 0.3 * W)) -
							0.25 * bump(d, 0.85 * W, Math.max(80, 0.15 * W)))
				: fade * 0.6 * bump(d, 0, Math.max(110, 0.35 * W))
		case O.HIMALAYAN:
			return side === CRUST.SIDE.LOWER
				? fade *
						(0.675 *
							bump(d, clamp(0.22 * W, 40, 130), Math.max(110, 0.15 * W)) -
							0.3 * bump(d, 0.86 * W, Math.max(90, 0.12 * W)))
				: fade *
						(0.525 * bump(d, clamp(0.05 * W, 20, 80), Math.max(110, 0.08 * W)) +
							0.8 * smooth(300, 800, W) * plateau(u, 0.1, 0.84, 0.1) +
							0.525 * bump(d, 0.88 * W, Math.max(110, 0.08 * W)))
		case O.ARC:
			return fade * 0.675 * bump(d, 0, Math.max(90, 0.35 * W))
		case O.TRANSPRESSION:
			return fade * 0.525 * bump(d, 0, Math.max(70, 0.45 * W))
		case O.RIFT: {
			const c = clamp(0.12 * W, 25, 90)
			return (
				fade *
				0.9 *
				(d < c ? bump(d, c, Math.max(70, c)) : Math.exp(-(d - c) / (0.45 * W)))
			)
		}
		case O.INTRAPLATE:
			return (
				fade *
				(0.5 * bump(d, 0, Math.max(100, 0.3 * W)) -
					0.2 * bump(d, 0.8 * W, Math.max(80, 0.15 * W)))
			)
		default:
			return 0
	}
}

export const BELT_PROFILE = { broad }
