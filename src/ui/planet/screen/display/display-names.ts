import {
	normalizeCultureGenderSystem,
	resolveLeaderGender,
} from "@/model/society/gender-system"
import { LANGUAGE } from "@/model/society/language/languages"
import type { Language } from "@/model/society/language/languages/types"
import {
	createWorldNames,
	type LanguageNameContext,
	type LanguageNameCulture,
	type LanguageNameHeritage,
	type LanguageNameLeaderEntry,
	type LanguageNameProvince,
	type LanguageNames,
} from "@/model/society/language/names"
import type {
	SerializedGenesisWorld,
	SerializedProvinceTimelineInt,
} from "@/model/transport/worker-types"
import type { TimelineBundle } from "../history/history-query"

function getHeritageLanguage(
	context: LanguageNameContext,
	heritageIdx: number,
): Language | null {
	const heritage = context.heritages?.[heritageIdx]
	if (!heritage) return null
	if (heritage.language) return heritage.language
	if (heritage.languageSeed == null) return null
	heritage.language = LANGUAGE.spawn(`heritage:${heritage.languageSeed}`)
	return heritage.language
}

function getCultureLanguage(
	context: LanguageNameContext,
	cultureIdx: number,
): Language | null {
	const culture = context.cultures[cultureIdx]
	if (!culture) return null
	if (culture.language) return culture.language
	if (culture.languageSeed == null) return null
	const heritageLanguage =
		(culture.heritage ?? -1) >= 0
			? getHeritageLanguage(context, culture.heritage as number)
			: null
	culture.language = heritageLanguage
		? LANGUAGE.dialect(heritageLanguage, culture.languageSeed)
		: LANGUAGE.spawn(`culture:${culture.languageSeed}`)
	return culture.language
}

function buildNameContext(
	world: SerializedGenesisWorld,
	leaderEntries: LanguageNameLeaderEntry[][],
): LanguageNameContext {
	const provinceCount = world.provinces?.count ?? 0
	const cultures: LanguageNameCulture[] = Array.from(
		{ length: world.cultures?.count ?? 0 },
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
		{ length: world.heritages?.count ?? 0 },
		(_, heritageIdx): LanguageNameHeritage => ({
			language: null,
			languageSeed: world.heritages?.languageSeeds?.[heritageIdx],
			nameSeed: world.heritages?.nameSeeds?.[heritageIdx],
		}),
	)
	const provinces: LanguageNameProvince[] = Array.from(
		{ length: provinceCount },
		(_, provinceIdx): LanguageNameProvince => ({
			culture: world.cultures?.assignment[provinceIdx] ?? -1,
			leaders: leaderEntries[provinceIdx],
		}),
	)
	return {
		provinces,
		cultures,
		heritages,
	}
}

function buildLeaderSlot(
	provinceIdx: number,
	entry: LanguageNameLeaderEntry,
): string {
	return entry.nameSeed == null
		? `leader:${provinceIdx}:${entry.time}`
		: `leader:${provinceIdx}:${entry.nameSeed}`
}

function readTimelineValue(
	times: Float64Array,
	values: ArrayLike<number>,
	start: number,
	end: number,
	defaultValue: number,
	time: number,
): number {
	let lo = start
	let hi = end - 1
	let answer = defaultValue
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		if (times[mid] <= time) {
			answer = values[mid]
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return answer
}

function readProvinceInt(
	field: SerializedProvinceTimelineInt,
	province: number,
	time: number,
	defaultValue: number,
): number {
	return readTimelineValue(
		field.times,
		field.values,
		field.offsets[province],
		field.offsets[province + 1],
		defaultValue,
		time,
	)
}

function readProvinceTimelineTime(
	field: SerializedProvinceTimelineInt,
	province: number,
	time: number,
	defaultValue: number,
): number {
	const start = field.offsets[province]
	const end = field.offsets[province + 1]
	if (start >= end || field.times.length === 0) return defaultValue
	return readTimelineValue(
		field.times,
		field.times,
		start,
		end,
		defaultValue,
		time,
	)
}

function findLatestSuccessionTime(
	bundle: TimelineBundle,
	provinceIdx: number,
	time: number,
): number {
	for (let index = bundle.events.length - 1; index >= 0; index--) {
		const event = bundle.events[index]
		if (event.time > time || event.tag !== "succession") continue
		const nation =
			typeof event.data?.nation === "number"
				? (event.data.nation as number)
				: -1
		if (nation === provinceIdx) return event.time
	}
	return bundle.timelines.startTimeMs
}

function resolveLeaderEntry(
	world: SerializedGenesisWorld,
	bundle: TimelineBundle | null,
	provinceIdx: number,
	time: number,
): LanguageNameLeaderEntry | null {
	const provinceCount = world.provinces?.count ?? 0
	if (provinceIdx < 0 || provinceIdx >= provinceCount) return null
	const seedField = bundle?.timelines.leaderNameSeed
	if (seedField) {
		const nameSeed = readProvinceInt(seedField, provinceIdx, time, -1)
		if (nameSeed < 0) {
			return { time: bundle?.timelines.startTimeMs ?? 0 }
		}
		return {
			time: readProvinceTimelineTime(
				seedField,
				provinceIdx,
				time,
				bundle?.timelines.startTimeMs ?? 0,
			),
			nameSeed,
		}
	}
	return {
		time: bundle ? findLatestSuccessionTime(bundle, provinceIdx, time) : 0,
		nameSeed: world.leaderNameSeed?.[provinceIdx] ?? -1,
	}
}

function findDynastyCultureId(
	world: SerializedGenesisWorld,
	bundle: TimelineBundle | null,
	dynastyIdx: number,
): number {
	const provinceCount = world.provinces?.count ?? 0
	if (dynastyIdx < 0) return -1
	const timelineField = bundle?.timelines.leaderDynasty
	if (timelineField) {
		for (let provinceIdx = 0; provinceIdx < provinceCount; provinceIdx++) {
			for (
				let index = timelineField.offsets[provinceIdx];
				index < timelineField.offsets[provinceIdx + 1];
				index++
			) {
				if ((timelineField.values[index] ?? -1) !== dynastyIdx) continue
				return world.cultures?.assignment[provinceIdx] ?? -1
			}
		}
	}
	for (let provinceIdx = 0; provinceIdx < provinceCount; provinceIdx++) {
		if ((world.leaderDynasty?.[provinceIdx] ?? -1) !== dynastyIdx) continue
		return world.cultures?.assignment[provinceIdx] ?? -1
	}
	return -1
}

export function createDisplayNames(
	world: SerializedGenesisWorld,
	bundle: TimelineBundle | null,
): LanguageNames {
	const baseNames = createWorldNames(world)
	const context = buildNameContext(
		world,
		Array.from(
			{ length: world.provinces?.count ?? 0 },
			(): LanguageNameLeaderEntry[] => [],
		),
	)
	const leaderNames = new Map<string, string>()
	const dynastyNames = new Map<number, string>()
	const dynastyCultureIds = new Map<number, number>()
	return {
		province: baseNames.province,
		nation: baseNames.nation,
		culture: baseNames.culture,
		heritage: baseNames.heritage,
		landmark: baseNames.landmark,
		river: baseNames.river,
		mountain: baseNames.mountain,
		leader: (provinceIdx: number, time: number) => {
			const province = context.provinces[provinceIdx]
			if (!province || province.culture < 0) return `Leader #${provinceIdx}`
			const leaderEntry = resolveLeaderEntry(world, bundle, provinceIdx, time)
			if (!leaderEntry) return `Leader #${provinceIdx}`
			const cacheKey = `${provinceIdx}:${leaderEntry.nameSeed ?? -1}:${leaderEntry.time}`
			const cached = leaderNames.get(cacheKey)
			if (cached) return cached
			const culture = context.cultures[province.culture]
			const lang = getCultureLanguage(context, province.culture)
			if (!lang) return `Leader #${provinceIdx}`
			const genderSeed = leaderEntry.nameSeed ?? leaderEntry.time ?? provinceIdx
			const key =
				resolveLeaderGender(culture?.genderSystem, genderSeed) === "female"
					? "person_female"
					: "person_male"
			const name = LANGUAGE.word.simple({
				lang,
				key,
				namespace: "leader",
				slot: buildLeaderSlot(provinceIdx, leaderEntry),
			}).word
			const titled = name
				? name.charAt(0).toUpperCase() + name.slice(1)
				: `Leader #${provinceIdx}`
			leaderNames.set(cacheKey, titled)
			return titled
		},
		dynasty: (dynastyIdx: number) => {
			const cached = dynastyNames.get(dynastyIdx)
			if (cached) return cached
			const cultureId =
				dynastyCultureIds.get(dynastyIdx) ??
				findDynastyCultureId(world, bundle, dynastyIdx)
			dynastyCultureIds.set(dynastyIdx, cultureId)
			const lang =
				cultureId >= 0 ? getCultureLanguage(context, cultureId) : null
			if (!lang) return `Dynasty #${dynastyIdx}`
			const name = LANGUAGE.word.unique({
				lang,
				key: "last",
				namespace: "dynasty",
				slot: `dynasty:${dynastyIdx}`,
			}).word
			dynastyNames.set(dynastyIdx, name)
			return name
		},
		clear: () => {
			baseNames.clear()
			leaderNames.clear()
			dynastyNames.clear()
			dynastyCultureIds.clear()
		},
	}
}
