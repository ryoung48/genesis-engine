import { useMemo } from "react"
import { COLOR } from "@/model/history/earth/color"
import type { RawWarParticipantEvent } from "@/model/history/earth/data-source/types"
import { DATE } from "@/model/history/earth/date"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import type { WarWikiDataInput } from "@/ui/planet/GenesisView/types"
import { SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE } from "@/ui/planet/renderer/focus"
import {
	cleanEu4Identifier,
	eventComment,
	isRebelTag,
	joinWithAnd,
	normalizeTimelineTag,
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
		earthHistory,
		earthImportRawIdToCompact,
		planetName,
		getProvinceColor,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		sceneRef,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<WarWikiData | null>(() => {
		if (
			!selectedWikiWarId ||
			!world?.isEarthImport ||
			!earthHistory.engine ||
			!earthHistory.query
		)
			return null
		const war = earthHistory.engine.data.wars.find(
			(w) => w.warId === selectedWikiWarId,
		)
		if (!war || war.events.length === 0) return null
		const { state } = earthHistory.query
		const resolveNationName = (otherTag: string): string =>
			isRebelTag(otherTag)
				? "Rebels"
				: (state.nations.get(otherTag)?.currentName ??
					earthHistory.nationReference?.get(otherTag)?.name ??
					otherTag)
		const resolveNationColor = (otherTag: string): string => {
			if (isRebelTag(otherTag)) return "#020617"
			const ref = earthHistory.nationReference?.get(otherTag)
			return ref
				? COLOR.rgb01ToCss([
						ref.color[0] / 255,
						ref.color[1] / 255,
						ref.color[2] / 255,
					])
				: COLOR.rgb01ToCss([0.5, 0.5, 0.5])
		}
		const nationMention = (otherTag: string) =>
			isRebelTag(otherTag)
				? {
						tag: otherTag,
						name: "Rebels",
						color: "#020617",
						link: false,
					}
				: {
						tag: otherTag,
						name: resolveNationName(otherTag),
						color: resolveNationColor(otherTag),
					}
		const provinceMention = (
			rawId: string,
			fallbackColor: string,
		): NationTimelineEvent["provinces"][number] | null => {
			const provinceId = earthImportRawIdToCompact?.get(Number(rawId))
			if (provinceId === undefined) return null
			return {
				id: provinceId,
				name:
					earthHistory.provinceMeta?.get(rawId)?.name ?? `Province ${rawId}`,
				color: getProvinceColor(provinceId) ?? fallbackColor,
			}
		}
		// Last-known side per nation across the whole war (matches the
		// existing nation-timeline convention) -- a nation that switched
		// sides mid-war ends up bucketed by whichever side it held last.
		const sideByTag = new Map<string, "attacker" | "defender">()
		for (const event of war.events) sideByTag.set(event.nationTag, event.side)

		const dates = war.events.map((event) => event.date)
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
		if (war.warGoalTag) {
			const target = nationMention(war.warGoalTag)
			stats.push({
				label: "War Goal Target",
				value: "",
				valueAction: (
					<InlineTextButton
						onClick={() => setSelectedWikiNationTag(target.tag)}
					>
						{target.name}
					</InlineTextButton>
				),
			})
		} else if (war.warGoalProvince) {
			const province = provinceMention(war.warGoalProvince, "#94a3b8")
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
		if (war.isRebel) stats.push({ label: "Type", value: "Rebellion" })

		// A nation stays listed under whichever side it last held (sideByTag
		// above), but whether it's actually *in* the war right now depends on
		// the selected date -- find each tag's most recent join/leave at or
		// before that date and check whether it was a join. A tag with no
		// qualifying event yet (hasn't joined) is treated as inactive too.
		const currentDate = earthHistory.selectedDays
		const eventsByTag = new Map<string, RawWarParticipantEvent[]>()
		for (const event of war.events) {
			const list = eventsByTag.get(event.nationTag)
			if (list) list.push(event)
			else eventsByTag.set(event.nationTag, [event])
		}
		const isActiveAtCurrentDate = (nationTag: string): boolean => {
			const events = eventsByTag.get(nationTag)
			if (!events) return false
			let active = false
			for (const event of [...events].sort((a, b) => a.date - b.date)) {
				if (event.date > currentDate) break
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
			nationTag: string,
		): WarWikiData["participants"][number]["nations"][number] => ({
			...nationMention(nationTag),
			active: !dateWithinWar || isActiveAtCurrentDate(nationTag),
		})

		const sideOrder: Array<"attacker" | "defender"> = ["attacker", "defender"]
		const participants: WarWikiData["participants"] = sideOrder.map((side) => ({
			side,
			nations: Array.from(sideByTag.entries())
				.filter(([, tagSide]) => tagSide === side)
				.map(([nationTag]) => nationTag)
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
		const eventGroups = new Map<string, RawWarParticipantEvent[]>()
		for (const event of war.events) {
			const key = `${event.date}:${event.kind}`
			const group = eventGroups.get(key)
			if (group) group.push(event)
			else eventGroups.set(key, [event])
		}
		for (const [key, group] of eventGroups) {
			const date = group[0].date
			const kind = group[0].kind
			const comment = group.find((event) => event.comment)?.comment
			const attackerTags = group
				.filter((event) => event.side === "attacker")
				.map((event) => event.nationTag)
			const defenderTags = group
				.filter((event) => event.side === "defender")
				.map((event) => event.nationTag)
			const nations: NationTimelineEvent["nations"] = []
			for (const nationTag of [...attackerTags, ...defenderTags]) {
				if (!nations.some((entry) => entry.tag === nationTag))
					nations.push(nationMention(nationTag))
			}
			let description: string
			if (kind === "warStart") {
				const attackerNames = attackerTags.map(resolveNationName)
				const defenderNames = defenderTags.map(resolveNationName)
				if (attackerNames.length > 0 && defenderNames.length > 0) {
					description = `${joinWithAnd(attackerNames)} entered the war against ${joinWithAnd(defenderNames)}.`
				} else {
					const joiningSide = attackerNames.length > 0 ? "attacker" : "defender"
					const joiningTags =
						attackerNames.length > 0 ? attackerTags : defenderTags
					const joiningNames =
						attackerNames.length > 0 ? attackerNames : defenderNames
					const opponentTags = Array.from(sideByTag.entries())
						.filter(
							([opponentTag, side]) =>
								side !== joiningSide && !joiningTags.includes(opponentTag),
						)
						.map(([opponentTag]) => opponentTag)
					for (const opponentTag of opponentTags) {
						if (!nations.some((entry) => entry.tag === opponentTag))
							nations.push(nationMention(opponentTag))
					}
					const opponentNames = opponentTags.map(resolveNationName)
					description = `${joinWithAnd(joiningNames)} entered the war${opponentNames.length > 0 ? ` against ${joinWithAnd(opponentNames)}` : ""}.`
				}
			} else {
				const names = [...attackerTags, ...defenderTags].map(resolveNationName)
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
			const province = battle.locationProvinceId
				? provinceMention(battle.locationProvinceId, "#94a3b8")
				: null
			const winner = battle.attackerWon ? battle.attacker : battle.defender
			const loser = battle.attackerWon ? battle.defender : battle.attacker
			const description = `${resolveNationName(winner.country)} defeated ${resolveNationName(loser.country)} at the Battle of ${battle.name}.`
			pushTimelineEvent(timelineEvents, {
				id: `warBattle:${battle.date}:${index}`,
				date: battle.date,
				type: "Battle",
				description,
				comment: eventComment(battle.comment),
				nations: [
					nationMention(battle.attacker.country),
					nationMention(battle.defender.country),
				],
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
				owner: string
				nextOwner: string
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
				controller: string
				nextController: string
				provinces: NationTimelineEvent["provinces"]
			}
		>()
		for (const [rawId, entry] of Object.entries(
			earthHistory.engine.data.provinceEvents,
		)) {
			let owner = normalizeTimelineTag(entry.base.owner)
			let controller = normalizeTimelineTag(entry.base.controller)
			for (const event of entry.events) {
				if (event.kind === "owner") {
					const nextOwner = normalizeTimelineTag(event.payload.tag)
					if (
						event.date >= dateRangeStart &&
						event.date <= dateRangeEnd &&
						owner &&
						nextOwner &&
						owner !== nextOwner &&
						sideByTag.has(owner) &&
						sideByTag.has(nextOwner)
					) {
						const province = provinceMention(rawId, "#94a3b8")
						if (province) {
							const key = `${event.date}:${owner}:${nextOwner}`
							const group = territoryGroups.get(key)
							if (group) group.provinces.push(province)
							else
								territoryGroups.set(key, {
									date: event.date,
									owner,
									nextOwner,
									provinces: [province],
								})
						}
					}
					owner = nextOwner
				} else if (event.kind === "controller") {
					const nextController = normalizeTimelineTag(event.payload.tag)
					if (
						event.date >= dateRangeStart &&
						event.date <= dateRangeEnd &&
						controller &&
						nextController &&
						controller !== nextController &&
						sideByTag.has(controller) &&
						sideByTag.has(nextController)
					) {
						const province = provinceMention(rawId, "#94a3b8")
						if (province) {
							const key = `${event.date}:${controller}:${nextController}`
							const group = controlGroups.get(key)
							if (group) group.provinces.push(province)
							else
								controlGroups.set(key, {
									date: event.date,
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
			id: war.warId,
			name: war.name,
			planetTitle: planetName,
			dateRangeLabel,
			stats,
			participants,
			timelineEvents,
			dateRangeStart,
			dateRangeEnd,
			currentDate: earthHistory.selectedDays,
			currentDateLabel: DATE.formatHistoryDays(earthHistory.selectedDays),
			onBack: () => setSelectedWikiWarId(null),
			onSelectNation: (targetTag: string) => {
				setSelectedWikiNationTag(targetTag)
			},
			onSelectProvince: (provinceId: number) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			onSelectDate: earthHistory.setSelectedDays,
			onSelectOrganization: (orgId: string) => {
				setSelectedWikiOrganizationId(orgId)
			},
		}
	}, [
		selectedWikiWarId,
		world,
		earthHistory.query,
		earthHistory.engine,
		earthHistory.nationReference,
		earthHistory.provinceMeta,
		earthHistory.selectedDays,
		earthHistory.setSelectedDays,
		earthImportRawIdToCompact,
		getProvinceColor,
		planetName,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
	])
}
