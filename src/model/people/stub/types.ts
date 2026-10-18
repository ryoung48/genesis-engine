import type { Lineage } from "@/model/people/anchors/types"
import type { Character } from "@/model/people/character/types"
import type { Life } from "@/model/people/health/types"
import type { PersonKey } from "@/model/people/keys/types"
import type { PeopleStore } from "@/model/people/store/types"

export type PersonKind = "ruler" | "spouse" | "child" | "injected" | "holder"

export interface PersonStub extends Lineage {
	key: PersonKey
	kind: PersonKind
	sex: number
	birthMs: number
	noParentCharacter: boolean
	// Noble rank: -2 inherits from the parents, -1 lowborn, 0 baron to 5 hegemon.
	tier: number
	// Province of residence; -2 inherits from the parents.
	seat: number
	survivesMs: number
	fixedDeathMs: number | null
	// [JUSTIFICATION] Only a mother who dies in childbirth overrides the drawn cause.
	forcedCause: string | null
	// [JUSTIFICATION] Characters are drawn lazily, on the first read.
	character: Character | null
	// [JUSTIFICATION] Lives are run lazily, on the first read.
	life: Life | null
}

export interface StubParams {
	store: PeopleStore
	key: PersonKey
}

export interface MakeStubParams {
	store: PeopleStore
	key: PersonKey
	kind: PersonKind
	sex: number
	birthMs: number
	lineage: Lineage
	noParentCharacter: boolean
	tier: number
	seat: number
	survivesMs: number
	fixedDeathMs: number | null
	forcedCause: string | null
}

export interface StubRefParams {
	store: PeopleStore
	stub: PersonStub
}

export interface PersonNames {
	name: string
	house: string | null
}

export interface NameSeedParams {
	store: PeopleStore
	seed: number
	home: number
	sex: number
}
