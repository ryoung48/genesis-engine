import { Point2D } from "@/model/society/script/runegen/point2d"
import {
	DIR_E,
	DIR_N,
	DIR_S,
	DIR_W,
} from "@/model/society/script/runegen/rune/index"
import type { RuneData } from "@/model/society/script/runegen/rune/types"

export function _coin({
	rune,
	chance = 0.5,
}: {
	rune: RuneData
	chance?: number
}): boolean {
	return rune.rng.random() < chance
}

function _countNeighbours({
	rune,
	x,
	y,
	r = 1,
}: {
	rune: RuneData
	x: number
	y: number
	r?: number
}): number {
	let n = 0

	if (x > r - 1 && rune.bitmap[y][x - r]) n++
	if (x < rune.width - r && rune.bitmap[y][x + r]) n++
	if (y > r - 1 && rune.bitmap[y - r][x]) n++
	if (y < rune.height - r && rune.bitmap[y + r][x]) n++

	return n
}

// A dot needs clear space around it and an anchor two cells away so it reads
// as a diacritic of this letter
function _canPlaceDot({
	rune,
	i,
	j,
}: {
	rune: RuneData
	i: number
	j: number
}): boolean {
	return (
		!rune.bitmap[i][j] &&
		_countNeighbours({ rune, x: j, y: i }) === 0 &&
		_countNeighbours({ rune, x: j, y: i, r: 2 }) > 0
	)
}

export function _placeDots({
	rune,
	spots,
	budget,
}: {
	rune: RuneData
	spots: Point2D[]
	budget: number
}): void {
	let remaining = budget
	for (const spot of rune.rng.shuffle(spots)) {
		if (remaining <= 0) {
			break
		}
		if (_canPlaceDot({ rune, i: spot.y, j: spot.x })) {
			rune.bitmap[spot.y][spot.x] = true
			remaining--
		}
	}
}

// Solid 2x2 ink blocks read as blobs rather than letterforms
export function _countInkBlobs(rune: RuneData): number {
	let n = 0
	for (let i = 0; i < rune.height - 1; i++) {
		for (let j = 0; j < rune.width - 1; j++) {
			if (
				rune.bitmap[i][j] &&
				rune.bitmap[i][j + 1] &&
				rune.bitmap[i + 1][j] &&
				rune.bitmap[i + 1][j + 1]
			) {
				n++
			}
		}
	}
	return n
}

export function _isConnected({
	rune,
	weight,
}: {
	rune: RuneData
	weight: number
}): boolean {
	let left = false
	let right = false
	for (let i = 0; i < rune.height; i++) {
		left = left || rune.bitmap[i][0]
		right = right || rune.bitmap[i][rune.width - 1]
	}
	if (!left || !right) {
		return false
	}

	// Cursive letters sit on the connector line, where spikes above and tails
	// below are optional and only side-to-side coverage is required
	if (rune.template !== "cursive") {
		let top = false
		let bottom = false
		for (let i = 0; i < rune.width; i++) {
			top = top || rune.bitmap[0][i]
			bottom = bottom || rune.bitmap[rune.height - 1][i]
		}
		if (!top || !bottom) {
			return false
		}
	}

	rune.dotx = -1
	rune.doty = -1
	rune.dots = []
	const isDot = (x: number, y: number): boolean =>
		rune.dots.some((p) => p.x === x && p.y === y)
	for (let i = 0; i < rune.height; i++) {
		for (let j = 0; j < rune.width; j++) {
			if (rune.bitmap[i][j] && _countNeighbours({ rune, x: j, y: i }) === 0) {
				if (_countNeighbours({ rune, x: j, y: i, r: 2 }) === 0) {
					return false
				}
				if (rune.dots.length >= rune.maxDots) {
					return false
				}
				if (rune.dotx === -1) {
					rune.dotx = j
					rune.doty = i
				}
				rune.dots.push(new Point2D(j, i))
			}
		}
	}

	let x = 0
	let y = 0
	let foundStart = false
	for (let i = 0; i < rune.height; i++) {
		for (let j = 0; j < rune.width; j++) {
			if (rune.bitmap[i][j] && !isDot(j, i)) {
				x = j
				y = i
				foundStart = true
				break
			}
		}
		if (foundStart) {
			break
		}
	}
	if (!foundStart) {
		return false
	}

	if (rune.allowDiscontinuousStrokes) {
		// When multi-stroke runes are allowed we only need a non-dot anchor;
		// bounding-box and dot limits are already validated above.
		return true
	}

	const checked: number[] = []
	const fill = (fx: number, fy: number): number => {
		const index = fx + fy * rune.width
		if (
			!rune.bitmap[fy][fx] ||
			isDot(fx, fy) ||
			checked.indexOf(index) !== -1
		) {
			return 0
		}

		checked.push(index)

		let a = 1
		if (fx > 0) {
			a += fill(fx - 1, fy)
		}
		if (fx < rune.width - 1) {
			a += fill(fx + 1, fy)
		}
		if (fy > 0) {
			a += fill(fx, fy - 1)
		}
		if (fy < rune.height - 1) {
			a += fill(fx, fy + 1)
		}

		return a
	}

	const a = fill(x, y)

	return a === weight - rune.dots.length
}

export function _isSymmetric(rune: RuneData): boolean {
	rune.hSym = true
	for (const row of rune.bitmap) {
		for (let j = 0; j < rune.width >> 1; j++) {
			if (row[j] !== row[rune.width - 1 - j]) {
				rune.hSym = false
				break
			}
		}
		if (!rune.hSym) {
			break
		}
	}

	rune.vSym = true
	for (let i = 0; i < rune.height >> 1; i++) {
		for (let j = 0; j < rune.width; j++) {
			if (rune.bitmap[i][j] !== rune.bitmap[rune.height - 1 - i][j]) {
				rune.vSym = false
				break
			}
		}
		if (!rune.vSym) {
			break
		}
	}

	return rune.hSym || rune.vSym
}

export function _buildStrokes(rune: RuneData): void {
	rune.strokes = []

	// Create links grid to track connections between pixels
	const links: number[][] = Array.from({ length: rune.height }, () =>
		Array.from({ length: rune.width }, () => 0),
	)

	const count = (i: number, j: number): number => {
		const l = links[i][j]
		let c = 0
		c += l & 1
		c += (l >> 1) & 1
		c += (l >> 2) & 1
		c += (l >> 3) & 1
		return c
	}

	const isEmpty = (): boolean => {
		for (let i = 0; i < rune.height; i++) {
			for (let j = 0; j < rune.width; j++) {
				if (links[i][j] !== 0) return false
			}
		}
		return true
	}

	const pickDir = (i: number, j: number, c: number): number => {
		if (c === 1) {
			if ((links[i][j] & 1) !== 0) return DIR_S
			if ((links[i][j] & 2) !== 0) return DIR_E
			if ((links[i][j] & 4) !== 0) return DIR_N
			if ((links[i][j] & 8) !== 0) return DIR_W
		} else if (c === 3) {
			if ((links[i][j] & 1) === 0) return (DIR_N + 2) % 4
			if ((links[i][j] & 2) === 0) return (DIR_E + 2) % 4
			if ((links[i][j] & 4) === 0) return (DIR_S + 2) % 4
			if ((links[i][j] & 8) === 0) return (DIR_W + 2) % 4
		} else {
			const options: number[] = []
			if ((links[i][j] & 1) !== 0) options.push(DIR_S)
			if ((links[i][j] & 2) !== 0) options.push(DIR_E)
			if ((links[i][j] & 4) !== 0) options.push(DIR_N)
			if ((links[i][j] & 8) !== 0) options.push(DIR_W)
			if (options.length > 0) {
				return options[Math.floor(rune.rng.random() * options.length)]
			}
		}
		return -1
	}

	const setLink = (i: number, j: number, d: number): void => {
		links[i][j] |= 1 << d
		let ni = i
		let nj = j
		switch (d) {
			case DIR_S:
				ni++
				break
			case DIR_E:
				nj++
				break
			case DIR_N:
				ni--
				break
			case DIR_W:
				nj--
				break
		}
		if (ni >= 0 && ni < rune.height && nj >= 0 && nj < rune.width) {
			links[ni][nj] |= 1 << ((d + 2) % 4)
		}
	}

	const clearLink = (i: number, j: number, d: number): void => {
		links[i][j] &= ~(1 << d)
		let ni = i
		let nj = j
		switch (d) {
			case DIR_S:
				ni++
				break
			case DIR_E:
				nj++
				break
			case DIR_N:
				ni--
				break
			case DIR_W:
				nj--
				break
		}
		if (ni >= 0 && ni < rune.height && nj >= 0 && nj < rune.width) {
			links[ni][nj] &= ~(1 << ((d + 2) % 4))
		}
	}

	// Build the links grid from the bitmap
	for (let i = 0; i < rune.height; i++) {
		for (let j = 0; j < rune.width; j++) {
			if (rune.bitmap[i][j]) {
				// South link
				if (i < rune.height - 1 && rune.bitmap[i + 1][j]) {
					setLink(i, j, DIR_S)
				}
				// East link
				if (j < rune.width - 1 && rune.bitmap[i][j + 1]) {
					setLink(i, j, DIR_E)
				}
			}
		}
	}

	// Priority: prefer nodes with 1 or 3 links over 4, 2, or 0
	const priority = [1, 3, 4, 2, 0]

	// Extract strokes from the links grid
	let outerIterations = 0
	const maxOuterIterations = rune.width * rune.height

	while (!isEmpty() && outerIterations < maxOuterIterations) {
		outerIterations++

		let ii = -1
		let jj = -1
		let c = 0

		// Find the best starting point
		for (let i = 0; i < rune.height; i++) {
			for (let j = 0; j < rune.width; j++) {
				if (links[i][j] !== 0) {
					const count1 = count(i, j)
					if (priority.indexOf(count1) < priority.indexOf(c)) {
						ii = i
						jj = j
						c = count1
					}
				}
			}
		}

		// Safety check - if we can't find a valid starting point, clear any remaining links
		if (ii === -1 || jj === -1) {
			break
		}

		let dir = pickDir(ii, jj, c)
		if (dir === -1) {
			// Can't pick a direction, so just clear this cell and continue
			links[ii][jj] = 0
			continue
		}

		const stroke: Point2D[] = [new Point2D(jj, ii)]
		let newDir = true
		let iterations = 0
		const maxIterations = rune.width * rune.height * 2

		// Trace the stroke
		while (iterations < maxIterations) {
			iterations++
			clearLink(ii, jj, dir)

			switch (dir) {
				case DIR_S:
					ii++
					break
				case DIR_E:
					jj++
					break
				case DIR_N:
					ii--
					break
				case DIR_W:
					jj--
					break
			}

			// Check bounds
			if (ii < 0 || ii >= rune.height || jj < 0 || jj >= rune.width) {
				break
			}

			if (!newDir) {
				stroke.pop()
			}

			stroke.push(new Point2D(jj, ii))

			if ((links[ii][jj] & (1 << dir)) === 0) {
				if (count(ii, jj) === 1) {
					const nextDir = pickDir(ii, jj, 1)
					if (nextDir !== -1) {
						dir = nextDir
						newDir = true
						continue
					}
				}
				break
			} else {
				newDir = false
			}
		}

		// Close the stroke if it forms a loop
		if (c === 2) {
			stroke.pop()
			stroke.push(stroke[0])
		}

		rune.strokes.push(stroke)
	}
}
