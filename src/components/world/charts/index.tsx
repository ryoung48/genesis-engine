import React, { useEffect, useRef, useState } from "react"
import { NATION } from "@/model/nations"

import { RELATIONS } from "@/model/nations/relations"
import { PROVINCE } from "@/model/provinces"
import { NAMES } from "@/model/actors/language/names"
import { TIME } from "@/model/utilities/time"
import { CultureTab } from "./CultureTab"
import { HeritageTab } from "./HeritageTab"
import { NationTab } from "./NationTab"
import { ProvinceTab } from "./ProvinceTab"
import { SIZE_BUCKETS, SimulationTab } from "./SimulationTab"
import { WarTab } from "./WarTab"

const MAX_HISTORY_POINTS = 500

// Event types in order for stacked chart
export const EVENT_TYPES = [
	"rebellion",
	"succession",
	"war started",
	"battle",
	"war ended",
] as const
export type EventCounts = Record<(typeof EVENT_TYPES)[number], number>

export const RELATION_TYPES = [
	"ally",
	"friendly",
	"neutral",
	"suspicious",
	"rival",
	"war",
	"vassal",
	"overlord",
	"personal_union_senior",
	"personal_union_junior",
] as const
export type RelationCounts = Record<(typeof RELATION_TYPES)[number], number>

export interface WarOutcomeCounts {
	attackerWin: number
	defenderWin: number
	exhaustion: number
	invalidated: number
}

export interface RebellionOutcomeCounts {
	normal: number
	succession: number
}

// --- Entity stack types ---

export type EntityType = "nation" | "province" | "war" | "heritage" | "culture"

export interface EntityRef {
	type: EntityType
	idx: number
}

const entityLabel = (entity: EntityRef): string => {
	switch (entity.type) {
		case "nation":
			return NAMES.nation(entity.idx)
		case "province":
			return NAMES.province(entity.idx)
		case "war":
			return `War #${entity.idx}`
		case "heritage":
			return window.world.heritages?.[entity.idx]?.name || `Heritage ${entity.idx}`
		case "culture":
			return window.world.cultures?.[entity.idx]?.name || `Culture ${entity.idx}`
	}
}

const entityColor = (entity: EntityRef): string | undefined => {
	switch (entity.type) {
		case "nation":
		case "province":
			return window.world.provinces[entity.idx]?.color
		case "heritage":
			return window.world.heritages?.[entity.idx]?.color
		case "culture":
			return window.world.cultures?.[entity.idx]?.color
		default:
			return undefined
	}
}

// --- ChartPanel ---

interface ChartPanelProps {
	entityStack: EntityRef[]
	setEntityStack: (stack: EntityRef[]) => void
	activeDepth: 0 | 1 | 2
	setActiveDepth: (d: 0 | 1 | 2) => void
	currentTime: number
	renderTime: number
	onTimeSelect?: (time: number) => void
	onZoomToProvince?: (provinceIdx: number) => void
	onNationSelect?: (nationIdx: number) => void
}

export const ChartPanel: React.FC<ChartPanelProps> = (props) => {
	const {
		entityStack,
		setEntityStack,
		activeDepth,
		setActiveDepth,
		currentTime,
		renderTime,
		onTimeSelect,
		onZoomToProvince,
	} = props

	const topEntity = activeDepth > 0 && entityStack.length > 0 ? (entityStack[activeDepth - 1] ?? entityStack[entityStack.length - 1]) : null

	// Distribution state - kept here so it persists across tab switches
	const [nationDistribution, setNationDistribution] = useState<number[]>(() =>
		SIZE_BUCKETS.map(() => 0),
	)
	const [distributionHistory, setDistributionHistory] = useState<
		{
			time: number
			dist: number[]
			devDist: number[]
			nationDevDist: number[]
			nationAvgDev: number
			avgDev: number
			activeWars: number
			activeCivilWars: number
			eventCounts: EventCounts
			warOutcomes: WarOutcomeCounts
			rebellionOutcomes: RebellionOutcomeCounts
			relationCounts: RelationCounts
		}[]
	>([])
	const lastRecordedTimeRef = useRef<number>(-Infinity)

	// Update distribution when currentTime changes
	useEffect(() => {
		if (!window.world?.provinces) return

		const nations = NATION.nations()
		const sizes = nations.map((n) => NATION.provinces(n).length)
		const dist = SIZE_BUCKETS.map(
			([min, max]) => sizes.filter((s) => s >= min && s < max).length,
		)

		setNationDistribution(dist)

		// Count active wars (wars with no endTime), split by type
		const allActiveWars =
			window.world.wars?.filter((w) => w.endTime === undefined) ?? []
		const activeWars = allActiveWars.filter((w) => !w.rebel).length
		const activeCivilWars = allActiveWars.filter((w) => w.rebel).length

		// Count events by type for the current year
		const currentYear = TIME.date.toYear(currentTime)
		const past = window.world.past ?? []
		const eventCounts: EventCounts = {
			rebellion: 0,
			succession: 0,
			"war started": 0,
			battle: 0,
			"war ended": 0,
		}
		const warOutcomes: WarOutcomeCounts = {
			attackerWin: 0,
			defenderWin: 0,
			exhaustion: 0,
			invalidated: 0,
		}
		const rebellionOutcomes: RebellionOutcomeCounts = {
			normal: 0,
			succession: 0,
		}
		const relationCounts: RelationCounts = {
			ally: 0,
			friendly: 0,
			neutral: 0,
			suspicious: 0,
			rival: 0,
			war: 0,
			vassal: 0,
			overlord: 0,
			personal_union_senior: 0,
			personal_union_junior: 0,
		}

		for (const note of past) {
			if (TIME.date.toYear(note.time) === currentYear) {
				if (note.tag in eventCounts) {
					eventCounts[note.tag as keyof EventCounts]++
				}

				if (note.tag === "war ended") {
					if (note.stalemate === "both nations exhausted") {
						warOutcomes.exhaustion++
					} else if (note.stalemate) {
						warOutcomes.invalidated++
					} else if (note.winner === note.attacker) {
						warOutcomes.attackerWin++
					} else {
						warOutcomes.defenderWin++
					}
				}

				if (note.tag === "rebellion") {
					if (note.succession) {
						rebellionOutcomes.succession++
					} else {
						rebellionOutcomes.normal++
					}
				}
			}
		}

		// Count active relations
		window.world.provinces.forEach((p) => {
			if (p.desolate || !p._relations || !NATION.sovereign(p, currentTime))
				return

			NATION.neighbors({ nation: p, time: currentTime }).forEach((other) => {
				if (!NATION.sovereign(other, currentTime)) return
				const relation = RELATIONS.get({
					nation: p,
					other,
					time: currentTime,
				})

				const type = relation as keyof RelationCounts
				if (relationCounts[type] !== undefined) {
					relationCounts[type]++
				}
			})
		})

		// Record history at each time tick (only for new time points)
		if (currentTime > lastRecordedTimeRef.current) {
			lastRecordedTimeRef.current = currentTime

			const devDist = new Array(10).fill(0)
			let totalDev = 0
			let countDev = 0
			window.world.provinces.forEach((p) => {
				if (p.desolate) return
				const dev = PROVINCE.development.get(p, currentTime)
				totalDev += dev
				countDev++
				const bucket = Math.min(9, Math.floor(dev * 10))
				devDist[bucket]++
			})
			const avgDev = countDev > 0 ? totalDev / countDev : 0

			const nationDevDist = new Array(10).fill(0)
			let nationTotalDev = 0
			let nationCountDev = 0
			const capitalProvinces = NATION.nations(currentTime)
			capitalProvinces.forEach((p) => {
				const dev = PROVINCE.development.get(p, currentTime)
				nationTotalDev += dev
				nationCountDev++
				const bucket = Math.min(9, Math.floor(dev * 10))
				nationDevDist[bucket]++
			})
			const nationAvgDev = nationCountDev > 0 ? nationTotalDev / nationCountDev : 0

			setDistributionHistory((prev) => {
				const newHistory = [
					...prev,
					{
						time: currentTime,
						dist,
						devDist,
						nationDevDist,
						nationAvgDev,
						avgDev,
						activeWars,
						activeCivilWars,
						eventCounts,
						warOutcomes,
						rebellionOutcomes,
						relationCounts,
					},
				]
				return newHistory.slice(-MAX_HISTORY_POINTS)
			})
		}
	}, [currentTime])

	const pushEntity = (entity: EntityRef) => {
		const parent = entityStack.find((e) => e.type === "nation" || e.type === "heritage")
		setEntityStack(parent ? [parent, entity] : [entity])
		setActiveDepth(2)
	}

	const renderEntityContent = () => {
		if (!topEntity) return null

		switch (topEntity.type) {
			case "nation":
				return (
					<NationTab
						selectedNation={topEntity.idx}
						renderTime={renderTime}
						currentTime={currentTime}
						onTimeSelect={onTimeSelect}
						onZoomToProvince={onZoomToProvince}
						onWarSelect={(warIdx: number) => {
							pushEntity({ type: "war", idx: warIdx })
						}}
					/>
				)
			case "province":
				return (
					<ProvinceTab
						selectedProvince={topEntity.idx}
						renderTime={renderTime}
						onNationSelect={() => setActiveDepth(1)}
						onHeritageSelect={(heritageIdx: number) => {
							setEntityStack([{ type: "heritage", idx: heritageIdx }])
							setActiveDepth(1)
						}}
						onCultureSelect={(cultureIdx: number) => {
							const culture = window.world.cultures?.[cultureIdx]
							const heritageIdx = culture?.heritage ?? -1
							if (heritageIdx >= 0) {
								setEntityStack([
									{ type: "heritage", idx: heritageIdx },
									{ type: "culture", idx: cultureIdx },
								])
								setActiveDepth(2)
							} else {
								setEntityStack([{ type: "culture", idx: cultureIdx }])
								setActiveDepth(1)
							}
						}}
					/>
				)
			case "war":
				return (
					<WarTab
						selectedWar={topEntity.idx}
						renderTime={renderTime}
						currentTime={currentTime}
						onTimeSelect={onTimeSelect}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={(nationIdx: number) => {
							props.onNationSelect?.(nationIdx)
							setEntityStack([{ type: "nation", idx: nationIdx }])
							setActiveDepth(1)
						}}
					/>
				)
			case "heritage":
				return (
					<HeritageTab
						selectedHeritage={topEntity.idx}
						onCultureSelect={(cultureIdx: number) => {
							pushEntity({ type: "culture", idx: cultureIdx })
						}}
					/>
				)
			case "culture":
				return (
					<CultureTab
						selectedCulture={topEntity.idx}
					/>
				)
		}
	}

	// Fixed 3-slot breadcrumb used as tabs
	const midEntry = entityStack.find((e) => e.type === "nation" || e.type === "heritage") ?? null
	const detailEntry =
		entityStack.find((e) => e.type === "province" || e.type === "war" || e.type === "culture") ?? null
	const atWorld = activeDepth === 0 || entityStack.length === 0
	const atMid = !atWorld && activeDepth === 1
	const atDetail = !atWorld && activeDepth === 2

	// Placeholder label for slot 3 adapts to what's in the stack
	const detailPlaceholder = midEntry
		? (midEntry.type === "heritage" ? "Culture" : "Province")
		: "—"

	return (
		<div className="mt-4 flex flex-col flex-1 overflow-hidden min-h-0">
			{/* Breadcrumb tabs */}
			<div className="flex items-center gap-1 mb-3 text-[10px] font-mono uppercase tracking-wider overflow-x-auto no-scrollbar">
				{/* Slot 1: World */}
				<button
					onClick={() => setActiveDepth(0)}
					className={`transition-colors ${atWorld
						? "text-slate-900 font-bold cursor-default"
						: "text-slate-400 hover:text-slate-700 cursor-pointer"
						}`}
				>
					World
				</button>

				<span className="text-slate-200 mx-0.5">›</span>

				{/* Slot 2: Nation or Heritage */}
				{midEntry ? (
					<button
						onClick={() => setActiveDepth(1)}
						className={`flex items-center gap-1 transition-colors whitespace-nowrap ${atMid
							? "text-slate-900 font-bold cursor-default"
							: "text-slate-400 hover:text-slate-700 cursor-pointer"
							}`}
					>
						{entityColor(midEntry) && (
							<div
								className="w-1.5 h-1.5 border border-black/10 flex-shrink-0"
								style={{ backgroundColor: entityColor(midEntry) }}
							/>
						)}
						{entityLabel(midEntry)}
					</button>
				) : (
					<span className="text-slate-200">—</span>
				)}

				<span className="text-slate-200 mx-0.5">›</span>

				{/* Slot 3: Province, War, or Culture */}
				{detailEntry ? (
					<button
						onClick={() => setActiveDepth(2)}
						className={`flex items-center gap-1 transition-colors whitespace-nowrap ${atDetail
							? "text-slate-900 font-bold cursor-default"
							: "text-slate-400 hover:text-slate-700 cursor-pointer"
							}`}
					>
						{entityColor(detailEntry) && (
							<div
								className="w-1.5 h-1.5 border border-black/10 flex-shrink-0"
								style={{ backgroundColor: entityColor(detailEntry) }}
							/>
						)}
						{entityLabel(detailEntry)}
					</button>
				) : (
					<span className="text-slate-200">
						{detailPlaceholder}
					</span>
				)}
			</div>

			{/* Content */}
			<div className="flex-1 flex flex-col overflow-hidden min-h-0">
				{atWorld ? (
					<SimulationTab
						distributionHistory={distributionHistory}
						nationDistribution={nationDistribution}
						renderTime={renderTime}
						currentTime={currentTime}
						onTimeSelect={onTimeSelect}
					/>
				) : (
					renderEntityContent()
				)}
			</div>
		</div>
	)
}
