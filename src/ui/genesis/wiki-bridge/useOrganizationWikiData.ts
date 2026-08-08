import { useMemo } from "react"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { COLOR } from "@/model/history/earth/color"
import { DATE } from "@/model/history/earth/date"
import { FOLD } from "@/model/history/earth/fold"
import { ORGANIZATION_CATEGORIES } from "@/model/history/earth/organization-categories"
import type { OrgProvinceCategory } from "@/model/history/earth/organization-categories/types"
import {
	nationFocusDistanceScale,
	SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
} from "@/ui/genesis/renderer/focus"
import { climateZoneColor } from "@/ui/genesis/shared/colors/misc"
import { vegetationColor } from "@/ui/genesis/shared/colors/vegetation"
import { getTopographyColor } from "@/ui/genesis/shared/region-colors/palette"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { OrganizationWikiDataInput } from "@/ui/genesis/view/types"
import {
	isRebelTag,
	normalizeTimelineTag,
	pushTimelineEvent,
	rgb255ToCss,
} from "@/ui/wiki/nation/timeline-formatting"
import type { OrganizationWikiData } from "@/ui/wiki/organization/OrganizationWikiPage"
import type {
	WikiTimelineEvent as NationTimelineEvent,
	WikiCountHistoryPoint,
} from "@/ui/wiki/shared/WikiTimeline"
import {
	buildDistributionForRegions,
	buildStringIdDistributionForProvinces,
} from "@/ui/wiki/stats/nation/nation-distributions"
import { buildOrganizationWikiStats } from "@/ui/wiki/stats/organization/organization-stats"

/**
 * Builds the international-organization wiki page (HRE, Hanseatic League, ...)
 * for Earth-imported worlds. Mutually exclusive with the nation and war wiki
 * pages -- see useWikiSelection.
 */
export function useOrganizationWikiData(
	input: OrganizationWikiDataInput,
): OrganizationWikiData | null {
	const {
		selectedWikiOrganizationId,
		world,
		worldForDisplay,
		earthHistory,
		earthImportRawIdToCompact,
		showObservedDistributions,
		planetName,
		getProvinceColor,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		buildOrgCategorizer,
		sceneRef,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<OrganizationWikiData | null>(() => {
		if (
			!selectedWikiOrganizationId ||
			!world?.isEarthImport ||
			!earthHistory.engine ||
			!earthHistory.query ||
			!worldForDisplay
		)
			return null
		const orgId = selectedWikiOrganizationId
		const orgRef = earthHistory.organizationReference?.get(orgId)
		if (!orgRef) return null
		const engine = earthHistory.engine
		const { frame, state } = earthHistory.query
		const focusOrgNation = (targetTag: string) => {
			const targetId = frame.nationIds.get(targetTag)
			const seedProvince =
				targetId !== undefined ? frame.seeds[targetId] : undefined
			if (seedProvince === undefined || seedProvince < 0) return
			let targetProvinceCount = 0
			for (const assigned of frame.assignment) {
				if (assigned === targetId) targetProvinceCount++
			}
			sceneRef.current?.focusOnProvince(seedProvince, {
				distanceScale: nationFocusDistanceScale(targetProvinceCount),
				pulseTarget: "nation",
			})
		}
		const resolveNationName = (otherTag: string): string =>
			isRebelTag(otherTag)
				? "Rebels"
				: (state.nations.get(otherTag)?.currentName ??
					earthHistory.nationReference?.get(otherTag)?.name ??
					otherTag)
		const resolveNationColor = (otherTag: string): string => {
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
		const color = COLOR.rgb01ToCss([
			orgRef.color[0] / 255,
			orgRef.color[1] / 255,
			orgRef.color[2] / 255,
		])
		const orgMention = { id: orgId, name: orgRef.name, color }
		const mentionForRole = (categoryId?: string): typeof orgMention => {
			const category = categoryId
				? ORGANIZATION_CATEGORIES.orgCategorySchemas[orgId]?.categories.find(
						(c) => c.id === categoryId,
					)
				: undefined
			if (!category) return orgMention
			const categoryColor = category.color
				? COLOR.rgb01ToCss([
						category.color[0] / 255,
						category.color[1] / 255,
						category.color[2] / 255,
					])
				: color
			return {
				id: orgId,
				name: category.factionLabel ?? orgRef.name,
				color: categoryColor,
			}
		}
		const provinceMention = (
			rawId: string,
		): NationTimelineEvent["provinces"][number] | null => {
			const provinceId = earthImportRawIdToCompact?.get(Number(rawId))
			if (provinceId === undefined) return null
			return {
				id: provinceId,
				name:
					earthHistory.provinceMeta?.get(rawId)?.name ?? `Province ${rawId}`,
				color: getProvinceColor(provinceId) ?? color,
			}
		}

		const timelineEvents: NationTimelineEvent[] = []
		if (orgId === "HRE") {
			// Leadership tracked via emperorStart/End diplomacy events (secondTag
			// "HLR") rather than organizations.json, which only covers HSA.
			// Every province's own hre join/leave history, not filtered to any
			// single nation -- owner is tracked while walking each province's
			// events chronologically so the mention can name who held it.
			for (const [rawId, entry] of Object.entries(engine.data.provinceEvents)) {
				let owner = normalizeTimelineTag(entry.base.owner)
				for (const [index, event] of entry.events.entries()) {
					if (event.kind === "owner") {
						owner = normalizeTimelineTag(
							event.payload.tag as string | undefined,
						)
						continue
					}
					if (event.kind !== "hre") continue
					const joined = Boolean(event.payload.member)
					const province = provinceMention(rawId)
					pushTimelineEvent(timelineEvents, {
						id: `hre:${rawId}:${event.date}:${index}`,
						date: event.date,
						type: joined ? "HRE (+)" : "HRE (-)",
						description: joined
							? `${province?.name ?? `Province ${rawId}`} joined the Holy Roman Empire.`
							: `${province?.name ?? `Province ${rawId}`} left the Holy Roman Empire.`,
						nations: owner ? [nationMention(owner)] : [],
						provinces: province ? [province] : [],
						organizations: [orgMention],
					})
				}
			}
			for (const [index, e] of engine.data.diplomacy.entries()) {
				if (
					(e.kind !== "emperorStart" && e.kind !== "emperorEnd") ||
					e.payload.secondTag !== "HLR"
				)
					continue
				const starts = e.kind === "emperorStart"
				const emperorName = resolveNationName(e.payload.firstTag)
				pushTimelineEvent(timelineEvents, {
					id: `emperor:${e.date}:${index}`,
					date: e.date,
					type: starts ? "Emperor (+)" : "Emperor (-)",
					description: starts
						? `${emperorName} became Emperor of the Holy Roman Empire.`
						: `${emperorName}'s reign as Emperor of the Holy Roman Empire ended.`,
					nations: [nationMention(e.payload.firstTag)],
					organizations: [orgMention],
				})
			}
			for (const [tag, entry] of Object.entries(engine.data.nationEvents)) {
				for (const [index, event] of entry.events.entries()) {
					if (event.kind !== "elector") continue
					const elected = Boolean(event.payload.elector)
					const nationName = resolveNationName(tag)
					pushTimelineEvent(timelineEvents, {
						id: `elector:${tag}:${event.date}:${index}`,
						date: event.date,
						type: elected ? "Elector (+)" : "Elector (-)",
						description: elected
							? `${nationName} became an Elector in the Holy Roman Empire.`
							: `${nationName} ceased to be an Elector in the Holy Roman Empire.`,
						nations: [nationMention(tag)],
						organizations: [orgMention],
					})
				}
			}
		} else {
			for (const [index, e] of engine.data.organizationEvents.entries()) {
				if (e.payload.orgId !== orgId) continue
				if (e.kind === "siteStart" || e.kind === "siteEnd") {
					const started = e.kind === "siteStart"
					const province = provinceMention(e.provinceId)
					if (e.payload.role === "member_seat") {
						const siteDescription = province
							? `${e.payload.name} ${started ? "became" : "ceased to be"} a member seat of the ${orgRef.name} in ${province.name}.`
							: `${e.payload.name} ${started ? "became" : "ceased to be"} a member seat of the ${orgRef.name}.`
						pushTimelineEvent(timelineEvents, {
							id: `organization-site:${orgId}:${e.provinceId}:${e.date}:${index}`,
							date: e.date,
							type: started ? "Organization (+)" : "Organization (-)",
							description: siteDescription,
							provinces: province ? [province] : [],
							organizations: [orgMention],
						})
						continue
					}
					// "kontor" is the historical/EU4 term for a Hanseatic trading
					// post -- displayed as "trade post" to match the org-categories
					// naming (organization-categories.ts's tradePost category)
					// rather than the raw EU4 role id.
					const roleLabel =
						e.payload.role === "kontor"
							? "trade post"
							: e.payload.role.replace(/_/g, " ")
					const siteDescription = province
						? `${e.payload.name} ${started ? "opened" : "closed"} as a ${roleLabel} of the ${orgRef.name} in ${province.name}.`
						: `${e.payload.name} ${started ? "opened" : "closed"} as a ${roleLabel} of the ${orgRef.name}.`
					pushTimelineEvent(timelineEvents, {
						id: `organization-site:${orgId}:${e.provinceId}:${e.date}:${index}`,
						date: e.date,
						type: started ? "Organization (+)" : "Organization (-)",
						description: siteDescription,
						provinces: province ? [province] : [],
						organizations: [orgMention],
					})
					continue
				}
				if (e.kind === "join" || e.kind === "leave") {
					const joined = e.kind === "join"
					const nationName = resolveNationName(e.nationTag)
					const mention = mentionForRole(e.payload.role)
					pushTimelineEvent(timelineEvents, {
						id: `organization:${orgId}:${e.date}:${index}`,
						date: e.date,
						type: joined ? "Organization (+)" : "Organization (-)",
						description: joined
							? `${nationName} joined the ${mention.name}.`
							: `${nationName} left the ${mention.name}.`,
						nations: [nationMention(e.nationTag)],
						organizations: [mention],
					})
				}
			}
		}
		timelineEvents.sort(
			(a, b) => a.date - b.date || a.type.localeCompare(b.type),
		)
		// Nation-level membership, generic across every org: derived straight
		// from the org's own category schema (organization-categories.ts) via
		// listOrgMembers, rather than bespoke per-org membership/foreign-holder
		// logic -- adding a new org or member type (e.g. HSA's trade posts) is
		// then just a data entry in that schema, not new branches here.
		const orgCategorizers = buildOrgCategorizer(state, orgRef)
		const memberCategories: Map<string, OrgProvinceCategory> = (() => {
			if (!orgCategorizers) {
				return new Map(
					Array.from(state.nations.entries())
						.filter(([, nation]) => nation.organizations.has(orgId))
						.map(([tag]) => [tag, { categoryId: "member", striped: false }]),
				)
			}
			if (orgId !== "HSA") {
				return ORGANIZATION_CATEGORIES.listOrgMembers({
					state,
					categorize: orgCategorizers.categorize,
				})
			}
			const categories = new Map<string, OrgProvinceCategory>()
			for (const site of state.organizationSites.values()) {
				if (
					site.orgId !== orgId ||
					(site.role !== "kontor" && site.role !== "trade_branch")
				)
					continue
				const owner = state.provinces.get(site.provinceId)?.owner
				if (owner)
					categories.set(owner, { categoryId: "tradePost", striped: true })
			}
			for (const [tag, nation] of state.nations) {
				if (nation.organizations.has(orgId)) {
					categories.set(tag, { categoryId: "member", striped: false })
				}
			}
			return categories
		})()
		const categoryLabelById = new Map(
			ORGANIZATION_CATEGORIES.orgCategorySchemas[orgId]?.categories.map(
				(c) => [c.id, c] as const,
			),
		)
		const categoryOrderById = new Map(
			ORGANIZATION_CATEGORIES.orgCategorySchemas[orgId]?.categories.map(
				(c, i) => [c.id, i] as const,
			),
		)
		const members = Array.from(memberCategories.entries())
			.map(([memberTag, memberCategory]) => {
				const categoryDef = categoryLabelById.get(memberCategory.categoryId)
				return {
					...nationMention(memberTag),
					striped: memberCategory.striped,
					category: categoryDef
						? {
								label: categoryDef.label,
								color: rgb255ToCss(categoryDef.color ?? orgRef.color),
								order: categoryOrderById.get(memberCategory.categoryId) ?? 0,
								striped: memberCategory.striped,
							}
						: undefined,
				}
			})
			.sort((a, b) => a.name.localeCompare(b.name))

		// Member-territory province count over time -- recomputed with a fresh
		// full fold at each transition date (see collectOrgMemberProvinceRawIds)
		// since, unlike a nation's own owned-province count, this can't be
		// tracked incrementally from the timeline events above alone (HSA
		// territory changes with member nations' wars, not just membership).
		const transitionDates = Array.from(
			new Set(timelineEvents.map((event) => event.date)),
		).sort((a, b) => a - b)
		const countHistory: WikiCountHistoryPoint[] = transitionDates.map(
			(date) => {
				const foldedAtDate = FOLD.fold({
					data: engine.data,
					time: date,
					options: {
						provinceIds: engine.cache.provinceIds,
						nationTags: engine.cache.nationTags,
					},
				})
				return {
					date,
					count: FOLD.collectOrgMemberProvinceRawIds({
						state: foldedAtDate,
						orgId,
					}).size,
				}
			},
		)
		if (
			countHistory.length === 0 ||
			countHistory[0].date > earthHistory.minDays
		) {
			countHistory.unshift({
				date: earthHistory.minDays,
				count: FOLD.collectOrgMemberProvinceRawIds({
					state: FOLD.fold({
						data: engine.data,
						time: earthHistory.minDays,
						options: {
							provinceIds: engine.cache.provinceIds,
							nationTags: engine.cache.nationTags,
						},
					}),
					orgId,
				}).size,
			})
		}

		// Current member territory, for the stat block and Environmental/
		// Demographics distributions -- the exact same province set the map's
		// striped border draws, so the numbers always agree with what's shown.
		const memberProvinceRawIds = FOLD.collectOrgMemberProvinceRawIds({
			state,
			orgId,
		})
		const provinceIndexes: number[] = []
		for (const rawId of memberProvinceRawIds) {
			const compact = earthImportRawIdToCompact?.get(rawId)
			if (compact !== undefined) provinceIndexes.push(compact)
		}
		const ownedProvinceIndexes = new Set(provinceIndexes)
		const regionIndexes: number[] = []
		const regionProvince = world.provinces?.regionProvince
		if (regionProvince) {
			for (let region = 0; region < regionProvince.length; region++) {
				if (ownedProvinceIndexes.has(regionProvince[region])) {
					regionIndexes.push(region)
				}
			}
		}
		const areaKm2 = worldForDisplay.provinces?.areaKm2
		const totalAreaKm2 = areaKm2
			? provinceIndexes.reduce((sum, p) => sum + (areaKm2[p] ?? 0), 0)
			: 0
		const realPopulation = worldForDisplay.realPopulation?.population
		const totalPopulation = realPopulation
			? provinceIndexes.reduce((sum, p) => sum + (realPopulation[p] ?? 0), 0)
			: 0
		const stats = buildOrganizationWikiStats({
			totalAreaKm2,
			totalPopulation,
			provinceCount: provinceIndexes.length,
		})

		const cultureDistribution = buildStringIdDistributionForProvinces({
			idByProvince: frame.cultureByProvince,
			provinceIndexes,
			nameById: earthHistory.cultureNameById ?? undefined,
			colorById: earthHistory.cultureColorById ?? undefined,
			rgbToCss,
			fallbackColor: "rgb(148, 163, 184)",
		})
		const religionDistribution = buildStringIdDistributionForProvinces({
			idByProvince: frame.religionByProvince,
			provinceIndexes,
			nameById: earthHistory.religionNameById ?? undefined,
			colorById: earthHistory.religionColorById ?? undefined,
			rgbToCss,
			fallbackColor: "rgb(148, 163, 184)",
		})
		// "Observed" sources the real-Earth-derived realClimateZones/
		// realVegetation arrays instead of the model's own climateZones/
		// vegetation -- same category scheme and bucketer either way, so this
		// tracks the Model/Observed radio the map overlay uses rather than
		// falling back to the EU5 game's coarser per-province preset
		// categories.
		const climateDistribution = buildDistributionForRegions(
			VEGETATION.climateLabels,
			showObservedDistributions ? world.realClimateZones : world.climateZones,
			regionIndexes,
			(index) => rgbToCss(climateZoneColor(index)),
			new Set([0]),
		)
		const vegetationDistribution = buildDistributionForRegions(
			VEGETATION.biomeLabels,
			showObservedDistributions ? world.realVegetation : world.vegetation,
			regionIndexes,
			(index) => rgbToCss(vegetationColor(index)),
			new Set([0]),
		)
		const topographyDistribution = buildDistributionForRegions(
			CLASSIFICATION.genesisTopographyLabels,
			world.topography,
			regionIndexes,
			(index) => {
				const topoColor = getTopographyColor(index)
				return topoColor ? rgbToCss(topoColor) : "rgb(148, 163, 184)"
			},
			new Set([CLASSIFICATION.topoLake, CLASSIFICATION.topoOcean]),
		)

		return {
			id: orgId,
			name: orgRef.name,
			color,
			planetTitle: planetName,
			stats,
			members,
			cultureDistribution,
			religionDistribution,
			climateDistribution,
			vegetationDistribution,
			topographyDistribution,
			showObservedDistributions,
			countHistory,
			dateRangeStart: earthHistory.minDays,
			dateRangeEnd: earthHistory.maxDays,
			currentDate: earthHistory.selectedDays,
			currentDateLabel: DATE.formatHistoryDays(earthHistory.selectedDays),
			timelineEvents,
			onBack: () => setSelectedWikiOrganizationId(null),
			onSelectNation: (targetTag: string) => {
				focusOrgNation(targetTag)
				setSelectedWikiNationTag(targetTag)
			},
			onSelectProvince: (provinceId: number) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			onSelectDate: earthHistory.setSelectedDays,
			onSelectWar: (warId: string) => {
				setSelectedWikiWarId(warId)
			},
		}
	}, [
		selectedWikiOrganizationId,
		world,
		earthHistory.query,
		earthHistory.engine,
		earthHistory.selectedDays,
		earthHistory.setSelectedDays,
		earthHistory.minDays,
		earthHistory.maxDays,
		earthHistory.nationReference,
		earthHistory.organizationReference,
		earthHistory.cultureNameById,
		earthHistory.cultureColorById,
		earthHistory.religionNameById,
		earthHistory.religionColorById,
		earthHistory.provinceMeta,
		earthImportRawIdToCompact,
		worldForDisplay,
		showObservedDistributions,
		planetName,
		getProvinceColor,
		setSelectedWikiNationTag,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		buildOrgCategorizer,
	])
}
