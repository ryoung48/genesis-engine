import { PROVINCE } from ".."
import { START_DATE, TIME } from "@/model/utilities/time"
import { Province } from "../types"
import { TEXT } from "@/model/utilities/text"
import { LANGUAGE } from "@/model/actors/language/languages"
import { Dynasty } from "./types"

export const LEADER = {
	add: (province: Province, end?: number) => {
		const death =
			end ?? window.world.time + TIME.delta.year(window.dice.uniform(1, 60))
		const prev = province._leader[province._leader.length - 1]
		const ageAtAccession = window.dice.weightedChoice([
			{ v: window.dice.uniform(1, 10), w: 1 },
			{ v: window.dice.uniform(11, 15), w: 2 },
			{ v: window.dice.uniform(16, 30), w: 5 },
			{ v: window.dice.uniform(31, 50), w: 4 },
			{ v: window.dice.uniform(51, 65), w: 1 },
		])
		const birthTime = window.world.time - TIME.delta.year(ageAtAccession)
		const event = {
			time: window.world.time,
			end: death,
			idx: province._leader.length,
			dynasty: prev?.dynasty ?? -1,
			claim: "strong" as const,
			birthTime,
		}
		province._leader.push(event)
		return event
	},
	get: (province: Province, time?: number) => {
		return PROVINCE.history.find(
			province._leader,
			{ end: START_DATE, idx: 0, dynasty: -1, claim: "none", birthTime: START_DATE },
			time,
		)
	},
	dynasty: {
		add: (cultureIdx: number): number => {
			const culture = window.world.cultures[cultureIdx]
			const lang = culture.language
			const name = TEXT.titleCase(
				LANGUAGE.word.unique({ lang, key: "dynasty" }).word,
			)
			const color = `hsl(${Math.floor(window.dice.random * 360)}, ${40 + Math.floor(window.dice.random * 40)}%, ${40 + Math.floor(window.dice.random * 40)}%)`
			const dynasty: Dynasty = {
				idx: window.world.dynasties.length,
				name,
				color,
				culture: cultureIdx,
				founded: window.world.time,
			}
			window.world.dynasties.push(dynasty)
			return dynasty.idx
		},
		get: (province: Province, time?: number): number => {
			const entry = LEADER.get(province, time)
			return entry.dynasty
		},
		init: () => {
			const provinces = window.dice.shuffle(
				window.world.provinces.filter((p) => !p.desolate),
			)
			for (const province of provinces) {
				const leader = province._leader[province._leader.length - 1]
				if (!leader) continue

				const neighbors = PROVINCE.neighbors({ province })
				const sameCulture: number[] = []
				const sameHeritage: number[] = []
				const other: number[] = []

				for (const n of neighbors) {
					const nLeader = n._leader[n._leader.length - 1]
					if (!nLeader || nLeader.dynasty < 0) continue
					if (n.culture === province.culture) {
						sameCulture.push(nLeader.dynasty)
					} else if (n.heritage === province.heritage) {
						sameHeritage.push(nLeader.dynasty)
					} else {
						other.push(nLeader.dynasty)
					}
				}

				let dynasty = -1

				if (sameCulture.length > 0 && window.dice.random < 0.4) {
					dynasty = window.dice.choice(sameCulture)
				} else if (sameHeritage.length > 0 && window.dice.random < 0.15) {
					dynasty = window.dice.choice(sameHeritage)
				} else if (other.length > 0 && window.dice.random < 0.05) {
					dynasty = window.dice.choice(other)
				}

				if(!window.world.cultures[province.culture].language) {
					console.log("no culture for province", province)
				}

				if (dynasty < 0) {
					dynasty = LEADER.dynasty.add(province.culture)
				}

				leader.dynasty = dynasty
			}
		},
	},
}
