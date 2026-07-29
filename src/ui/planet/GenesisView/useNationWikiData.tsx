import { useMemo } from "react"
import { VEGETATION } from "@/model/climate/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { COLOR } from "@/model/history/earth/color"
import type { RawWarParticipantEvent } from "@/model/history/earth/data-source/types"
import { DATE } from "@/model/history/earth/date"
import { FOLD } from "@/model/history/earth/fold"
import { GOVERNMENT } from "@/model/history/earth/government"
import { ORGANIZATION_CATEGORIES } from "@/model/history/earth/organization-categories"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { ShieldHalfFullIcon } from "@/ui/components/primitives/icons/ShieldHalfFullIcon"
import { SwordCrossIcon } from "@/ui/components/primitives/icons/SwordCrossIcon"
import { Swatch } from "@/ui/components/primitives/Swatch"
import {
	climateZoneColor,
	EU5_CLIMATE_CATEGORIES,
	EU5_CLIMATE_COLORS,
	EU5_VEGETATION_CATEGORIES,
	EU5_VEGETATION_COLORS,
	vegetationColor,
} from "@/ui/planet/colors"
import type { NationWikiDataInput } from "@/ui/planet/GenesisView/types"
import {
	nationFocusDistanceScale,
	SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
} from "@/ui/planet/renderer/focus"
import { getTopographyColor } from "@/ui/planet/screen/display/region-colors"
import { rgbToCss } from "@/ui/planet/screen/shared/ui-format"
import type { NationWikiData } from "@/ui/wiki/nation/NationWikiPage"
import {
	cleanEu4Identifier,
	eventComment,
	formatRebelName,
	formatRulerStatLabel,
	isRebelTag,
	joinWithAnd,
	normalizeTimelineTag,
	paletteColorForDynasty,
	pushTimelineEvent,
	subjectRelationDescription,
	subjectTypeGroupLabel,
	timelineTypeColor,
} from "@/ui/wiki/nation/timeline-formatting"
import type { WikiTimelineEvent as NationTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"
import {
	buildDistributionForRegions,
	buildEu5TopographyDistribution,
	buildStringIdDistributionForProvinces,
} from "@/ui/wiki/stats/nation/nation-distributions"
import { buildNationWikiStats } from "@/ui/wiki/stats/nation/nation-stats"

/**
 * Builds the left-panel nation wiki page for Earth-imported worlds, sourced
 * from the earth-history fold engine at the currently scrubbed date. Returns
 * null for procedural worlds (see useProceduralNationWikiData) and while the
 * engine is still loading.
 */
export function useNationWikiData(
	input: NationWikiDataInput,
): NationWikiData | null {
	const {
		selectedWikiNationTag,
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
		sceneRef,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<NationWikiData | null>(() => {
		if (
			!selectedWikiNationTag ||
			!world?.isEarthImport ||
			!earthHistory.engine ||
			!earthHistory.query ||
			!worldForDisplay
		)
			return null
		const tag = selectedWikiNationTag
		const { frame, state } = earthHistory.query
		const nationId = frame.nationIds.get(tag) ?? -1
		if (nationId < 0) return null

		const provinceIndexes: number[] = []
		const provinceCountByNationTag = new Map<string, number>()
		const tagByNationId = new Map<number, string>()
		for (const [nationTag, id] of frame.nationIds) {
			tagByNationId.set(id, nationTag)
		}
		for (let p = 0; p < frame.assignment.length; p++) {
			const assignedNationId = frame.assignment[p]
			if (assignedNationId === nationId) provinceIndexes.push(p)
			const assignedTag = tagByNationId.get(assignedNationId)
			if (assignedTag) {
				provinceCountByNationTag.set(
					assignedTag,
					(provinceCountByNationTag.get(assignedTag) ?? 0) + 1,
				)
			}
		}
		const hasOwnedProvinces = (otherTag: string): boolean =>
			(provinceCountByNationTag.get(otherTag) ?? 0) > 0
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
		const realUrbanPopulation = worldForDisplay.realUrbanPopulation?.population
		const totalUrbanPopulation = realUrbanPopulation
			? provinceIndexes.reduce(
					(sum, p) => sum + (realUrbanPopulation[p] ?? 0),
					0,
				)
			: 0

		const nationState = state.nations.get(tag)
		const resolveNationName = (otherTag: string): string =>
			isRebelTag(otherTag)
				? "Rebels"
				: (state.nations.get(otherTag)?.currentName ??
					earthHistory.nationReference?.get(otherTag)?.name ??
					frame.names[frame.nationIds.get(otherTag) ?? -1] ??
					otherTag)
		// Matches the actual "nations" map-mode fill exactly (see
		// earth-history-region-colors.ts's buildNationColorByTag) -- real EU4
		// reference color when known, the same neutral gray fallback
		// otherwise. hashColorForKey is a different, hash-based scheme used
		// only for hover swatches when no reference color exists; using it
		// here would make this swatch not match the map.
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
		const title = resolveNationName(tag)
		const color = resolveNationColor(tag)
		const governmentLabel = GOVERNMENT.formatEarthHistoryGovernmentLabel({
			governmentType: nationState?.governmentType ?? null,
			governmentReform: nationState?.governmentReform ?? null,
		})
		const currentRulerPayload =
			earthHistory.engine.data.nationEvents[tag]?.events
				.filter(
					(event) =>
						event.kind === "rulerChange" &&
						event.date <= earthHistory.selectedDays,
				)
				.at(-1)?.payload ?? null
		const rulerLabel = nationState?.ruler
			? formatRulerStatLabel(
					currentRulerPayload,
					nationState.ruler.name,
					earthHistory.selectedDays,
				)
			: null
		const dynastyName =
			(typeof currentRulerPayload?.dynasty === "string"
				? currentRulerPayload.dynasty
				: nationState?.ruler?.dynasty) ?? null
		const activeConflicts = state.activeWars
			.filter((war) => war.attackers.has(tag) || war.defenders.has(tag))
			.map((war) => ({
				warId: war.warId,
				name: war.name,
				side: war.attackers.has(tag)
					? ("attacker" as const)
					: ("defender" as const),
			}))
			.sort((a, b) => a.name.localeCompare(b.name))

		// "Dependency" here covers every cross-nation political tie the Earth
		// engine tracks (fold.ts's FoldedNationState) -- overlord/vassals is
		// the literal subject hierarchy, union/allies/guarantees/marriages aren't strictly
		// dependencies but share the same "line per relation type, links to
		// other nations" shape so they're folded in here too.
		const subjectDependencyGroups = new Map<string, string[]>()
		for (const subjectTag of nationState?.vassals ?? []) {
			if (!hasOwnedProvinces(subjectTag)) continue
			const subjectType =
				nationState?.vassalSubjectTypes.get(subjectTag) ?? "vassal"
			const label = subjectTypeGroupLabel(subjectType)
			const subjects = subjectDependencyGroups.get(label) ?? []
			subjects.push(subjectTag)
			subjectDependencyGroups.set(label, subjects)
		}
		const dependencyGroups: Array<[string, string[]]> = [
			[
				"Overlord",
				nationState?.overlord && hasOwnedProvinces(nationState.overlord)
					? [nationState.overlord]
					: [],
			],
			...subjectDependencyGroups,
			[
				"Union (Senior)",
				nationState?.unionSeniorOf
					? Array.from(nationState.unionSeniorOf).filter(hasOwnedProvinces)
					: [],
			],
			[
				"Union (Junior)",
				nationState?.unionJuniorPartner &&
				hasOwnedProvinces(nationState.unionJuniorPartner)
					? [nationState.unionJuniorPartner]
					: [],
			],
			[
				"Allies",
				nationState?.allies
					? Array.from(nationState.allies).filter(hasOwnedProvinces)
					: [],
			],
			[
				"Guarantees",
				nationState?.guarantees
					? Array.from(nationState.guarantees).filter(hasOwnedProvinces)
					: [],
			],
			[
				"Royal Marriages",
				nationState?.royalMarriages
					? Array.from(nationState.royalMarriages).filter(hasOwnedProvinces)
					: [],
			],
		]
		const dependencies = dependencyGroups
			.map(([label, tags]) => ({
				label,
				nations: tags.map((otherTag) => ({
					tag: otherTag,
					name: resolveNationName(otherTag),
					color: resolveNationColor(otherTag),
				})),
			}))
			.filter((group) => group.nations.length > 0)

		const resolveOrganizationColor = (orgId: string): string => {
			const ref = earthHistory.organizationReference?.get(orgId)
			return ref
				? COLOR.rgb01ToCss([
						ref.color[0] / 255,
						ref.color[1] / 255,
						ref.color[2] / 255,
					])
				: COLOR.rgb01ToCss([0.5, 0.5, 0.5])
		}
		const organizationIds = new Set<string>(nationState?.organizations.keys())
		if (state.hreMemberNations.has(tag)) organizationIds.add("HRE")
		const organizations = Array.from(organizationIds).map((orgId) => {
			// A nation can hold enclave territory of an org without being
			// genuinely "part of" it -- e.g. Venice's Terraferma stayed
			// formally inside the HRE after Venice (never an Imperial Estate)
			// conquered it. Shown as this nation's own color striped with
			// transparent instead of a plain solid swatch, so the wiki
			// doesn't silently overstate membership -- see
			// collectOrgForeignHolderNations.
			const striped = FOLD.collectOrgForeignHolderNations({ state, orgId }).has(
				tag,
			)
			// For orgs whose categories split into rival sides (GG's
			// Guelphs/Ghibellines) rather than just estate/site types, show
			// which side this nation is on instead of the shared org name --
			// see OrgCategory.factionLabel.
			const role = nationState?.organizations.get(orgId)
			const category = role
				? ORGANIZATION_CATEGORIES.orgCategorySchemas[orgId]?.categories.find(
						(c) => c.id === role,
					)
				: undefined
			return {
				id: orgId,
				name:
					category?.factionLabel ??
					earthHistory.organizationReference?.get(orgId)?.name ??
					orgId,
				color: category?.color
					? COLOR.rgb01ToCss([
							category.color[0] / 255,
							category.color[1] / 255,
							category.color[2] / 255,
						])
					: resolveOrganizationColor(orgId),
				striped,
			}
		})

		const stats = buildNationWikiStats({
			totalAreaKm2,
			totalPopulation,
			totalUrbanPopulation,
			provinceCount: provinceIndexes.length,
			rulerLabel,
			governmentLabel,
		})
		const rulerStat = stats.find((stat) => stat.label === "Ruler")
		if (rulerStat && nationState?.ruler) {
			const rulerSuffix = rulerLabel ? `· ${rulerLabel}` : ""
			if (dynastyName) {
				rulerStat.value = ""
				rulerStat.valueAction = (
					<span className="inline-flex items-center gap-1">
						<span>{nationState.ruler.name}</span>
						<Swatch color={paletteColorForDynasty(dynastyName)} />
						<span>{dynastyName}</span>
						{rulerSuffix ? <span>{rulerSuffix}</span> : null}
					</span>
				)
			} else {
				rulerStat.valuePrefix = nationState.ruler.name
				rulerStat.value = rulerSuffix
			}
		}
		if (activeConflicts.length > 0) {
			stats.push({
				label: "Conflicts",
				value: "",
				valueAction: (
					<span className="inline-flex flex-wrap items-center gap-x-1.5">
						{activeConflicts.map((conflict) => {
							const SideIcon =
								conflict.side === "attacker"
									? SwordCrossIcon
									: ShieldHalfFullIcon
							return (
								<span
									key={conflict.warId}
									className="inline-flex items-center gap-0.5"
									title={conflict.side === "attacker" ? "Attacker" : "Defender"}
								>
									<SideIcon className="h-2.5 w-2.5 text-slate-400" />
									<InlineTextButton
										onClick={() => setSelectedWikiWarId(conflict.warId)}
									>
										{conflict.name}
									</InlineTextButton>
								</span>
							)
						})}
					</span>
				),
			})
		}
		const focusNation = (targetTag: string) => {
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

		const eventNation = (otherTag: string, rebelType?: unknown) =>
			isRebelTag(otherTag)
				? {
						tag: otherTag,
						name: formatRebelName(rebelType),
						color: "#020617",
						link: false,
					}
				: {
						tag: otherTag,
						name: resolveNationName(otherTag),
						color: resolveNationColor(otherTag),
					}
		const addNationMention = (
			nations: NationTimelineEvent["nations"],
			otherTag: string | null,
			rebelType?: unknown,
		) => {
			if (
				!otherTag ||
				nations.some(
					(entry) =>
						entry.tag === otherTag &&
						(!isRebelTag(otherTag) ||
							entry.name === formatRebelName(rebelType)),
				)
			)
				return
			nations.push(eventNation(otherTag, rebelType))
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
		const organizationMention = (
			orgId: string,
			categoryId?: string,
		): NationTimelineEvent["organizations"][number] => {
			const ref = earthHistory.organizationReference?.get(orgId)
			const category = categoryId
				? ORGANIZATION_CATEGORIES.orgCategorySchemas[orgId]?.categories.find(
						(c) => c.id === categoryId,
					)
				: undefined
			const color = category?.color ?? ref?.color
			return {
				id: orgId,
				name: category?.factionLabel ?? ref?.name ?? orgId,
				color: color
					? COLOR.rgb01ToCss([color[0] / 255, color[1] / 255, color[2] / 255])
					: COLOR.rgb01ToCss([0.5, 0.5, 0.5]),
			}
		}
		const warMention = (war: {
			warId: string
			name: string
		}): NationTimelineEvent["wars"][number] => ({
			id: war.warId,
			name: war.name,
			color: "#b91c1c",
		})
		// Index every war's participant span once so territory/control-change
		// events below can guess which war (if any) caused them: a transfer
		// between two nations that were both belligerents in some war whose
		// span covers the transfer date is presumed to be that war's doing --
		// same heuristic WarWikiPage's own territory section uses, just run
		// against every war instead of one already-selected war.
		const warSpans = earthHistory.engine.data.wars.map((war) => {
			const sideByTag = new Map<string, "attacker" | "defender">()
			for (const event of war.events) sideByTag.set(event.nationTag, event.side)
			const dates = war.events.map((event) => event.date)
			return {
				war,
				sideByTag,
				dateRangeStart: dates.length > 0 ? Math.min(...dates) : Infinity,
				dateRangeEnd: dates.length > 0 ? Math.max(...dates) : -Infinity,
			}
		})
		const findWarForTransfer = (
			date: number,
			tagA: string,
			tagB: string,
		): { warId: string; name: string } | null => {
			for (const span of warSpans) {
				if (date < span.dateRangeStart || date > span.dateRangeEnd) continue
				if (!span.sideByTag.has(tagA) || !span.sideByTag.has(tagB)) continue
				return span.war
			}
			return null
		}
		const cultureMention = (
			cultureId: string,
		): NationTimelineEvent["cultures"][number] => ({
			id: cultureId,
			name:
				earthHistory.cultureNameById?.get(cultureId) ??
				cultureId.replace(/_/g, " "),
			color: rgbToCss(
				earthHistory.cultureColorById?.get(cultureId) ??
					COLOR.hashColorForKey(`culture:${cultureId}`),
			),
		})
		const religionMention = (
			religionId: string,
		): NationTimelineEvent["religions"][number] => ({
			id: religionId,
			name:
				earthHistory.religionNameById?.get(religionId) ??
				religionId.replace(/_/g, " "),
			color: rgbToCss(
				earthHistory.religionColorById?.get(religionId) ??
					COLOR.hashColorForKey(`religion:${religionId}`),
			),
		})
		const dynastyMention = (
			dynasty: string,
		): NationTimelineEvent["dynasties"][number] => ({
			id: dynasty,
			name: dynasty,
			color: paletteColorForDynasty(dynasty),
		})
		const personDisplay = (payload: Record<string, unknown>) => {
			const name = String(payload.name ?? payload.monarchName ?? "unknown")
			const dynasty =
				typeof payload.dynasty === "string" && payload.dynasty.trim()
					? payload.dynasty
					: null
			return {
				description: dynasty ? `${name} ${dynasty}` : name,
				dynasties: dynasty ? [dynastyMention(dynasty)] : [],
			}
		}
		const mergeById = <T extends { id: string | number }>(items: T[]): T[] => {
			const seen = new Set<string | number>()
			const merged: T[] = []
			for (const item of items) {
				if (seen.has(item.id)) continue
				seen.add(item.id)
				merged.push(item)
			}
			return merged
		}
		const mergeNations = (
			items: NationTimelineEvent["nations"],
		): NationTimelineEvent["nations"] => {
			const seen = new Set<string>()
			const merged: NationTimelineEvent["nations"] = []
			for (const item of items) {
				const key = item.link === false ? `${item.tag}:${item.name}` : item.tag
				if (seen.has(key)) continue
				seen.add(key)
				merged.push(item)
			}
			return merged
		}
		const formatList = (items: string[]): string => {
			if (items.length <= 2) return items.join(" and ")
			return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
		}
		const formatPayloadLabel = (value: unknown): string =>
			typeof value === "string"
				? cleanEu4Identifier(value)
				: value === true
					? "yes"
					: value === false
						? "no"
						: String(value)
		const payloadValue = (
			payload: Record<string, unknown>,
			...keys: string[]
		): unknown => {
			for (const key of keys) {
				if (payload[key] !== undefined) return payload[key]
			}
			return payload.value
		}
		const formatSignedValue = (value: unknown): string =>
			typeof value === "number" && value > 0 ? `+${value}` : String(value)
		const mergeEventComments = (
			events: NationTimelineEvent[],
		): string | undefined => {
			const comments = Array.from(
				new Set(events.map((event) => event.comment).filter(Boolean)),
			)
			return comments.length > 0 ? comments.join(" | ") : undefined
		}
		const escapeRegExp = (value: string): string =>
			value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
		const buildMergedTerritoryDescription = (
			events: NationTimelineEvent[],
		): string => {
			const actionEntries = new Map<
				string,
				Map<
					string | null,
					{
						objects: string[]
						objectKeys: string[]
						separator: "to" | "from"
						warName: string | null
					}
				>
			>()
			const fallbackClauses: string[] = []
			for (const event of events) {
				const clause = event.description
					.replace(new RegExp(`^${escapeRegExp(title)} `), "")
					.replace(/\.$/, "")
				const match =
					/^(took control of|lost control of|gained|lost) (.+)$/.exec(clause)
				if (!match) {
					fallbackClauses.push(clause)
					continue
				}
				const [, action] = match
				let object = match[2]
				// Individual events append " (War Name)" (see
				// findWarForTransfer) when a war looks responsible -- pull
				// that off before parsing the to/from clause below.
				const warSuffixMatch = /^(.+) \(([^()]+)\)$/.exec(object)
				const warName = warSuffixMatch?.[2] ?? null
				if (warSuffixMatch) object = warSuffixMatch[1]
				const targetMatch = /^(.+) (to|from) (.+)$/.exec(object)
				const objectName = targetMatch?.[1] ?? object
				const separator =
					(targetMatch?.[2] as "to" | "from" | undefined) ?? "to"
				const targetName = targetMatch?.[3] ?? null
				const targetEntries = actionEntries.get(action) ?? new Map()
				// Dedup key is the bare province name (not the full "X to/from
				// Y" clause) so the ownership/control cross-filtering below
				// (which compares against "gained"/"lost" entries that never
				// carry a target suffix) matches correctly regardless of
				// which nation the control side names.
				const entry = targetEntries.get(targetName) ?? {
					objects: [],
					objectKeys: [],
					separator,
					warName,
				}
				entry.objects.push(objectName)
				entry.objectKeys.push(objectName)
				// Only keep the war name if every province merged into this
				// clause agrees on it -- an ambiguous mix stays unlabeled
				// rather than naming one war for provinces it didn't cause.
				if (entry.warName !== warName) entry.warName = null
				targetEntries.set(targetName, entry)
				actionEntries.set(action, targetEntries)
			}
			for (const [ownershipAction, controlAction] of [
				["gained", "took control of"],
				["lost", "lost control of"],
			] as const) {
				const ownershipObjects = new Set<string>()
				for (const entry of actionEntries.get(ownershipAction)?.values() ??
					[]) {
					for (const objectKey of entry.objectKeys)
						ownershipObjects.add(objectKey)
				}
				if (ownershipObjects.size === 0) continue
				const controlTargets = actionEntries.get(controlAction)
				if (!controlTargets) continue
				for (const [targetName, entry] of controlTargets) {
					const filteredObjects: string[] = []
					const filteredObjectKeys: string[] = []
					for (let index = 0; index < entry.objectKeys.length; index++) {
						if (ownershipObjects.has(entry.objectKeys[index])) continue
						filteredObjects.push(entry.objects[index])
						filteredObjectKeys.push(entry.objectKeys[index])
					}
					if (filteredObjects.length > 0) {
						controlTargets.set(targetName, {
							objects: filteredObjects,
							objectKeys: filteredObjectKeys,
							separator: entry.separator,
							warName: entry.warName,
						})
					} else {
						controlTargets.delete(targetName)
					}
				}
				if (controlTargets.size === 0) {
					actionEntries.delete(controlAction)
				}
			}
			const clauseEntries = Array.from(actionEntries.entries()).flatMap(
				([action, targetEntries]) =>
					Array.from(targetEntries.entries()).map(([targetName, entry]) => ({
						text: targetName
							? `${action} ${formatList(entry.objects)} ${entry.separator} ${targetName}`
							: `${action} ${formatList(entry.objects)}`,
						warName: entry.warName,
					})),
			)
			const clauses = [
				...clauseEntries.map((entry) => entry.text),
				...fallbackClauses,
			]
			// War names sit at the very end of the whole sentence rather than
			// inline after whichever clause happened to carry one -- a
			// parenthetical mid-sentence reads as if it qualifies only that
			// clause, and readers expect the "why" to cap off the sentence.
			const warNames = Array.from(
				new Set(
					clauseEntries
						.map((entry) => entry.warName)
						.filter((warName): warName is string => warName !== null),
				),
			)
			// formatList's "A, B, and C" is for a list of nouns -- these are
			// full verb clauses (one per distinct action, e.g. "gained ..."
			// and "lost control of ..."), and running them together with
			// "and" reads as one run-on sentence. Semicolons keep each action
			// visually separate.
			const warSuffix = warNames.length > 0 ? ` (${warNames.join(", ")})` : ""
			return `${title} ${clauses.join("; ")}${warSuffix}.`
		}
		const buildMergedProvinceAttributeDescription = (
			events: NationTimelineEvent[],
			attribute: "culture" | "religion",
		): string => {
			const valueEntries = new Map<string, string[]>()
			const fallbackClauses: string[] = []
			const pattern = new RegExp(`^(.+) changed ${attribute} to (.+)$`)
			for (const event of events) {
				const clause = event.description.replace(/\.$/, "")
				const match = pattern.exec(clause)
				if (!match) {
					fallbackClauses.push(clause)
					continue
				}
				const [, provinceName, valueName] = match
				const entries = valueEntries.get(valueName) ?? []
				entries.push(provinceName)
				valueEntries.set(valueName, entries)
			}
			const clauses = [
				...Array.from(valueEntries.entries()).map(
					([valueName, provinceNames]) =>
						`${formatList(provinceNames)} changed ${attribute} to ${valueName}`,
				),
				...fallbackClauses,
			]
			return `${formatList(clauses)}.`
		}
		const mergedTerritoryType = (events: NationTimelineEvent[]): string => {
			const signs = new Set(
				events
					.map((event) => /\(([+-])\)$/.exec(event.type)?.[1])
					.filter((sign): sign is string => sign !== undefined),
			)
			if (signs.size === 1) return `Territory (${Array.from(signs)[0]})`
			return "Territory"
		}
		const ownedProvinceCountByDate = new Map<number, number>()
		const territoryDeltasByDate = new Map<number, number>()
		let timelineEvents: NationTimelineEvent[] = []
		const nationEvents = earthHistory.engine.data.nationEvents[tag]
		if (nationEvents) {
			for (const [index, event] of nationEvents.events.entries()) {
				const nations: NationTimelineEvent["nations"] = [eventNation(tag)]
				const provinces: NationTimelineEvent["provinces"] = []
				const dateId = `nation:${tag}:${event.date}:${index}`
				switch (event.kind) {
					case "governmentChange": {
						const governmentType = String(event.payload.governmentType ?? "")
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Government",
							description: `${title} changed government to ${GOVERNMENT.formatEarthHistoryGovernmentLabel({ governmentType, governmentReform: null })}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					}
					case "governmentReformAdd": {
						const reformId = String(event.payload.reformId ?? "")
						if (!/^early_gov_reform_\d+$/.test(reformId)) {
							pushTimelineEvent(timelineEvents, {
								id: dateId,
								date: event.date,
								type: "Government",
								description: `${title} adopted ${reformId.replace(/_/g, " ")}.`,
								comment: eventComment(event.comment),
								nations,
							})
						}
						break
					}
					case "governmentReformRemove": {
						const reformId = String(event.payload.reformId ?? "")
						if (!/^early_gov_reform_\d+$/.test(reformId)) {
							pushTimelineEvent(timelineEvents, {
								id: dateId,
								date: event.date,
								type: "Government",
								description: `${title} abandoned ${reformId.replace(/_/g, " ")}.`,
								comment: eventComment(event.comment),
								nations,
							})
						}
						break
					}
					case "rulerChange": {
						const person = personDisplay(event.payload)
						const isInterregnum = /^interregnum$/i.test(
							String(event.payload.name ?? "").trim(),
						)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Ruler",
							description: isInterregnum
								? `${title} entered an interregnum.`
								: `${title} gained ruler ${person.description}.`,
							comment: eventComment(event.comment),
							nations,
							dynasties: isInterregnum ? [] : person.dynasties,
						})
						break
					}
					case "heirChange": {
						const person = personDisplay(event.payload)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Heir",
							description: `${title} gained heir ${person.description}.`,
							comment: eventComment(event.comment),
							nations,
							dynasties: person.dynasties,
						})
						break
					}
					case "queenChange": {
						const person = personDisplay(event.payload)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Queen",
							description: `${title} gained queen ${person.description}.`,
							comment: eventComment(event.comment),
							nations,
							dynasties: person.dynasties,
						})
						break
					}
					case "leaderAdd": {
						const person = personDisplay(event.payload)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Leader",
							description: `${title} gained leader ${person.description}.`,
							comment: eventComment(event.comment),
							nations,
							dynasties: person.dynasties,
						})
						break
					}
					case "nameChange":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Government",
							description: `${title} changed name to ${String(event.payload.name ?? tag)}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "nameRestore":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Name",
							description: `${title} restored its historical name.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "capitalChange": {
						const rawId = String(event.payload.provinceId ?? "")
						const province = provinceMention(rawId, color)
						if (province) provinces.push(province)
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Capital",
							description: province
								? `${title} moved its capital to ${province.name}.`
								: `${title} moved its capital.`,
							comment: eventComment(event.comment),
							nations,
							provinces,
						})
						break
					}
					case "primaryCulture":
					case "acceptedCultureAdd":
					case "acceptedCultureRemove": {
						const cultureId = String(
							payloadValue(event.payload, "cultureId") ?? "",
						)
						const culture = cultureMention(cultureId)
						const verb =
							event.kind === "acceptedCultureAdd"
								? "accepted"
								: event.kind === "acceptedCultureRemove"
									? "stopped accepting"
									: "made its primary culture"
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Culture",
							description: `${title} ${verb} ${culture.name}.`,
							comment: eventComment(event.comment),
							nations,
							cultures: [culture],
						})
						break
					}
					case "religion":
					case "school": {
						const religionId =
							event.kind === "religion"
								? String(payloadValue(event.payload, "religionId") ?? "")
								: ""
						const religion = religionId ? religionMention(religionId) : null
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Religion",
							description:
								event.kind === "school"
									? `${title} adopted ${formatPayloadLabel(payloadValue(event.payload, "schoolId"))} school.`
									: `${title} changed religion to ${religion?.name ?? "unknown"}.`,
							comment: eventComment(event.comment),
							nations,
							religions: religion ? [religion] : [],
						})
						break
					}
					case "elector":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Elector",
							description:
								event.payload.enabled === false ||
								event.payload.elector === false
									? `${title} stopped being an elector.`
									: `${title} became an elector.`,
							comment: eventComment(event.comment),
							nations,
							organizations: [organizationMention("HRE")],
						})
						break
					case "govRank":
					case "legacyGov":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Government",
							description:
								event.kind === "govRank"
									? `${title} changed government rank to ${formatPayloadLabel(payloadValue(event.payload, "rank"))}.`
									: `${title} changed legacy government to ${formatPayloadLabel(payloadValue(event.payload, "legacyGovernmentId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "techGroup":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Tech",
							description: `${title} changed technology group to ${formatPayloadLabel(payloadValue(event.payload, "techGroupId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "decision":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Decision",
							description: `${title} enacted ${formatPayloadLabel(payloadValue(event.payload, "decisionId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "rulerTrait":
					case "heirTrait":
					case "queenTrait":
					case "clearTraits":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Trait",
							description:
								event.kind === "clearTraits"
									? `${title} cleared ruler traits.`
									: `${title} added ${formatPayloadLabel(payloadValue(event.payload, "traitId"))} ${event.kind.replace("Trait", "")} trait.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "countryFlagSet":
					case "countryFlagClear":
					case "globalFlagSet":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Flag",
							description:
								event.kind === "countryFlagClear"
									? `${title} cleared flag ${formatPayloadLabel(payloadValue(event.payload, "flagId"))}.`
									: `${title} set ${event.kind === "globalFlagSet" ? "global " : ""}flag ${formatPayloadLabel(payloadValue(event.payload, "flagId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "piety":
					case "mercantilism":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Economy",
							description:
								event.kind === "piety"
									? `${title} changed piety by ${formatSignedValue(payloadValue(event.payload))}.`
									: `${title} changed mercantilism by ${formatSignedValue(payloadValue(event.payload))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "ambientShow":
					case "ambientHide":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Site",
							description: `${title} ${event.kind === "ambientShow" ? "showed" : "hid"} ambient object ${formatPayloadLabel(payloadValue(event.payload, "ambientObjectId", "objectId"))}.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
					case "revolutionTarget":
						pushTimelineEvent(timelineEvents, {
							id: dateId,
							date: event.date,
							type: "Revolution",
							description: `${title} became the revolution target.`,
							comment: eventComment(event.comment),
							nations,
						})
						break
				}
			}
		}

		for (const [rawId, entry] of Object.entries(
			earthHistory.engine.data.provinceEvents,
		)) {
			let owner = normalizeTimelineTag(entry.base.owner)
			let controller = normalizeTimelineTag(entry.base.controller)
			let ownerRebelType: unknown
			let controllerRebelType: unknown
			const revoltTypeByDate = new Map<number, unknown>()
			for (const event of entry.events) {
				if (
					event.kind === "revolt" &&
					event.payload.revolt &&
					typeof event.payload.revolt === "object" &&
					"type" in event.payload.revolt
				) {
					revoltTypeByDate.set(
						event.date,
						(event.payload.revolt as Record<string, unknown>).type,
					)
				}
			}
			if (owner === tag) {
				territoryDeltasByDate.set(
					Number.NEGATIVE_INFINITY,
					(territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0) + 1,
				)
			}
			for (const [index, event] of entry.events.entries()) {
				const eventId = `province:${rawId}:${event.date}:${index}`
				const nextTag = normalizeTimelineTag(event.payload.tag)
				const nextRebelType = isRebelTag(nextTag)
					? revoltTypeByDate.get(event.date)
					: undefined
				const provinceColor = nextTag ? resolveNationColor(nextTag) : color
				const province = provinceMention(rawId, provinceColor)
				const provinces = province ? [province] : []
				const nations: NationTimelineEvent["nations"] = [eventNation(tag)]
				if (event.kind === "owner") {
					const previousOwnerRebelType = ownerRebelType
					const otherRebelType =
						nextTag === tag ? previousOwnerRebelType : nextRebelType
					addNationMention(nations, nextTag, nextRebelType)
					if (nextTag === tag || owner === tag) {
						if (nextTag !== owner) {
							const delta = nextTag === tag ? 1 : -1
							territoryDeltasByDate.set(
								event.date,
								(territoryDeltasByDate.get(event.date) ?? 0) + delta,
							)
						}
						const otherTag = nextTag === tag ? owner : nextTag
						const war =
							otherTag && !isRebelTag(otherTag)
								? findWarForTransfer(event.date, tag, otherTag)
								: null
						const description =
							nextTag === tag
								? `${title} gained ${province?.name ?? `province ${rawId}`}${war ? ` (${war.name})` : ""}.`
								: `${title} lost ${province?.name ?? `province ${rawId}`}${nextTag ? ` to ${eventNation(nextTag, otherRebelType).name}` : ""}${war ? ` (${war.name})` : ""}.`
						pushTimelineEvent(timelineEvents, {
							id: eventId,
							date: event.date,
							type: nextTag === tag ? "Territory (+)" : "Territory (-)",
							description,
							comment: eventComment(event.comment),
							nations,
							provinces,
							wars: war ? [warMention(war)] : [],
						})
					}
					owner = nextTag
					ownerRebelType = isRebelTag(nextTag) ? nextRebelType : undefined
				} else if (event.kind === "controller") {
					const previousController = controller
					const previousControllerRebelType = controllerRebelType
					const otherRebelType =
						nextTag === tag ? previousControllerRebelType : nextRebelType
					addNationMention(nations, nextTag, nextRebelType)
					if (nextTag === tag)
						addNationMention(nations, previousController, otherRebelType)
					if (
						nextTag !== previousController &&
						(nextTag === tag || previousController === tag)
					) {
						const otherTag = nextTag === tag ? controller : nextTag
						const war =
							otherTag && !isRebelTag(otherTag)
								? findWarForTransfer(event.date, tag, otherTag)
								: null
						const description =
							nextTag === tag
								? `${title} took control of ${province?.name ?? `province ${rawId}`}${previousController ? ` from ${eventNation(previousController, otherRebelType).name}` : ""}${war ? ` (${war.name})` : ""}.`
								: `${title} lost control of ${province?.name ?? `province ${rawId}`}${nextTag ? ` to ${eventNation(nextTag, otherRebelType).name}` : ""}${war ? ` (${war.name})` : ""}.`
						pushTimelineEvent(timelineEvents, {
							id: eventId,
							date: event.date,
							type: nextTag === tag ? "Territory (+)" : "Territory (-)",
							description,
							comment: eventComment(event.comment),
							nations,
							provinces,
							wars: war ? [warMention(war)] : [],
						})
					}
					controller = nextTag
					controllerRebelType = isRebelTag(nextTag) ? nextRebelType : undefined
				} else if (owner === tag && event.kind === "culture") {
					const cultureId = String(event.payload.cultureId ?? "")
					const culture = cultureMention(cultureId)
					pushTimelineEvent(timelineEvents, {
						id: eventId,
						date: event.date,
						type: "Culture",
						description: `${province?.name ?? `Province ${rawId}`} changed culture to ${culture.name}.`,
						comment: eventComment(event.comment),
						nations,
						provinces,
						cultures: [culture],
					})
				} else if (owner === tag && event.kind === "religion") {
					const religionId = String(event.payload.religionId ?? "")
					const religion = religionMention(religionId)
					pushTimelineEvent(timelineEvents, {
						id: eventId,
						date: event.date,
						type: "Religion",
						description: `${province?.name ?? `Province ${rawId}`} changed religion to ${religion.name}.`,
						comment: eventComment(event.comment),
						nations,
						provinces,
						religions: [religion],
					})
				} else if (owner === tag && event.kind === "hre") {
					const joined = Boolean(event.payload.member)
					pushTimelineEvent(timelineEvents, {
						id: eventId,
						date: event.date,
						type: joined ? "HRE (+)" : "HRE (-)",
						description: joined
							? `${province?.name ?? `Province ${rawId}`} joined the Holy Roman Empire.`
							: `${province?.name ?? `Province ${rawId}`} left the Holy Roman Empire.`,
						comment: eventComment(event.comment),
						nations,
						provinces,
						organizations: [organizationMention("HRE")],
					})
				}
			}
		}

		for (const [index, event] of earthHistory.engine.data.diplomacy.entries()) {
			const firstTag = normalizeTimelineTag(event.payload.firstTag)
			const secondTag = normalizeTimelineTag(event.payload.secondTag)
			if (firstTag !== tag && secondTag !== tag) continue
			const otherTag = firstTag === tag ? secondTag : firstTag
			const nations: NationTimelineEvent["nations"] = [eventNation(tag)]
			addNationMention(nations, otherTag)
			const otherName = otherTag
				? resolveNationName(otherTag)
				: "another nation"
			const starts = event.kind.endsWith("Start")
			if (event.kind === "emperorStart" || event.kind === "emperorEnd") {
				// firstTag is always the emperor tag, secondTag is "HLR" (the
				// empire's own nation entry) -- see convert_emperors in
				// build-eu4-history-events.py. Only the emperor's own wiki page
				// reaches this branch (tag === firstTag), never HLR's.
				pushTimelineEvent(timelineEvents, {
					id: `diplomacy:${event.date}:${index}`,
					date: event.date,
					type: starts ? "Emperor (+)" : "Emperor (-)",
					description: starts
						? `${title} became Emperor of the Holy Roman Empire.`
						: `${title}'s reign as Emperor of the Holy Roman Empire ended.`,
					nations,
					organizations: [organizationMention("HRE")],
				})
				continue
			}
			const relation = event.kind.startsWith("alliance")
				? "alliance"
				: event.kind.startsWith("guarantee")
					? "guarantee"
					: event.kind.startsWith("royalMarriage")
						? "royal marriage"
						: event.kind.startsWith("union")
							? "personal union"
							: "dependency"
			let description: string
			if (
				event.kind === "vassalStart" ||
				event.kind === "vassalEnd" ||
				event.kind === "dependencyStart" ||
				event.kind === "dependencyEnd"
			) {
				description = subjectRelationDescription({
					title,
					otherName,
					isStart: starts,
					isOverlordPage: firstTag === tag,
					subjectType:
						event.kind === "vassalStart" || event.kind === "vassalEnd"
							? "vassal"
							: event.payload.subjectType,
				})
			} else if (event.kind === "guaranteeStart") {
				description =
					firstTag === tag
						? `${title} guaranteed ${otherName}.`
						: `${title} received a guarantee from ${otherName}.`
			} else if (event.kind === "guaranteeEnd") {
				description =
					firstTag === tag
						? `${title} stopped guaranteeing ${otherName}.`
						: `${title} lost ${otherName}'s guarantee.`
			} else if (event.kind === "unionStart") {
				description =
					firstTag === tag
						? `${title} gained ${otherName} as a junior partner in a personal union.`
						: `${title} became junior partner in a personal union under ${otherName}.`
			} else if (event.kind === "unionEnd") {
				description =
					firstTag === tag
						? `${title}'s personal union over ${otherName} ended.`
						: `${title} left the personal union under ${otherName}.`
			} else {
				description = `${title} ${starts ? "formed" : "ended"} a ${relation} with ${otherName}.`
			}
			pushTimelineEvent(timelineEvents, {
				id: `diplomacy:${event.date}:${index}`,
				date: event.date,
				type: starts ? "Diplomacy (+)" : "Diplomacy (-)",
				description,
				nations,
			})
		}

		for (const [
			index,
			event,
		] of earthHistory.engine.data.organizationEvents.entries()) {
			if (
				(event.kind !== "join" && event.kind !== "leave") ||
				event.nationTag !== tag
			)
				continue
			const orgId = event.payload.orgId
			const org = organizationMention(orgId, event.payload.role)
			const joined = event.kind === "join"
			pushTimelineEvent(timelineEvents, {
				id: `organization:${orgId}:${event.date}:${index}`,
				date: event.date,
				type: joined ? "Organization (+)" : "Organization (-)",
				description: joined
					? `${title} joined the ${org.name}.`
					: `${title} left the ${org.name}.`,
				nations: [eventNation(tag)],
				organizations: [org],
			})
		}

		for (const war of earthHistory.engine.data.wars) {
			const participants = new Map<string, "attacker" | "defender">()
			for (const event of war.events)
				participants.set(event.nationTag, event.side)
			// Multiple nations often join/leave on the same date (a shared
			// peace treaty, allies declaring together) -- group by
			// (date, kind) the same way WarWikiPage does, so this nation's
			// entry reads as "X, Y, and Z entered War against A and B"
			// instead of only naming this nation.
			const eventGroups = new Map<string, RawWarParticipantEvent[]>()
			for (const event of war.events) {
				const key = `${event.date}:${event.kind}`
				const group = eventGroups.get(key)
				if (group) group.push(event)
				else eventGroups.set(key, [event])
			}
			for (const [key, group] of eventGroups) {
				if (!group.some((event) => event.nationTag === tag)) continue
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
				for (const nationTag of [...attackerTags, ...defenderTags])
					addNationMention(nations, nationTag)
				let description: string
				if (kind === "warStart") {
					const attackerNames = attackerTags.map(resolveNationName)
					const defenderNames = defenderTags.map(resolveNationName)
					if (attackerNames.length > 0 && defenderNames.length > 0) {
						description = `${joinWithAnd(attackerNames)} entered ${war.name} against ${joinWithAnd(defenderNames)}.`
					} else {
						// Only one side declared this day (the other side's
						// members were already in the war) -- find its
						// existing opponents so "against" still shows up.
						const joiningSide =
							attackerNames.length > 0 ? "attacker" : "defender"
						const joiningTags =
							attackerNames.length > 0 ? attackerTags : defenderTags
						const joiningNames =
							attackerNames.length > 0 ? attackerNames : defenderNames
						const opponentTags = Array.from(participants.entries())
							.filter(
								([opponentTag, side]) =>
									side !== joiningSide && !joiningTags.includes(opponentTag),
							)
							.map(([opponentTag]) => opponentTag)
						for (const opponentTag of opponentTags)
							addNationMention(nations, opponentTag)
						const opponentNames = opponentTags.map(resolveNationName)
						description = `${joinWithAnd(joiningNames)} entered ${war.name}${opponentNames.length > 0 ? ` against ${joinWithAnd(opponentNames)}` : ""}.`
					}
				} else {
					const names = [...attackerTags, ...defenderTags].map(
						resolveNationName,
					)
					description = `${joinWithAnd(names)} left ${war.name}.`
				}
				pushTimelineEvent(timelineEvents, {
					id: `war:${war.warId}:${key}`,
					date,
					type: kind === "warStart" ? "War (+)" : "War (-)",
					description,
					comment: eventComment(comment),
					nations,
					wars: [warMention(war)],
				})
			}
			for (const [index, battle] of war.battles.entries()) {
				const isAttacker = battle.attacker.country === tag
				const isDefender = battle.defender.country === tag
				if (!isAttacker && !isDefender) continue
				const opponent = isAttacker ? battle.defender : battle.attacker
				const won = isAttacker ? battle.attackerWon : !battle.attackerWon
				const nations: NationTimelineEvent["nations"] = [eventNation(tag)]
				addNationMention(nations, opponent.country)
				const province = battle.locationProvinceId
					? provinceMention(battle.locationProvinceId, "#94a3b8")
					: null
				const description = `${title} ${won ? "won" : "lost"} the Battle of ${battle.name} against ${resolveNationName(opponent.country)} (${war.name}).`
				pushTimelineEvent(timelineEvents, {
					id: `warBattle:${war.warId}:${battle.date}:${index}`,
					date: battle.date,
					type: won ? "Battle (+)" : "Battle (-)",
					description,
					comment: eventComment(battle.comment),
					nations,
					provinces: province ? [province] : [],
					wars: [warMention(war)],
				})
			}
		}
		let ownedProvinceCount =
			territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0
		for (const date of Array.from(territoryDeltasByDate.keys())
			.filter((date) => Number.isFinite(date))
			.sort((a, b) => a - b)) {
			ownedProvinceCount += territoryDeltasByDate.get(date) ?? 0
			ownedProvinceCountByDate.set(date, ownedProvinceCount)
		}
		// Step-chart series for the wiki page: the base ownership count at the
		// simulation start, then the running count at each ownership change.
		// ownedProvinceCountByDate iterates in ascending date order because it
		// was filled from sorted dates above.
		const provinceHistory: Array<{ date: number; count: number }> = [
			{
				date: earthHistory.minDays,
				count: territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0,
			},
		]
		for (const [date, count] of ownedProvinceCountByDate) {
			if (date <= earthHistory.minDays) {
				provinceHistory[0] = { date: earthHistory.minDays, count }
			} else {
				provinceHistory.push({ date, count })
			}
		}
		const hasOwnedProvinceAtDate = (date: number): boolean => {
			let count = territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0
			for (const [changeDate, changedCount] of ownedProvinceCountByDate) {
				if (changeDate > date) break
				count = changedCount
			}
			return count > 0
		}
		timelineEvents = timelineEvents.filter((event) =>
			hasOwnedProvinceAtDate(event.date),
		)
		const mergedTimelineEvents: NationTimelineEvent[] = []
		const territorialGroups = new Map<number, NationTimelineEvent[]>()
		const cultureGroups = new Map<number, NationTimelineEvent[]>()
		const religionGroups = new Map<number, NationTimelineEvent[]>()
		for (const event of timelineEvents) {
			if (event.type.startsWith("Territory")) {
				const group = territorialGroups.get(event.date) ?? []
				group.push(event)
				territorialGroups.set(event.date, group)
			} else if (event.type === "Culture") {
				const group = cultureGroups.get(event.date) ?? []
				group.push(event)
				cultureGroups.set(event.date, group)
			} else if (event.type === "Religion") {
				const group = religionGroups.get(event.date) ?? []
				group.push(event)
				religionGroups.set(event.date, group)
			} else {
				mergedTimelineEvents.push(event)
			}
		}
		for (const [date, group] of territorialGroups) {
			if (group.length === 1) {
				mergedTimelineEvents.push(group[0])
				continue
			}
			const mergedType = mergedTerritoryType(group)
			mergedTimelineEvents.push({
				id: `territory:${tag}:${date}:merged`,
				date,
				dateLabel: DATE.formatEu4Days(date),
				type: mergedType,
				typeColor: timelineTypeColor(mergedType),
				description: buildMergedTerritoryDescription(group),
				comment: mergeEventComments(group),
				nations: mergeNations(group.flatMap((event) => event.nations)),
				provinces: mergeById(group.flatMap((event) => event.provinces)),
				cultures: mergeById(group.flatMap((event) => event.cultures)),
				religions: mergeById(group.flatMap((event) => event.religions)),
				dynasties: mergeById(group.flatMap((event) => event.dynasties)),
				organizations: mergeById(group.flatMap((event) => event.organizations)),
				wars: mergeById(group.flatMap((event) => event.wars)),
			})
		}
		for (const [date, group] of cultureGroups) {
			if (group.length === 1) {
				mergedTimelineEvents.push(group[0])
				continue
			}
			mergedTimelineEvents.push({
				id: `culture:${tag}:${date}:merged`,
				date,
				dateLabel: DATE.formatEu4Days(date),
				type: "Culture",
				typeColor: timelineTypeColor("Culture"),
				description: buildMergedProvinceAttributeDescription(group, "culture"),
				comment: mergeEventComments(group),
				nations: mergeNations(group.flatMap((event) => event.nations)),
				provinces: mergeById(group.flatMap((event) => event.provinces)),
				cultures: mergeById(group.flatMap((event) => event.cultures)),
				religions: mergeById(group.flatMap((event) => event.religions)),
				dynasties: mergeById(group.flatMap((event) => event.dynasties)),
				organizations: mergeById(group.flatMap((event) => event.organizations)),
				wars: mergeById(group.flatMap((event) => event.wars)),
			})
		}
		for (const [date, group] of religionGroups) {
			if (group.length === 1) {
				mergedTimelineEvents.push(group[0])
				continue
			}
			mergedTimelineEvents.push({
				id: `religion:${tag}:${date}:merged`,
				date,
				dateLabel: DATE.formatEu4Days(date),
				type: "Religion",
				typeColor: timelineTypeColor("Religion"),
				description: buildMergedProvinceAttributeDescription(group, "religion"),
				comment: mergeEventComments(group),
				nations: mergeNations(group.flatMap((event) => event.nations)),
				provinces: mergeById(group.flatMap((event) => event.provinces)),
				cultures: mergeById(group.flatMap((event) => event.cultures)),
				religions: mergeById(group.flatMap((event) => event.religions)),
				dynasties: mergeById(group.flatMap((event) => event.dynasties)),
				organizations: mergeById(group.flatMap((event) => event.organizations)),
				wars: mergeById(group.flatMap((event) => event.wars)),
			})
		}
		timelineEvents = mergedTimelineEvents
		timelineEvents.sort(
			(a, b) => a.date - b.date || a.type.localeCompare(b.type),
		)

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

		const climateDistribution = showObservedDistributions
			? buildDistributionForRegions(
					EU5_CLIMATE_CATEGORIES.map((label) => label.replace(/_/g, " ")),
					world.eu5Climate,
					regionIndexes,
					(index) => rgbToCss(EU5_CLIMATE_COLORS[index]),
				)
			: buildDistributionForRegions(
					VEGETATION.climateLabels,
					world.climateZones,
					regionIndexes,
					(index) => rgbToCss(climateZoneColor(index)),
					new Set([0]),
				)
		const vegetationDistribution = showObservedDistributions
			? buildDistributionForRegions(
					EU5_VEGETATION_CATEGORIES.map((label) => label.replace(/_/g, " ")),
					world.eu5Vegetation,
					regionIndexes,
					(index) => rgbToCss(EU5_VEGETATION_COLORS[index]),
				)
			: buildDistributionForRegions(
					VEGETATION.biomeLabels,
					world.vegetation,
					regionIndexes,
					(index) => rgbToCss(vegetationColor(index)),
					new Set([0]),
				)
		const topographyDistribution = showObservedDistributions
			? buildEu5TopographyDistribution({
					values: world.eu5Topography,
					regionIndexes,
					rgbToCss,
				})
			: buildDistributionForRegions(
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
			title,
			color,
			planetTitle: planetName,
			stats,
			dependencies,
			organizations,
			cultureDistribution,
			religionDistribution,
			climateDistribution,
			vegetationDistribution,
			topographyDistribution,
			showObservedDistributions,
			provinceHistory,
			dateRangeStart: earthHistory.minDays,
			dateRangeEnd: earthHistory.maxDays,
			currentDate: earthHistory.selectedDays,
			currentDateLabel: DATE.formatEu4Days(earthHistory.selectedDays),
			timelineEvents,
			onBack: () => setSelectedWikiNationTag(null),
			onFocusNation: () => focusNation(tag),
			onSelectNation: (targetTag: string) => {
				focusNation(targetTag)
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
			onSelectWar: (warId: string) => {
				setSelectedWikiWarId(warId)
			},
		}
	}, [
		selectedWikiNationTag,
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
	])
}
