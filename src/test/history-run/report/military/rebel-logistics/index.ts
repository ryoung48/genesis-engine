import { ECONOMY } from "@/model/history/sim/engine/economy"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { MILITARY } from "@/model/history/sim/engine/military"
import { DEPLOYMENTS } from "@/model/history/sim/engine/military/deployments"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { STATE } from "@/model/history/sim/engine/state"
import type {
	AttachedDiagnostics,
	AttachParams,
	ObserveParams,
	RebelLogisticsObservation,
} from "@/test/history-run/report/military/rebel-logistics/types"

function observation({
	engine,
	war,
	nation,
	source,
}: ObserveParams): RebelLogisticsObservation {
	const target = RECRUITMENT.realmTargets({ state: engine, nation })
	const { crown, rebels } = STATE.warSides({ war })
	const side = war.participants[nation]
	const leader = side === "attacker" ? war.attacker : war.defender
	const coalitionDeployed = DEPLOYMENTS.sideMembers({
		state: engine,
		war,
		side,
	}).reduce(
		(sum, participant) =>
			sum +
			(war.deployed[participant]?.levy ?? 0) +
			(war.deployed[participant]?.regular ?? 0),
		0,
	)
	const fieldLimit = KNOWLEDGE.maxFieldArmy({
		knowledge: ECONOMY.realmKnowledge({ state: engine, p: leader }),
	})
	const enrolled = {
		levy: engine.levyCurrent[nation],
		regular: engine.regularCurrent[nation],
	}
	return {
		time: engine.time / STATE.yearMs,
		war: war.idx,
		goal: war.goal === "throne" ? "throne" : "independence",
		nation,
		role: nation === crown ? "crown" : nation === rebels ? "rebel" : "backer",
		source,
		population: ECONOMY.realmPopulation({ state: engine, p: nation }),
		knowledge: ECONOMY.realmKnowledge({ state: engine, p: nation }),
		surplus: ECONOMY.surplus({ state: engine, p: nation }),
		uncappedTargets: target.uncapped,
		targets: { levy: target.levy, regular: target.regular },
		enrolled,
		deployed: { ...(war.deployed[nation] ?? { levy: 0, regular: 0 }) },
		logistics: target.logistics,
		targetLimited: target.limits.logistics,
		limits: target.limits,
		enrollmentAtCap:
			enrolled.levy + enrolled.regular >= target.logistics * (1 - 1e-9),
		fieldLimit,
		coalitionDeployed,
		fieldLimited:
			coalitionDeployed > fieldLimit + Math.max(1, fieldLimit) * 1e-9,
	}
}

function attach({ engine, record }: AttachParams): AttachedDiagnostics {
	const observe = (params: ObserveParams) => {
		if (
			!STATE.isRebelGoal({ goal: params.war.goal }) ||
			params.war.endTime !== undefined ||
			!params.war.participants[params.nation] ||
			!STATE.isSovereign({ state: engine, p: params.nation })
		)
			return
		record(observation(params))
	}
	const sample: AttachedDiagnostics["sample"] = ({ source }) => {
		for (const idx of engine.activeWarIds) {
			const war = engine.wars[idx]
			if (!STATE.isRebelGoal({ goal: war.goal })) continue
			for (const nation of Object.keys(war.participants).map(Number))
				observe({ engine, war, nation, source })
		}
	}
	const refresh = RECRUITMENT.refresh
	RECRUITMENT.refresh = (params) => {
		refresh(params)
		if (params.state !== engine) return
		for (const { war } of DEPLOYMENTS.assignments(params))
			observe({ engine, war, nation: params.nation, source: "refresh" })
	}
	const rebalance = DEPLOYMENTS.rebalance
	DEPLOYMENTS.rebalance = (params) => {
		rebalance(params)
		if (params.state !== engine) return
		for (const { war } of DEPLOYMENTS.assignments(params))
			for (const nation of Object.keys(war.participants).map(Number))
				observe({ engine, war, nation, source: "allocation" })
	}
	const mobilize = MILITARY.mobilize
	MILITARY.mobilize = (params) => {
		mobilize(params)
		if (params.state !== engine) return
		for (const nation of Object.keys(params.war.participants).map(Number))
			observe({ engine, war: params.war, nation, source: "mobilization" })
	}
	const fight = MILITARY.fight
	MILITARY.fight = (params) => {
		if (params.state === engine) {
			MILITARY.reconcile({ state: engine })
			for (const nation of Object.keys(params.war.participants).map(Number))
				observe({ engine, war: params.war, nation, source: "battle" })
		}
		return fight(params)
	}
	sample({ source: "initial" })
	return {
		sample,
		detach: () => {
			RECRUITMENT.refresh = refresh
			DEPLOYMENTS.rebalance = rebalance
			MILITARY.mobilize = mobilize
			MILITARY.fight = fight
		},
	}
}

export const REBEL_LOGISTICS_REPORT = { attach }
