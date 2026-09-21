import { useMemo } from "react"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { COLOR } from "@/model/history/earth/color"
import { DATE } from "@/model/history/earth/date"
import { GOVERNMENT } from "@/model/history/earth/government"
import { ORGANIZATION_CATEGORIES } from "@/model/history/earth/organization-categories"
import { FRAME } from "@/model/history/world-frame"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { ShieldHalfFullIcon } from "@/ui/components/primitives/icons/ShieldHalfFullIcon"
import { SwordCrossIcon } from "@/ui/components/primitives/icons/SwordCrossIcon"
import { Swatch } from "@/ui/components/primitives/Swatch"
import {
	nationFocusDistanceScale,
	SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
} from "@/ui/genesis/renderer/focus"
import { climateZoneColor } from "@/ui/genesis/shared/colors/misc"
import { vegetationColor } from "@/ui/genesis/shared/colors/vegetation"
import { getProvinceAreaKm2 } from "@/ui/genesis/shared/population-density"
import { getTopographyColor } from "@/ui/genesis/shared/region-colors/palette"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { NationWikiDataInput } from "@/ui/genesis/view/types"
import {
	cultureMention,
	organizationMention,
	personDisplay,
	religionMention,
	warMention,
} from "@/ui/genesis/wiki-bridge/nation-wiki-mentions"
import {
	buildMergedDiplomacyDescription,
	buildMergedProvinceAttributeDescription,
	buildMergedTerritoryDescription,
	formatPayloadLabel,
	formatSignedValue,
	formatWealthCost,
	mergeById,
	mergedSignedType,
	mergeEventComments,
	mergeNations,
	payloadValue,
} from "@/ui/genesis/wiki-bridge/nation-wiki-timeline-format"
import { TITLE_SUMMARY } from "@/ui/genesis/wiki-bridge/title-summary"
import { TITLE_TIMELINE } from "@/ui/genesis/wiki-bridge/title-timeline"
import type { NationWikiData } from "@/ui/wiki/nation/NationWikiPage"
import {
	compareTimelineDateThenWarEnd,
	eventComment,
	formatRebelName,
	formatRulerStatLabel,
	joinWithAnd,
	paletteColorForDynasty,
	pushTimelineEvent,
	subjectRelationDescription,
	subjectTypeGroupLabel,
	timelineTypeColor,
} from "@/ui/wiki/nation/timeline-formatting"
import type { WikiTimelineEvent as NationTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"
import {
	buildDistributionForRegions,
	buildStringIdDistributionForProvinces,
} from "@/ui/wiki/stats/nation/nation-distributions"
import { buildNationWikiStats } from "@/ui/wiki/stats/nation/nation-stats"

export function useNationWikiData(
	input: NationWikiDataInput,
): NationWikiData | null {
	const {
		selectedWikiNationId,
		world,
		worldForDisplay,
		history,
		showObservedDistributions,
		planetName,
		getProvinceColor,
		setSelectedWikiNationId,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		sceneRef,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<NationWikiData | null>(() => {
		if (
			selectedWikiNationId === null ||
			!history.state ||
			!history.query ||
			!worldForDisplay
		)
			return null
		const frame = history.query.frame
		const record = history.state.record
		const nationList = record.nations
		const daysFromMs = (timeMs: number) => timeMs / 86_400_000
		const datedEvents = <Event extends { timeMs: number }>(events: Event[]) =>
			events.map((event) => ({ ...event, date: daysFromMs(event.timeMs) }))
		const wars = record.events.wars.map((war) => ({
			...war,
			events: datedEvents(war.events),
			battles: datedEvents(war.battles),
		}))
		const nationId = selectedWikiNationId
		if (nationId < 0 || nationId >= nationList.length) return null

		const provinceIndexes: number[] = []
		const provinceCountByNationId = new Map<number, number>()
		for (let p = 0; p < frame.provinceNation.length; p++) {
			const assignedNationId = frame.provinceNation[p]
			if (assignedNationId < 0) continue
			if (assignedNationId === nationId) provinceIndexes.push(p)
			provinceCountByNationId.set(
				assignedNationId,
				(provinceCountByNationId.get(assignedNationId) ?? 0) + 1,
			)
		}
		const hasOwnedProvinces = (otherId: number): boolean =>
			(provinceCountByNationId.get(otherId) ?? 0) > 0
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
		const realUrbanPopulation =
			worldForDisplay.realUrbanPopulation?.population ??
			worldForDisplay.urbanPopulation
		const totalUrbanPopulation = realUrbanPopulation
			? provinceIndexes.reduce(
					(sum, p) => sum + (realUrbanPopulation[p] ?? 0),
					0,
				)
			: 0

		const nationState = frame.nations.get(nationId)
		const resolveNationName = (otherId: number): string =>
			frame.nations.get(otherId)?.name ??
			nationList[otherId]?.name ??
			`nation ${otherId}`
		// Matches the actual "nations" map-mode fill exactly (Nation.color) --
		// real EU4 reference color when known, neutral gray otherwise.
		const resolveNationColor = (otherId: number): string => {
			const n = frame.nations.get(otherId) ?? nationList[otherId]
			return n
				? COLOR.rgb01ToCss([
						n.color[0] / 255,
						n.color[1] / 255,
						n.color[2] / 255,
					])
				: COLOR.rgb01ToCss([0.5, 0.5, 0.5])
		}
		const title = resolveNationName(nationId)
		const color = resolveNationColor(nationId)
		const governmentSubtype = GOVERNMENT.formatHistoryGovernmentLabel({
			governmentType: nationState?.government ?? null,
			governmentReform: nationState?.governmentReform,
		})
		const governmentColor = GOVERNMENT.getEarthHistoryGovernmentColor({
			governmentType: nationState?.government ?? null,
			governmentReform: nationState?.governmentReform,
		})
		const currentRulerPayload =
			record.events.nationEvents[nationId]?.events
				.filter(
					(event) =>
						event.kind === "rulerChange" &&
						event.timeMs <= history.selectedTimeMs,
				)
				.at(-1)?.payload ?? null
		const rulerLabel = nationState?.ruler
			? formatRulerStatLabel(
					currentRulerPayload,
					nationState.ruler.name,
					history.selectedTimeMs,
				)
			: null
		const dynastyName =
			(typeof currentRulerPayload?.dynasty === "string"
				? currentRulerPayload.dynasty
				: nationState?.ruler?.dynasty) ?? null
		const activeConflicts = frame.wars
			.filter(
				(war) =>
					war.attackers.includes(nationId) || war.defenders.includes(nationId),
			)
			.map((war) => ({
				warId: war.id,
				name: war.name,
				side: war.attackers.includes(nationId)
					? ("attacker" as const)
					: ("defender" as const),
			}))
			.sort((a, b) => a.name.localeCompare(b.name))

		// "Dependency" here covers every cross-nation political tie the Earth
		// frame tracks -- overlord/vassals is
		// the literal subject hierarchy, union/allies/guarantees/marriages aren't strictly
		// dependencies but share the same "line per relation type, links to
		// other nations" shape so they're folded in here too.
		const subjectDependencyGroups = new Map<string, number[]>()
		for (const subjectId of nationState?.relations.vassals ?? []) {
			if (!hasOwnedProvinces(subjectId)) continue
			const subjectType =
				nationState?.relations.vassalSubjectTypes.find(
					(entry) => entry.nationId === subjectId,
				)?.subjectType ?? "vassal"
			const label = subjectTypeGroupLabel(subjectType)
			const subjects = subjectDependencyGroups.get(label) ?? []
			subjects.push(subjectId)
			subjectDependencyGroups.set(label, subjects)
		}
		const dependencyGroups: Array<[string, number[]]> = [
			[
				"Overlord",
				nationState?.relations.overlord !== undefined &&
				nationState.relations.overlord >= 0 &&
				hasOwnedProvinces(nationState.relations.overlord)
					? [nationState.relations.overlord]
					: [],
			],
			...subjectDependencyGroups,
			[
				"Union (Senior)",
				nationState?.relations.unionSeniorOf
					? nationState.relations.unionSeniorOf.filter(hasOwnedProvinces)
					: [],
			],
			[
				"Union (Junior)",
				nationState?.relations.unionJuniorPartner !== undefined &&
				nationState.relations.unionJuniorPartner >= 0 &&
				hasOwnedProvinces(nationState.relations.unionJuniorPartner)
					? [nationState.relations.unionJuniorPartner]
					: [],
			],
			[
				"Allies",
				nationState?.relations.allies
					? nationState.relations.allies.filter(hasOwnedProvinces)
					: [],
			],
			[
				"Rivals",
				nationState?.relations.rivals
					? nationState.relations.rivals.filter(hasOwnedProvinces)
					: [],
			],
			[
				"Guarantees",
				nationState?.relations.guarantees
					? nationState.relations.guarantees.filter(hasOwnedProvinces)
					: [],
			],
			[
				"Royal Marriages",
				nationState?.relations.royalMarriages
					? nationState.relations.royalMarriages.filter(hasOwnedProvinces)
					: [],
			],
		]
		const dependencies = dependencyGroups
			.map(([label, ids]) => ({
				label,
				nations: ids.map((otherId) => ({
					tag: String(otherId),
					name: resolveNationName(otherId),
					color: resolveNationColor(otherId),
				})),
			}))
			.filter((group) => group.nations.length > 0)

		const resolveOrganizationColor = (orgId: string): string => {
			const ref = history.organizationReference?.get(orgId)
			return ref
				? COLOR.rgb01ToCss([
						ref.color[0] / 255,
						ref.color[1] / 255,
						ref.color[2] / 255,
					])
				: COLOR.rgb01ToCss([0.5, 0.5, 0.5])
		}
		const organizationRoleById = new Map(
			nationState?.organizations.map((organization) => [
				organization.orgId,
				organization.role,
			]) ?? [],
		)
		const organizationIds = new Set<string>(organizationRoleById.keys())
		if (FRAME.hreMemberNations({ frame }).has(nationId))
			organizationIds.add("HRE")
		const organizations = Array.from(organizationIds).map((orgId) => {
			// A nation can hold enclave territory of an org without being
			// genuinely "part of" it -- e.g. Venice's Terraferma stayed
			// formally inside the HRE after Venice (never an Imperial Estate)
			// conquered it. Shown as this nation's own color striped with
			// transparent instead of a plain solid swatch, so the wiki
			// doesn't silently overstate membership -- see
			// collectOrgForeignHolderNations.
			const striped = FRAME.orgForeignHolders({ frame, orgId }).has(nationId)
			// For orgs whose categories split into rival sides (GG's
			// Guelphs/Ghibellines) rather than just estate/site types, show
			// which side this nation is on instead of the shared org name --
			// see OrgCategory.factionLabel.
			const role = organizationRoleById.get(orgId)
			const category = role
				? ORGANIZATION_CATEGORIES.orgCategorySchemas[orgId]?.categories.find(
						(c) => c.id === role,
					)
				: undefined
			return {
				id: orgId,
				name:
					category?.factionLabel ??
					history.organizationReference?.get(orgId)?.name ??
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

		const titleSummary = TITLE_SUMMARY.describe({
			frame,
			nationId,
			provinceName: (province) =>
				history.state.provinceMeta[province]?.name ?? `Province ${province}`,
		})
		const stats = buildNationWikiStats({
			totalAreaKm2,
			totalPopulation,
			totalUrbanPopulation,
			provinceCount: provinceIndexes.length,
			rulerLabel,
			governmentSubtype,
			governmentColor: governmentColor
				? COLOR.rgb01ToCss(governmentColor)
				: null,
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
		const focusNation = (targetId: number) => {
			const seedProvince = frame.nations.get(targetId)?.capitalProvince ?? -1
			if (seedProvince === undefined || seedProvince < 0) return

			let targetProvinceCount = 0
			for (const assigned of frame.provinceNation) {
				if (assigned === targetId) targetProvinceCount++
			}
			sceneRef.current?.focusOnProvince(seedProvince, {
				distanceScale: nationFocusDistanceScale(targetProvinceCount),
				pulseTarget: "nation",
			})
		}

		const eventNation = (otherId: number, rebelType?: unknown) => ({
			tag: String(otherId),
			name: rebelType ? formatRebelName(rebelType) : resolveNationName(otherId),
			color: resolveNationColor(otherId),
			link: !rebelType,
		})
		const addNationMention = (
			mentions: NationTimelineEvent["nations"],
			otherId: number | null,
			rebelType?: unknown,
		) => {
			if (
				otherId === null ||
				mentions.some(
					(entry) =>
						entry.tag === String(otherId) &&
						entry.name === eventNation(otherId, rebelType).name,
				)
			)
				return
			mentions.push(eventNation(otherId, rebelType))
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
		// Index every war's participant span once so territory/control-change
		// events below can guess which war (if any) caused them: a transfer
		// between two nations that were both belligerents in some war whose
		// span covers the transfer date is presumed to be that war's doing --
		// same heuristic WarWikiPage's own territory section uses, just run
		// against every war instead of one already-selected war.
		const warSpans = wars.map((war) => {
			const sideById = new Map<number, "attacker" | "defender">()
			for (const event of war.events) sideById.set(event.nationId, event.side)
			const dates = war.events.map((event) => event.date)
			return {
				war,
				sideById,
				dateRangeStart: dates.length > 0 ? Math.min(...dates) : Infinity,
				dateRangeEnd: dates.length > 0 ? Math.max(...dates) : -Infinity,
			}
		})
		const findWarForTransfer = (
			date: number,
			idA: number,
			idB: number,
		): { id: number; name: string } | null => {
			for (const span of warSpans) {
				if (date < span.dateRangeStart || date > span.dateRangeEnd) continue
				if (!span.sideById.has(idA) || !span.sideById.has(idB)) continue
				return span.war
			}
			return null
		}
		const ownedProvinceCountByDate = new Map<number, number>()
		const territoryDeltasByDate = new Map<number, number>()
		let timelineEvents: NationTimelineEvent[] = []
		const nationEvents = record.events.nationEvents[nationId]
		if (nationEvents) {
			for (const [index, event] of datedEvents(nationEvents.events).entries()) {
				const nations: NationTimelineEvent["nations"] = [eventNation(nationId)]
				const provinces: NationTimelineEvent["provinces"] = []
				const dateId = `nation:${nationId}:${event.date}:${index}`
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
							description: `${title} changed name to ${String(event.payload.name ?? nationId)}.`,
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
						const culture = cultureMention(history, cultureId)
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
						const religion = religionId
							? religionMention(history, religionId)
							: null
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
							organizations: [organizationMention(history, "HRE")],
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

		for (const [rawId, entry] of record.events.provinceEvents) {
			let owner = entry.base.ownerId
			let controller = entry.base.controllerId
			let ownerRebelType: unknown
			let controllerRebelType: unknown
			const revoltTypeByDate = new Map<number, unknown>()
			for (const event of datedEvents(entry.events)) {
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
			if (owner === nationId) {
				territoryDeltasByDate.set(
					Number.NEGATIVE_INFINITY,
					(territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0) + 1,
				)
			}
			const isRebelId = (id: number) => id >= 0 && !!nationList[id]?.isRebel
			for (const [index, event] of datedEvents(entry.events).entries()) {
				const eventId = `province:${rawId}:${event.date}:${index}`
				const nextId = (event.payload.nationId as number | null) ?? null
				const nextRebelType = isRebelId(nextId)
					? revoltTypeByDate.get(event.date)
					: undefined
				const provinceColor =
					nextId !== null ? resolveNationColor(nextId) : color
				const province = provinceMention(String(rawId), provinceColor)
				const provinces = province ? [province] : []
				const nations: NationTimelineEvent["nations"] = [eventNation(nationId)]
				if (event.kind === "owner") {
					const previousOwnerRebelType = ownerRebelType
					const otherRebelType =
						nextId === nationId ? previousOwnerRebelType : nextRebelType
					addNationMention(nations, nextId, nextRebelType)
					if (nextId === nationId || owner === nationId) {
						if (nextId !== owner) {
							const delta = nextId === nationId ? 1 : -1
							territoryDeltasByDate.set(
								event.date,
								(territoryDeltasByDate.get(event.date) ?? 0) + delta,
							)
						}
						const otherId = nextId === nationId ? owner : nextId
						const war =
							otherId !== null && !isRebelId(otherId)
								? findWarForTransfer(event.date, nationId, otherId)
								: null
						const description =
							nextId === nationId
								? `${title} gained ${province?.name ?? `province ${rawId}`}${war ? ` (${war.name})` : ""}.`
								: `${title} lost ${province?.name ?? `province ${rawId}`}${nextId !== null ? ` to ${eventNation(nextId, otherRebelType).name}` : ""}${war ? ` (${war.name})` : ""}.`
						pushTimelineEvent(timelineEvents, {
							id: eventId,
							date: event.date,
							type: nextId === nationId ? "Territory (+)" : "Territory (-)",
							description,
							comment: eventComment(event.comment),
							nations,
							provinces,
							wars: war ? [warMention(war)] : [],
						})
					}
					owner = nextId
					ownerRebelType = isRebelId(nextId) ? nextRebelType : undefined
				} else if (event.kind === "controller") {
					const previousController = controller
					const previousControllerRebelType = controllerRebelType
					const otherRebelType =
						nextId === nationId ? previousControllerRebelType : nextRebelType
					addNationMention(nations, nextId, nextRebelType)
					if (nextId === nationId)
						addNationMention(nations, previousController, otherRebelType)
					if (
						nextId !== previousController &&
						(nextId === nationId || previousController === nationId)
					) {
						const otherId = nextId === nationId ? controller : nextId
						const war =
							otherId !== null && !isRebelId(otherId)
								? findWarForTransfer(event.date, nationId, otherId)
								: null
						const description =
							nextId === nationId
								? `${title} took control of ${province?.name ?? `province ${rawId}`}${previousController !== null ? ` from ${eventNation(previousController, otherRebelType).name}` : ""}${war ? ` (${war.name})` : ""}.`
								: `${title} lost control of ${province?.name ?? `province ${rawId}`}${nextId !== null ? ` to ${eventNation(nextId, otherRebelType).name}` : ""}${war ? ` (${war.name})` : ""}.`
						pushTimelineEvent(timelineEvents, {
							id: eventId,
							date: event.date,
							type: nextId === nationId ? "Territory (+)" : "Territory (-)",
							description,
							comment: eventComment(event.comment),
							nations,
							provinces,
							wars: war ? [warMention(war)] : [],
						})
					}
					controller = nextId
					controllerRebelType = isRebelId(nextId) ? nextRebelType : undefined
				} else if (owner === nationId && event.kind === "culture") {
					const cultureId = String(event.payload.cultureId ?? "")
					const culture = cultureMention(history, cultureId)
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
				} else if (owner === nationId && event.kind === "religion") {
					const religionId = String(event.payload.religionId ?? "")
					const religion = religionMention(history, religionId)
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
				} else if (owner === nationId && event.kind === "hre") {
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
						organizations: [organizationMention(history, "HRE")],
					})
				}
			}
		}

		for (const [index, event] of datedEvents(
			record.events.diplomacy,
		).entries()) {
			const firstId = event.firstId
			const secondId = event.secondId
			if (firstId !== nationId && secondId !== nationId) continue
			const otherId = firstId === nationId ? secondId : firstId
			const nations: NationTimelineEvent["nations"] = [eventNation(nationId)]
			addNationMention(nations, otherId)
			const otherName =
				otherId >= 0 ? resolveNationName(otherId) : "another nation"
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
					organizations: [organizationMention(history, "HRE")],
				})
				continue
			}
			const relation = event.kind.startsWith("alliance")
				? "alliance"
				: event.kind.startsWith("guarantee")
					? "guarantee"
					: event.kind.startsWith("royalMarriage")
						? "royal marriage"
						: event.kind.startsWith("rival")
							? "rivalry"
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
					isOverlordPage: firstId === nationId,
					subjectType:
						event.kind === "vassalStart" || event.kind === "vassalEnd"
							? "vassal"
							: event.subjectType,
				})
			} else if (event.kind === "guaranteeStart") {
				description =
					firstId === nationId
						? `${title} guaranteed ${otherName}.`
						: `${title} received a guarantee from ${otherName}.`
			} else if (event.kind === "guaranteeEnd") {
				description =
					firstId === nationId
						? `${title} stopped guaranteeing ${otherName}.`
						: `${title} lost ${otherName}'s guarantee.`
			} else if (event.kind === "unionStart") {
				description =
					firstId === nationId
						? `${title} gained ${otherName} as a junior partner in a personal union.`
						: `${title} became junior partner in a personal union under ${otherName}.`
			} else if (event.kind === "unionEnd") {
				description =
					firstId === nationId
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

		for (const [index, event] of datedEvents(
			record.events.organizationEvents,
		).entries()) {
			if (
				(event.kind !== "join" && event.kind !== "leave") ||
				event.nationId !== nationId
			)
				continue
			const orgId = event.payload.orgId
			const org = organizationMention(history, orgId, event.payload.role)
			const joined = event.kind === "join"
			pushTimelineEvent(timelineEvents, {
				id: `organization:${orgId}:${event.date}:${index}`,
				date: event.date,
				type: joined ? "Organization (+)" : "Organization (-)",
				description: joined
					? `${title} joined the ${org.name}.`
					: `${title} left the ${org.name}.`,
				nations: [eventNation(nationId)],
				organizations: [org],
			})
		}

		for (const war of wars) {
			const participants = new Map<number, "attacker" | "defender">()
			for (const event of war.events)
				participants.set(event.nationId, event.side)
			// Multiple nations often join/leave on the same date (a shared
			// peace treaty, allies declaring together) -- group by
			// (date, kind) the same way WarWikiPage does, so this nation's
			// entry reads as "X, Y, and Z entered War against A and B"
			// instead of only naming this nation.
			const eventGroups = new Map<string, typeof war.events>()
			for (const event of war.events) {
				const key = `${event.date}:${event.kind}`
				const group = eventGroups.get(key)
				if (group) group.push(event)
				else eventGroups.set(key, [event])
			}
			for (const [key, group] of eventGroups) {
				if (!group.some((event) => event.nationId === nationId)) continue
				const date = group[0].date
				const kind = group[0].kind
				const comment = group.find((event) => event.comment)?.comment
				const attackerIds = group
					.filter((event) => event.side === "attacker")
					.map((event) => event.nationId)
				const defenderIds = group
					.filter((event) => event.side === "defender")
					.map((event) => event.nationId)
				const nations: NationTimelineEvent["nations"] = []
				for (const id of [...attackerIds, ...defenderIds])
					addNationMention(nations, id)
				let description: string
				if (kind === "warStart") {
					const attackerNames = attackerIds.map(resolveNationName)
					const defenderNames = defenderIds.map(resolveNationName)
					if (attackerNames.length > 0 && defenderNames.length > 0) {
						description = `${joinWithAnd(attackerNames)} entered ${war.name} against ${joinWithAnd(defenderNames)}.`
					} else {
						// Only one side declared this day (the other side's
						// members were already in the war) -- find its
						// existing opponents so "against" still shows up.
						const joiningSide =
							attackerNames.length > 0 ? "attacker" : "defender"
						const joiningIds =
							attackerNames.length > 0 ? attackerIds : defenderIds
						const joiningNames =
							attackerNames.length > 0 ? attackerNames : defenderNames
						const opponentIds = Array.from(participants.entries())
							.filter(
								([opponentId, side]) =>
									side !== joiningSide && !joiningIds.includes(opponentId),
							)
							.map(([opponentId]) => opponentId)
						for (const opponentId of opponentIds)
							addNationMention(nations, opponentId)
						const opponentNames = opponentIds.map(resolveNationName)
						description = `${joinWithAnd(joiningNames)} entered ${war.name}${opponentNames.length > 0 ? ` against ${joinWithAnd(opponentNames)}` : ""}.`
					}
				} else {
					const names = [...attackerIds, ...defenderIds].map(resolveNationName)
					description = `${joinWithAnd(names)} left ${war.name}.`
				}
				pushTimelineEvent(timelineEvents, {
					id: `war:${war.id}:${key}`,
					date,
					type: kind === "warStart" ? "War (+)" : "War (-)",
					description,
					comment: eventComment(comment),
					nations,
					wars: [warMention(war)],
				})
			}
			for (const [index, battle] of war.battles.entries()) {
				const isAttacker = battle.attacker.countryId === nationId
				const isDefender = battle.defender.countryId === nationId
				if (!isAttacker && !isDefender) continue
				const opponent = isAttacker ? battle.defender : battle.attacker
				const won = isAttacker ? battle.attackerWon : !battle.attackerWon
				const nations: NationTimelineEvent["nations"] = [eventNation(nationId)]
				addNationMention(nations, opponent.countryId)
				const province =
					battle.locationProvinceId !== null
						? provinceMention(String(battle.locationProvinceId), "#94a3b8")
						: null
				const opponentName =
					opponent.countryId !== null
						? resolveNationName(opponent.countryId)
						: "unknown"
				const cost = formatWealthCost(
					(isAttacker ? battle.attacker : battle.defender).wealthCost,
				)
				const description = `${title} ${won ? "won" : "lost"} the Battle of ${battle.name} against ${opponentName} (${war.name})${cost ? `; cost ${cost}` : ""}.`
				pushTimelineEvent(timelineEvents, {
					id: `warBattle:${war.id}:${battle.date}:${index}`,
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
		for (const entry of TITLE_TIMELINE.build({
			record,
			nationId,
			nationName: title,
			provinceName: (province) =>
				history.state.provinceMeta[province]?.name ?? `Province ${province}`,
		}))
			pushTimelineEvent(timelineEvents, {
				id: entry.id,
				date: entry.date,
				type: entry.type,
				description: entry.description,
				nations: [eventNation(nationId)],
				provinces: entry.provinces.flatMap((province) => {
					const mention = provinceMention(String(province), "#94a3b8")
					return mention ? [mention] : []
				}),
			})
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
		const minDay = daysFromMs(history.minTimeMs)
		const provinceHistory: Array<{ date: number; count: number }> = [
			{
				date: minDay,
				count: territoryDeltasByDate.get(Number.NEGATIVE_INFINITY) ?? 0,
			},
		]
		for (const [date, count] of ownedProvinceCountByDate) {
			if (date <= minDay) {
				provinceHistory[0] = { date: minDay, count }
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
		const diplomacyGroups = new Map<number, NationTimelineEvent[]>()
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
			} else if (event.type.startsWith("Diplomacy")) {
				const group = diplomacyGroups.get(event.date) ?? []
				group.push(event)
				diplomacyGroups.set(event.date, group)
			} else {
				mergedTimelineEvents.push(event)
			}
		}
		for (const [date, group] of territorialGroups) {
			if (group.length === 1) {
				mergedTimelineEvents.push(group[0])
				continue
			}
			const mergedType = mergedSignedType({ events: group, label: "Territory" })
			mergedTimelineEvents.push({
				id: `territory:${nationId}:${date}:merged`,
				date,
				dateLabel: DATE.formatHistoryDays(date),
				type: mergedType,
				typeColor: timelineTypeColor(mergedType),
				description: buildMergedTerritoryDescription(group, title),
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
				id: `culture:${nationId}:${date}:merged`,
				date,
				dateLabel: DATE.formatHistoryDays(date),
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
				id: `religion:${nationId}:${date}:merged`,
				date,
				dateLabel: DATE.formatHistoryDays(date),
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
		for (const [date, group] of diplomacyGroups) {
			if (group.length === 1) {
				mergedTimelineEvents.push(group[0])
				continue
			}
			const mergedType = mergedSignedType({ events: group, label: "Diplomacy" })
			mergedTimelineEvents.push({
				id: `diplomacy:${nationId}:${date}:merged`,
				date,
				dateLabel: DATE.formatHistoryDays(date),
				type: mergedType,
				typeColor: timelineTypeColor(mergedType),
				description: buildMergedDiplomacyDescription({ events: group, title }),
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
			(a, b) =>
				compareTimelineDateThenWarEnd(a, b) || a.type.localeCompare(b.type),
		)

		const cultureDistribution = buildStringIdDistributionForProvinces({
			idByProvince: Array.from(frame.provinceCulture, (id) =>
				id >= 0 ? (frame.cultures[id]?.key ?? null) : null,
			),
			provinceIndexes,
			nameById: history.cultureNameById ?? undefined,
			colorById: history.cultureColorById ?? undefined,
			rgbToCss,
			fallbackColor: "rgb(148, 163, 184)",
		})
		const religionDistribution = buildStringIdDistributionForProvinces({
			idByProvince: Array.from(frame.provinceReligion, (id) =>
				id >= 0 ? (frame.religions[id]?.key ?? null) : null,
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
			tierLabel: titleSummary.tier,
			dependencies,
			organizations,
			cultureDistribution,
			religionDistribution,
			climateDistribution,
			vegetationDistribution,
			topographyDistribution,
			showObservedDistributions,
			provinceHistory,
			dateRangeStart: daysFromMs(history.minTimeMs),
			dateRangeEnd: daysFromMs(history.maxTimeMs),
			currentDate: daysFromMs(history.selectedTimeMs),
			currentDateLabel: DATE.formatHistoryTimeMs(history.selectedTimeMs),
			timelineEvents,
			regions: titleSummary.regions,
			onBack: () => setSelectedWikiNationId(null),
			onFocusNation: () => focusNation(nationId),
			onSelectNation: (targetTag: string) => {
				const id = Number(targetTag)
				focusNation(id)
				setSelectedWikiNationId(id)
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
			onSelectWar: (warId: number) => {
				setSelectedWikiWarId(warId)
			},
		}
	}, [
		selectedWikiNationId,
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
		planetName,
		getProvinceColor,
		setSelectedWikiNationId,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
	])
}
