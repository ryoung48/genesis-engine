import { DERIVE } from "@/model/history/derive"
import { EVENT_HEAP } from "@/model/history/event-heap"
import type {
	InitTaxParams,
	PeaceFractionParams,
	RunTaxParams,
} from "@/model/history/events/tax/types"
import { FIELDS } from "@/model/history/fields"
import { STATE } from "@/model/history/state"

function peaceFraction({
	state,
	nation,
	previous,
}: PeaceFractionParams): number {
	const start = previous
	const end = state.time
	const duration = end - start
	if (duration <= 0) return 1

	const wars = DERIVE.provinceWars({ state, p: nation, t: end })
		.map((idx: number) => state.wars[idx])
		.filter((w) => w.startTime <= end)

	let warTime = 0
	for (const war of wars) {
		const warStart = Math.max(war.startTime, start)
		const warEnd = Math.min(war.endTime ?? end, end)
		if (warStart < warEnd) warTime += warEnd - warStart
	}

	return Math.max(0, duration - warTime) / duration
}

function initTax({ state }: InitTaxParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		state.heap.enqueue(
			state.time + STATE.yearMs,
			EVENT_HEAP.evt.TAX,
			p,
			0,
			0,
			0,
			state.time,
		)
	}
}

function runTax({ state, nation, previousTime }: RunTaxParams): void {
	const peace = peaceFraction({ state, nation, previous: previousTime })
	const recovered = STATE.wealthOptimal({ state, p: nation }) * 0.1 * peace
	FIELDS.prov.consumption.set({
		state,
		p: nation,
		time: state.time,
		value: Math.max(
			0,
			FIELDS.prov.consumption.get({ state, p: nation }) - recovered,
		),
	})

	// Schedule next tax event
	state.heap.enqueue(
		state.time + STATE.yearMs,
		EVENT_HEAP.evt.TAX,
		nation,
		0,
		0,
		0,
		state.time,
	)
}

export const TAX = {
	initTax,
	runTax,
}
