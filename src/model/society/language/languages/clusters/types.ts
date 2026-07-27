import type {
	Cluster,
	Language,
} from "@/model/society/language/languages/types"

export interface HasSegmentMatchParams {
	prospect: string
	candidates: readonly string[]
}

export interface FindLastNonVowelCharParams {
	value: string
	vowelSet: ReadonlySet<string>
}

export interface TrailingVowelCountParams {
	value: string
	vowelSet: ReadonlySet<string>
}

export interface LeadingVowelCountParams {
	value: string
	vowelSet: ReadonlySet<string>
}

export interface WordLengthParams {
	cluster: Cluster
	src: Language
}

export interface BasePatternizeParams {
	cluster: Cluster
	src: Language
}

export interface FemininePatternParams {
	cluster: Cluster
	src: Language
}

export interface PatternizeParams {
	cluster: Cluster
	src: Language
}

export interface NotHarshParams {
	src: Language
	params: {
		curr: string
		prev: string
		usedLongVowel: boolean
		usedDigraph: boolean
	}
}

export interface ValidLetterParams {
	src: Language
	params: {
		curr: string
		prev: string
		type: string
		usedLongVowel: boolean
		usedDigraph: boolean
	}
}

export interface HasLongVowelParams {
	src: Language
	prospect: string
}

export interface HasDigraphParams {
	src: Language
	prospect: string
}

export interface FeminineEndVowelsParams {
	cluster: Cluster
	prev: string
}

export interface EndVowelsParams {
	cluster: Cluster
	prev: string
}

export interface MasculineEndConsonantsParams {
	cluster: Cluster
	prev: string
}

export interface EndConsonantsParams {
	cluster: Cluster
	prev: string
}

export interface SyllableParams {
	cluster: Cluster
	src: Language
	params: {
		template: string
		currWord: string[]
		usedLongVowel: boolean
		usedDigraph: boolean
	}
}

export interface HasMorphParams {
	cluster: Cluster
	template: string
	morph: string
}

export interface NewMorphParams {
	cluster: Cluster
	src: Language
	params: {
		template: string
		currWord: string[]
		usedLongVowel: boolean
		usedDigraph: boolean
	}
}

export interface MorphemeParams {
	cluster: Cluster
	src: Language
	params: {
		template: string
		word: string[]
		usedLongVowel: boolean
		usedDigraph: boolean
		repeat?: boolean
	}
}
