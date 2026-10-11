import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { HISTORY_RUN } from "@/test/history-run"
import type {
	RealmsFixture,
	RealmsFixtureParams,
} from "@/test/history-run/fixtures/realms/types"

function endWars(state: HistoryState): void {
	for (const idx of [...state.activeWarIds])
		STATE.resolveWar({
			state,
			war: state.wars[idx],
			transferred: [],
			receiver: state.wars[idx].attacker,
		})
}

// Free feudal neighbours, each with a ruler of a house of its own.
function neighbours({ neighbours: count }: RealmsFixtureParams): RealmsFixture {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 30000,
	})
	endWars(state)
	const free = (p: number) =>
		!state.desolate[p] &&
		!state.stateless[p] &&
		STATE.isSovereign({ state, p }) &&
		!STATE.getRulerRelation({ state, nation: p })
	const size = (p: number) =>
		STATE.getNationProvinces({ state, root: p }).length
	let hub = -1
	let realms: number[] = []
	for (let p = 0; p < state.P && realms.length === 0; p++) {
		if (!free(p)) continue
		const around = [
			...new Set(STATE.getNationNeighbors({ state, nation: p })),
		].filter(
			(other) =>
				free(other) &&
				STATE.getRelation({ state, a: p, b: other }) === STATE.rel.NONE,
		)
		if (around.length < count) continue
		const group = [p, ...around.slice(0, count)].sort(
			(a, b) => size(b) - size(a),
		)
		if (size(group[0]) > size(group[1])) {
			hub = p
			realms = group
		}
	}
	if (realms.length === 0) throw new Error("no hub with enough neighbours")
	for (const p of realms) {
		state.governmentType[p] = GOVERNMENT.getGovIdx().feudal_monarchy
		STATE.foundRuler({
			state,
			p,
			ruler: { dynasty: -1, age: "fresh", claim: 3 },
			rng: HISTORY_RNG.createHistoryRng(p + 1),
		})
	}
	return { state, hub, realms, rng: HISTORY_RNG.createHistoryRng(77) }
}

export const REALMS_FIXTURE = { neighbours }
