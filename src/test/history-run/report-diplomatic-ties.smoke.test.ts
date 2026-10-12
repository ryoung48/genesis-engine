import { afterEach, expect, it, vi } from "vitest"
import { STATE } from "@/model/history/sim/engine/state"
import type {
	HistoryState,
	Relation,
} from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { DIPLOMATIC_TIES_REPORT } from "@/test/history-run/report/diplomatic-ties"

afterEach(() => vi.restoreAllMocks())

function fixture(): HistoryState {
	const relations = new Map<number, Relation>([
		[1, STATE.rel.ALLY],
		[10, STATE.rel.ALLY],
		[2, STATE.rel.ALLY],
		[20, STATE.rel.ALLY],
		[3, STATE.rel.VASSAL],
		[4, STATE.rel.VASSAL],
		[30, STATE.rel.OVERLORD],
		[40, STATE.rel.OVERLORD],
		[56, STATE.rel.PU_JUNIOR],
		[65, STATE.rel.PU_SENIOR],
		[7, STATE.rel.COLONY],
		[70, STATE.rel.OVERLORD],
		[15, STATE.rel.WAR],
		[51, STATE.rel.WAR],
	])
	vi.spyOn(STATE, "getRelation").mockImplementation(
		({ a, b }) => relations.get(a * 10 + b) ?? STATE.rel.NONE,
	)
	vi.spyOn(STATE, "isSovereign").mockReturnValue(true)
	vi.spyOn(STATE, "canAlly").mockReturnValue(true)
	return {
		P: 10,
		time: 867 * STATE.yearMs,
		desolate: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
		stateless: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 1, 0]),
		governmentType: new Uint8Array(10).fill(
			GOVERNMENT.getGovIdx().feudal_monarchy,
		),
		relationColumns: [
			new Set([1, 2, 3, 4, 7]),
			new Set([0, 5]),
			new Set([0, 5]),
			new Set([0]),
			new Set([0]),
			new Set([1, 2, 6]),
			new Set([5]),
			new Set([0]),
			new Set(),
			new Set(),
		],
		marriageTies: new Map([
			[1, { first: 0, second: 1 }],
			[19, { first: 1, second: 9 }],
		]),
	} as unknown as HistoryState
}

it("counts pairs once, deduplicates participants and overlapping marriages, and distinguishes subjects from colonies", () => {
	const { snapshot } = DIPLOMATIC_TIES_REPORT.capture({ engine: fixture() })
	expect(snapshot.realms).toBe(8)
	expect(snapshot.ties).toEqual({
		alliance: { pairs: 2, realms: 3, realmShare: 3 / 8 },
		vassal: { pairs: 2, realms: 3, realmShare: 3 / 8 },
		union: { pairs: 1, realms: 2, realmShare: 2 / 8 },
		dependency: { pairs: 1, realms: 2, realmShare: 2 / 8 },
		marriage: { pairs: 1, realms: 2, realmShare: 2 / 8 },
		war: { pairs: 1, realms: 2, realmShare: 2 / 8 },
		any: { pairs: 7, realms: 8, realmShare: 1 },
	})
	expect(snapshot.roles).toEqual({
		vassals: { realms: 2, realmShare: 2 / 8 },
		overlords: { realms: 1, realmShare: 1 / 8 },
		juniors: { realms: 1, realmShare: 1 / 8 },
		seniors: { realms: 1, realmShare: 1 / 8 },
	})
})

it("weights sampled shares by realm counts and carries exact endpoints into the next window", () => {
	const engine = fixture()
	const initial = DIPLOMATIC_TIES_REPORT.capture({ engine }).snapshot
	const tracker = DIPLOMATIC_TIES_REPORT.create({ initial })
	engine.stateless.fill(1, 4)
	engine.time = 967 * STATE.yearMs
	const end = DIPLOMATIC_TIES_REPORT.capture({ engine }).snapshot
	DIPLOMATIC_TIES_REPORT.sample({ tracker, snapshot: initial })
	DIPLOMATIC_TIES_REPORT.sample({ tracker, snapshot: end })
	const report = DIPLOMATIC_TIES_REPORT.window({ tracker, end })
	expect(report.samples).toBe(2)
	expect(report.initial).toBe(initial)
	expect(report.end).toBe(end)
	expect(report.mean.realms).toBe(6)
	expect(report.mean.ties.alliance).toEqual({
		pairs: 2,
		realms: 3,
		realmShare: 6 / 12,
	})
	expect(tracker.initial).toBe(end)
	expect(tracker.samples).toBe(0)
	expect(DIPLOMATIC_TIES_REPORT.window({ tracker, end }).mean.realms).toBe(0)
})
