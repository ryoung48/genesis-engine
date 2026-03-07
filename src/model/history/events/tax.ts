/**
 * HEALTH CHECK EVENT HANDLER
 *
 * Records the current and optimal wealth of all nations once per year.
 * This provides a historical record for charting wealth over time.
 */

import { NATION } from "@/model/nations"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { TIME } from "@/model/utilities/time"
import { WAR } from "../../nations/wars"
import { TaxEvent } from "../types"

/**
 * Calculate the fraction of the past year that a nation spent at peace (not at war).
 * Returns a value between 0 (entire year at war) and 1 (entire year at peace).
 */
const peaceFraction = (nation: Province, previous: number): number => {
	const start = previous
	const end = window.world.time
	const duration = end - start
	const wars = WAR.nation.get(nation)

	// Calculate total time spent at war during the past year
	let warTime = 0
	for (const war of wars) {
		const warStart = Math.max(war.startTime, start)
		const warEnd = Math.min(war.endTime ?? end, end)
		if (warStart < warEnd) {
			warTime += warEnd - warStart
		}
	}

	// Clamp to avoid floating point issues
	const peaceTime = Math.max(0, duration - warTime)
	return peaceTime / duration
}

export const TAX_EVENT = {
	init: () => {
		window.world.provinces
			.filter((p) => !p.desolate)
			.forEach((p) => {
				p._consumption.push({
					time: window.world.time,
					consumption: 0,
				})
				TAX_EVENT.spawn(p)
			})
	},
	spawn: (province: Province) => {
		window.world.future.enqueue({
			type: "tax",
			time: window.world.time + TIME.constants.yearMS,
			nation: province.idx,
			previous: window.world.time,
		})
	},
	run: (event: TaxEvent) => {
		const nation = window.world.provinces[event.nation]
		const peace = peaceFraction(nation, event.previous)
		const recovered = NATION.wealth.optimal(nation) * 0.1 * peace
		PROVINCE.consumption.delta(nation, -recovered)
		TAX_EVENT.spawn(nation)
	},
}
