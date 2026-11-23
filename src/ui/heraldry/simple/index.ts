import { HASH } from "@/model/shared/random/hash"
import { IDENTICON_HERALDRY } from "@/ui/heraldry/identicon"
import { ORGANIC_IDENTICON_HERALDRY } from "@/ui/heraldry/organic-identicon"
import { HERALDRY_SHIELD } from "@/ui/heraldry/shield"
import { AFRICAN_HERALDRY } from "@/ui/heraldry/simple/african"
import { COMPOSITE_HERALDRY } from "@/ui/heraldry/simple/composite"
import { EAST_ASIAN_HERALDRY } from "@/ui/heraldry/simple/east-asian"
import { ORNAMENTAL_HERALDRY } from "@/ui/heraldry/simple/ornamental"
import { PALETTE } from "@/ui/heraldry/simple/palette"
import { FLAG_STRIPES } from "@/ui/heraldry/simple/stripes"
import { SUN_DISC_HERALDRY } from "@/ui/heraldry/simple/sun-disc"
import { TRADITIONAL_HERALDRY } from "@/ui/heraldry/simple/traditional"
import type {
	FlagCircle,
	FlagDesign,
	FlagDesignSampleParams,
	FlagHue,
	FlagPaintParams,
	FlagPattern,
	FlagPoint,
	FlagRenderParams,
	FlagSampleParams,
	FlagSize,
	FlagStar,
	PickPatternParams,
} from "@/ui/heraldry/simple/types"

const patterns: readonly { value: FlagPattern; label: string }[] = [
	{ value: "identicon", label: "Jdenticon" },
	{ value: "organic-identicon", label: "Organic identicon" },
	{ value: "horizontal-bicolor", label: "Horizontal bicolor" },
	{ value: "vertical-bicolor", label: "Vertical bicolor" },
	{ value: "horizontal-tricolor", label: "Horizontal tricolor" },
	{ value: "vertical-tricolor", label: "Vertical tricolor" },
	{ value: "horizontal-stripes", label: "Horizontal stripes" },
	{ value: "vertical-stripes", label: "Vertical stripes" },
	{ value: "diagonal-stripes", label: "Diagonal stripes" },
	{ value: "cross", label: "Cross" },
	{ value: "nordic-cross", label: "Nordic cross" },
	{ value: "saltire", label: "Saltire" },
	{ value: "diagonal-striped-saltire", label: "Diagonal stripes and saltire" },
	{ value: "quarterly", label: "Quartered" },
	{ value: "quartered-patterns", label: "Quartered patterns" },
	{ value: "nested-quarterly", label: "Nested quartering" },
	{ value: "chevron", label: "Chevron" },
	{ value: "bend", label: "Diagonal band" },
	{ value: "canton", label: "Canton" },
	{ value: "lozenge", label: "Lozenge" },
	{ value: "outlined-lozenge", label: "Outlined lozenge" },
	{ value: "pall", label: "Pall" },
	{ value: "roundel", label: "Roundel" },
	{ value: "ring", label: "Ring" },
	{ value: "three-roundels", label: "Three roundels" },
	{ value: "three-rings", label: "Three rings" },
	{ value: "interlocked-rings", label: "Interlocked rings" },
	{ value: "roundel-stripes", label: "Roundel and bands" },
	{ value: "dots", label: "Dots" },
	{ value: "crescent", label: "Crescent" },
	{ value: "sunburst", label: "Sunburst" },
	{ value: "split-stripes-crosses", label: "Split stripes and crosses" },
	{ value: "split-stripes-roundels", label: "Split stripes and roundels" },
	{
		value: "quartered-stripes-crosses",
		label: "Quartered stripes and crosses",
	},
	{
		value: "quartered-stripes-roundels",
		label: "Quartered stripes and roundels",
	},
	{ value: "striped-roundel", label: "Striped field and roundel" },
	{ value: "vertical-striped-roundel", label: "Vertical stripes and roundel" },
	{ value: "striped-cross", label: "Striped field and cross" },
	{ value: "striped-crosses", label: "Stripes and stacked crosses" },
	{ value: "double-chevron", label: "Double chevron" },
	{ value: "chief", label: "Chief" },
	{ value: "chief-rings", label: "Chief and rings" },
	{ value: "label", label: "Label" },
	{ value: "gyronny", label: "Gyronny" },
	{ value: "cross-pattee", label: "Cross pattée" },
	{ value: "cross-engrailed", label: "Scalloped cross" },
	{ value: "tomoe", label: "Tomoe" },
	{ value: "rising-sun", label: "Rising sun" },
	{ value: "trigram-bars", label: "Trigram" },
	{ value: "kente-bands", label: "Woven bands" },
	{ value: "octagram", label: "Eight-pointed star" },
	{ value: "lotus", label: "Lotus" },
	{ value: "arabesque-band", label: "Interlaced band" },
	{ value: "inti-sun", label: "Sun disc" },
]

const hues: readonly {
	value: FlagHue
	label: string
	degrees: number | null
}[] = [
	{ value: "random", label: "Random", degrees: null },
	{ value: "red", label: "Red", degrees: 355 },
	{ value: "orange", label: "Orange", degrees: 28 },
	{ value: "yellow", label: "Yellow", degrees: 48 },
	{ value: "green", label: "Green", degrees: 135 },
	{ value: "teal", label: "Teal", degrees: 178 },
	{ value: "blue", label: "Blue", degrees: 215 },
	{ value: "purple", label: "Purple", degrees: 275 },
	{ value: "pink", label: "Pink", degrees: 330 },
]

const IDENTICON_SHARE = 1 / 2
const IDENTICON_VARIANTS: readonly FlagPattern[] = [
	"identicon",
	"organic-identicon",
]

const MAP_PATTERNS: ReadonlySet<FlagPattern> = new Set([
	"identicon",
	"organic-identicon",
	"horizontal-bicolor",
	"vertical-bicolor",
	"horizontal-tricolor",
	"vertical-tricolor",
	"cross",
	"diagonal-striped-saltire",
	"quarterly",
	"quartered-patterns",
	"nested-quarterly",
	"chevron",
	"bend",
	"outlined-lozenge",
	"roundel",
	"ring",
	"three-roundels",
	"three-rings",
	"sunburst",
	"split-stripes-roundels",
	"quartered-stripes-crosses",
	"quartered-stripes-roundels",
	"striped-cross",
	"double-chevron",
	"chief-rings",
	"label",
	"gyronny",
	"trigram-bars",
	"arabesque-band",
])

const EMBLEM_ZOOM = 1.3

const EMBLEM_PATTERNS: ReadonlySet<FlagPattern> = new Set([
	"cross-pattee",
	"cross-engrailed",
	"tomoe",
	"octagram",
	"lotus",
	"inti-sun",
	"roundel",
	"ring",
	"three-roundels",
	"three-rings",
	"interlocked-rings",
	"crescent",
	"sunburst",
])

const TRIAD_CENTERS: readonly FlagPoint[] = [
	[0.3, 0.3],
	[0.7, 0.3],
	[0.5, 0.62],
]

const QUARTER_PATTERNS: readonly FlagPattern[] = [
	"double-chevron",
	"chief",
	"cross-pattee",
	"identicon",
	"outlined-lozenge",
	"diagonal-striped-saltire",
	"horizontal-stripes",
	"vertical-stripes",
	"diagonal-stripes",
	"cross",
	"saltire",
	"roundel",
	"three-roundels",
	"three-rings",
	"lozenge",
	"bend",
	"split-stripes-crosses",
	"split-stripes-roundels",
	"striped-roundel",
	"striped-cross",
	"horizontal-tricolor",
	"vertical-tricolor",
]

function pickPattern({ roll, pool }: PickPatternParams): FlagPattern {
	if (roll < IDENTICON_SHARE)
		return IDENTICON_VARIANTS[
			Math.floor((roll / IDENTICON_SHARE) * IDENTICON_VARIANTS.length)
		]
	const others = pool.filter((entry) => !IDENTICON_VARIANTS.includes(entry))
	const scaled = (roll - IDENTICON_SHARE) / (1 - IDENTICON_SHARE)
	return others[Math.floor(scaled * others.length)]
}

function sampleDesign({
	seed,
	pattern,
	hue,
	depth,
	restricted,
}: FlagDesignSampleParams): FlagDesign {
	const hash = HASH.keyed({ seed: 0, key: seed }) >>> 0
	const unit = (channel: number) => HASH.unit({ seed: hash, channel, salt: 0 })
	const reversed = unit(2) < 0.5
	const selected =
		pattern === "all" || pattern === "map"
			? pickPattern({
					roll: unit(0),
					pool: patterns
						.map((entry) => entry.value)
						.filter((value) => !restricted || MAP_PATTERNS.has(value)),
				})
			: pattern
	const palette = PALETTE.fit({
		unit: unit(1),
		degrees: hue,
	})
	const quartered =
		selected === "quartered-patterns" || selected === "nested-quarterly"
	const paired = unit(7) < 0.5
	const quarterPool = restricted
		? QUARTER_PATTERNS.filter((entry) => MAP_PATTERNS.has(entry))
		: QUARTER_PATTERNS
	const quarters =
		quartered && depth < 2
			? Array.from({ length: 4 }, (_, index) => {
					const childIndex = paired ? [0, 1, 1, 0][index] : index
					const childSeed = `${seed}:quarter:${childIndex}`
					const childHash = HASH.keyed({ seed: 0, key: childSeed }) >>> 0
					const nested =
						depth === 0 &&
						((selected === "nested-quarterly" && childIndex === 0) ||
							HASH.unit({ seed: childHash, channel: 8, salt: 0 }) < 0.25)
					return sampleDesign({
						seed: childSeed,
						pattern: nested
							? "quartered-patterns"
							: quarterPool[childHash % quarterPool.length],
						hue,
						depth: depth + 1,
						restricted,
					})
				})
			: []
	return {
		seed,
		pattern: selected,
		colors: reversed ? [palette[1], palette[0], palette[2]] : palette,
		stripeCount: unit(3) < 0.5 ? 5 : 7,
		roundelRadius: 0.18 + unit(4) * 0.1,
		reversed,
		hueDegrees: hue,
		quarters,
	}
}

function sample(params: FlagSampleParams): FlagDesign {
	return sampleDesign({
		...params,
		depth: 0,
		restricted: params.pattern === "map",
	})
}

function paint({ ctx, design, width, height }: FlagPaintParams) {
	let extent: FlagSize = { width, height }
	ctx.save()
	ctx.fillStyle = design.colors[0]
	ctx.fillRect(0, 0, 1, 1)
	if (design.reversed) {
		ctx.translate(1, 0)
		ctx.scale(-1, 1)
	}
	ctx.fillStyle = design.colors[1]
	const circle = ({ x, y, radius }: FlagCircle) => {
		ctx.beginPath()
		ctx.ellipse(
			x,
			y,
			radius,
			(radius * extent.width) / extent.height,
			0,
			0,
			Math.PI * 2,
		)
		ctx.fill()
	}
	const ring = ({ x, y, radius }: FlagCircle) => {
		const innerRadius = radius * 0.74
		ctx.beginPath()
		ctx.ellipse(
			x,
			y,
			radius,
			(radius * extent.width) / extent.height,
			0,
			0,
			Math.PI * 2,
		)
		ctx.moveTo(x + innerRadius, y)
		ctx.ellipse(
			x,
			y,
			innerRadius,
			(innerRadius * extent.width) / extent.height,
			0,
			0,
			Math.PI * 2,
		)
		ctx.fill("evenodd")
	}
	const polygon = (points: readonly FlagPoint[]) => {
		ctx.beginPath()
		for (const [index, point] of points.entries()) {
			if (index === 0) ctx.moveTo(point[0], point[1])
			else ctx.lineTo(point[0], point[1])
		}
		ctx.closePath()
		ctx.fill()
	}
	const star = ({ x, y, radius, points, innerRatio }: FlagStar) => {
		const vertices: FlagPoint[] = []
		for (let point = 0; point < points * 2; point++) {
			const angle = (point * Math.PI) / points - Math.PI / 2
			const distance = radius * (point % 2 === 0 ? 1 : innerRatio)
			vertices.push([
				x + Math.cos(angle) * distance,
				y + (Math.sin(angle) * distance * extent.width) / extent.height,
			])
		}
		polygon(vertices)
	}
	const fieldAtSquareScale = (draw: () => void) => {
		ctx.fillStyle = IDENTICON_HERALDRY.style({
			name: design.seed,
			forcedHue: design.hueDegrees,
		}).backColor
		ctx.fillRect(0, 0, 1, 1)
		const scale = height / HERALDRY_SHIELD.fieldHeight
		const fieldWidth = HERALDRY_SHIELD.fieldWidth * scale
		ctx.save()
		ctx.translate((width - fieldWidth) / 2 / width, 0)
		ctx.scale(scale / width, scale / height)
		draw()
		ctx.restore()
	}
	const drawPattern = () => {
		switch (design.pattern) {
			case "double-chevron":
			case "chief":
			case "chief-rings":
			case "label":
			case "gyronny":
				TRADITIONAL_HERALDRY.paint({ ctx, design, ...extent })
				break
			case "cross-pattee":
			case "cross-engrailed":
				TRADITIONAL_HERALDRY.paint({ ctx, design, ...extent })
				break
			case "tomoe":
				EAST_ASIAN_HERALDRY.paint({ ctx, design, ...extent })
				break
			case "rising-sun":
			case "trigram-bars":
				EAST_ASIAN_HERALDRY.paint({ ctx, design, ...extent })
				break
			case "kente-bands":
				AFRICAN_HERALDRY.paint({ ctx, design })
				break
			case "octagram":
			case "lotus":
				ORNAMENTAL_HERALDRY.paint({ ctx, design, ...extent })
				break
			case "arabesque-band":
				ORNAMENTAL_HERALDRY.paint({ ctx, design, ...extent })
				break
			case "inti-sun":
				SUN_DISC_HERALDRY.paint({ ctx, design, ...extent })
				break
			case "identicon":
				fieldAtSquareScale(() =>
					IDENTICON_HERALDRY.paint({
						ctx,
						seed: design.seed,
						width: HERALDRY_SHIELD.fieldWidth,
						height: HERALDRY_SHIELD.fieldHeight,
						hue: design.hueDegrees,
					}),
				)
				break
			case "organic-identicon":
				fieldAtSquareScale(() =>
					ORGANIC_IDENTICON_HERALDRY.paint({
						ctx,
						seed: design.seed,
						width: HERALDRY_SHIELD.fieldWidth,
						height: HERALDRY_SHIELD.fieldHeight,
						hue: design.hueDegrees,
					}),
				)
				break
			case "quartered-patterns":
			case "nested-quarterly":
				for (const [index, child] of design.quarters.entries()) {
					ctx.save()
					ctx.translate((index % 2) / 2, Math.floor(index / 2) / 2)
					ctx.beginPath()
					ctx.rect(0, 0, 0.5, 0.5)
					ctx.clip()
					ctx.scale(0.5, 0.5)
					paint({ ctx, design: child, width, height })
					ctx.restore()
				}
				break
			case "split-stripes-crosses":
			case "split-stripes-roundels":
			case "quartered-stripes-crosses":
			case "quartered-stripes-roundels":
			case "striped-roundel":
			case "vertical-striped-roundel":
			case "striped-cross":
			case "striped-crosses":
				COMPOSITE_HERALDRY.paint({ ctx, design, ...extent, circle })
				break
			case "roundel":
				circle({
					x: 0.5,
					y: 0.46,
					radius: design.roundelRadius,
				})
				break
			case "ring":
				circle({ x: 0.5, y: 0.46, radius: design.roundelRadius })
				ctx.fillStyle = design.colors[0]
				circle({ x: 0.5, y: 0.46, radius: design.roundelRadius * 0.64 })
				break
			case "three-roundels":
			case "three-rings": {
				const draw = design.pattern === "three-rings" ? ring : circle
				for (const [index, [x, y]] of TRIAD_CENTERS.entries()) {
					ctx.fillStyle = design.colors[index === 2 ? 2 : 1]
					draw({ x, y, radius: 0.13 })
				}
				break
			}
			case "interlocked-rings": {
				const radius = 0.22
				const left = 0.36
				const right = 0.64
				const centerY = 0.46
				ring({ x: left, y: centerY, radius })
				ctx.fillStyle = design.colors[2]
				ring({ x: right, y: centerY, radius })
				const centerRadius = radius * 0.87
				const crossingAngle = -Math.acos((right - left) / (2 * centerRadius))
				ctx.save()
				ctx.translate(left, centerY)
				ctx.scale(1, extent.width / extent.height)
				ctx.beginPath()
				ctx.arc(0, 0, centerRadius, crossingAngle - 0.28, crossingAngle + 0.28)
				ctx.strokeStyle = design.colors[0]
				ctx.lineWidth = radius * 0.26 + 0.035
				ctx.stroke()
				ctx.strokeStyle = design.colors[1]
				ctx.lineWidth = radius * 0.26
				ctx.stroke()
				ctx.restore()
				break
			}
			case "roundel-stripes":
				ctx.fillRect(0, 1 / 3, 1, 1 / 3)
				ctx.fillStyle = design.colors[2]
				ctx.fillRect(0, 2 / 3, 1, 1 / 3)
				ctx.fillStyle = design.colors[0]
				circle({ x: 0.5, y: 0.5, radius: design.roundelRadius + 0.04 })
				ctx.save()
				ctx.beginPath()
				ctx.rect(0, 0.5, 1, 0.5)
				ctx.clip()
				ctx.fillStyle = design.colors[2]
				circle({ x: 0.5, y: 0.5, radius: design.roundelRadius + 0.04 })
				ctx.restore()
				ctx.fillStyle = design.colors[1]
				circle({ x: 0.5, y: 0.5, radius: design.roundelRadius })
				break
			case "dots":
				for (let row = 0; row < 3; row++) {
					for (let col = 0; col < 3; col++) {
						ctx.fillStyle = design.colors[1 + ((row + col) % 2)]
						circle({
							x: 0.23 + col * 0.27,
							y: 0.22 + row * 0.23,
							radius: 0.065,
						})
					}
				}
				break
			case "crescent":
				circle({ x: 0.5, y: 0.46, radius: design.roundelRadius })
				ctx.fillStyle = design.colors[0]
				circle({
					x: 0.5 + design.roundelRadius * 0.45,
					y: 0.43,
					radius: design.roundelRadius * 0.88,
				})
				break
			case "sunburst": {
				star({
					x: 0.5,
					y: 0.46,
					radius: design.roundelRadius * 1.3,
					points: 12,
					innerRatio: 0.8 / 1.3,
				})
				ctx.fillStyle = design.colors[2]
				circle({ x: 0.5, y: 0.46, radius: design.roundelRadius * 0.55 })
				break
			}
			case "horizontal-bicolor":
				ctx.fillRect(0, 0.5, 1, 0.5)
				break
			case "vertical-bicolor":
				ctx.fillRect(0.5, 0, 0.5, 1)
				break
			case "horizontal-tricolor":
				ctx.fillRect(0, 1 / 3, 1, 1 / 3)
				ctx.fillStyle = design.colors[2]
				ctx.fillRect(0, 2 / 3, 1, 1 / 3)
				break
			case "vertical-tricolor":
				ctx.fillRect(1 / 3, 0, 1 / 3, 1)
				ctx.fillStyle = design.colors[2]
				ctx.fillRect(2 / 3, 0, 1 / 3, 1)
				break
			case "horizontal-stripes":
			case "vertical-stripes":
				FLAG_STRIPES.draw({
					ctx,
					orientation:
						design.pattern === "vertical-stripes" ? "vertical" : "horizontal",
					count: design.stripeCount,
					x: 0,
					y: 0,
					width: 1,
					height: 1,
				})
				break
			case "diagonal-stripes":
				FLAG_STRIPES.draw({
					ctx,
					orientation: "diagonal",
					count: design.stripeCount,
					x: 0,
					y: 0,
					width: 1,
					height: 1,
				})
				break
			case "cross":
			case "nordic-cross": {
				const center = design.pattern === "cross" ? 0.5 : 0.35
				ctx.fillRect(center - 0.14, 0, 0.28, 1)
				ctx.fillRect(0, 0.33, 1, 0.24)
				ctx.fillStyle = design.colors[2]
				ctx.fillRect(center - 0.07, 0, 0.14, 1)
				ctx.fillRect(0, 0.39, 1, 0.12)
				break
			}
			case "saltire":
			case "diagonal-striped-saltire": {
				const striped = design.pattern === "diagonal-striped-saltire"
				if (striped) {
					FLAG_STRIPES.draw({
						ctx,
						orientation: "diagonal",
						count: design.stripeCount,
						x: 0,
						y: 0,
						width: 1,
						height: 1,
					})
					ctx.fillStyle = design.colors[0]
					polygon([
						[-0.22, 0],
						[0.22, 0],
						[1.22, 1],
						[0.78, 1],
					])
					polygon([
						[0.78, 0],
						[1.22, 0],
						[0.22, 1],
						[-0.22, 1],
					])
					ctx.fillStyle = design.colors[2]
				}
				polygon([
					[-0.16, 0],
					[0.16, 0],
					[1.16, 1],
					[0.84, 1],
				])
				polygon([
					[0.84, 0],
					[1.16, 0],
					[0.16, 1],
					[-0.16, 1],
				])
				break
			}
			case "quarterly":
				ctx.fillRect(0, 0, 0.5, 0.5)
				ctx.fillRect(0.5, 0.5, 0.5, 0.5)
				break
			case "chevron":
				TRADITIONAL_HERALDRY.chevron({ ctx, apex: 0.18, thickness: 0.28 })
				break
			case "bend":
				polygon([
					[-0.2, 0],
					[0.2, 0],
					[1.2, 1],
					[0.8, 1],
				])
				break
			case "canton":
				FLAG_STRIPES.draw({
					ctx,
					orientation: "horizontal",
					count: 7,
					x: 0,
					y: 0,
					width: 1,
					height: 1,
				})
				ctx.fillStyle = design.colors[2]
				ctx.fillRect(0, 0, 0.5, 0.45)
				break
			case "lozenge":
			case "outlined-lozenge":
				polygon([
					[0.5, 0.12],
					[0.88, 0.47],
					[0.5, 0.82],
					[0.12, 0.47],
				])
				if (design.pattern === "outlined-lozenge") {
					ctx.fillStyle = design.colors[0]
					polygon([
						[0.5, 0.23],
						[0.76, 0.47],
						[0.5, 0.71],
						[0.24, 0.47],
					])
				}
				break
			case "pall":
				polygon([
					[0, 0],
					[0.2, 0],
					[0.5, 0.34],
					[0.8, 0],
					[1, 0],
					[0.62, 0.48],
					[0.62, 1],
					[0.38, 1],
					[0.38, 0.48],
				])
				break
		}
	}
	if (EMBLEM_PATTERNS.has(design.pattern)) {
		const emblemWidth =
			(HERALDRY_SHIELD.fieldWidth / HERALDRY_SHIELD.fieldHeight) *
			(height / width)
		ctx.save()
		ctx.translate(0.5, 0.5)
		ctx.scale(EMBLEM_ZOOM, EMBLEM_ZOOM)
		ctx.translate(-0.5, -0.5)
		ctx.translate((1 - emblemWidth) / 2, 0)
		ctx.scale(emblemWidth, 1)
		extent = {
			width: HERALDRY_SHIELD.fieldWidth,
			height: HERALDRY_SHIELD.fieldHeight,
		}
		drawPattern()
		ctx.restore()
	} else drawPattern()
	ctx.restore()
}

function render({
	design,
	width,
	shape,
}: FlagRenderParams): HTMLCanvasElement | null {
	return HERALDRY_SHIELD.render({
		width,
		shape,
		field: design.colors[0],
		paint: ({ ctx, width, height }) => {
			ctx.scale(width, height)
			paint({ ctx, design, width, height })
		},
	})
}

export const FLAG_GENERATOR = { patterns, hues, sample, render }
