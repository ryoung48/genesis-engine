import { describe, expect, it } from "vitest"
import type {
	BattleContribution,
	SiegeBeat,
	SiegeRecord,
	WarRecord,
} from "@/model/history/record/types"
import { SIEGE_TIMELINE } from "@/ui/genesis/wiki-bridge/siege-timeline"
import { WAR_TROOP_SNAPSHOTS } from "@/ui/genesis/wiki-bridge/war-troop-snapshots"

const DAY_MS = 86400000
const initial: BattleContribution[] = [
	{ levy: 100, regular: 0, countryId: 0, troops: 100, role: null },
]
const reduced: BattleContribution[] = [
	{ levy: 80, regular: 0, countryId: 0, troops: 80, role: null },
]
function record(): SiegeRecord {
	return {
		timeMs: 0,
		province: 3,
		besieger: 0,
		defender: 1,
		besiegers: 100,
		garrisonTroops: 100,
		contributions: initial,
		beats: [],
		outcome: null,
		reason: null,
		endTimeMs: null,
		endContributions: null,
		phases: null,
	}
}
function warOf(sieges: SiegeRecord[]): WarRecord {
	return {
		id: 7,
		name: "The Test War",
		casusBelli: "conquest",
		warGoalType: "conquest",
		warGoalId: 1,
		warGoalProvinceId: 3,
		rebel: false,
		events: [],
		battles: [],
		mobilization: initial,
		sieges,
	}
}
function build(war: WarRecord) {
	return SIEGE_TIMELINE.build({
		war,
		viewpoint: null,
		nationNameOf: (id) => ["First Realm", "Second Realm"][id],
		provinceName: () => "The Walled Town",
	})
}
describe("siege timelines and troop snapshots", () => {
	it("has no end entry for a running siege and includes ended non-lifted sieges", () => {
		const siege = record()
		const war = warOf([siege])
		expect(build(war)).toHaveLength(1)
		Object.assign(siege, {
			outcome: "surrendered",
			endTimeMs: 210 * DAY_MS,
			endContributions: [],
			phases: 7,
		})
		const entries = build(war)
		expect(entries).toHaveLength(2)
		expect(entries[1].description).toContain("after 7 months")
		for (const entry of entries) {
			expect(entry.description).toContain("First Realm")
			expect(entry.description).toContain("Second Realm")
			expect(entry.description).toContain("The Walled Town")
			expect(entry).toMatchObject({
				besiegerId: 0,
				defenderId: 1,
				provinceId: 3,
				warId: 7,
			})
		}
	})
	it("filters by viewpoint, gives the winning side a positive ending and formats short durations", () => {
		const siege = {
			...record(),
			outcome: "relieved",
			endTimeMs: 12 * DAY_MS,
			endContributions: [],
			phases: 0,
		} as SiegeRecord
		const war = warOf([siege])
		const params = {
			war,
			nationNameOf: (id: number) => ["First Realm", "Second Realm"][id],
			provinceName: () => "The Walled Town",
		}
		expect(SIEGE_TIMELINE.build({ ...params, viewpoint: 5 })).toEqual([])
		const entries = SIEGE_TIMELINE.build({ ...params, viewpoint: 1 })
		expect(entries.at(-1)?.type).toBe("Siege (+)")
		expect(entries.at(-1)?.description).toContain("after 12 days")
		expect(entries.at(-1)?.description).toContain(war.name)
		expect(SIEGE_TIMELINE.build({ ...params, viewpoint: 0 }).at(-1)?.type).toBe(
			"Siege (-)",
		)
	})
	it.each([
		{
			beat: "sortie",
			won: true,
			outcome: "normal",
			effect: "breach repaired",
			text: "a breach is sealed",
		},
		{
			beat: "sortie",
			won: true,
			outcome: "normal",
			effect: "works burned",
			text: "burns the siege works",
		},
		{
			beat: "sortie",
			won: true,
			outcome: "inconclusive",
			effect: "none",
			text: "fought to a standstill",
		},
		{
			beat: "sortie",
			won: false,
			outcome: "normal",
			effect: "none",
			text: "is cut down",
		},
		{
			beat: "assault",
			won: true,
			outcome: "normal",
			effect: "stormed",
			text: "break in",
		},
		{
			beat: "assault",
			won: false,
			outcome: "normal",
			effect: "stormed",
			text: "town falls",
		},
		{
			beat: "assault",
			won: true,
			outcome: "inconclusive",
			effect: "stormed",
			text: "town falls",
		},
		{
			beat: "assault",
			won: true,
			outcome: "inconclusive",
			effect: "none",
			text: "cannot break in",
		},
		{
			beat: "assault",
			won: false,
			outcome: "normal",
			effect: "repelled",
			text: "thrown back",
		},
		{
			beat: "relief",
			won: true,
			outcome: "normal",
			effect: "relieved",
			text: "breaks the siege lines",
		},
		{
			beat: "relief",
			won: true,
			outcome: "inconclusive",
			effect: "none",
			text: "cannot break them",
		},
		{
			beat: "relief",
			won: false,
			outcome: "normal",
			effect: "none",
			text: "beaten off",
		},
	])("describes $beat / $effect / $won from its recorded effect", (row) => {
		const siege = record()
		siege.beats.push({
			...row,
			timeMs: DAY_MS,
			phase: 1,
			powerShare: 0.5,
			besiegerLosses: 1,
			garrisonLosses: 1,
			contributions: reduced,
		} as SiegeBeat)
		expect(build(warOf([siege]))[1].description).toContain(row.text)
	})
	it("has unique ids for repeated sieges and same-day beats", () => {
		const siege = record()
		siege.beats = [0, 1].map(() => ({
			timeMs: DAY_MS,
			phase: 1,
			beat: "disease",
			besiegerLosses: 1,
			garrisonLosses: 0,
			contributions: reduced,
		}))
		const entries = build(warOf([siege, structuredClone(siege)]))
		expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)
	})
	it("chooses the last same-date snapshot, including an empty ending", () => {
		const siege = record()
		siege.beats = [
			{
				timeMs: 30 * DAY_MS,
				phase: 1,
				beat: "disease",
				besiegerLosses: 20,
				garrisonLosses: 0,
				contributions: reduced,
			},
		]
		const war = warOf([siege])
		expect(
			WAR_TROOP_SNAPSHOTS.latest({
				war,
				startTimeMs: 0,
				cutoffTimeMs: 29 * DAY_MS,
			}),
		).toEqual({ timeMs: 0, contributions: initial })
		expect(
			WAR_TROOP_SNAPSHOTS.latest({
				war,
				startTimeMs: 0,
				cutoffTimeMs: 30 * DAY_MS,
			}),
		).toEqual({ timeMs: 30 * DAY_MS, contributions: reduced })
		Object.assign(siege, {
			outcome: "stormed",
			endTimeMs: 30 * DAY_MS,
			endContributions: [],
			phases: 1,
		})
		expect(
			WAR_TROOP_SNAPSHOTS.latest({
				war,
				startTimeMs: 0,
				cutoffTimeMs: 30 * DAY_MS,
			}),
		).toEqual({ timeMs: 30 * DAY_MS, contributions: [] })
	})
})
