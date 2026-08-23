import { useMemo } from "react"
import { DATE } from "@/model/history/earth/date"
import { HISTORY_DAYS } from "@/model/history/generated/history-days"
import { STATE } from "@/model/history/generated/state"
import { SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE } from "@/ui/genesis/renderer/focus"
import type { ProceduralNationWikiDataInput } from "@/ui/genesis/view/types"
import { eventInvolvesNation } from "@/ui/wiki/nation/event-description"
import type { NationWikiData } from "@/ui/wiki/nation/NationWikiPage"
import { buildProceduralWikiTimelineEvent } from "@/ui/wiki/nation/procedural-timeline-event"
import { buildNationWikiStats } from "@/ui/wiki/stats/nation/nation-stats"

/**
 * Nation wiki page for procedural (non-Earth-import) worlds -- mirrors
 * useNationWikiData but sourced from buildSelectedNationDetails rather than
 * the Earth-history fold engine. Procedural nations have no diplomatic-tie
 * (dependencies) data wired up yet; organizations are populated from
 * GenesisNationHierarchy.organizations (see src/model/society/organizations)
 * when the nation belongs to one, e.g. an Imperial Patchwork.
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
		setSelectedWikiOrganizationId,
		onSelectNation,
		sceneRef,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<NationWikiData | null>(() => {
		if (world?.isEarthImport || !selectedNation) return null
		// Procedural worlds carry no per-province areaKm2 (that's an
		// Earth-import-only field -- see attachEarthProvinceAreas / planet-stats'
		// avgProvinceAreaKm2 comment), so approximate the same way the world
		// panel does: total land area / province count, scaled by this nation's
		// province share.
		let totalAreaKm2 = 0
		const radiusKm = world?.params?.planetRadiusKm
		if (world?.elevation && world.provinces?.count && radiusKm) {
			let landCells = 0
			for (let i = 0; i < world.elevation.length; i++) {
				if (world.elevation[i] > 0) landCells++
			}
			const landPercent = landCells / Math.max(1, world.elevation.length)
			const surfaceAreaKm2 = 4 * Math.PI * radiusKm * radiusKm
			const landAreaKm2 = surfaceAreaKm2 * landPercent
			const avgProvinceAreaKm2 = landAreaKm2 / world.provinces.count
			totalAreaKm2 = avgProvinceAreaKm2 * selectedNation.provinceCount
		}
		const stats = buildNationWikiStats({
			totalAreaKm2,
			totalPopulation: selectedNation.totalPopulation,
			totalUrbanPopulation: 0,
			provinceCount: selectedNation.provinceCount,
			governmentSubtype: selectedNation.governmentType,
			governmentColor: selectedNation.governmentColor,
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
			organizations: selectedNation.organizations,
			cultureDistribution: selectedNation.cultureDistribution,
			religionDistribution: selectedNation.religionDistribution,
			climateDistribution: selectedNation.climateDistribution,
			topographyDistribution: selectedNation.topographyDistribution,
			vegetationDistribution: selectedNation.vegetationDistribution,
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
			// PROCEDURAL-HISTORY-PLAN.md's live-play design) and no wars yet.
			onSelectDate: () => {
				/* no-op: no scrubbable timeline */
			},
			onSelectOrganization: (orgId: string) => {
				setSelectedWikiOrganizationId(orgId)
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
