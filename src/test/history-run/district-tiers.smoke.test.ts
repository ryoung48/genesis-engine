import { expect, it } from "vitest"
import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { SIM_ENGINE } from "@/model/history/sim/engine/simulation"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { PEOPLE } from "@/model/history/sim/people"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import { FRAME } from "@/model/history/world-frame"
import type { WorldFrame } from "@/model/history/world-frame/types"
import { DEJURE } from "@/model/society/dejure"
import { HISTORY_RUN } from "@/test/history-run"
import { DISTRICT_FIXTURE } from "@/test/history-run/fixtures/district-tiers"
import { DISTRICTS_REPORT } from "@/test/history-run/report/districts"
import { TITLE_SUMMARY } from "@/ui/genesis/wiki-bridge/title-summary"

it("keeps all top seats and their surrounding crown titles under the crown", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 8,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
			[5, 6],
			[6, 7],
		],
		titles: [
			{ tier: 2, seat: 1, provinces: [0, 1, 2, 3] },
			{ tier: 2, seat: 5, provinces: [4, 5, 6, 7] },
			{ tier: 1, seat: 1, provinces: [0, 1] },
			{ tier: 1, seat: 3, provinces: [2, 3] },
			{ tier: 1, seat: 5, provinces: [4, 5] },
			{ tier: 1, seat: 7, provinces: [6, 7] },
		],
	})
	expect(fx.state.topTier[0]).toBe(2)
	expect(Array.from(fx.state.parentCurrent.subarray(0, 8))).toEqual([
		-1, 0, 3, 0, 0, 0, 7, 0,
	])
	expect(Array.from(fx.state.districtSeat.subarray(0, 8))).toEqual([
		0, 0, 0, 1, 0, 0, 0, 1,
	])
})

it.each([
	3, 4,
])("attaches a loose duchy province by province across a chain of length %i", (length) => {
	const end = 3 + length
	const fx = DISTRICT_FIXTURE.create({
		count: end + 1,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			...Array.from(
				{ length: end - 2 },
				(_, i) => [i + 2, i + 3] as [number, number],
			),
		],
		titles: [
			{ tier: 3, seat: 0, provinces: [0, 1] },
			{ tier: 2, seat: 0, provinces: [0, 1] },
			{ tier: 2, seat: 2, provinces: [2] },
			{ tier: 2, seat: end, provinces: [end] },
			{ tier: 1, seat: 3, provinces: Array.from({ length }, (_, i) => i + 3) },
		],
	})
	for (let p = 3; p < end; p++)
		expect(fx.state.parentCurrent[p]).toBe(p - 2 <= end - p ? 2 : end)
})

it.each([
	false,
	true,
])("attaches a separated held-title fragment by adjacency (corridor: %s)", (corridor) => {
	const fx = DISTRICT_FIXTURE.create({
		count: 10,
		root: 0,
		edges: [
			[0, 1],
			[1, 7],
			[7, 8],
			[8, 9],
			[9, 5],
			[5, 4],
			[2, 3],
			...(corridor
				? ([
						[3, 6],
						[6, 4],
					] as [number, number][])
				: []),
		],
		titles: [
			{ tier: 3, seat: 0, provinces: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
			{ tier: 2, seat: 0, provinces: [0, 1] },
			{ tier: 2, seat: 2, provinces: [2, 3, 4] },
		],
	})
	expect(fx.state.parentCurrent[4]).toBe(corridor ? 2 : 0)
	expect(fx.state.parentCurrent[5]).toBe(corridor ? 2 : 0)
})

it("reports county districts from a duke realm at the selected date", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 4,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
		],
		titles: [{ tier: 1, seat: 1, provinces: [0, 1, 2, 3] }],
	})
	const frame = {
		titles: fx.state.titles,
		provinceCount: fx.state.P,
		provinceNation: fx.state.sovereignCurrent,
		provinceParent: fx.state.parentCurrent,
		nations: new Map([[0, { capitalProvince: 0 }]]),
	} as unknown as WorldFrame
	expect(FRAME.directReports({ frame })).toEqual([
		{ seat: 2, tier: 0, nation: 0 },
		{ seat: 3, tier: 0, nation: 0 },
	])
	const summary = TITLE_SUMMARY.describe({
		frame,
		nationId: 0,
		provinceName: String,
	})
	expect(summary.regions.map((region) => region.tier)).toEqual([
		"county",
		"county",
	])
})

it.each([
	1, 2, 3,
])("promotes and demotes established admins across tier %i", (tier) => {
	const base = [
		{ tier, seat: 0, provinces: [0, 1] },
		{ tier, seat: 2, provinces: [2, 3] },
	]
	const lower =
		tier === 1
			? []
			: [
					{ tier: tier - 1, seat: 0, provinces: [0] },
					{ tier: tier - 1, seat: 1, provinces: [1] },
					{ tier: tier - 1, seat: 2, provinces: [2] },
					{ tier: tier - 1, seat: 3, provinces: [3] },
				]
	const fx = DISTRICT_FIXTURE.create({
		count: 4,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
		],
		titles: [...base, ...lower],
	})
	const crownAdmin = DISTRICT_FIXTURE.person({
		fixture: fx,
		seat: 1,
		father: -1,
	})
	const admin = DISTRICT_FIXTURE.person({ fixture: fx, seat: 3, father: -1 })
	const capture = DISTRICTS_REPORT.capture({ engine: fx.state })
	try {
		DISTRICT_FIXTURE.titles({
			fixture: fx,
			titles: [
				...base,
				...lower,
				{ tier: tier + 1, seat: 0, provinces: [0, 1, 2, 3] },
			],
		})
		DISTRICTS.settle({ state: fx.state, rng: fx.rng })
		expect(fx.state.people.rulerOf[2]).toBe(admin)
		expect(fx.state.people.persons.heldSeats[crownAdmin]).toEqual([])
		fx.state.time += STATE.yearMs
		DISTRICTS_REPORT.sample({ engine: fx.state, tracker: capture.tracker })
		DISTRICT_FIXTURE.titles({ fixture: fx, titles: [...base, ...lower] })
		DISTRICTS.settle({ state: fx.state, rng: fx.rng })
		expect(fx.state.people.rulerOf[3]).toBe(admin)
		fx.state.time += STATE.yearMs
		DISTRICTS_REPORT.sample({ engine: fx.state, tracker: capture.tracker })
		const report = DISTRICTS_REPORT.summarize({
			engine: fx.state,
			tracker: capture.tracker,
			from: fx.state.time / STATE.yearMs - 2,
			to: fx.state.time / STATE.yearMs,
		})
		expect(
			Object.values(report.promoted).reduce((sum, count) => sum + count, 0),
		).toBe(1)
		expect(
			Object.values(report.demoted).reduce((sum, count) => sum + count, 0),
		).toBe(1)
		expect(report.repeatedTierChanges).toBe(1)
		expect(report.deriveCalls).toBe(2)
	} finally {
		capture.detach()
	}
})

it("retains the lost district rank when its title disappears and prefers its current home region", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 4,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
		],
		titles: [
			{ tier: 2, seat: 0, provinces: [0, 1, 2, 3] },
			{ tier: 1, seat: 0, provinces: [0, 1] },
			{ tier: 1, seat: 2, provinces: [2, 3] },
		],
	})
	const admin = DISTRICT_FIXTURE.person({ fixture: fx, seat: 2, father: -1 })
	DISTRICT_FIXTURE.titles({
		fixture: fx,
		titles: [
			{ tier: 1, seat: 0, provinces: [0, 1] },
			{ tier: 1, seat: 2, provinces: [2, 3] },
		],
	})
	expect(fx.state.seatRank[2]).toBe(1)
	expect(fx.state.districtRank[2]).toBe(1)
	DISTRICTS.settle({ state: fx.state, rng: fx.rng })
	expect(fx.state.people.rulerOf[3]).toBe(admin)
})

it("keeps derived districts valid through simulated decades", () => {
	const { engine: state } = HISTORY_RUN.createEngine({
		seed: 14963991,
		era: "lateMedieval",
		numPoints: 10000,
	})
	const rng = HISTORY_RNG.createHistoryRng(14963991)
	const start = state.time
	for (let decade = 1; decade <= 3; decade++) {
		SIM_ENGINE.simulateUntil({
			state,
			targetTimeMs: start + decade * 10 * STATE.yearMs,
			rng,
			validate: true,
		})
		for (let seat = 0; seat < state.P; seat++) {
			if (!STATE_TITLES.isDistrictSeat({ state, seat })) continue
			const land = new Set(STATE.getNationProvinces({ state, root: seat }))
			const reached = new Set([seat])
			const queue = [seat]
			for (let head = 0; head < queue.length; head++)
				for (const neighbor of STATE.getProvinceNeighbors({
					state,
					p: queue[head],
				})) {
					if (!land.has(neighbor) || reached.has(neighbor)) continue
					reached.add(neighbor)
					queue.push(neighbor)
				}
			expect(reached.size).toBe(land.size)
		}
		for (let p = 0; p < state.P; p++) {
			if (state.desolate[p] || state.stateless[p]) continue
			const realm = state.sovereignCurrent[p]
			const parent = state.parentCurrent[p]
			if (p !== realm)
				expect(
					parent === realm ||
						STATE_TITLES.isDistrictSeat({ state, seat: parent }),
				).toBe(true)
			if (STATE_TITLES.isDistrictSeat({ state, seat: p }))
				expect(state.seatRank[p]).toBe(state.topTier[realm] - 1)
		}
	}
}, 120000)

it("demotes a displaced king into a containing duchy instead of treating it as a promotion", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 4,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
		],
		titles: [
			{ tier: 3, seat: 0, provinces: [0, 1, 2, 3] },
			{ tier: 2, seat: 0, provinces: [0, 1] },
			{ tier: 2, seat: 2, provinces: [2, 3] },
		],
	})
	const admin = DISTRICT_FIXTURE.person({ fixture: fx, seat: 2, father: -1 })
	DISTRICT_FIXTURE.titles({
		fixture: fx,
		titles: [
			{ tier: 2, seat: 0, provinces: [0, 1, 2, 3] },
			{ tier: 1, seat: 0, provinces: [0, 1] },
			{ tier: 1, seat: 3, provinces: [2, 3] },
		],
	})
	const checks = DISTRICTS.revalidate({ state: fx.state, seats: [2] })
	expect(checks[0].rank).toBe(2)
	const memories = JSON.stringify([...fx.state.people.memories])
	const moves = DISTRICTS.reseat({
		state: fx.state,
		displaced: [{ person: admin, seat: 2, rank: checks[0].rank }],
		reason: "territorial change",
	})
	expect(moves).toMatchObject([{ person: admin, to: 3, reason: "demotion" }])
	expect(JSON.stringify([...fx.state.people.memories])).toBe(memories)
})

it("orders displaced admins by lost rank, owned home population and then lost seat", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 6,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
		],
		titles: [
			{ tier: 2, seat: 0, provinces: [0, 1, 2, 3, 4, 5] },
			{ tier: 1, seat: 0, provinces: [0, 1] },
			{ tier: 1, seat: 2, provinces: [2, 3, 4, 5] },
		],
	})
	const weaker = DISTRICT_FIXTURE.person({ fixture: fx, seat: -1, father: -1 })
	const stronger = DISTRICT_FIXTURE.person({
		fixture: fx,
		seat: -1,
		father: -1,
	})
	const lower = DISTRICT_FIXTURE.person({ fixture: fx, seat: -1, father: -1 })
	fx.state.popRuralCurrent[3] = 1000
	const moves = DISTRICTS.reseat({
		state: fx.state,
		displaced: [
			{ person: weaker, seat: 4, rank: 0 },
			{ person: stronger, seat: 3, rank: 0 },
			{ person: lower, seat: 5, rank: 0 },
		],
		reason: "territorial change",
	})
	expect(moves[0]).toMatchObject({
		person: stronger,
		to: 2,
		reason: "promotion",
	})
	expect(fx.state.people.rulerOf[2]).toBe(stronger)
	PEOPLE.vacate({
		people: fx.state.people,
		seat: 2,
		reason: "territorial change",
	})
	fx.state.popRuralCurrent[3] = fx.state.popRuralCurrent[4]
	const tied = DISTRICTS.reseat({
		state: fx.state,
		displaced: [
			{ person: weaker, seat: 4, rank: 0 },
			{ person: stronger, seat: 3, rank: 0 },
		],
		reason: "territorial change",
	})
	expect(tied[0].person).toBe(stronger)
})

it("uses a refounded home region before vacant seats elsewhere and bumps down only", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 6,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
		],
		titles: [
			{ tier: 3, seat: 0, provinces: [0, 1, 2, 3, 4, 5] },
			{ tier: 2, seat: 0, provinces: [0, 1] },
			{ tier: 2, seat: 2, provinces: [2, 3, 4, 5] },
		],
	})
	const admin = DISTRICT_FIXTURE.person({ fixture: fx, seat: 2, father: -1 })
	DISTRICT_FIXTURE.titles({
		fixture: fx,
		titles: [
			{ tier: 2, seat: 0, provinces: [0, 1, 2, 3, 4, 5] },
			{ tier: 1, seat: 0, provinces: [0, 1] },
			{ tier: 1, seat: 3, provinces: [2, 3] },
			{ tier: 1, seat: 5, provinces: [4, 5] },
		],
	})
	const bumped = DISTRICT_FIXTURE.person({ fixture: fx, seat: 3, father: -1 })
	// The current kingdom around the lost seat is refounded with only this home region.
	fx.state.titles.regionOf.fill(-1, fx.state.P, 2 * fx.state.P)
	for (const p of [2, 3]) fx.state.titles.regionOf[fx.state.P + p] = 0
	fx.state.titleMembers = DEJURE.membersOf({
		titles: fx.state.titles,
		provinceCount: fx.state.P,
	})
	DISTRICTS.revalidate({ state: fx.state, seats: [2] })
	const moves = DISTRICTS.reseat({
		state: fx.state,
		displaced: [{ person: admin, seat: 2, rank: 2 }],
		reason: "territorial change",
	})
	expect(moves).toMatchObject([
		{ person: admin, to: 3, bumped: true },
		{ person: bumped, to: -1 },
	])
	expect(fx.state.people.rulerOf[5]).toBe(-1)
	const rows = fx.state.people.log
	expect(
		Array.from({ length: rows.count }, (_, index) =>
			PEOPLE_LOG.read({ rows, index }),
		).some((row) => row.kind === "seat" && row.reason === "demotion"),
	).toBe(true)
})

it("leaves count-tier realms without districts", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 4,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
		],
		titles: [],
	})
	expect(fx.state.topTier[0]).toBe(0)
	expect(
		fx.members.some((seat) =>
			STATE_TITLES.isDistrictSeat({ state: fx.state, seat }),
		),
	).toBe(false)
})

it("demotes outside an empty home region after dissolution", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 4,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
		],
		titles: [{ tier: 1, seat: 3, provinces: [0, 1, 2, 3] }],
	})
	const admin = DISTRICT_FIXTURE.person({ fixture: fx, seat: -1, father: -1 })
	const moves = DISTRICTS.reseat({
		state: fx.state,
		displaced: [{ person: admin, seat: 3, rank: 2 }],
		reason: "territorial change",
	})
	expect(moves[0]).toMatchObject({ to: 2, reason: "demotion" })
})

it("prioritizes lost rank over population and never takes an equal-rank district", () => {
	const fx = DISTRICT_FIXTURE.create({
		count: 6,
		root: 0,
		edges: [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 4],
			[4, 5],
		],
		titles: [
			{ tier: 3, seat: 0, provinces: [0, 1, 2, 3, 4, 5] },
			{ tier: 2, seat: 0, provinces: [0, 1] },
			{ tier: 2, seat: 2, provinces: [2, 3, 4, 5] },
			{ tier: 1, seat: 3, provinces: [2, 3] },
		],
	})
	const count = DISTRICT_FIXTURE.person({ fixture: fx, seat: -1, father: -1 })
	const duke = DISTRICT_FIXTURE.person({ fixture: fx, seat: -1, father: -1 })
	fx.state.popRuralCurrent[4] = 100000
	const moves = DISTRICTS.reseat({
		state: fx.state,
		displaced: [
			{ person: count, seat: 4, rank: 0 },
			{ person: duke, seat: 3, rank: 1 },
		],
		reason: "territorial change",
	})
	expect(moves[0]).toMatchObject({ person: duke, to: 2, reason: "promotion" })
	PEOPLE.vacate({
		people: fx.state.people,
		seat: 2,
		reason: "territorial change",
	})
	const king = DISTRICT_FIXTURE.person({ fixture: fx, seat: -1, father: -1 })
	expect(
		DISTRICTS.reseat({
			state: fx.state,
			displaced: [{ person: king, seat: 3, rank: 2 }],
			reason: "territorial change",
		}),
	).toMatchObject([{ to: -1, reason: "landless" }])
})
