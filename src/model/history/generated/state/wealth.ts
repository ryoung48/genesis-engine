import { DERIVE } from "@/model/history/generated/derive"
import type {
	WealthCurrentParams,
	WealthOptimalParams,
} from "@/model/history/generated/state/types"

export function wealthOptimal({ state, p }: WealthOptimalParams): number {
	return DERIVE.wealthOptimal({ state, p, t: state.time })
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
		t: state.time,
		cache,
		exclude,
		freedom,
	})
}
