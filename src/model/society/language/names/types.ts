import type {
	LanguageNameContext,
	LanguageNameLeaderEntry,
	LanguageNameNation,
	LanguageNameProvince,
} from "@/model/society/language/names"

export interface GetLanguageParams {
	context: LanguageNameContext
	provinceIdx: number
}

export interface SpawnSeededLanguageParams {
	seed: number
	namespace: string
}

export interface GetHeritageLanguageParams {
	context: LanguageNameContext
	heritageIdx: number
}

export interface GetCultureLanguageParams {
	context: LanguageNameContext
	cultureIdx: number
}

export interface GetReligionLanguageParams {
	context: LanguageNameContext
	religionIdx: number
}

export interface GetLeaderEntryParams {
	province: LanguageNameProvince | undefined
	time: number
}

export interface BuildNationSlotParams {
	nation: LanguageNameNation | undefined
	capitalIdx: number
}

export interface BuildNamedGroupSlotParams {
	namespace: string
	index: number
	nameSeed: number | undefined
}

export interface BuildLeaderSlotParams {
	provinceIdx: number
	entry: LanguageNameLeaderEntry
}

export interface DynastyNameParams {
	dynastyIdx: number
	province: number
}

export interface RulerNameParams {
	province: number
	nameSeed: number
}

export interface RulerName {
	name: string
	female: boolean
}
