import type { NameSeatsParams } from "@/ui/genesis/wiki-bridge/title-names/types"

function nameSeats({ record }: NameSeatsParams): Int32Array {
	const base = record.titles
	if (!base) return new Int32Array(0)
	const created = record.events.titleEvents.filter(
		(event) => event.kind === "created",
	)
	const seats = new Int32Array(base.count + created.length).fill(-1)
	seats.set(base.seat)
	for (const event of created)
		if (event.kind === "created") seats[event.title] = event.seat
	return seats
}

function tiers({ record }: NameSeatsParams): Uint8Array {
	const base = record.titles
	if (!base) return new Uint8Array(0)
	const created = record.events.titleEvents.filter(
		(event) => event.kind === "created",
	)
	const result = new Uint8Array(base.count + created.length)
	result.set(base.tier)
	for (const event of created)
		if (event.kind === "created") result[event.title] = event.tier
	return result
}

export const TITLE_NAMES = { nameSeats, tiers }
