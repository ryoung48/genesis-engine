import type { EffectiveIndexParams } from "@/model/shared/time/effective/types"

function latest({ times, length, time }: EffectiveIndexParams): number {
	let selected = -1
	for (let index = 0; index < length; index++)
		if (
			times[index] <= time &&
			(selected < 0 || times[index] >= times[selected])
		)
			selected = index
	return selected
}

export const EFFECTIVE_TIME = { latest }
