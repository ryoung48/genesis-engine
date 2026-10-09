import { HOUSEHOLD } from "@/model/history/sim/people/household"
import { KINSHIP } from "@/model/history/sim/people/kinship"
import type {
	MarriageLaw,
	PermitsParams,
} from "@/model/history/sim/people/marriage-law/types"

const defaultLaw: MarriageLaw = {
	consort: "none",
	consortMax: 0,
	bar: "restricted",
}
function permits({ people, a, b, cache }: PermitsParams): boolean {
	if (
		a < 0 ||
		b < 0 ||
		a === b ||
		people.persons.sex[a] === people.persons.sex[b]
	)
		return false
	const { kind } = KINSHIP.relation({ context: people.persons, a, b, cache })
	return [a, b].every((person) => {
		const law = people.household.lawOfRealm(
			HOUSEHOLD.realmOf({ people, person }),
		)
		if (kind === "none" || kind === "distant" || law.bar === "unrestricted")
			return true
		if (kind === "close") return false
		return (
			law.bar === "aunt_nephew_and_uncle_niece" ||
			(kind === "cousin" && law.bar === "cousins")
		)
	})
}
export const MARRIAGE_LAW = { defaultLaw, permits }
