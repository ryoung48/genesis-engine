import { DERIVE } from "@/model/history/sim/engine/derive"
import type {
	WealthCurrentParams,
	WealthOptimalParams,
} from "@/model/history/sim/engine/state/types"

export function wealthOptimal({ state, p }: WealthOptimalParams): number {
	return DERIVE.wealthOptimal({ state, p })
}

export function wealthCurrent({
	state,
	p,
	exclude,
	freedom,
	cache,
}: WealthCurrentParams): number {
	return DERIVE.wealthCurrent({
		state,
		p,
		cache,
		exclude,
		freedom,
	})
}
