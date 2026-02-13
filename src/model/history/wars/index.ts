import { Province } from "@/model/provinces/types"
import { NATION } from "../../nations"
import { PROVINCE } from "../../provinces"
import { TIME } from "../../utilities/time"
import { War } from "./types"

const SIZE_ADVANTAGE = 2 // Power law exponent for wealth comparison (higher = bigger advantage)

export const WAR = {
	stats: {
		strength: (params: {
			nation: Province
			exclude?: Province
			time?: number
		}): number => {
			const { nation, exclude, time } = params
			const curr = Math.max(
				0.1,
				NATION.wealth.current({
					nation,
					exclude,
					freedom: exclude === nation,
					time,
				}),
			)
			const activeWars = PROVINCE.wars.active(nation).length
			return curr / (1 + activeWars)
		},
		threat: (params: {
			attacker: Province
			defender: Province
			exclude?: Province
			time?: number
		}): number => {
			const { attacker, defender, exclude, time } = params
			const atkWealth =
				WAR.stats.strength({ nation: attacker, exclude, time }) **
				SIZE_ADVANTAGE
			const defWealth =
				WAR.stats.strength({ nation: defender, exclude, time }) **
				SIZE_ADVANTAGE
			return 1 - atkWealth / (atkWealth + defWealth)
		},
	},
	start: (params: {
		attacker: Province
		defender: Province
		rebel?: boolean
	}): void => {
		const { attacker, defender, rebel } = params
		const warIdx = window.world.wars.length
		const war: War = {
			idx: warIdx,
			attacker: attacker.idx,
			defender: defender.idx,
			startTime: window.world.time,
			occupied: [],
			rebel: rebel ?? false,
		}
		window.world.wars.push(war)

		// Set war timestamps
		PROVINCE.wars.add(attacker, war)
		PROVINCE.wars.add(defender, war)

		// Log 'war started' event immediately
		window.world.past.push({
			tag: "war started",
			time: window.world.time,
			agents: [attacker.idx, defender.idx],
			attacker: attacker.idx,
			defender: defender.idx,
			war: warIdx,
			odds: 1 - WAR.stats.threat({ attacker, defender }),
		})

		// Schedule first battle 1-6 months in the future
		window.world.future.enqueue({
			type: "battle",
			war: warIdx,
			time: window.world.time + TIME.delta.month(window.dice.uniform(1, 6)),
			attacker: attacker.idx,
			defender: defender.idx,
		})
	},
	resolve: (params: {
		war: War
		victory?: boolean
		stalemate?: string
	}): void => {
		const { war, victory, stalemate } = params
		war.endTime = window.world.time
		const attacker = window.world.provinces[war.attacker]
		const defender = window.world.provinces[war.defender]

		const provincesToTransfer = (
			victory
				? NATION.provinces(defender)
				: war.occupied.map((idx) => window.world.provinces[idx])
		).filter((province) => PROVINCE.nation(province) === defender)

		const transferred: number[] = provincesToTransfer.map(
			(province) => province.idx,
		)

		NATION.domains.add(attacker, provincesToTransfer)

		if (!victory) NATION.connections(defender)

		// Log war ended with winner and transferred provinces
		window.world.past.push({
			tag: "war ended",
			time: window.world.time,
			agents: [war.attacker, war.defender],
			war: war.idx,
			attacker: war.attacker,
			defender: war.defender,
			winner: transferred.length > 0 ? war.attacker : war.defender,
			transferred,
			stalemate,
		})
	},
}
