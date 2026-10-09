import { ECONOMY } from "@/model/history/sim/engine/economy"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import type {
	CohortParams,
	RecruitmentCohort,
	RecruitmentRealm,
	RecruitmentSnapshot,
	SnapshotParams,
} from "@/test/history-run/report/military/recruitment/types"

function cohort({ realms }: CohortParams): RecruitmentCohort {
	const result: RecruitmentCohort = {
		realms: realms.length,
		population: 0,
		enrolled: { levy: 0, regular: 0 },
		deployed: { levy: 0, regular: 0 },
		regularShare: 0,
		medianRegularShare: 0,
		actualLevyPopulationShare: 0,
		levyEligibility: 0,
		fundingCommitment: 0,
		remainingReadinessBudget: 0,
		ceilingBindings: 0,
		logisticsLimitedRealms: 0,
		treasuryDebt: 0,
	}
	const shares: number[] = []
	for (const realm of realms) {
		result.population += realm.population
		result.enrolled.levy += realm.enrolled.levy
		result.enrolled.regular += realm.enrolled.regular
		result.deployed.levy += realm.deployed.levy
		result.deployed.regular += realm.deployed.regular
		result.levyEligibility += realm.levyEligibility * realm.population
		result.fundingCommitment += realm.funding * realm.population
		result.remainingReadinessBudget += realm.remainingBudget
		result.ceilingBindings += Number(realm.safetyBinding)
		result.logisticsLimitedRealms += Number(realm.logisticsLimited)
		result.treasuryDebt += Math.max(0, -realm.treasury)
		const total = realm.enrolled.levy + realm.enrolled.regular
		shares.push(total > 0 ? realm.enrolled.regular / total : 0)
	}
	result.levyEligibility /= Math.max(1, result.population)
	result.fundingCommitment /= Math.max(1, result.population)
	result.actualLevyPopulationShare =
		result.enrolled.levy / Math.max(1, result.population)
	result.regularShare =
		result.enrolled.regular /
		Math.max(1, result.enrolled.levy + result.enrolled.regular)
	shares.sort((a, b) => a - b)
	result.medianRegularShare =
		shares.length > 0
			? (shares[Math.floor((shares.length - 1) / 2)] +
					shares[Math.floor(shares.length / 2)]) /
				2
			: 0
	return result
}

function snapshot({
	engine,
	lateKnowledgeBand,
}: SnapshotParams): RecruitmentSnapshot {
	const realms: RecruitmentRealm[] = []
	const pending = { levy: 0, regular: 0 }
	for (const interval of engine.militaryIntervals.values()) {
		pending.levy += interval.pending.levy
		pending.regular += interval.pending.regular
	}
	for (let nation = 0; nation < engine.P; nation++) {
		if (
			engine.desolate[nation] ||
			engine.stateless[nation] ||
			engine.parentCurrent[nation] >= 0
		)
			continue
		const targets = RECRUITMENT.realmTargets({ state: engine, nation })
		const enrolled = {
			levy: engine.levyCurrent[nation],
			regular: engine.regularCurrent[nation],
		}
		const deployed = { levy: 0, regular: 0 }
		for (const idx of engine.activeWarIds) {
			deployed.levy += engine.wars[idx].deployed[nation]?.levy ?? 0
			deployed.regular += engine.wars[idx].deployed[nation]?.regular ?? 0
		}
		realms.push({
			nation,
			government: GOVERNMENT.govFamilyOfIndex(engine.governmentType[nation]),
			knowledge: ECONOMY.realmKnowledge({ state: engine, p: nation }),
			population: ECONOMY.realmPopulation({ state: engine, p: nation }),
			surplus: ECONOMY.surplus({ state: engine, p: nation }),
			enrolled,
			deployed,
			targets: { levy: targets.levy, regular: targets.regular },
			uncappedTargets: targets.uncapped,
			knee: targets.knee,
			levyEligibility: targets.levyEligibility,
			funding: targets.funding,
			remainingBudget: targets.remainingBudget,
			treasury: engine.treasuryCurrent[nation],
			pending: {
				...(engine.militaryIntervals.get(nation)?.pending ?? {
					levy: 0,
					regular: 0,
				}),
			},
			safetyBinding:
				enrolled.levy + enrolled.regular >= targets.safety * (1 - 1e-9) &&
				targets.safety > 0,
			logisticsLimited: targets.limits.logistics,
		})
	}
	const groups = new Map<string, RecruitmentRealm[]>()
	for (const realm of realms) {
		const band =
			realm.knowledge >= lateKnowledgeBand
				? "late"
				: realm.knowledge >= 1
					? "middle"
					: "early"
		const fiscal = realm.surplus > 0 ? "positive" : "nonpositive"
		const family = realm.government === "tribal" ? "tribal" : "nontribal"
		for (const key of [
			"government." + realm.government,
			"knowledge." + band,
			"fiscal." + fiscal,
			band + "." + family + "." + fiscal,
		]) {
			const rows = groups.get(key) ?? []
			rows.push(realm)
			groups.set(key, rows)
		}
	}
	const cohorts = Object.fromEntries(
		[...groups].map(([name, rows]) => [name, cohort({ realms: rows })]),
	)
	const world = cohort({ realms })
	const top = realms.sort((a, b) => b.population - a.population).slice(0, 20)
	return {
		year: engine.time / STATE.yearMs,
		totals: structuredClone(engine.militaryTotals),
		pending,
		world,
		cohorts,
		top,
		concentrationTop20:
			top.reduce((sum, realm) => sum + realm.population, 0) /
			Math.max(1, world.population),
		lateKnowledgeBand,
	}
}

export const RECRUITMENT_REPORT = { snapshot }
