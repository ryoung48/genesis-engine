import type {
	ApplyTitleEventParams,
	CreateTitleFrameParams,
	FoldTitlesParams,
	HolderRealmAtParams,
	HolderRealmParams,
} from "@/model/history/record/titles/types"
import type { TitleFrame } from "@/model/history/world-frame/types"

const TIER_SLOTS = 4

function createFrame({ base, capacity }: CreateTitleFrameParams): TitleFrame {
	const tier = new Uint8Array(capacity)
	const seat = new Int32Array(capacity).fill(-1)
	const holder = new Int32Array(capacity).fill(-1)
	tier.set(base.tier)
	seat.set(base.seat)
	holder.set(base.holder)
	return {
		count: base.count,
		tier,
		seat,
		holder,
		regionOf: base.regionOf.slice(),
	}
}

function applyEvent({
	frame,
	provinceCount,
	event,
}: ApplyTitleEventParams): void {
	if (event.kind === "passed") {
		frame.holder[event.title] = event.to
		return
	}
	if (event.kind === "moved") {
		frame.seat[event.title] = event.to
		return
	}
	const children = new Set(event.children)
	const created = event.kind === "created"
	const tier = created ? event.tier : frame.tier[event.title]
	const slot = tier - 1
	if (created) {
		frame.tier[event.title] = event.tier
		frame.seat[event.title] = event.seat
		frame.holder[event.title] = event.holder
		frame.count = Math.max(frame.count, event.title + 1)
	} else {
		frame.seat[event.title] = -1
		frame.holder[event.title] = -1
	}
	for (let province = 0; province < provinceCount; province++) {
		const inside = created
			? slot > 0 &&
				children.has(frame.regionOf[(slot - 1) * provinceCount + province])
			: frame.regionOf[slot * provinceCount + province] === event.title
		if (!inside) continue
		frame.regionOf[slot * provinceCount + province] = created ? event.title : -1
		for (let i = 0; i < event.ancestors.length; i++)
			if (slot + 1 + i < TIER_SLOTS)
				frame.regionOf[(slot + 1 + i) * provinceCount + province] =
					event.ancestors[i]
	}
}

function fold({
	base,
	events,
	provinceCount,
	timeMs,
}: FoldTitlesParams): TitleFrame {
	const created = events.filter((event) => event.kind === "created").length
	const frame = createFrame({ base, capacity: base.count + created })
	for (const event of events) {
		if (event.timeMs > timeMs) break
		applyEvent({ frame, provinceCount, event })
	}
	return frame
}

function realmOf({ frame, holder }: HolderRealmParams): number {
	return holder < 0 || holder >= frame.provinceCount
		? -1
		: frame.provinceNation[holder]
}

function realmAt({ record, holder, timeMs }: HolderRealmAtParams): number {
	if (holder < 0) return -1
	const log = record.events.provinceEvents.get(holder)
	if (!log) return -1
	let realm = log.base.ownerId
	for (const event of log.events) {
		if (event.timeMs > timeMs) break
		if (event.kind === "owner")
			realm = (event.payload.nationId as number | null) ?? -1
	}
	return realm
}

export const TITLE_RECORD = { fold, realmOf, realmAt }
