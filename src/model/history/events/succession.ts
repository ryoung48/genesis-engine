/**
 * HEALTH CHECK EVENT HANDLER
 *
 * Records the current and optimal wealth of all nations once per year.
 * This provides a historical record for charting wealth over time.
 */

import { NATION } from "@/model/nations"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { SuccessionEvent } from "../types"

export const SUCCESSION_EVENT = {
	init: () => {
		window.world.provinces
			.filter((p) => !p.desolate)
			.forEach((p) => {
				SUCCESSION_EVENT.spawn(p)
			})
	},
	spawn: (province: Province) => {
		const event = PROVINCE.leader.add(province)
		window.world.future.enqueue({
			type: "succession",
			time: event.end,
			province: province.idx,
			idx: event.idx,
		})
	},
	run: (event: SuccessionEvent) => {
		// Record wealth snapshot for all nations
		const province = window.world.provinces[event.province]
		const leader = province._leader[event.idx]
		const curr = province._leader[province._leader.length - 1]
		if (curr?.idx !== leader.idx) return
		SUCCESSION_EVENT.spawn(province)
		const overlord = PROVINCE.parent.get(province)

		// Log the succession event with the deceased leader and new successor
		const newLeader = province._leader[province._leader.length - 1]
		window.world.past.push({
			tag: "succession",
			time: window.world.time,
			agents: [province.idx],
			nation: province.idx,
			leader: event.idx,
			successor: newLeader.idx,
		})

		if (!overlord && PROVINCE.children.get(province).length > 0) {
			// Random subject rebellions during succession
			const subjects = window.dice
				.shuffle(PROVINCE.children.get(province))
				.filter((s) => {
					return !NATION.provinces(s).some((p) => PROVINCE.occupations.get(p))
				})
			const total = subjects.length
			let rebelCount = 0
			const rebellionChance = 0.5 // Probability of each additional rebel
			while (rebelCount < total && window.dice.random < rebellionChance) {
				rebelCount++
				const subject = subjects.pop()
				if (!subject) break
				if (PROVINCE.parent.get(subject) !== province) continue
				NATION.domains.release(subject)
				// Log individual rebellion events with fromSuccession flag
				window.world.past.push({
					tag: "rebellion",
					time: window.world.time,
					agents: [province.idx, subject.idx],
					overlord: province.idx,
					subject: subject.idx,
					succession: true,
				})
			}

			// Clean up disconnected vassals after rebellions
			NATION.connections(province)
		}
	},
}
