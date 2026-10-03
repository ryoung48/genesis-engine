import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { TRUCE } from "@/model/history/sim/engine/events/peace/truce"
import type {
	InitRaidParams,
	RaidNationParams,
	RaidTarget,
	RunRaidParams,
	ScheduleRaidParams,
} from "@/model/history/sim/engine/events/raid/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import type { Relation } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"

const RAID_CHANCE = 0.6

const RAID_GRUDGE = 0.3

const PROTECTED_RELATIONS = new Set<Relation>([
	STATE.rel.WAR,
	STATE.rel.ALLY,
	STATE.rel.VASSAL,
	STATE.rel.OVERLORD,
	STATE.rel.PU_SENIOR,
	STATE.rel.PU_JUNIOR,
	STATE.rel.COLONY,
])

function scheduleRaid({ state, nation, years }: ScheduleRaidParams): void {
	state.heap.enqueue(
		state.time + STATE.deltaYear(years),
		EVENT_HEAP.evt.RAID,
		nation,
		0,
		0,
		0,
		state.time,
	)
}

function initRaid({ state, rng }: InitRaidParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		scheduleRaid({ state, nation: p, years: rng.uniform(0, 1) })
	}
}

function richestBorderProvince({
	state,
	nation,
}: RaidNationParams): RaidTarget | null {
	let best: RaidTarget | null = null
	for (const own of STATE.getNationProvinces({ state, root: nation })) {
		for (const province of STATE.getProvinceNeighbors({ state, p: own })) {
			if (state.desolate[province] || state.stateless[province]) continue
			const victim = STATE.getSovereign({ state, p: province })
			if (victim === nation) continue
			if (TRUCE.active({ state, a: nation, b: victim })) continue
			if (
				PROTECTED_RELATIONS.has(
					STATE.getRelation({ state, a: nation, b: victim }),
				)
			)
				continue
			if (FIELDS.prov.plunderedUntil.get({ state, p: province }) > state.time)
				continue
			const output = ECONOMY.provinceOutput({ state, p: province })
			if (!best || output > best.output) best = { victim, province, output }
		}
	}
	return best
}

function runRaid({ state, nation, rng }: RunRaidParams): void {
	scheduleRaid({ state, nation, years: 1 })
	if (!STATE.isSovereign({ state, p: nation })) return
	if (GOVERNMENT.govFamilyOfIndex(state.governmentType[nation]) !== "tribal")
		return
	const chance =
		RAID_CHANCE * (1 - 0.5 * ECONOMY.treasuryFill({ state, p: nation }))
	if (rng.random() >= chance) return
	const target = richestBorderProvince({ state, nation })
	if (!target) return
	const result = MILITARY.raid({
		state,
		raider: nation,
		victim: target.victim,
		province: target.province,
		rng,
	})
	const relation = STATE.getDisposition({ state, a: target.victim, b: nation })
	if (
		relation !== STATE.disp.SUSPICIOUS &&
		relation !== STATE.disp.RIVAL &&
		rng.random() < RAID_GRUDGE
	)
		STATE.setDisposition({
			state,
			a: target.victim,
			b: nation,
			disposition: STATE.disp.SUSPICIOUS,
		})
	state.events.push({
		tag: "raid",
		time: state.time,
		data: {
			raider: nation,
			victim: target.victim,
			province: target.province,
			success: result.success,
			loot: result.loot,
			raiderParty: Math.round(result.raiderParty),
			response: Math.round(result.response),
			raiderLosses: Math.round(result.raiderLosses),
			victimLosses: Math.round(result.victimLosses),
		},
	})
}

export const RAID = {
	initRaid,
	runRaid: (params: RunRaidParams) =>
		MILITARY.mutate({ state: params.state, action: () => runRaid(params) }),
}
