import { CELL } from "../cells"
import { Cell } from "../cells/types"
import { START_DATE } from "../utilities/time"
import { Province, ProvinceNeighborParams } from "./types"

const EMPTY = -1
const START_POP = 215e6
export const HAB = {
	climate: {
		arctic: 0.01,
		subarctic: 0.1,
		boreal: 0.6,
		temperate: 1.25,
		subtropical: 1,
		tropical: 0.8,
	},
	vegetation: {
		desert: 0.1,
		sparse: 0.3,
		grasslands: 0.8,
		woods: 1,
		forest: 0.8,
		jungle: 0.6,
	},
	topography: {
		coastal: 1.25,
		marsh: 0.6,
		flat: 1,
		hills: 0.6,
		plateau: 0.8,
		mountains: 0.2,
	},
}

const findHistory = <K, T extends { time: number } & K>(
	history: T[],
	defaultValue?: K,
	time?: number,
) => {
	if (time === undefined && history.length) return history[history.length - 1]
	for (let i = history.length - 1; i >= 0; i--) {
		if (history[i].time <= time) return history[i]
	}
	return { time: START_DATE, ...defaultValue }
}

export const PROVINCE = {
	cell: (province: Province) => window.world.cells[province.cell],
	connected: (province: Province) => {
		const visited = new Set<number>([province.idx])
		const queue = [province]
		const overlord = PROVINCE.parent.get(province)
		if (!overlord) return true
		while (queue.length) {
			const p = queue.shift()!
			const neighbors = PROVINCE.neighbors({ province: p, type: "local" })
			for (const n of neighbors) {
				if (n === overlord) return true
				if (!visited.has(n.idx)) {
					visited.add(n.idx)
					queue.push(n)
				}
			}
		}
		return false
	},
	distance: (params: { province: Province; other: Province }) => {
		const { province, other } = params
		const cell = PROVINCE.cell(province)
		const otherCell = PROVINCE.cell(other)
		return CELL.distance(cell, otherCell)
	},
	history: {
		find: findHistory,
	},
	consumption: {
		delta: (province: Province, delta: number) => {
			const lastEntry = province._consumption[province._consumption.length - 1]
			const currentConsumption = lastEntry?.consumption ?? 0
			const clampedDelta = Math.max(delta, -currentConsumption)
			if (clampedDelta === 0) return
			if (lastEntry && lastEntry.time === window.world.time) {
				lastEntry.consumption += clampedDelta
			} else {
				province._consumption.push({
					time: window.world.time,
					consumption: currentConsumption + clampedDelta,
				})
			}
		},
		get: (province: Province, time?: number) => {
			return findHistory(province._consumption, { consumption: 0 }, time)
				.consumption
		},
	},
	occupations: {
		add: (province: Province, occupier = EMPTY) => {
			const lastEntry = province._occupations[province._occupations.length - 1]
			if (occupier === lastEntry?.occupier) return
			if (lastEntry && lastEntry.time === window.world.time) {
				lastEntry.occupier = occupier
				const prior = province._occupations[province._occupations.length - 2]
				if (prior && prior.occupier === occupier) province._occupations.pop()
			} else {
				province._occupations.push({ time: window.world.time, occupier })
			}
		},
		get: (province: Province, time?: number) => {
			const { occupier } = findHistory(
				province._occupations,
				{ occupier: EMPTY },
				time,
			)
			return window.world.wars[occupier]
		},
		remove: (province: Province) => {
			PROVINCE.occupations.add(province, undefined)
		},
	},
	parent: {
		add: (province: Province, parent = EMPTY) => {
			if (parent === province.idx) return
			const lastEntry = province._parent[province._parent.length - 1]
			if (parent === lastEntry?.parent) return
			if (lastEntry && lastEntry.time === window.world.time) {
				lastEntry.parent = parent
				const prior = province._parent[province._parent.length - 2]
				if (prior && prior.parent === parent) province._parent.pop()
			} else {
				province._parent.push({ time: window.world.time, parent })
			}
		},
		get: (province: Province, time?: number) => {
			const { parent } = findHistory(province._parent, { parent: EMPTY }, time)
			return window.world.provinces[parent]
		},
		remove: (province: Province) => {
			PROVINCE.parent.add(province, undefined)
		},
	},
	population: {
		rural: {
			set: (province: Province, population: number) => {
				const lastEntry =
					province._population.rural[province._population.rural.length - 1]
				if (lastEntry && lastEntry.time === window.world.time) {
					lastEntry.population = population
				} else {
					province._population.rural.push({
						time: window.world.time,
						population,
					})
				}
			},
			get: (province: Province, time?: number) => {
				const { population } = findHistory(
					province._population.rural,
					{ population: 0 },
					time,
				)
				return population
			},
		},
		urban: {
			set: (province: Province, population: number) => {
				const lastEntry =
					province._population.urban[province._population.urban.length - 1]
				if (lastEntry && lastEntry.time === window.world.time) {
					lastEntry.population = population
				} else {
					province._population.urban.push({
						time: window.world.time,
						population,
					})
				}
			},
			get: (province: Province, time?: number) => {
				const { population } = findHistory(
					province._population.urban,
					{ population: 0 },
					time,
				)
				return population
			},
		},
		total: (province: Province, time?: number) => {
			const rural = PROVINCE.population.rural.get(province, time)
			const urban = PROVINCE.population.urban.get(province, time)
			return rural + urban
		},
		// people per square mile
		density: (province: Province, time?: number) => {
			const population = PROVINCE.population.total(province, time)
			return population / (province.land * window.world.cell.area)
		},
		init: () => {
			window.world.provinces.forEach((province) => {
				const cell = PROVINCE.cell(province)
				const landmark = window.world.landmarks[cell.landmark]
				const landScore =
					landmark.type === "continent"
						? 1
						: landmark.type === "island"
							? 0.8
							: 0.5
				province.habitability = province.desolate
					? 0
					: HAB.climate[cell.climate] *
						HAB.vegetation[cell.vegetation] *
						HAB.topography[cell.topography] *
						province.land *
						landScore *
						window.dice.uniform(0.8, 1.2)
			})
			const total = window.world.provinces.reduce(
				(acc, province) => acc + province.habitability,
				0,
			)
			window.world.provinces.forEach((province) => {
				const population = (province.habitability / total) * START_POP
				PROVINCE.population.rural.set(province, population)
			})
		},
	},
	development: {
		get: (province: Province, time?: number) => {
			const { development } = findHistory(
				province._development,
				{ development: 0 },
				time,
			)
			return development
		},
		set: (province: Province, development: number) => {
			const lastEntry = province._development[province._development.length - 1]
			if (development === lastEntry?.development) return
			if (lastEntry && lastEntry.time === window.world.time) {
				lastEntry.development = development
				const prior = province._development[province._development.length - 2]
				const priorEqual =
					prior &&
					prior.development === development &&
					prior.development === development
				if (priorEqual) province._development.pop()
			} else {
				province._development.push({ time: window.world.time, development })
			}
		},
	},
	children: {
		_get: (province: Province, time?: number) => {
			const { children } = findHistory(
				province._children,
				{ children: new Set<number>() },
				time,
			)
			return children
		},
		_dedup: (province: Province, entry: Set<number>) => {
			const lastEntry = province._children[province._children.length - 1]
			const equal =
				lastEntry &&
				entry.size === lastEntry.children.size &&
				entry.isSubsetOf(lastEntry.children)
			if (equal) return
			if (lastEntry && lastEntry.time === window.world.time) {
				lastEntry.children = entry
				const prior = province._children[province._children.length - 2]
				const priorEqual =
					prior &&
					prior.children.size === entry.size &&
					prior.children.isSubsetOf(entry)
				if (priorEqual) province._children.pop()
			} else {
				province._children.push({ time: window.world.time, children: entry })
			}
		},
		add: (province: Province, children: number[]) => {
			const curr = PROVINCE.children._get(province)
			const next = new Set(children)
			const merged = curr.union(next)
			PROVINCE.children._dedup(province, merged)
		},
		get: (province: Province, time?: number) => {
			const children = PROVINCE.children._get(province, time)
			return Array.from(children).map((idx) => window.world.provinces[idx])
		},
		remove: (province: Province, children: number[]) => {
			const curr = PROVINCE.children._get(province)
			const next = new Set(children)
			const diff = curr.difference(next)
			PROVINCE.children._dedup(province, diff)
		},
	},
	nation: (province: Province, time?: number): Province => {
		const overlord = PROVINCE.parent.get(province, time)
		if (overlord === undefined) return province
		return PROVINCE.nation(overlord, time)
	},
	neighbors: ({ province, type, time }: ProvinceNeighborParams): Province[] => {
		let neighbors = Array.from(province.neighbors)
			.map((n) => window.world.provinces[n])
			.filter((p) => !p.desolate)
		if (type) {
			const nation = PROVINCE.nation(province, time)
			const foreign = (n: Province) => PROVINCE.nation(n, time) !== nation
			const local = (n: Province) => PROVINCE.nation(n, time) === nation
			neighbors = neighbors.filter(type === "local" ? local : foreign)
		}
		return neighbors
	},
	spawn: (cell: Cell) => {
		const idx = window.world.provinces.length
		cell.province = idx
		const province: Province = {
			idx,
			cell: cell.idx,
			cells: { land: [] },
			islands: {},
			lakes: {},
			land: 0,
			ocean: 0,
			neighbors: new Set(),
			production: Math.max(0.5, 5 + window.dice.norm(1, 2)),
			color: window.dice.color(),
			culture: EMPTY,
			heritage: EMPTY,
			faith: EMPTY,
			religion: EMPTY,
			_leader: [],
			_children: [],
			_parent: [],
			_occupations: [],
			_wars: [],
			_consumption: [],
			_relations: {},
			_population: {
				rural: [],
				urban: [],
				targetUrban: 0,
			},
			_development: [],
		}
		window.world.provinces.push(province)
		return province
	},
}
