import type { IsRebelGoalParams } from "@/model/history/sim/engine/state/war-goal/types"

function isRebelGoal({ goal }: IsRebelGoalParams): boolean {
	return goal === "independence" || goal === "throne"
}

export const WAR_GOAL = { isRebel: isRebelGoal }
