import { TEXT } from "@/model/utilities/text"
import { LANGUAGE } from "./languages"
import { Language } from "./languages/types"

/**
 * Lazily generate and cache names for provinces and nations
 * using their culture's language dialect. All generated names
 * are guaranteed unique via LANGUAGE.word.unique().
 */

const _provinceNames = new Map<number, string>()
const _nationNames = new Map<number, string>()
const _riverNames = new Map<number, string>()
const _mountainNames = new Map<number, string>()

const langFor = (provinceIdx: number): Language | null => {
	const province = window.world.provinces[provinceIdx]
	if (!province || province.culture === -1) return null
	return window.world.cultures[province.culture]?.language ?? null
}

export const NAMES = {
	province: (provinceIdx: number): string => {
		const cached = _provinceNames.get(provinceIdx)
		if (cached) return cached
		const lang = langFor(provinceIdx)
		if (!lang) return `#${provinceIdx}`
		const name = TEXT.titleCase(
			LANGUAGE.word.unique({ lang, key: "settlement" }).word,
		)
		_provinceNames.set(provinceIdx, name)
		return name
	},
	nation: (capitalIdx: number): string => {
		const cached = _nationNames.get(capitalIdx)
		if (cached) return cached
		const lang = langFor(capitalIdx)
		if (!lang) return `#${capitalIdx}`
		const name = TEXT.titleCase(
			LANGUAGE.word.unique({ lang, key: "region" }).word,
		)
		_nationNames.set(capitalIdx, name)
		return name
	},
	river: (provinceIdx: number): string => {
		const cached = _riverNames.get(provinceIdx)
		if (cached) return cached
		const lang = langFor(provinceIdx)
		if (!lang) return `River #${provinceIdx}`
		const name = TEXT.titleCase(
			LANGUAGE.word.unique({ lang, key: "river" }).word,
		)
		_riverNames.set(provinceIdx, name)
		return name
	},
	mountain: (provinceIdx: number): string => {
		const cached = _mountainNames.get(provinceIdx)
		if (cached) return cached
		const lang = langFor(provinceIdx)
		if (!lang) return `Mount #${provinceIdx}`
		const name = TEXT.titleCase(
			LANGUAGE.word.unique({ lang, key: "mountain" }).word,
		)
		_mountainNames.set(provinceIdx, name)
		return name
	},
	leader: (provinceIdx: number, time: number): string => {
		// Get capital's leader at this specific time
		const capital = window.world.provinces[provinceIdx]
		if (!capital || capital.culture === -1) return `Leader #${provinceIdx}`

		// Find relevant historical leader entry
		let leaderEntry = null
		if (capital._leader.length > 0) {
			// Fast path for exact end match (often the case)
			for (let i = capital._leader.length - 1; i >= 0; i--) {
				if (capital._leader[i].time <= time) {
					leaderEntry = capital._leader[i]
					break
				}
			}
		}

		if (!leaderEntry) return `Leader #${provinceIdx}`

		// Use persistent name if it exists already
		if (leaderEntry.name) return leaderEntry.name

		const culture = window.world.cultures[capital.culture]
		if (!culture) return `Leader #${provinceIdx}`

		const lang = culture.language
		const isMatriarchal = culture.traditions.includes("matriarchal_society")
		const nameKey = isMatriarchal ? "person_female" : "person_male"

		const name = LANGUAGE.word.unique({ lang, key: nameKey }).word
		const finalName = TEXT.titleCase(name)

		// Persist the generated name!
		leaderEntry.name = finalName
		return finalName
	},
	dynasty: (dynastyIdx: number): string => {
		const dynasty = window.world.dynasties[dynastyIdx]
		if (!dynasty) return `Dynasty #${dynastyIdx}`
		return dynasty.name
	},
	/** Clear cached names (e.g. on world regeneration) */
	clear: () => {
		_provinceNames.clear()
		_nationNames.clear()
		_riverNames.clear()
		_mountainNames.clear()
	},
}
