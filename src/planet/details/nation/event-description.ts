/**
 * Event flavor-text generation for orogen history events.
 * Ported (and slimmed) from src/components/world/charts/NationTab/EventDetails.tsx.
 * Operates on orogen's HistoryNote shape: { tag, time, data }.
 *
 * Helpers that required legacy world data (terrain, rank titles, landmarks,
 * alliance membership) are stubbed to return null — they can be filled in
 * later once orogen exposes equivalents.
 */

import type { HistoryNote } from "@/model/history"
import { YEAR_MS } from "@/model/history/state"

type VictoryDegree =
	| "decisive"
	| "victory"
	| "pyrrhic"
	| "close"
	| "defeat"
	| "crushing"

export const eventDotColors: Record<string, string> = {
	succession: "#f43f5e",
	"dynasty spread": "#14b8a6",
	rebellion: "#f97316",
	"war started": "#f59e0b",
	battle: "#60a5fa",
	"war ended": "#10b981",
	vassalized: "#8b5cf6",
	"vassalage ended": "#ef4444",
	"personal union formed": "#c084fc",
	"personal union ended": "#ef4444",
	"alliance formed": "#22c55e",
	"alliance broken": "#ef4444",
	"regency started": "#a855f7",
	"regency ended": "#8b5cf6",
}

const VICTORY_LABELS: Record<VictoryDegree, string> = {
	decisive: "Decisive Victory",
	victory: "Victory",
	pyrrhic: "Pyrrhic Victory",
	close: "Close Defeat",
	defeat: "Defeat",
	crushing: "Crushing Defeat",
}

const VICTORY_COLORS: Record<VictoryDegree, string> = {
	decisive: "#059669",
	victory: "#10b981",
	pyrrhic: "#84cc16",
	close: "#f97316",
	defeat: "#ef4444",
	crushing: "#b91c1c",
}

const pick = <T>(arr: T[], seed: number): T =>
	arr[Math.abs(Math.floor(seed * 2654435761)) % arr.length]

const ordinal = (n: number): string => {
	const s = ["th", "st", "nd", "rd"]
	const v = n % 100
	return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export interface EventCtx {
	/** All past events through the viewed year, for streak/grudge/duration lookups. */
	pastEvents: HistoryNote[]
	/** Current view's nation selection, used to orient "we" vs "they". */
	viewingNation: number
}

// ─── Templates ──────────────────────────────────────────────────────

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
			[
				"a major battle",
				"a high-casualty engagement",
				"a significant conflict",
			],
			seed,
		)
	return pick(
		[
			"a large-scale battle",
			"a battle resulting in massive casualties",
			"a heavily destructive engagement",
		],
		seed,
	)
}

const oddsFlavor = (
	odds: number,
	won: boolean,
	seed: number,
): string | null => {
	if (won && odds < 0.25)
		return pick(
			[
				"despite severe numerical disadvantage",
				"in an unexpected tactical upset",
				"against unfavorable odds",
			],
			seed,
		)
	if (!won && odds > 0.75)
		return pick(
			[
				"despite significant numerical superiority",
				"in a major logistical failure",
				"a notable tactical collapse",
			],
			seed,
		)
	if (won && odds > 0.85)
		return pick(
			[
				"leveraging strong numerical advantages",
				"a conventional outcome",
				"securing an expected victory",
			],
			seed,
		)
	return null
}

const countPriorBattles = (
	pastEvents: HistoryNote[],
	warIdx: number,
	beforeTime: number,
): number => {
	let count = 0
	for (const e of pastEvents) {
		if (e.tag === "battle" && e.data.war === warIdx && e.time < beforeTime)
			count++
	}
	return count
}

const streakPhrase = (
	pastEvents: HistoryNote[],
	warIdx: number,
	time: number,
	seed: number,
): string | null => {
	const n = countPriorBattles(pastEvents, warIdx, time)
	if (n === 0)
		return pick(
			[
				"the first engagement of the conflict",
				"opening hostilities",
				"the initial military action",
			],
			seed,
		)
	if (n >= 8)
		return pick(
			[
				`the ${ordinal(n + 1)} major engagement characterizing this protracted conflict`,
				"a continuation of extended hostilities",
				`the ${ordinal(n + 1)} battle in a series of attritional clashes`,
			],
			seed,
		)
	if (n >= 4)
		return pick(
			[
				`the ${ordinal(n + 1)} battle of the campaign`,
				`part of ongoing military operations`,
			],
			seed,
		)
	return null
}

const seasonPhrase = (time: number, seed: number): string | null => {
	const MS_PER_MONTH = YEAR_MS / 12
	const month = Math.floor((time / MS_PER_MONTH) % 12)
	// 0-2 winter, 3-5 spring, 6-8 summer, 9-11 autumn (northern-hemisphere convention)
	if (month < 3)
		return pick(
			[
				"during a winter campaign",
				"in winter conditions",
				"during the winter months",
			],
			seed,
		)
	if (month >= 6 && month < 9)
		return pick(
			[
				"during a summer campaign",
				"in summer conditions",
				"during the summer months",
			],
			seed,
		)
	if (month >= 3 && month < 6 && seed % 3 === 0)
		return pick(["in early spring", "following the spring thaw"], seed)
	if (month >= 9 && seed % 3 === 0)
		return pick(
			["during the autumn campaign", "preceding the winter months"],
			seed,
		)
	return null
}

const warDurationPhrase = (
	pastEvents: HistoryNote[],
	warIdx: number,
	endTime: number,
	seed: number,
): string | null => {
	const started = pastEvents.find(
		(e) => e.tag === "war started" && e.data.war === warIdx,
	)
	if (!started) return null
	const years = Math.round((endTime - started.time) / YEAR_MS)
	if (years < 1)
		return pick(["concluding rapidly", "a short-lived conflict"], seed)
	if (years <= 3) return `a ${years}-year conflict`
	if (years <= 10) return `after ${years} years of hostilities`
	if (years <= 25) return `following ${years} years of protracted warfare`
	return `after an extended ${years}-year conflict`
}

const grudgePhrase = (
	pastEvents: HistoryNote[],
	attackerIdx: number,
	defenderIdx: number,
	currentWarIdx: number,
	seed: number,
): string | null => {
	let priorWarCount = 0
	for (const e of pastEvents) {
		if (
			e.tag === "war started" &&
			e.data.war !== currentWarIdx &&
			((e.data.attacker === attackerIdx && e.data.defender === defenderIdx) ||
				(e.data.attacker === defenderIdx && e.data.defender === attackerIdx))
		)
			priorWarCount++
	}
	if (priorWarCount === 0) return null
	if (priorWarCount === 1)
		return pick(
			["renewing previous hostilities", "in a continuation of prior conflict"],
			seed,
		)
	if (priorWarCount === 2)
		return pick(
			["the third war between the two powers", "a recurring conflict"],
			seed,
		)
	return `the ${ordinal(priorWarCount + 1)} instance of armed conflict between the nations`
}

const warStreakPhrase = (
	pastEvents: HistoryNote[],
	warIdx: number,
	beforeTime: number,
	viewingNation: number,
	seed: number,
): string | null => {
	const priorBattles = pastEvents.filter(
		(e): e is HistoryNote =>
			e.tag === "battle" && e.data.war === warIdx && e.time < beforeTime,
	)
	if (priorBattles.length === 0) return null

	priorBattles.sort((a, b) => b.time - a.time)
	const firstWon = priorBattles[0].data.winner === viewingNation
	let streak = 1
	for (let i = 1; i < priorBattles.length; i++) {
		if ((priorBattles[i].data.winner === viewingNation) === firstWon) streak++
		else break
	}
	if (streak < 3) return null

	if (firstWon) {
		if (streak >= 5)
			return pick(
				[
					`a ${ordinal(streak + 1)} consecutive tactical victory`,
					`${streak} successful engagements in a row`,
				],
				seed,
			)
		return pick(
			[
				`a ${ordinal(streak + 1)} consecutive tactical victory`,
				`a ${streak}-win streak`,
			],
			seed,
		)
	}
	if (streak >= 5)
		return pick(
			[
				"continuing a pattern of military setbacks",
				`a ${streak}-battle strategic losing streak continues`,
			],
			seed,
		)
	return pick(
		[
			`a ${ordinal(streak + 1)} consecutive tactical defeat`,
			"a continuation of tactical losses",
		],
		seed,
	)
}

// ─── Public API ─────────────────────────────────────────────────────

interface DisplayTags {
	primary: string
	secondary?: string
	title?: string
}

export function getDisplayTags(
	event: HistoryNote,
	viewingNation: number,
): DisplayTags {
	switch (event.tag) {
		case "battle": {
			const won = event.data.winner === viewingNation
			const degree = event.data.victoryDegree as VictoryDegree | undefined
			return {
				primary: "Battle",
				secondary:
					degree && won
						? VICTORY_LABELS[degree]
						: degree
							? VICTORY_LABELS[degree]
							: undefined,
				title: won ? "Victory" : "Defeat",
			}
		}
		case "war started":
			return {
				primary: "War",
				secondary:
					event.data.attacker === viewingNation ? "Declared" : "Defending",
			}
		case "war ended":
			return {
				primary: "War",
				secondary: event.data.winner === viewingNation ? "Won" : "Lost",
			}
		case "succession":
			return { primary: "Succession" }
		case "dynasty spread":
			return { primary: "Dynasty", secondary: "Spread" }
		case "rebellion":
			return {
				primary: "Rebellion",
				secondary:
					event.data.overlord === viewingNation ? "Subject" : "Freedom",
			}
		case "vassalized":
			return {
				primary: "Vassal",
				secondary:
					event.data.vassal === viewingNation
						? "Became Subject"
						: "Gained Subject",
			}
		case "vassalage ended":
			return {
				primary: "Vassal",
				secondary:
					event.data.vassal === viewingNation ? "Ended" : "Lost Subject",
			}
		case "personal union formed":
			return {
				primary: "Personal Union",
				secondary: event.data.junior === viewingNation ? "Junior" : "Senior",
			}
		case "personal union ended":
			return {
				primary: "Personal Union",
				secondary: "Ended",
			}
		case "regency started":
			return { primary: "Regency" }
		case "regency ended":
			return { primary: "Regency", secondary: "Ended" }
		default:
			return { primary: event.tag }
	}
}

export function getEventDotColor(
	event: HistoryNote,
	viewingNation: number,
): string {
	if (event.tag === "battle") {
		const degree = event.data.victoryDegree as VictoryDegree | undefined
		if (degree) {
			const won = event.data.winner === viewingNation
			if (won) return VICTORY_COLORS[degree]
			// Flip degree for viewer's perspective
			const flipped: Record<VictoryDegree, VictoryDegree> = {
				decisive: "crushing",
				victory: "defeat",
				pyrrhic: "close",
				close: "pyrrhic",
				defeat: "victory",
				crushing: "decisive",
			}
			return VICTORY_COLORS[flipped[degree]]
		}
	}
	return eventDotColors[event.tag] ?? "#9ca3af"
}

export function getEventDescription(event: HistoryNote, ctx: EventCtx): string {
	const { viewingNation, pastEvents } = ctx
	const seed = event.time
	const phrases: string[] = []

	switch (event.tag) {
		case "battle": {
			const attacker = event.data.attacker as number
			const defender = event.data.defender as number
			const winner = event.data.winner as number
			const degree = (event.data.victoryDegree as VictoryDegree) ?? "victory"
			const attackerCost = (event.data.attackerCost as number) ?? 0
			const defenderCost = (event.data.defenderCost as number) ?? 0
			const odds = (event.data.odds as number) ?? 0.5
			const warIdx = event.data.war as number
			const won = winner === viewingNation
			const weAreAttacker = viewingNation === attacker
			const opponent = weAreAttacker ? defender : attacker

			const verbSet = weAreAttacker ? ATTACK_WE_VERBS : DEFEND_WE_VERBS
			const verb = pick(verbSet[degree], seed)

			const scale = scalePhraseForCost(attackerCost + defenderCost, seed + 1)
			phrases.push(
				`#${viewingNation}${verb}#${opponent} in ${scale} (province #${event.data.province})`,
			)

			const odd = oddsFlavor(odds, won, seed + 2)
			if (odd) phrases.push(odd)

			const streakWar = warStreakPhrase(
				pastEvents,
				warIdx,
				event.time,
				viewingNation,
				seed + 3,
			)
			if (streakWar) phrases.push(streakWar)

			const streakBattle = streakPhrase(
				pastEvents,
				warIdx,
				event.time,
				seed + 4,
			)
			if (streakBattle) phrases.push(streakBattle)

			const season = seasonPhrase(event.time, seed + 5)
			if (season) phrases.push(season)

			return phrases.join(", ") + "."
		}
		case "war started": {
			const attacker = event.data.attacker as number
			const defender = event.data.defender as number
			const warIdx = event.data.war as number
			const weAreAttacker = viewingNation === attacker
			phrases.push(
				weAreAttacker
					? `#${viewingNation} declared war on #${defender}`
					: `#${attacker} declared war on #${viewingNation}`,
			)
			const grudge = grudgePhrase(
				pastEvents,
				attacker,
				defender,
				warIdx,
				seed + 1,
			)
			if (grudge) phrases.push(grudge)
			const season = seasonPhrase(event.time, seed + 2)
			if (season) phrases.push(season)
			return phrases.join(", ") + "."
		}
		case "war ended": {
			const attacker = event.data.attacker as number
			const defender = event.data.defender as number
			const winner = event.data.winner as number
			const warIdx = event.data.war as number
			const transferred = (event.data.transferred as number[]) ?? []
			const stalemate = event.data.stalemate as string | undefined
			const won = winner === viewingNation
			const opponent = viewingNation === attacker ? defender : attacker

			if (stalemate) {
				phrases.push(
					`The war between #${attacker} and #${defender} ended (${stalemate})`,
				)
			} else if (transferred.length > 0) {
				phrases.push(
					won
						? `#${viewingNation} won the war against #${opponent}, annexing ${transferred.length} province${transferred.length === 1 ? "" : "s"}`
						: `#${viewingNation} lost the war against #${opponent}, ceding ${transferred.length} province${transferred.length === 1 ? "" : "s"}`,
				)
			} else {
				phrases.push(
					`The war between #${attacker} and #${defender} ended without territorial change`,
				)
			}
			const dur = warDurationPhrase(pastEvents, warIdx, event.time, seed + 1)
			if (dur) phrases.push(dur)
			return phrases.join(", ") + "."
		}
		case "succession": {
			const nation = event.data.nation as number
			return `#${nation}: leader #${event.data.leader} was succeeded by leader #${event.data.successor}.`
		}
		case "dynasty spread": {
			const source = event.data.source as number | undefined
			const nation = event.data.nation as number
			const dynasty = event.data.dynasty as number | undefined
			return source !== undefined
				? `Dynasty #${dynasty ?? "?"} spread from #${source} to #${nation}.`
				: `Dynasty #${dynasty ?? "?"} spread to #${nation}.`
		}
		case "rebellion": {
			const overlord = event.data.overlord as number
			const subject = event.data.subject as number
			const duringSuccession = event.data.succession === true
			return duringSuccession
				? `#${subject} rebelled against #${overlord} during a succession crisis.`
				: `#${subject} rebelled against #${overlord}.`
		}
		case "vassalized": {
			const vassal = event.data.vassal as number
			const overlord = event.data.overlord as number
			return `#${vassal} became a vassal of #${overlord}.`
		}
		case "vassalage ended": {
			const vassal = event.data.vassal as number
			const overlord = event.data.overlord as number
			return `#${vassal} ended its vassalage under #${overlord}.`
		}
		case "personal union formed": {
			const junior = event.data.junior as number
			const senior = event.data.senior as number
			return `A personal union formed between #${junior} as junior partner and #${senior} as senior partner.`
		}
		case "personal union ended": {
			const junior = event.data.junior as number
			const senior = event.data.senior as number
			return `The personal union between #${junior} and #${senior} ended.`
		}
		case "regency started": {
			const age = (event.data.age as number) ?? 0
			return `A regency began for #${event.data.nation} (ruler aged ${age}).`
		}
		case "regency ended":
			return `The regency for #${event.data.nation} ended.`
		default:
			return event.tag
	}
}

/** Does this event concern the given nation? */
export function eventInvolvesNation(
	event: HistoryNote,
	nation: number,
): boolean {
	const d = event.data
	return (
		d.nation === nation ||
		d.attacker === nation ||
		d.defender === nation ||
		d.winner === nation ||
		d.overlord === nation ||
		d.subject === nation ||
		d.vassal === nation ||
		d.junior === nation ||
		d.senior === nation ||
		d.source === nation
	)
}

export function eventYear(event: HistoryNote): number {
	return Math.floor(event.time / YEAR_MS)
}
