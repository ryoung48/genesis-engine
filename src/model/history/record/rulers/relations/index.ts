import type { OutcomeParams } from "@/model/history/record/rulers/relations/types"
import type { PlanRelation } from "@/model/history/record/rulers/types"

const DIRECT_CLAIM = 3
const NEAR_KIN_CLAIM = 2

function ofOutcome({ house, claim }: OutcomeParams): PlanRelation {
	if (house === "new") return "none"
	if (house === "other") return "daughterLine"
	if (claim === DIRECT_CLAIM) return "son"
	if (claim === NEAR_KIN_CLAIM) return "nearKin"
	return "kinsman"
}

export const RULER_RELATIONS = { ofOutcome }
