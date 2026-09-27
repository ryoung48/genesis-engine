import { useMemo } from "react"
import { COLOR } from "@/model/history/earth/color"
import { DATE } from "@/model/history/earth/date"
import { HISTORY } from "@/model/history/record"
import type {
	Battle,
	WarParticipantEventRecord,
} from "@/model/history/record/types"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { uiPalette } from "@/ui/components/tokens"
import { SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE } from "@/ui/genesis/renderer/focus"
import type { WarWikiDataInput } from "@/ui/genesis/view/types"
import { focusWikiNation } from "@/ui/genesis/wiki-bridge/nation-focus"
import {
	battleDetail,
	battleVerb,
	formatBattleForce,
} from "@/ui/genesis/wiki-bridge/nation-wiki-timeline-format"
import {
	cleanEu4Identifier,
	compareTimelineDayThenType,
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
interface ActiveAtParams {
	nationId: number
	timeMs: number
}

interface SideMember {
	nationId: number
	side: "attacker" | "defender"
}

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
		setSelectedWikiPersonId,
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
		const nationMention = (id: number) => {
			const striped = war.rebel && id === war.warGoalId
			return {
				tag: String(id),
				name: resolveNationName(id),
				color: striped ? uiPalette.rebel : resolveNationColor(id),
				striped,
			}
		}
		const selectNation = (targetId: number) => {
			focusWikiNation({
				frame,
				wars: record.events.wars,
				targetId,
				sceneRef,
			})
			setSelectedWikiNationId(targetId)
		}
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
		if (war.casusBelli)
			stats.push({
				label: "Casus Belli",
				value: cleanEu4Identifier(war.casusBelli),
			})

		// A nation stays listed under whichever side it last held (sideByTag
		// above), but whether it's actually *in* the war right now depends on
		// the selected date -- find each tag's most recent join/leave at or
		// before that date and check whether it was a join. A tag with no
		// qualifying event yet (hasn't joined) is treated as inactive too.
		const currentDate = daysFromMs(history.selectedTimeMs)
		const eventsById = new Map<number, WarParticipantEventRecord[]>()
		for (const event of [...war.events].sort((a, b) => a.timeMs - b.timeMs)) {
			const list = eventsById.get(event.nationId)
			if (list) list.push(event)
			else eventsById.set(event.nationId, [event])
		}
		const isActiveAt = ({ nationId, timeMs }: ActiveAtParams): boolean => {
			let active = false
			for (const event of eventsById.get(nationId) ?? []) {
				if (event.timeMs > timeMs) break
				active = event.kind === "warStart"
			}
			return active
		}
		// Outside the war the panel shows the war's own opening or closing
		// line-up rather than the selected date's.
		const startMs = Math.min(...war.events.map((event) => event.timeMs))
		const endMs = Math.max(...war.events.map((event) => event.timeMs))
		const ended = Array.from(eventsById.values()).every(
			(events) => events[events.length - 1].kind === "warEnd",
		)
		const afterEnd = ended && history.selectedTimeMs >= endMs
		const leftAtEnd = (nationId: number): boolean => {
			const last = eventsById.get(nationId)?.at(-1)
			return last?.kind === "warEnd" && last.timeMs === endMs
		}
		const panelTimeMs =
			history.selectedTimeMs < startMs
				? startMs
				: afterEnd
					? endMs - 1
					: history.selectedTimeMs
		const battleCutoffMs = afterEnd ? endMs : panelTimeMs
		const panelFrame =
			panelTimeMs === history.selectedTimeMs
				? frame
				: HISTORY.frameAt({ state: history.state, timeMs: panelTimeMs })
		const sideOrder: Array<"attacker" | "defender"> = ["attacker", "defender"]
		const latestBattle = war.battles.reduce<Battle | null>(
			(latest, battle) =>
				battle.timeMs <= battleCutoffMs &&
				(latest === null || battle.timeMs > latest.timeMs)
					? battle
					: latest,
			null,
		)
		// Before the first battle the panel shows each realm's troops at the
		// war's declaration.
		const contributions = latestBattle
			? (latestBattle.simulated?.contributions ?? [])
			: war.mobilization
		const contributionById = new Map(
			contributions.map((contribution) => [
				contribution.countryId,
				contribution,
			]),
		)
		const leadBySide = new Map(
			sideOrder.flatMap((side) => {
				const first = war.events
					.filter((event) => event.side === side && event.kind === "warStart")
					.reduce<WarParticipantEventRecord | null>(
						(earliest, event) =>
							earliest === null || event.timeMs < earliest.timeMs
								? event
								: earliest,
						null,
					)
				return first ? [[side, first.nationId] as const] : []
			}),
		)
		const roleTowardLead = ({ nationId, side }: SideMember): string | null => {
			const lead = leadBySide.get(side)
			const relations =
				lead === undefined ? null : panelFrame.nations.get(lead)?.relations
			if (lead === nationId || !relations) return null
			if (relations.vassals.includes(nationId)) return "vassal"
			if (relations.overlord === nationId) return "overlord"
			if (
				relations.unionSeniorOf.includes(nationId) ||
				relations.unionJuniorPartner === nationId
			)
				return "union partner"
			if (relations.allies.includes(nationId)) return "ally"
			return null
		}
		const participantMention = ({
			nationId,
			side,
		}: SideMember): WarWikiData["participants"][number]["nations"][number] => ({
			...nationMention(nationId),
			lead: leadBySide.get(side) === nationId,
			role: contributionById.has(nationId)
				? (contributionById.get(nationId)?.role ?? null)
				: roleTowardLead({ nationId, side }),
			troops: contributionById.get(nationId)?.troops ?? null,
		})
		const strengthBySide = new Map<"attacker" | "defender", number>()
		for (const contribution of contributions) {
			const side = sideById.get(contribution.countryId)
			if (side)
				strengthBySide.set(
					side,
					(strengthBySide.get(side) ?? 0) + contribution.troops,
				)
		}
		const participants: WarWikiData["participants"] = sideOrder.map((side) => ({
			side,
			totalStrength: strengthBySide.get(side) ?? null,
			nations: Array.from(sideById.entries())
				.filter(
					([nationId, idSide]) =>
						idSide === side &&
						(afterEnd
							? leftAtEnd(nationId)
							: isActiveAt({ nationId, timeMs: panelTimeMs })),
				)
				.map(([nationId]) => participantMention({ nationId, side }))
				.sort(
					(a, b) =>
						(b.troops ?? -1) - (a.troops ?? -1) || a.name.localeCompare(b.name),
				),
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
			const winnerForce = formatBattleForce(winner)
			const loserForce = formatBattleForce(loser)
			const forces =
				winnerForce && loserForce
					? ` (${winnerName}: ${winnerForce}; ${loserName}: ${loserForce})`
					: ""
			const description = `${winnerName} ${battleVerb(battle)} ${loserName} at the Battle of ${battle.name}${forces}.${battleDetail(battle)}`
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
		timelineEvents.sort(compareTimelineDayThenType)

		return {
			id: war.id,
			name: war.name,
			planetTitle: planetName,
			dateRangeLabel,
			stats,
			participants,
			participantsAsOf:
				panelTimeMs === history.selectedTimeMs
					? null
					: DATE.formatHistoryDays(daysFromMs(afterEnd ? endMs : startMs)),
			timelineEvents,
			dateRangeStart,
			dateRangeEnd,
			currentDate,
			currentDateLabel: DATE.formatHistoryTimeMs(history.selectedTimeMs),
			onBack: () => setSelectedWikiWarId(null),
			onSelectNation: (targetTag: string) => {
				selectNation(Number(targetTag))
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
			onSelectPerson: (personId: number) => {
				setSelectedWikiPersonId(personId)
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
		setSelectedWikiPersonId,
	])
}
