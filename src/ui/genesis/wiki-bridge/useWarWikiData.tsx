import { useMemo } from "react"
import { COLOR } from "@/model/history/earth/color"
import { DATE } from "@/model/history/earth/date"
import type { WarParticipantEventRecord } from "@/model/history/record/types"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE } from "@/ui/genesis/renderer/focus"
import type { WarWikiDataInput } from "@/ui/genesis/view/types"
import { formatWealthCost } from "@/ui/genesis/wiki-bridge/nation-wiki-timeline-format"
import {
	cleanEu4Identifier,
	eventComment,
	joinWithAnd,
	pushTimelineEvent,
} from "@/ui/wiki/nation/timeline-formatting"
import type { WikiTimelineEvent as NationTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"
import type { WarWikiData } from "@/ui/wiki/war/WarWikiPage"

/**
 * Builds the war wiki page (wars.json warId) for Earth-imported worlds.
 * Mutually exclusive with the nation and organization wiki pages -- see
 * useWikiSelection.
 */
export function useWarWikiData(input: WarWikiDataInput): WarWikiData | null {
	const {
		selectedWikiWarId,
		world,
		history,
		planetName,
		getProvinceColor,
		setSelectedWikiNationId,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		sceneRef,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<WarWikiData | null>(() => {
		if (selectedWikiWarId === null || !history.state || !history.query)
			return null
		const record = history.state.record
		const frame = history.query.frame
		const war = record.events.wars.find(
			(entry) => entry.id === selectedWikiWarId,
		)
		if (!war || war.events.length === 0) return null
		const nations = record.nations
		const daysFromMs = (timeMs: number) => timeMs / 86_400_000
		const resolveNationName = (id: number): string =>
			frame.nations.get(id)?.name ?? nations[id]?.name ?? `nation ${id}`
		const resolveNationColor = (id: number): string => {
			const n = frame.nations.get(id) ?? nations[id]
			return n
				? COLOR.rgb01ToCss([
						n.color[0] / 255,
						n.color[1] / 255,
						n.color[2] / 255,
					])
				: COLOR.rgb01ToCss([0.5, 0.5, 0.5])
		}
		const nationMention = (id: number) => ({
			tag: String(id),
			name: resolveNationName(id),
			color: resolveNationColor(id),
		})
		const provinceMention = (
			rawId: string,
			fallbackColor: string,
		): NationTimelineEvent["provinces"][number] | null => {
			const provinceId = history.state.provinceMap.realIdToCompact.get(rawId)
			if (provinceId === undefined) return null
			return {
				id: provinceId,
				name:
					history.state.provinceMeta[provinceId]?.name ?? `Province ${rawId}`,
				color: getProvinceColor(provinceId) ?? fallbackColor,
			}
		}
		// Last-known side per nation across the whole war (matches the
		// existing nation-timeline convention) -- a nation that switched
		// sides mid-war ends up bucketed by whichever side it held last.
		const sideById = new Map<number, "attacker" | "defender">()
		for (const event of war.events) sideById.set(event.nationId, event.side)

		const dates = war.events.map((event) => daysFromMs(event.timeMs))
		const dateRangeStart = Math.min(...dates)
		const dateRangeEnd = Math.max(...dates)
		const dateRangeLabel = `${DATE.formatHistoryDays(dateRangeStart)} – ${DATE.formatHistoryDays(dateRangeEnd)}`

		const stats: StatEntry[] = []
		if (war.warGoalType)
			stats.push({
				label: "War Goal",
				value: cleanEu4Identifier(war.warGoalType),
			})
		if (war.casusBelli)
			stats.push({
				label: "Casus Belli",
				value: cleanEu4Identifier(war.casusBelli),
			})
		if (war.warGoalId >= 0) {
			const target = nationMention(war.warGoalId)
			stats.push({
				label: "War Goal Target",
				value: "",
				valueAction: (
					<InlineTextButton
						onClick={() => setSelectedWikiNationId(Number(target.tag))}
					>
						{target.name}
					</InlineTextButton>
				),
			})
		} else if (war.warGoalProvinceId >= 0) {
			const province = provinceMention(String(war.warGoalProvinceId), "#94a3b8")
			if (province) {
				stats.push({
					label: "War Goal Target",
					value: "",
					valueAction: (
						<InlineTextButton
							onClick={() => sceneRef.current?.focusOnProvince(province.id)}
						>
							{province.name}
						</InlineTextButton>
					),
				})
			}
		}
		if (war.rebel) stats.push({ label: "Type", value: "Rebellion" })

		// A nation stays listed under whichever side it last held (sideByTag
		// above), but whether it's actually *in* the war right now depends on
		// the selected date -- find each tag's most recent join/leave at or
		// before that date and check whether it was a join. A tag with no
		// qualifying event yet (hasn't joined) is treated as inactive too.
		const currentDate = daysFromMs(history.selectedTimeMs)
		const eventsById = new Map<number, WarParticipantEventRecord[]>()
		for (const event of war.events) {
			const list = eventsById.get(event.nationId)
			if (list) list.push(event)
			else eventsById.set(event.nationId, [event])
		}
		const isActiveAtCurrentDate = (nationId: number): boolean => {
			const events = eventsById.get(nationId)
			if (!events) return false
			let active = false
			for (const event of [...events].sort((a, b) => a.timeMs - b.timeMs)) {
				if (daysFromMs(event.timeMs) > currentDate) break
				active = event.kind === "warStart"
			}
			return active
		}
		// Outside the war's own span entirely (viewing history well before it
		// started or long after it ended), graying out participants who
		// "haven't joined yet" or "already left" reads as broken rather than
		// informative -- only apply the per-nation check while the selected
		// date actually falls within the war.
		const dateWithinWar =
			currentDate >= dateRangeStart && currentDate <= dateRangeEnd
		const participantMention = (
			nationId: number,
		): WarWikiData["participants"][number]["nations"][number] => ({
			...nationMention(nationId),
			active: !dateWithinWar || isActiveAtCurrentDate(nationId),
		})

		const sideOrder: Array<"attacker" | "defender"> = ["attacker", "defender"]
		const participants: WarWikiData["participants"] = sideOrder.map((side) => ({
			side,
			nations: Array.from(sideById.entries())
				.filter(([, idSide]) => idSide === side)
				.map(([nationId]) => nationId)
				.sort((a, b) =>
					resolveNationName(a).localeCompare(resolveNationName(b)),
				)
				.map(participantMention),
		}))

		const timelineEvents: NationTimelineEvent[] = []
		// Multiple nations often join/leave on the same date (a shared peace
		// treaty ending the war for every belligerent at once, or several
		// allies declaring together) -- group by (date, kind) so that shows
		// up as one combined entry instead of one per nation.
		const eventGroups = new Map<string, WarParticipantEventRecord[]>()
		for (const event of war.events) {
			const key = `${event.timeMs}:${event.kind}`
			const group = eventGroups.get(key)
			if (group) group.push(event)
			else eventGroups.set(key, [event])
		}
		for (const [key, group] of eventGroups) {
			const date = daysFromMs(group[0].timeMs)
			const kind = group[0].kind
			const comment = group.find((event) => event.comment)?.comment
			const attackerIds = group
				.filter((event) => event.side === "attacker")
				.map((event) => event.nationId)
			const defenderIds = group
				.filter((event) => event.side === "defender")
				.map((event) => event.nationId)
			const nations: NationTimelineEvent["nations"] = []
			for (const nationId of [...attackerIds, ...defenderIds]) {
				if (!nations.some((entry) => entry.tag === String(nationId)))
					nations.push(nationMention(nationId))
			}
			let description: string
			if (kind === "warStart") {
				const attackerNames = attackerIds.map(resolveNationName)
				const defenderNames = defenderIds.map(resolveNationName)
				if (attackerNames.length > 0 && defenderNames.length > 0) {
					description = `${joinWithAnd(attackerNames)} entered the war against ${joinWithAnd(defenderNames)}.`
				} else {
					const joiningSide = attackerNames.length > 0 ? "attacker" : "defender"
					const joiningIds =
						attackerNames.length > 0 ? attackerIds : defenderIds
					const joiningNames =
						attackerNames.length > 0 ? attackerNames : defenderNames
					const opponentIds = Array.from(sideById.entries())
						.filter(
							([opponentId, side]) =>
								side !== joiningSide && !joiningIds.includes(opponentId),
						)
						.map(([opponentId]) => opponentId)
					for (const opponentId of opponentIds) {
						if (!nations.some((entry) => entry.tag === String(opponentId)))
							nations.push(nationMention(opponentId))
					}
					const opponentNames = opponentIds.map(resolveNationName)
					description = `${joinWithAnd(joiningNames)} entered the war${opponentNames.length > 0 ? ` against ${joinWithAnd(opponentNames)}` : ""}.`
				}
			} else {
				const names = [...attackerIds, ...defenderIds].map(resolveNationName)
				description = `${joinWithAnd(names)} left the war.`
			}
			pushTimelineEvent(timelineEvents, {
				id: `warEvent:${key}`,
				date,
				type: kind === "warStart" ? "War (+)" : "War (-)",
				description,
				comment: eventComment(comment),
				nations,
			})
		}

		for (const [index, battle] of war.battles.entries()) {
			const province =
				battle.locationProvinceId >= 0
					? provinceMention(String(battle.locationProvinceId), "#94a3b8")
					: null
			const winner = battle.attackerWon ? battle.attacker : battle.defender
			const loser = battle.attackerWon ? battle.defender : battle.attacker
			const winnerName =
				winner.countryId >= 0 ? resolveNationName(winner.countryId) : "unknown"
			const loserName =
				loser.countryId >= 0 ? resolveNationName(loser.countryId) : "unknown"
			const winnerCost = formatWealthCost(winner.wealthCost)
			const loserCost = formatWealthCost(loser.wealthCost)
			const costs =
				winnerCost && loserCost
					? ` (cost: ${winnerName} ${winnerCost}, ${loserName} ${loserCost})`
					: ""
			const description = `${winnerName} defeated ${loserName} at the Battle of ${battle.name}${costs}.`
			pushTimelineEvent(timelineEvents, {
				id: `warBattle:${battle.timeMs}:${index}`,
				date: daysFromMs(battle.timeMs),
				type: "Battle",
				description,
				comment: eventComment(battle.comment),
				nations: [battle.attacker.countryId, battle.defender.countryId].flatMap(
					(id) => (id >= 0 ? [nationMention(id)] : []),
				),
				provinces: province ? [province] : [],
			})
		}

		// Territory that changed hands directly between two participants
		// (not just any ownership change anywhere in the world) during the
		// war's span -- walks every province's owner history once, which is
		// only done when a war page is actually opened. A single treaty (e.g.
		// the American Revolution's 1776.7.4 mass transfer) can flip dozens
		// of provinces on one date between the same two nations, so these are
		// grouped by (date, owner, nextOwner) into one combined entry instead
		// of one per province.
		const territoryGroups = new Map<
			string,
			{
				date: number
				owner: number
				nextOwner: number
				provinces: NationTimelineEvent["provinces"]
			}
		>()
		// Occupation (military control changing hands without a change of
		// legal ownership, e.g. the province is still being fought over) is
		// tracked separately from the ownership transfers above -- same
		// grouping shape, but keyed off `controller` events instead of
		// `owner` ones, matching the nation-page timeline's "took control
		// of" vs. "gained"/"lost" distinction (see the `owner`/`controller`
		// branches above).
		const controlGroups = new Map<
			string,
			{
				date: number
				controller: number
				nextController: number
				provinces: NationTimelineEvent["provinces"]
			}
		>()
		for (const [rawId, entry] of record.events.provinceEvents) {
			let owner = entry.base.ownerId
			let controller = entry.base.controllerId
			for (const event of entry.events) {
				if (event.kind === "owner") {
					const nextOwner = (event.payload.nationId as number | null) ?? null
					if (
						daysFromMs(event.timeMs) >= dateRangeStart &&
						daysFromMs(event.timeMs) <= dateRangeEnd &&
						owner >= 0 &&
						nextOwner >= 0 &&
						owner !== nextOwner &&
						sideById.has(owner) &&
						sideById.has(nextOwner)
					) {
						const province = provinceMention(String(rawId), "#94a3b8")
						if (province) {
							const key = `${event.timeMs}:${owner}:${nextOwner}`
							const group = territoryGroups.get(key)
							if (group) group.provinces.push(province)
							else
								territoryGroups.set(key, {
									date: daysFromMs(event.timeMs),
									owner,
									nextOwner,
									provinces: [province],
								})
						}
					}
					owner = nextOwner
				} else if (event.kind === "controller") {
					const nextController =
						(event.payload.nationId as number | null) ?? null
					if (
						daysFromMs(event.timeMs) >= dateRangeStart &&
						daysFromMs(event.timeMs) <= dateRangeEnd &&
						controller >= 0 &&
						nextController >= 0 &&
						controller !== nextController &&
						sideById.has(controller) &&
						sideById.has(nextController)
					) {
						const province = provinceMention(String(rawId), "#94a3b8")
						if (province) {
							const key = `${event.timeMs}:${controller}:${nextController}`
							const group = controlGroups.get(key)
							if (group) group.provinces.push(province)
							else
								controlGroups.set(key, {
									date: daysFromMs(event.timeMs),
									controller,
									nextController,
									provinces: [province],
								})
						}
					}
					controller = nextController
				}
			}
		}
		for (const [key, group] of territoryGroups) {
			const provinceNames = group.provinces.map((province) => province.name)
			const description =
				group.provinces.length === 1
					? `${provinceNames[0]} was ceded from ${resolveNationName(group.owner)} to ${resolveNationName(group.nextOwner)}.`
					: `${group.provinces.length} provinces (${joinWithAnd(provinceNames)}) were ceded from ${resolveNationName(group.owner)} to ${resolveNationName(group.nextOwner)}.`
			pushTimelineEvent(timelineEvents, {
				id: `warTerritory:${key}`,
				date: group.date,
				type: "Territory",
				description,
				nations: [nationMention(group.owner), nationMention(group.nextOwner)],
				provinces: group.provinces,
			})
		}
		for (const [key, group] of controlGroups) {
			const provinceNames = group.provinces.map((province) => province.name)
			const description =
				group.provinces.length === 1
					? `${resolveNationName(group.nextController)} took control of ${provinceNames[0]} from ${resolveNationName(group.controller)}.`
					: `${resolveNationName(group.nextController)} took control of ${group.provinces.length} provinces (${joinWithAnd(provinceNames)}) from ${resolveNationName(group.controller)}.`
			pushTimelineEvent(timelineEvents, {
				id: `warControl:${key}`,
				date: group.date,
				type: "Territory",
				description,
				nations: [
					nationMention(group.controller),
					nationMention(group.nextController),
				],
				provinces: group.provinces,
			})
		}
		timelineEvents.sort((a, b) => a.date - b.date)

		return {
			id: war.id,
			name: war.name,
			planetTitle: planetName,
			dateRangeLabel,
			stats,
			participants,
			timelineEvents,
			dateRangeStart,
			dateRangeEnd,
			currentDate,
			currentDateLabel: DATE.formatHistoryTimeMs(history.selectedTimeMs),
			onBack: () => setSelectedWikiWarId(null),
			onSelectNation: (targetTag: string) => {
				setSelectedWikiNationId(Number(targetTag))
			},
			onSelectProvince: (provinceId: number) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			onSelectDate: (day: number) =>
				history.setSelectedTimeMs(day * 86_400_000),
			onSelectOrganization: (orgId: string) => {
				setSelectedWikiOrganizationId(orgId)
			},
		}
	}, [
		selectedWikiWarId,
		world,
		history.query,
		history.state,
		history.provinceMeta,
		history.selectedTimeMs,
		history.setSelectedTimeMs,
		getProvinceColor,
		planetName,
		setSelectedWikiNationId,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
	])
}
