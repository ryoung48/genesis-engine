import React from "react"
import type { HistoryNote, VictoryDegree } from "@/model/history/types"
import { TIME } from "@/model/utilities/time"
import { NationLink } from "./NationLink"

export const eventDotColors: Record<string, string> = {
	succession: "#f43f5e",
	rebellion: "#f97316",
	"war started": "#f59e0b",
	battle: "#60a5fa",
	"war ended": "#10b981",
}

// Victory degree display labels from the viewer's perspective
const VICTORY_LABELS: Record<VictoryDegree, string> = {
	decisive: "Decisive Victory",
	victory: "Victory",
	pyrrhic: "Pyrrhic Victory",
	close: "Close Defeat",
	defeat: "Defeat",
	crushing: "Crushing Defeat",
}

// Colors for victory degrees
const VICTORY_COLORS: Record<VictoryDegree, string> = {
	decisive: "#059669", // emerald-600
	victory: "#10b981", // emerald-500
	pyrrhic: "#84cc16", // lime-500
	close: "#f97316", // orange-500
	defeat: "#ef4444", // red-500
	crushing: "#b91c1c", // red-700
}

/**
 * Get the victory degree from the viewing nation's perspective.
 * The stored victoryDegree is from the winner's perspective.
 */
const getViewerDegree = (
	event: Extract<HistoryNote, { tag: "battle" }>,
	viewingNation: number,
): VictoryDegree => {
	const won = event.winner === viewingNation
	if (won) {
		// We won, so victoryDegree is our degree
		return event.victoryDegree
	}
	// We lost, so map winner's degree to loser's degree
	const degreeMap: Record<VictoryDegree, VictoryDegree> = {
		decisive: "crushing",
		victory: "defeat",
		pyrrhic: "close",
		close: "pyrrhic",
		defeat: "victory",
		crushing: "decisive",
	}
	return degreeMap[event.victoryDegree]
}

/**
 * Helper component for clickable IDs that zoom the map
 */

// ... existing imports ...

// ...

/**
 * Helper component for clickable IDs that zoom the map
 */
const ClickableLink: React.FC<{
	type: string
	id: number
	onZoomToProvince?: (idx: number) => void
	onNationSelect?: (idx: number) => void
}> = ({ type, id, onZoomToProvince, onNationSelect }) => {
	if (type === "Nation") {
		return (
			<NationLink
				id={id}
				onZoomToProvince={onZoomToProvince}
				onNationSelect={onNationSelect}
			/>
		)
	}

	// Province link fallback
	return (
		<button
			className="group inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 underline decoration-indigo-300 decoration-dotted underline-offset-2 cursor-pointer transition-colors px-0.5"
			onClick={(e) => {
				e.stopPropagation()
				onZoomToProvince?.(id)
			}}
			title={`Click to zoom to ${type} #${id}`}
		>
			<span>
				{type} #{id}
			</span>
		</button>
	)
}

/**
 * Get a dynamic description for an event based on the viewing nation's perspective
 */
export const getEventDescription = (
	event: HistoryNote,
	viewingNation: number,
	onZoomToProvince?: (idx: number) => void,
	onWarSelect?: (warIdx: number) => void,
	onNationSelect?: (nationIdx: number) => void,
): React.ReactNode => {
	const isUs = (id: number) => id === viewingNation

	switch (event.tag) {
		case "battle": {
			const weAttacked = isUs(event.attacker)
			const enemy = weAttacked ? event.defender : event.attacker
			const ourCost = weAttacked ? event.attackerCost : event.defenderCost
			const viewerDegree = getViewerDegree(event, viewingNation)
			const prefix = (
				<button
					className="text-amber-600 hover:text-amber-800 font-bold mr-1 cursor-pointer transition-colors"
					onClick={(e) => {
						e.stopPropagation()
						if ("war" in event) onWarSelect?.(event.war)
					}}
				>
					[War {event.war}]
				</button>
			)
			const action = weAttacked ? (
				<>
					<ClickableLink
						type="Nation"
						id={viewingNation}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={onNationSelect}
					/>
					{" attacked "}
				</>
			) : (
				<>
					<ClickableLink
						type="Nation"
						id={enemy}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={onNationSelect}
					/>
					{" attacked "}
					<ClickableLink
						type="Nation"
						id={viewingNation}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={onNationSelect}
					/>
				</>
			)
			const myOdds = weAttacked ? event.odds : 1 - event.odds
			const stats = ` (${Math.round(myOdds * 100)}% odds, cost: ${ourCost.toFixed(1)})`

			return (
				<>
					{prefix}
					{action}
					{weAttacked && (
						<ClickableLink
							type="Nation"
							id={enemy}
							onZoomToProvince={onZoomToProvince}
							onNationSelect={onNationSelect}
						/>
					)}
					{" at "}
					<ClickableLink
						type="Province"
						id={event.province}
						onZoomToProvince={onZoomToProvince}
					/>
					{": "}
					<span
						className="font-bold"
						style={{ color: VICTORY_COLORS[viewerDegree] }}
					>
						{VICTORY_LABELS[viewerDegree]}
					</span>
					{stats}
				</>
			)
		}
		case "war ended": {
			const enemy = isUs(event.attacker) ? event.defender : event.attacker
			if (event.stalemate) {
				return (
					<>
						<button
							className="text-amber-600 hover:text-amber-800 font-bold mr-1 cursor-pointer transition-colors"
							onClick={(e) => {
								e.stopPropagation()
								if ("war" in event) onWarSelect?.(event.war)
							}}
						>
							[War {event.war}]
						</button>{" "}
						<ClickableLink
							type="Nation"
							id={viewingNation}
							onZoomToProvince={onZoomToProvince}
							onNationSelect={onNationSelect}
						/>{" "}
						ended in a stalemate with{" "}
						<ClickableLink
							type="Nation"
							id={enemy}
							onZoomToProvince={onZoomToProvince}
							onNationSelect={onNationSelect}
						/>
						: {event.stalemate}
					</>
				)
			}
			const won = event.winner === viewingNation
			const gains =
				event.transferred.length > 0
					? ` — ${event.transferred.length} province(s) transferred`
					: ""
			return (
				<>
					<button
						className="text-amber-600 hover:text-amber-800 font-bold mr-1 cursor-pointer transition-colors"
						onClick={(e) => {
							e.stopPropagation()
							if ("war" in event) onWarSelect?.(event.war)
						}}
					>
						[War {event.war}]
					</button>{" "}
					<ClickableLink
						type="Nation"
						id={viewingNation}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={onNationSelect}
					/>{" "}
					{won ? "won against " : "lost to "}
					<ClickableLink
						type="Nation"
						id={enemy}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={onNationSelect}
					/>
					{gains}
				</>
			)
		}
		case "war started": {
			const weAttacked = isUs(event.attacker)
			const enemy = weAttacked ? event.defender : event.attacker
			const myOdds = weAttacked ? event.odds : 1 - event.odds
			return (
				<>
					<button
						className="text-amber-600 hover:text-amber-800 font-bold mr-1 cursor-pointer transition-colors"
						onClick={(e) => {
							e.stopPropagation()
							if ("war" in event) onWarSelect?.(event.war)
						}}
					>
						[War {event.war}]
					</button>{" "}
					<ClickableLink
						type="Nation"
						id={weAttacked ? viewingNation : enemy}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={onNationSelect}
					/>{" "}
					declared war on{" "}
					<ClickableLink
						type="Nation"
						id={weAttacked ? enemy : viewingNation}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={onNationSelect}
					/>
					{` (${Math.round(myOdds * 100)}% chance)`}
				</>
			)
		}
		case "succession": {
			return (
				<>
					Leader {event.leader} has died; Leader {event.successor} takes power
				</>
			)
		}
		case "rebellion": {
			const trigger = event.succession ? " (during succession)" : ""
			if (event.disconnected) {
				return (
					<>
						<ClickableLink
							type="Nation"
							id={event.subject}
							onZoomToProvince={onZoomToProvince}
							onNationSelect={onNationSelect}
						/>{" "}
						rebelled from{" "}
						<ClickableLink
							type="Nation"
							id={event.overlord}
							onZoomToProvince={onZoomToProvince}
							onNationSelect={onNationSelect}
						/>{" "}
						due to disconnection{trigger}
					</>
				)
			}
			return (
				<>
					<ClickableLink
						type="Nation"
						id={event.subject}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={onNationSelect}
					/>{" "}
					rebelled against{" "}
					<ClickableLink
						type="Nation"
						id={event.overlord}
						onZoomToProvince={onZoomToProvince}
						onNationSelect={onNationSelect}
					/>
					{trigger}
				</>
			)
		}
		default: {
			const _exhaustive: never = event
			return (_exhaustive as HistoryNote).tag
		}
	}
}

/**
 * Get a display tag for an event based on perspective (e.g., "decisive victory" vs "crushing defeat")
 */
export const getDisplayTag = (
	event: HistoryNote,
	viewingNation: number,
): string => {
	switch (event.tag) {
		case "battle": {
			const viewerDegree = getViewerDegree(event, viewingNation)
			return VICTORY_LABELS[viewerDegree].toLowerCase()
		}
		case "war ended":
			return event.stalemate
				? "stalemate"
				: event.winner === viewingNation
					? "war victory"
					: "war defeat"
		default:
			return event.tag
	}
}

/**
 * Get the color for an event dot based on event type and outcome
 */
export const getEventDotColor = (
	event: HistoryNote,
	viewingNation: number,
): string => {
	if (event.tag === "battle") {
		const viewerDegree = getViewerDegree(event, viewingNation)
		return VICTORY_COLORS[viewerDegree]
	}
	if (event.tag === "war ended") {
		return event.winner === viewingNation ? "#10b981" : "#ef4444"
	}
	return eventDotColors[event.tag] || "#9ca3af"
}

interface EventDetailsProps {
	events: HistoryNote[]
	selectedYear: number
	viewingNation: number
	onTimeSelect?: (time: number) => void
	onZoomToProvince?: (idx: number) => void
	onWarSelect?: (warIdx: number) => void
	onNationSelect?: (nationIdx: number) => void
}

export const EventDetails: React.FC<EventDetailsProps> = ({
	events,
	selectedYear,
	viewingNation,
	onTimeSelect,
	onZoomToProvince,
	onWarSelect,
	onNationSelect,
}) => {
	if (events.length === 0) {
		return (
			<div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm mb-3">
				<div className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">
					Year {selectedYear}
				</div>
				<div className="text-[10px] text-gray-400">No events this year</div>
			</div>
		)
	}

	return (
		<div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm mb-3 max-h-[200px] overflow-y-auto">
			<div className="text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-2">
				Year {selectedYear} • {events.length} event
				{events.length > 1 ? "s" : ""}
			</div>
			<div className="space-y-2">
				{events.map((event: HistoryNote, i: number) => {
					const displayTag = getDisplayTag(event, viewingNation)
					const dotColor = getEventDotColor(event, viewingNation)

					return (
						<div
							key={i}
							className="border-l-2 pl-2"
							style={{
								borderColor: dotColor,
							}}
						>
							<div className="flex items-center gap-2">
								<div
									className="w-2 h-2 rounded-full flex-shrink-0"
									style={{
										backgroundColor: dotColor,
									}}
								/>
								<span className="text-[9px] font-bold text-gray-700 uppercase">
									{displayTag}
								</span>
								<button
									className="text-[8px] font-mono ml-auto px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 cursor-pointer transition-colors"
									onClick={() => onTimeSelect?.(event.time)}
								>
									{TIME.date.format(event.time)}
								</button>
							</div>
							<div
								className="text-[9px] text-gray-600 leading-tight mt-1 break-words"
								style={{ overflowWrap: "anywhere" }}
							>
								{getEventDescription(
									event,
									viewingNation,
									onZoomToProvince,
									onWarSelect,
									onNationSelect,
								)}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
