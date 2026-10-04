import type {
	HoldingParams,
	OrderSeatsParams,
	RankedHoldingsParams,
} from "@/model/history/sim/people/holdings/types"

function detach({ people, seat, person }: HoldingParams): void {
	if (person < 0) return
	const seats = people.persons.heldSeats[person]
	const index = seats.indexOf(seat)
	if (index >= 0) seats.splice(index, 1)
	if (people.rulerOf[seat] === person) people.rulerOf[seat] = -1
}

function attach({ people, seat, person }: HoldingParams): void {
	const previous = people.rulerOf[seat]
	if (previous === person) return
	detach({ people, seat, person: previous })
	if (person < 0) return
	const seats = people.persons.heldSeats[person]
	const index = seats.findIndex((held) => held > seat)
	seats.splice(index < 0 ? seats.length : index, 0, seat)
	people.rulerOf[seat] = person
}

function order({ seats, ranks }: OrderSeatsParams): number[] {
	return [...seats].sort((a, b) => ranks[b] - ranks[a] || a - b)
}

function ordered({ people, person, ranks }: RankedHoldingsParams): number[] {
	return order({ seats: people.persons.heldSeats[person], ranks })
}

function primary({ people, person, ranks }: RankedHoldingsParams): number {
	let primary = -1
	for (const seat of people.persons.heldSeats[person])
		if (primary < 0 || ranks[seat] > ranks[primary]) primary = seat
	return primary
}

function standing(params: RankedHoldingsParams): number {
	const seat = primary(params)
	return seat < 0 ? 0 : params.ranks[seat] + 1
}

export const HOLDINGS = { attach, detach, order, ordered, primary, standing }
