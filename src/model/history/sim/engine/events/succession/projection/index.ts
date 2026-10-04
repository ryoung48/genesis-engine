import { DISTRICTS } from "@/model/history/sim/engine/events/people/districts"
import { PARTITION } from "@/model/history/sim/engine/events/succession/partition"
import type { PartitionShare } from "@/model/history/sim/engine/events/succession/partition/types"
import type { ProjectionParams } from "@/model/history/sim/engine/events/succession/projection/types"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { HEIRS } from "@/model/history/sim/people/heirs"

function of({ state }: ProjectionParams): Map<number, number> {
	const standing = new Map<number, number>()
	const award = (share: PartitionShare) => {
		if (share.heir >= 0)
			standing.set(
				share.heir,
				Math.max(standing.get(share.heir) ?? 0, state.seatRank[share.seat] + 1),
			)
	}
	for (let realm = 0; realm < state.P; realm++) {
		const dying = state.people.rulerOf[realm]
		if (dying >= 0 && DISTRICTS.isDistrictSeat({ state, seat: realm })) {
			award({ heir: DISTRICTS.heirOf({ state, seat: realm }), seat: realm })
			continue
		}
		if (
			dying < 0 ||
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
		award({ heir: primary, seat: realm })
		for (const share of PARTITION.project({ state, realm, dying, primary }))
			award(share)
	}
	return standing
}

export const SUCCESSION_PROJECTION = { of }
