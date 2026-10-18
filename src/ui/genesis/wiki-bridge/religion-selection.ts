import type { WorldFrame } from "@/model/history/world-frame/types"

export interface ReligionSelectionParams {
	frame: WorldFrame
	supported: boolean
	select: (id: number) => void
}

export interface ReligionSelection {
	forKey: (key: string) => (() => void) | undefined
	selectKey: (key: string) => void
}

export function religionSelection({
	frame,
	supported,
	select,
}: ReligionSelectionParams): ReligionSelection {
	const forKey = (key: string): (() => void) | undefined => {
		if (!supported) return undefined
		const row = frame.religions.find((entry) => entry.key === key)
		return row ? () => select(row.id) : undefined
	}
	return { forKey, selectKey: (key) => forKey(key)?.() }
}
