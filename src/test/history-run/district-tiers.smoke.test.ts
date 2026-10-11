import { expect, it } from "vitest"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { FRAME } from "@/model/history/world-frame"
import type { WorldFrame } from "@/model/history/world-frame/types"
import { DISTRICT_FIXTURE } from "@/test/history-run/fixtures/district-tiers"
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
