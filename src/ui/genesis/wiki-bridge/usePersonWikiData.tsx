import { useMemo } from "react"
import { COLOR } from "@/model/history/earth/color"
import { DATE } from "@/model/history/earth/date"
import { HISTORY } from "@/model/history/record"
import { PERSON_NAMES } from "@/model/history/record/people/names"
import type { NamedPerson } from "@/model/history/record/people/names/types"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type {
	PersonView,
	TenureView,
} from "@/model/history/record/people/query/types"
import type { RecordPerson } from "@/model/history/record/people/types"
import { yearMs } from "@/model/history/sim/engine/state/time"
import type { HealthCondition } from "@/model/history/sim/people/health/ageing/types"
import { HOLDINGS } from "@/model/history/sim/people/holdings"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { OpinionMemoryReason } from "@/model/history/sim/people/opinion/memory/types"
import { ORIENTATION } from "@/model/history/sim/people/orientation"
import type { DeathCause } from "@/model/history/sim/people/types"
import { FRAME } from "@/model/history/world-frame"
import { TEXT } from "@/model/shared/text"
import { TITLES } from "@/model/society/titles"
import type { TitleTier } from "@/model/society/titles/types"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { EntityChip } from "@/ui/components/composites/EntityChip"
import { GraveStoneIcon } from "@/ui/components/primitives/icons/GraveStoneIcon"
import { HeartIcon } from "@/ui/components/primitives/icons/HeartIcon"
import { uiPalette } from "@/ui/components/tokens"
import { SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE } from "@/ui/genesis/renderer/focus"
import { PERSON_TRAITS } from "@/ui/genesis/shared/person-traits"
import { TITLE_TIER_LABELS } from "@/ui/genesis/shared/title-colors"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import { PERSON_TITLE } from "@/ui/genesis/wiki-bridge/person-title"
import { TITLE_SUMMARY } from "@/ui/genesis/wiki-bridge/title-summary"
import type { PartitionStatParams } from "@/ui/genesis/wiki-bridge/types"
import {
	paletteColorForDynasty,
	pushTimelineEvent,
} from "@/ui/wiki/nation/timeline-formatting"
import type {
	PersonWikiChip,
	PersonWikiData,
	PersonWikiOpinion,
} from "@/ui/wiki/person/PersonWikiPage"
import type { WikiTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

const DAY_MS = 86_400_000

function signed(value: number): string {
	const rounded = Math.round(value * 10) / 10
	return `${rounded > 0 ? "+" : ""}${rounded}`
}

function opinionColor(total: number): string {
	if (Math.round(total) === 0) return uiPalette.person.opinion.neutral
	return total > 0
		? uiPalette.person.opinion.positive
		: uiPalette.person.opinion.negative
}
const CONDITION_LABELS: Record<HealthCondition, string> = {
	infirm: "Infirm",
	clouded_eyes: "Clouded Eyes",
	fragile_bones: "Fragile Bones",
	withering_mind: "Withering Mind",
	faltering_heart: "Faltering Heart",
	blind: "Blind",
	incapable: "Incapable",
}
const DEATH_LABELS: Record<DeathCause, string> = {
	natural: "Natural causes",
	heart: "Heart failure",
	battle: "Killed in battle",
	childbirth: "Childbirth",
}
const MEMORY_LABELS: Record<OpinionMemoryReason, string> = {
	aid: "Aided in war",
	abandonment: "Abandoned in war",
	attack: "Attacked",
	usurpation: "Usurped the throne",
	grant: "Granted a district",
	coronation_uncrowned: "No coronation gifts",
	coronation_humble: "Humble coronation",
	coronation_lavish: "Lavish coronation",
	coronation_magnificent: "Magnificent coronation",
}
const DEATH_VERBS = {
	died: "died",
	"died of heart failure": "died of heart failure",
	"killed in battle": "was killed in battle",
}

export function usePersonWikiData(
	input: PersonWikiDataInput,
): PersonWikiData | null {
	const {
		religionSelection,
		selectedWikiPersonId,
		history,
		sceneRef,
		setSelectedWikiNationId,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		setSelectedWikiPersonId,
	} = input
	return useMemo<PersonWikiData | null>(() => {
		if (selectedWikiPersonId === null || !history.state) return null
		const state = history.state
		const people = state.record.people
		const person = PERSON_NAMES.person({
			people: people ?? null,
			person: selectedWikiPersonId,
		})
		if (!people || !person) return null
		const id = selectedWikiPersonId
		const selectedTimeMs = history.selectedTimeMs
		const viewTimeMs = selectedTimeMs
		const view = PERSON_QUERY.view({ people, id, timeMs: viewTimeMs })
		if (!view) return null

		const dateLabel = (timeMs: number) =>
			DATE.formatHistoryDays(timeMs / DAY_MS)
		const ageAt = (row: RecordPerson, timeMs: number) =>
			Math.floor((timeMs - row.birthTimeMs) / yearMs)
		const colorOf = (row: NamedPerson) =>
			row.house ? paletteColorForDynasty(row.house) : uiPalette.person.noHouse
		const lifeLabel = (row: RecordPerson) =>
			row.deathTimeMs <= selectedTimeMs
				? `${dateLabel(row.birthTimeMs)} – ${dateLabel(row.deathTimeMs)}`
				: `born ${dateLabel(row.birthTimeMs)}`
		const mention = (personId: number) => {
			const row = PERSON_NAMES.person({ people, person: personId })
			return row ? { id: personId, name: row.name, color: colorOf(row) } : null
		}
		const opinionOf = (other: number): PersonWikiOpinion | undefined => {
			const breakdown = PERSON_QUERY.opinion({
				people,
				a: id,
				b: other,
				timeMs: viewTimeMs,
				record: state.record,
			})
			if (!breakdown) return undefined
			const factors = Object.entries(breakdown)
				.filter(([key]) => key !== "total")
				.map(([key, value]) => `${key}: ${signed(value)}`)
				.join(" · ")
			const memories = PERSON_QUERY.activeMemories({
				people,
				a: id,
				b: other,
				timeMs: viewTimeMs,
			}).map(
				(memory) =>
					`${MEMORY_LABELS[memory.reason]} (${dateLabel(memory.startTimeMs)}): ${signed(memory.strength)}`,
			)
			return {
				label: signed(breakdown.total),
				color: opinionColor(breakdown.total),
				detail: [`Sees them: ${factors}`, ...memories].join("\n"),
			}
		}
		const personChip = (personId: number): PersonWikiChip | null => {
			const row = PERSON_NAMES.person({ people, person: personId })
			if (!row || row.birthTimeMs > viewTimeMs) return null
			return {
				opinion: personId === id ? undefined : opinionOf(personId),
				key: `person:${personId}`,
				name: row.name,
				color: colorOf(row),
				dimmed: row.deathTimeMs <= selectedTimeMs,
				title: lifeLabel(row),
				onClick: () => setSelectedWikiPersonId(personId),
			}
		}
		const chips = (ids: number[]) =>
			ids.flatMap((personId): PersonWikiChip[] => {
				const chip = personChip(personId)
				return chip ? [chip] : []
			})

		const nationAt = (seat: number, timeMs: number) => {
			const frame = HISTORY.frameAt({ state, timeMs })
			const nationId = frame.provinceNation[seat] ?? -1
			const nation = frame.nations.get(nationId)
			if (nationId < 0 || !nation) return null
			return {
				tag: String(nationId),
				name: nation.name,
				color: COLOR.rgb01ToCss([
					nation.color[0] / 255,
					nation.color[1] / 255,
					nation.color[2] / 255,
				]),
			}
		}
		const provinceMention = (seat: number) => ({
			id: seat,
			name: state.provinceMeta[seat]?.name ?? `Province ${seat}`,
			color: uiPalette.person.noHouse,
		})
		// Rank of the seat's title: a realm's highest title for a throne, the
		// seat's own title for a district.
		const rankAt = (seat: number, timeMs: number, sovereign: boolean) => {
			const frame = HISTORY.frameAt({ state, timeMs })
			if (!frame.titles) return null
			if (sovereign) {
				const nationId = frame.provinceNation[seat] ?? -1
				return nationId < 0
					? null
					: TITLE_SUMMARY.describe({
							frame,
							nationId,
							provinceName: (province) =>
								state.provinceMeta[province]?.name ?? `Province ${province}`,
						}).tier
			}
			const report = FRAME.directReports({ frame }).find(
				(entry) => entry.seat === seat,
			)
			return report ? TITLE_TIER_LABELS[TITLES.tierOrder[report.tier]] : null
		}
		const seatLabel = (seat: number, timeMs: number, sovereign: boolean) => {
			const rank = rankAt(seat, timeMs, sovereign)
			const nation = nationAt(seat, timeMs)
			const province = provinceMention(seat).name
			if (sovereign) {
				const name = nation?.name ?? province
				return rank ? `${name} (${rank})` : name
			}
			return rank ? `${rank} of ${province}` : province
		}
		const selectNation = (tag: string) => setSelectedWikiNationId(Number(tag))
		const focusProvince = (provinceId: number) =>
			sceneRef.current?.focusOnProvince(provinceId, {
				distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
			})

		const tenureSpan = (tenure: TenureView) =>
			`${tenure.startTimeMs === null ? "start unknown" : dateLabel(tenure.startTimeMs)} – ${tenure.endTimeMs === null ? "" : dateLabel(tenure.endTimeMs)}`

		const seatChip = (tenure: TenureView): PersonWikiChip | null => {
			const labelTime =
				tenure.endTimeMs === null
					? viewTimeMs
					: (tenure.startTimeMs ?? viewTimeMs)

			const nation = nationAt(
				tenure.seat,
				Math.max(state.record.minTimeMs, labelTime),
			)

			const span = tenureSpan(tenure)

			if (tenure.kind === "regent") {
				const ward = PERSON_NAMES.person({ people, person: tenure.ward })
				return nation
					? {
							key: `regent:${tenure.seat}:${tenure.startTimeMs}`,
							name: `Regent of ${seatLabel(tenure.seat, labelTime, true)}`,
							color: nation.color,
							dimmed: tenure.endTimeMs !== null,
							title: `Regent${ward ? ` for ${ward.name}` : ""}, ${span}`,
							onClick: () => selectNation(nation.tag),
						}
					: null
			}
			if (tenure.kind === "ruler")
				return nation
					? {
							key: `seat:${tenure.seat}:${tenure.startTimeMs}`,
							name: seatLabel(tenure.seat, labelTime, true),
							color: nation.color,
							dimmed: tenure.endTimeMs !== null,
							title: `Ruler, ${span}`,
							onClick: () => selectNation(nation.tag),
						}
					: null
			const province = provinceMention(tenure.seat)
			return {
				key: `seat:${tenure.seat}:${tenure.startTimeMs}`,
				name: seatLabel(tenure.seat, labelTime, false),
				color: nation?.color ?? province.color,
				dimmed: tenure.endTimeMs !== null,
				title: `District${nation ? ` of ${nation.name}` : ""}, ${span}`,
				onClick: () => focusProvince(tenure.seat),
			}
		}

		const health = PERSON_QUERY.health({ people, id, timeMs: selectedTimeMs })
		const alive = person.deathTimeMs > selectedTimeMs
		const stats: StatEntry[] = [
			...(person.house
				? [
						{
							label: "House",
							value: person.house,
							swatchColor: colorOf(person),
						},
					]
				: []),
			{ label: "Sex", value: person.sex === 1 ? "Female" : "Male" },
			{
				label: alive ? "Age" : "Died aged",
				value: String(ageAt(person, alive ? viewTimeMs : person.deathTimeMs)),
				valueAction: alive ? (
					health ? (
						<span title={`Health: ${health}`}>
							<HeartIcon
								className="h-2.5 w-2.5"
								style={{ color: uiPalette.person.health[health] }}
							/>
						</span>
					) : undefined
				) : (
					<span title="Deceased">
						<GraveStoneIcon
							className="h-2.5 w-2.5"
							style={{ color: uiPalette.person.deceased }}
						/>
					</span>
				),
			},
		]
		if (view.orientation !== null)
			stats.push({
				label: "Orientation",
				value: ORIENTATION.names[view.orientation],
			})
		const conditions = alive
			? PERSON_QUERY.conditions({ people, id, timeMs: selectedTimeMs })
			: []
		if (conditions.length > 0)
			stats.push({
				label: "Conditions",
				value: conditions
					.map(({ condition, level }) =>
						condition === "blind" || condition === "incapable"
							? CONDITION_LABELS[condition]
							: `${CONDITION_LABELS[condition]} ${TEXT.roman(level + 1)}`,
					)
					.join(", "),
				swatchColor:
					uiPalette.person.condition[
						Math.max(...conditions.map(({ level }) => level), 0)
					],
			})
		const deathCause = PERSON_QUERY.deathCause({
			people,
			id,
			timeMs: selectedTimeMs,
		})
		if (deathCause)
			stats.push({ label: "Cause of death", value: DEATH_LABELS[deathCause] })

		const characterTraits = PERSON_QUERY.traits({
			people,
			id,
			timeMs: viewTimeMs,
		})
		const attributes: StatEntry[] = PERSON_QUERY.attributes({
			people,
			id,
			timeMs: viewTimeMs,
		}).map((entry) => ({
			label: entry.name,
			value: `${entry.value} · ${entry.tier}`,
		}))
		const personality = (characterTraits?.personality ?? []).map(
			PERSON_TRAITS.personality,
		)
		const physical = [
			...(characterTraits?.grades ?? []).map(PERSON_TRAITS.grade),
			...(characterTraits?.congenital ?? []).map(PERSON_TRAITS.congenital),
		]
		const timelineEvents: WikiTimelineEvent[] = []
		const fullTimeMs = state.record.maxTimeMs
		const fullView = PERSON_QUERY.view({ people, id, timeMs: fullTimeMs })
		const self = mention(id)
		const selfMentions = self ? [self] : []
		for (const [index, event] of PERSON_QUERY.timeline({
			people,
			id,
			timeMs: fullTimeMs,
		}).entries()) {
			const base = {
				id: `person:${id}:${index}`,
				date: event.timeMs / DAY_MS,
			}
			if (event.kind === "moved") {
				const province = provinceMention(event.other)
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Life",
					description: `${person.name} moved to ${province.name}.`,
					people: selfMentions,
					provinces: [province],
				})
			}

			if (event.kind === "born") {
				const parents = [person.father, person.mother].flatMap(
					(parent): WikiTimelineEvent["people"] => {
						const other = mention(parent)
						return other ? [other] : []
					},
				)
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Life",
					description:
						parents.length > 0
							? `${person.name} was born to ${parents.map((p) => p.name).join(" and ")}.`
							: `${person.name} was born.`,
					people: [...selfMentions, ...parents],
				})
			} else if (
				event.kind === "died" ||
				event.kind === "died of heart failure" ||
				event.kind === "killed in battle"
			) {
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Life",
					description: `${person.name} ${DEATH_VERBS[event.kind]} aged ${ageAt(person, event.timeMs)}.`,
					people: selfMentions,
				})
			} else if (
				event.kind === "condition gained" ||
				event.kind === "condition worsened" ||
				event.kind === "condition lost" ||
				event.kind === "became blind" ||
				event.kind === "became incapable"
			) {
				const label = CONDITION_LABELS[PEOPLE_LOG.conditions[event.other]]
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Life",
					description:
						event.kind === "became blind"
							? `${person.name} went blind.`
							: event.kind === "became incapable"
								? `${person.name} became incapable.`
								: event.kind === "condition gained"
									? `${person.name} developed ${label}.`
									: event.kind === "condition worsened"
										? `${person.name}'s ${label} worsened.`
										: `${person.name} no longer had ${label}.`,
					people: selfMentions,
				})
			} else if (
				event.kind === "miscarriage" ||
				event.kind === "stillborn child" ||
				event.kind === "died in childbirth"
			) {
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Family",
					description:
						event.kind === "miscarriage"
							? `${person.name} suffered a miscarriage.`
							: event.kind === "stillborn child"
								? `${person.name} gave birth to a stillborn child.`
								: `${person.name} died in childbirth aged ${ageAt(person, event.timeMs)}.`,
					people: selfMentions,
				})
			} else if (
				event.kind === "married" ||
				event.kind === "betrothed" ||
				event.kind === "betrothal broken" ||
				event.kind === "betrothal broken for kinship" ||
				event.kind === "child born"
			) {
				const other = mention(event.other)
				if (!other) continue
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Family",
					description:
						event.kind === "married"
							? `${person.name} married ${other.name}.`
							: event.kind === "betrothed"
								? `${person.name} was betrothed to ${other.name}.`
								: event.kind === "betrothal broken for kinship"
									? `${person.name}’s betrothal to ${other.name} was broken because they share known ancestry.`
									: event.kind === "betrothal broken"
										? `${person.name}'s betrothal to ${other.name} was broken.`
										: `${other.name} was born to ${person.name}.`,
					people: [...selfMentions, other],
				})
			} else if (event.kind === "regent appointed") {
				const regent = mention(event.other)
				if (!regent) continue
				const tenure = fullView?.regents[event.tenure]
				const nation = tenure ? nationAt(tenure.seat, event.timeMs) : null
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Ruler",
					description: `${regent.name} became regent${nation ? ` of ${nation.name}` : ""} for ${person.name}.`,
					people: [...selfMentions, regent],
					nations: nation ? [nation] : [],
				})
			} else if (
				event.kind === "became regent" ||
				event.kind === "left regency"
			) {
				const tenure = fullView?.tenures[event.tenure]
				const ward = mention(tenure?.ward ?? -1)
				const at =
					event.kind === "became regent" ? event.timeMs : event.timeMs - DAY_MS
				const nation = nationAt(event.other, at)
				const place = seatLabel(event.other, at, true)
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Ruler",
					description:
						event.kind === "became regent"
							? `${person.name} became regent of ${place}${ward ? ` for ${ward.name}` : ""}.`
							: `${person.name}'s regency of ${place} ended.`,
					people: ward ? [...selfMentions, ward] : selfMentions,
					nations: nation ? [nation] : [],
				})
			} else {
				const tenure = fullView?.tenures[event.tenure]
				const sovereign = tenure?.kind !== "district"
				const nation = nationAt(
					event.other,
					event.kind === "took seat" ? event.timeMs : event.timeMs - DAY_MS,
				)
				const province = provinceMention(event.other)
				const at =
					event.kind === "took seat" ? event.timeMs : event.timeMs - DAY_MS
				const place = seatLabel(event.other, at, sovereign)
				const district =
					rankAt(event.other, at, false) === null ? place : `the ${place}`
				const divided =
					event.reason === "partition"
						? nationAt(event.other, event.timeMs - DAY_MS)
						: null
				const partition =
					event.reason !== "partition"
						? ""
						: divided
							? ` in the partition of ${divided.name}`
							: " in a partition"
				const reason =
					event.reason === "succession"
						? "after a succession"
						: event.reason === "usurpation"
							? "in a usurpation"
							: event.reason === "rebellion"
								? "after a rebellion"
								: event.reason === "restoration"
									? "after a restoration"
									: event.reason === "union"
										? "when the realms united"
										: event.reason === "promotion"
											? "after promotion"
											: event.reason === "demotion"
												? "after demotion"
												: event.reason === "territorial change"
													? "after a territorial change"
													: event.reason === "district grant"
														? "when the seat was granted"
														: ""
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Ruler",
					description:
						event.kind === "took seat"
							? sovereign
								? `${person.name} became ruler of ${place}${partition}.`
								: partition
									? `${person.name} took the seat of ${district}${partition}.`
									: `${person.name} was granted ${district}${nation ? ` in ${nation.name}` : ""}.`
							: sovereign
								? `${person.name} lost the throne of ${place}${reason ? ` ${reason}` : ""}.`
								: `${person.name} lost ${district}${partition}.`,
					people: selfMentions,
					nations: [nation, divided].flatMap((entry, index, all) =>
						entry &&
						all.findIndex((other) => other?.tag === entry.tag) === index
							? [entry]
							: [],
					),
					provinces: sovereign ? [] : [province],
				})
			}
		}

		const tierOfView = (personView: PersonView | null): TitleTier | null => {
			if (!personView) return null
			let highest = -1
			for (const tenure of personView.tenures) {
				if (tenure.kind === "regent" || tenure.endTimeMs !== null) continue
				highest = Math.max(
					highest,
					0,
					TITLES.tierOrder.findIndex(
						(tier) =>
							TITLE_TIER_LABELS[tier] ===
							rankAt(tenure.seat, viewTimeMs, tenure.kind === "ruler"),
					),
				)
			}
			return highest < 0 ? null : TITLES.tierOrder[highest]
		}
		const royalParent = [view.father, view.mother].flatMap((parent) => {
			if (parent < 0) return []
			const parentView = PERSON_QUERY.view({
				people,
				id: parent,
				timeMs: viewTimeMs,
			})
			const tier = tierOfView(parentView)
			return parentView && PERSON_TITLE.royal(tier)
				? [{ tier, view: parentView }]
				: []
		})[0]
		const crown =
			royalParent !== undefined &&
			PERSON_TITLE.isCrown({
				person: id,
				children: royalParent.view.children.flatMap((child) => {
					const row = PERSON_NAMES.person({ people, person: child })
					return row &&
						row.birthTimeMs <= viewTimeMs &&
						row.deathTimeMs > viewTimeMs
						? [
								{
									id: child,
									female: row.sex === 1,
									birthTimeMs: row.birthTimeMs,
								},
							]
						: []
				}),
			})

		const activeTenures = view.tenures.filter(
			(tenure) => tenure.kind !== "regent" && tenure.endTimeMs === null,
		)
		const ranks = new Uint8Array(state.provinceMap.compactToRealId.length)
		for (const tenure of activeTenures)
			ranks[tenure.seat] = Math.max(
				0,
				TITLES.tierOrder.findIndex(
					(tier) =>
						TITLE_TIER_LABELS[tier] ===
						rankAt(tenure.seat, viewTimeMs, tenure.kind === "ruler"),
				),
			)
		const held = HOLDINGS.order({
			seats: activeTenures.map((tenure) => tenure.seat),
			ranks,
		}).flatMap((seat) => activeTenures.filter((tenure) => tenure.seat === seat))

		const residence = PERSON_QUERY.residenceAt({
			people,
			id,
			timeMs: viewTimeMs,
		})
		const realm = PERSON_QUERY.realmAt({
			people,
			id,
			timeMs: viewTimeMs,
			record: state.record,
		})
		const capitalProvince =
			realm < 0
				? -1
				: (state.record.events.nationEvents[realm]?.base.capitalProvinceId ??
					-1)
		const capitalFrame = HISTORY.frameAt({ state, timeMs: viewTimeMs })
		const realmChip: PersonWikiChip | null =
			realm < 0
				? null
				: {
						key: `realm:${realm}`,
						dimmed: false,
						name: state.record.nations[realm]?.name ?? "Unknown realm",
						color:
							nationAt(realm, Math.max(state.record.minTimeMs, viewTimeMs))
								?.color ?? uiPalette.person.noHouse,
						title: "Territorial sovereign of residence",
						onClick: () => setSelectedWikiNationId(realm),
					}
		const residenceChip: PersonWikiChip | null =
			residence < 0
				? null
				: {
						key: `residence:${residence}`,
						dimmed: false,
						name: provinceMention(residence).name,
						color:
							nationAt(residence, Math.max(state.record.minTimeMs, viewTimeMs))
								?.color ?? uiPalette.person.noHouse,
						title: "Current household location",
						onClick: () => focusProvince(residence),
					}
		const partitionStat = ({
			label,
			rows,
			assigned,
			select,
		}: PartitionStatParams) => {
			const row =
				realm < 0 ? undefined : rows.find((entry) => entry.id === assigned)
			const color = row
				? COLOR.rgb01ToCss([
						row.color[0] / 255,
						row.color[1] / 255,
						row.color[2] / 255,
					])
				: null
			const onClick = row && select ? select(row) : undefined
			if (row && color && onClick) {
				stats.push({
					label,
					value: "",
					valueAction: (
						<EntityChip name={row.name} color={color} onClick={onClick} />
					),
				})
				return
			}
			stats.push({
				label,
				value: row?.name ?? "Unknown",
				swatchColor: color,
			})
		}
		partitionStat({
			label: "Culture",
			rows: state.record.cultures,
			assigned: capitalFrame.provinceCulture[capitalProvince],
			select: null,
		})
		partitionStat({
			label: "Religion",
			rows: state.record.religions,
			assigned: capitalFrame.provinceReligion[capitalProvince],
			select: (row) => religionSelection.forKey(row.key),
		})
		if (realmChip || residenceChip)
			stats.push({
				label: "Residence",
				value: "",
				valueAction: (
					<span className="inline-flex items-center gap-1">
						{realmChip ? (
							<EntityChip
								name={realmChip.name}
								color={realmChip.color}
								title={realmChip.title}
								onClick={realmChip.onClick}
							/>
						) : null}
						{realmChip && residenceChip ? <span>·</span> : null}
						{residenceChip ? (
							<EntityChip
								name={residenceChip.name}
								color={residenceChip.color}
								title={residenceChip.title}
								onClick={residenceChip.onClick}
							/>
						) : null}
					</span>
				),
			})
		return {
			name: person.name,
			title: PERSON_TITLE.of({
				female: person.sex === 1,
				hasHouse: Boolean(person.house),
				tier: tierOfView(view),
				royalParent: royalParent?.tier ?? null,
				crown: crown && alive,
			}),
			life: `${dateLabel(person.birthTimeMs)} – ${alive ? "present" : dateLabel(person.deathTimeMs)}`,
			stats,
			attributes,
			personality,
			physical,
			titles: held.flatMap((tenure, index): PersonWikiChip[] => {
				const chip = seatChip(tenure)
				return chip
					? [
							{
								...chip,
								title:
									index === 0 ? `Primary title · ${chip.title}` : chip.title,
							},
						]
					: []
			}),
			groups: [
				{
					label: "Regencies",

					chips: view.tenures

						.filter(
							(tenure) => tenure.kind === "regent" && tenure.endTimeMs === null,
						)

						.flatMap((tenure) => {
							const chip = seatChip(tenure)

							return chip ? [chip] : []
						}),
				},

				{
					label: "Previous titles",
					chips: view.tenures
						.filter(
							(tenure) => tenure.kind !== "regent" && tenure.endTimeMs !== null,
						)
						.flatMap((tenure) => {
							const chip = seatChip(tenure)
							return chip ? [chip] : []
						}),
				},

				{ label: "Parents", chips: chips([view.father, view.mother]) },
				{ label: "Siblings", chips: chips(view.siblings) },
				{
					label: "Spouses",
					chips: chips(view.spouses.map((spouse) => spouse.person)),
				},
				{
					label: "Betrothed",
					chips: chips(
						view.betrothals
							.filter((betrothal) => betrothal.endTimeMs === null)
							.map((betrothal) => betrothal.person),
					),
				},
				{
					label: "Consorts",
					chips: chips(view.consorts.map((tie) => tie.person)),
				},
				{
					label:
						view.patron?.consortKind === "wife"
							? "Additional wife of"
							: "Concubine of",
					chips: chips(view.patron ? [view.patron.person] : []),
				},
				{ label: "Children", chips: chips(view.children) },
			],
			timelineEvents,
			dateRangeStart: history.minTimeMs / DAY_MS,
			dateRangeEnd: history.maxTimeMs / DAY_MS,
			currentDate: selectedTimeMs / DAY_MS,
			currentDateLabel: DATE.formatHistoryTimeMs(selectedTimeMs),
			onSelectNation: selectNation,
			onSelectProvince: focusProvince,
			onSelectPerson: (personId: number) => setSelectedWikiPersonId(personId),
			onSelectDate: (day: number) => history.setSelectedTimeMs(day * DAY_MS),
			onSelectOrganization: (orgId: string) =>
				setSelectedWikiOrganizationId(orgId),
			onSelectWar: (warId: number) => setSelectedWikiWarId(warId),
		}
	}, [
		religionSelection,
		selectedWikiPersonId,
		history.state,
		history.selectedTimeMs,
		history.setSelectedTimeMs,
		history.minTimeMs,
		history.maxTimeMs,
		setSelectedWikiNationId,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		setSelectedWikiPersonId,
		sceneRef.current?.focusOnProvince,
	])
}
