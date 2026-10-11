import type { SettleRealmParams } from "@/model/history/sim/engine/state/patricians/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { FAMILY } from "@/model/history/sim/people/family"
import { HEIRS } from "@/model/history/sim/people/heirs"

function houseCount(realm: number): number {
	return 3 + ((Math.imul(realm + 1, 2654435761) >>> 0) % 3)
}

function settleRealm({
	state,
	realm,
	sovereign,
	origin,
	time,
	rng,
	found,
}: SettleRealmParams): void {
	const people = state.people
	const table = people.persons
	const government = state.governmentType[realm]
	if (
		!sovereign ||
		GOVERNMENT.govFamilyOfIndex(government) !== "republic" ||
		GOVERNMENT.successionOfIndex(government) !== "election"
	) {
		people.patricians.delete(realm)
		state.electionStreaks.delete(realm)
		return
	}
	if (people.rulerOf[realm] < 0) return
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
			preference: PEOPLE.preference(origin),
			eligible: (person) => table.heldSeats[person].length === 0,
		}).heir
		if (heir >= 0) heads.push(heir)
	}
	while (heads.length < houseCount(realm))
		heads.push(
			found
				? found({ realm, slot: heads.length })
				: FAMILY.found({
						people,
						origin: origin,
						time,
						age: rng.uniform(25, 60),
						rank: 0,
						rng,
					}),
		)
	people.patricians.set(realm, heads)
}

export const STATE_PATRICIANS = { settleRealm }
