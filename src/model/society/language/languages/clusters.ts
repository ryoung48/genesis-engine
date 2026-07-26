import { titleCase } from "@/model/shared"
import {
	Cluster,
	Language,
	PhonemeCatalog,
	STOP_CHAR,
	vowelRules,
} from "./types"

const range = (count: number): number[] =>
	Array.from({ length: count }, (_, index) => index)

const aVowels = ["a", "Ť", "ť", "š", "Ţ", "Ä"]
const eVowels = ["e", "ū", "ũ", "Ū", "Ä“"]
const yiVowels = ["i", "y", "ů", "ſ", "ŭ", "Ž", "Ů", "Ä«"]
const iVowels = ["i", "ů", "ŭ", "Ů", "Ä«"]
const oVowels = ["o", "u", "Ÿ", "Ŷ", "ż", "ų", "ź", "Ŵ", "Ż", "Å", "Å«"]
const feminineConsonants = ["l", "ll", "n", "nn", "s", "ss", "th", "x", "xx"]
const singleUseLetters = ["b", "f", "j", "p", "w", "v", "x"]
const YI_VOWEL_SET = new Set(yiVowels)
const FEMININE_CONSONANT_SET = new Set(feminineConsonants)
const ALL_VOWELS = [...aVowels, ...eVowels, ...iVowels, ...oVowels, ...yiVowels]
const ALL_VOWELS_SET = new Set(ALL_VOWELS)
const languageCache = new WeakMap<
	Language,
	{
		vowelSet: Set<string>
		hasHPhoneme: boolean
		backAVowels: string[]
	}
>()
const clusterCache = new WeakMap<
	Cluster,
	{
		masculineEndConsonants: Cluster["phonemes"][typeof PhonemeCatalog.END_CONSONANT]
		masculineBackVowels: Cluster["phonemes"][typeof PhonemeCatalog.BACK_VOWEL]
		masculineEndVowels: Cluster["phonemes"][typeof PhonemeCatalog.END_VOWEL]
	}
>()

function getLanguageCache(src: Language): {
	vowelSet: Set<string>
	hasHPhoneme: boolean
	backAVowels: string[]
} {
	const existing = languageCache.get(src)
	if (existing) return existing

	let hasHPhoneme = false
	for (const phoneme of src.phonemes[PhonemeCatalog.START_CONSONANT]) {
		if (phoneme.v === "h") {
			hasHPhoneme = true
			break
		}
	}
	if (!hasHPhoneme) {
		for (const phoneme of src.phonemes[PhonemeCatalog.MIDDLE_CONSONANT]) {
			if (phoneme.v === "h") {
				hasHPhoneme = true
				break
			}
		}
	}

	const backAVowels: string[] = []
	for (const vowel of aVowels) {
		if (src.phonemes[PhonemeCatalog.BACK_VOWEL].some(({ v }) => v === vowel)) {
			backAVowels.push(vowel)
		}
	}

	const cache = {
		vowelSet: new Set(src.vowels),
		hasHPhoneme,
		backAVowels,
	}
	languageCache.set(src, cache)
	return cache
}

function getClusterCache(cluster: Cluster): {
	masculineEndConsonants: Cluster["phonemes"][typeof PhonemeCatalog.END_CONSONANT]
	masculineBackVowels: Cluster["phonemes"][typeof PhonemeCatalog.BACK_VOWEL]
	masculineEndVowels: Cluster["phonemes"][typeof PhonemeCatalog.END_VOWEL]
} {
	const existing = clusterCache.get(cluster)
	if (existing) return existing

	const masculineEndConsonants = cluster.phonemes[
		PhonemeCatalog.END_CONSONANT
	].filter((phoneme) => !FEMININE_CONSONANT_SET.has(phoneme.v))
	const masculineBackVowels =
		masculineEndConsonants.length > 0
			? cluster.phonemes[PhonemeCatalog.BACK_VOWEL].filter(
					(phoneme) => !YI_VOWEL_SET.has(phoneme.v),
				)
			: cluster.phonemes[PhonemeCatalog.BACK_VOWEL]
	const masculineEndVowels = cluster.phonemes[PhonemeCatalog.END_VOWEL].filter(
		(phoneme) => oVowels.includes(phoneme.v.slice(-1)),
	)

	const cache = {
		masculineEndConsonants,
		masculineBackVowels,
		masculineEndVowels,
	}
	clusterCache.set(cluster, cache)
	return cache
}

function hasSegmentMatch(
	prospect: string,
	candidates: readonly string[],
): boolean {
	for (const candidate of candidates) {
		if (prospect.includes(candidate)) return true
	}
	return false
}

function findLastNonVowelChar(
	value: string,
	vowelSet: ReadonlySet<string>,
): string {
	for (let i = value.length - 1; i >= 0; i--) {
		const char = value[i]
		if (!vowelSet.has(char)) return char
	}
	return ""
}

function hasSplitRestrictedRepeat(value: string): boolean {
	const lowercaseWord = value.toLowerCase()
	for (const letter of singleUseLetters) {
		let first = -1
		let last = -1
		let count = 0
		for (let i = 0; i < lowercaseWord.length; i++) {
			if (lowercaseWord[i] !== letter) continue
			if (first === -1) first = i
			last = i
			count++
		}
		if (count > 1 && last - first + 1 !== count) return true
	}
	return false
}

function trailingVowelCount(
	value: string,
	vowelSet: ReadonlySet<string>,
): number {
	let count = 0
	for (let i = value.length - 1; i >= 0; i--) {
		if (vowelSet.has(value[i])) count++
		else break
	}
	return count
}

function leadingVowelCount(
	value: string,
	vowelSet: ReadonlySet<string>,
): number {
	let count = 0
	for (let i = 0; i < value.length; i++) {
		if (vowelSet.has(value[i])) count++
		else break
	}
	return count
}

function maxConsonantRun(value: string): number {
	let current = 0
	let max = 0
	for (const char of value.toLowerCase()) {
		if (char === " " || char === "'" || char === "-") {
			current = 0
			continue
		}
		if (ALL_VOWELS_SET.has(char)) {
			current = 0
			continue
		}
		current++
		if (current > max) max = current
	}
	return max
}

function clonePhonemes(phonemes: Cluster["phonemes"]): Cluster["phonemes"] {
	return {
		[PhonemeCatalog.START_CONSONANT]: phonemes[
			PhonemeCatalog.START_CONSONANT
		].map(({ v, w }) => ({ v, w })),
		[PhonemeCatalog.MIDDLE_CONSONANT]: phonemes[
			PhonemeCatalog.MIDDLE_CONSONANT
		].map(({ v, w }) => ({ v, w })),
		[PhonemeCatalog.END_CONSONANT]: phonemes[PhonemeCatalog.END_CONSONANT].map(
			({ v, w }) => ({ v, w }),
		),
		[PhonemeCatalog.START_VOWEL]: phonemes[PhonemeCatalog.START_VOWEL].map(
			({ v, w }) => ({ v, w }),
		),
		[PhonemeCatalog.FRONT_VOWEL]: phonemes[PhonemeCatalog.FRONT_VOWEL].map(
			({ v, w }) => ({ v, w }),
		),
		[PhonemeCatalog.MIDDLE_VOWEL]: phonemes[PhonemeCatalog.MIDDLE_VOWEL].map(
			({ v, w }) => ({ v, w }),
		),
		[PhonemeCatalog.BACK_VOWEL]: phonemes[PhonemeCatalog.BACK_VOWEL].map(
			({ v, w }) => ({ v, w }),
		),
		[PhonemeCatalog.END_VOWEL]: phonemes[PhonemeCatalog.END_VOWEL].map(
			({ v, w }) => ({ v, w }),
		),
	}
}

const wordLength = (cluster: Cluster, src: Language) => {
	const mod = src.dice.random < cluster.longNames ? 1 : 0
	return cluster.len + mod
}

const basePatternize = (cluster: Cluster, src: Language) => {
	// pick a pattern from the selected group
	const next: Record<string, string> = {
		[PhonemeCatalog.MIDDLE_CONSONANT]: PhonemeCatalog.MIDDLE_VOWEL,
		[PhonemeCatalog.MIDDLE_VOWEL]: PhonemeCatalog.MIDDLE_CONSONANT,
		[STOP_CHAR]: STOP_CHAR,
	}
	const len = wordLength(cluster, src)
	let prev: string =
		src.dice.random > 0.3
			? PhonemeCatalog.MIDDLE_VOWEL
			: PhonemeCatalog.MIDDLE_CONSONANT
	let stopped = false
	const pattern = range(len).map((_, i) => {
		prev = cluster.patterns[next[prev.slice(-1)]]
		if (!stopped && i !== len - 1 && src.dice.random < cluster.stopChance) {
			prev = `${prev}${STOP_CHAR}`
			stopped = true
		}
		return prev
	})
	pattern.forEach((seg, i) => {
		if (seg.includes(STOP_CHAR)) {
			pattern[i] = pattern[i].replace(
				`${PhonemeCatalog.MIDDLE_CONSONANT}${STOP_CHAR}`,
				`${PhonemeCatalog.END_CONSONANT}${STOP_CHAR}`,
			)
			// eslint-disable-next-line no-useless-escape
			const startC = new RegExp(`^${PhonemeCatalog.MIDDLE_CONSONANT}(\W*)`)
			pattern[i + 1] = pattern[i + 1].replace(
				startC,
				`${PhonemeCatalog.START_CONSONANT}$1`,
			)
		}
	})
	const e = pattern.length - 1
	let ending = pattern[e].slice(-1)
	// append proper ending char
	if (cluster.ending && cluster.ending !== ending) {
		pattern[e] += cluster.ending
	}
	// replace with proper start|end consonant
	ending = pattern[e].slice(-1)
	if (ending === PhonemeCatalog.MIDDLE_CONSONANT) {
		pattern[e] = `${pattern[e].slice(0, -1)}${PhonemeCatalog.END_CONSONANT}`
	}
	if (ending === PhonemeCatalog.MIDDLE_VOWEL) {
		pattern[e] = `${pattern[e].slice(0, -1)}${PhonemeCatalog.END_VOWEL}`
	}
	let start = pattern[0][0]
	if (start === PhonemeCatalog.MIDDLE_VOWEL) {
		pattern[0] = `${PhonemeCatalog.START_VOWEL}${pattern[0].slice(1)}`
	}
	start = pattern[0][0]
	if (start === PhonemeCatalog.MIDDLE_CONSONANT) {
		pattern[0] = `${PhonemeCatalog.START_CONSONANT}${pattern[0].slice(1)}`
	}
	// sub in middle vowels
	const bv = new RegExp(
		`${PhonemeCatalog.START_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}`,
		"g",
	)
	pattern[0] = pattern[0].replace(
		bv,
		`${PhonemeCatalog.START_CONSONANT}${PhonemeCatalog.FRONT_VOWEL}`,
	)
	const vf = new RegExp(
		`${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
		"g",
	)
	pattern[e] = pattern[e].replace(
		vf,
		`${PhonemeCatalog.BACK_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
	)
	return pattern
}
const femininePattern = (cluster: Cluster, src: Language) => {
	const pattern = basePatternize(cluster, src)
	const hasContent =
		cluster.phonemes[PhonemeCatalog.END_CONSONANT].length > 0 &&
		cluster.phonemes[PhonemeCatalog.BACK_VOWEL].length > 0
	if (
		hasContent &&
		src.ending === PhonemeCatalog.MIDDLE_CONSONANT &&
		src.dice.random < src.consonantChance
	) {
		const e = pattern.length - 1
		const cl = new RegExp(
			`${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.END_VOWEL}`,
			"g",
		)
		pattern[e] = pattern[e].replace(
			cl,
			`${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.BACK_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
		)
	}
	return pattern
}

const patternize = (cluster: Cluster, src: Language) => {
	if (cluster.key === "female") return femininePattern(cluster, src)
	return basePatternize(cluster, src)
}

const notHarsh = (
	src: Language,
	params: {
		curr: string
		prev: string
		usedLongVowel: boolean
		usedDigraph: boolean
	},
) => {
	const { curr, prev, usedLongVowel, usedDigraph } = params
	const { vowelSet } = getLanguageCache(src)
	if (usedLongVowel && hasLongVowel(src, curr)) return false
	if (usedDigraph && hasDigraph(src, curr)) return false
	if (
		trailingVowelCount(prev, vowelSet) + leadingVowelCount(curr, vowelSet) >=
		3
	)
		return false
	if (hasSplitRestrictedRepeat(`${prev}${curr}`)) return false
	if (maxConsonantRun(`${prev}${curr}`) > 3) return false

	const lastPrevNonVowel = findLastNonVowelChar(prev, vowelSet)
	if (lastPrevNonVowel) {
		for (let i = 0; i < curr.length; i++) {
			const char = curr[i]
			if (!vowelSet.has(char) && char === lastPrevNonVowel) return false
		}
	}

	return true
}
const validLetter = (
	src: Language,
	params: {
		curr: string
		prev: string
		type: string
		usedLongVowel: boolean
		usedDigraph: boolean
	},
) => {
	const { curr, prev, type, usedLongVowel, usedDigraph } = params
	const validFront =
		type !== PhonemeCatalog.FRONT_VOWEL ||
		!vowelRules.front[curr] ||
		vowelRules.front[curr].includes(prev.substr(-1)) ||
		vowelRules.front[curr].includes(prev.substr(-2))
	const validEnd =
		type !== PhonemeCatalog.END_CONSONANT ||
		!vowelRules.back[prev.slice(-2)] ||
		vowelRules.back[prev.slice(-2)].includes(curr)
	return (
		notHarsh(src, { curr, prev, usedLongVowel, usedDigraph }) &&
		validEnd &&
		validFront
	)
}

const hasLongVowel = (src: Language, prospect: string) =>
	hasSegmentMatch(prospect, src.diphthongs)

const hasDigraph = (src: Language, prospect: string) =>
	hasSegmentMatch(prospect, src.digraphs)

const baseEndVowels = (cluster: Cluster) =>
	cluster.phonemes[PhonemeCatalog.END_VOWEL]
const feminineEndVowels = (cluster: Cluster, prev: string) => {
	const vowels = [...aVowels, ...iVowels]
	if (["l", "n"].includes(prev.slice(-1)) || ["ett"].includes(prev.slice(-3))) {
		vowels.push(...eVowels)
	}
	const complex: string[] = []
	if (["r", "f"].includes(prev.slice(-1))) {
		complex.push("ie", "ae")
	}
	if (
		["m", "r", "s", "z"].includes(prev.slice(-1)) ||
		["th", "sh", "h"].includes(prev.slice(-2))
	) {
		complex.push(...["ee", "ũe", "ūe", "Ūe", "ae"])
	}
	return baseEndVowels(cluster).filter(
		(v) => vowels.includes(v.v.slice(-1)) || complex.includes(v.v.slice(-2)),
	)
}
const masculineEndVowels = (cluster: Cluster) => {
	return getClusterCache(cluster).masculineEndVowels
}
const endVowels = (cluster: Cluster, prev: string) => {
	if (cluster.key === "female") return feminineEndVowels(cluster, prev)
	if (cluster.key === "male") return masculineEndVowels(cluster)
	return baseEndVowels(cluster)
}

const baseEndConsonants = (cluster: Cluster) =>
	cluster.phonemes[PhonemeCatalog.END_CONSONANT]
const masculineEndConsonants = (cluster: Cluster, prev: string) => {
	const prevSub1 = prev.slice(-1)
	const prevSub2 = prev.slice(-2)
	const endings = cluster.phonemes[PhonemeCatalog.END_CONSONANT]
	const valid = getClusterCache(cluster).masculineEndConsonants
	if (
		valid.length > 0 &&
		YI_VOWEL_SET.has(prevSub1) &&
		!vowelRules.back[prevSub2]
	) {
		return valid
	}
	return endings
}
const endConsonants = (cluster: Cluster, prev: string) => {
	if (cluster.key === "male") return masculineEndConsonants(cluster, prev)
	return baseEndConsonants(cluster)
}

const baseBackVowels = (cluster: Cluster) =>
	cluster.phonemes[PhonemeCatalog.BACK_VOWEL]
const masculineBackVowels = (cluster: Cluster) => {
	return getClusterCache(cluster).masculineBackVowels
}
const backVowels = (cluster: Cluster) => {
	if (cluster.key === "male") return masculineBackVowels(cluster)
	return baseBackVowels(cluster)
}

const syllable = (
	cluster: Cluster,
	src: Language,
	params: {
		template: string
		currWord: string[]
		usedLongVowel: boolean
		usedDigraph: boolean
	},
) => {
	const { template, currWord, usedLongVowel, usedDigraph } = params
	// create a new syllable from template
	let prev = currWord.join("")
	let localLongVowel = usedLongVowel
	let localUsedDigraph = usedDigraph
	let built = ""
	for (const token of template) {
		const letter = token as PhonemeCatalog | typeof STOP_CHAR
		if (letter === STOP_CHAR) {
			built += src.stop
			continue
		}
		const phonemes =
			letter === PhonemeCatalog.END_VOWEL
				? endVowels(cluster, prev)
				: letter === PhonemeCatalog.END_CONSONANT
					? endConsonants(cluster, prev)
					: letter === PhonemeCatalog.BACK_VOWEL
						? backVowels(cluster)
						: cluster.phonemes[letter]

		let valid: typeof phonemes | undefined
		for (const phoneme of phonemes) {
			if (
				validLetter(src, {
					curr: phoneme.v,
					prev,
					type: letter,
					usedLongVowel: localLongVowel,
					usedDigraph: localUsedDigraph,
				})
			) {
				if (!valid) valid = []
				valid.push(phoneme)
			}
		}

		// Fallback when all candidates fail validation: still enforce the
		// long-vowel constraint so a second diphthong can never slip through.
		const fallbackPhonemes = (() => {
			const pool = phonemes.length > 0 ? phonemes : cluster.phonemes[letter]
			if (!localLongVowel) return pool
			const noLong = pool.filter((p) => !hasLongVowel(src, p.v))
			return noLong.length > 0 ? noLong : pool
		})()
		const selectedPhonemes =
			valid && valid.length > 0 ? valid : fallbackPhonemes
		const chosen = src.dice.weightedChoice<string>(selectedPhonemes) ?? ""
		prev += chosen
		if (hasLongVowel(src, chosen)) localLongVowel = true
		if (hasDigraph(src, chosen)) localUsedDigraph = true
		built += chosen
	}
	return built
}

const hasMorph = (cluster: Cluster, template: string, morph: string) => {
	for (const existing of cluster.morphemes[template]) {
		if (existing !== cluster.newSyl && existing === morph) return true
	}
	return false
}

const newMorph = (
	cluster: Cluster,
	src: Language,
	params: {
		template: string
		currWord: string[]
		usedLongVowel: boolean
		usedDigraph: boolean
	},
) => {
	const { template, currWord, usedLongVowel, usedDigraph } = params
	// create new syllable
	const prospect = syllable(cluster, src, {
		template,
		currWord,
		usedLongVowel,
		usedDigraph,
	})
	// add syllable to morpheme pattern list
	if (!hasMorph(cluster, template, prospect)) {
		cluster.morphemes[template].push(prospect)
	}
	return prospect
}

const morpheme = (
	cluster: Cluster,
	src: Language,
	params: {
		template: string
		word: string[]
		usedLongVowel: boolean
		usedDigraph: boolean
		repeat?: boolean
	},
) => {
	const { word, repeat, template } = params
	let { usedLongVowel, usedDigraph } = params
	// create morpheme distribution for pattern template if one doesn't already exist
	if (!cluster.morphemes[template]) {
		// each '*' is a chance to create a new morpheme
		// greater chance to create new morphemes for start sequences
		cluster.morphemes[template] = []
		const start: string[] = [
			PhonemeCatalog.START_CONSONANT,
			PhonemeCatalog.START_VOWEL,
		]
		if (start.includes(template[0])) {
			cluster.morphemes[template] = Array(cluster.variation).fill(
				cluster.newSyl,
			)
		} else {
			for (let i = 0; i < cluster.variation; i++) {
				newMorph(cluster, src, {
					template,
					currWord: word,
					usedLongVowel,
					usedDigraph,
				})
			}
			// add non-standard ('ah') endings if applicable
			const { hasHPhoneme } = getLanguageCache(src)
			if (
				cluster.key === "female" &&
				template.includes(PhonemeCatalog.END_CONSONANT) &&
				hasHPhoneme
			) {
				const partial = template.replace(
					`${PhonemeCatalog.BACK_VOWEL}${PhonemeCatalog.END_CONSONANT}`,
					"",
				)
				const prefix = CLUSTER.simple(cluster, src, partial).toLowerCase()
				for (const vowel of getLanguageCache(src).backAVowels) {
					cluster.morphemes[template].push(`${prefix}${vowel}h`)
				}
			}
		}
	}
	// valid morphemes haven't been already used and don't include used unique characters
	const prev = word.join("")
	const usedWords = new Set(word)
	const valid: string[] = []
	for (const curr of cluster.morphemes[template]) {
		if (
			curr === cluster.newSyl ||
			(!usedWords.has(curr) &&
				notHarsh(src, { curr, prev, usedLongVowel, usedDigraph }))
		) {
			valid.push(curr)
		}
	}
	const idx = ~~(src.dice.random * valid.length)
	let prospect = !valid[idx] || repeat ? cluster.newSyl : valid[idx]
	// create a new morpheme if none valid or '*' is chosen
	if (prospect === cluster.newSyl) {
		// add new morpheme
		prospect = newMorph(cluster, src, {
			template,
			currWord: word,
			usedLongVowel,
			usedDigraph,
		})
	}
	// prevent additional long vowels
	if (hasLongVowel(src, prospect)) {
		usedLongVowel = true
	}
	if (hasDigraph(src, prospect)) {
		usedDigraph = true
	}
	// add morpheme to used morpheme list
	word.push(prospect)
	return { usedLongVowel, usedDigraph }
}

export const CLUSTER = {
	endVowels,
	simple: (cluster: Cluster, src: Language, template: string) =>
		titleCase(
			syllable(cluster, src, {
				template,
				currWord: [],
				usedLongVowel: true,
				usedDigraph: true,
			}),
		),
	spawn: (args: Partial<Cluster> & { src: Language }) => {
		const { src } = args
		const vowelStruct = src.dice.choice([
			`${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`,
			`${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}`,
		])
		const conStruct = src.dice.choice([
			`${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}`,
			`${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`,
		])
		const cluster: Cluster = {
			phonemes: src.phonemes,
			morphemes: {},
			signature: {
				preferredPhonemes: {},
				templateStems: {},
				templateStemCount: 0,
				leadStemChance: 0,
				followStemChance: 0,
				phonemeBoost: 1,
			},
			newSyl: "*",
			key: args.key || "",
			ending: args.ending,
			stopChance: args.stopChance || 0,
			len: args.len || 2,
			variation: args.variation || 3,
			longNames: args.longNames || 0,
			patterns: {
				[PhonemeCatalog.MIDDLE_VOWEL]: vowelStruct,
				[PhonemeCatalog.MIDDLE_CONSONANT]: conStruct,
				[STOP_CHAR]:
					src.stop === "-"
						? `${PhonemeCatalog.MIDDLE_CONSONANT}${PhonemeCatalog.MIDDLE_VOWEL}${PhonemeCatalog.MIDDLE_CONSONANT}`
						: src.dice.choice([conStruct, vowelStruct]),
			},
		}
		if (args.key === "female") {
			const phonemes = clonePhonemes(args.src.phonemes)
			phonemes[PhonemeCatalog.BACK_VOWEL] = phonemes[
				PhonemeCatalog.BACK_VOWEL
			].filter(({ v }) => YI_VOWEL_SET.has(v))
			phonemes[PhonemeCatalog.END_CONSONANT] = phonemes[
				PhonemeCatalog.END_CONSONANT
			].filter(({ v }) => FEMININE_CONSONANT_SET.has(v))
			cluster.phonemes = phonemes
		}
		return cluster
	},
	morphemes: (cluster: Cluster, src: Language, repeat = false) => {
		// pick a pattern from the selected group
		const pattern = patternize(cluster, src)
		// create the word from cluster defined morphemes (reverse order favors double vowels at the end)
		let usedLongVowel = false
		let usedDigraph = false
		const morphemes: string[] = []
		pattern.forEach((template) => {
			const updates = morpheme(cluster, src, {
				template,
				repeat,
				word: morphemes,
				usedLongVowel,
				usedDigraph,
			})
			usedLongVowel = updates.usedLongVowel
			usedDigraph = updates.usedDigraph
		})
		return morphemes
	},
	vowel: (vowel: string) => {
		return ALL_VOWELS_SET.has(vowel)
	},
}
