import { REL, YEAR_MS } from "@/model/history/state"
import { maxFanoutForNationSize } from "@/model/society/hierarchy"
import {
	GOVERNMENT_TYPE_LABELS,
	GOVERNMENT_TYPES,
} from "@/model/society/eras"
import { GOVERNMENT_COLORS_CSS } from "../../hover/info-panel-model"
import {
	RELIGION_TYPE_COLORS,
	RELIGION_TYPE_NAMES,
} from "@/model/society/religion"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import { eventInvolvesNation } from "../../details/nation/event-description"
import type { NationHistoryPoint } from "../../details/nation/NationHistoryChart"
import type {
	DistributionBucket,
	NationDetailsData,
} from "../../details/shared"
import type { HistoryQuery, HistoryView } from "../history/history-query"
import { rgbToCss } from "../shared/ui-format"
import type { DisplayNationModel } from "./display-model"
import { getDynastyColor } from "./region-colors"
import { buildRulerDisplayMeta } from "./ruler-display"

const RELATION_LABELS: Record<number, string> = {
	[REL.NONE]: "None",
	[REL.OVERLORD]: "Overlord",
	[REL.VASSAL]: "Vassal",
	[REL.PU_SENIOR]: "PU Senior",
	[REL.PU_JUNIOR]: "PU Junior",
	[REL.ALLY]: "Ally",
	[REL.FRIENDLY]: "Friendly",
	[REL.NEUTRAL]: "Neutral",
	[REL.SUSPICIOUS]: "Suspicious",
	[REL.RIVAL]: "Rival",
	[REL.WAR]: "War",
	[REL.COLONY]: "Colony",
}

const HISTORY_WINDOW_YEARS = 10
const EVENT_CAP = 50

function getNationChildren(
	childOffset: Int32Array,
	childList: Int32Array,
	nationId: number,
): number[] {
	return Array.from(
		childList.slice(childOffset[nationId], childOffset[nationId + 1]),
	)
}

function colorFromPartition(
	partition: { colors: Float32Array } | null | undefined,
	index: number,
): string {
	if (!partition || index < 0) return "rgb(148, 163, 184)"
	const base = index * 3
	if (base + 2 >= partition.colors.length) return "rgb(148, 163, 184)"
	return `rgb(${Math.round(partition.colors[base] * 255)}, ${Math.round(partition.colors[base + 1] * 255)}, ${Math.round(partition.colors[base + 2] * 255)})`
}

function buildPartitionDistribution(params: {
	provinces: readonly number[]
	getPartitionId: (province: number) => number
	getLabel: (id: number) => string
	getColor: (id: number) => string
}): DistributionBucket[] {
	const counts = new Map<number, number>()
	for (const province of params.provinces) {
		const id = params.getPartitionId(province)
		if (id < 0) continue
		counts.set(id, (counts.get(id) ?? 0) + 1)
	}
	return Array.from(counts.entries())
		.map(([id, count]) => ({
			label: params.getLabel(id),
			count,
			color: params.getColor(id),
		}))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function getNationNeighborIds(params: {
	selectedNationId: number
	world: SerializedGenesisWorld
	nationModel: DisplayNationModel
}): number[] {
	const { selectedNationId, world, nationModel } = params
	if (!world.provinces?.adjOffset || !world.provinces.adjList) return []
	const neighborIds = new Set<number>()
	for (let province = 0; province < world.provinces.count; province++) {
		if (nationModel.assignment[province] !== selectedNationId) continue
		for (
			let edge = world.provinces.adjOffset[province];
			edge < world.provinces.adjOffset[province + 1];
			edge++
		) {
			const neighborId = nationModel.assignment[world.provinces.adjList[edge]]
			if (
				neighborId < 0 ||
				neighborId === selectedNationId ||
				!nationModel.counts.has(neighborId)
			) {
				continue
			}
			neighborIds.add(neighborId)
		}
	}
	return Array.from(neighborIds).sort((a, b) => a - b)
}

export function buildSelectedNationDetails(params: {
	selectedNationId: number | null
	selectedTimeMs?: number
	world: SerializedGenesisWorld | null
	nationModel: DisplayNationModel | null
	selectedHistoryView: HistoryView | null
	getNationColor: (nationId: number) => string | null
	getNationName: (nationId: number) => string
	getLeaderName?: (nationId: number, timeMs: number) => string
	getDynastyName?: (dynastyId: number) => string
	getCultureName: (cultureId: number) => string
	getHeritageName: (heritageId: number) => string
}): NationDetailsData | null {
	const {
		selectedNationId,
		selectedTimeMs,
		world,
		nationModel,
		selectedHistoryView,
		getNationColor,
		getNationName,
		getLeaderName,
		getDynastyName,
		getCultureName,
		getHeritageName,
	} = params
	if (
		!world?.nations ||
		!world.provinces ||
		selectedNationId === null ||
		!nationModel
	) {
		return null
	}
	if (selectedNationId < 0 || !nationModel.counts.has(selectedNationId)) {
		return null
	}

	const provinceCount = nationModel.counts.get(selectedNationId) as number
	let totalPopulation = 0
	const memberProvinces: number[] = []
	for (let province = 0; province < world.provinces.count; province++) {
		if (nationModel.assignment[province] !== selectedNationId) continue
		memberProvinces.push(province)
		totalPopulation += world.population?.population[province] ?? 0
	}

	const relationAt = selectedHistoryView?.relationAt ?? (() => REL.NONE)
	const consumption = selectedHistoryView?.consumption ?? null
	const habitability = world.population?.habitability ?? null
	const parent = world.nations.parent
	const childOffset = world.nations.childOffset
	const childList = world.nations.childList
	const activeWars = selectedHistoryView?.activeWars ?? []
	const activeWarCounts = new Map<number, number>()
	for (const war of activeWars) {
		activeWarCounts.set(
			war.attacker,
			(activeWarCounts.get(war.attacker) ?? 0) + 1,
		)
		activeWarCounts.set(
			war.defender,
			(activeWarCounts.get(war.defender) ?? 0) + 1,
		)
	}

	const sovereignIds = Array.from(nationModel.counts.keys())
	const provinceCache = new Map<number, number[]>()
	const wealthCache = new Map<string, number>()
	const getNationProvinces = (nationId: number): number[] => {
		const cached = provinceCache.get(nationId)
		if (cached) return cached
		const provinces: number[] = [nationId]
		const stack = [nationId]
		while (stack.length > 0) {
			const current = stack.pop() as number
			for (const child of getNationChildren(childOffset, childList, current)) {
				provinces.push(child)
				stack.push(child)
			}
		}
		provinceCache.set(nationId, provinces)
		return provinces
	}
	const wealthCurrent = (
		nationId: number,
		exclude?: number,
		freedom = false,
	): number => {
		if (!habitability || !consumption) return 0
		const cacheKey = `${nationId}:${exclude ?? -1}:${freedom ? 1 : 0}`
		const cached = wealthCache.get(cacheKey)
		if (cached !== undefined) return cached
		let collected = habitability[nationId] - consumption[nationId]
		for (const child of getNationChildren(childOffset, childList, nationId)) {
			if (child === exclude) continue
			collected += wealthCurrent(child, exclude) * 0.25
		}
		const provinces = getNationProvinces(nationId)
		const children = getNationChildren(childOffset, childList, nationId)
		if (children.length > maxFanoutForNationSize(provinces.length)) {
			collected *= 0.9
		}
		if (!freedom && parent[nationId] >= 0) collected *= 0.75
		wealthCache.set(cacheKey, collected)
		return collected
	}
	const warStrengthSolo = (nationId: number, exclude?: number): number =>
		Math.max(0.1, wealthCurrent(nationId, exclude, exclude === nationId)) /
		(1 + (activeWarCounts.get(nationId) ?? 0))
	const getWarAllies = (
		nationId: number,
		type: "offensive" | "defensive",
		target: number,
	): number[] => {
		const validRelations: number[] =
			type === "offensive"
				? [REL.OVERLORD, REL.VASSAL, REL.PU_SENIOR, REL.PU_JUNIOR, REL.COLONY]
				: [
						REL.ALLY,
						REL.OVERLORD,
						REL.VASSAL,
						REL.PU_SENIOR,
						REL.PU_JUNIOR,
						REL.COLONY,
					]
		return sovereignIds.filter((id) => {
			if (id === nationId || id === target) return false
			if (!validRelations.includes(relationAt(nationId, id))) return false
			return relationAt(id, target) !== REL.ALLY
		})
	}
	const warThreatAgainst = (
		attacker: number,
		defender: number,
	): number | null => {
		if (!habitability || !consumption) return null
		let attackerStrength = warStrengthSolo(attacker)
		let defenderStrength = warStrengthSolo(defender)
		for (const ally of getWarAllies(attacker, "offensive", defender)) {
			attackerStrength += warStrengthSolo(ally) * 0.5
		}
		for (const ally of getWarAllies(defender, "defensive", attacker)) {
			defenderStrength += warStrengthSolo(ally) * 0.5
		}
		const attackerWeighted = attackerStrength ** 2
		const defenderWeighted = defenderStrength ** 2
		return 1 - attackerWeighted / (attackerWeighted + defenderWeighted)
	}

	const neighbors = getNationNeighborIds({
		selectedNationId,
		world,
		nationModel,
	}).map((neighborId) => ({
		id: neighborId,
		name: getNationName(neighborId),
		color: getNationColor(neighborId),
		relation:
			RELATION_LABELS[relationAt(selectedNationId, neighborId)] ?? "Unknown",
		threat: warThreatAgainst(selectedNationId, neighborId),
	}))

	// Supplement neighbors with non-adjacent colony/colonizer pairs
	if (selectedHistoryView?.forEachRelationPair) {
		const neighborIds = new Set(neighbors.map((n) => n.id))
		selectedHistoryView.forEachRelationPair((a, b) => {
			let otherId = -1
			let rel = -1
			if (a === selectedNationId) {
				otherId = b
				rel = relationAt(selectedNationId, b)
			} else if (b === selectedNationId) {
				otherId = a
				rel = relationAt(selectedNationId, a)
			}
			if (otherId < 0 || neighborIds.has(otherId)) return
			if (rel !== REL.COLONY && rel !== REL.OVERLORD) return
			neighborIds.add(otherId)
			neighbors.push({
				id: otherId,
				name: getNationName(otherId),
				color: getNationColor(otherId),
				relation: RELATION_LABELS[rel] ?? "Unknown",
				threat: warThreatAgainst(selectedNationId, otherId),
			})
		})
	}

	const nationWars = activeWars
		.filter(
			(war) =>
				war.attacker === selectedNationId || war.defender === selectedNationId,
		)
		.map((war) => ({
			id: war.idx,
			opponentId:
				war.attacker === selectedNationId ? war.defender : war.attacker,
			opponentName: getNationName(
				war.attacker === selectedNationId ? war.defender : war.attacker,
			),
			opponentColor: getNationColor(
				war.attacker === selectedNationId ? war.defender : war.attacker,
			),
			role: war.attacker === selectedNationId ? "Attacker" : "Defender",
			rebel: war.rebel,
		}))
		.sort((a, b) => a.opponentId - b.opponentId)

	const dynastyByNation =
		selectedHistoryView?.leaderDynasty ?? world.leaderDynasty
	const rulerDynastyId =
		selectedNationId >= 0 ? (dynastyByNation?.[selectedNationId] ?? -1) : -1
	const rulerMeta = buildRulerDisplayMeta({
		world,
		nationId: selectedNationId,
		timeMs: selectedTimeMs,
	})
	const ruler =
		selectedTimeMs != null && getLeaderName
			? {
					name: getLeaderName(selectedNationId, selectedTimeMs),
					age: rulerMeta.age,
					genderSymbol: rulerMeta.genderSymbol,
					claimStrength: rulerMeta.claimStrength,
					isRegency: rulerMeta.isRegency,
					dynasty:
						rulerDynastyId >= 0 && getDynastyName
							? getDynastyName(rulerDynastyId)
							: null,
					dynastyColor:
						rulerDynastyId >= 0
							? rgbToCss(getDynastyColor(rulerDynastyId))
							: null,
				}
			: null

	const govIdx = world.nations.governmentType?.[selectedNationId] ?? -1
	const govKey = govIdx >= 0 ? (GOVERNMENT_TYPES[govIdx] ?? null) : null
	const governmentType = govKey ? (GOVERNMENT_TYPE_LABELS[govKey] ?? null) : null
	const governmentColor = govIdx >= 0 ? (GOVERNMENT_COLORS_CSS[govIdx] ?? null) : null

	return {
		id: selectedNationId,
		name: getNationName(selectedNationId),
		ruler,
		provinceCount,
		totalPopulation,
		governmentType,
		governmentColor,
		color: getNationColor(selectedNationId),
		neighbors,
		activeWars: nationWars,
		cultureDistribution: buildPartitionDistribution({
			provinces: memberProvinces,
			getPartitionId: (province) => world.cultures?.assignment[province] ?? -1,
			getLabel: getCultureName,
			getColor: (id) => colorFromPartition(world.cultures, id),
		}),
		heritageDistribution: buildPartitionDistribution({
			provinces: memberProvinces,
			getPartitionId: (province) => {
				const cultureId = world.cultures?.assignment[province] ?? -1
				return cultureId >= 0
					? (world.heritages?.assignment[cultureId] ?? -1)
					: -1
			},
			getLabel: getHeritageName,
			getColor: (id) => colorFromPartition(world.heritages, id),
		}),
		religionDistribution: buildPartitionDistribution({
			provinces: memberProvinces,
			getPartitionId: (province) => {
				const cultureId = world.cultures?.assignment[province] ?? -1
				if (cultureId < 0) return -1
				return world.religions?.assignment[cultureId] ?? -1
			},
			getLabel: (id) => {
				const typeId = world.religionTypes?.[id] ?? -1
				return typeId >= 0
					? (RELIGION_TYPE_NAMES[typeId] ?? `Religion #${id}`)
					: `Religion #${id}`
			},
			getColor: (id) => {
				const typeId = world.religionTypes?.[id] ?? -1
				if (typeId < 0) return colorFromPartition(world.religions, id)
				const [r, g, b] =
					RELIGION_TYPE_COLORS[typeId] ?? RELIGION_TYPE_COLORS[0]
				return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
			},
		}),
	}
}

export function buildNationHistory(params: {
	selectedNationId: number | null
	historyQuery: HistoryQuery | null
	selectedTimeMs: number
	simStartTimeMs: number
	simTimeMs: number
	world: SerializedGenesisWorld | null
}): NationHistoryPoint[] | undefined {
	const {
		selectedNationId,
		historyQuery,
		selectedTimeMs,
		simStartTimeMs,
		simTimeMs,
		world,
	} = params
	if (selectedNationId === null || !historyQuery || !world?.provinces) {
		return undefined
	}

	const provinceCount = world.provinces.count
	const half = Math.floor(HISTORY_WINDOW_YEARS / 2)
	const startTime = Math.max(simStartTimeMs, selectedTimeMs - half * YEAR_MS)
	const endTime = Math.min(simTimeMs, selectedTimeMs + half * YEAR_MS)
	const points: NationHistoryPoint[] = []
	for (let timeMs = startTime; timeMs <= endTime; timeMs += YEAR_MS) {
		const view = historyQuery.getView(timeMs)
		let size = 0
		for (let province = 0; province < provinceCount; province++) {
			if (view.assignment[province] === selectedNationId) size++
		}
		points.push({
			timeMs,
			size,
			wealth:
				view.getNationWealth?.(selectedNationId) ??
				view.nationWealth?.[selectedNationId] ??
				0,
			optimalWealth:
				view.getNationOptimalWealth?.(selectedNationId) ??
				view.nationOptimalWealth?.[selectedNationId] ??
				0,
		})
	}
	return points
}

export function buildWindowedNationEvents(params: {
	selectedNationId: number | null
	historyQuery: HistoryQuery | null
	nationHistory: NationHistoryPoint[] | undefined
}): ReturnType<HistoryQuery["getEventsInRange"]> | undefined {
	const { selectedNationId, historyQuery, nationHistory } = params
	if (
		selectedNationId === null ||
		!historyQuery ||
		!nationHistory ||
		nationHistory.length === 0
	) {
		return undefined
	}
	const startTime = nationHistory[0].timeMs
	const endTime = nationHistory[nationHistory.length - 1].timeMs + YEAR_MS
	const out = historyQuery
		.getEventsInRange(startTime, endTime)
		.filter((event) => eventInvolvesNation(event, selectedNationId))
	out.sort((a, b) => a.time - b.time)
	return out.length > EVENT_CAP ? out.slice(-EVENT_CAP) : out
}

const NATION_BUCKETS: [number, number | null][] = [
	[50, null],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]

const NATION_BUCKET_COLORS = [
	"rgb(15, 23, 42)",
	"rgb(30, 41, 59)",
	"rgb(51, 65, 85)",
	"rgb(71, 85, 105)",
	"rgb(100, 116, 139)",
	"rgb(148, 163, 184)",
]

export function buildNationSizeDistribution(
	nationProvinceCounts: Map<number, number>,
): DistributionBucket[] {
	return NATION_BUCKETS.map(([min, max], index) => ({
		label: max === null ? `${min}+` : min === max ? `${min}` : `${min}-${max}`,
		count: Array.from(nationProvinceCounts.values()).filter(
			(size) => size >= min && (max === null || size <= max),
		).length,
		color: NATION_BUCKET_COLORS[index],
	}))
}

export function buildConflictDistribution(
	selectedHistoryView: HistoryView | null,
): DistributionBucket[] {
	const wars = selectedHistoryView?.activeWars ?? []
	return [
		{
			label: "Wars",
			count: wars.filter((w) => !w.rebel).length,
			color: "rgb(239, 68, 68)",
		},
		{
			label: "Rebellions",
			count: wars.filter((w) => w.rebel).length,
			color: "rgb(249, 115, 22)",
		},
	]
}

export function buildRelationDistribution(
	selectedHistoryView: HistoryView | null,
	nationModel: DisplayNationModel | null,
	nationAdj: { adjOffset: Int32Array; adjList: Int32Array } | null,
): DistributionBucket[] {
	if (!selectedHistoryView || !nationModel || !nationAdj) return []
	const counts: Record<string, number> = {
		Colony: 0,
		Vassal: 0,
		PU: 0,
		Allied: 0,
		Friendly: 0,
		Suspicious: 0,
		Neutral: 0,
		Rival: 0,
		War: 0,
	}
	const seen = new Set<string>()
	for (let i = 0; i < nationAdj.adjOffset.length - 1; i++) {
		if (!nationModel.counts.has(i)) continue
		for (let e = nationAdj.adjOffset[i]; e < nationAdj.adjOffset[i + 1]; e++) {
			const j = nationAdj.adjList[e]
			if (!nationModel.counts.has(j)) continue
			const key = `${Math.min(i, j)},${Math.max(i, j)}`
			if (seen.has(key)) continue
			seen.add(key)
			const rel = selectedHistoryView.relationAt(i, j)
			const rev = selectedHistoryView.relationAt(j, i)
			if (rel === REL.COLONY || rev === REL.COLONY) counts.Colony++
			else if (rel === REL.OVERLORD || rel === REL.VASSAL) counts.Vassal++
			else if (rel === REL.PU_SENIOR || rel === REL.PU_JUNIOR) counts.PU++
			else if (rel === REL.ALLY) counts.Allied++
			else if (rel === REL.FRIENDLY) counts.Friendly++
			else if (rel === REL.SUSPICIOUS) counts.Suspicious++
			else if (rel === REL.RIVAL) counts.Rival++
			else if (rel === REL.WAR) counts.War++
			else counts.Neutral++
		}
	}

	// Colonies are overseas and almost never adjacent, so the adjacency scan above
	// misses them. Colonial relations live in the relation data like any other, so
	// scan the relation pairs directly (a colony reads as COLONY one way, OVERLORD
	// the other) and count the ones the adjacency pass didn't already see.
	selectedHistoryView.forEachRelationPair((a, b) => {
		if (!nationModel.counts.has(a) || !nationModel.counts.has(b)) return
		const key = `${a},${b}` // forEachRelationPair yields a < b
		if (seen.has(key)) return
		if (
			selectedHistoryView.relationAt(a, b) === REL.COLONY ||
			selectedHistoryView.relationAt(b, a) === REL.COLONY
		) {
			seen.add(key)
			counts.Colony++
		}
	})
	return [
		{ label: "Personal Union", count: counts.PU, color: "rgb(99, 102, 241)" },
		{ label: "Vassal", count: counts.Vassal, color: "rgb(168, 85, 247)" },
		{ label: "Colony", count: counts.Colony, color: "rgb(230, 84, 61)" },
		{ label: "Allied", count: counts.Allied, color: "rgb(59, 130, 246)" },
		{ label: "Friendly", count: counts.Friendly, color: "rgb(34, 197, 94)" },
		{ label: "Neutral", count: counts.Neutral, color: "rgb(201, 201, 201)" },
		{
			label: "Suspicious",
			count: counts.Suspicious,
			color: "rgb(234, 179, 8)",
		},
		{ label: "Rival", count: counts.Rival, color: "rgb(249, 115, 22)" },
		{ label: "War", count: counts.War, color: "rgb(249, 56, 22)" },
	]
}
