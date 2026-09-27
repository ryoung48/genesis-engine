import type {
	PatricianParams,
	RepublicParams,
} from "@/model/history/sim/engine/events/people/patricians/types"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { FAMILY } from "@/model/history/sim/people/family"
import { HEIRS } from "@/model/history/sim/people/heirs"

function isRepublic({ state, realm }: RepublicParams): boolean {
	const government = state.governmentType[realm]
	return (
		GOVERNMENT.govFamilyOfIndex(government) === "republic" &&
		GOVERNMENT.successionOfIndex(government) === "election"
	)
}

function houseCount(realm: number): number {
	return 3 + ((Math.imul(realm + 1, 2654435761) >>> 0) % 3)
}

// Keeps 3-5 patrician house heads per electoral republic: a dead head passes
// to their heir, an extinct house is replaced by a new one.
function settle({ state, rng }: PatricianParams): void {
	const people = state.people
	const table = people.persons
	const time = state.time / STATE.yearMs
	for (const realm of people.patricians.keys())
		if (
			!STATE.isSovereign({ state, p: realm }) ||
			!isRepublic({ state, realm })
		)
			people.patricians.delete(realm)
	for (let realm = 0; realm < state.P; realm++) {
		if (people.rulerOf[realm] < 0) continue
		if (!STATE.isSovereign({ state, p: realm })) continue
		if (!isRepublic({ state, realm })) continue
		const heads: number[] = []
		for (const head of people.patricians.get(realm) ?? []) {
			if (PEOPLE.aliveAt({ people, person: head, time })) {
				heads.push(head)
				continue
			}
			const heir = HEIRS.of({
				people,
				dying: head,
				time,
				preference: PEOPLE.preference(STATE.originOf({ state, realm })),
				eligible: (person) => table.throne[person] < 0,
			}).heir
			if (heir >= 0) heads.push(heir)
		}
		while (heads.length < houseCount(realm))
			heads.push(
				FAMILY.found({
					people,
					origin: STATE.originOf({ state, realm }),
					time,
					age: rng.uniform(25, 60),
					rank: 0,
					rng,
				}),
			)
		for (const head of heads) PEOPLE.recordFamily({ people, person: head })
		people.patricians.set(realm, heads)
	}
}

export const PATRICIANS = { settle }
