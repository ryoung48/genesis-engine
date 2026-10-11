import type { EndParams } from "@/model/history/sim/engine/state/regency/types"
import { PEOPLE } from "@/model/history/sim/people"

function end({ state, realm, cause }: EndParams): void {
	const people = state.people
	const regency = people.regencies.get(realm)
	if (!regency) return
	people.regencies.delete(realm)
	if (regency.regent >= 0)
		PEOPLE.setRegent({ people, seat: realm, person: -1, ward: regency.ward })
	state.events.push({
		tag: "regency ended",
		time: state.time,
		data: {
			nation: realm,
			ward: regency.ward,
			regent: regency.regent,
			kind: regency.kind,
			regencyCause: regency.cause,
			cause,
		},
	})
}

export const STATE_REGENCY = { end }
