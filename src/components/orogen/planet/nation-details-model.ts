import { REL, YEAR_MS } from "@/model/orogen/history/state"
import { domainLimitFn } from "@/model/orogen/partitions/hierarchy"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import { eventInvolvesNation } from "./details/event-description"
import type { NationHistoryPoint } from "./details/NationHistoryChart"
import type { DistributionBucket, NationDetailsData } from "./details/shared"
import type { DisplayNationModel } from "./display-model"
import type { HistoryQuery, HistoryView } from "./history-query"

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

export function buildSelectedNationDetails(params: {
	selectedNationId: number | null
	world: SerializedOrogenWorld | null
	nationModel: DisplayNationModel | null
	selectedHistoryView: HistoryView | null
	getNationColor: (nationId: number) => string | null
}): NationDetailsData | null {
	const {
		selectedNationId,
		world,
		nationModel,
		selectedHistoryView,
		getNationColor,
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

	let totalPopulation = 0
	for (let province = 0; province < world.provinces.count; province++) {
		if (nationModel.assignment[province] !== selectedNationId) continue
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
		if (children.length > domainLimitFn(provinces.length)) {
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
				? [REL.OVERLORD, REL.VASSAL, REL.PU_SENIOR, REL.PU_JUNIOR]
				: [REL.ALLY, REL.OVERLORD, REL.VASSAL, REL.PU_SENIOR, REL.PU_JUNIOR]
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

	const neighbors =
		selectedNationId + 1 < nationModel.adjOffset.length
			? Array.from(
					new Set(
						nationModel.adjList.slice(
							nationModel.adjOffset[selectedNationId],
							nationModel.adjOffset[selectedNationId + 1],
						),
					),
				)
					.filter((neighborId) => nationModel.counts.has(neighborId))
					.sort((a, b) => a - b)
					.map((neighborId) => ({
						id: neighborId,
						color: getNationColor(neighborId),
						relation:
							RELATION_LABELS[relationAt(selectedNationId, neighborId)] ??
							"Unknown",
						threat: warThreatAgainst(selectedNationId, neighborId),
					}))
			: []

	const nationWars = activeWars
		.filter(
			(war) =>
				war.attacker === selectedNationId || war.defender === selectedNationId,
		)
		.map((war) => ({
			id: war.idx,
			opponentId:
				war.attacker === selectedNationId ? war.defender : war.attacker,
			opponentColor: getNationColor(
				war.attacker === selectedNationId ? war.defender : war.attacker,
			),
			role: war.attacker === selectedNationId ? "Attacker" : "Defender",
			rebel: war.rebel,
		}))
		.sort((a, b) => a.opponentId - b.opponentId)

	return {
		id: selectedNationId,
		provinceCount: nationModel.counts.get(selectedNationId) ?? 0,
		totalPopulation,
		color: getNationColor(selectedNationId),
		neighbors,
		activeWars: nationWars,
	}
}

export function buildNationHistory(params: {
	selectedNationId: number | null
	historyQuery: HistoryQuery | null
	selectedTimeMs: number
	simStartTimeMs: number
	simTimeMs: number
	world: SerializedOrogenWorld | null
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
			wealth: view.nationWealth?.[selectedNationId] ?? 0,
			optimalWealth: view.nationOptimalWealth?.[selectedNationId] ?? 0,
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

export const NATION_BUCKETS: [number, number | null][] = [
	[50, null],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]

export const NATION_BUCKET_COLORS = [
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
		color: NATION_BUCKET_COLORS[index] ?? "rgb(148, 163, 184)",
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
	nationProvinceCounts: Map<number, number>,
): DistributionBucket[] {
	if (!selectedHistoryView) return []
	const nations = Array.from(nationProvinceCounts.keys())
	const counts: Record<string, number> = {
		Vassal: 0,
		PU: 0,
		Allied: 0,
		Friendly: 0,
		Suspicious: 0,
		Neutral: 0,
		Rival: 0,
		War: 0,
	}
	for (let i = 0; i < nations.length; i++) {
		for (let j = i + 1; j < nations.length; j++) {
			const rel = selectedHistoryView.relationAt(nations[i], nations[j])
			if (rel === REL.OVERLORD || rel === REL.VASSAL) counts.Vassal++
			else if (rel === REL.PU_SENIOR || rel === REL.PU_JUNIOR) counts.PU++
			else if (rel === REL.ALLY) counts.Allied++
			else if (rel === REL.FRIENDLY) counts.Friendly++
			else if (rel === REL.SUSPICIOUS) counts.Suspicious++
			else if (rel === REL.RIVAL) counts.Rival++
			else if (rel === REL.WAR) counts.War++
		}
	}
	return [
		{ label: "Personal Union", count: counts.PU, color: "rgb(99, 102, 241)" },
		{ label: "Vassal", count: counts.Vassal, color: "rgb(168, 85, 247)" },
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
