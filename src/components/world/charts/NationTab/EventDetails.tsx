import React from "react"
import type { HistoryNote, VictoryDegree } from "@/model/history/types"
import type { Ethos } from "@/model/actors/culture/types"
import { NAMES } from "@/model/actors/language/names"
import { NATION } from "@/model/nations"
import { RELATIONS } from "@/model/nations/relations"
import { WAR } from "@/model/nations/wars"
import { PROVINCE } from "@/model/provinces"
import { TIME } from "@/model/utilities/time"
import { NationLink } from "./NationLink"

export const eventDotColors: Record<string, string> = {
	succession: "#f43f5e",
	rebellion: "#f97316",
	"war started": "#f59e0b",
	battle: "#60a5fa",
	"war ended": "#10b981",
	"alliance formed": "#22c55e",
	"alliance broken": "#ef4444",
	"regency started": "#a855f7",
	"regency ended": "#8b5cf6",
}

// Victory degree display labels from the viewer's perspective
const VICTORY_LABELS: Record<VictoryDegree, string> = {
	decisive: "Decisive Victory",
	victory: "Victory",
	pyrrhic: "Pyrrhic Victory",
	close: "Close Defeat",
	defeat: "Defeat",
	crushing: "Crushing Defeat",
}

// Colors for victory degrees
const VICTORY_COLORS: Record<VictoryDegree, string> = {
	decisive: "#059669", // emerald-600
	victory: "#10b981", // emerald-500
	pyrrhic: "#84cc16", // lime-500
	close: "#f97316", // orange-500
	defeat: "#ef4444", // red-500
	crushing: "#b91c1c", // red-700
}

// ─── Deterministic template picking ─────────────────────────────────
// Uses event time as seed so the same event always renders the same text
const pick = <T,>(arr: T[], seed: number): T =>
	arr[Math.abs(seed * 2654435761) % arr.length]

const ordinal = (n: number): string => {
	const s = ["th", "st", "nd", "rd"]
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── Battle verb templates ──────────────────────────────────────────

// Verbs for when WE attacked and result is <degree> (from our perspective)
const ATTACK_WE_VERBS: Record<VictoryDegree, string[]> = {
	decisive: [
		" secured a decisive victory against ",
		" successfully routed the forces of ",
		" overwhelmed the defenses of ",
		" decisively defeated ",
	],
	victory: [
		" defeated the forces of ",
		" successfully advanced against ",
		" won an engagement against ",
		" overcame the defenders of ",
	],
	pyrrhic: [
		" secured a costly victory over ",
		" managed to defeat ",
		" narrowly forced the retreat of ",
		" sustained heavy losses while defeating ",
	],
	close: [
		" was repulsed by ",
		" failed to break the lines of ",
		" was forced to retreat by ",
		" unsuccessfully engaged ",
	],
	defeat: [
		" was defeated by ",
		" was driven back by ",
		" was turned back by ",
		" suffered a tactical defeat against ",
	],
	crushing: [
		" suffered a catastrophic defeat against ",
		" was routed by ",
		" was heavily defeated by ",
		" sustained critical losses during the offensive against ",
	],
}

// Verbs for when THEY attacked and result is <degree> (from our perspective)
const DEFEND_WE_VERBS: Record<VictoryDegree, string[]> = {
	decisive: [
		" secured a decisive defensive victory against ",
		" repelled the invasion of ",
		" decisively broke the offensive of ",
		" heavily defeated the attacking forces of ",
	],
	victory: [
		" successfully defended against ",
		" repelled the forces of ",
		" halted the advance of ",
		" repulsed the attack of ",
	],
	pyrrhic: [
		" held the position with heavy casualties against ",
		" withstood the offensive of ",
		" narrowly repulsed ",
		" sustained severe losses while halting ",
	],
	close: [
		" was narrowly forced from the position by ",
		" yielded ground to ",
		" was pushed back by ",
		" failed to halt the advance of ",
	],
	defeat: [
		" was defeated by the offensive of ",
		" lost the position to ",
		" was overcome by the forces of ",
		" was forced into retreat by ",
	],
	crushing: [
		" was routed by the invasion of ",
		" suffered a major defensive failure against ",
		" was overwhelmed by the assault of ",
		" sustained critical losses while defending against ",
	],
}

// ─── Scale language for battle costs ────────────────────────────────

const scalePhraseForCost = (cost: number, seed: number): string => {
	if (cost < 2)
		return pick(
			["a minor skirmish", "a probing action", "a limited engagement"],
			seed,
		)
	if (cost < 10)
		return pick(
			["a standard engagement", "a notable battle", "a tactical clash"],
			seed,
		)
	if (cost < 30)
		return pick(
			["a major battle", "a high-casualty engagement", "a significant conflict"],
			seed,
		)
	return pick(
		["a large-scale battle", "a battle resulting in massive casualties", "a heavily destructive engagement"],
		seed,
	)
}

// ─── Contextual flavor for odds ─────────────────────────────────────

const oddsFlavor = (
	odds: number,
	won: boolean,
	seed: number,
): string | null => {
	if (won && odds < 0.25)
		return pick(
			["despite severe numerical disadvantage", "in an unexpected tactical upset", "against unfavorable odds"],
			seed,
		)
	if (!won && odds > 0.75)
		return pick(
			["despite significant numerical superiority", "in a major logistical failure", "a notable tactical collapse"],
			seed,
		)
	if (won && odds > 0.85)
		return pick(["leveraging strong numerical advantages", "a conventional outcome", "securing an expected victory"], seed)
	return null
}

// ─── Streak / momentum detection ────────────────────────────────────

const countPriorBattles = (warIdx: number, beforeTime: number): number => {
	let count = 0
	for (const e of window.world.past) {
		if (e.tag === "battle" && e.war === warIdx && e.time < beforeTime) count++
	}
	return count
}

const streakPhrase = (warIdx: number, time: number, seed: number): string | null => {
	const n = countPriorBattles(warIdx, time)
	if (n === 0) return pick(["the first engagement of the conflict", "opening hostilities", "the initial military action"], seed)
	if (n >= 8) return pick([`the ${ordinal(n + 1)} major engagement characterizing this protracted conflict`, "a continuation of extended hostilities", `the ${ordinal(n + 1)} battle in a series of attritional clashes`], seed)
	if (n >= 4) return pick([`the ${ordinal(n + 1)} battle of the campaign`, `part of ongoing military operations`], seed)
	return null
}

// ─── Feature 1: Terrain & climate flavor ────────────────────────────

const terrainFlavor = (provinceIdx: number, seed: number): string | null => {
	const province = window.world.provinces[provinceIdx]
	if (!province) return null
	const cell = PROVINCE.cell(province)
	const { climate, vegetation, topography } = cell

	if (topography === "mountains") {
		if (climate === "arctic" || climate === "subarctic")
			return pick(["in high-altitude arctic terrain", "in mountainous glacial regions"], seed)
		return pick(["in mountainous terrain", "in high-altitude conditions"], seed)
	}
	if (topography === "marsh") {
		if (climate === "tropical" || climate === "subtropical")
			return pick(["in tropical wetlands", "in marshy terrain"], seed)
		return pick(["in wetland conditions", "in marshland"], seed)
	}
	if (topography === "hills") {
		if (vegetation === "woods" || vegetation === "forest")
			return pick(["in forested uplands", "in wooded hilly terrain"], seed)
		return pick(["in elevated terrain", "in hilly regions"], seed)
	}
	if (topography === "coastal") {
		if (climate === "arctic" || climate === "subarctic")
			return pick(["along the arctic coast", "in frozen coastal areas"], seed)
		return pick(["in coastal territory", "along the coastline"], seed)
	}
	if (vegetation === "desert")
		return pick(["in arid conditions", "in desert terrain"], seed)
	if (vegetation === "jungle")
		return pick(["in dense jungle terrain", "in tropical rainforest conditions"], seed)
	if (climate === "arctic")
		return pick(["in arctic conditions", "in tundra terrain"], seed)

	return null // temperate/flat/grasslands get no special flavor
}

// ─── Feature 2: Seasonal context ────────────────────────────────────

const seasonPhrase = (time: number, seed: number): string | null => {
	const month = Math.floor((time / TIME.constants.monthMS) % 12)
	const season = TIME.season(month)
	if (season === "winter")
		return pick(["during a winter campaign", "in winter conditions", "during the winter months"], seed)
	if (season === "summer")
		return pick(["during a summer campaign", "in summer conditions", "during the summer months"], seed)
	if (season === "spring" && seed % 3 === 0)
		return pick(["in early spring", "following the spring thaw"], seed)
	if (season === "autumn" && seed % 3 === 0)
		return pick(["during the autumn campaign", "preceding the winter months"], seed)
	return null
}

// ─── Feature 3: Nation rank epithets ────────────────────────────────

const rankTitle = (nationIdx: number, time: number): string => {
	const province = window.world.provinces[nationIdx]
	if (!province) return ""
	const rank = NATION.rank(province, time)
	const map: Record<string, string> = {
		empire: "the Empire of",
		kingdom: "the Kingdom of",
		duchy: "the Duchy of",
		county: "the County of",
	}
	return map[rank] ?? ""
}

// ─── Feature 4: Capital threat awareness ────────────────────────────

const capitalThreatPhrase = (
	battleProvinceIdx: number,
	warIdx: number,
	viewingNation: number,
): string | null => {
	const war = window.world.wars[warIdx]
	if (!war || viewingNation !== war.defender) return null

	if (battleProvinceIdx === war.defender)
		return "directly threatening the capital"

	const capitalProvince = window.world.provinces[war.defender]
	if (!capitalProvince) return null
	const capitalNeighbors = PROVINCE.neighbors({ province: capitalProvince })
	if (capitalNeighbors.some((n) => n.idx === battleProvinceIdx))
		return "in close proximity to the capital"

	return null
}

// ─── Feature 5: Occupation progress ─────────────────────────────────

const occupationPhrase = (
	warIdx: number,
	time: number,
	won: boolean,
	seed: number,
): string | null => {
	if (!won) return null
	const war = window.world.wars[warIdx]
	if (!war) return null

	// Count occupied provinces at this point in time
	let occupiedCount = 0
	for (const e of window.world.past) {
		if (
			e.tag === "battle" &&
			e.war === warIdx &&
			e.time <= time &&
			e.winner === war.attacker
		)
			occupiedCount++
	}

	if (occupiedCount <= 1)
		return pick(["establishing an initial occupation front", "securing the first territorial gains"], seed)
	if (occupiedCount <= 4) return `with ${occupiedCount} provinces subsequently occupied`
	return `maintaining occupation over ${occupiedCount} provinces`
}

// ─── Feature 6: War duration ────────────────────────────────────────

const warDurationPhrase = (warIdx: number, endTime: number, seed: number): string | null => {
	const war = window.world.wars[warIdx]
	if (!war) return null
	const years = Math.round(TIME.date.diffYears(endTime, war.startTime))
	if (years < 1) return pick(["concluding rapidly", "a short-lived conflict"], seed)
	if (years <= 3) return `a ${years}-year conflict`
	if (years <= 10) return `after ${years} years of hostilities`
	if (years <= 25) return `following ${years} years of protracted warfare`
	return `after an extended ${years}-year conflict`
}

// ─── Feature 7: Ruler longevity ─────────────────────────────────────

const reignPhrase = (
	nationIdx: number,
	leaderIdx: number,
	time: number,
	seed: number,
): string | null => {
	const province = window.world.provinces[nationIdx]
	if (!province) return null
	const entry = province._leader.find((e) => e.idx === leaderIdx)
	if (!entry) return null
	const years = Math.round(TIME.date.diffYears(time, entry.time))
	if (years < 1) return pick(["following a brief reign", "after a short tenure"], seed)
	if (years <= 5) return `after a ${years}-year reign`
	if (years <= 20) return `after ${years} years in power`
	if (years <= 40) return `after a ${years}-year rule`
	return `following an extended ${years}-year reign`
}

// ─── Feature 8: Historical grudges ──────────────────────────────────

const grudgePhrase = (
	attackerIdx: number,
	defenderIdx: number,
	currentWarIdx: number,
	seed: number,
): string | null => {
	let priorWarCount = 0
	for (const e of window.world.past) {
		if (
			e.tag === "war started" &&
			e.war !== currentWarIdx &&
			((e.attacker === attackerIdx && e.defender === defenderIdx) ||
				(e.attacker === defenderIdx && e.defender === attackerIdx))
		)
			priorWarCount++
	}
	if (priorWarCount === 0) return null
	if (priorWarCount === 1)
		return pick(["renewing previous hostilities", "in a continuation of prior conflict"], seed)
	if (priorWarCount === 2)
		return pick(["the third war between the two powers", "a recurring conflict"], seed)
	return `the ${ordinal(priorWarCount + 1)} instance of armed conflict between the nations`
}

// ─── Feature 9: Alliance mentions ───────────────────────────────────

const alliancePhrase = (
	warIdx: number,
	time: number,
	viewingNation: number,
	seed: number,
): string | null => {
	const war = window.world.wars[warIdx]
	if (!war) return null
	const participants = WAR.participants({ war, time })
	const weAreAttacker = viewingNation === war.attacker
	const ourSide = weAreAttacker ? participants.attacker : participants.defender
	const enemySide = weAreAttacker ? participants.defender : participants.attacker
	const ourAllies = ourSide.allies.length
	const enemyAllies = enemySide.allies.length

	if (ourAllies === 0 && enemyAllies >= 2)
		return pick(["fighting against a coalition", `facing multiple powers (${enemyAllies + 1})`], seed)
	if (ourAllies === 0 && enemyAllies === 1)
		return "facing combined enemy forces"
	if (ourAllies >= 2 && enemyAllies === 0)
		return pick([`supported by a coalition of ${ourAllies} allies`, "with allied military support"], seed)
	if (ourAllies === 1 && enemyAllies === 0)
		return "with allied support"
	return null
}

// ─── Feature 10: Province significance ──────────────────────────────

const provinceSignificancePhrase = (
	provinceIdx: number,
	time: number,
	seed: number,
): string | null => {
	const province = window.world.provinces[provinceIdx]
	if (!province) return null
	const pop = PROVINCE.population.total(province, time)
	const dev = PROVINCE.development.get(province, time)

	if (pop > 100e3 || dev > 8)
		return pick(["a major population center,", "a high-development region,", "a strategically significant province,"], seed)
	if (pop < 2000 && dev === 0)
		return pick(["a low-population frontier region,", "an underdeveloped area,", "a sparsely populated province,"], seed)
	return null
}

// ─── Feature 11: Landmark & geographic names ────────────────────────

const landmarkPhrase = (provinceIdx: number, seed: number): string | null => {
	const province = window.world.provinces[provinceIdx]
	if (!province) return null
	const cell = PROVINCE.cell(province)

	if (cell.mountain !== undefined) {
		const mountain = window.world.mountains[cell.mountain]
		if (mountain?.name)
			return `near the ${mountain.name} formation`
	}

	const landmark = window.world.landmarks[cell.landmark]
	if (landmark && (landmark.type === "island" || landmark.type === "isle")) {
		if (landmark.name)
			return `on the island of ${landmark.name}`
		return pick(["in an insular environment", "on the island"], seed)
	}

	return null
}

// ─── Feature 12: Consecutive win/loss streak ────────────────────────

const warStreakPhrase = (
	warIdx: number,
	beforeTime: number,
	viewingNation: number,
	seed: number,
): string | null => {
	const priorBattles: Extract<HistoryNote, { tag: "battle" }>[] = []
	for (const e of window.world.past) {
		if (e.tag === "battle" && e.war === warIdx && e.time < beforeTime)
			priorBattles.push(e)
	}
	if (priorBattles.length === 0) return null

	priorBattles.sort((a, b) => b.time - a.time) // most recent first
	const firstWon = priorBattles[0].winner === viewingNation
	let streak = 1
	for (let i = 1; i < priorBattles.length; i++) {
		if ((priorBattles[i].winner === viewingNation) === firstWon) streak++
		else break
	}

	if (streak < 3) return null

	if (firstWon) {
		if (streak >= 5)
			return pick([`a ${ordinal(streak + 1)} consecutive tactical victory`, `${streak} successful engagements in a row`], seed)
		return pick([`a ${ordinal(streak + 1)} consecutive tactical victory`, `a ${streak}-win streak`], seed)
	}
	if (streak >= 5)
		return pick(["continuing a pattern of military setbacks", `a ${streak}-battle strategic losing streak continues`], seed)
	return pick([`a ${ordinal(streak + 1)} consecutive tactical defeat`, "a continuation of tactical losses"], seed)
}

// ─── Feature 13: Named battle titles ────────────────────────────────

const battleTypeName = (
	event: Extract<HistoryNote, { tag: "battle" }>,
): string => {
	const province = window.world.provinces[event.province]
	const urbanPop = province ? PROVINCE.population.urban.get(province, event.time) : 0
	const totalCost = event.attackerCost + event.defenderCost
	const seed = event.time + event.province

	let type = pick(["Battle", "Engagement", "Clash"], seed)
	let preposition = "of"

	if (totalCost < 3) {
		type = pick(["Skirmish", "Raid", "Incursion"], seed + 1)
	} else if (urbanPop > 20e3 && totalCost > 5) {
		type = pick(["Siege", "Sack", "Fall"], seed + 1)
	} else if (totalCost >= 8 && (event.victoryDegree === "decisive" || event.victoryDegree === "crushing")) {
		type = pick(["Massacre", "Slaughter", "Bloodbath"], seed + 1)
		preposition = pick(["at", "of"], seed + 2)
	} else if (event.victoryDegree === "close" || event.victoryDegree === "pyrrhic") {
		type = pick(["Stand", "Holding", "Defense"], seed + 1)
		preposition = "at"
	} else {
		if (type === "Engagement" || type === "Clash") preposition = "at"
	}

	let locationName = NAMES.province(event.province)
	const cell = province ? window.world.cells[province.cell] : null
	if (cell && !["Siege", "Sack", "Fall"].includes(type)) {
		const isMountain = cell.topography === "mountains" || cell.isMountains
		const isRiver = cell.waterSources && cell.waterSources.size > 0
		const hash = (seed * 937) % 100

		if (isMountain && hash < 50) {
			locationName = `${NAMES.mountain(event.province)} Mountains`
			preposition = "in the"
		} else if (isRiver && hash < 50) {
			locationName = `${NAMES.river(event.province)} River`
			preposition = "at the"
		}
	}

	// Count prior battles at same province in same war for ordinal
	let sameProvincePrior = 0
	for (const e of window.world.past) {
		if (
			e.tag === "battle" &&
			e.war === event.war &&
			e.province === event.province &&
			e.time < event.time
		)
			sameProvincePrior++
	}

	if (sameProvincePrior > 0)
		return `The ${ordinal(sameProvincePrior + 1)} ${type} ${preposition} ${locationName}`
	return `The ${type} ${preposition} ${locationName}`
}

// ─── Feature 14: Culture-flavored prose ─────────────────────────────

const getViewingEthos = (nationIdx: number): Ethos | null => {
	const province = window.world.provinces[nationIdx]
	if (!province || province.culture === -1) return null
	return window.world.cultures[province.culture]?.ethos ?? null
}

const ETHOS_FLAVOR: Record<Ethos, { win: string[]; loss: string[] }> = {
	bellicose: {
		win: ["demonstrating martial superiority", "reinforcing military dominance", "achieving tactical objectives"],
		loss: ["sustaining a notable military setback", "suffering a loss of martial prestige", "failing military objectives"],
	},
	bureaucratic: {
		win: ["formalizing provincial control", "restoring administrative order"],
		loss: ["necessitating administrative reorganization", "disrupting local governance"],
	},
	communal: {
		win: ["representing a collective military success", "strengthening communal security"],
		loss: ["imposing shared societal costs", "requiring collective resilience"],
	},
	spiritual: {
		win: ["interpreted as divine mandate", "bolstering religious legitimacy"],
		loss: ["prompting religious reassessment", "challenging theological narratives"],
	},
	stoic: {
		win: ["achieved with disciplined precision", "executed methodically"],
		loss: ["absorbed with minimal societal disruption", "endured systematically"],
	},
	ceremonious: {
		win: ["commemorated by the state apparatus", "enhancing sovereign prestige"],
		loss: ["damaging state prestige", "prompting formal reassessments of strategy"],
	},
	egalitarian: {
		win: ["reflecting successful mass mobilization", "demonstrating populist military efficacy"],
		loss: ["distributing the consequences of defeat broadly", "prompting decentralized reorganization"],
	},
}

const ethosFlavorPhrase = (
	ethos: Ethos | null,
	won: boolean,
	seed: number,
): string | null => {
	if (!ethos) return null
	const pool = won ? ETHOS_FLAVOR[ethos].win : ETHOS_FLAVOR[ethos].loss
	return pick(pool, seed)
}

// ─── War declaration templates ──────────────────────────────────────

const warDeclaredVerb = (odds: number, seed: number): string => {
	if (odds > 0.7) return pick(["formally declared war on", "initiated hostilities against", "began military operations against"], seed)
	if (odds > 0.4) return pick(["declared war on", "commenced armed conflict with", "opened hostilities against"], seed)
	return pick(["declared war despite significant tactical disadvantages against", "initiated a high-risk conflict with", "entered a militarily disadvantageous war against"], seed)
}

// ─── War ended templates ────────────────────────────────────────────

const warWonVerb = (transferCount: number, seed: number): string => {
	if (transferCount >= 5) return pick(["achieved total victory over", "subjugated", "secured an unconditional surrender from"], seed)
	if (transferCount > 0) return pick(["successfully concluded the war against", "forced concessions from", "defeated"], seed)
	return pick(["achieved a status quo victory against", "prevailed in a war of attrition against", "secured a technical victory over"], seed)
}

const warLostVerb = (seed: number): string =>
	pick(["was defeated in the war by", "capitulated to", "surrendered to", "formally yielded to"], seed)

const stalemateVerb = (seed: number): string =>
	pick(
		["concluded hostilities in a stalemate with", "reached a military impasse with", "agreed to a white peace with"],
		seed,
	)

// ─── Succession templates ───────────────────────────────────────────

const leaderAge = (entry: { birthTime: number; time: number } | undefined): number | null => {
	if (!entry || entry.birthTime === undefined) return null
	return Math.round(TIME.date.diffYears(entry.time, entry.birthTime))
}

const leaderAgeAt = (entry: { birthTime: number } | undefined, time: number): number | null => {
	if (!entry || entry.birthTime === undefined) return null
	return Math.round(TIME.date.diffYears(time, entry.birthTime))
}

const successionPhrase = (nationIdx: number, time: number, seed: number): string => {
	const oldLeader = NAMES.leader(nationIdx, time - 1)
	const newLeader = NAMES.leader(nationIdx, time)

	const province = window.world.provinces[nationIdx]
	const oldEntry = province?._leader.find((e) => e.end <= time && e.end > time - TIME.delta.year(1))
	const newEntry = province?._leader.find((e) => e.time === time || (e.time <= time && e.end > time))

	const oldAge = oldEntry ? leaderAgeAt(oldEntry, oldEntry.end) : null
	const newAge = leaderAge(newEntry)

	// Age-flavored cause of death for the old ruler
	const deathCause = oldAge !== null && oldAge > 60
		? pick([`${oldLeader} died of old age at ${oldAge}`, `${oldLeader}, aged ${oldAge}, passed away`], seed)
		: pick([
			`${oldLeader} was assassinated`,
			`${oldLeader} died in battle`,
			`${oldLeader} succumbed to illness`,
			`Following the sudden demise of ${oldLeader}`,
			`${oldLeader} abdicated`,
		], seed)

	// Age-flavored accession for the new ruler
	const accessionFlavor = newAge !== null && newAge < 16
		? pick([
			`a child of ${newAge}, ${newLeader} inherits the realm under a regency council`,
			`the ${newAge}-year-old ${newLeader} ascends, ruling under regency`,
			`${newLeader}, a mere child of ${newAge}, takes the throne under the guidance of a regent`,
		], seed + 5)
		: newAge !== null && newAge > 50
			? pick([
				`the elderly ${newLeader}, aged ${newAge}, assumes power`,
				`${newLeader}, already ${newAge} years old, takes the throne`,
			], seed + 5)
			: pick([
				`${newLeader} seized the throne`,
				`${newLeader} ascended to power`,
				`the realm falls to ${newLeader}`,
				`${newLeader} claimed leadership`,
			], seed + 5)

	return `${deathCause}; ${accessionFlavor}`
}

const claimPhrase = (claim: string, seed: number): string | null => {
	if (claim === "strong") return null
	if (claim === "average")
		return pick(["with a contested claim", "with a disputed succession"], seed)
	if (claim === "weak")
		return pick(["with a tenuous claim to the throne", "whose legitimacy is widely questioned"], seed)
	if (claim === "none")
		return pick(["with no legitimate claim", "a ruler without dynastic legitimacy"], seed)
	return null
}

const dynastyShiftPhrase = (
	oldDynasty: number,
	newDynasty: number,
	seed: number,
): string | null => {
	if (oldDynasty === newDynasty || oldDynasty < 0 || newDynasty < 0) return null
	const oldName = window.world.dynasties[oldDynasty]?.name ?? "unknown"
	const newName = window.world.dynasties[newDynasty]?.name ?? "unknown"
	return pick(
		[
			`the ${oldName} dynasty gives way to the ${newName}`,
			`ending ${oldName} rule — the ${newName} dynasty rises`,
			`a dynastic shift from ${oldName} to ${newName}`,
		],
		seed,
	)
}

const puFormationPhrase = (
	nationIdx: number,
	seniorIdx: number,
	seed: number,
): string | null => {
	const seniorName = NAMES.nation(seniorIdx)
	return pick(
		[
			`entering a personal union under ${seniorName}`,
			`falling under the personal union of ${seniorName}`,
			`joined in personal union with ${seniorName} as the senior partner`,
		],
		seed,
	)
}

// ─── Rebellion templates ────────────────────────────────────────────

const rebellionVerb = (seed: number): string =>
	pick(
		["initiated a rebellion against", "declared independence from", "engaged in an armed uprising against"],
		seed,
	)

const rebellionDisconnectedVerb = (seed: number): string =>
	pick(
		["seceded from", "formally separated from", "broke diplomatic ties and departed from"],
		seed,
	)

const rebellionSuccessionFlavor = (seed: number): string =>
	pick(
		["during a period of succession instability", "coinciding with the leadership transition", "exploiting administrative vulnerability during succession"],
		seed,
	)

// ─── Victory degree helpers ─────────────────────────────────────────

const getViewerDegree = (
	event: Extract<HistoryNote, { tag: "battle" }>,
	viewingNation: number,
): VictoryDegree => {
	const won = event.winner === viewingNation
	if (won) return event.victoryDegree
	const degreeMap: Record<VictoryDegree, VictoryDegree> = {
		decisive: "crushing",
		victory: "defeat",
		pyrrhic: "close",
		close: "pyrrhic",
		defeat: "victory",
		crushing: "decisive",
	}
	return degreeMap[event.victoryDegree]
}

// ─── Procedural War Names ───────────────────────────────────────────

const warNameCache = new Map<number, string>()

export const getWarName = (warIdx: number): string => {
	if (warNameCache.has(warIdx)) return warNameCache.get(warIdx)!

	const war = window.world.wars[warIdx]
	if (!war) return `War of Unknown Origins`

	const seed = war.startTime
	const attackerName = NAMES.nation(war.attacker)
	const defenderName = NAMES.nation(war.defender)

	// Count all wars between these two nations to add Roman numerals retrospectively
	// (e.g. if this is their first war, but they fight a second one later, this becomes War I)
	const combatantWars = window.world.past.filter(
		(e) =>
			e.tag === "war started" &&
			((e.attacker === war.attacker && e.defender === war.defender) ||
				(e.attacker === war.defender && e.defender === war.attacker)),
	) as Extract<HistoryNote, { tag: "war started" }>[]

	let sequenceIdx = 0
	const totalWars = combatantWars.length
	if (totalWars > 1) {
		// Sort by time to find our index (1-based)
		combatantWars.sort((a, b) => a.time - b.time)
		const idx = combatantWars.findIndex((e) => e.war === warIdx)
		if (idx !== -1) sequenceIdx = idx + 1
	}

	const romanNumerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
	const numeralSuffix = sequenceIdx > 0 && sequenceIdx < romanNumerals.length
		? ` ${romanNumerals[sequenceIdx]}`
		: ""

	// If there's a roman numeral, force the name to use nation names
	if (numeralSuffix) {
		const baseName = pick(
			[
				`The ${attackerName}-${defenderName} War`,
				`The ${attackerName}-${defenderName} Conflict`,
			],
			seed,
		)
		const name = `${baseName}${numeralSuffix}`
		warNameCache.set(warIdx, name)
		return name
	}

	// Gather battle locations to see if there's a dominant region
	const battles = window.world.past.filter(
		(e) => e.tag === "battle" && e.war === warIdx,
	) as Extract<HistoryNote, { tag: "battle" }>[]

	let name = ""

	if (battles.length === 0) {
		name = pick(
			[
				`The Bloodless War of ${attackerName}`,
				`The Silent Conflict of ${TIME.date.toYear(war.startTime)}`,
				`The ${attackerName}-${defenderName} Standoff`,
			],
			seed,
		)
	} else if (battles.length === 1) {
		const provName = NAMES.province(battles[0].province)
		name = pick(
			[
				`The War of ${provName}`,
				`The ${provName} Conflict`,
				`The Skirmish of ${provName}`,
			],
			seed,
		)
	} else {
		// Find most contested province
		const provinceCounts = new Map<number, number>()
		let maxProv = battles[0].province
		let maxCount = 0
		for (const b of battles) {
			const c = (provinceCounts.get(b.province) || 0) + 1
			provinceCounts.set(b.province, c)
			if (c > maxCount) {
				maxCount = c
				maxProv = b.province
			}
		}

		const provName = NAMES.province(maxProv)
		const durationYears = Math.max(1, Math.round(
			TIME.date.diffYears(
				war.endTime || window.world.time,
				war.startTime,
			),
		))

		if (maxCount >= 3) {
			name = pick(
				[
					`The War for ${provName}`,
					`The Great ${provName} Conflict`,
					`The Campaigns of ${provName}`,
				],
				seed,
			)
		} else if (durationYears >= 5) {
			name = pick(
				[
					`The ${durationYears} Years' War`,
					`The Long War of ${TIME.date.toYear(war.startTime)}`,
					`The ${attackerName}-${defenderName} War`,
				],
				seed,
			)
		} else {
			name = pick(
				[
					`The War of ${TIME.date.toYear(war.startTime)}`,
					`The ${attackerName} War of Conquest`,
					`The ${defenderName} Defensive War`,
					`The Conflict of ${provName}`,
				],
				seed,
			)
		}
	}

	warNameCache.set(warIdx, name)
	return name
}

// ─── Clickable link components ──────────────────────────────────────

const ProvinceLink: React.FC<{
	id: number
	onZoomToProvince?: (idx: number) => void
}> = ({ id, onZoomToProvince }) => {
	const name = NAMES.province(id)
	return (
		<button
			className="group inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 decoration-dotted underline-offset-2 cursor-pointer transition-colors px-0.5"
			onClick={(e) => {
				e.stopPropagation()
				onZoomToProvince?.(id)
			}}
			title={`Click to zoom to ${name}`}
		>
			<span>{name}</span>
		</button>
	)
}

const WarBadge: React.FC<{
	warIdx: number
	onWarSelect?: (warIdx: number) => void
}> = ({ warIdx, onWarSelect }) => (
	<button
		className="text-amber-600 hover:text-amber-800 font-bold mr-1 cursor-pointer transition-colors"
		onClick={(e) => {
			e.stopPropagation()
			onWarSelect?.(warIdx)
		}}
		title={`View War ${warIdx}`}
	>
		{getWarName(warIdx)}
	</button>
)

// ─── Main description generator ─────────────────────────────────────

export const getEventDescription = (
	event: HistoryNote,
	viewingNation: number,
	onZoomToProvince?: (idx: number) => void,
	onWarSelect?: (warIdx: number) => void,
	onNationSelect?: (nationIdx: number) => void,
): React.ReactNode => {
	const isUs = (id: number) => id === viewingNation
	const seed = event.time

	const Nation: React.FC<{ id: number }> = ({ id }) => (
		<NationLink
			id={id}
			onZoomToProvince={onZoomToProvince}
			onNationSelect={onNationSelect}
		/>
	)

	// Ranked nation: "the Kingdom of [NationLink]"
	const RankedNation: React.FC<{ id: number }> = ({ id }) => (
		<>
			<span className="text-gray-500">{rankTitle(id, event.time)} </span>
			<Nation id={id} />
		</>
	)

	switch (event.tag) {
		case "battle": {
			const weAttacked = isUs(event.attacker)
			const enemy = weAttacked ? event.defender : event.attacker
			const ourCost = weAttacked ? event.attackerCost : event.defenderCost
			const viewerDegree = getViewerDegree(event, viewingNation)
			const won = event.winner === viewingNation
			const myOdds = weAttacked ? event.odds : 1 - event.odds

			// Pick verb based on whether we attacked or defended
			const verbTable = weAttacked ? ATTACK_WE_VERBS : DEFEND_WE_VERBS
			const verb = pick(verbTable[viewerDegree], seed)

			// Scale phrase
			const scale = scalePhraseForCost(ourCost, seed + 1)

			// Odds flavor
			const flavor = oddsFlavor(myOdds, won, seed + 2)

			// Location: significance > terrain > plain " in "
			const significance = provinceSignificancePhrase(event.province, event.time, seed + 8)
			const terrain = terrainFlavor(event.province, seed + 4)
			const locationPrefix = significance ?? (terrain ? ` in ${terrain}` : " in")

			// Trailing phrases — collect and render (Features 2, 4, 5, 9, 11, 14)
			const trailing: string[] = []
			const lm = landmarkPhrase(event.province, seed + 9)
			if (lm) trailing.push(lm)
			const ct = capitalThreatPhrase(event.province, event.war, viewingNation)
			if (ct) trailing.push(ct)
			const occ = occupationPhrase(event.war, event.time, won, seed + 6)
			if (occ) trailing.push(occ)
			const al = alliancePhrase(event.war, event.time, viewingNation, seed + 7)
			if (al) trailing.push(al)
			const ssn = seasonPhrase(event.time, seed + 5)
			if (ssn) trailing.push(ssn)
			const ef = ethosFlavorPhrase(getViewingEthos(viewingNation), won, seed + 10)
			if (ef) trailing.push(ef)

			// Streak: prefer consecutive win/loss streak over generic (Feature 12)
			const wsPhrase = warStreakPhrase(event.war, event.time, viewingNation, seed + 11)
			const stPhrase = streakPhrase(event.war, event.time, seed + 3)
			const streak = wsPhrase ?? stPhrase

			return (
				<>
					<WarBadge warIdx={event.war} onWarSelect={onWarSelect} />
					<RankedNation id={viewingNation} />
					{verb}
					<RankedNation id={enemy} />
					{" "}
					{locationPrefix}
					{locationPrefix !== " in" && !locationPrefix?.endsWith("in ") && !locationPrefix?.endsWith("at ") ? " " : ""}
					<ProvinceLink id={event.province} onZoomToProvince={onZoomToProvince} />
					{": "}
					<span
						className="font-bold"
						style={{ color: VICTORY_COLORS[viewerDegree] }}
					>
						{VICTORY_LABELS[viewerDegree]}
					</span>
					<span className="text-gray-400">
						{" "}({Math.round(myOdds * 100)}% odds)
					</span>
					{" — "}
					{scale}
					{flavor && <>, {flavor}</>}
					{trailing.map((phrase, i) => (
						<span key={i} className="text-gray-400 italic">
							{" — "}
							{phrase}
						</span>
					))}
					{streak && (
						<span className="text-gray-400 italic"> ({streak})</span>
					)}
				</>
			)
		}
		case "war started": {
			const weAttacked = isUs(event.attacker)
			const enemy = weAttacked ? event.defender : event.attacker
			const myOdds = weAttacked ? event.odds : 1 - event.odds
			const verb = warDeclaredVerb(myOdds, seed)

			// Feature 8: Historical grudges
			const grudge = grudgePhrase(event.attacker, event.defender, event.war, seed + 3)

			return (
				<>
					<WarBadge warIdx={event.war} onWarSelect={onWarSelect} />
					<RankedNation id={weAttacked ? viewingNation : enemy} />
					{" "}
					{verb}
					{" "}
					<RankedNation id={weAttacked ? enemy : viewingNation} />
					<span className="text-gray-400">
						{" "}({Math.round(myOdds * 100)}% chance)
					</span>
					{myOdds < 0.3 && (
						<span className="text-gray-400 italic">
							{" "}— {pick(["a bold gamble", "a reckless venture", "a desperate throw of the dice"], seed + 1)}
						</span>
					)}
					{myOdds > 0.8 && (
						<span className="text-gray-400 italic">
							{" "}— {pick(["sensing weakness", "smelling blood", "striking while the iron is hot"], seed + 1)}
						</span>
					)}
					{grudge && (
						<span className="text-gray-400 italic">
							{" "}— {grudge}
						</span>
					)}
				</>
			)
		}
		case "war ended": {
			const enemy = isUs(event.attacker) ? event.defender : event.attacker
			const won = event.winner === viewingNation

			// Feature 6: War duration
			const duration = warDurationPhrase(event.war, event.time, seed + 3)

			if (event.stalemate) {
				const verb = stalemateVerb(seed)
				return (
					<>
						<WarBadge warIdx={event.war} onWarSelect={onWarSelect} />
						<RankedNation id={viewingNation} />
						{" "}
						{verb}
						{" "}
						<RankedNation id={enemy} />
						{" — "}
						<span className="italic text-gray-500">{event.stalemate}</span>
						{duration && (
							<span className="text-gray-400 italic">
								{" "}— {duration}
							</span>
						)}
					</>
				)
			}

			const transferCount = event.transferred.length
			const verb = won
				? warWonVerb(transferCount, seed)
				: warLostVerb(seed)
			const gains =
				transferCount > 0
					? ` — ${transferCount} province${transferCount > 1 ? "s" : ""} ${won ? "seized" : "lost"}`
					: ""

			return (
				<>
					<WarBadge warIdx={event.war} onWarSelect={onWarSelect} />
					<RankedNation id={viewingNation} />
					{" "}
					{verb}
					{" "}
					<RankedNation id={enemy} />
					{gains}
					{transferCount === 0 && won && (
						<span className="text-gray-400 italic">
							{" "}— {pick(["a war fought for nothing", "a hollow triumph", "victory without spoils"], seed + 1)}
						</span>
					)}
					{transferCount >= 5 && won && (
						<span className="text-gray-400 italic">
							{" "}— {pick(["total conquest", "a devastating blow", "the balance of power shifts"], seed + 1)}
						</span>
					)}
					{duration && (
						<span className="text-gray-400 italic">
							{" "}— {duration}
						</span>
					)}
				</>
			)
		}
		case "succession": {
			const phrase = successionPhrase(event.nation, event.time, seed)
			// Feature 7: Ruler longevity
			const reign = reignPhrase(event.nation, event.leader, event.time, seed + 1)

			// Dynasty shift and claim details
			const province = window.world.provinces[event.nation]
			const oldLeaderEntry = province?._leader[event.leader]
			const newLeaderEntry = province?._leader[event.successor]
			const oldDynasty = oldLeaderEntry?.dynasty ?? -1
			const newDynasty = newLeaderEntry?.dynasty ?? -1
			const claim = newLeaderEntry?.claim
			const dynastyShift = dynastyShiftPhrase(oldDynasty, newDynasty, seed + 2)
			const claimNote = claim ? claimPhrase(claim, seed + 3) : null

			// Check if a PU was formed at this succession
			const puSenior = province ? RELATIONS.overlord(province, event.time) : undefined
			const puRel = puSenior
				? RELATIONS.get({ nation: province, other: puSenior, time: event.time })
				: undefined
			const puNote =
				puSenior && puRel === "personal_union_senior"
					? puFormationPhrase(event.nation, puSenior.idx, seed + 4)
					: null

			return (
				<>
					<Nation id={event.nation} />
					{": "}
					{phrase}
					{claimNote && (
						<span className="text-amber-600 italic">
							{" "}— {claimNote}
						</span>
					)}
					{dynastyShift && (
						<span className="text-purple-600 italic">
							{" "}— {dynastyShift}
						</span>
					)}
					{puNote && (
						<span className="text-indigo-600 font-semibold">
							{" "}— {puNote}
						</span>
					)}
					{reign && (
						<span className="text-gray-400 italic">
							{" "}— {reign}
						</span>
					)}
				</>
			)
		}
		case "rebellion": {
			const trigger = event.succession
				? ` — ${rebellionSuccessionFlavor(seed + 1)}`
				: ""

			if (event.disconnected) {
				const verb = rebellionDisconnectedVerb(seed)
				return (
					<>
						<Nation id={event.subject} />
						{" "}
						{verb}
						{" "}
						<Nation id={event.overlord} />
						{" "}
						— {pick(["too distant to control", "beyond the reach of their overlord", "severed by geography"], seed + 2)}
						{trigger}
					</>
				)
			}

			const verb = rebellionVerb(seed)
			return (
				<>
					<Nation id={event.subject} />
					{" "}
					{verb}
					{" "}
					<Nation id={event.overlord} />
					{trigger}
				</>
			)
		}
		case "regency started": {
			const flavor = pick([
				"A regent council has been appointed to govern",
				"The realm falls under regency",
				"A council of regents assumes power",
				"Guardians of the crown take the reins",
			], seed)
			return (
				<>
					<Nation id={event.nation} />
					{": "}
					{flavor}
					{" until the young ruler, aged {0}, comes of age".replace("{0}", String(event.age))}
				</>
			)
		}
		case "regency ended": {
			const flavor = pick([
				"The young ruler comes of age and assumes full authority",
				"The regency ends as the ruler reaches maturity",
				"Having come of age, the ruler dismisses the regent council",
				"The crown passes from regent to ruler at last",
			], seed)
			return (
				<>
					<Nation id={event.nation} />
					{": "}
					{flavor}
				</>
			)
		}
		default: {
			const _exhaustive: never = event
			return (_exhaustive as HistoryNote).tag
		}
	}
}

/**
 * Get a display tag for an event based on perspective
 */
export interface DisplayTags {
	primary: string
	secondary?: string
	title?: string
}

export const getDisplayTags = (
	event: HistoryNote,
	viewingNation: number,
): DisplayTags => {
	switch (event.tag) {
		case "battle": {
			const viewerDegree = getViewerDegree(event, viewingNation)
			return {
				primary: "battle",
				secondary: VICTORY_LABELS[viewerDegree],
				title: battleTypeName(event as Extract<HistoryNote, { tag: "battle" }>),
			}
		}
		case "war ended":
			return {
				primary: "war ended",
				secondary: event.stalemate
					? "stalemate"
					: event.winner === viewingNation
						? "victory"
						: "defeat",
			}
		case "regency started":
			return { primary: "regency", secondary: "started" }
		case "regency ended":
			return { primary: "regency", secondary: "ended" }
		default:
			return { primary: event.tag }
	}
}

/**
 * Get the color for an event dot based on event type and outcome
 */
export const getEventDotColor = (
	event: HistoryNote,
	viewingNation: number,
): string => {
	if (event.tag === "battle") {
		const viewerDegree = getViewerDegree(event, viewingNation)
		return VICTORY_COLORS[viewerDegree]
	}
	if (event.tag === "war ended") {
		return event.winner === viewingNation ? "#10b981" : "#ef4444"
	}
	return eventDotColors[event.tag] || "#9ca3af"
}

interface EventDetailsProps {
	events: HistoryNote[]
	selectedYear: number
	viewingNation: number
	onTimeSelect?: (time: number) => void
	onZoomToProvince?: (idx: number) => void
	onWarSelect?: (warIdx: number) => void
	onNationSelect?: (nationIdx: number) => void
}

export const EventDetails: React.FC<EventDetailsProps> = ({
	events,
	selectedYear,
	viewingNation,
	onTimeSelect,
	onZoomToProvince,
	onWarSelect,
	onNationSelect,
}) => {
	if (events.length === 0) {
		return (
			<div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm mb-3">
				<div className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">
					Year {selectedYear}
				</div>
				<div className="text-[10px] text-gray-400">No events this year</div>
			</div>
		)
	}

	return (
		<div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm mb-3 overflow-y-auto flex flex-col">
			<div className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2 flex-shrink-0">
				Year {selectedYear} • {events.length} event
				{events.length > 1 ? "s" : ""}
			</div>
			<div className="space-y-2">
				{events.map((event: HistoryNote, i: number) => {
					const tags = getDisplayTags(event, viewingNation)
					const dotColor = getEventDotColor(event, viewingNation)

					return (
						<div
							key={i}
							className="border-l-2 pl-2"
							style={{
								borderColor: dotColor,
							}}
						>
							<div className="flex items-center gap-2">
								<div
									className="w-2 h-2 rounded-full flex-shrink-0"
									style={{
										backgroundColor: dotColor,
									}}
								/>
								{tags.secondary ? (
									<div className="flex truncate border rounded-sm overflow-hidden" style={{ borderColor: dotColor }}>
										<span className="text-[8px] font-bold uppercase px-1.5 py-0.5 bg-gray-100 text-gray-600">
											{tags.primary}
										</span>
										<span className="text-[8px] font-bold uppercase px-1.5 py-0.5 text-white" style={{ backgroundColor: dotColor }}>
											{tags.secondary}
										</span>
									</div>
								) : (
									<span className="text-[9px] font-bold text-gray-700 uppercase">
										{tags.primary}
									</span>
								)}
								{tags.title && (
									<span className="text-[9px] font-bold text-gray-800 ml-1">
										— {tags.title}
									</span>
								)}
								<button
									className="text-[8px] font-mono ml-auto px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 cursor-pointer transition-colors"
									onClick={() => onTimeSelect?.(event.time)}
								>
									{TIME.date.format(event.time)}
								</button>
							</div>
							<div
								className="text-[9px] text-gray-600 leading-tight mt-1 break-words"
								style={{ overflowWrap: "anywhere" }}
							>
								{getEventDescription(
									event,
									viewingNation,
									onZoomToProvince,
									onWarSelect,
									onNationSelect,
								)}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
