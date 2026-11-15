import { RNG } from "@/model/shared/random/rng"
import type {
	ApplyCarvingParams,
	CarvingAxisParams,
	CarvingFamily,
	CarvingGeometryParams,
	CarvingPoint,
	CarvingWidthParams,
} from "@/model/society/script/runegen/carving/types"

const WIDTHS: Record<CarvingFamily, readonly [number, number]> = {
	frame: [5, 8],
	spiral: [5, 7],
	compartments: [3, 6],
	fork: [5, 8],
	gate: [4, 7],
	"split-stack": [6, 8],
	flanked: [7, 8],
	"notched-stem": [3, 5],
}
const families = Object.keys(WIDTHS) as CarvingFamily[]

function width({ family, rng }: CarvingWidthParams): number {
	return rng.randint(...WIDTHS[family])
}

function motifPaths({ rune, family }: ApplyCarvingParams): CarvingPoint[][] {
	const right = rune.width - 1
	const bottom = rune.height - 1
	const middle = rune.rng.randint(2, bottom - 2)
	const inner = rune.rng.randint(1, right - 1)

	switch (family) {
		case "frame":
			return [
				[
					[0, bottom],
					[0, 0],
					[right, 0],
					[right, middle],
				],
				[
					[right, middle],
					[inner, middle],
					[inner, bottom],
				],
				[
					[0, middle + 1],
					[rune.rng.randint(1, inner), middle + 1],
				],
			]
		case "spiral":
			return [
				[
					[right, 0],
					[0, 0],
					[0, bottom],
					[right, bottom],
					[right, middle],
				],
				[
					[right, middle],
					[Math.max(2, inner), middle],
				],
			]
		case "compartments": {
			const lowerRight =
				right >= 4 && rune.rng.random() < 0.5
					? rune.rng.randint(2, right - 1)
					: right
			return [
				[
					[0, 0],
					[right, 0],
					[right, middle],
					[0, middle],
					[0, 0],
				],
				[
					[lowerRight, middle],
					[lowerRight, bottom],
					[0, bottom],
					[0, middle],
				],
			]
		}
		case "fork": {
			const stem = Math.floor(right / 2)
			const tip = middle - rune.rng.randint(1, 2)
			return [
				[
					[0, tip],
					[0, middle],
					[right, middle],
					[right, tip],
				],
				[
					[stem, 0],
					[stem, bottom],
				],
				[
					[rune.rng.randint(0, stem - 1), bottom],
					[stem + 1, bottom],
				],
			]
		}
		case "gate":
			return [
				[
					[0, bottom],
					[0, 0],
					[right, 0],
					[right, bottom - 1],
				],
				[
					[inner, 0],
					[inner, middle],
					[right - 1, middle],
					[right - 1, bottom],
				],
			]
		case "split-stack": {
			const box = right - 2
			const paths: CarvingPoint[][] = [
				[
					[0, 2],
					[0, 0],
					[box, 0],
					[box, rune.rng.randint(1, 2)],
				],
				[
					[box, 4],
					[0, 4],
					[0, bottom],
					[box, bottom],
					[box, 4],
				],
				[
					[right, 0],
					[right, bottom],
				],
			]
			if (!rune.allowDiscontinuousStrokes) {
				paths.push(
					[
						[0, 2],
						[0, 4],
					],
					[
						[box, 0],
						[right, 0],
					],
				)
			}
			return paths
		}
		case "flanked": {
			const paths: CarvingPoint[][] = [
				[
					[0, 0],
					[0, bottom],
					[1, bottom],
				],
				[
					[right, rune.rng.randint(0, 1)],
					[right, bottom],
					[right - 1, bottom],
				],
				[
					[2, middle - 1],
					[right - 2, middle - 1],
					[right - 2, middle + 1],
				],
				[
					[right - 2, middle + 1],
					[2, middle + 1],
					[2, middle - 1],
				],
			]
			if (!rune.allowDiscontinuousStrokes) {
				paths.push([
					[0, middle + 1],
					[right, middle + 1],
				])
			}
			return paths
		}
		case "notched-stem":
			return [
				[
					[0, 0],
					[inner, 0],
					[inner, bottom],
					[right, bottom],
				],
				[
					[0, middle - 1],
					[inner, middle - 1],
				],
				[
					[inner, middle + 1],
					[right, middle + 1],
				],
			]
	}
}

function apply({ rune, family }: ApplyCarvingParams) {
	const right = rune.width - 1
	const bottom = rune.height - 1
	const flipX = rune.rng.random() < 0.5
	const flipY = rune.rng.random() < 0.5
	for (const path of motifPaths({ rune, family })) {
		for (let index = 1; index < path.length; index++) {
			const [startX, startY] = path[index - 1]
			const [endX, endY] = path[index]
			const dx = Math.sign(endX - startX)
			const dy = Math.sign(endY - startY)
			const length = Math.abs(endX - startX) + Math.abs(endY - startY)
			for (let step = 0; step <= length; step++) {
				const x = startX + dx * step
				const y = startY + dy * step
				rune.bitmap[flipY ? bottom - y : y][flipX ? right - x : x] = true
			}
		}
	}
}

const CORNERS: CarvingPoint[] = [
	[0, 0],
	[1, 0],
	[1, 1],
	[0, 1],
]
const FORK_CORNER_RADIUS = 0.48
const CORNER_SAMPLE_POINTS = [0, 0.25, 0.5, 0.75, 1]

function strokeAxis({ size, rng, mirrored, noise }: CarvingAxisParams) {
	const widths = Array.from({ length: size }, () => rng.uniform(0.63, 1.54))
	if (noise !== 0) {
		for (let index = 0; index < size; index++) {
			widths[index] = Math.max(
				0.35,
				widths[index] + rng.uniform(-0.5, 0.5) * noise,
			)
		}
	}
	const boundaries = [0]
	for (let index = 0; index < size; index++) {
		const source = mirrored ? Math.min(index, size - index - 1) : index
		boundaries.push(boundaries[index] + widths[source])
	}
	const normalize = size / boundaries[size]
	return (coordinate: number) => {
		const index = Math.min(Math.floor(coordinate), size - 1)
		const offset = coordinate - index
		return (
			normalize *
			(boundaries[index] + offset * (boundaries[index + 1] - boundaries[index]))
		)
	}
}

function geometry({ rune, options }: CarvingGeometryParams) {
	const wear = options.carvingWear ?? 1
	const ink =
		rune.dots.length === 0
			? rune.bitmap
			: rune.bitmap.map((row, y) =>
					row.map(
						(filled, x) =>
							filled && !rune.dots.some((dot) => dot.x === x && dot.y === y),
					),
				)
	const shapeRng = RNG.createStringRng({ seed: `${rune.seed}:carving-shape` })
	const reflected = rune.hSym
	const center = rune.width / 2
	const noise = options.noise
	const strokeX = strokeAxis({
		size: rune.width,
		rng: shapeRng,
		mirrored: reflected,
		noise,
	})
	const strokeY = strokeAxis({
		size: rune.height,
		rng: shapeRng,
		mirrored: false,
		noise,
	})
	const heightRatio = shapeRng.uniform(0.84, 1)
	const rng = RNG.createStringRng({ seed: `${rune.seed}:carving-wear` })
	const smoothFork = rune.carvingFamily === "fork"
	const warp = ([x, y]: CarvingPoint): CarvingPoint => [
		reflected && x === center ? center : strokeX(x),
		rune.height - heightRatio * (rune.height - strokeY(y)),
	]
	const slant = ([x, y]: CarvingPoint): CarvingPoint => [
		x - options.oblique * (y - rune.height / 2),
		y,
	]
	const shapes: CarvingPoint[][] = []
	for (let y = 0; y < rune.height; y++) {
		for (let x = 0; x < (reflected ? Math.ceil(center) : rune.width); x++) {
			if (!ink[y][x]) continue
			const shape: CarvingPoint[] = []
			const exposedEdges = [
				!ink[y - 1]?.[x],
				!ink[y][x + 1],
				!ink[y + 1]?.[x],
				!ink[y][x - 1],
			]
			const cap = options.roundCaps && exposedEdges.filter(Boolean).length === 3
			const radius = cap
				? FORK_CORNER_RADIUS
				: options.smooth
					? 0.4
					: smoothFork
						? 0.33
						: 0
			const rounded = exposedEdges.map(
				(exposed, index) =>
					radius > 0 &&
					exposed &&
					exposedEdges[(index + CORNERS.length - 1) % CORNERS.length],
			)
			for (const [index, [cx, cy]] of CORNERS.entries()) {
				const [endX, endY] = CORNERS[(index + 1) % CORNERS.length]
				const dx = endX - cx
				const dy = endY - cy
				if (rounded[index]) {
					const [prevX, prevY] =
						CORNERS[(index + CORNERS.length - 1) % CORNERS.length]
					const backX = prevX - cx
					const backY = prevY - cy
					for (const t of CORNER_SAMPLE_POINTS) {
						const back = (1 - t) ** 2 * radius
						const forward = t ** 2 * radius
						shape.push([
							x + cx + back * backX + forward * dx,
							y + cy + back * backY + forward * dy,
						])
					}
					continue
				}
				shape.push([x + cx, y + cy])
				if (
					wear === 0 ||
					smoothFork ||
					!exposedEdges[index] ||
					rounded[(index + 1) % CORNERS.length] ||
					rng.random() >= 0.19
				) {
					continue
				}
				const start = rng.uniform(0.12, 0.48)
				const end = start + rng.uniform(0.16, 0.36)
				const tip = rng.uniform(start, end)
				const depth = rng.uniform(0.13, 0.38) * wear
				shape.push(
					[x + cx + dx * start, y + cy + dy * start],
					[x + cx + dx * tip - dy * depth, y + cy + dy * tip + dx * depth],
					[x + cx + dx * end, y + cy + dy * end],
				)
			}
			let outline = shape
			if (reflected && x + 1 > center) {
				outline = []
				for (const [index, point] of shape.entries()) {
					const previous = shape[(index + shape.length - 1) % shape.length]
					const inside = point[0] <= center
					if (inside !== previous[0] <= center) {
						const fraction = (center - previous[0]) / (point[0] - previous[0])
						outline.push([
							center,
							previous[1] + fraction * (point[1] - previous[1]),
						])
					}
					if (inside) outline.push(point)
				}
			}
			const warped = outline.map(warp)
			shapes.push(warped)
			if (reflected) {
				shapes.push(
					warped
						.map(([px, py]): CarvingPoint => [rune.width - px, py])
						.reverse(),
				)
			}
		}
	}
	return {
		contours:
			options.oblique === 0
				? shapes
				: shapes.map((outline) => outline.map(slant)),
		dots: rune.dots.map(({ x, y }) => slant(warp([x + 0.5, y + 0.5]))),
	}
}

export const CARVING = { families, width, apply, geometry }
