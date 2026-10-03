import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { DEPLOYMENTS } from "@/model/history/sim/engine/military/deployments"
import type {
	NationParams,
	RealmTargetCacheEntry,
	ReconcileParams,
	RecoveryParams,
	RecoveryResult,
	RecruitmentTargets,
	StateParams,
	TargetParams,
	TerritoryTargetParams,
	Troops,
} from "@/model/history/sim/engine/military/recruitment/types"
import { STATE } from "@/model/history/sim/engine/state"
import type { RealmCacheEntry } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { MATH } from "@/model/shared/math/core"

const FUNDING = { domain: [0.42, 1, 1.44, 2.38], range: [0.1, 0.25, 0.55, 0.9] }

function targets({
	population,
	tribal,
	knowledge,
	surplus,
	outputPerHead,
}: TargetParams): RecruitmentTargets {
	const price =
		Number.isFinite(outputPerHead) && outputPerHead > 0
			? Math.sqrt(outputPerHead / 450) * ECONOMY.ducatsPerGram
			: 0
	const home = { levy: 20 * price, regular: 200 * price }
	const campaign = { levy: 62.5 * price, regular: 625 * price }
	const budget = Number.isFinite(surplus) ? 0.75 * Math.max(0, surplus) : 0
	const living = Number.isFinite(population) ? Math.max(0, population) : 0
	const levyEligibility = tribal ? 0.05 : 0.02
	const safety = living * 0.1
	const level = Number.isFinite(knowledge) ? knowledge : 0
	const logistics = KNOWLEDGE.maxFieldArmy({ knowledge: level })
	const funding = MATH.piecewise({
		...FUNDING,
		x: level,
	})
	const levy = home.levy > 0 ? living * levyEligibility : 0
	const regular = home.regular > 0 ? (funding * budget) / home.regular : 0
	const total = levy + regular
	const expense = levy * home.levy + regular * home.regular
	const budgetScale = expense > 0 ? Math.min(1, budget / expense) : 1
	const populationScale = total > 0 ? Math.min(1, safety / total) : 1
	const logisticsScale = total > 0 ? Math.min(1, logistics / total) : 1
	const scale = Math.min(budgetScale, populationScale, logisticsScale)
	const remainingBudget = Math.max(0, budget - expense * scale)

	return {
		levy: levy * scale,
		regular: regular * scale,
		safety,
		logistics,
		uncapped: { levy, regular },
		limits: {
			budget: budgetScale < 1 && budgetScale === scale,
			population: populationScale < 1 && populationScale === scale,
			logistics: logisticsScale < 1 && logisticsScale === scale,
		},
		levyEligibility,
		funding,
		budget,
		remainingBudget,
		home,
		campaign,
	}
}

const realmTargetCache = new WeakMap<RealmCacheEntry, RealmTargetCacheEntry>()

function realmTargets({ state, nation }: NationParams): RecruitmentTargets {
	const realm = ECONOMY.realm({ state, p: nation })
	const inputs: TargetParams = {
		population: realm.population,
		tribal:
			GOVERNMENT.govFamilyOfIndex(state.governmentType[nation]) === "tribal",
		knowledge: realm.knowledge,
		surplus: realm.revenue - realm.stateMaintenance,
		outputPerHead: realm.outputPerHead,
	}
	const cached = realmTargetCache.get(realm)
	if (
		cached &&
		cached.inputs.population === inputs.population &&
		cached.inputs.tribal === inputs.tribal &&
		cached.inputs.knowledge === inputs.knowledge &&
		cached.inputs.surplus === inputs.surplus &&
		cached.inputs.outputPerHead === inputs.outputPerHead
	)
		return cached.targets
	const computed = targets(inputs)
	realmTargetCache.set(realm, { inputs, targets: computed })
	return computed
}

function territoryTargets({
	state,
	nation,
	provinces,
}: TerritoryTargetParams): RecruitmentTargets {
	const economy = ECONOMY.territory({ state, p: nation, provinces })
	return targets({
		population: economy.population,
		tribal:
			GOVERNMENT.govFamilyOfIndex(state.governmentType[nation]) === "tribal",
		knowledge: economy.knowledge,
		surplus: economy.revenue - economy.stateMaintenance,
		outputPerHead: economy.outputPerHead,
	})
}

function recover({
	holdings,
	target,
	rate,
	years,
}: RecoveryParams): RecoveryResult {
	if (years <= 0) return { holdings, replacements: 0, soldierYears: 0 }
	const shortfall = Math.max(0, target - holdings)
	if (rate <= 0 || shortfall <= 0)
		return { holdings, replacements: 0, soldierYears: holdings * years }
	const k = -Math.log1p(-rate)
	const closed = -Math.expm1(-k * years)
	const replacements = shortfall * closed
	const x = k * years
	const growthIntegral =
		Math.abs(x) < 1e-4
			? years * (x / 2 - (x * x) / 6 + (x * x * x) / 24)
			: years - closed / k
	return {
		holdings: holdings + replacements,
		replacements,
		soldierYears: holdings * years + shortfall * growthIntegral,
	}
}

function reconcile({ holdings, targets }: ReconcileParams): Troops {
	const levy = Math.min(
		targets.levy,
		Number.isFinite(holdings.levy) ? Math.max(0, holdings.levy) : 0,
	)
	const regular = Math.min(
		targets.regular,
		Number.isFinite(holdings.regular) ? Math.max(0, holdings.regular) : 0,
	)
	const total = levy + regular
	const scale =
		total > 0
			? Math.min(1, targets.safety / total, targets.logistics / total)
			: 1
	return { levy: levy * scale, regular: regular * scale }
}

function initializeRealm({ state, nation }: NationParams): void {
	const target = realmTargets({ state, nation })
	state.levyCurrent[nation] = target.levy
	state.regularCurrent[nation] = target.regular
	state.militaryIntervals.set(nation, {
		time: state.time,
		targets: { levy: target.levy, regular: target.regular },
		rates: { levy: 0.1, regular: 0.75 },
		home: target.home,
		campaign: target.campaign,
		mobilized: { levy: 0, regular: 0 },
		pending: { levy: 0, regular: 0 },
		reference: { levy: 0, regular: 0 },
		recruited: { levy: 0, regular: 0 },
		casualties: { levy: 0, regular: 0 },
		demobilized: { levy: 0, regular: 0 },
		settled: { levy: 0, regular: 0 },
	})
}

function initialize({ state }: StateParams): void {
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation] || !STATE.isSovereign({ state, p: nation }))
			continue
		initializeRealm({ state, nation })
	}
}

function advance({ state, nation }: NationParams): void {
	const interval = state.militaryIntervals.get(nation)
	if (!interval || state.time <= interval.time) return
	const years = (state.time - interval.time) / STATE.yearMs
	const assigned = DEPLOYMENTS.assignments({ state, nation })
	for (const type of ["levy", "regular"] as const) {
		const column = type === "levy" ? state.levyCurrent : state.regularCurrent
		const before = column[nation]
		const result = recover({
			holdings: before,
			target: interval.targets[type],
			rate: interval.rates[type],
			years,
		})
		if (type === "levy" && assigned.length > 0 && result.replacements > 0)
			throw new Error(`Wartime levy replacement in realm ${nation}`)
		column[nation] = result.holdings
		interval.recruited[type] += result.replacements
		state.militaryTotals.recruited[type] += result.replacements
		interval.pending[type] +=
			result.soldierYears *
			((1 - interval.mobilized[type]) * interval.home[type] +
				interval.mobilized[type] * interval.campaign[type])
		for (const { war } of assigned) {
			const commitment = war.deployed[nation]
			if (commitment)
				commitment[type] +=
					result.replacements *
					(before > 0
						? commitment[type] / before
						: (war.allocation[nation] ?? 0) * interval.mobilized[type])
		}
		interval.reference[type] =
			assigned.length > 0
				? Math.max(interval.reference[type], result.holdings)
				: 0
	}
	interval.time = state.time
}

function refresh({ state, nation }: NationParams): void {
	const interval = state.militaryIntervals.get(nation)
	if (!interval) return
	advance({ state, nation })
	const target = realmTargets({ state, nation })
	const assigned = DEPLOYMENTS.assignments({ state, nation })
	const holdings = reconcile({
		holdings: {
			levy: state.levyCurrent[nation],
			regular: state.regularCurrent[nation],
		},
		targets: target,
	})
	for (const type of ["levy", "regular"] as const) {
		const column = type === "levy" ? state.levyCurrent : state.regularCurrent
		const removed = column[nation] - holdings[type]
		if (removed > 0) {
			state.militaryStrengthDirty.add(nation)
			interval.demobilized[type] += removed
			state.militaryTotals.demobilized[type] += removed
			state.events.push({
				tag: "troops demobilized",
				time: state.time,
				data: { nation, type, troops: removed, cause: "recruitment ceiling" },
			})
		}
		column[nation] = holdings[type]
		const committed = assigned.reduce(
			(sum, { war }) => sum + (war.deployed[nation]?.[type] ?? 0),
			0,
		)
		if (committed > holdings[type])
			for (const { war } of assigned)
				if (war.deployed[nation])
					war.deployed[nation][type] *= holdings[type] / committed
		interval.mobilized[type] =
			holdings[type] > 0
				? Math.min(1, committed / holdings[type])
				: assigned.length > 0
					? 1
					: 0
	}
	interval.targets = { levy: target.levy, regular: target.regular }
	interval.rates = { levy: assigned.length > 0 ? 0 : 0.1, regular: 0.75 }
	interval.home = target.home
	interval.campaign = target.campaign
	interval.time = state.time
}

function upkeep({ state, nation }: NationParams): Troops {
	const interval = state.militaryIntervals.get(nation)
	const expense = { levy: 0, regular: 0 }
	if (!interval) return expense
	for (const type of ["levy", "regular"] as const)
		expense[type] =
			(type === "levy"
				? state.levyCurrent[nation]
				: state.regularCurrent[nation]) *
			((1 - interval.mobilized[type]) * interval.home[type] +
				interval.mobilized[type] * interval.campaign[type])
	return expense
}

function settle({ state, nation }: NationParams): Troops {
	advance({ state, nation })
	const interval = state.militaryIntervals.get(nation)
	if (!interval) return { levy: 0, regular: 0 }
	const expense = { ...interval.pending }
	interval.pending = { levy: 0, regular: 0 }
	state.militaryTotals.settled.levy += expense.levy
	state.militaryTotals.settled.regular += expense.regular
	interval.settled.levy += expense.levy
	interval.settled.regular += expense.regular
	return expense
}

function settleOwnership({ state, nation }: NationParams): void {
	const expense = settle({ state, nation })
	const total = expense.levy + expense.regular
	state.treasuryCurrent[nation] -= total
	const budget = TREASURY_BUDGET.get({ state, p: nation })
	budget.armyExpenses -= total
	budget.levyExpenses -= expense.levy
	budget.regularExpenses -= expense.regular
	budget.annualBalance -= total
	budget.settled = true
}

function reconstitute({ state, nation }: NationParams): void {
	const previous = state.militaryIntervals.get(nation)
	const before = {
		levy: state.levyCurrent[nation],
		regular: state.regularCurrent[nation],
	}
	initializeRealm({ state, nation })
	const interval = state.militaryIntervals.get(nation)!
	if (previous) {
		interval.pending = previous.pending
		interval.recruited = previous.recruited
		interval.casualties = previous.casualties
		interval.demobilized = previous.demobilized
		interval.settled = previous.settled
	}
	for (const type of ["levy", "regular"] as const) {
		const current =
			type === "levy" ? state.levyCurrent[nation] : state.regularCurrent[nation]
		const added = Math.max(0, current - before[type])
		const removed = Math.max(0, before[type] - current)
		interval.recruited[type] += added
		state.militaryTotals.recruited[type] += added
		interval.demobilized[type] += removed
		state.militaryTotals.demobilized[type] += removed
	}
	state.events.push({
		tag: "army reconstituted",
		time: state.time,
		data: {
			nation,
			beforeLevy: before.levy,
			beforeRegular: before.regular,
			levy: state.levyCurrent[nation],
			regular: state.regularCurrent[nation],
		},
	})
	state.militaryDirty.add(nation)
	state.militaryAllocationDirty.add(nation)
	state.militaryStrengthDirty.add(nation)
}

function disband({ state, nation }: NationParams): void {
	settleOwnership({ state, nation })
	const interval = state.militaryIntervals.get(nation)
	if (interval) {
		for (const type of ["levy", "regular"] as const) {
			const troops =
				type === "levy"
					? state.levyCurrent[nation]
					: state.regularCurrent[nation]
			if (troops > 0)
				state.events.push({
					tag: "troops demobilized",
					time: state.time,
					data: { nation, type, troops, cause: "sovereign destruction" },
				})
		}
		state.militaryTotals.demobilized.levy += state.levyCurrent[nation]
		state.militaryTotals.demobilized.regular += state.regularCurrent[nation]
		interval.demobilized.levy += state.levyCurrent[nation]
		interval.demobilized.regular += state.regularCurrent[nation]
		interval.reference = { levy: 0, regular: 0 }
		interval.targets = { levy: 0, regular: 0 }
		interval.rates = { levy: 0, regular: 0 }
	}
	state.levyCurrent[nation] = 0
	state.regularCurrent[nation] = 0
	for (const idx of state.activeWarIds) {
		delete state.wars[idx].deployed[nation]
		delete state.wars[idx].allocation[nation]
	}
	state.militaryDirty.add(nation)
	state.militaryAllocationDirty.add(nation)
	state.militaryStrengthDirty.add(nation)
}

export const RECRUITMENT = {
	targets,
	realmTargets,
	territoryTargets,
	recover,
	reconcile,
	initialize,
	advance,
	refresh,
	upkeep,
	settle,
	settleOwnership,
	reconstitute,
	disband,
}
