import { PriorityQueue } from "@datastructures-js/priority-queue"
import { deviation, mean, scaleThreshold } from "d3"
import { CELL } from "../cells"
import { PROVINCE } from "../provinces"
import { Province, Relation } from "../provinces/types"
import { ARRAY } from "../utilities/array"
import { MATH } from "../utilities/math"
import { NationNeighborParams } from "./types"

const domainLimit = scaleThreshold<number, number>()
	.domain([3, 5, 8, 13, 21, 31, 51, 81])
	.range([2, 3, 4, 5, 6, 7, 8, 9, 10])
const TRIBUTE = 0.25

export const NATION = {
	connections: (province: Province) => {
		let disconnected = true
		while (disconnected) {
			disconnected = false
			PROVINCE.children
				.get(province)
				.filter((subject) => !PROVINCE.connected(subject))
				.forEach((subject) => {
					disconnected = true
					NATION.domains.release(subject)
					window.world.past.push({
						tag: "rebellion",
						time: window.world.time,
						agents: [province.idx, subject.idx],
						overlord: province.idx,
						subject: subject.idx,
						disconnected: true,
					})
				})
		}
		if (!PROVINCE.connected(province)) {
			const overlord = PROVINCE.parent.get(province)
			window.world.past.push({
				tag: "rebellion",
				time: window.world.time,
				agents: [province.idx, overlord.idx],
				overlord: overlord.idx,
				subject: province.idx,
				disconnected: true,
			})
			NATION.domains.release(province)
			NATION.connections(overlord)
		}
	},
	neighbors: ({
		nation,
		depth = 0,
		time,
	}: NationNeighborParams): Province[] => {
		const provinces = NATION.provinces(nation, time)
		const neighbors = ARRAY.unique(
			provinces
				.map((t) => {
					return PROVINCE.neighbors({ province: t, type: "foreign", time }).map(
						(n) => PROVINCE.nation(n, time).idx,
					)
				})
				.flat(),
		)
			.map((r) => window.world.provinces[r])
			.filter((n) => n !== nation)
		if (depth === 0) return neighbors
		return ARRAY.unique(
			neighbors
				.map((n) => NATION.neighbors({ nation: n, depth: depth - 1, time }))
				.flat()
				.filter((n) => n !== nation),
		)
	},
	provinces: (nation: Province, time?: number): Province[] => {
		const subjects = PROVINCE.children.get(nation, time)
		return [nation, ...subjects.map((s) => NATION.provinces(s, time)).flat()]
	},
	nations: (time?: number) =>
		window.world.provinces.filter(
			(p) => !p.desolate && PROVINCE.nation(p, time) === p,
		),
	sovereign: (nation: Province, time?: number) => {
		const overlord = PROVINCE.parent.get(nation, time)
		return overlord === undefined
	},
	domains: {
		_parition: (seeds: Province[], provinces: Province[]): Province[][] => {
			const unassigned = new Set(provinces.map((p) => p.idx))
			seeds.forEach((s) => unassigned.delete(s.idx))

			const getNeighbors = (p: Province) =>
				PROVINCE.neighbors({ province: p })
					.map((n) => n.idx)
					.filter((idx) => unassigned.has(idx))

			const regions = seeds.map((seed) => ({
				members: [seed],
				frontier: new Set(getNeighbors(seed)),
			}))

			const queue = new PriorityQueue(
				(a, b) => a.members.length - b.members.length,
				regions.filter((r) => r.frontier.size > 0),
			)

			while (!queue.isEmpty()) {
				const region = queue.pop()!

				// Find first valid frontier province
				let nextIdx: number | undefined
				for (const idx of region.frontier) {
					region.frontier.delete(idx)
					if (unassigned.has(idx)) {
						nextIdx = idx
						break
					}
				}

				if (nextIdx === undefined) continue

				// Claim it
				unassigned.delete(nextIdx)
				const next = window.world.provinces[nextIdx]
				region.members.push(next)

				// Expand frontier
				getNeighbors(next).forEach((idx) => region.frontier.add(idx))

				if (region.frontier.size > 0) queue.push(region)
			}

			const members = regions.map((r) => r.members)
			// Recursively partition leftovers
			if (unassigned.size > 0) {
				const remainder = [...unassigned].map(
					(idx) => window.world.provinces[idx],
				)
				remainder.sort((a, b) => NATION.wealth.raw(b) - NATION.wealth.raw(a))
				const [wealthiest, ...rest] = remainder.sort(
					(a, b) => NATION.wealth.raw(b) - NATION.wealth.raw(a),
				)
				NATION.domains._parition([wealthiest], rest).forEach((group) => {
					members.push(group)
				})
			}

			return members
		},
		_score: (params: {
			province: Province
			center: Province
			avg: number
			std: number
		}) => {
			const { province, center, avg, std } = params
			const distance = PROVINCE.distance({ province, other: center })
			const penality =
				std === 0 ? 1 : Math.max(1, Math.abs((distance - avg) / std)) ** 0.5
			const infra = PROVINCE.population.urban.get(province) / 10e3
			return (NATION.wealth.raw(province) + infra) / penality
		},
		_rebalance: (nation: Province, provinces: Province[]) => {
			if (provinces.length === 0) return

			const k = Math.min(provinces.length, domainLimit(provinces.length))
			const distances = [nation, ...provinces].map((a) =>
				PROVINCE.distance({ province: nation, other: a }),
			)
			const avg = mean(distances) ?? 0
			const std = deviation(distances) ?? 0

			const scores = provinces.map((p) => ({
				province: p,
				score: NATION.domains._score({ province: p, center: nation, avg, std }),
			}))

			// Select k seeds using k-means++ style: wealth weighted by distance to existing seeds
			const seeds: Province[] = []
			const candidates = new Map(scores.map((s) => [s.province.idx, s.score]))

			for (let i = 0; i < k && candidates.size > 0; i++) {
				let best: Province | undefined
				let bestScore = -Infinity

				for (const [idx, baseScore] of candidates) {
					const province = window.world.provinces[idx]
					const minDist =
						seeds.length === 0
							? 1
							: Math.min(
									...seeds.map((s) =>
										PROVINCE.distance({ province, other: s }),
									),
								)
					const distFromCenter = PROVINCE.distance({ province, other: nation })
					const centerPenalty =
						std === 0
							? 1
							: Math.max(1, Math.abs((distFromCenter - avg) / std)) ** 2
					const adjustedScore = (baseScore * minDist) / centerPenalty
					if (adjustedScore > bestScore) {
						bestScore = adjustedScore
						best = province
					}
				}

				if (best) {
					seeds.push(best)
					candidates.delete(best.idx)
				}
			}

			// Flood fill to partition remaining provinces among seeds
			const regions = NATION.domains._parition(seeds, provinces)

			// Recurse: each seed subdivides its region
			regions.forEach(([seed, ...subjects]) => {
				PROVINCE.children.add(nation, [seed.idx])
				PROVINCE.parent.add(seed, nation.idx)
				if (subjects.length > 0) NATION.domains._rebalance(seed, subjects)
			})
		},
		add: (nation: Province, subjects: Province[]) => {
			const provinces = subjects
				.concat(NATION.provinces(nation))
				.filter((v) => v !== nation)
			provinces.forEach((p) => {
				NATION.domains.release(p)
			})
			NATION.domains._rebalance(nation, provinces)
		},
		release: (domain: Province) => {
			const overlord = PROVINCE.parent.get(domain)
			PROVINCE.occupations.remove(domain)
			PROVINCE.parent.remove(domain)
			if (!overlord) return
			PROVINCE.children.remove(overlord, [domain.idx])
		},
	},
	relation: {
		get: (params: { province: Province; other: Province; time?: number }) => {
			return PROVINCE.relation.get(params)
		},
		set: (params: {
			province: Province
			other: Province
			relation: Relation
		}) => {
			const { province, other, relation } = params
			PROVINCE.relation.set({ province, other, relation })
			PROVINCE.relation.set({ province: other, other: province, relation })
		},
	},
	rebels: {
		get: (nation: Province, time?: number) => {
			return PROVINCE.wars
				.active(nation, time)
				.filter((w) => w.rebel)
				.map((w) => {
					const rebel = window.world.provinces[w.defender]
					return NATION.provinces(rebel, time)
				})
				.flat()
		},
		active: (province: Province, time?: number) => {
			const nation = PROVINCE.nation(province, time)
			return PROVINCE.wars
				.active(nation, time)
				.filter((w) => w.rebel)
				.some((w) => window.world.provinces[w.defender] === nation)
		},
		overlord: (province: Province, time?: number) => {
			const nation = PROVINCE.nation(province, time)
			const war = PROVINCE.wars
				.active(nation, time)
				.filter((w) => w.rebel)
				.find((w) => window.world.provinces[w.defender] === nation)
			return window.world.provinces[war?.attacker]
		},
	},
	wealth: {
		raw: (nation: Province) => nation.habitability,
		_current: (nation: Province, time?: number, exclude?: Province): number => {
			const domains = PROVINCE.children.get(nation, time)
			const totalProvinces = NATION.provinces(nation, time).length
			const overextended =
				domains.length > domainLimit(totalProvinces) ? 0.9 : 1
			const net =
				NATION.wealth.raw(nation) - PROVINCE.consumption.get(nation, time)
			const collected =
				net +
				PROVINCE.children
					.get(nation, time)
					.filter((v) => v !== exclude)
					.reduce(
						(acc, v) =>
							acc + NATION.wealth._current(v, time, exclude) * TRIBUTE,
						0,
					)
			return collected * overextended
		},
		current: (params?: {
			nation: Province
			time?: number
			exclude?: Province
			freedom?: boolean
		}): number => {
			const { nation, time, exclude, freedom } = params ?? {}
			const collected = NATION.wealth._current(nation, time, exclude)
			return (
				collected *
				(1 - (!freedom && PROVINCE.parent.get(nation, time) ? TRIBUTE : 0))
			)
		},
		optimal: (nation: Province, time?: number): number => {
			const domains = PROVINCE.children.get(nation, time)
			const totalProvinces = NATION.provinces(nation, time).length
			const overextended =
				domains.length > domainLimit(totalProvinces) ? 0.9 : 1
			const wealth = NATION.wealth.raw(nation)
			return (
				wealth +
				domains.reduce(
					(acc, v) => acc + NATION.wealth.optimal(v, time) * TRIBUTE,
					0,
				) *
					overextended
			)
		},
	},
	rank: (nation: Province, time?: number) => {
		const provinces = NATION.provinces(nation, time).length
		return provinces > 80
			? "empire"
			: provinces > 20
				? "kingdom"
				: provinces > 1
					? "duchy"
					: "county"
	},
	build: () => {
		const provinces = window.world.provinces.filter((p) => !p.desolate)
		const { groups } = ARRAY.distribute<Province>({
			items: provinces,
			percentages: MATH.normalize([0.025, 0.05, 0.1, 0.2, 0.3, 0.4]),
			buckets: [
				[50, 100],
				[25, 49],
				[10, 24],
				[5, 9],
				[2, 4],
				[1, 1],
			],
			neighbors: (p) => PROVINCE.neighbors({ province: p }),
			score: (p, start) => {
				const pCell = window.world.cells[p.cell]
				const startCell = window.world.cells[start.cell]
				const d = CELL.distance(pCell, startCell)
				const coastalBoost = pCell.topography === "coastal" ? 2 : 1
				return (1 / (d + 0.1)) * coastalBoost
			},
			sorted: (items) =>
				items.sort((a, b) => {
					const aCell = window.world.cells[a.cell]
					const bCell = window.world.cells[b.cell]
					const aCoastal = aCell.topography === "coastal" ? 1 : 0
					const bCoastal = bCell.topography === "coastal" ? 1 : 0
					return bCoastal - aCoastal
				}),
		})

		groups.forEach((group) => {
			const sorted = group.sort(
				(a, b) => NATION.wealth.raw(b) - NATION.wealth.raw(a),
			)
			const capital = sorted[0]
			PROVINCE.parent.remove(capital)
			PROVINCE.occupations.add(capital, undefined)
			const reminder = sorted.slice(1)
			NATION.domains.add(capital, reminder)
			reminder
				.filter((subject) => subject._children.length === 0)
				.forEach((subject) => {
					PROVINCE.children.add(subject, [])
				})
		})
	},
}
