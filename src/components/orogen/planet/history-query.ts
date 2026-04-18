import type { HistoryNote } from "@/model/orogen/history"
import type {
	SerializedOrogenWorld,
	SerializedProvinceTimelineFloat,
	SerializedProvinceTimelineInt,
	SerializedTimelines,
} from "@/model/orogen/worker-types"

export interface TimelineBundle {
	timelines: SerializedTimelines
	events: HistoryNote[]
}

function readTimelineValue(
	times: Float64Array,
	values: ArrayLike<number>,
	start: number,
	end: number,
	defaultValue: number,
	time: number,
): number {
	let lo = start
	let hi = end - 1
	let answer = defaultValue
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		if (times[mid] <= time) {
			answer = values[mid]
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return answer
}

export function readProvinceInt(
	field: SerializedProvinceTimelineInt,
	province: number,
	time: number,
	defaultValue: number,
): number {
	return readTimelineValue(
		field.times,
		field.values,
		field.offsets[province],
		field.offsets[province + 1],
		defaultValue,
		time,
	)
}

export function readProvinceFloat(
	field: SerializedProvinceTimelineFloat,
	province: number,
	time: number,
	defaultValue: number,
): number {
	return readTimelineValue(
		field.times,
		field.values,
		field.offsets[province],
		field.offsets[province + 1],
		defaultValue,
		time,
	)
}

export interface HistoryView {
	timeMs: number
	assignment: Int32Array
	parent: Int32Array
	sovereign: Int32Array
	colors: Float32Array
	adjOffset: Int32Array
	adjList: Int32Array
	populationTotal: Float32Array
	populationRural: Float32Array
	populationUrban: Float32Array
	development: Float32Array
	consumption: Float32Array
	activeWars: Array<{
		idx: number
		attacker: number
		defender: number
		rebel: boolean
		occupied: number[]
	}>
	sovereignCount: number
	totalPopulation: number
	nationWealth: Float32Array
	nationOptimalWealth: Float32Array
	relationAt: (a: number, b: number) => number
}

export interface HistoryQuery {
	getView: (timeMs: number) => HistoryView
	getEventsInRange: (startTimeMs: number, endTimeMs: number) => HistoryNote[]
	getEventsUntil: (timeMs: number) => HistoryNote[]
}

function relationKey(a: number, b: number): string {
	return `${a}:${b}`
}

export function createHistoryQuery(
	bundle: TimelineBundle,
	world: SerializedOrogenWorld,
): HistoryQuery {
	const { timelines, events } = bundle
	const relationIndex = new Map<string, number>()
	for (let i = 0; i < timelines.relations.aIdx.length; i++) {
		relationIndex.set(
			relationKey(timelines.relations.aIdx[i], timelines.relations.bIdx[i]),
			i,
		)
	}

	const colorIndex = new Map<number, [number, number, number]>()
	for (let i = 0; i < timelines.nationColorKeys.length; i++) {
		colorIndex.set(timelines.nationColorKeys[i], [
			timelines.nationColorValues[i * 3],
			timelines.nationColorValues[i * 3 + 1],
			timelines.nationColorValues[i * 3 + 2],
		])
	}

	const eventsByTime = events.slice().sort((a, b) => a.time - b.time)
	const provinceAdjOffset = world.provinces?.adjOffset
	const provinceAdjList = world.provinces?.adjList
	const habitability = world.population?.habitability

	const readRelation = (
		a: number,
		b: number,
		timeMs: number,
		defaultValue = 7,
	): number => {
		const pairIndex = relationIndex.get(relationKey(a, b))
		if (pairIndex === undefined) return defaultValue
		return readTimelineValue(
			timelines.relations.times,
			timelines.relations.values,
			timelines.relations.offsets[pairIndex],
			timelines.relations.offsets[pairIndex + 1],
			defaultValue,
			timeMs,
		)
	}

	// Pre-allocated scratch buffers — reused across getView calls to avoid GC pressure
	const P = timelines.P
	const scratchAssignment = new Int32Array(P)
	const scratchParent = new Int32Array(P)
	const scratchSovereign = new Int32Array(P)
	const scratchColors = new Float32Array(P * 3)
	const scratchPopulationTotal = new Float32Array(P)
	const scratchPopulationRural = new Float32Array(P)
	const scratchPopulationUrban = new Float32Array(P)
	const scratchDevelopment = new Float32Array(P)
	const scratchConsumption = new Float32Array(P)
	const scratchNationWealth = new Float32Array(P)
	const scratchNationOptimalWealth = new Float32Array(P)
	const scratchAdjOffset = new Int32Array(P + 1)
	// Nation adjacencies ≤ province adjacencies, so province adj list length is a safe upper bound
	const scratchAdjList = new Int32Array(provinceAdjList?.length ?? 0)
	// Scratch maps — cleared and reused each call instead of reallocated
	const scratchChildMap = new Map<number, number[]>()
	const scratchOccupationGroups = new Map<number, number[]>()

	// Single-entry cache: avoids recomputing when called repeatedly with the same time
	let lastComputedMs = -Infinity
	let lastView: HistoryView | null = null

	const getView = (timeMs: number): HistoryView => {
		if (timeMs === lastComputedMs && lastView !== null) return lastView

		scratchChildMap.clear()
		scratchOccupationGroups.clear()
		// Must zero colors since we're reusing the buffer — positions with no color
		// entry would otherwise retain stale values from the previous call
		scratchColors.fill(0)

		for (let p = 0; p < P; p++) {
			scratchParent[p] = readProvinceInt(timelines.parent, p, timeMs, -1)
			scratchAssignment[p] = readProvinceInt(
				timelines.assignment,
				p,
				timeMs,
				-1,
			)
			scratchPopulationRural[p] = readProvinceFloat(
				timelines.populationRural,
				p,
				timeMs,
				0,
			)
			scratchPopulationUrban[p] = readProvinceFloat(
				timelines.populationUrban,
				p,
				timeMs,
				0,
			)
			scratchPopulationTotal[p] =
				scratchPopulationRural[p] + scratchPopulationUrban[p]
			scratchDevelopment[p] = readProvinceFloat(
				timelines.development,
				p,
				timeMs,
				0,
			)
			scratchConsumption[p] = readProvinceFloat(
				timelines.consumption,
				p,
				timeMs,
				0,
			)

			const occupation = readProvinceInt(timelines.occupation, p, timeMs, -1)
			if (occupation >= 0) {
				const occupied = scratchOccupationGroups.get(occupation) ?? []
				occupied.push(p)
				scratchOccupationGroups.set(occupation, occupied)
			}

			if (scratchParent[p] >= 0) {
				const children = scratchChildMap.get(scratchParent[p]) ?? []
				children.push(p)
				scratchChildMap.set(scratchParent[p], children)
			}
		}

		for (let p = 0; p < P; p++) {
			let current = p
			while (scratchParent[current] >= 0) current = scratchParent[current]
			scratchSovereign[p] = current
			const color = colorIndex.get(scratchAssignment[p])
			if (color) {
				const base = p * 3
				scratchColors[base] = color[0]
				scratchColors[base + 1] = color[1]
				scratchColors[base + 2] = color[2]
			}
		}

		const neighborSets = new Map<number, Set<number>>()
		if (provinceAdjOffset && provinceAdjList) {
			for (let p = 0; p < P; p++) {
				const nation = scratchAssignment[p]
				if (nation < 0) continue
				if (!neighborSets.has(nation)) neighborSets.set(nation, new Set())
				for (
					let edge = provinceAdjOffset[p];
					edge < provinceAdjOffset[p + 1];
					edge++
				) {
					const neighborNation = scratchAssignment[provinceAdjList[edge]]
					if (neighborNation >= 0 && neighborNation !== nation) {
						neighborSets.get(nation)?.add(neighborNation)
					}
				}
			}
		}

		scratchAdjOffset[0] = 0
		let totalAdj = 0
		for (let p = 0; p < P; p++) {
			totalAdj += neighborSets.get(p)?.size ?? 0
			scratchAdjOffset[p + 1] = totalAdj
		}
		for (let p = 0; p < P; p++) {
			let write = scratchAdjOffset[p]
			for (const neighbor of neighborSets.get(p) ?? []) {
				scratchAdjList[write++] = neighbor
			}
		}

		const activeWars = timelines.wars
			.filter(
				(war) =>
					war.startTime <= timeMs &&
					(war.endTime ?? Number.POSITIVE_INFINITY) > timeMs,
			)
			.map((war) => ({
				idx: war.idx,
				attacker: war.attacker,
				defender: war.defender,
				rebel: war.rebel,
				occupied: scratchOccupationGroups.get(war.idx) ?? [],
			}))

		const provinceCache = new Map<number, number[]>()
		const listNationProvinces = (root: number): number[] => {
			const cachedProvinces = provinceCache.get(root)
			if (cachedProvinces) return cachedProvinces
			const result = [root]
			const stack = [root]
			while (stack.length > 0) {
				const current = stack.pop()!
				for (const child of scratchChildMap.get(current) ?? []) {
					result.push(child)
					stack.push(child)
				}
			}
			provinceCache.set(root, result)
			return result
		}

		const optimalCache = new Map<number, number>()
		const currentCache = new Map<string, number>()

		const optimalWealth = (nationId: number): number => {
			const cachedOptimal = optimalCache.get(nationId)
			if (cachedOptimal !== undefined) return cachedOptimal
			let total = habitability?.[nationId] ?? 0
			for (const child of scratchChildMap.get(nationId) ?? []) {
				total += optimalWealth(child) * 0.25
			}
			const provinces = listNationProvinces(nationId)
			if (
				(scratchChildMap.get(nationId)?.length ?? 0) >
				Math.max(1, provinces.length ** 0.5)
			) {
				total *= 0.9
			}
			optimalCache.set(nationId, total)
			return total
		}

		const currentWealth = (
			nationId: number,
			exclude?: number,
			freedom = false,
		): number => {
			const key = `${nationId}:${exclude ?? -1}:${freedom ? 1 : 0}`
			const cachedCurrent = currentCache.get(key)
			if (cachedCurrent !== undefined) return cachedCurrent
			let total = (habitability?.[nationId] ?? 0) - scratchConsumption[nationId]
			for (const child of scratchChildMap.get(nationId) ?? []) {
				if (child === exclude) continue
				total += currentWealth(child, exclude) * 0.25
			}
			if (!freedom && scratchParent[nationId] >= 0) total *= 0.75
			currentCache.set(key, total)
			return total
		}

		let sovereignCount = 0
		let totalPopulation = 0
		for (let p = 0; p < P; p++) {
			if (scratchParent[p] < 0 && scratchAssignment[p] >= 0) {
				sovereignCount++
				scratchNationOptimalWealth[p] = optimalWealth(p)
				scratchNationWealth[p] = currentWealth(p)
			} else {
				scratchNationOptimalWealth[p] = 0
				scratchNationWealth[p] = 0
			}
			totalPopulation += scratchPopulationTotal[p]
		}

		const assignment = scratchAssignment.slice()
		const parent = scratchParent.slice()
		const sovereign = scratchSovereign.slice()
		const colors = scratchColors.slice()
		const adjOffset = scratchAdjOffset.slice()
		const adjList = scratchAdjList.slice(0, scratchAdjOffset[P])
		const populationTotal = scratchPopulationTotal.slice()
		const populationRural = scratchPopulationRural.slice()
		const populationUrban = scratchPopulationUrban.slice()
		const development = scratchDevelopment.slice()
		const consumption = scratchConsumption.slice()
		const nationWealth = scratchNationWealth.slice()
		const nationOptimalWealth = scratchNationOptimalWealth.slice()
		const activeWarsSnapshot = activeWars.map((war) => ({
			...war,
			occupied: war.occupied.slice(),
		}))

		lastComputedMs = timeMs
		lastView = {
			timeMs,
			assignment,
			parent,
			sovereign,
			colors,
			adjOffset,
			adjList,
			populationTotal,
			populationRural,
			populationUrban,
			development,
			consumption,
			activeWars: activeWarsSnapshot,
			sovereignCount,
			totalPopulation,
			nationWealth,
			nationOptimalWealth,
			relationAt: (a, b) => readRelation(a, b, timeMs),
		}
		return lastView
	}

	const firstEventAtOrAfter = (timeMs: number): number => {
		let lo = 0
		let hi = eventsByTime.length
		while (lo < hi) {
			const mid = (lo + hi) >>> 1
			if (eventsByTime[mid].time < timeMs) lo = mid + 1
			else hi = mid
		}
		return lo
	}

	return {
		getView,
		getEventsInRange: (startTimeMs, endTimeMs) => {
			const start = firstEventAtOrAfter(startTimeMs)
			const end = firstEventAtOrAfter(endTimeMs + 1)
			return eventsByTime.slice(start, end)
		},
		getEventsUntil: (timeMs) => {
			const end = firstEventAtOrAfter(timeMs + 1)
			return eventsByTime.slice(0, end)
		},
	}
}

export function eventsInRange(
	events: HistoryNote[],
	startTimeMs: number,
	endTimeMs: number,
): HistoryNote[] {
	return events.filter(
		(event) => event.time >= startTimeMs && event.time <= endTimeMs,
	)
}
