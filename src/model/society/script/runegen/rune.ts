import { createStringRng, type SharedRng } from "@/model/shared"
import { Point2D } from "./point2d"

export type RuneTemplate =
	| "random1"
	| "random2"
	| "random4"
	| "random5"
	| "cursive"

// A structural feature shared by every glyph of a script, the way Devanagari
// letters hang from a headline or runic letters are built on staves
export type RuneMotif = "headline" | "baseline" | "stave" | "none"

export type RuneGeneratorOptions = {
	symmetryBias?: "symmetric" | "asymmetric" | "none"
	weightBand?: "light" | "medium" | "heavy" | "any"
	seedTemplate?: RuneTemplate | "any"
	forceTemplate?: RuneTemplate
	motif?: RuneMotif
	maxDots?: number
	allowDiscontinuousStrokes?: boolean
}

type TemplateSpec = {
	width: number
	height: number
	// The 'any' weight band; named bands are scaled from the classic grid
	minWeight: number
	maxWeight: number
}

const CLASSIC_SPEC: TemplateSpec = {
	width: 5,
	height: 7,
	minWeight: 11,
	maxWeight: 21,
}

const TEMPLATE_SPECS: Record<RuneTemplate, TemplateSpec> = {
	random1: CLASSIC_SPEC,
	random2: CLASSIC_SPEC,
	random4: CLASSIC_SPEC,
	random5: CLASSIC_SPEC,
	cursive: CLASSIC_SPEC,
}

export class Rune {
	// Classic grid dimensions; per-instance width/height come from the
	// template's spec and default to these
	public static readonly WIDTH: number = 5
	public static readonly HEIGHT: number = 7

	// Direction constants
	private static readonly S: number = 0 // South
	private static readonly E: number = 1 // East
	private static readonly N: number = 2 // North
	private static readonly W: number = 3 // West

	private bitmap: boolean[][]
	public strokes: Point2D[][] = []
	public width: number = Rune.WIDTH
	public height: number = Rune.HEIGHT

	public dotx: number = -1
	public doty: number = -1
	public dots: Point2D[] = []

	public hSym: boolean = false
	public vSym: boolean = false
	private template?: RuneTemplate
	private maxDots: number
	private allowDiscontinuousStrokes: boolean
	private rng: SharedRng
	public seed: string

	public getTemplate(): RuneTemplate | undefined {
		return this.template
	}

	constructor(
		options: RuneGeneratorOptions = {},
		rng?: SharedRng,
		seed?: string,
	) {
		const seedStr = seed ?? Date.now().toString(36)
		this.rng = rng ?? createStringRng(seedStr)
		this.seed = seedStr
		this.allowDiscontinuousStrokes = Boolean(options.allowDiscontinuousStrokes)

		let attempts = 0
		const maxAttempts = 250

		// Each iteration resets strokes, so any `continue` re-enters the loop
		do {
			attempts++
			const enforceAesthetics = attempts <= maxAttempts
			const enforceSymmetry = attempts <= maxAttempts * 2

			// The template can change per attempt when seeded with 'any', and grid
			// size and weight budgets follow it
			this.template = this.resolveTemplate(options)
			const spec = TEMPLATE_SPECS[this.template]
			this.width = spec.width
			this.height = spec.height
			this.maxDots = Math.max(0, options.maxDots ?? 1)

			// Named weight bands are defined against the classic 5x7 grid; scale
			// by area so light/medium/heavy keep their meaning on bigger grids
			const areaScale = (spec.width * spec.height) / (Rune.WIDTH * Rune.HEIGHT)
			let minWeight = spec.minWeight
			let maxWeight = spec.maxWeight
			if (options.weightBand === "light") {
				minWeight = Math.round(8 * areaScale)
				maxWeight = Math.round(14 * areaScale)
			} else if (options.weightBand === "medium") {
				minWeight = Math.round(15 * areaScale)
				maxWeight = Math.round(19 * areaScale)
			} else if (options.weightBand === "heavy") {
				minWeight = Math.round(20 * areaScale)
				maxWeight = Math.round(24 * areaScale)
			}

			// A motif contributes a fixed bar of ink (minus expected overlap with
			// the template), so shift the band to keep measuring the letter itself
			const motif = options.motif
			const motifAllowance =
				motif === "headline" || motif === "baseline"
					? 4
					: motif === "stave"
						? 5
						: 0
			minWeight += motifAllowance
			maxWeight += motifAllowance

			// Progressive relaxation: first drop weight band and aesthetics, then
			// symmetry bias, so impossible option combinations can't hang generation
			if (attempts > maxAttempts) {
				minWeight = spec.minWeight
				maxWeight = spec.maxWeight + motifAllowance
			}

			this.strokes = []
			this.bitmap = Array.from({ length: this.height }, () =>
				Array.from({ length: this.width }, () => false),
			)

			this.applyTemplate(this.template)
			this.applyMotif(motif)

			const w = this.getWeight()
			if (w < minWeight || w > maxWeight) {
				continue
			}

			if (enforceSymmetry) {
				if (options.symmetryBias === "symmetric" && !this.isSymmetric()) {
					continue
				} else if (
					options.symmetryBias === "asymmetric" &&
					this.isSymmetric()
				) {
					continue
				}
			}

			if (!this.isConnected(w)) {
				continue
			}

			if (enforceAesthetics && this.countInkBlobs() > 0) {
				continue
			}

			this.buildStrokes()
		} while (this.strokes.length === 0)
	}

	private resolveTemplate(options: RuneGeneratorOptions): RuneTemplate {
		if (options.forceTemplate) {
			return options.forceTemplate
		}
		if (!options.seedTemplate || options.seedTemplate === "any") {
			return this.selectRandomTemplate()
		}
		return options.seedTemplate
	}

	private applyTemplate(template: RuneTemplate): void {
		switch (template) {
			case "random1":
				this.random1()
				break
			case "random2":
				this.random2()
				break
			case "random4":
				this.random4()
				break
			case "random5":
				this.random5()
				break
			case "cursive":
				this.cursive()
				break
		}
	}

	// Overlay the script's shared structural feature; connectivity is safe
	// because accepted glyphs already touch all four edges
	private applyMotif(motif?: RuneMotif): void {
		if (!motif || motif === "none") {
			return
		}
		if (motif === "headline") {
			for (let j = 0; j < this.width; j++) {
				this.bitmap[0][j] = true
			}
		} else if (motif === "baseline") {
			for (let j = 0; j < this.width; j++) {
				this.bitmap[this.height - 1][j] = true
			}
		} else {
			for (let i = 0; i < this.height; i++) {
				this.bitmap[i][0] = true
			}
		}
	}

	private selectRandomTemplate(): RuneTemplate {
		return this.rng.choice<RuneTemplate>([
			"random1",
			"random2",
			"random4",
			"random5",
			"cursive",
		])
	}

	// Solid 2x2 ink blocks read as blobs rather than letterforms
	private countInkBlobs(): number {
		let n = 0
		for (let i = 0; i < this.height - 1; i++) {
			for (let j = 0; j < this.width - 1; j++) {
				if (
					this.bitmap[i][j] &&
					this.bitmap[i][j + 1] &&
					this.bitmap[i + 1][j] &&
					this.bitmap[i + 1][j + 1]
				) {
					n++
				}
			}
		}
		return n
	}

	// A dot needs clear space around it and an anchor two cells away so it
	// reads as a diacritic of this letter
	private canPlaceDot(i: number, j: number): boolean {
		return (
			!this.bitmap[i][j] &&
			this.countNeighbours(j, i) === 0 &&
			this.countNeighbours(j, i, 2) > 0
		)
	}

	private placeDots(spots: Point2D[], budget: number): void {
		for (const spot of this.rng.shuffle(spots)) {
			if (budget <= 0) {
				break
			}
			if (this.canPlaceDot(spot.y, spot.x)) {
				this.bitmap[spot.y][spot.x] = true
				budget--
			}
		}
	}

	private random1(): void {
		this.bitmap[0][0] = this.coin(4 / 5)
		this.bitmap[0][2] = this.coin(4 / 5)
		this.bitmap[0][4] = this.coin(4 / 5)

		this.bitmap[3][0] = this.coin(4 / 5)
		this.bitmap[3][2] = this.coin(4 / 5)
		this.bitmap[3][4] = this.coin(4 / 5)

		this.bitmap[6][0] = this.coin(4 / 5)
		this.bitmap[6][2] = this.coin(4 / 5)
		this.bitmap[6][4] = this.coin(2 / 5)

		this.bitmap[0][1] =
			this.bitmap[0][0] && this.bitmap[0][2] && this.coin(3 / 4)
		this.bitmap[0][3] =
			this.bitmap[0][2] && this.bitmap[0][4] && this.coin(3 / 4)

		this.bitmap[1][0] = this.bitmap[2][0] =
			this.bitmap[0][0] && this.bitmap[3][0] && this.coin(2 / 3)
		this.bitmap[1][2] = this.bitmap[2][2] =
			this.bitmap[0][2] && this.bitmap[3][2] && this.coin(1 / 4)
		this.bitmap[1][4] = this.bitmap[2][4] =
			this.bitmap[0][4] && this.bitmap[3][4] && this.coin(4 / 5)

		this.bitmap[3][1] =
			this.bitmap[3][0] && this.bitmap[3][2] && this.coin(3 / 4)
		this.bitmap[3][3] =
			this.bitmap[3][2] && this.bitmap[3][4] && this.coin(2 / 5)

		this.bitmap[4][0] = this.bitmap[5][0] =
			this.bitmap[3][0] && this.bitmap[6][0] && this.coin(3 / 4)
		this.bitmap[4][2] = this.bitmap[5][2] =
			this.bitmap[3][2] && this.bitmap[6][2] && this.coin(2 / 4)
		this.bitmap[4][4] = this.bitmap[5][4] =
			this.bitmap[3][4] && this.bitmap[6][4] && this.coin(3 / 4)

		this.bitmap[6][1] =
			this.bitmap[6][0] && this.bitmap[6][2] && this.coin(4 / 5)
		this.bitmap[6][3] =
			this.bitmap[6][2] && this.bitmap[6][4] && this.coin(4 / 5)

		if (this.bitmap[4][2] && this.bitmap[3][1] !== this.bitmap[3][3]) {
			this.bitmap[5][2] = false
		}
	}

	private random2(): void {
		this.bitmap[0][0] = this.coin(1 / 2)
		this.bitmap[0][2] = this.coin(1 / 2)
		this.bitmap[0][4] = this.coin(1 / 2)

		this.bitmap[2][0] = this.coin(3 / 4)
		this.bitmap[2][2] = this.coin(3 / 4)
		this.bitmap[2][4] = this.coin(3 / 4)

		this.bitmap[4][0] = this.coin(1 / 2)
		this.bitmap[4][2] = this.coin(1 / 2)
		this.bitmap[4][4] = this.coin(1 / 2)

		this.bitmap[6][0] = this.coin(1 / 2)
		this.bitmap[6][2] = this.coin(1 / 2)
		this.bitmap[6][4] = this.coin(1 / 2)

		this.bitmap[0][1] =
			this.bitmap[0][0] && this.bitmap[0][2] && this.coin(1 / 4)
		this.bitmap[0][3] =
			this.bitmap[0][2] && this.bitmap[0][4] && this.coin(1 / 4)

		this.bitmap[1][0] =
			this.bitmap[0][0] && this.bitmap[2][0] && this.coin(3 / 4)
		this.bitmap[1][2] =
			this.bitmap[0][2] && this.bitmap[2][2] && this.coin(3 / 4)
		this.bitmap[1][4] =
			this.bitmap[0][4] && this.bitmap[2][4] && this.coin(3 / 4)

		this.bitmap[2][1] =
			this.bitmap[2][0] && this.bitmap[2][2] && this.coin(3 / 4)
		this.bitmap[2][3] =
			this.bitmap[2][2] && this.bitmap[2][4] && this.coin(3 / 4)

		this.bitmap[3][0] =
			this.bitmap[2][0] && this.bitmap[4][0] && this.coin(3 / 4)
		this.bitmap[3][2] =
			this.bitmap[2][2] && this.bitmap[4][2] && this.coin(1 / 2)
		this.bitmap[3][4] =
			this.bitmap[2][4] && this.bitmap[4][4] && this.coin(3 / 4)

		this.bitmap[4][1] = this.bitmap[4][2]
		this.bitmap[4][3] = this.bitmap[4][2]

		this.bitmap[5][0] =
			this.bitmap[4][0] && this.bitmap[6][0] && this.coin(3 / 4)
		this.bitmap[5][2] =
			this.bitmap[4][2] && this.bitmap[6][2] && this.coin(1 / 2)
		this.bitmap[5][4] =
			this.bitmap[4][4] && this.bitmap[6][4] && this.coin(3 / 4)

		this.bitmap[6][1] =
			this.bitmap[6][0] && this.bitmap[6][2] && this.coin(1 / 4)
		this.bitmap[6][3] =
			this.bitmap[6][2] && this.bitmap[6][4] && this.coin(1 / 4)
	}

	// Enclosure template - hollow frame shapes (O, C, U, E)
	private random4(): void {
		const openSide = this.coin(3 / 4)
			? this.rng.choice(["top", "bottom", "left", "right"])
			: "none"
		const top = openSide !== "top"
		const bottom = openSide !== "bottom"
		const left = openSide !== "left"
		const right = openSide !== "right"

		if (top) {
			for (let j = 0; j < Rune.WIDTH; j++) {
				this.bitmap[0][j] = true
			}
		}
		if (bottom) {
			for (let j = 0; j < Rune.WIDTH; j++) {
				this.bitmap[6][j] = true
			}
		}

		// Side walls; when the top or bottom is open, one wall may recede from
		// the opening while the other keeps the glyph anchored to that edge
		const recedeLeft = this.coin()
		const leftFrom = top ? 0 : recedeLeft ? this.rng.randint(0, 2) : 0
		const rightFrom = top ? 0 : recedeLeft ? 0 : this.rng.randint(0, 2)
		const leftTo = bottom ? 6 : recedeLeft ? this.rng.randint(4, 6) : 6
		const rightTo = bottom ? 6 : recedeLeft ? 6 : this.rng.randint(4, 6)
		if (left) {
			for (let i = leftFrom; i <= leftTo; i++) {
				this.bitmap[i][0] = true
			}
		}
		if (right) {
			for (let i = rightFrom; i <= rightTo; i++) {
				this.bitmap[i][4] = true
			}
		}

		// Inner detail keeps box letters distinguishable: a mid bar off one wall
		// (E-like), a stub hanging off a bar, or a floating center tick
		const detail = this.rng.random()
		if (detail < 0.25 && left) {
			this.bitmap[3][1] = true
			this.bitmap[3][2] = this.coin(1 / 2)
		} else if (detail < 0.5 && right) {
			this.bitmap[3][3] = true
			this.bitmap[3][2] = this.coin(1 / 2)
		} else if (detail < 0.8) {
			if (top && this.coin()) {
				this.bitmap[1][2] = true
				this.bitmap[2][2] = this.coin(1 / 2)
			} else if (bottom) {
				this.bitmap[5][2] = true
				this.bitmap[4][2] = this.coin(1 / 2)
			}
		} else if (detail < 0.9 && this.maxDots > 0) {
			this.bitmap[3][2] = true
		}
	}

	// Cursive template - letters sit on a shared connector line the way Arabic
	// letters join along the rasm: teeth above, hooks below, and dots doing
	// much of the distinguishing work
	private cursive(): void {
		// Connector line, edge to edge, so adjacent letters visually join
		for (let j = 0; j < Rune.WIDTH; j++) {
			this.bitmap[4][j] = true
		}

		// Occasional tall ascender (alif-like)
		let ascenderCol = -1
		if (this.coin(1 / 4)) {
			ascenderCol = this.rng.choice([0, 1, 3, 4])
			for (let i = 0; i < 4; i++) {
				this.bitmap[i][ascenderCol] = true
			}

			// Occasional hook at the top, bending toward the body (hamza-like)
			if (this.coin(1 / 3)) {
				const hookCol = ascenderCol < 2 ? ascenderCol + 1 : ascenderCol - 1
				this.bitmap[0][hookCol] = true
			}
		}

		// Teeth: short bumps on the line, kept off columns beside the ascender
		// so the body stays one stroke wide
		const toothCols = [0, 2, 4].filter(
			(c) => ascenderCol === -1 || Math.abs(c - ascenderCol) >= 2,
		)
		for (const c of this.rng.sample(toothCols, this.rng.randint(1, 3))) {
			this.bitmap[3][c] = true
			if (this.coin(1 / 2)) {
				this.bitmap[2][c] = true
			}
		}

		// Descender hook below the line, occasionally curling into a tail
		if (this.coin(1 / 2)) {
			const c = this.rng.randint(0, Rune.WIDTH - 1)
			this.bitmap[5][c] = true
			if (this.coin(1 / 2)) {
				this.bitmap[6][c] = true
				if (this.coin(1 / 3)) {
					const tailCol =
						c < 2 ? c + 1 : c > 2 ? c - 1 : this.rng.choice([1, 3])
					this.bitmap[6][tailCol] = true
				}
			}
		}

		// Dots (i'jam-like diacritics) above or below the body
		const spots: Point2D[] = []
		for (const j of [0, 2, 4]) {
			for (const i of [0, 1, 2, 6]) {
				spots.push(new Point2D(j, i))
			}
		}
		this.placeDots(spots, Math.min(this.maxDots, this.rng.randint(0, 3)))
	}

	// Vertical spine template - strong vertical center line
	private random5(): void {
		// Strong center column
		this.bitmap[0][2] = this.coin(4 / 5)
		this.bitmap[1][2] = this.coin(4 / 5)
		this.bitmap[2][2] = this.coin(4 / 5)
		this.bitmap[3][2] = this.coin(4 / 5)
		this.bitmap[4][2] = this.coin(4 / 5)
		this.bitmap[5][2] = this.coin(4 / 5)
		this.bitmap[6][2] = this.coin(4 / 5)

		// Branches from spine
		this.bitmap[0][0] = this.bitmap[0][2] && this.coin(2 / 3)
		this.bitmap[0][4] = this.bitmap[0][2] && this.coin(2 / 3)
		this.bitmap[2][0] = this.bitmap[2][2] && this.coin(3 / 4)
		this.bitmap[2][4] = this.bitmap[2][2] && this.coin(3 / 4)
		this.bitmap[4][0] = this.bitmap[4][2] && this.coin(3 / 4)
		this.bitmap[4][4] = this.bitmap[4][2] && this.coin(3 / 4)
		this.bitmap[6][0] = this.bitmap[6][2] && this.coin(2 / 3)
		this.bitmap[6][4] = this.bitmap[6][2] && this.coin(2 / 3)

		// Horizontal connectors
		this.bitmap[0][1] =
			this.bitmap[0][0] && this.bitmap[0][2] && this.coin(1 / 2)
		this.bitmap[0][3] =
			this.bitmap[0][2] && this.bitmap[0][4] && this.coin(1 / 2)
		this.bitmap[2][1] =
			this.bitmap[2][0] && this.bitmap[2][2] && this.coin(2 / 3)
		this.bitmap[2][3] =
			this.bitmap[2][2] && this.bitmap[2][4] && this.coin(2 / 3)
		this.bitmap[4][1] =
			this.bitmap[4][0] && this.bitmap[4][2] && this.coin(2 / 3)
		this.bitmap[4][3] =
			this.bitmap[4][2] && this.bitmap[4][4] && this.coin(2 / 3)
		this.bitmap[6][1] =
			this.bitmap[6][0] && this.bitmap[6][2] && this.coin(1 / 2)
		this.bitmap[6][3] =
			this.bitmap[6][2] && this.bitmap[6][4] && this.coin(1 / 2)

		// Vertical connectors on sides
		this.bitmap[1][0] =
			this.bitmap[0][0] && this.bitmap[2][0] && this.coin(1 / 2)
		this.bitmap[3][0] =
			this.bitmap[2][0] && this.bitmap[4][0] && this.coin(1 / 2)
		this.bitmap[5][0] =
			this.bitmap[4][0] && this.bitmap[6][0] && this.coin(1 / 2)
		this.bitmap[1][4] =
			this.bitmap[0][4] && this.bitmap[2][4] && this.coin(1 / 2)
		this.bitmap[3][4] =
			this.bitmap[2][4] && this.bitmap[4][4] && this.coin(1 / 2)
		this.bitmap[5][4] =
			this.bitmap[4][4] && this.bitmap[6][4] && this.coin(1 / 2)
	}

	private getWeight(): number {
		let w = 0
		for (let i = 0; i < this.height; i++) {
			for (let j = 0; j < this.width; j++) {
				if (this.bitmap[i][j]) {
					w++
				}
			}
		}
		return w
	}

	private isConnected(weight: number): boolean {
		let left = false
		let right = false
		for (let i = 0; i < this.height; i++) {
			left = left || this.bitmap[i][0]
			right = right || this.bitmap[i][this.width - 1]
		}
		if (!left || !right) {
			return false
		}

		// Cursive letters sit on the connector line, where spikes above and
		// tails below are optional and only side-to-side coverage is required
		if (this.template !== "cursive") {
			let top = false
			let bottom = false
			for (let i = 0; i < this.width; i++) {
				top = top || this.bitmap[0][i]
				bottom = bottom || this.bitmap[this.height - 1][i]
			}
			if (!top || !bottom) {
				return false
			}
		}

		this.dotx = -1
		this.doty = -1
		this.dots = []
		const isDot = (x: number, y: number): boolean =>
			this.dots.some((p) => p.x === x && p.y === y)
		for (let i = 0; i < this.height; i++) {
			for (let j = 0; j < this.width; j++) {
				if (this.bitmap[i][j] && this.countNeighbours(j, i) === 0) {
					if (this.countNeighbours(j, i, 2) === 0) {
						return false
					}
					if (this.dots.length >= this.maxDots) {
						return false
					}
					if (this.dotx === -1) {
						this.dotx = j
						this.doty = i
					}
					this.dots.push(new Point2D(j, i))
				}
			}
		}

		let x = 0
		let y = 0
		let foundStart = false
		for (let i = 0; i < this.height; i++) {
			for (let j = 0; j < this.width; j++) {
				if (this.bitmap[i][j] && !isDot(j, i)) {
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

		if (this.allowDiscontinuousStrokes) {
			// When multi-stroke runes are allowed we only need a non-dot anchor;
			// bounding-box and dot limits are already validated above.
			return true
		}

		const checked: number[] = []
		const fill = (x: number, y: number): number => {
			const index = x + y * this.width
			if (!this.bitmap[y][x] || isDot(x, y) || checked.indexOf(index) !== -1) {
				return 0
			}

			checked.push(index)

			let a = 1
			if (x > 0) {
				a += fill(x - 1, y)
			}
			if (x < this.width - 1) {
				a += fill(x + 1, y)
			}
			if (y > 0) {
				a += fill(x, y - 1)
			}
			if (y < this.height - 1) {
				a += fill(x, y + 1)
			}

			return a
		}

		const a = fill(x, y)

		return a === weight - this.dots.length
	}

	public diff(another: Rune): number {
		// Different grids can't be compared cell-wise; report maximal distance
		if (this.width !== another.width || this.height !== another.height) {
			return Math.max(this.width * this.height, another.width * another.height)
		}

		let r = 0

		for (let i = 0; i < this.height; i++) {
			const row1 = this.bitmap[i]
			const row2 = another.bitmap[i]
			for (let j = 0; j < this.width; j++) {
				if (row1[j] !== row2[j]) {
					r++
				}
			}
		}

		return r
	}

	private countNeighbours(x: number, y: number, r: number = 1): number {
		let n = 0

		if (x > r - 1 && this.bitmap[y][x - r]) n++
		if (x < this.width - r && this.bitmap[y][x + r]) n++
		if (y > r - 1 && this.bitmap[y - r][x]) n++
		if (y < this.height - r && this.bitmap[y + r][x]) n++

		return n
	}

	// Grid and generation traits shared verbatim by mirrored/rotated clones
	private copyTraits(rune: Rune): void {
		rune.width = this.width
		rune.height = this.height
		rune.template = this.template
	}

	public mirrorX(): Rune {
		const rune = Object.create(Rune.prototype) as Rune

		rune.bitmap = Array.from({ length: this.height }, (_, i) =>
			Array.from(
				{ length: this.width },
				(_, j) => this.bitmap[i][this.width - j - 1],
			),
		)

		this.copyTraits(rune)
		rune.dots = []
		rune.dotx = -1
		rune.doty = -1
		rune.maxDots = this.maxDots
		rune.allowDiscontinuousStrokes = this.allowDiscontinuousStrokes
		rune.seed = this.seed
		rune.rng = createStringRng(this.seed)
		rune.hSym = false
		rune.vSym = false

		return rune
	}

	public mirrorY(): Rune {
		const rune = Object.create(Rune.prototype) as Rune

		rune.bitmap = Array.from({ length: this.height }, (_, i) =>
			Array.from(
				{ length: this.width },
				(_, j) => this.bitmap[this.height - i - 1][j],
			),
		)

		this.copyTraits(rune)
		rune.dots = []
		rune.dotx = -1
		rune.doty = -1
		rune.maxDots = this.maxDots
		rune.allowDiscontinuousStrokes = this.allowDiscontinuousStrokes
		rune.seed = this.seed
		rune.rng = createStringRng(this.seed)
		rune.hSym = false
		rune.vSym = false

		return rune
	}

	public rotate180(): Rune {
		const rune = Object.create(Rune.prototype) as Rune

		rune.bitmap = Array.from({ length: this.height }, (_, i) =>
			Array.from(
				{ length: this.width },
				(_, j) => this.bitmap[this.height - i - 1][this.width - j - 1],
			),
		)

		this.copyTraits(rune)
		rune.dots = []
		rune.dotx = -1
		rune.doty = -1
		rune.maxDots = this.maxDots
		rune.allowDiscontinuousStrokes = this.allowDiscontinuousStrokes
		rune.seed = this.seed
		rune.rng = createStringRng(this.seed)
		rune.hSym = false
		rune.vSym = false

		return rune
	}

	public isSymmetric(): boolean {
		this.hSym = true
		for (const row of this.bitmap) {
			for (let j = 0; j < this.width >> 1; j++) {
				if (row[j] !== row[this.width - 1 - j]) {
					this.hSym = false
					break
				}
			}
			if (!this.hSym) {
				break
			}
		}

		this.vSym = true
		for (let i = 0; i < this.height >> 1; i++) {
			for (let j = 0; j < this.width; j++) {
				if (this.bitmap[i][j] !== this.bitmap[this.height - 1 - i][j]) {
					this.vSym = false
					break
				}
			}
			if (!this.vSym) {
				break
			}
		}

		return this.hSym || this.vSym
	}

	private buildStrokes(): void {
		this.strokes = []

		// Create links grid to track connections between pixels
		const links: number[][] = Array.from({ length: this.height }, () =>
			Array.from({ length: this.width }, () => 0),
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
			for (let i = 0; i < this.height; i++) {
				for (let j = 0; j < this.width; j++) {
					if (links[i][j] !== 0) return false
				}
			}
			return true
		}

		const pickDir = (i: number, j: number, c: number): number => {
			if (c === 1) {
				if ((links[i][j] & 1) !== 0) return Rune.S
				if ((links[i][j] & 2) !== 0) return Rune.E
				if ((links[i][j] & 4) !== 0) return Rune.N
				if ((links[i][j] & 8) !== 0) return Rune.W
			} else if (c === 3) {
				if ((links[i][j] & 1) === 0) return (Rune.N + 2) % 4
				if ((links[i][j] & 2) === 0) return (Rune.E + 2) % 4
				if ((links[i][j] & 4) === 0) return (Rune.S + 2) % 4
				if ((links[i][j] & 8) === 0) return (Rune.W + 2) % 4
			} else {
				const options: number[] = []
				if ((links[i][j] & 1) !== 0) options.push(Rune.S)
				if ((links[i][j] & 2) !== 0) options.push(Rune.E)
				if ((links[i][j] & 4) !== 0) options.push(Rune.N)
				if ((links[i][j] & 8) !== 0) options.push(Rune.W)
				if (options.length > 0) {
					return options[Math.floor(this.rng.random() * options.length)]
				}
			}
			return -1
		}

		const setLink = (i: number, j: number, d: number): void => {
			links[i][j] |= 1 << d
			let ni = i
			let nj = j
			switch (d) {
				case Rune.S:
					ni++
					break
				case Rune.E:
					nj++
					break
				case Rune.N:
					ni--
					break
				case Rune.W:
					nj--
					break
			}
			if (ni >= 0 && ni < this.height && nj >= 0 && nj < this.width) {
				links[ni][nj] |= 1 << ((d + 2) % 4)
			}
		}

		const clearLink = (i: number, j: number, d: number): void => {
			links[i][j] &= ~(1 << d)
			let ni = i
			let nj = j
			switch (d) {
				case Rune.S:
					ni++
					break
				case Rune.E:
					nj++
					break
				case Rune.N:
					ni--
					break
				case Rune.W:
					nj--
					break
			}
			if (ni >= 0 && ni < this.height && nj >= 0 && nj < this.width) {
				links[ni][nj] &= ~(1 << ((d + 2) % 4))
			}
		}

		// Build the links grid from the bitmap
		for (let i = 0; i < this.height; i++) {
			for (let j = 0; j < this.width; j++) {
				if (this.bitmap[i][j]) {
					// South link
					if (i < this.height - 1 && this.bitmap[i + 1][j]) {
						setLink(i, j, Rune.S)
					}
					// East link
					if (j < this.width - 1 && this.bitmap[i][j + 1]) {
						setLink(i, j, Rune.E)
					}
				}
			}
		}

		// Priority: prefer nodes with 1 or 3 links over 4, 2, or 0
		const priority = [1, 3, 4, 2, 0]

		// Extract strokes from the links grid
		let outerIterations = 0
		const maxOuterIterations = this.width * this.height

		while (!isEmpty() && outerIterations < maxOuterIterations) {
			outerIterations++

			let ii = -1
			let jj = -1
			let c = 0

			// Find the best starting point
			for (let i = 0; i < this.height; i++) {
				for (let j = 0; j < this.width; j++) {
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
			const maxIterations = this.width * this.height * 2

			// Trace the stroke
			while (iterations < maxIterations) {
				iterations++
				clearLink(ii, jj, dir)

				switch (dir) {
					case Rune.S:
						ii++
						break
					case Rune.E:
						jj++
						break
					case Rune.N:
						ii--
						break
					case Rune.W:
						jj--
						break
				}

				// Check bounds
				if (ii < 0 || ii >= this.height || jj < 0 || jj >= this.width) {
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
							dir = nextDir // BUG FIX: Update dir to nextDir
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

			this.strokes.push(stroke)
		}
	}

	private coin(chance: number = 0.5): boolean {
		return this.rng.random() < chance
	}
}
