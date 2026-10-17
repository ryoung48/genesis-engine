import type {
	RecoveryParams,
	RecoveryResult,
} from "@/model/history/sim/engine/military/recovery/types"

function recover({
	holdings,
	target,
	rate,
	years,
}: RecoveryParams): RecoveryResult {
	if (years <= 0) return { holdings, replacements: 0, soldierYears: 0 }
	const shortfall = Math.max(0, target - holdings)
	if (rate <= 0 || shortfall <= 0)
		return { holdings, replacements: 0, soldierYears: holdings * years }
	const k = -Math.log1p(-rate)
	const closed = -Math.expm1(-k * years)
	const replacements = shortfall * closed
	const x = k * years
	const growthIntegral =
		Math.abs(x) < 1e-4
			? years * (x / 2 - (x * x) / 6 + (x * x * x) / 24)
			: years - closed / k
	return {
		holdings: holdings + replacements,
		replacements,
		soldierYears: holdings * years + shortfall * growthIntegral,
	}
}

export const RECOVERY = { recover }
