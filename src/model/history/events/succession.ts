/**
 * HEALTH CHECK EVENT HANDLER
 *
 * Records the current and optimal wealth of all nations once per year.
 * This provides a historical record for charting wealth over time.
 */

import { NATION } from "@/model/nations"
import { RELATIONS } from "@/model/nations/relations"
import { PROVINCE } from "@/model/provinces"
import { LEADER } from "@/model/provinces/leader"
import { Province } from "@/model/provinces/types"
import { TIME } from "@/model/utilities/time"
import { SuccessionEvent } from "../types"

export const SUCCESSION_EVENT = {
	init: () => {
		window.world.provinces
			.filter((p) => !p.desolate)
			.forEach((p) => {
				SUCCESSION_EVENT.spawn(p)
			})
		LEADER.dynasty.init()
	},
	spawn: (province: Province) => {
		const event = LEADER.add(province)
		window.world.future.enqueue({
			type: "succession",
			time: event.end,
			province: province.idx,
			idx: event.idx,
		})
	},
	claim: (province: Province) => {
		const nation = PROVINCE.nation(province)
		const provinces = NATION.provinces(nation)
		const leader = LEADER.get(province)
		const others = provinces
			.filter((p) => p !== province)
			.filter((p) => LEADER.dynasty.get(p) === leader.dynasty)
		const claim = window.dice.weightedChoice([
			{ v: "none", w: others.length > 0 ? 0 : 1 },
			{ v: "weak", w: 1 },
			{ v: "average", w: 1 },
			{ v: "strong", w: 2 },
		])
		if (claim === "weak" || claim === "none") {
			const soverign = NATION.sovereign(province)
			const foreign = soverign
				? NATION.neighbors({ nation }).filter((n) => {
						const rel = RELATIONS.get({ nation, other: n })
						return rel === "friendly" || rel === "ally" || rel === "overlord"
					})
				: []
			const parent = PROVINCE.parent.get(province)
			const siblings = parent
				? PROVINCE.children.get(parent).filter((p) => p !== province)
				: []
			const children = PROVINCE.children.get(province)
			const candidates = [
				...foreign,
				...(parent ? [parent] : []),
				...siblings,
				...children,
			]
			// No heir → new dynasty immediately (old bloodline ends)
			if (candidates.length === 0) {
				leader.dynasty = LEADER.dynasty.add(province.culture)
				return
			}
			candidates.sort(
				(a, b) => NATION.wealth.optimal(b) - NATION.wealth.optimal(a),
			)
			const senior = candidates[0]
			const seniorDynasty = LEADER.dynasty.get(senior)
			// form a personal union if the dynasty is the same
			if (
				seniorDynasty === leader.dynasty &&
				PROVINCE.nation(senior) !== nation
			) {
				RELATIONS.set({
					nation: province,
					other: senior,
					relation: "personal_union_junior",
				})
				return
			}
			// otherwise spread the dynasty with a small chance of random noble
			leader.dynasty =
				claim === "none" && !soverign && window.dice.random > 0.95
					? LEADER.dynasty.add(province.culture)
					: seniorDynasty
		}
	},
	regency: (province: Province) => {
		const leader = LEADER.get(province)
		const age = TIME.date.diffYears(window.world.time, leader.birthTime)
		if (age < 16 && NATION.sovereign(province)) {
			window.world.past.push({
				tag: "regency started",
				time: window.world.time,
				agents: [province.idx],
				nation: province.idx,
				leader: leader.idx,
				age: Math.round(age),
			})
			const regencyEndTime = leader.birthTime + TIME.delta.year(16)
			if (regencyEndTime < leader.end) {
				window.world.future.enqueue({
					type: "regency",
					time: regencyEndTime,
					province: province.idx,
					leader: leader.idx,
				})
			}
		}
	},
	run: (event: SuccessionEvent) => {
		// Record wealth snapshot for all nations
		const province = window.world.provinces[event.province]
		const leader = province._leader[event.idx]
		const curr = LEADER.get(province)
		if (curr?.idx !== leader.idx) return
		SUCCESSION_EVENT.spawn(province)
		const overlord = PROVINCE.parent.get(province)

		// Log the succession event with the deceased leader and new successor
		const newLeader = LEADER.get(province)
		window.world.past.push({
			tag: "succession",
			time: window.world.time,
			agents: [province.idx],
			nation: province.idx,
			leader: event.idx,
			successor: newLeader.idx,
		})

		// Check for child ruler — emit regency events
		SUCCESSION_EVENT.regency(province)

		// Compute claim strength and handle PU formation for sovereign nations
		SUCCESSION_EVENT.claim(province)

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
