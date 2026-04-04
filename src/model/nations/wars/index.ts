import { NATION } from "@/model/nations"
import { Province } from "@/model/provinces/types"
import { PROVINCE } from "../../provinces"
import { TIME } from "../../utilities/time"
import { RELATIONS } from "../relations"
import { War } from "./types"

const SIZE_ADVANTAGE = 2 // Power law exponent for wealth comparison (higher = bigger advantage)

export const WAR = {
	nation: {
		current: (nation: Province, time?: number): War[] => {
			const targetTime = time ?? window.world.time
			return WAR.nation
				.get(nation, targetTime)
				.filter(
					(w) =>
						w.startTime <= targetTime &&
						(w.endTime === undefined || w.endTime > targetTime),
				)
		},
		get: (nation: Province, time?: number): War[] => {
			const targetTime = time ?? window.world.time
			return nation._wars
				.map((idx) => window.world.wars[idx])
				.filter((w) => w.startTime <= targetTime)
		},
		add: (war: War) => {
			const attacker = window.world.provinces[war.attacker]
			const defender = window.world.provinces[war.defender]
			attacker._wars.push(war.idx)
			defender._wars.push(war.idx)
			RELATIONS.set({ nation: attacker, other: defender, relation: "war" })
		},
	},
	rebels: {
		get: (nation: Province, time?: number) => {
			return WAR.nation
				.current(nation, time)
				.filter((w) => w.rebel)
				.map((w) => {
					const rebel = window.world.provinces[w.defender]
					return NATION.provinces(rebel, time)
				})
				.flat()
		},
		active: (province: Province, time?: number) => {
			const nation = PROVINCE.nation(province, time)
			return WAR.nation
				.current(nation, time)
				.filter((w) => w.rebel)
				.some((w) => window.world.provinces[w.defender] === nation)
		},
		overlord: (province: Province, time?: number) => {
			const nation = PROVINCE.nation(province, time)
			const war = WAR.nation
				.current(nation, time)
				.filter((w) => w.rebel)
				.find((w) => window.world.provinces[w.defender] === nation)
			return window.world.provinces[war?.attacker]
		},
	},
	participants: (params: { war: War; time?: number }) => {
		const { war, time } = params
		const attacker = window.world.provinces[war.attacker]
		const defender = window.world.provinces[war.defender]
		const attackerAllies = RELATIONS.allies({
			nation: attacker,
			type: "offensive",
			target: defender,
			time,
		})
		const defenderAllies = RELATIONS.allies({
			nation: defender,
			type: "defensive",
			target: attacker,
			time,
		})
		return {
			attacker: { leader: attacker, allies: attackerAllies },
			defender: { leader: defender, allies: defenderAllies },
		}
	},
	strength: {
		solo: (params: {
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
			const activeWars = WAR.nation.current(nation).length
			return curr / (1 + activeWars)
		},
		coalition: (params: {
			attacker: Province
			defender: Province
			exclude?: Province
			time?: number
		}) => {
			const { attacker, defender, exclude, time } = params
			const attackerAllies = RELATIONS.allies({
				nation: attacker,
				type: "offensive",
				target: defender,
			})
			const defenderAllies = RELATIONS.allies({
				nation: defender,
				type: "defensive",
				target: attacker,
			})
			const attackerStr = WAR.strength.solo({
				nation: attacker,
				exclude,
				time,
			})
			const defenderStr = WAR.strength.solo({
				nation: defender,
				exclude,
				time,
			})
			const attackerAllyStr = attackerAllies.reduce((sum, ally) => {
				return sum + WAR.strength.solo({ nation: ally, time }) * 0.5
			}, 0)
			const defenderAllyStr = defenderAllies.reduce((sum, ally) => {
				return sum + WAR.strength.solo({ nation: ally, time }) * 0.5
			}, 0)
			return {
				attacker: attackerStr + attackerAllyStr,
				defender: defenderStr + defenderAllyStr,
			}
		},
	},
	threat: (params: {
		attacker: Province
		defender: Province
		exclude?: Province
		time?: number
	}): number => {
		const { attacker, defender, exclude, time } = params
		const str = WAR.strength.coalition({ attacker, defender, exclude, time })
		const atkWealth = str.attacker ** SIZE_ADVANTAGE
		const defWealth = str.defender ** SIZE_ADVANTAGE
		return 1 - atkWealth / (atkWealth + defWealth)
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
		WAR.nation.add(war)

		// Log 'war started' event immediately
		window.world.past.push({
			tag: "war started",
			time: window.world.time,
			agents: [attacker.idx, defender.idx],
			attacker: attacker.idx,
			defender: defender.idx,
			war: warIdx,
			odds: 1 - WAR.threat({ attacker, defender }),
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

		const { attacker, defender } = WAR.participants({ war })

		const provincesToTransfer = (
			victory
				? NATION.provinces(defender.leader)
				: war.occupied.map((idx) => window.world.provinces[idx])
		).filter((province) => PROVINCE.nation(province) === defender.leader)

		const transferred: number[] = provincesToTransfer.map(
			(province) => province.idx,
		)

		NATION.domains.add(attacker.leader, provincesToTransfer)

		if (!victory) NATION.connections(defender.leader)

		// Downgrade "war" to "suspicious" for all opposing pairs
		RELATIONS.set({
			nation: attacker.leader,
			other: defender.leader,
			relation: "suspicious",
		})

		// If total victory, neighbors of attacker become suspicious (fear of expansion)
		if (victory) {
			const attackerAllyIdxs = new Set(attacker.allies.map((a) => a.idx))
			const attackerNeighbors = NATION.neighbors({ nation: attacker.leader })
			for (const neighbor of attackerNeighbors) {
				if (
					neighbor === defender.leader ||
					attackerAllyIdxs.has(neighbor.idx) ||
					!NATION.sovereign(neighbor)
				)
					continue
				const rel = RELATIONS.get({
					nation: attacker.leader,
					other: neighbor,
				})
				if (rel === "neutral" && window.dice.random < 0.4) {
					RELATIONS.set({
						nation: attacker.leader,
						other: neighbor,
						relation: "suspicious",
					})
				} else if (rel === "friendly" && window.dice.random < 0.4) {
					RELATIONS.set({
						nation: attacker.leader,
						other: neighbor,
						relation: "neutral",
					})
				}
			}
		}

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
