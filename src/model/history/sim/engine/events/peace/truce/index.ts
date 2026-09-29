import type { TruceParams } from "@/model/history/sim/engine/events/peace/truce/types"
import { STATE } from "@/model/history/sim/engine/state"

const TRUCE_YEARS = 10

function truceKey({ state, a, b }: TruceParams): number {
	return Math.min(a, b) * state.P + Math.max(a, b)
}

function active(params: TruceParams): boolean {
	const key = truceKey(params)
	const expiry = params.state.truces.get(key)
	if (expiry === undefined) return false
	if (expiry > params.state.time) return true
	params.state.truces.delete(key)
	return false
}

function sign(params: TruceParams): void {
	params.state.truces.set(
		truceKey(params),
		params.state.time + STATE.deltaYear(TRUCE_YEARS),
	)
}

export const TRUCE = { active, sign }
