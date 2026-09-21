import { expect, it } from "vitest"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { RNG } from "@/model/shared/random/rng"
import { HISTORY_RUN } from "@/test/history-run"
import { SUCCESSION_AUDIT } from "@/test/history-run/succession-audit"
import type { AuditTally } from "@/test/history-run/succession-audit/types"
import type {
	AddSonsParams,
	ForceSuccessionParams,
	PickSeatParams,
	SeatParams,
} from "@/test/history-run/succession-branches.types"

const LAWS = ["confederate", "partition", "high_partition", "single_heir"]

function heldBy({ state, seat }: SeatParams): number[] {
	const held: number[] = []
	for (let title = 0; title < state.titles.count; title++)
		if (state.titles.holder[title] === seat) held.push(title)
	return held
}

function pickSeat({ state, sovereign, used, accept }: PickSeatParams): number {
	for (let seat = 0; seat < state.P; seat++) {
		if (
			state.leaderNameSeedCurrent[seat] < 0 ||
			used.has(state.sovereignCurrent[seat])
		)
			continue
		if (STATE.isSovereign({ state, p: seat }) !== sovereign) continue
		const held = heldBy({ state, seat })
		if (held.length === 0 || !accept(held.map((t) => state.titles.tier[t])))
			continue
		used.add(state.sovereignCurrent[seat])
		return seat
	}
	throw new Error("No suitable seat")
}

function addSons({ state, seat, count }: AddSonsParams): void {
	const people = state.people
	if (!people) throw new Error("History has no people")
	const father = people.holderOfSeat[seat]
	const now = state.time / STATE.yearMs
	const rng = RNG.createRng({ seed: 11 + seat })
	for (let i = 0; i < count; i++)
		PEOPLE.addPerson({
			people,
			sex: 0,
			birth: Math.min(now - 1, people.persons.birth[father] + 17 + i * 0.5),
			father,
			dynasty: people.persons.dynasty[father],
			culture: people.persons.culture[father],
			residence: seat,
			rng,
		})
}

function force({
	state,
	seat,
	law,
	killKin,
	tally,
}: ForceSuccessionParams): void {
	const people = state.people
	if (!people) throw new Error("History has no people")
	state.successionLaw[state.sovereignCurrent[seat]] = LAWS.indexOf(law)
	const time = state.time / STATE.yearMs
	const person = people.holderOfSeat[seat]
	if (killKin)
		for (const kin of SUCCESSION_AUDIT.livingKin({
			people,
			person,
			time,
			gender: "male_preference",
		}))
			PEOPLE.endLife({ people, person: kin, time })
	PEOPLE.endLife({ people, person, time })
	const params = {
		state,
		province: seat,
		leaderIdx: state.leaderRuntime.idx[seat],
		rng: RNG.createRng({ seed: 5 + seat }),
	}
	const snapshot = SUCCESSION_AUDIT.before(params)
	if (!snapshot) throw new Error("Succession would not run")
	SUCCESSION.runSuccession(params)
	SUCCESSION_AUDIT.after({ state, snapshot, tally })
}

it("audits the branches a short run rarely reaches", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "highMedieval",
		numPoints: 20000,
	})
	const used = new Set<number>()
	const tally: AuditTally = new Map()
	const mixed = (tiers: number[]): boolean =>
		tiers.length >= 3 && new Set(tiers).size >= 2
	const count = (key: string): number => tally.get(key) ?? 0

	const vassal = pickSeat({ state, sovereign: false, used, accept: () => true })
	force({ state, seat: vassal, law: "partition", killKin: true, tally })
	expect(count("noheir:vassal")).toBe(1)

	const orphaned = pickSeat({
		state,
		sovereign: true,
		used,
		accept: () => true,
	})
	force({ state, seat: orphaned, law: "partition", killKin: true, tally })
	expect(count("noheir:sovereign")).toBe(1)

	for (const law of ["single_heir", "high_partition", "partition"]) {
		const seat = pickSeat({ state, sovereign: true, used, accept: mixed })
		addSons({ state, seat, count: 3 })
		const before = count(`law:${law}`)
		force({ state, seat, law, killKin: false, tally })
		expect(count(`law:${law}`)).toBe(before + 1)
	}
	expect(count("heir:child")).toBe(3)
	expect(count("divided:single_heir")).toBe(0)
	expect(
		count("divided:high_partition") + count("divided:partition"),
	).toBeGreaterThan(0)
}, 3_600_000)
