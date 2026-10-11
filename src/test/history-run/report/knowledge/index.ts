import { ECONOMY } from "@/model/history/sim/engine/economy"
import { STATE } from "@/model/history/sim/engine/state"
import { ERAS } from "@/model/society/eras"
import type {
	KnowledgeRealm,
	KnowledgeSnapshot,
	SnapshotParams,
} from "@/test/history-run/report/knowledge/types"

function snapshot({ engine }: SnapshotParams): KnowledgeSnapshot {
	const realms: KnowledgeRealm[] = []
	for (let nation = 0; nation < engine.P; nation++) {
		if (
			engine.desolate[nation] ||
			engine.stateless[nation] ||
			engine.parentCurrent[nation] >= 0
		)
			continue
		const type = ERAS.governmentTypes[engine.governmentType[nation]]
		realms.push({
			nation,
			population: STATE.getNationPopulation({ state: engine, root: nation }),
			knowledge: ECONOMY.realmKnowledge({ state: engine, p: nation }),
			government: ERAS.governmentTypeFamily[type],
			type,
			surplus: ECONOMY.surplus({ state: engine, p: nation }),
		})
	}
	const cohorts: KnowledgeSnapshot["cohorts"] = {}
	const typed: Record<string, KnowledgeRealm[]> = {}
	let population = 0
	let weighted = 0
	for (const realm of realms) {
		population += realm.population
		;(typed[realm.type] ??= []).push(realm)
		weighted += realm.population * realm.knowledge
		const cohort = (cohorts[realm.government] ??= {
			population: 0,
			realms: 0,
			weightedKnowledge: 0,
		})
		cohort.population += realm.population
		cohort.realms++
		cohort.weightedKnowledge += realm.population * realm.knowledge
	}
	for (const cohort of Object.values(cohorts))
		cohort.weightedKnowledge /= Math.max(1, cohort.population)
	const quantiles = (members: KnowledgeRealm[]) => {
		const levels = members.map((realm) => realm.knowledge).sort((a, b) => a - b)
		return [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(
			(q) => levels[Math.floor(q * Math.max(0, levels.length - 1))] ?? 0,
		)
	}
	const types: KnowledgeSnapshot["types"] = {}
	for (const [type, members] of Object.entries(typed)) {
		const typePopulation = members.reduce((sum, r) => sum + r.population, 0)
		types[type] = {
			realms: members.length,
			population: typePopulation,
			weightedKnowledge:
				members.reduce((sum, r) => sum + r.population * r.knowledge, 0) /
				Math.max(1, typePopulation),
			quantiles: quantiles(members),
		}
	}
	return {
		year: engine.time / STATE.yearMs,
		population,
		weightedKnowledge: weighted / Math.max(1, population),
		quantiles: quantiles(realms),
		top: realms.sort((a, b) => b.population - a.population).slice(0, 20),
		cohorts,
		types,
	}
}

export const KNOWLEDGE_REPORT = { snapshot }
