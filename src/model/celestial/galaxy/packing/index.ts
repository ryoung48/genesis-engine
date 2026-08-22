import type {
	GalaxyPacking,
	GalaxyPackingParams,
} from "@/model/celestial/galaxy/packing/types"
import { RNG } from "@/model/shared/random/rng"

const MAX_PLACEMENT_TRIES = 30

// Density-wave placement (ported from beltoforion/Galaxy-Renderer-Typescript's
// Galaxy.ts getExcentricity/getAngularOffset): each system sits on an
// ellipse whose eccentricity and tilt angle both vary with radius, rather
// than at a uniformly random angle on a circle. Ellipses at nearby radii
// share a similar tilt (tiltAngle = r * ANGLE_WIND_PER_UNIT), so as radius
// increases the ellipses progressively rotate into each other -- this is
// what makes stars bunch up into spiral arms (denser where consecutive
// ellipses' major axes line up) purely from the geometry, with no explicit
// "arm mask" needed like the background shader's.
// Defaults for GalaxyPackingParams' optional shape knobs -- see
// types.ts's doc comment. Exported so the decorative background nebula
// shader (background.ts) can wind its arms by the same default amount per
// world unit when nothing else is driving the shape, keeping the painted
// haze aligned with where systems actually cluster instead of drifting
// apart.
export const DEFAULT_ECC_INNER = 0.82
export const DEFAULT_ECC_OUTER = 1
export const ANGLE_WIND_PER_UNIT = 0.028

/** Ellipse flattening (minor/major axis ratio) at radius r -- round (1) at
 * the very core, most elongated at the core/disc boundary, then relaxing
 * back toward round approaching the disc's outer edge. */
function eccentricityAt(
	r: number,
	radiusMin: number,
	radiusMax: number,
	eccInner: number,
	eccOuter: number,
): number {
	if (r < radiusMin) return 1 + (r / radiusMin) * (eccInner - 1)
	if (r > radiusMax) return eccOuter
	return (
		eccInner +
		((r - radiusMin) / (radiusMax - radiusMin)) * (eccOuter - eccInner)
	)
}

/**
 * Density-wave rejection sampling of `size` points in an annulus around the
 * canvas center: each candidate point is drawn from a radius-dependent
 * ellipse (see eccentricityAt/ANGLE_WIND_PER_UNIT above) rather than a plain
 * circle, then run through the same Poisson-disc minimum-spacing check as
 * before so systems stay clickable/distinguishable. Kept as its own module
 * (rather than inlined in the orchestrator) so packing can change
 * independently of topology/system generation (axiomatic independence --
 * see plans/galaxy-view-port.md).
 */
function place({
	size,
	seed,
	radius,
	dimensions,
	eccentricityInner = DEFAULT_ECC_INNER,
	eccentricityOuter = DEFAULT_ECC_OUTER,
	angleWindPerUnit = ANGLE_WIND_PER_UNIT,
	pertN = 0,
	pertAmp = 0,
}: GalaxyPackingParams): GalaxyPacking {
	const rng = RNG.createRng({ seed })
	const { w, h } = dimensions
	const cx = w / 2
	const cy = h / 2

	const r_xy = new Float32Array(2 * size)
	const r_edge = new Uint8Array(size)

	const annularArea = Math.PI * (radius.max ** 2 - radius.min ** 2)
	const minDist = 0.55 * Math.sqrt(annularArea / size)
	const minDist2 = minDist * minDist

	const cellSize = minDist
	const gridW = Math.ceil(w / cellSize) + 2
	const gridCells = new Map<number, number[]>()
	const cellKey = (gx: number, gy: number) => gy * gridW + gx

	const addToGrid = (idx: number, x: number, y: number) => {
		const key = cellKey(Math.floor(x / cellSize), Math.floor(y / cellSize))
		const bucket = gridCells.get(key)
		if (bucket) bucket.push(idx)
		else gridCells.set(key, [idx])
	}

	const tooClose = (x: number, y: number, placedCount: number): boolean => {
		const gx = Math.floor(x / cellSize)
		const gy = Math.floor(y / cellSize)
		for (let dy = -2; dy <= 2; dy++) {
			for (let dx = -2; dx <= 2; dx++) {
				const bucket = gridCells.get(cellKey(gx + dx, gy + dy))
				if (!bucket) continue
				for (const idx of bucket) {
					if (idx >= placedCount) continue
					const ex = r_xy[2 * idx]! - x
					const ey = r_xy[2 * idx + 1]! - y
					if (ex * ex + ey * ey < minDist2) return true
				}
			}
		}
		return false
	}

	for (let i = 0; i < size; i++) {
		let x = cx
		let y = cy
		for (let attempt = 0; attempt < MAX_PLACEMENT_TRIES; attempt++) {
			const r = Math.sqrt(
				rng.random() * (radius.max ** 2 - radius.min ** 2) + radius.min ** 2,
			)
			// Point on the radius-r ellipse (semi-major a=r, semi-minor
			// b=r*eccentricity) at a random phase, then rotated by that
			// ellipse's own radius-dependent tilt -- see the density-wave
			// comment above place().
			const b =
				r *
				eccentricityAt(
					r,
					radius.min,
					radius.max,
					eccentricityInner,
					eccentricityOuter,
				)
			const theta0 = rng.uniform(0, 2 * Math.PI)
			const tilt = r * angleWindPerUnit
			const ex = r * Math.cos(theta0)
			const ey = b * Math.sin(theta0)
			const cosT = Math.cos(tilt)
			const sinT = Math.sin(tilt)
			// Rotate by -tilt (not +tilt): the beltoforion renderer's own
			// orbitPosition GLSL (Galaxy-Renderer-Typescript's Galaxy.ts) works
			// out to this same sign when its pos.x/pos.y are expanded
			// algebraically -- getting this backwards doesn't just mis-scale
			// the winding, it winds the WHOLE spiral in the opposite rotational
			// direction (its arms curl one way while the rendered galaxy's
			// curl the other), which reads as a much bigger shape mismatch
			// than eccentricity or radius ever could on their own.
			let ex2 = ex * cosT + ey * sinT
			let ey2 = -ex * sinT + ey * cosT
			// Same density-wave arm perturbation the renderer's shader applies
			// (see orbitPosition's uPertN/uPertAmp term) -- evaluated at this
			// star's own theta0 with no time term, since this model has no
			// animated rotation of its own; this is what gives the arms their
			// texture rather than a smooth ellipse field. a === r here (the
			// renderer's Star.a is the orbit radius itself), matching the
			// shader's `a / uPertAmp` factor.
			if (pertAmp > 0 && pertN > 0) {
				ex2 += (r / pertAmp) * Math.sin(theta0 * 2 * pertN)
				ey2 += (r / pertAmp) * Math.cos(theta0 * 2 * pertN)
			}
			x = cx + ex2
			y = cy + ey2
			if (!tooClose(x, y, i)) break
		}
		r_xy[2 * i] = x
		r_xy[2 * i + 1] = y
		addToGrid(i, x, y)

		const dx = x - cx
		const dy = y - cy
		const dist = Math.hypot(dx, dy)
		r_edge[i] = dist > radius.max || dist < radius.min ? 1 : 0
	}

	return { r_xy, r_edge }
}

export const GALAXY_PACKING = { place }
