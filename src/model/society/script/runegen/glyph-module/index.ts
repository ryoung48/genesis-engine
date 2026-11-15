import { RNG } from "@/model/shared/random/rng"
import { CARVING } from "@/model/society/script/runegen/carving"
import type {
	GenerateGlyphSetParams,
	LayoutGlyphTextParams,
} from "@/model/society/script/runegen/glyph-module/types"
import { RUNE } from "@/model/society/script/runegen/rune"
import type {
	RuneData,
	RuneGeneratorOptions,
	RuneMotif,
	RuneTemplate,
} from "@/model/society/script/runegen/rune/types"

export type GlyphSet = Record<string, RuneData>

const defaultGlyphAlphabet = "abcdefghijklmnopqrstuvwxyz".split("")

const MIN_GLYPH_DIFF = 5

const MAX_GLYPH_TRIES = 40

const FREQUENCY_ORDER = "etaoinshrdlcumwfgypbvkjxqz"

const MIXABLE_TEMPLATES: RuneTemplate[] = [
	"random1",
	"random2",
	"random4",
	"random5",
	"cursive",
]
const TEMPLATES: RuneTemplate[] = [...MIXABLE_TEMPLATES, "carved"]

function frequencyWeightBand(char: string): RuneGeneratorOptions["weightBand"] {
	const rank = FREQUENCY_ORDER.indexOf(char)
	if (rank === -1) return "any"
	if (rank < 9) return "light"
	if (rank >= FREQUENCY_ORDER.length - 5) return "heavy"
	return "any"
}

function generateGlyphSet({
	alphabet,
	options = {},
	seed,
}: GenerateGlyphSetParams): GlyphSet {
	const glyphs: GlyphSet = {}
	const chars = alphabet.split("")
	const dice = RNG.createStringRng({ seed: seed ?? Date.now().toString(36) })
	const useHouseStyle =
		!options.forceTemplate &&
		(!options.seedTemplate || options.seedTemplate === "any")
	const dominant = dice.choice(TEMPLATES)
	const pinnedTemplate =
		options.forceTemplate ??
		(options.seedTemplate !== "any" ? options.seedTemplate : undefined)
	const scriptStyle = pinnedTemplate ?? dominant
	const isCursiveScript = scriptStyle === "cursive"
	const isCarvedScript = scriptStyle === "carved"
	// A joined cursive script mixed with disconnected letterforms would look
	// broken, so it pairs only with the vertical-spine template as its outlier
	const secondary = isCursiveScript
		? "random5"
		: dice.choice(
				MIXABLE_TEMPLATES.filter(
					(template) => template !== dominant && template !== "cursive",
				),
			)
	// Cursive scripts stay joined far more consistently than other templates mix
	const dominantShare = isCursiveScript ? 0.85 : 0.7
	const motifs: RuneMotif[] = [
		"headline",
		"headline",
		"headline",
		"baseline",
		"stave",
		"none",
	]
	// Cursive's connector line is already its unifying feature; a headline or
	// stave on top would clash with the ascenders and teeth
	const motif =
		options.motif ??
		(isCursiveScript || isCarvedScript ? "none" : dice.choice(motifs))
	const dotRoll = dice.random()
	const maxDots =
		options.maxDots ??
		(isCarvedScript
			? 0
			: isCursiveScript
				? dice.randint(2, 3)
				: dotRoll < 0.5
					? 0
					: dotRoll < 0.85
						? 1
						: 2)
	const useFrequencyWeights =
		!options.weightBand || options.weightBand === "any"
	const carvingFamilies = isCarvedScript ? dice.shuffle(CARVING.families) : null

	for (const rawChar of chars) {
		const char = rawChar.toLowerCase()
		if (!char || glyphs[char]) continue

		const frequencyBand = frequencyWeightBand(char)
		const others = Object.values(glyphs)
		const carvingFamily =
			carvingFamilies?.[others.length % carvingFamilies.length]
		const weightBand =
			useFrequencyWeights && !carvingFamily ? frequencyBand : options.weightBand
		let best: RuneData | null = null
		let bestDistance = -1

		for (let attempt = 0; attempt < MAX_GLYPH_TRIES; attempt++) {
			const runeSeed = Math.floor(dice.random() * 1e9).toString(36)
			const runeRng = RNG.createStringRng({ seed: runeSeed })
			let styleTemplate: RuneTemplate | undefined = isCarvedScript
				? "carved"
				: undefined
			if (useHouseStyle && !isCarvedScript) {
				styleTemplate =
					attempt >= MAX_GLYPH_TRIES / 2
						? dice.choice(MIXABLE_TEMPLATES)
						: dice.random() < dominantShare
							? dominant
							: secondary
			}

			const candidate = RUNE.generate({
				options: {
					...options,
					motif,
					maxDots,
					weightBand,
					...(styleTemplate ? { forceTemplate: styleTemplate } : {}),
				},
				rng: runeRng,
				seed: runeSeed,
				carvingFamily,
			})
			const distance =
				others.length === 0
					? Number.POSITIVE_INFINITY
					: Math.min(
							...others.map((other) => RUNE.diff({ a: candidate, b: other })),
						)
			if (distance > bestDistance) {
				best = candidate
				bestDistance = distance
			}
			const minDiff = Math.round(
				(MIN_GLYPH_DIFF * candidate.width * candidate.height) /
					(RUNE.WIDTH * RUNE.HEIGHT),
			)
			if (bestDistance >= minDiff) break
		}

		if (best) glyphs[char] = best
	}

	return glyphs
}

type GlyphPlacement = { char: string; x: number; y: number }

type HeadlineSegment = { from: number; to: number; y: number }

type WordPlacement = { letters: GlyphPlacement[] }

type GlyphTextLayout = {
	width: number
	height: number
	placements: GlyphPlacement[]
	headlines: HeadlineSegment[]
	words: WordPlacement[]
}

function layoutGlyphText({
	text,
	config,
}: LayoutGlyphTextParams): GlyphTextLayout | null {
	const {
		paddedWidth,
		glyphWidths,
		paddedHeight,
		spaceWidth,
		gap,
		lineGap,
		wrapWidth,
	} = config
	const sanitized = text
		.toLowerCase()
		.replace(/\s/g, " ")
		.replace(/[^a-z ]/g, "")
	if (!sanitized) return null

	const glyphWidth = (char: string) => glyphWidths[char] ?? paddedWidth
	type Token = { word: string; width: number; spacesAfter: number }
	const tokens: Token[] = []
	let currentWord = ""
	let spaceCount = 0

	const pushToken = () => {
		if (currentWord.length > 0 || spaceCount > 0) {
			const width = Array.from(currentWord).reduce(
				(total, char, index) =>
					total + glyphWidth(char) + (index > 0 ? gap : 0),
				0,
			)
			tokens.push({ word: currentWord, width, spacesAfter: spaceCount })
		}
		currentWord = ""
		spaceCount = 0
	}

	for (const char of sanitized) {
		if (char === " ") {
			spaceCount++
		} else {
			if (spaceCount > 0) pushToken()
			currentWord += char
		}
	}
	pushToken()
	if (tokens.length === 0) return null

	type Line = { tokens: Token[]; width: number }
	const lines: Line[] = []
	let current: Line = { tokens: [], width: 0 }
	const maxWidth = wrapWidth ?? Number.POSITIVE_INFINITY

	const flush = () => {
		if (current.tokens.length === 0) return
		lines.push(current)
		current = { tokens: [], width: 0 }
	}

	tokens.forEach((token, index) => {
		const tokenWidth = token.width + token.spacesAfter * spaceWidth
		if (
			wrapWidth &&
			current.width + tokenWidth > maxWidth &&
			current.tokens.length > 0
		) {
			flush()
		}
		current.tokens.push(token)
		current.width += tokenWidth
		if (index === tokens.length - 1) flush()
	})

	const width = Math.max(
		...lines.map((line) => Math.max(line.width, paddedWidth)),
		paddedWidth,
	)
	const height = lines.length * paddedHeight + (lines.length - 1) * lineGap
	const placements: GlyphPlacement[] = []
	const headlines: HeadlineSegment[] = []
	const words: WordPlacement[] = []

	let y = 0
	for (const line of lines) {
		let x = 0
		for (const token of line.tokens) {
			if (token.word.length > 0) {
				headlines.push({ from: x, to: x + token.width, y })
				const letters: GlyphPlacement[] = []
				token.word.split("").forEach((char, index) => {
					const placement = { char, x, y }
					placements.push(placement)
					letters.push(placement)
					x += glyphWidth(char) + (index === token.word.length - 1 ? 0 : gap)
				})
				words.push({ letters })
			}
			x += token.spacesAfter * spaceWidth
		}
		y += paddedHeight + lineGap
	}

	return { width, height, placements, headlines, words }
}

export const GLYPH_MODULE = {
	defaultGlyphAlphabet,
	generateGlyphSet,
	layoutGlyphText,
}
