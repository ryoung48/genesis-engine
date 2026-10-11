import type { RelationCodes } from "@/model/history/sim/engine/fields/relation-code/types"

export const RELATION_CODE: RelationCodes = {
	NONE: 0,
	OVERLORD: 1,
	VASSAL: 2,
	PU_SENIOR: 3,
	PU_JUNIOR: 4,
	ALLY: 5,
	WAR: 10,
	COLONY: 11,
}
