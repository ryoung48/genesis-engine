import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { PARTITION } from "@/model/history/sim/engine/events/succession/partition"
import type {
	AwardParams,
	ProjectionParams,
} from "@/model/history/sim/engine/events/succession/projection/types"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { HEIRS } from "@/model/history/sim/people/heirs"

function award({ state, standing, share }: AwardParams): void {
	if (share.heir >= 0)
		standing.set(
			share.heir,
			Math.max(standing.get(share.heir) ?? 0, state.seatRank[share.seat] + 1),
		)
}

function districts({ state }: ProjectionParams): Map<number, number> {
	const standing = new Map<number, number>()
	for (let seat = 0; seat < state.P; seat++)
		if (
			state.people.rulerOf[seat] >= 0 &&
			STATE_TITLES.isDistrictSeat({ state, seat })
		)
			award({
				state,
				standing,
				share: { heir: DISTRICTS.heirOf({ state, seat }), seat },
			})
	return standing
}

function crowns({ state }: ProjectionParams): Map<number, number> {
	const standing = new Map<number, number>()
	for (let realm = 0; realm < state.P; realm++) {
		const dying = state.people.rulerOf[realm]
		if (
			dying < 0 ||
			STATE_TITLES.isDistrictSeat({ state, seat: realm }) ||
			!STATE.isSovereign({ state, p: realm }) ||
			GOVERNMENT.successionOfIndex(state.governmentType[realm]) !==
				"single_heir"
		)
			continue
		const primary = HEIRS.of({
			people: state.people,
			dying,
			time: state.time / STATE.yearMs,
			preference: SUCCESSION_SYSTEMS.preferenceOf({ state, realm }),
			eligible: (person) =>
				SUCCESSION_SYSTEMS.inheritable({ state, realm, person }),
		}).heir
		award({ state, standing, share: { heir: primary, seat: realm } })
		for (const share of PARTITION.project({ state, realm, dying, primary }))
			award({ state, standing, share })
	}
	return standing
}

export const SUCCESSION_PROJECTION = { districts, crowns }
