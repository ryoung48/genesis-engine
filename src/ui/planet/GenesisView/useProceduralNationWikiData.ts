import { useMemo } from "react"
import { DATE } from "@/model/history/earth/date"
import { HISTORY_DAYS } from "@/model/history/generated/history-days"
import { STATE } from "@/model/history/generated/state"
import type { ProceduralNationWikiDataInput } from "@/ui/planet/GenesisView/types"
import { SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE } from "@/ui/planet/renderer/focus"
import { eventInvolvesNation } from "@/ui/wiki/nation/event-description"
import type { NationWikiData } from "@/ui/wiki/nation/NationWikiPage"
import { buildProceduralWikiTimelineEvent } from "@/ui/wiki/nation/procedural-timeline-event"
import { buildNationWikiStats } from "@/ui/wiki/stats/nation/nation-stats"

/**
 * Nation wiki page for procedural (non-Earth-import) worlds -- mirrors
 * useNationWikiData but sourced from buildSelectedNationDetails rather than
 * the Earth-history fold engine. Procedural nations have no diplomatic-tie
 * data wired up yet, so dependencies/organizations/environmental
 * distributions stay empty until src/model/history is wired into generation.
 */
export function useProceduralNationWikiData(
	input: ProceduralNationWikiDataInput,
): NationWikiData | null {
	const {
		world,
		selectedNation,
		planetName,
		proceduralHistoryTimeMs,
		proceduralHistoryEventsRef,
		proceduralProvinceHistoryRef,
		getNationName,
		getNationColor,
		setSelectedNationId,
		onSelectNation,
		sceneRef,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<NationWikiData | null>(() => {
		if (world?.isEarthImport || !selectedNation) return null
		const stats = buildNationWikiStats({
			totalAreaKm2: 0,
			totalPopulation: selectedNation.totalPopulation,
			totalUrbanPopulation: 0,
			provinceCount: selectedNation.provinceCount,
			governmentLabel: selectedNation.governmentType,
		})
		const nationId = selectedNation.id
		const currentDate = HISTORY_DAYS.historyMsToDays(proceduralHistoryTimeMs)
		const allEvents = proceduralHistoryEventsRef.current
		const timelineEvents = allEvents
			.filter((event) => eventInvolvesNation(event, nationId))
			.map((event, index) =>
				buildProceduralWikiTimelineEvent({
					event,
					viewingNation: nationId,
					pastEvents: allEvents,
					getNationName,
					getNationColor,
					index,
				}),
			)
		return {
			title: selectedNation.name,
			color: selectedNation.color ?? "rgb(148, 163, 184)",
			planetTitle: planetName,
			stats,
			dependencies: [],
			organizations: [],
			cultureDistribution: selectedNation.cultureDistribution,
			religionDistribution: selectedNation.religionDistribution,
			climateDistribution: [],
			topographyDistribution: [],
			vegetationDistribution: [],
			showObservedDistributions: false,
			provinceHistory: proceduralProvinceHistoryRef.current.get(nationId) ?? [],
			dateRangeStart: HISTORY_DAYS.historyMsToDays(800 * STATE.yearMs),
			dateRangeEnd: currentDate,
			currentDate,
			currentDateLabel: DATE.formatHistoryDays(currentDate),
			timelineEvents,
			onBack: () => setSelectedNationId(null),
			onFocusNation: () => {
				if (selectedNation.id >= 0)
					sceneRef.current?.focusOnNation(selectedNation.id)
			},
			onSelectNation: (tag: string) => onSelectNation(Number(tag)),
			onSelectProvince: (provinceId: number) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			// Procedural nations have no stored past frames to scrub to (see
			// PROCEDURAL-HISTORY-PLAN.md's live-play design) and no orgs/wars yet.
			onSelectDate: () => {
				/* no-op: no scrubbable timeline */
			},
			onSelectOrganization: () => {
				/* no-op: no organizations */
			},
			onSelectWar: () => {
				/* no-op: no wars */
			},
		}
	}, [
		world?.isEarthImport,
		selectedNation,
		planetName,
		onSelectNation,
		proceduralHistoryTimeMs,
		getNationName,
		getNationColor,
	])
}
