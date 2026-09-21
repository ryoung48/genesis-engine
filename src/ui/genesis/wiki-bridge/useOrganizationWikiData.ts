import { useMemo } from "react"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { COLOR } from "@/model/history/earth/color"
import { DATE } from "@/model/history/earth/date"
import { ORGANIZATION_CATEGORIES } from "@/model/history/earth/organization-categories"
import type { OrgProvinceCategory } from "@/model/history/earth/organization-categories/types"
import { HISTORY } from "@/model/history/record"
import { FRAME } from "@/model/history/world-frame"
import {
	nationFocusDistanceScale,
	SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
} from "@/ui/genesis/renderer/focus"
import { climateZoneColor } from "@/ui/genesis/shared/colors/misc"
import { vegetationColor } from "@/ui/genesis/shared/colors/vegetation"
import { getProvinceAreaKm2 } from "@/ui/genesis/shared/population-density"
import { getTopographyColor } from "@/ui/genesis/shared/region-colors/palette"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { OrganizationWikiDataInput } from "@/ui/genesis/view/types"
import { WIKI_STACK } from "@/ui/genesis/wiki-stack"
import {
	compareTimelineDateThenWarEnd,
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
		history,
		showObservedDistributions,
		backTitle,
		getProvinceColor,
		openWikiPage,
		backWikiPage,
		buildOrgCategorizer,
		sceneRef,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<OrganizationWikiData | null>(() => {
		if (
			!selectedWikiOrganizationId ||
			!history.state ||
			!history.query ||
			!worldForDisplay
		)
			return null
		const orgId = selectedWikiOrganizationId
		const orgRef = history.organizationReference?.get(orgId)
		if (!orgRef) return null
		const record = history.state.record
		// The WikiTimeline component works in whole days (like the procedural
		// wiki); convert every timeMs value crossing that boundary.
		const daysFromMs = (timeMs: number) => Math.floor(timeMs / 86_400_000)
		const frame = history.query.frame
		const nations = record.nations
		const focusOrgNation = (targetId: number) => {
			const seedProvince = frame.nations.get(targetId)?.capitalProvince ?? -1
			if (seedProvince < 0) return
			let targetProvinceCount = 0
			for (const assigned of frame.provinceNation) {
				if (assigned === targetId) targetProvinceCount++
			}
			sceneRef.current?.focusOnProvince(seedProvince, {
				distanceScale: nationFocusDistanceScale(targetProvinceCount),
				pulseTarget: "nation",
			})
		}
		const resolveNationName = (id: number): string =>
			frame.nations.get(id)?.name ?? nations[id]?.name ?? `nation ${id}`
		const resolveNationColor = (id: number): string => {
			const n = nations[id]
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
			const provinceId = history.state.provinceMap.realIdToCompact.get(rawId)
			if (provinceId === undefined) return null
			return {
				id: provinceId,
				name:
					history.state.provinceMeta[provinceId]?.name ?? `Province ${rawId}`,
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
			for (const [rawId, entry] of record.events.provinceEvents) {
				let owner = entry.base.ownerId
				for (const [index, event] of entry.events.entries()) {
					if (event.kind === "owner") {
						owner = (event.payload.nationId as number | null) ?? null
						continue
					}
					if (event.kind !== "hre") continue
					const joined = Boolean(event.payload.member)
					const province = provinceMention(String(rawId))
					pushTimelineEvent(timelineEvents, {
						id: `hre:${rawId}:${event.timeMs}:${index}`,
						date: daysFromMs(event.timeMs),
						type: joined ? "HRE (+)" : "HRE (-)",
						description: joined
							? `${province?.name ?? `Province ${rawId}`} joined the Holy Roman Empire.`
							: `${province?.name ?? `Province ${rawId}`} left the Holy Roman Empire.`,
						nations: owner !== null ? [nationMention(owner)] : [],
						provinces: province ? [province] : [],
						organizations: [orgMention],
					})
				}
			}
			for (const [index, e] of record.events.diplomacy.entries()) {
				// EU4 emperor events are always "<nation> HLR"; the junior side is
				// the HRE pseudo-tag, so only firstId (the emperor) matters here.
				if (e.kind !== "emperorStart" && e.kind !== "emperorEnd") continue
				const starts = e.kind === "emperorStart"
				const emperorName = resolveNationName(e.firstId)
				pushTimelineEvent(timelineEvents, {
					id: `emperor:${e.timeMs}:${index}`,
					date: daysFromMs(e.timeMs),
					type: starts ? "Emperor (+)" : "Emperor (-)",
					description: starts
						? `${emperorName} became Emperor of the Holy Roman Empire.`
						: `${emperorName}'s reign as Emperor of the Holy Roman Empire ended.`,
					nations: [nationMention(e.firstId)],
					organizations: [orgMention],
				})
			}
			for (const [id, entry] of record.events.nationEvents.entries()) {
				if (!entry) continue
				for (const [index, event] of entry.events.entries()) {
					if (event.kind !== "elector") continue
					const elected = Boolean(event.payload.elector)
					const nationName = resolveNationName(id)
					pushTimelineEvent(timelineEvents, {
						id: `elector:${id}:${event.timeMs}:${index}`,
						date: daysFromMs(event.timeMs),
						type: elected ? "Elector (+)" : "Elector (-)",
						description: elected
							? `${nationName} became an Elector in the Holy Roman Empire.`
							: `${nationName} ceased to be an Elector in the Holy Roman Empire.`,
						nations: [nationMention(id)],
						organizations: [orgMention],
					})
				}
			}
		} else {
			for (const [index, e] of record.events.organizationEvents.entries()) {
				if (e.payload.orgId !== orgId) continue
				if (e.kind === "siteStart" || e.kind === "siteEnd") {
					const started = e.kind === "siteStart"
					const province = provinceMention(String(e.provinceId))
					if (e.payload.role === "member_seat") {
						const siteDescription = province
							? `${e.payload.name} ${started ? "became" : "ceased to be"} a member seat of the ${orgRef.name} in ${province.name}.`
							: `${e.payload.name} ${started ? "became" : "ceased to be"} a member seat of the ${orgRef.name}.`
						pushTimelineEvent(timelineEvents, {
							id: `organization-site:${orgId}:${e.provinceId}:${e.timeMs}:${index}`,
							date: daysFromMs(e.timeMs),
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
						id: `organization-site:${orgId}:${e.provinceId}:${e.timeMs}:${index}`,
						date: daysFromMs(e.timeMs),
						type: started ? "Organization (+)" : "Organization (-)",
						description: siteDescription,
						provinces: province ? [province] : [],
						organizations: [orgMention],
					})
					continue
				}
				if (e.kind === "join" || e.kind === "leave") {
					const joined = e.kind === "join"
					const nationName = resolveNationName(e.nationId)
					const mention = mentionForRole(e.payload.role)
					pushTimelineEvent(timelineEvents, {
						id: `organization:${orgId}:${e.timeMs}:${index}`,
						date: daysFromMs(e.timeMs),
						type: joined ? "Organization (+)" : "Organization (-)",
						description: joined
							? `${nationName} joined the ${mention.name}.`
							: `${nationName} left the ${mention.name}.`,
						nations: [nationMention(e.nationId)],
						organizations: [mention],
					})
				}
			}
		}
		timelineEvents.sort(
			(a, b) =>
				compareTimelineDateThenWarEnd(a, b) || a.type.localeCompare(b.type),
		)
		// Nation-level membership, generic across every org: derived straight
		// from the org's own category schema (organization-categories.ts) via
		// listOrgMembers, rather than bespoke per-org membership/foreign-holder
		// logic -- adding a new org or member type (e.g. HSA's trade posts) is
		// then just a data entry in that schema, not new branches here.
		const orgCategorizers = buildOrgCategorizer(frame, orgRef)
		const memberCategories: Map<number, OrgProvinceCategory> = (() => {
			if (!orgCategorizers) {
				return new Map(
					Array.from(frame.nations.values())
						.filter((nation) =>
							nation.organizations.some(
								(organization) => organization.orgId === orgId,
							),
						)
						.map((nation) => [
							nation.id,
							{ categoryId: "member", striped: false },
						]),
				)
			}
			if (orgId !== "HSA") {
				return ORGANIZATION_CATEGORIES.listOrgMembers({
					frame,
					categorize: orgCategorizers.categorize,
				})
			}
			const categories = new Map<number, OrgProvinceCategory>()
			for (const site of frame.organizations) {
				if (
					site.orgId !== orgId ||
					(site.role !== "kontor" && site.role !== "trade_branch")
				)
					continue
				const owner = frame.provinceNation[site.province]
				if (owner >= 0)
					categories.set(owner, { categoryId: "tradePost", striped: true })
			}
			for (const nation of frame.nations.values()) {
				if (
					nation.organizations.some(
						(organization) => organization.orgId === orgId,
					)
				) {
					categories.set(nation.id, { categoryId: "member", striped: false })
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
			.map(([memberId, memberCategory]) => {
				const categoryDef = categoryLabelById.get(memberCategory.categoryId)
				return {
					...nationMention(memberId),
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
		// frame at each transition date
		// since, unlike a nation's own owned-province count, this can't be
		// tracked incrementally from the timeline events above alone (HSA
		// territory changes with member nations' wars, not just membership).
		const transitionDays = Array.from(
			new Set(timelineEvents.map((event) => event.date)),
		).sort((a, b) => a - b)
		const countHistory: WikiCountHistoryPoint[] = transitionDays.map((day) => ({
			date: day,
			count: FRAME.orgMemberProvinces({
				frame: HISTORY.frameAt({
					state: history.state,
					timeMs: day * 86_400_000,
				}),
				orgId,
			}).size,
		}))
		const minDay = daysFromMs(record.minTimeMs)
		if (countHistory.length === 0 || countHistory[0].date > minDay) {
			countHistory.unshift({
				date: minDay,
				count: FRAME.orgMemberProvinces({
					frame: HISTORY.frameAt({
						state: history.state,
						timeMs: record.minTimeMs,
					}),
					orgId,
				}).size,
			})
		}

		// Current member territory, for the stat block and Environmental/
		// Demographics distributions -- the exact same province set the map's
		// striped border draws, so the numbers always agree with what's shown.
		const memberProvinceIndexes = FRAME.orgMemberProvinces({
			frame,
			orgId,
		})
		const provinceIndexes = [...memberProvinceIndexes]
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
		const totalAreaKm2 = provinceIndexes.reduce(
			(sum, p) => sum + getProvinceAreaKm2(worldForDisplay, p),
			0,
		)
		const realPopulation =
			worldForDisplay.realPopulation?.population ??
			worldForDisplay.population?.population
		const totalPopulation = realPopulation
			? provinceIndexes.reduce((sum, p) => sum + (realPopulation[p] ?? 0), 0)
			: 0
		const stats = buildOrganizationWikiStats({
			totalAreaKm2,
			totalPopulation,
			provinceCount: provinceIndexes.length,
		})

		const cultureDistribution = buildStringIdDistributionForProvinces({
			idByProvince: Array.from(frame.provinceCulture, (id) =>
				id < 0 ? null : (frame.cultures[id]?.key ?? null),
			),
			provinceIndexes,
			nameById: history.cultureNameById ?? undefined,
			colorById: history.cultureColorById ?? undefined,
			rgbToCss,
			fallbackColor: "rgb(148, 163, 184)",
		})
		const religionDistribution = buildStringIdDistributionForProvinces({
			idByProvince: Array.from(frame.provinceReligion, (id) =>
				id < 0 ? null : (frame.religions[id]?.key ?? null),
			),
			provinceIndexes,
			nameById: history.religionNameById ?? undefined,
			colorById: history.religionColorById ?? undefined,
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
			backTitle,
			stats,
			members,
			cultureDistribution,
			religionDistribution,
			climateDistribution,
			vegetationDistribution,
			topographyDistribution,
			showObservedDistributions,
			countHistory,
			dateRangeStart: daysFromMs(record.minTimeMs),
			dateRangeEnd: daysFromMs(record.maxTimeMs),
			currentDate: daysFromMs(frame.timeMs),
			currentDateLabel: DATE.formatHistoryDays(daysFromMs(frame.timeMs)),
			timelineEvents,
			onBack: backWikiPage,
			onSelectNation: (targetTag: string) => {
				const id = Number(targetTag)
				focusOrgNation(id)
				openWikiPage(WIKI_STACK.nationRef({ record, id }))
			},
			onSelectProvince: (provinceId: number) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			onSelectDate: (day: number) =>
				history.setSelectedTimeMs(day * 86_400_000),
			onSelectWar: (warId: number) => {
				openWikiPage(WIKI_STACK.warRef({ record, id: warId }))
			},
		}
	}, [
		selectedWikiOrganizationId,
		world,
		history.query,
		history.state,
		history.selectedTimeMs,
		history.setSelectedTimeMs,
		history.minTimeMs,
		history.maxTimeMs,
		history.organizationReference,
		history.cultureNameById,
		history.cultureColorById,
		history.religionNameById,
		history.religionColorById,
		history.provinceMeta,
		worldForDisplay,
		showObservedDistributions,
		backTitle,
		getProvinceColor,
		openWikiPage,
		backWikiPage,
		buildOrgCategorizer,
	])
}
