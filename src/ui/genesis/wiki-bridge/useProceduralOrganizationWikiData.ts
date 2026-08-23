import { useMemo } from "react"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { TEXT } from "@/model/shared/text"
import {
	ORGANIZATION_TITLE_COLORS,
	ORGANIZATION_TITLE_LABELS,
	ORGANIZATION_TITLE_ORDER,
} from "@/model/society/organizations/titles"
import { RELIGION } from "@/model/society/religion"
import {
	buildPartitionDistribution,
	colorFromPartition,
} from "@/ui/genesis/political/nation-details-model"
import { SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE } from "@/ui/genesis/renderer/focus"
import { climateZoneColor } from "@/ui/genesis/shared/colors/misc"
import { vegetationColor } from "@/ui/genesis/shared/colors/vegetation"
import { getTopographyColor } from "@/ui/genesis/shared/region-colors/palette"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { ProceduralOrganizationWikiDataInput } from "@/ui/genesis/view/types"
import type { OrganizationWikiData } from "@/ui/wiki/organization/OrganizationWikiPage"
import { buildDistributionForRegions } from "@/ui/wiki/stats/nation/nation-distributions"
import { buildOrganizationWikiStats } from "@/ui/wiki/stats/organization/organization-stats"

/**
 * Organization wiki page for procedural (non-Earth-import) worlds -- covers
 * GenesisNationHierarchy.organizations (e.g. an Imperial Patchwork), the
 * procedural counterpart to useOrganizationWikiData's Earth-history version.
 * Procedural organizations have no membership/territory history to scrub
 * (they're carved once at generation time and don't currently change), so
 * the timeline/count-history sections are effectively static -- one point at
 * the current member territory.
 */
export function useProceduralOrganizationWikiData(
	input: ProceduralOrganizationWikiDataInput,
): OrganizationWikiData | null {
	const {
		world,
		selectedWikiOrganizationId,
		planetName,
		getNationName,
		getNationColor,
		getCultureName,
		getHeritageName,
		getOrganizationName,
		setSelectedWikiOrganizationId,
		onSelectNation,
		sceneRef,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene ref arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<OrganizationWikiData | null>(() => {
		if (world?.isEarthImport || !selectedWikiOrganizationId) return null
		if (!world?.nations || !world.provinces) return null
		const org = world.nations.organizations?.find(
			(o) => o.id === selectedWikiOrganizationId,
		)
		if (!org) return null

		const memberByNation = new Map(org.members.map((m) => [m.nationIndex, m]))
		const memberProvinces: number[] = []
		let totalPopulation = 0
		for (let province = 0; province < world.provinces.count; province++) {
			if (!memberByNation.has(world.nations.assignment[province])) continue
			memberProvinces.push(province)
			totalPopulation += world.population?.population[province] ?? 0
		}
		const memberProvinceSet = new Set(memberProvinces)

		const stats = buildOrganizationWikiStats({
			totalAreaKm2: 0,
			totalPopulation,
			provinceCount: memberProvinces.length,
		})

		// Every "nation ID" the rest of the UI understands (selection state,
		// getNationName/getNationColor, focusOnNation) is keyed by capital
		// province index, not member.nationIndex's raw 0..nationCount-1 array
		// index -- see buildDisplayWorld's nations.assignment = sovereign.slice()
		// rewrite. Translate via nations.seeds before handing indices outward.
		const members = org.members
			.map((member) => {
				const capitalProvince = world.nations!.seeds[member.nationIndex]
				return {
					tag: String(capitalProvince),
					name: getNationName(capitalProvince),
					color: getNationColor(capitalProvince) ?? "rgb(148, 163, 184)",
					category: {
						label: ORGANIZATION_TITLE_LABELS[member.title],
						color: rgbToCss(
							ORGANIZATION_TITLE_COLORS[member.title].map((c) => c / 255) as [
								number,
								number,
								number,
							],
						),
						order: ORGANIZATION_TITLE_ORDER[member.title],
					},
				}
			})
			.sort((a, b) => a.name.localeCompare(b.name))

		const cultureDistribution = buildPartitionDistribution({
			provinces: memberProvinces,
			getPartitionId: (province) => world.cultures?.assignment[province] ?? -1,
			getLabel: getCultureName,
			getColor: (id) => colorFromPartition(world.cultures, id),
		})
		const religionDistribution = buildPartitionDistribution({
			provinces: memberProvinces,
			getPartitionId: (province) => {
				const cultureId = world.cultures?.assignment[province] ?? -1
				if (cultureId < 0) return -1
				return world.religions?.assignment[cultureId] ?? -1
			},
			getLabel: (id) => {
				const typeId = world.religionTypes?.[id] ?? -1
				return typeId >= 0
					? (RELIGION.religionTypeNames[typeId] ?? `Religion #${id}`)
					: `Religion #${id}`
			},
			getColor: (id) => {
				const typeId = world.religionTypes?.[id] ?? -1
				if (typeId < 0) return colorFromPartition(world.religions, id)
				const [r, g, b] =
					RELIGION.religionTypeColors[typeId] ?? RELIGION.religionTypeColors[0]
				return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
			},
		})
		const regionIndexes: number[] = []
		const regionProvince = world.provinces.regionProvince
		for (let region = 0; region < regionProvince.length; region++) {
			if (memberProvinceSet.has(regionProvince[region]))
				regionIndexes.push(region)
		}
		const climateDistribution = buildDistributionForRegions(
			VEGETATION.climateLabels,
			world.climateZones,
			regionIndexes,
			(index) => rgbToCss(climateZoneColor(index)),
			new Set([0]),
		)
		const vegetationDistribution = buildDistributionForRegions(
			VEGETATION.biomeLabels,
			world.vegetation,
			regionIndexes,
			(index) => rgbToCss(vegetationColor(index)),
			new Set([0]),
		)
		const topographyDistribution = buildDistributionForRegions(
			CLASSIFICATION.genesisTopographyLabels,
			world.topography,
			regionIndexes,
			(index) => {
				const color = getTopographyColor(index)
				return color ? rgbToCss(color) : "rgb(148, 163, 184)"
			},
			new Set([CLASSIFICATION.topoLake, CLASSIFICATION.topoOcean]),
		)

		return {
			id: org.id,
			name: getOrganizationName(org.id),
			color: rgbToCss(org.color),
			planetTitle: planetName,
			stats,
			members,
			cultureDistribution,
			religionDistribution,
			climateDistribution,
			vegetationDistribution,
			topographyDistribution,
			showObservedDistributions: false,
			// Procedural organizations are carved once at generation time and
			// don't currently track membership/territory changes -- one point at
			// the current member territory, same convention as a
			// no-history nation wiki page.
			countHistory: [{ date: 0, count: memberProvinces.length }],
			dateRangeStart: 0,
			dateRangeEnd: 0,
			currentDate: 0,
			currentDateLabel: TEXT.titleCase(org.kind),
			timelineEvents: [],
			onBack: () => setSelectedWikiOrganizationId(null),
			onSelectNation: (tag: string) => onSelectNation(Number(tag)),
			onSelectProvince: (provinceId: number) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			onSelectDate: () => {
				/* no-op: no scrubbable timeline */
			},
			onSelectWar: () => {
				/* no-op: no wars */
			},
		}
	}, [
		world,
		selectedWikiOrganizationId,
		planetName,
		getNationName,
		getNationColor,
		getCultureName,
		getHeritageName,
		getOrganizationName,
		onSelectNation,
	])
}
