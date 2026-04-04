import { Dice } from "../../../../utilities/dice"
import { OrthoStyle, PhonemeCatalog, PhonemeClass } from "../types"
import { validTerms } from "."

// Consonants (pre-orthography) that belong to each phoneme class
const classMembers: Record<PhonemeClass, string[]> = {
	nasal: ["m", "n", "ŋ"],
	liquid: ["l", "r"],
	sibilant: ["s", "z", "ʃ", "ʒ"],
	guttural: ["g", "k", "x"],
	plosive: ["p", "t", "b", "d"],
	airy: ["h", "f", "ð"],
}

// Triple the frequency of consonants (or clusters starting with them) that match the class
const biasPool = (pool: string[], cls: PhonemeClass): string[] => {
	const preferred = classMembers[cls]
	const matching = pool.filter((c) => preferred.some((p) => c.startsWith(p)))
	return [...pool, ...matching, ...matching]
}

const orthography = (
	dice: Dice,
): {
	ortho: Record<string, string>
	diacriticConsonants: boolean
	orthoStyle: OrthoStyle
} => {
	const style = dice.weightedChoice([
		{ v: "standard" as const, w: 0.83 },
		{ v: "hacek" as const, w: 0.05 },
		{ v: "tilde" as const, w: 0.04 },
		{ v: "acute" as const, w: 0.04 },
		{ v: "circumflex" as const, w: 0.04 },
	])
	if (style === "hacek") {
		// Slavic-style háček orthography: š č ž; optionally one extra consonant gets a caron
		const extraKey = dice.weightedChoice([
			{ v: "" as const, w: 0.5 },
			{ v: "r" as const, w: 0.2 },
			{ v: "n" as const, w: 0.2 },
			{ v: "d" as const, w: 0.1 },
		])
		const extras: Record<string, string> = { r: "ř", n: "ň", d: "ď" }

		return {
			orthoStyle: style,
			diacriticConsonants: true,
			ortho: {
				ŋ: "ng",
				ð: dice.weightedChoice([
					{ v: "dh", w: 0.65 },
					{ v: "đ", w: 0.35 },
				]),
				ʃ: "š",
				ʧ: "č",
				ʒ: "ž",
				...(extraKey ? { [extraKey]: extras[extraKey] } : {}),
			},
		}
	}

	if (style === "tilde") {
		return {
			orthoStyle: style,
			diacriticConsonants: true,
			ortho: {
				ŋ: "ñ",
				ð: dice.weightedChoice([
					{ v: "th", w: 0.75 },
					{ v: "dh", w: 0.25 },
				]),
				ʃ: dice.weightedChoice([
					{ v: "sh", w: 0.85 },
					{ v: "x", w: 0.15 },
				]),
				ʧ: dice.weightedChoice([
					{ v: "ch", w: 0.85 },
					{ v: "q", w: 0.15 },
				]),
				ʒ: "zh",
			},
		}
	}

	if (style === "acute") {
		// Acute/palatalized-looking style: ś ć ź (+ optional ń)
		const useNAcute = dice.weightedChoice([
			{ v: true, w: 0.45 },
			{ v: false, w: 0.55 },
		])

		// Eth-like sound can stay as digraph; acute systems often look best when not overloading
		const ethForm = dice.weightedChoice([
			{ v: "dh", w: 0.55 },
			{ v: "th", w: 0.3 },
			{ v: "đ", w: 0.15 },
		])

		return {
			orthoStyle: style,
			diacriticConsonants: true,
			ortho: {
				ŋ: dice.weightedChoice([
					{ v: "ng", w: 0.85 },
					{ v: "ńg", w: 0.15 },
				]),
				ð: ethForm,
				ʃ: "ś",
				ʧ: "ć",
				ʒ: "ź",
				...(useNAcute ? { n: "ń" } : {}),
			},
		}
	}

	if (style === "circumflex") {
		// Esperanto-like but generalized: ŝ ĉ ĵ (+ optional ĝ/ĥ)
		const extra = dice.weightedChoice([
			{ v: "" as const, w: 0.6 },
			{ v: "g" as const, w: 0.25 },
			{ v: "h" as const, w: 0.15 },
		])

		return {
			orthoStyle: style,
			diacriticConsonants: true,
			ortho: {
				ŋ: dice.weightedChoice([
					{ v: "ng", w: 0.9 },
					{ v: "ĝ", w: 0.1 },
				]),
				ð: dice.weightedChoice([
					{ v: "dh", w: 0.8 },
					{ v: "ĝ", w: 0.2 },
				]),
				ʃ: "ŝ",
				ʧ: "ĉ",
				ʒ: "ĵ",
				...(extra === "g" ? { g: "ĝ" } : {}),
				...(extra === "h" ? { h: "ĥ" } : {}),
			},
		}
	}

	// standard digraph-heavy orthography
	return {
		orthoStyle: style,
		diacriticConsonants: false,
		ortho: {
			ŋ: "ng",
			ð: "th",
			ʃ: dice.weightedChoice([
				{ v: "sh", w: 0.9 },
				{ v: "x", w: 0.1 },
			]),
			ʧ: dice.weightedChoice([
				{ v: "ch", w: 0.9 },
				{ v: "q", w: 0.1 },
			]),
			ʒ: "zh",
		},
	}
}

const mapOrtho = (ortho: Record<string, string>, sounds: string[]) =>
	sounds.map((c) =>
		c
			.split("")
			.map((l) => ortho[l] || l)
			.join(""),
	)

export const buildConsonants = (params: {
	ending: PhonemeCatalog
	vowels: string[]
	phonemeClass: PhonemeClass
	dice: Dice
}) => {
	const { ortho, diacriticConsonants, orthoStyle } = orthography(params.dice)
	const k = params.dice.weightedChoice([
		{ v: "k", w: 0.4 },
		{ v: "c", w: 0.4 },
		{ v: "q", w: 0.2 },
	])
	const j = params.dice.weightedChoice([
		{ v: "y", w: params.vowels.includes("y") ? 0 : 0.3 },
		{ v: "j", w: 0.7 },
	])
	const essentials = ["n"].concat(params.dice.choice("rl".split("")))
	const basePool = `bdfgh${j + k + k}lmprsstvwxzŋðʃʧʒ`
		.split("")
		.filter((c) => c !== "ŋ" || orthoStyle !== "tilde")
	const startConsonants = [
		...essentials,
		...params.dice.sample(biasPool(basePool, params.phonemeClass), 12),
	]
	const middleConsonants = params.dice.sample(
		Array.from(new Set(startConsonants)).filter((c) => c !== "c"),
		6,
	)
	if (orthoStyle === "tilde") middleConsonants.push("ŋ")
	const endConsonants = params.dice
		.sample(
			"cddfggjkkllmmnnpqrrsstŋŋxzzððʃʧ"
				.split("")
				.filter((c) => middleConsonants.includes(c)), // cSpell:ignore cddfggjkkllmmnnpqrrsstŋŋxzzððʃʧ
			4,
		)
		.concat(essentials)
	const common = endConsonants.filter((c) => "lnrs".includes(c))
	endConsonants.push(...common)
	middleConsonants.push(...common)
	const strict = middleConsonants.concat(endConsonants)
	const invalidLeads = ["c", "ŋ"]
	const lead = startConsonants.filter((c) => !invalidLeads.includes(c))
	const mLead = params.dice.sample(
		biasPool(
			validTerms(
				[
					"bh",
					"bj",
					"br",
					"br",
					"bw",
					"cv",
					"cz",
					"dh",
					"dh",
					"dh",
					"dr",
					"dr",
					"dz",
					"dw",
					"fh",
					"fj",
					"fr",
					"gh",
					"gr",
					"gw",
					"gw",
					"gx",
					"hj",
					"hl",
					"hm",
					"hr",
					"hw",
					"hv",
					"hz",
					"jh",
					"kh",
					"kh",
					"kh",
					"khm",
					"kj",
					"kr",
					"kw",
					"kx",
					"lh",
					"mh",
					"nz",
					"ph",
					"pr",
					"qh",
					"qr",
					"rh",
					"rw",
					"sk",
					"st",
					"str",
					"sv",
					"sw",
					"sz",
					"tr",
					"ts",
					"tw",
					"tz",
					"vh",
					"vr",
					"wr",
					"xh",
					"ym",
					"ys",
					"ysg",
					"ysgr",
					"zr",
					"zv",
					"zw",
					"ðr",
					"ʧr",
					...(params.vowels.includes("u") ? [] : ["cl"]),
				],
				strict,
			),
			params.phonemeClass,
		),
		params.dice.randint(0, 3),
	)
	const mMid = validTerms(
		[
			"bl",
			"br",
			"cn",
			"cr",
			"cs",
			"cw",
			"cz",
			"dh",
			"dhr",
			"dj",
			"dl",
			"dr",
			"dr",
			"ds",
			"dv",
			"dw",
			"dx",
			"dz",
			"dð",
			"dʃ",
			"fg",
			"fj",
			"fn",
			"gf",
			"gh",
			"ghr",
			"gj",
			"gl",
			"gm",
			"gn",
			"gq",
			"gr",
			"gs",
			"gv",
			"gw",
			"gx",
			"gz",
			"gʒ",
			"gð",
			"gʃ",
			"gʧ",
			"hj",
			"hk",
			"hl",
			"hm",
			"hn",
			"hnr",
			"hr",
			"hrj",
			"ht",
			"jh",
			"jm",
			"jn",
			"jr",
			"jð",
			"jʃ",
			"kd",
			"kdr",
			"kh",
			"khl",
			"khr",
			"kj",
			"kl",
			"km",
			"kn",
			"kr",
			"ks",
			"kt",
			"kw",
			"kx",
			"kz",
			"kð",
			"kʃ",
			"lb",
			"lbr",
			"ld",
			"ld",
			"ld",
			"ldh",
			"ldm",
			"ldr",
			"ldr",
			"ldr",
			"ldw",
			"ldv",
			"ldz",
			"lf",
			"lg",
			"lgr",
			"lh",
			"lhg",
			"lj",
			"lk",
			"lkh",
			"lm",
			"ln",
			"lr",
			"ls",
			"lt",
			"lv",
			"lw",
			"lx",
			"lz",
			"lʒ",
			"lð",
			"lʃ",
			"lʧ",
			"mb",
			"mbr",
			"md",
			"mdr",
			"mg",
			"mgr",
			"mh",
			"mj",
			"mk",
			"mr",
			"ms",
			"mv",
			"mx",
			"mz",
			"mð",
			"mʧ",
			"mʃ",
			"nb",
			"nbr",
			"nc",
			"nd",
			"nd",
			"ndh",
			"ndl",
			"ndm",
			"ndr",
			"ndr",
			"nf",
			"nh",
			"nj",
			"nk",
			"nkh",
			"nm",
			"nr",
			"ns",
			"nsk",
			"nst",
			"nstr",
			"nsw",
			"nt",
			"nw",
			"nv",
			"nx",
			"ny",
			"nz",
			"nʒ",
			"nð",
			"nðr",
			"nʃ",
			"nʧ",
			"qh",
			"qm",
			"qn",
			"qr",
			"qw",
			"qx",
			"qz",
			"qʒ",
			"qð",
			"qʃ",
			"rc",
			"rd",
			"rd",
			"rdr",
			"rdh",
			"rdl",
			"rg",
			"rh",
			"rj",
			"rk",
			"rkh",
			"rl",
			"rm",
			"rn",
			"rnh",
			"rph",
			"rq",
			"rs",
			"rsk",
			"rst",
			"rv",
			"rw",
			"rx",
			"rz",
			"rzb",
			"rʒ",
			"rzm",
			"rð",
			"rʃ",
			"rʧ",
			"sd",
			"sdr",
			"sf",
			"sg",
			"sgr",
			"sk",
			"skh",
			"sl",
			"sm",
			"sr",
			"st",
			"str",
			"stv",
			"sv",
			"sw",
			"sx",
			"sz",
			"szk",
			"sʧ",
			"tl",
			"tr",
			"ts",
			"tz",
			"vd",
			"vf",
			"vg",
			"vh",
			"vj",
			"vn",
			"vr",
			"vs",
			"vsk",
			"vx",
			"vz",
			"vʒ",
			"wb",
			"wh",
			"wk",
			"wr",
			"xb",
			"xbr",
			"xd",
			"xdr",
			"xg",
			"xh",
			"xj",
			"xk",
			"xm",
			"xn",
			"xr",
			"xv",
			"xz",
			"xʒ",
			"xð",
			"xʃ",
			"zb",
			"zd",
			"zdr",
			"ʒn",
			"zgr",
			"zj",
			"zk",
			"zl",
			"zm",
			"zn",
			"zr",
			"zs",
			"zx",
			"zð",
			"zʃ",
			"ðdr",
			"ðd",
			"ðg",
			"ðl",
			"ðm",
			"ðn",
			"ðr",
			"ðr",
			"ðx",
			"ðz",
			"ŋd",
			"ŋdr",
			"ŋg",
			"ŋgr",
			"ŋgw",
			"ŋh",
			"ŋj",
			"ŋk",
			"ŋm",
			"ŋn",
			"ŋr",
			"ŋs",
			"ŋsk",
			"ŋt",
			"ŋw",
			"ŋx",
			"ŋz",
			"ŋʒ",
			"ŋʃ",
			"ŋʧ",
			"ŋð",
			"ʃg",
			"ʃh",
			"ʃj",
			"ʃjr",
			"ʃk",
			"ʃm",
			"ʃn",
			"ʃr",
			"ʃt",
			"ʃw",
			"ʃx",
			"ʃz",
			"ʧb",
			"ʧn",
			"ʧr",
		],
		strict,
	)
	const complexG = [
		"ddh",
		"ddr",
		"drr",
		"ggdr",
		"ggm",
		"ggr",
		"ggs",
		"ggʒ",
		"gmm",
		"kkh",
		"kkm",
		"kkr",
		"llm",
		"nŋ",
		"sgg",
		"sggr",
		"ssk",
		"ssm",
		"ssr",
		"sʃ",
	]
	const baseG = [
		"cc",
		"dd",
		"ff",
		"gg",
		"kk",
		"ll",
		"mm",
		"nn",
		"pp",
		"rr",
		"ss",
		"tt",
		"zz",
	]
	const dMid = validTerms(
		params.ending === PhonemeCatalog.MIDDLE_CONSONANT
			? [...complexG, ...baseG]
			: baseG,
		strict,
	)
	const gemination = params.dice
		.sample(dMid, params.dice.randint(1, 6))
		.concat(params.dice.sample(dMid, params.dice.randint(1, 6)))
	const complexMid =
		params.ending === PhonemeCatalog.MIDDLE_CONSONANT
			? params.dice.weightedChoice([
					{ w: 0.9, v: params.dice.sample(mMid, params.dice.randint(0, 12)) },
					{ w: 0.1, v: gemination },
				])
			: params.dice.weightedChoice([
					{ w: 0.6, v: gemination },
					{ w: 0.4, v: [] },
				])
	const mEnd = params.dice.sample(
		validTerms(
			[
				"ld",
				"ld",
				"ld",
				"lf",
				"lf",
				"lt",
				"lm",
				"msk",
				"nc",
				"nd",
				"nd",
				"nj",
				"nk",
				"nsk",
				"nx",
				"nz",
				"nð",
				"ph",
				"rc",
				"rd",
				"rd",
				"rg",
				"rj",
				"rl",
				"rm",
				"rn",
				"rp",
				"rsk",
				"rx",
				"rz",
				"sk",
				"tl",
				"vsk",
				"wk",
				"ŋsk",
				"v",
				...(params.vowels.includes("u") ? [] : ["nt"]),
			],
			strict,
		),
		params.dice.randint(0, 3),
	)
	const consonantPhonemes = {
		[PhonemeCatalog.START_CONSONANT]: mapOrtho(ortho, [
			...lead,
			...lead,
			...mLead,
		]),
		[PhonemeCatalog.MIDDLE_CONSONANT]: mapOrtho(ortho, [
			...middleConsonants,
			...middleConsonants,
			...complexMid,
		]),
		[PhonemeCatalog.END_CONSONANT]: mapOrtho(ortho, [
			...endConsonants,
			...endConsonants,
			...mEnd,
		]),
	}

	const hasTilde = Object.values(consonantPhonemes).some((list) =>
		list.some((c) => c.includes("ñ")),
	)

	return {
		diacriticConsonants:
			orthoStyle === "tilde" && !hasTilde ? false : diacriticConsonants,
		orthoStyle: orthoStyle === "tilde" && !hasTilde ? "standard" : orthoStyle,
		consonantPhonemes,
	}
}
