import type { CharacterParams } from "@/model/history/sim/people/character/types"
import type { Character } from "@/model/history/sim/people/traits/types"

function of({ people, person }: CharacterParams): Character {
	const table = people.persons
	return {
		bases: table.bases[person],

		personality: table.personality[person],
		grades: table.grades[person],
		congenital: table.congenital[person],
		carried: table.carried[person],
	}
}
export const CHARACTER = { of }
