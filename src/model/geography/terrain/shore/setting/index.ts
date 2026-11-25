import { SHORE_EXPOSURE } from "@/model/geography/terrain/shore/exposure"
import { SHORE_RELIEF } from "@/model/geography/terrain/shore/relief"
import type {
	SettingOfParams,
	ShoreSetting,
	ShoreSettingParams,
} from "@/model/geography/terrain/shore/setting/types"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"

const C = SHORE_CONFIG

const kinds: readonly ShoreSetting[] = ["none", "delta", "estuary", "fjord"]

const code = Object.fromEntries(kinds.map((kind, i) => [kind, i])) as Record<
	ShoreSetting,
	number
>

function settingOf({
	relief,
	flowM3s,
	tidalRangeM,
	glaciated,
	leeClass,
}: SettingOfParams): number {
	if (relief === SHORE_RELIEF.code.low && flowM3s >= C.deltaFlowM3s)
		return code.delta
	if (flowM3s >= C.estuaryFlowM3s && tidalRangeM >= C.flatRangeM)
		return code.estuary
	if (glaciated && relief === SHORE_RELIEF.code.steep && leeClass < 2)
		return code.fjord
	return code.none
}

function classify({
	coastal,
	relief,
	flow,
	tidalRange,
	glaciated,
	exposureLeeM,
}: ShoreSettingParams): Uint8Array {
	const out = new Uint8Array(coastal.length)
	for (let r = 0; r < coastal.length; r++) {
		if (!coastal[r]) continue
		out[r] = settingOf({
			relief: relief[r],
			flowM3s: flow[r],
			tidalRangeM: tidalRange[r],
			glaciated: glaciated[r] === 1,
			leeClass: SHORE_EXPOSURE.classOf({ exposureM: exposureLeeM[r] }),
		})
	}
	return out
}

export const SHORE_SETTING = { kinds, code, settingOf, classify }
