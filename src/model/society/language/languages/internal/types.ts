import type {
	Language,
	WordParams,
	LanguageRng,
} from "@/model/society/language/languages/types"

export interface BuildSlotSeedParams {
	lang: Language
	key: string
	namespace: string
	slot: string
}

export interface SpawnClusterParams {
	lang: Language
	params: Pick<
		WordParams,
		"key" | "len" | "ending" | "stopChance" | "variation"
	>
	longNames?: number
}

export interface SpawnParams {
	seed: string
	dice: LanguageRng
}
