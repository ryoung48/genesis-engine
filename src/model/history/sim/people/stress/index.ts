import type { StressStepParams } from "@/model/history/sim/people/stress/types"
import { TRAITS } from "@/model/history/sim/people/traits"

function level(value: number): number {
	return Math.min(3, Math.floor(value / 100))
}
function fertilityFactor(value: number): number {
	return [1, 0.9, 0.7, 0.5][level(value)]
}
function step(params: StressStepParams): number {
	if (
		params.value === 0 &&
		params.bereavements === 0 &&
		!params.war &&
		!params.attacking &&
		!params.revolt &&
		!params.debt &&
		!params.paying
	)
		return 0
	const traits = TRAITS.active(params)
	const factors = TRAITS.stressFactors(params)
	const stressors =
		Number(params.war && traits.includes("craven")) +
		Number(params.attacking && traits.includes("content")) +
		Number(params.revolt && traits.includes("just")) +
		Number(params.attacking && traits.includes("compassionate")) +
		Number(params.debt && traits.includes("generous")) +
		Number(params.paying && traits.includes("greedy"))
	return Math.max(
		0,
		Math.min(
			400,
			params.value +
				(40 * stressors + 20 * params.bereavements) * factors.gain -
				30 * factors.loss,
		),
	)
}
export const STRESS = { level, step, fertilityFactor }
