import { it } from "vitest"
import { BIRTH_EVENTS } from "@/model/history/sim/engine/events/people/birth"
import { PERSON_DEATH } from "@/model/history/sim/engine/events/people/death"
import { DEATH_SCHEDULE } from "@/model/history/sim/engine/events/people/death/schedule"
import { PEOPLE_EVENTS } from "@/model/history/sim/engine/events/people"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { PATRICIANS } from "@/model/history/sim/engine/events/people/patricians"
import { ROYAL_MARRIAGES } from "@/model/history/sim/engine/events/people/royal-marriages"
import { STRESS_EVENTS } from "@/model/history/sim/engine/events/people/stress"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { MILITARY } from "@/model/history/sim/engine/military"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { FAMILY } from "@/model/history/sim/people/family"
import { HEALTH } from "@/model/history/sim/people/health"
import { HISTORY_RUN } from "@/test/history-run"

it("profile", () => {
	const seed = 14963991
	const { engine: state } = HISTORY_RUN.createEngine({ seed, era: "lateMedieval", numPoints: 204000 })
	const rng = HISTORY_RNG.createHistoryRng(seed + 99999)
	const ms: Record<string, number> = {}
	const calls: Record<string, number> = {}
	// biome-ignore lint/suspicious/noExplicitAny: profiling
	const wrap = (object: any, key: string, label: string) => {
		const original = object[key]
		// biome-ignore lint/suspicious/noExplicitAny: profiling
		object[key] = (...args: any[]) => {
			const t0 = performance.now()
			const result = original(...args)
			ms[label] = (ms[label] ?? 0) + performance.now() - t0
			calls[label] = (calls[label] ?? 0) + 1
			return result
		}
	}
	wrap(JOURNAL, "flush", "journal.flush")
	wrap(MILITARY, "reconcile", "military.reconcile")
	wrap(PERSON_DEATH, "run", "death.run")
	wrap(BIRTH_EVENTS, "run", "birth.run")
	wrap(BIRTH_EVENTS, "queue", "birth.queue")
	wrap(DEATH_SCHEDULE, "offerNew", "death.offerNew")
	wrap(SUCCESSION, "succeedPerson", "succeedPerson")
	wrap(PEOPLE_EVENTS, "runYear", "people.runYear")
	wrap(SUCCESSION, "runYear", "succession.runYear")
	wrap(HEALTH, "runYear", "  health.runYear")
	wrap(STRESS_EVENTS, "runYear", "  stress.runYear")
	wrap(FAMILY, "runYear", "  family.runYear")
	wrap(FAMILY, "project", "  family.project")
	wrap(DISTRICTS, "settle", "  districts.settle")
	wrap(DISTRICTS, "grant", "  districts.grant")
	wrap(PATRICIANS, "settle", "  patricians.settle")
	wrap(ROYAL_MARRIAGES, "review", "  royal.review")
	const start = state.time
	const t0 = performance.now()
	const years = Number(process.env.PROFILE_YEARS ?? 60)
	for (let year = 1; year <= years; year++) {
		SIM_ENGINE.simulateUntil({ state, targetTimeMs: start + STATE.deltaYear(year), rng, validate: false })
		state.journal.length = 0
	}
	const total = performance.now() - t0
	const lines = Object.keys(ms).sort((a, b) => ms[b] - ms[a]).map((k) => `${k.padEnd(24)} ${ms[k].toFixed(0).padStart(7)} ms ${String(calls[k]).padStart(8)} calls ${(1000 * ms[k] / calls[k]).toFixed(1).padStart(8)} us`)
	throw new Error(`PROFILE total ${total.toFixed(0)} ms, alive ${state.people.alive.length}, people ${state.people.persons.sex.length}\n${lines.join("\n")}`)
}, 900000)
