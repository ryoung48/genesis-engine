import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import type { ArmyTradition } from "@/model/history/sim/engine/economy/types"
import { PEACE } from "@/model/history/sim/engine/events/peace"
import type { PeaceOutcome } from "@/model/history/sim/engine/events/peace/types"
import { TAX } from "@/model/history/sim/engine/events/tax"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import type { EngineNote } from "@/model/history/sim/engine/state/types"
import type {
	AttachedTracker,
	AttachParams,
	BattleSample,
	DistanceBand,
	DistanceBandParams,
	ExhaustionFloorParams,
	FiscalProbe,
	LogMilitaryParams,
	MilitaryReport,
	MilitaryWindow,
	ObserveNoteParams,
	QuantileParams,
	RatioParams,
	SampleParams,
	SummarizeParams,
	TieKindParams,
	TreasuryRole,
	WarEnding,
	WarEndingParams,
} from "@/test/history-run/report/military/types"

const TRADITIONS: ArmyTradition[] = ["settled", "tribal", "steppe"]

const BANDS: DistanceBand[] = ["near", "mid", "far"]
const ROLES: TreasuryRole[] = ["vassal", "overlord", "free"]

const RELATION_NAMES = Object.fromEntries(
	Object.entries(STATE.rel).map(([name, value]) => [value, name]),
) as Record<string, string>

const LONG_PEACE_YEARS = 20

function tieKind({
	tie,
}: TieKindParams): "alliance" | "vassal" | "union" | "war" | null {
	if (tie === STATE.rel.ALLY) return "alliance"
	if (tie === STATE.rel.VASSAL || tie === STATE.rel.OVERLORD) return "vassal"
	if (tie === STATE.rel.PU_JUNIOR || tie === STATE.rel.PU_SENIOR) return "union"
	if (tie === STATE.rel.WAR) return "war"
	return null
}

const FISCAL_PROBE: FiscalProbe = {
	surplus: ECONOMY.surplus,
	safe: ECONOMY.treasurySafe,
	maintenance: ({ state, p }) =>
		-TREASURY_BUDGET.get({ state, p }).stateMaintenance,
	leakage: ({ state, p }) => -TREASURY_BUDGET.get({ state, p }).treasuryLeakage,
}

function byTradition<T>(make: () => T): Record<ArmyTradition, T> {
	return { settled: make(), tribal: make(), steppe: make() }
}

function emptyWindow(): MilitaryWindow {
	return {
		sovereignYears: byTradition(() => 0),
		atWarYears: byTradition(() => 0),
		armyShare: byTradition<number[]>(() => []),
		armySize: byTradition<number[]>(() => []),
		deployed: byTradition<number[]>(() => []),
		manpowerAfterWar: byTradition<number[]>(() => []),
		warStarts: byTradition(() => 0),
		rebellions: byTradition(() => 0),
		rebellionsByGoal: {
			independence: byTradition(() => 0),
			throne: byTradition(() => 0),
		},
		backingRepaid: { vassal: 0, alliance: 0, trusted: 0, disposition: 0 },
		backersViaOverlord: 0,
		backersOverlord: 0,
		backersDisloyalVassal: 0,
		tributeWithheld: 0,
		callsRefused: 0,
		dispositionAid: 0,
		dispositionAbandoned: 0,
		throneVassalFreed: 0,
		vassalsChained: 0,
		tiePairs: {},
		firstTiePairs: {},
		lastTiePairs: {},
		dispositionPairs: {},
		vassalDispositionPairs: {},
		lastDispositionPairs: {},
		lastVassalDispositionPairs: {},
		vassalageEnded: 0,
		vassalageEndedByDisposition: {},
		vassalageEndedByCause: {},
		counterWars: 0,
		peacefulAnnexations: 0,
		vassalSamples: 0,
		vassalPairs: 0,
		alliances: 0,
		alliancesFormed: 0,
		alliancesEnded: 0,
		vassalsFormed: 0,
		invalidAlliances: 0,
		relationPairs: {},
		completed: [],
		battles: [],
		repeatStrength: [],
		raids: byTradition(() => ({ count: 0, success: 0, loot: 0, atSafe: 0 })),
		fiscal: byTradition(() => ({
			revenue: 0,
			maintenance: 0,
			army: 0,
			leakage: 0,
			tributePaid: 0,
			tributeReceived: 0,
			indemnityPaid: 0,
			indemnityReceived: 0,
			unpaid: 0,
		})),
		treasury: byTradition(() => ({
			ratios: [] as number[],
			positiveYears: 0,
			negative: 0,
			aboveSafe: 0,
			aboveFiveSafe: 0,
			nonPositiveSurplus: 0,
			nonPositiveNegative: 0,
		})),
		treasuryByRole: Object.fromEntries(
			ROLES.map((role) => [
				role,
				{
					ratios: [] as number[],
					positiveYears: 0,
					negative: 0,
					aboveSafe: 0,
					aboveFiveSafe: 0,
					nonPositiveSurplus: 0,
					nonPositiveNegative: 0,
				},
			]),
		) as MilitaryWindow["treasuryByRole"],
		treasuryByBand: { near: [], mid: [], far: [] },
		warStartTreasury: [],
		sacks: [],
		firstBattleSettled: 0,
		firstBattleBelowExhaustion: 0,
		longPeaceSettled: 0,
		longPeaceNegative: 0,
		recoveryYears: [],
		recoveryCensored: 0,
	}
}

function quantile({ values, q }: QuantileParams): number {
	if (values.length === 0) return Number.NaN
	const sorted = [...values].sort((a, b) => a - b)
	const position = (sorted.length - 1) * q
	const lo = Math.floor(position)
	const hi = Math.ceil(position)
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (position - lo)
}

function median(values: number[]): number {
	return quantile({ values, q: 0.5 })
}

function p90(values: number[]): number {
	return quantile({ values, q: 0.9 })
}

function ratio({ count, total }: RatioParams): number {
	return count / Math.max(1, total)
}

function share(flags: boolean[]): number {
	return flags.filter(Boolean).length / Math.max(1, flags.length)
}

function distanceBand({ engine, nation }: DistanceBandParams): DistanceBand {
	let weighted = 0
	let total = 0
	for (const p of STATE.getNationProvinces({ state: engine, root: nation })) {
		if (engine.desolate[p]) continue
		const output = ECONOMY.provinceOutput({ state: engine, p })
		weighted +=
			output * ECONOMY.travelDays({ state: engine, capital: nation, p })
		total += output
	}
	const days = total > 0 ? weighted / total : 0
	if (days < 30) return "near"
	return days < 90 ? "mid" : "far"
}

function exhaustionFloor({
	engine,
	nation,
	probe,
}: ExhaustionFloorParams): number {
	return -0.5 * Math.max(0, probe.surplus({ state: engine, p: nation }))
}

function observeBattle({ engine, tracker, note }: ObserveNoteParams): void {
	const data = note.data
	const warIdx = data.war as number
	const war = engine.wars[warIdx]
	const window = tracker.window
	const attackerArmy = data.attackerArmy as number
	const defenderArmy = data.defenderArmy as number
	const effectiveDefense =
		defenderArmy * ((data.terrainDefense as number | undefined) ?? 1.2)
	const attackerWon = data.winner === data.attacker
	const sample: BattleSample = {
		attackerWon,
		attackerLossPct: data.attackerLosses as number,
		defenderLossPct: data.defenderLosses as number,
		weakerWon:
			attackerArmy === effectiveDefense
				? null
				: attackerArmy < effectiveDefense
					? attackerWon
					: !attackerWon,
		result: (data.result as string | undefined) ?? "n/a",
		initial: (data.initialResult as string | undefined) ?? "n/a",
		routed: (data.result as string | undefined) === "rout",
		shortfall: (data.loserShortfall as number | undefined) ?? 0,
		topography: (data.topography as string | undefined) ?? "n/a",
		vegetation: (data.vegetation as string | undefined) ?? "n/a",
		water: (data.waterTarget as boolean | undefined) ?? false,
		knowledge: Math.floor(
			ECONOMY.realmKnowledge({ state: engine, p: data.attacker as number }),
		),
		casualties:
			(attackerArmy * (data.attackerLosses as number)) / 100 +
			(defenderArmy * (data.defenderLosses as number)) / 100,
	}
	window.battles.push(sample)
	if (!tracker.warTradition.has(warIdx)) return
	tracker.warBattles.set(warIdx, (tracker.warBattles.get(warIdx) ?? 0) + 1)
	const strength = data.attacker === war.attacker ? attackerArmy : defenderArmy
	const previous = tracker.lastStrength.get(warIdx)
	if (previous !== undefined && previous > 0)
		window.repeatStrength.push(strength / previous)
	tracker.lastStrength.set(warIdx, strength)
	if (
		attackerWon &&
		data.province === war.defender &&
		data.attacker === war.attacker
	) {
		const loserRevenue = ECONOMY.revenue({ state: engine, p: war.defender })
		if (loserRevenue > 0)
			window.sacks.push((data.plunder as number) / loserRevenue)
	}
	if (tracker.firstBattle.has(warIdx)) return
	tracker.firstBattle.add(warIdx)
	for (const nation of [war.attacker, war.defender]) {
		if (ECONOMY.armyTradition({ state: engine, p: nation }) !== "settled")
			continue
		window.firstBattleSettled++
		if (
			engine.treasuryCurrent[nation] <
			exhaustionFloor({ engine, nation, probe: tracker.probe })
		)
			window.firstBattleBelowExhaustion++
	}
}

function warEnding({ engine, note }: WarEndingParams): WarEnding {
	const data = note.data
	const war = engine.wars[data.war as number]
	if (data.reason === "capital taken") return "capital"
	if (data.reason === "both exhausted") return "exhaustion"
	if (
		["no target", "no troops", "not sovereign"].includes(data.reason as string)
	)
		return "stalled"
	if (
		MILITARY.exhausted({ state: engine, nation: war.attacker }) ||
		MILITARY.exhausted({ state: engine, nation: war.defender })
	)
		return "exhaustion"
	return "settlement"
}

function observeNote({ engine, tracker, note }: ObserveNoteParams): void {
	const window = tracker.window
	const data = note.data
	if (note.tag === "war started") {
		if (note.time < engine.time) return
		const attacker = data.attacker as number
		const defender = data.defender as number
		const tradition = ECONOMY.armyTradition({ state: engine, p: attacker })
		tracker.warTradition.set(data.war as number, tradition)
		const startedWar = engine.wars[data.war as number]
		const crown = STATE.warSides({ war: startedWar }).crown
		tracker.warInVassal.set(
			data.war as number,
			crown >= 0 &&
				STATE.diplomaticOverlord({ state: engine, nation: crown }) >= 0,
		)
		window.warStarts[tradition]++
		if (
			tracker.vassalageEnded.some(
				(ended) =>
					ended.time === note.time &&
					ended.data.overlord === attacker &&
					ended.data.vassal === defender,
			)
		)
			window.counterWars++
		for (const nation of [attacker, defender]) {
			tracker.recovering.delete(nation)
			const surplus = tracker.probe.surplus({ state: engine, p: nation })
			const safe = tracker.probe.safe({ state: engine, p: nation })
			if (surplus <= 0 || safe <= 0) continue
			window.warStartTreasury.push({
				tradition: ECONOMY.armyTradition({ state: engine, p: nation }),
				band: distanceBand({ engine, nation }),
				inSurplus: engine.treasuryCurrent[nation] / surplus,
				inSafe: engine.treasuryCurrent[nation] / safe,
			})
		}
	} else if (note.tag === "rebellion") {
		if (note.time < engine.time) return
		const tradition = ECONOMY.armyTradition({
			state: engine,
			p: data.overlord as number,
		})
		window.rebellions[tradition]++
		window.rebellionsByGoal[data.goal === "throne" ? "throne" : "independence"][
			tradition
		]++
	} else if (note.tag === "backing repaid") {
		window.backingRepaid[data.pact as keyof typeof window.backingRepaid]++
	} else if (note.tag === "rebels backed") {
		if (data.via === "overlord") window.backersViaOverlord++
		if (
			data.backer ===
			STATE.diplomaticOverlord({ state: engine, nation: data.crown as number })
		)
			window.backersOverlord++
		if (
			STATE.diplomaticOverlord({
				state: engine,
				nation: data.backer as number,
			}) === data.crown
		)
			window.backersDisloyalVassal++
	} else if (note.tag === "tribute withheld") {
		window.tributeWithheld++
	} else if (note.tag === "alliance formed") {
		window.alliancesFormed++
	} else if (note.tag === "alliance ended") {
		window.alliancesEnded++
	} else if (note.tag === "vassalized") {
		window.vassalsFormed++
	} else if (note.tag === "call refused") {
		window.callsRefused++
	} else if (note.tag === "disposition changed") {
		if (data.cause === "aid") window.dispositionAid++
		if (data.cause === "abandoned") window.dispositionAbandoned++
	} else if (note.tag === "peaceful annexation") {
		window.peacefulAnnexations++
	} else if (note.tag === "vassalage ended") {
		window.vassalageEnded++
		const cause = typeof data.cause === "string" ? data.cause : "structural"
		window.vassalageEndedByCause[cause] =
			(window.vassalageEndedByCause[cause] ?? 0) + 1
		if (typeof data.disposition === "string") {
			const level = data.disposition
			window.vassalageEndedByDisposition[level] =
				(window.vassalageEndedByDisposition[level] ?? 0) + 1
		}
		if (data.cause === "regime change") window.throneVassalFreed++
		tracker.vassalageEnded = tracker.vassalageEnded.filter(
			(ended) => ended.time === note.time,
		)
		tracker.vassalageEnded.push(note)
	} else if (note.tag === "battle") {
		observeBattle({ engine, tracker, note })
	} else if (note.tag === "raid") {
		const raider = data.raider as number
		const raids =
			window.raids[ECONOMY.armyTradition({ state: engine, p: raider })]
		raids.count++
		if (!data.success) return
		raids.success++
		raids.loot += data.loot as number
		const safe = tracker.probe.safe({ state: engine, p: raider })
		if (safe > 0 && engine.treasuryCurrent[raider] >= safe * (1 - 1e-9))
			raids.atSafe++
	} else if (note.tag === "war ended") {
		const warIdx = data.war as number
		const war = engine.wars[warIdx]
		for (const nation of [war.attacker, war.defender]) {
			if (!STATE.isSovereign({ state: engine, p: nation })) continue
			const tradition = ECONOMY.armyTradition({ state: engine, p: nation })
			const max = ECONOMY.maxManpower({ state: engine, p: nation })
			if (max > 0)
				window.manpowerAfterWar[tradition].push(
					engine.manpowerCurrent[nation] / max,
				)
			if (
				tradition !== "settled" &&
				engine.treasuryCurrent[nation] <
					tracker.probe.safe({ state: engine, p: nation })
			)
				tracker.recovering.set(nation, note.time)
		}
		const tradition = tracker.warTradition.get(warIdx)
		if (tradition === undefined) return
		window.completed.push({
			years: (note.time - war.startTime) / STATE.yearMs,
			tradition,
			attackerWon: data.winner === war.attacker,
			ending: warEnding({ engine, note }),
			outcome: data.outcome as PeaceOutcome,
			payment: data.payment as number,
			goal: war.goal,
			backers: war.backers.length,
			inVassal: tracker.warInVassal.get(warIdx) ?? false,
			rebelIndependent:
				war.goal === "independence" && data.winner === war.defender,
		})
		tracker.warTradition.delete(warIdx)
		tracker.warInVassal.delete(warIdx)
		tracker.warBattles.delete(warIdx)
		tracker.lastStrength.delete(warIdx)
	}
}

function attach({ engine, probe }: AttachParams): AttachedTracker {
	const tracker = {
		probe,
		warTradition: new Map(),
		warInVassal: new Map(),
		warBattles: new Map(),
		lastStrength: new Map(),
		firstBattle: new Set<number>(),
		vassalageEnded: [] as EngineNote[],
		recovering: new Map(),
		peaceYears: new Map(),
		window: emptyWindow(),
	}
	const initial = tracker.window.firstTiePairs
	for (let nation = 0; nation < engine.P; nation++) {
		if (
			engine.desolate[nation] ||
			!STATE.isSovereign({ state: engine, p: nation })
		)
			continue
		for (const other of engine.relationColumns[nation]) {
			if (
				other <= nation ||
				engine.desolate[other] ||
				!STATE.isSovereign({ state: engine, p: other })
			)
				continue
			const kind = tieKind({
				tie: STATE.getRelation({ state: engine, a: nation, b: other }),
			})
			if (kind) initial[kind] = (initial[kind] ?? 0) + 1
		}
	}
	const events = engine.events
	const push = events.push.bind(events)
	events.push = (...notes) => {
		for (const note of notes) observeNote({ engine, tracker, note })
		return push(...notes)
	}
	const runTax = TAX.runTax
	TAX.runTax = (params) => {
		const { state, nation, previousTime } = params
		const sovereign = STATE.isSovereign({ state, p: nation })
		const overlord = STATE.diplomaticOverlord({ state, nation })
		const receivers = state.indemnities
			.filter(
				(entry) =>
					entry.payer === nation &&
					entry.until > state.time &&
					STATE.isSovereign({ state, p: entry.receiver }),
			)
			.map((entry) => entry.receiver)
		const yearFraction = (state.time - previousTime) / STATE.yearMs
		const nominal = sovereign
			? MILITARY.upkeep({ state, nation }) * yearFraction
			: 0
		runTax(params)
		if (!sovereign) return
		const budget = TREASURY_BUDGET.get({ state, p: nation })
		const fiscal =
			tracker.window.fiscal[ECONOMY.armyTradition({ state, p: nation })]
		fiscal.revenue += budget.taxes
		fiscal.maintenance += probe.maintenance({ state, p: nation })
		fiscal.army -= budget.armyExpenses
		fiscal.leakage += probe.leakage({ state, p: nation })
		fiscal.unpaid += Math.max(0, nominal + budget.armyExpenses)
		if (budget.tribute < 0) {
			fiscal.tributePaid -= budget.tribute
			tracker.window.fiscal[
				ECONOMY.armyTradition({ state, p: overlord })
			].tributeReceived -= budget.tribute
		}
		if (budget.indemnity < 0) {
			fiscal.indemnityPaid -= budget.indemnity
			for (const receiver of receivers)
				tracker.window.fiscal[
					ECONOMY.armyTradition({ state, p: receiver })
				].indemnityReceived += PEACE.indemnityShare * budget.taxes
		}
	}
	return {
		tracker,
		detach: () => {
			TAX.runTax = runTax
			events.push = push
		},
	}
}

function sample({ engine, tracker, sampleRelations }: SampleParams): void {
	const window = tracker.window
	for (let nation = 0; nation < engine.P; nation++) {
		if (
			engine.desolate[nation] ||
			engine.stateless[nation] ||
			!STATE.isSovereign({ state: engine, p: nation })
		)
			continue
		const tradition = ECONOMY.armyTradition({ state: engine, p: nation })
		const population = STATE.getNationPopulation({
			state: engine,
			root: nation,
		})
		const army = MILITARY.armySize({ state: engine, nation })
		const atWar = engine.provinceWars[nation].length > 0
		window.sovereignYears[tradition]++
		window.armySize[tradition].push(army)
		if (population > 0) window.armyShare[tradition].push(army / population)
		if (atWar) {
			window.atWarYears[tradition]++
			let deployed = 0
			for (const idx of engine.activeWarIds)
				deployed += engine.wars[idx].deployed[nation] ?? 0
			window.deployed[tradition].push(deployed)
		}
		const treasury = engine.treasuryCurrent[nation]
		const surplus = tracker.probe.surplus({ state: engine, p: nation })
		const safe = tracker.probe.safe({ state: engine, p: nation })
		const totals = window.treasury[tradition]
		const role: TreasuryRole =
			STATE.diplomaticOverlord({ state: engine, nation }) >= 0
				? "vassal"
				: [...engine.relationColumns[nation]].some(
							(other) =>
								STATE.diplomaticOverlord({ state: engine, nation: other }) ===
								nation,
						)
					? "overlord"
					: "free"
		const roleTotals = window.treasuryByRole[role]
		if (surplus > 0 && safe > 0) {
			totals.positiveYears++
			roleTotals.positiveYears++
			totals.ratios.push(treasury / safe)
			roleTotals.ratios.push(treasury / safe)
			if (treasury < 0) totals.negative++
			if (treasury < 0) roleTotals.negative++
			if (treasury > safe) totals.aboveSafe++
			if (treasury > 5 * safe) totals.aboveFiveSafe++
			window.treasuryByBand[distanceBand({ engine, nation })].push(
				treasury / safe,
			)
		} else {
			totals.nonPositiveSurplus++
			if (treasury < 0) totals.nonPositiveNegative++
		}
		const peace = atWar ? 0 : (tracker.peaceYears.get(nation) ?? 0) + 1
		tracker.peaceYears.set(nation, peace)
		if (peace >= LONG_PEACE_YEARS && tradition === "settled") {
			window.longPeaceSettled++
			if (treasury < 0) window.longPeaceNegative++
		}
	}
	for (const [nation, since] of tracker.recovering) {
		if (
			!STATE.isSovereign({ state: engine, p: nation }) ||
			engine.provinceWars[nation].length > 0
		) {
			window.recoveryCensored++
			tracker.recovering.delete(nation)
		} else if (
			engine.treasuryCurrent[nation] >=
			tracker.probe.safe({ state: engine, p: nation }) * (1 - 1e-9)
		) {
			window.recoveryYears.push((engine.time - since) / STATE.yearMs)
			tracker.recovering.delete(nation)
		}
	}
	if (!sampleRelations) return
	window.vassalSamples++
	const beforeTies = { ...window.tiePairs }
	const beforeDispositions = { ...window.dispositionPairs }
	const beforeVassalDispositions = { ...window.vassalDispositionPairs }
	for (let nation = 0; nation < engine.P; nation++) {
		if (
			engine.desolate[nation] ||
			!STATE.isSovereign({ state: engine, p: nation })
		)
			continue
		for (const other of engine.relationColumns[nation])
			if (
				STATE.getRelation({ state: engine, a: other, b: nation }) ===
				STATE.rel.VASSAL
			) {
				window.vassalPairs++
				const level = STATE.getDisposition({
					state: engine,
					a: nation,
					b: other,
				})
				window.vassalDispositionPairs[level] =
					(window.vassalDispositionPairs[level] ?? 0) + 1
				if (STATE.diplomaticOverlord({ state: engine, nation: other }) >= 0)
					window.vassalsChained++
			}
		for (const other of engine.relationColumns[nation]) {
			if (
				other <= nation ||
				engine.desolate[other] ||
				!STATE.isSovereign({ state: engine, p: other })
			)
				continue
			const tie = STATE.getRelation({ state: engine, a: nation, b: other })
			const kind = tieKind({ tie })
			if (kind) window.tiePairs[kind] = (window.tiePairs[kind] ?? 0) + 1
			if (tie !== STATE.rel.ALLY) continue
			window.alliances++
			if (!STATE.canAlly({ state: engine, a: nation, b: other }))
				window.invalidAlliances++
		}
		for (const other of STATE.getNationNeighbors({ state: engine, nation })) {
			if (other < nation) continue
			const disposition = STATE.getDisposition({
				state: engine,
				a: nation,
				b: other,
			})
			window.dispositionPairs[disposition] =
				(window.dispositionPairs[disposition] ?? 0) + 1
			const name =
				RELATION_NAMES[
					STATE.getRelation({ state: engine, a: nation, b: other })
				]
			window.relationPairs[name] = (window.relationPairs[name] ?? 0) + 1
		}
	}
	const censusTies = Object.fromEntries(
		Object.entries(window.tiePairs).map(([kind, count]) => [
			kind,
			count - (beforeTies[kind] ?? 0),
		]),
	)
	window.lastTiePairs = censusTies
	window.lastDispositionPairs = Object.fromEntries(
		Object.entries(window.dispositionPairs).map(([level, count]) => [
			level,
			count - (beforeDispositions[level] ?? 0),
		]),
	)
	window.lastVassalDispositionPairs = Object.fromEntries(
		Object.entries(window.vassalDispositionPairs).map(([level, count]) => [
			level,
			count - (beforeVassalDispositions[level] ?? 0),
		]),
	)
}

function summarize({ tracker }: SummarizeParams): MilitaryReport {
	const window = tracker.window
	const report: MilitaryReport = {}
	for (const tradition of TRADITIONS) {
		const years = window.sovereignYears[tradition]
		const sovereigns = years / 100
		report[`sovereignYears.${tradition}`] = years
		report[`activeWarShare.${tradition}`] =
			window.atWarYears[tradition] / Math.max(1, years)
		report[`armyShare.p50.${tradition}`] = median(window.armyShare[tradition])
		report[`armyShare.p90.${tradition}`] = p90(window.armyShare[tradition])
		report[`armySize.p50.${tradition}`] = median(window.armySize[tradition])
		report[`armySize.p90.${tradition}`] = p90(window.armySize[tradition])
		report[`deployed.p50.${tradition}`] = median(window.deployed[tradition])
		report[`deployed.p90.${tradition}`] = p90(window.deployed[tradition])
		report[`manpowerAfterWar.p50.${tradition}`] = median(
			window.manpowerAfterWar[tradition],
		)
		report[`warStarts.n.${tradition}`] = window.warStarts[tradition]
		report[`warStarts.perSovereign.${tradition}`] =
			window.warStarts[tradition] / Math.max(1e-9, sovereigns)
		report[`rebellions.n.${tradition}`] = window.rebellions[tradition]
		for (const goal of ["independence", "throne"] as const)
			report[`rebellions.${goal}.n.${tradition}`] =
				window.rebellionsByGoal[goal][tradition]
		report[`rebellions.perSovereign.${tradition}`] =
			window.rebellions[tradition] / Math.max(1e-9, sovereigns)
		const raids = window.raids[tradition]
		report[`raids.n.${tradition}`] = raids.count
		report[`raids.successShare.${tradition}`] =
			raids.success / Math.max(1, raids.count)
		report[`raids.lootPerSuccess.${tradition}`] =
			raids.loot / Math.max(1, raids.success)
		report[`raids.atSafeShare.${tradition}`] =
			raids.atSafe / Math.max(1, raids.success)
		const fiscal = window.fiscal[tradition]
		const revenue = Math.max(1e-12, fiscal.revenue)
		report[`fiscal.revenue.${tradition}`] = fiscal.revenue
		report[`fiscal.maintenanceShare.${tradition}`] =
			fiscal.maintenance / revenue
		report[`fiscal.armyShare.${tradition}`] = fiscal.army / revenue
		report[`fiscal.leakageShare.${tradition}`] = fiscal.leakage / revenue
		report[`fiscal.unpaidShare.${tradition}`] = fiscal.unpaid / revenue
		report[`fiscal.tributePaidShare.${tradition}`] =
			fiscal.tributePaid / revenue
		report[`fiscal.tributeReceivedShare.${tradition}`] =
			fiscal.tributeReceived / revenue
		report[`fiscal.indemnityPaidShare.${tradition}`] =
			fiscal.indemnityPaid / revenue
		report[`fiscal.indemnityReceivedShare.${tradition}`] =
			fiscal.indemnityReceived / revenue
		report[`fiscal.netShare.${tradition}`] =
			(fiscal.revenue -
				fiscal.maintenance -
				fiscal.army -
				fiscal.leakage -
				fiscal.tributePaid +
				fiscal.tributeReceived -
				fiscal.indemnityPaid +
				fiscal.indemnityReceived) /
			revenue
		const treasury = window.treasury[tradition]
		const positive = Math.max(1, treasury.positiveYears)
		report[`treasury.ratio.p50.${tradition}`] = median(treasury.ratios)
		report[`treasury.negativeShare.${tradition}`] = treasury.negative / positive
		report[`treasury.aboveSafeShare.${tradition}`] =
			treasury.aboveSafe / positive
		report[`treasury.aboveFiveSafeShare.${tradition}`] =
			treasury.aboveFiveSafe / positive
		report[`treasury.nonPositiveSurplusYears.${tradition}`] =
			treasury.nonPositiveSurplus
		report[`treasury.nonPositiveNegativeShare.${tradition}`] =
			treasury.nonPositiveNegative / Math.max(1, treasury.nonPositiveSurplus)
		const starts = window.warStartTreasury.filter(
			(start) => start.tradition === tradition,
		)
		report[`warStartTreasury.inSurplus.p50.${tradition}`] = median(
			starts.map((start) => start.inSurplus),
		)
		report[`warStartTreasury.inSafe.p50.${tradition}`] = median(
			starts.map((start) => start.inSafe),
		)
	}
	for (const role of ROLES) {
		const totals = window.treasuryByRole[role]
		report[`treasury.ratio.p50.role.${role}`] = median(totals.ratios)
		report[`treasury.negativeShare.role.${role}`] =
			totals.negative / Math.max(1, totals.positiveYears)
		report[`treasury.roleYears.${role}`] = totals.positiveYears
	}
	report["fiscal.tributeImbalance"] = Math.abs(
		TRADITIONS.reduce(
			(sum, t) =>
				sum + window.fiscal[t].tributePaid - window.fiscal[t].tributeReceived,
			0,
		),
	)
	for (const band of BANDS) {
		report[`treasury.ratio.p50.${band}`] = median(window.treasuryByBand[band])
		report[`treasury.bandYears.${band}`] = window.treasuryByBand[band].length
		const starts = window.warStartTreasury.filter(
			(start) => start.band === band,
		)
		report[`warStartTreasury.inSafe.p50.${band}`] = median(
			starts.map((start) => start.inSafe),
		)
	}
	const totalSovereigns =
		TRADITIONS.reduce((sum, t) => sum + window.sovereignYears[t], 0) / 100
	report["vassalageEnded.n"] = window.vassalageEnded
	for (const [cause, count] of Object.entries(window.vassalageEndedByCause))
		report[`vassalage.ended.cause.${cause}`] = count
	report["vassals.mean"] =
		window.vassalPairs / Math.max(1, window.vassalSamples)
	report["alliances.mean"] =
		window.alliances / Math.max(1, window.vassalSamples)
	report["alliances.invalid"] = window.invalidAlliances
	const sovereignYears = Math.max(1, totalSovereigns * 100)
	report["ties.alliance.formed.perSovereignYear"] =
		window.alliancesFormed / sovereignYears
	report["ties.alliance.ended.perSovereignYear"] =
		window.alliancesEnded / sovereignYears
	report["ties.vassal.formed.perSovereignYear"] =
		window.vassalsFormed / sovereignYears
	const vassalTiesEnded = Math.max(
		0,
		(window.firstTiePairs.vassal ?? 0) +
			window.vassalsFormed -
			(window.lastTiePairs.vassal ?? 0),
	)
	report["ties.vassal.ended.perSovereignYear"] =
		vassalTiesEnded / sovereignYears
	report["vassalage.ended.implicit.n"] = Math.max(
		0,
		vassalTiesEnded - window.vassalageEnded,
	)
	report["vassalageEnded.perVassal"] =
		window.vassalageEnded /
		Math.max(1e-9, window.vassalPairs / Math.max(1, window.vassalSamples))
	report["counterWars.n"] = window.counterWars
	report["peacefulAnnexations.n"] = window.peacefulAnnexations
	const relationTotal = Object.values(window.relationPairs).reduce(
		(sum, count) => sum + count,
		0,
	)
	for (const [name, count] of Object.entries(window.relationPairs))
		report[`relationShare.${name}`] = count / Math.max(1, relationTotal)
	report["warStarts.n"] = TRADITIONS.reduce(
		(sum, t) => sum + window.warStarts[t],
		0,
	)
	report["warStarts.perSovereign"] =
		report["warStarts.n"] / Math.max(1e-9, totalSovereigns)
	const completed = window.completed
	const settledLed = completed.filter((war) => war.tradition === "settled")
	report["wars.completed.n"] = completed.length
	report["wars.years.p50"] = median(completed.map((war) => war.years))
	report["wars.years.p90"] = p90(completed.map((war) => war.years))
	report["wars.settled.completed.n"] = settledLed.length
	report["wars.settled.years.p50"] = median(settledLed.map((war) => war.years))
	report["wars.settled.years.p90"] = p90(settledLed.map((war) => war.years))
	report["wars.attackerWinShare"] = share(
		completed.map((war) => war.attackerWon),
	)
	for (const ending of ["capital", "settlement", "stalled", "exhaustion"]) {
		report[`wars.ending.${ending}`] = share(
			completed.map((war) => war.ending === ending),
		)
		report[`wars.settled.ending.${ending}`] = share(
			settledLed.map((war) => war.ending === ending),
		)
	}
	for (const outcome of [
		"annexation",
		"restoration",
		"cession",
		"indemnity",
		"bought peace",
		"white peace",
		"independence",
		"lapsed",
	])
		report[`wars.outcome.${outcome}`] = share(
			completed.map((war) => war.outcome === outcome),
		)
	for (const tradition of TRADITIONS) {
		const wars = completed.filter((war) => war.tradition === tradition)
		report[`wars.outcome.bought peace.${tradition}`] = share(
			wars.map((war) => war.outcome === "bought peace"),
		)
	}
	report["wars.indemnityPerCentury"] = TRADITIONS.reduce(
		(sum, tradition) => sum + window.fiscal[tradition].indemnityPaid,
		0,
	)
	report["wars.boughtPeacePerCentury"] = completed.reduce(
		(sum, war) => sum + (war.outcome === "bought peace" ? war.payment : 0),
		0,
	)
	const rebelWars = completed.filter((war) => war.goal === "independence")
	const allRebelWars = completed.filter((war) => war.goal !== "conquest")
	const throneWars = completed.filter((war) => war.goal === "throne")
	report["rebelWars.completed.n"] = rebelWars.length
	report["rebelWars.independent.n"] = rebelWars.filter(
		(war) => war.rebelIndependent,
	).length
	report["rebelWars.successShare"] = ratio({
		count: report["rebelWars.independent.n"],
		total: rebelWars.length,
	})
	report["throneWars.completed.n"] = throneWars.length
	for (const [outcome, name] of [
		["regime change", "regimeChange"],
		["submission", "submission"],
		["cession", "cession"],
	] as const)
		report[`throneWars.${name}.n`] = throneWars.filter(
			(war) => war.outcome === outcome,
		).length
	report["rebelWars.backed.share"] = share(
		allRebelWars.map((war) => war.backers > 0),
	)
	report["backers.perBackedWar"] =
		allRebelWars.reduce((sum, war) => sum + war.backers, 0) /
		Math.max(1, allRebelWars.filter((war) => war.backers > 0).length)
	for (const backed of [true, false]) {
		const wars = allRebelWars.filter((war) => war.backers > 0 === backed)
		report[`rebelWars.successShare.${backed ? "backed" : "unbacked"}`] = share(
			wars.map(
				(war) =>
					war.outcome === "independence" ||
					war.outcome === "regime change" ||
					(war.outcome === "cession" && war.goal === "throne"),
			),
		)
	}
	report["rebelWars.inVassal.n"] = allRebelWars.filter(
		(war) => war.inVassal,
	).length
	report["backers.viaOverlord.n"] = window.backersViaOverlord
	report["backers.overlord.n"] = window.backersOverlord
	report["backers.disloyalVassal.n"] = window.backersDisloyalVassal
	report["throneWars.vassalFreed.n"] = window.throneVassalFreed
	for (const [pact, count] of Object.entries(window.backingRepaid))
		report[`backing.repaid.${pact}.n`] = count
	report["tribute.withheld.n"] = window.tributeWithheld
	report["calls.refused.n"] = window.callsRefused
	report["disposition.aid.n"] = window.dispositionAid
	report["disposition.abandoned.n"] = window.dispositionAbandoned
	report["vassals.chained.n"] =
		window.vassalsChained / Math.max(1, window.vassalSamples)
	for (const [level, count] of Object.entries(
		window.vassalageEndedByDisposition,
	))
		report[`vassalage.ended.perVassalYear.${level.toLowerCase()}`] =
			count / Math.max(1, window.vassalDispositionPairs[level] ?? 0)
	for (const [kind, count] of Object.entries(window.tiePairs))
		report[`ties.${kind}.n`] = count / Math.max(1, window.vassalSamples)
	for (const kind of ["alliance", "vassal", "union", "war"])
		for (const [time, counts] of [
			["initial", window.firstTiePairs],
			["horizon", window.lastTiePairs],
		] as const)
			report[`ties.${kind}.${time}.n`] = counts[kind] ?? 0
	const dispositionTotal = Object.values(window.dispositionPairs).reduce(
		(sum, n) => sum + n,
		0,
	)
	for (const [level, count] of Object.entries(window.dispositionPairs))
		report[`dispositions.${level.toLowerCase()}.share`] =
			count / Math.max(1, dispositionTotal)
	const horizonDispositionTotal = Object.values(
		window.lastDispositionPairs,
	).reduce((sum, n) => sum + n, 0)
	for (const [level, count] of Object.entries(window.lastDispositionPairs))
		report[`dispositions.${level.toLowerCase()}.horizon.share`] =
			count / Math.max(1, horizonDispositionTotal)
	const vassalDispositionTotal = Object.values(
		window.vassalDispositionPairs,
	).reduce((sum, n) => sum + n, 0)
	for (const [level, count] of Object.entries(window.vassalDispositionPairs))
		report[`vassals.disposition.${level.toLowerCase()}.share`] =
			count / Math.max(1, vassalDispositionTotal)
	const horizonVassalDispositionTotal = Object.values(
		window.lastVassalDispositionPairs,
	).reduce((sum, n) => sum + n, 0)
	for (const [level, count] of Object.entries(
		window.lastVassalDispositionPairs,
	))
		report[`vassals.disposition.${level.toLowerCase()}.horizon.share`] =
			count / Math.max(1, horizonVassalDispositionTotal)
	const battles = window.battles
	report["battles.n"] = battles.length
	report["battles.perCompletedWar"] =
		battles.length / Math.max(1, completed.length)
	report["battles.attackerWinShare"] = share(
		battles.map((battle) => battle.attackerWon),
	)
	report["battles.attackerLossPct.p50"] = median(
		battles.map((battle) => battle.attackerLossPct),
	)
	report["battles.defenderLossPct.p50"] = median(
		battles.map((battle) => battle.defenderLossPct),
	)
	report["battles.casualties"] = battles.reduce(
		(sum, battle) => sum + battle.casualties,
		0,
	)
	const uneven = battles.filter((battle) => battle.weakerWon !== null)
	report["battles.weaker.n"] = uneven.length
	report["battles.weaker.wins"] = uneven.filter(
		(battle) => battle.weakerWon,
	).length
	report["battles.weakerWinShare"] = ratio({
		count: report["battles.weaker.wins"],
		total: uneven.length,
	})
	report["battles.repeatStrength.p50"] = median(window.repeatStrength)
	report["battles.waterTargets"] = battles.filter(
		(battle) => battle.water,
	).length
	for (const result of [
		"inconclusive",
		"normal",
		"decisive",
		"rout",
		"uncontested",
	]) {
		report[`battles.result.${result}`] = share(
			battles.map((battle) => battle.result === result),
		)
		const initial = battles.filter((battle) => battle.initial === result)
		if (initial.length > 0)
			report[`battles.routShare.initial.${result}`] = share(
				initial.map((battle) => battle.routed),
			)
	}
	const contested = battles.filter((battle) => battle.result !== "uncontested")
	report["battles.routShare"] = share(contested.map((battle) => battle.routed))
	for (const [label, lo, hi] of [
		["none", 0, 1e-9],
		["low", 1e-9, 0.25],
		["high", 0.25, 2],
	] as const) {
		const band = contested.filter(
			(battle) => battle.shortfall >= lo && battle.shortfall < hi,
		)
		report[`battles.routShare.shortfall.${label}`] = share(
			band.map((battle) => battle.routed),
		)
	}
	const terrains = new Set(battles.map((battle) => battle.topography))
	for (const topography of terrains) {
		const group = battles.filter((battle) => battle.topography === topography)
		report[`battles.byTopography.${topography}.n`] = group.length
		report[`battles.byTopography.${topography}.attackerWinShare`] = share(
			group.map((battle) => battle.attackerWon),
		)
	}
	const vegetations = new Set(battles.map((battle) => battle.vegetation))
	for (const vegetation of vegetations) {
		const group = battles.filter((battle) => battle.vegetation === vegetation)
		report[`battles.byVegetation.${vegetation}.n`] = group.length
		report[`battles.byVegetation.${vegetation}.attackerWinShare`] = share(
			group.map((battle) => battle.attackerWon),
		)
	}
	const levels = new Set(battles.map((battle) => battle.knowledge))
	for (const level of levels) {
		const group = battles.filter((battle) => battle.knowledge === level)
		report[`battles.byKnowledge.${level}.n`] = group.length
		report[`battles.byKnowledge.${level}.attackerWinShare`] = share(
			group.map((battle) => battle.attackerWon),
		)
	}
	report["sacks.n"] = window.sacks.length
	report["sacks.inRevenue.p50"] = median(window.sacks)
	report["firstBattle.settled.n"] = window.firstBattleSettled
	report["firstBattle.paidBelowExhaustionShare"] = ratio({
		count: window.firstBattleBelowExhaustion,
		total: window.firstBattleSettled,
	})
	report["longPeace.settled.n"] = window.longPeaceSettled
	report["longPeace.paidNegativeShare"] = ratio({
		count: window.longPeaceNegative,
		total: window.longPeaceSettled,
	})
	report["recovery.n"] = window.recoveryYears.length
	report["recovery.years.p50"] = median(window.recoveryYears)
	report["recovery.censored"] = window.recoveryCensored
	tracker.window = emptyWindow()
	tracker.window.firstTiePairs = window.lastTiePairs
	return report
}

const LOG_GROUPS: [string, string[]][] = [
	[
		"army",
		[
			"armyShare.p50",
			"armyShare.p90",
			"armySize.p50",
			"deployed.p50",
			"manpowerAfterWar.p50",
		],
	],
	[
		"conflict",
		[
			"warStarts.perSovereign",
			"rebellions.perSovereign",
			"activeWarShare",
			"raids.n",
			"raids.successShare",
		],
	],
	[
		"fiscal",
		[
			"fiscal.maintenanceShare",
			"fiscal.armyShare",
			"fiscal.leakageShare",
			"fiscal.netShare",
			"treasury.ratio.p50",
			"treasury.negativeShare",
			"treasury.aboveFiveSafeShare",
		],
	],
]

const LOG_TOTALS = [
	"warStarts.n",
	"wars.completed.n",
	"wars.years.p50",
	"wars.years.p90",
	"wars.settled.years.p50",
	"wars.attackerWinShare",
	"wars.ending.stalled",
	"wars.ending.exhaustion",
	"rebelWars.successShare",
	"battles.n",
	"battles.attackerWinShare",
	"battles.weakerWinShare",
	"battles.routShare",
	"vassalageEnded.n",
	"counterWars.n",
	"peacefulAnnexations.n",
	"firstBattle.paidBelowExhaustionShare",
	"longPeace.paidNegativeShare",
	"recovery.years.p50",
]

function format(value: number | undefined): string {
	if (value === undefined || Number.isNaN(value)) return "-"
	if (Math.abs(value) >= 1000) return value.toFixed(0)
	if (Math.abs(value) >= 10) return value.toFixed(1)
	if (Math.abs(value) >= 0.01 || value === 0) return value.toFixed(3)
	return value.toExponential(2)
}

function log({ reports, log: write }: LogMilitaryParams): void {
	for (const [group, keys] of LOG_GROUPS) {
		write(`${group} by tradition (settled/tribal/steppe)`)
		for (const { from, to, military } of reports)
			write(
				`${`${from}-${to}`.padEnd(11)} ${keys
					.map(
						(key) =>
							`${key}=${TRADITIONS.map((t) => format(military[`${key}.${t}`])).join("/")}`,
					)
					.join("  ")}`,
			)
	}
	write("military totals")
	for (const { from, to, military } of reports)
		write(
			`${`${from}-${to}`.padEnd(11)} ${LOG_TOTALS.map((key) => `${key}=${format(military[key])}`).join("  ")}`,
		)
}

export const MILITARY_REPORT = {
	fiscalProbe: FISCAL_PROBE,
	attach,
	sample,
	summarize,
	log,
}
