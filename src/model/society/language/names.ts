import { titleCase } from "@/model/shared/text"
import {
	CULTURE_GENDER_SYSTEM,
	type CultureGenderSystem,
	normalizeCultureGenderSystem,
	resolveLeaderGender,
} from "@/model/society/gender-system"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import { LANGUAGE } from "./languages"
import type { Language } from "./languages/types"

export interface LanguageNameLeaderEntry {
	time: number
	nameSeed?: number
	name?: string
}

export interface LanguageNameProvince {
	culture: number
	leaders?: LanguageNameLeaderEntry[]
}

export interface LanguageNameCulture {
	language: Language | null
	languageSeed?: number
	nameSeed?: number
	heritage?: number
	genderSystem?: CultureGenderSystem
	traditions?: readonly string[]
}

export interface LanguageNameHeritage {
	language: Language | null
	languageSeed?: number
	nameSeed?: number
}

export interface LanguageNameNation {
	id: number
	capital: number
	culture: number
	nameSeed?: number
	name?: string
}

export interface LanguageNameLandmark {
	culture: number
	nameSeed?: number
	name?: string
}

export interface LanguageNameRiver {
	province: number
	nameSeed?: number
	name?: string
}

export interface LanguageNameDynasty {
	name: string
}

export interface LanguageNameContext {
	provinces: readonly LanguageNameProvince[]
	cultures: readonly LanguageNameCulture[]
	heritages?: readonly LanguageNameHeritage[]
	landmarks?: readonly LanguageNameLandmark[]
	rivers?: readonly LanguageNameRiver[]
	nations?: readonly LanguageNameNation[]
	dynasties?: readonly LanguageNameDynasty[]
}

export interface LanguageNames {
	province(provinceIdx: number): string
	nation(capitalIdx: number): string
	culture(cultureIdx: number): string
	heritage(heritageIdx: number): string
	landmark(landmarkIdx: number): string
	river(provinceIdx: number): string
	mountain(provinceIdx: number): string
	leader(provinceIdx: number, time: number): string
	dynasty(dynastyIdx: number): string
	clear(): void
}

function getLanguage(
	context: LanguageNameContext,
	provinceIdx: number,
): Language | null {
	const province = context.provinces[provinceIdx]
	if (!province || province.culture < 0) return null
	return getCultureLanguage(context, province.culture)
}

function spawnSeededLanguage(seed: number, namespace: string): Language {
	return LANGUAGE.spawn(`${namespace}:${seed}`)
}

function getHeritageLanguage(
	context: LanguageNameContext,
	heritageIdx: number,
): Language | null {
	const heritage = context.heritages?.[heritageIdx]
	if (!heritage) return null
	if (heritage.language) return heritage.language
	if (heritage.languageSeed == null) return null
	heritage.language = spawnSeededLanguage(heritage.languageSeed, "heritage")
	return heritage.language
}

function getCultureLanguage(
	context: LanguageNameContext,
	cultureIdx: number,
): Language | null {
	const culture = context.cultures[cultureIdx]
	if (!culture) return null
	if (culture.language) return culture.language

	const seed = culture.languageSeed
	if (seed == null) return null

	const heritageIdx = culture.heritage ?? -1
	const heritageLanguage =
		heritageIdx >= 0 ? getHeritageLanguage(context, heritageIdx) : null
	culture.language = heritageLanguage
		? LANGUAGE.dialect(heritageLanguage, seed)
		: spawnSeededLanguage(seed, "culture")
	return culture.language
}

function getLeaderEntry(
	province: LanguageNameProvince | undefined,
	time: number,
): LanguageNameLeaderEntry | undefined {
	if (!province?.leaders?.length) return undefined
	for (let i = province.leaders.length - 1; i >= 0; i--) {
		if (province.leaders[i].time <= time) return province.leaders[i]
	}
	return undefined
}

function buildNationSlot(
	nation: LanguageNameNation | undefined,
	capitalIdx: number,
): string {
	if (!nation) return `nation:${capitalIdx}`
	return `nation:${nation.id}:${nation.nameSeed ?? nation.id}`
}

function buildNamedGroupSlot(
	namespace: string,
	index: number,
	nameSeed: number | undefined,
): string {
	return `${namespace}:${index}:${nameSeed ?? index}`
}

function buildLeaderSlot(
	provinceIdx: number,
	entry: LanguageNameLeaderEntry,
): string {
	return entry.nameSeed == null
		? `leader:${provinceIdx}:${entry.time}`
		: buildNamedGroupSlot("leader", provinceIdx, entry.nameSeed)
}

function getCultureGenderSystem(
	culture: LanguageNameCulture | undefined,
): CultureGenderSystem {
	if (culture?.genderSystem != null) return culture.genderSystem
	return culture?.traditions?.includes("matriarchal_society")
		? CULTURE_GENDER_SYSTEM.MATRIARCHAL
		: CULTURE_GENDER_SYSTEM.PATRIARCHAL
}

export function createNames(context: LanguageNameContext): LanguageNames {
	const provinceNames = new Map<number, string>()
	const nationNames = new Map<number, string>()
	const cultureNames = new Map<number, string>()
	const heritageNames = new Map<number, string>()
	const landmarkNames = new Map<number, string>()
	const riverNames = new Map<number, string>()
	const mountainNames = new Map<number, string>()
	const nationById = new Map(
		context.nations?.map((nation) => [nation.id, nation]) ?? [],
	)

	function cachedName(
		cache: Map<number, string>,
		index: number,
		key: string,
		namespace: string,
		fallback: string,
	): string {
		const cached = cache.get(index)
		if (cached) return cached

		const lang = getLanguage(context, index)
		if (!lang) return fallback

		const name = titleCase(
			LANGUAGE.word.simple({
				lang,
				key,
				namespace,
				slot: `${namespace}:${index}`,
			}).word,
		)
		cache.set(index, name)
		return name
	}

	function cachedScopedName(params: {
		cache: Map<number, string>
		index: number
		key: string
		namespace: string
		slot: string
		lang: Language | null
		fallback: string
		onNamed?: (name: string) => void
	}): string {
		const { cache, index, key, namespace, slot, lang, fallback, onNamed } =
			params
		const cached = cache.get(index)
		if (cached) return cached
		if (!lang) return fallback
		const name = titleCase(
			LANGUAGE.word.simple({
				lang,
				key,
				namespace,
				slot,
			}).word,
		)
		cache.set(index, name)
		onNamed?.(name)
		return name
	}

	function cachedNationName(capitalIdx: number): string {
		const nation = nationById.get(capitalIdx)
		const lang =
			nation && nation.culture >= 0
				? getCultureLanguage(context, nation.culture)
				: (getLanguage(context, capitalIdx) ??
					(capitalIdx >= 0 ? spawnSeededLanguage(capitalIdx, "nation") : null))
		return cachedScopedName({
			cache: nationNames,
			index: capitalIdx,
			key: "region",
			namespace: "nation",
			slot: buildNationSlot(nation, capitalIdx),
			lang,
			fallback: `#${capitalIdx}`,
			onNamed: (name) => {
				if (nation) nation.name = name
			},
		})
	}

	function cachedCultureName(cultureIdx: number): string {
		const culture = context.cultures[cultureIdx]
		return cachedScopedName({
			cache: cultureNames,
			index: cultureIdx,
			key: "culture",
			namespace: "culture",
			slot: buildNamedGroupSlot("culture", cultureIdx, culture?.nameSeed),
			lang: getCultureLanguage(context, cultureIdx),
			fallback: `Culture #${cultureIdx}`,
		})
	}

	function cachedHeritageName(heritageIdx: number): string {
		const heritage = context.heritages?.[heritageIdx]
		return cachedScopedName({
			cache: heritageNames,
			index: heritageIdx,
			key: "culture",
			namespace: "heritage",
			slot: buildNamedGroupSlot("heritage", heritageIdx, heritage?.nameSeed),
			lang: getHeritageLanguage(context, heritageIdx),
			fallback: `Heritage #${heritageIdx}`,
		})
	}

	function cachedLandmarkName(landmarkIdx: number): string {
		const landmark = context.landmarks?.[landmarkIdx]
		if (landmark?.name) {
			landmarkNames.set(landmarkIdx, landmark.name)
			return landmark.name
		}
		const cultureIdx = landmark?.culture ?? -1
		return cachedScopedName({
			cache: landmarkNames,
			index: landmarkIdx,
			key: "region",
			namespace: "landmark",
			slot: buildNamedGroupSlot("landmark", landmarkIdx, landmark?.nameSeed),
			lang: cultureIdx >= 0 ? getCultureLanguage(context, cultureIdx) : null,
			fallback: `#${landmarkIdx}`,
			onNamed: (name) => {
				if (landmark) landmark.name = name
			},
		})
	}

	return {
		province: (provinceIdx: number) =>
			cachedName(
				provinceNames,
				provinceIdx,
				"settlement",
				"province",
				`#${provinceIdx}`,
			),
		nation: cachedNationName,
		culture: cachedCultureName,
		heritage: cachedHeritageName,
		landmark: cachedLandmarkName,
		river: (riverIdx: number) => {
			const river = context.rivers?.[riverIdx]
			if (river?.name) {
				riverNames.set(riverIdx, river.name)
				return river.name
			}
			if (!context.rivers) {
				return cachedName(
					riverNames,
					riverIdx,
					"river",
					"river",
					`River #${riverIdx}`,
				)
			}
			const provinceIdx = river?.province ?? -1
			return cachedScopedName({
				cache: riverNames,
				index: riverIdx,
				key: "river",
				namespace: "river",
				slot: buildNamedGroupSlot("river", riverIdx, river?.nameSeed),
				lang: provinceIdx >= 0 ? getLanguage(context, provinceIdx) : null,
				fallback: "Unknown",
				onNamed: (name) => {
					if (river) river.name = name
				},
			})
		},
		mountain: (provinceIdx: number) =>
			cachedName(
				mountainNames,
				provinceIdx,
				"mountain",
				"mountain",
				`Mount #${provinceIdx}`,
			),
		leader: (provinceIdx: number, time: number) => {
			const province = context.provinces[provinceIdx]
			if (!province || province.culture < 0) return `Leader #${provinceIdx}`

			const leaderEntry = getLeaderEntry(province, time)
			if (!leaderEntry) return `Leader #${provinceIdx}`
			if (leaderEntry.name) return leaderEntry.name

			const culture = context.cultures[province.culture]
			const lang = culture
				? getCultureLanguage(context, province.culture)
				: null
			if (!lang) return `Leader #${provinceIdx}`

			const key =
				resolveLeaderGender(
					getCultureGenderSystem(culture),
					leaderEntry.nameSeed ?? leaderEntry.time ?? provinceIdx,
				) === "female"
					? "female"
					: "male"
			const name = titleCase(
				LANGUAGE.word.simple({
					lang,
					key,
					namespace: "leader",
					slot: buildLeaderSlot(provinceIdx, leaderEntry),
				}).word,
			)
			leaderEntry.name = name
			return name
		},
		dynasty: (dynastyIdx: number) => {
			const dynasty = context.dynasties?.[dynastyIdx]
			if (!dynasty) return `Dynasty #${dynastyIdx}`
			return dynasty.name
		},
		clear: () => {
			provinceNames.clear()
			nationNames.clear()
			cultureNames.clear()
			heritageNames.clear()
			landmarkNames.clear()
			riverNames.clear()
			mountainNames.clear()
		},
	}
}

export const NAMES = {
	create: createNames,
}

export function createWorldNames(
	world: Partial<
		Pick<
			SerializedGenesisWorld,
			| "provinces"
			| "cultures"
			| "heritages"
			| "landmarks"
			| "nations"
			| "rivers"
		>
	>,
): LanguageNames {
	const provinceCount = world.provinces?.count ?? 0
	const cultureCount = world.cultures?.count ?? 0
	const heritageCount = world.heritages?.count ?? 0
	const cultures: LanguageNameCulture[] = Array.from(
		{ length: cultureCount },
		(_, cultureIdx): LanguageNameCulture => ({
			language: null,
			languageSeed: world.cultures?.languageSeeds?.[cultureIdx],
			nameSeed: world.cultures?.nameSeeds?.[cultureIdx],
			heritage: world.heritages?.assignment[cultureIdx] ?? -1,
			genderSystem:
				world.cultures?.genderSystems &&
				cultureIdx < world.cultures.genderSystems.length
					? normalizeCultureGenderSystem(
							world.cultures.genderSystems[cultureIdx],
						)
					: undefined,
		}),
	)
	const heritages: LanguageNameHeritage[] = Array.from(
		{ length: heritageCount },
		(_, heritageIdx): LanguageNameHeritage => ({
			language: null,
			languageSeed: world.heritages?.languageSeeds?.[heritageIdx],
			nameSeed: world.heritages?.nameSeeds?.[heritageIdx],
		}),
	)
	const landmarks: LanguageNameLandmark[] = Array.from(
		{ length: world.landmarks?.count ?? 0 },
		(_, landmarkIdx): LanguageNameLandmark => ({
			culture: world.landmarks?.dominantCulture?.[landmarkIdx] ?? -1,
			nameSeed: world.landmarks?.nameSeeds?.[landmarkIdx],
			name: world.landmarks?.realNames?.[landmarkIdx] ?? undefined,
		}),
	)
	const riverProvinceById = new Map<number, number>()
	if (world.rivers?.riverId && world.provinces?.regionProvince) {
		const riverIdArr = world.rivers.riverId
		const regionProvince = world.provinces.regionProvince
		for (let regionIdx = 0; regionIdx < riverIdArr.length; regionIdx++) {
			const riverId = riverIdArr[regionIdx] ?? -1
			if (riverId < 0) continue
			// Stop only once we've found a province with a usable culture
			const existing = riverProvinceById.get(riverId)
			if (existing !== undefined) {
				const existingCulture = world.cultures?.assignment?.[existing] ?? -1
				if (existingCulture >= 0) continue
			}
			const provinceIdx = regionProvince[regionIdx] ?? -1
			if (provinceIdx >= 0) riverProvinceById.set(riverId, provinceIdx)
		}
	}
	const riverCount =
		world.rivers?.riverId && world.rivers.riverId.length > 0
			? world.rivers.riverId.reduce(
					(max, riverId) => (riverId > max ? riverId : max),
					-1,
				) + 1
			: 0
	const rivers: LanguageNameRiver[] = Array.from(
		{ length: riverCount },
		(_, riverIdx): LanguageNameRiver => ({
			province: riverProvinceById.get(riverIdx) ?? -1,
			name: world.rivers?.riverNames?.[riverIdx] ?? undefined,
		}),
	)
	const provinces = Array.from({ length: provinceCount }, (_, provinceIdx) => ({
		culture: world.cultures?.assignment[provinceIdx] ?? -1,
	}))
	const nations: LanguageNameNation[] = Array.from(
		{ length: world.nations?.seeds.length ?? 0 },
		(_, nationIdx): LanguageNameNation => {
			const capital = world.nations?.seeds[nationIdx] ?? -1
			return {
				id: capital,
				capital,
				culture:
					capital >= 0 ? (world.cultures?.assignment[capital] ?? -1) : -1,
				nameSeed: world.nations?.nameSeeds?.[nationIdx],
			}
		},
	)
	return createNames({
		provinces,
		cultures,
		heritages,
		landmarks,
		rivers,
		nations,
	})
}
