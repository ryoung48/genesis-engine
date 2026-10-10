import type {
	CreateWarParams,
	EndWarParams,
} from "@/model/history/distribution/record/war/types"
import type { WarRecord } from "@/model/history/record/types"

function create({
	id,
	name,
	attacker,
	defender,
	province,
	rebel,
	startTimeMs,
	endTimeMs,
}: CreateWarParams): WarRecord {
	const war: WarRecord = {
		id,
		name,
		casusBelli: rebel ? "rebellion" : "conquest",
		warGoalType: rebel ? "rebellion" : "conquest",
		warGoalId: defender,
		warGoalProvinceId: province,
		rebel,
		events: [
			{
				timeMs: startTimeMs,
				nationId: attacker,
				kind: "warStart",
				side: "attacker",
				comment: null,
			},
			{
				timeMs: startTimeMs,
				nationId: defender,
				kind: "warStart",
				side: "defender",
				comment: null,
			},
		],
		battles: [],
		sieges: [],
		mobilization: [],
		warScore: null,
	}
	if (endTimeMs !== null)
		end({ war, attacker, defender, timeMs: endTimeMs, comment: "Independence" })
	return war
}

function end({ war, attacker, defender, timeMs, comment }: EndWarParams): void {
	war.events.push(
		{ timeMs, nationId: attacker, kind: "warEnd", side: "attacker", comment },
		{ timeMs, nationId: defender, kind: "warEnd", side: "defender", comment },
	)
}

export const DISTRIBUTION_RECORD_WAR = { create, end }
