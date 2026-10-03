import { useMemo } from "react"
import { COLOR } from "@/model/history/earth/color"
import { DATE } from "@/model/history/earth/date"
import { HISTORY } from "@/model/history/record"
import { PERSON_NAMES } from "@/model/history/record/people/names"
import type { NamedPerson } from "@/model/history/record/people/names/types"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type { TenureView } from "@/model/history/record/people/query/types"
import type { RecordPerson } from "@/model/history/record/people/types"
import { yearMs } from "@/model/history/sim/engine/state/time"
import { FRAME } from "@/model/history/world-frame"
import { TITLES } from "@/model/society/titles"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { uiPalette } from "@/ui/components/tokens"
import { SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE } from "@/ui/genesis/renderer/focus"
import { TITLE_TIER_LABELS } from "@/ui/genesis/shared/title-colors"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import { TITLE_SUMMARY } from "@/ui/genesis/wiki-bridge/title-summary"
import {
	paletteColorForDynasty,
	pushTimelineEvent,
} from "@/ui/wiki/nation/timeline-formatting"
import type {
	PersonWikiChip,
	PersonWikiData,
} from "@/ui/wiki/person/PersonWikiPage"
import type { WikiTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

const DAY_MS = 86_400_000

export function usePersonWikiData(
	input: PersonWikiDataInput,
): PersonWikiData | null {
	const {
		selectedWikiPersonId,
		history,
		planetName,
		sceneRef,
		setSelectedWikiNationId,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		setSelectedWikiPersonId,
	} = input
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
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
		const viewTimeMs = Math.max(selectedTimeMs, person.birthTimeMs)
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
		const personChip = (personId: number): PersonWikiChip | null => {
			const row = PERSON_NAMES.person({ people, person: personId })
			if (!row || row.birthTimeMs > viewTimeMs) return null
			return {
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
			return report
				? TITLE_TIER_LABELS[TITLES.tierOrder[frame.titles.tier[report.title]]]
				: null
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
		const seatChip = (tenure: TenureView): PersonWikiChip | null => {
			const nation = nationAt(tenure.seat, tenure.startTimeMs)
			const span = `${dateLabel(tenure.startTimeMs)} – ${
				tenure.endTimeMs === null ? "" : dateLabel(tenure.endTimeMs)
			}`
			if (tenure.kind === "regent") {
				const ward = PERSON_NAMES.person({ people, person: tenure.ward })
				return nation
					? {
							key: `regent:${tenure.seat}:${tenure.startTimeMs}`,
							name: `Regent of ${seatLabel(tenure.seat, tenure.startTimeMs, true)}`,
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
							name: seatLabel(tenure.seat, tenure.startTimeMs, true),
							color: nation.color,
							dimmed: tenure.endTimeMs !== null,
							title: `Ruler, ${span}`,
							onClick: () => selectNation(nation.tag),
						}
					: null
			const province = provinceMention(tenure.seat)
			return {
				key: `seat:${tenure.seat}:${tenure.startTimeMs}`,
				name: seatLabel(tenure.seat, tenure.startTimeMs, false),
				color: nation?.color ?? province.color,
				dimmed: tenure.endTimeMs !== null,
				title: `District${nation ? ` of ${nation.name}` : ""}, ${span}`,
				onClick: () => focusProvince(tenure.seat),
			}
		}

		const health = PERSON_QUERY.health({ people, id, timeMs: selectedTimeMs })
		const alive = person.deathTimeMs > selectedTimeMs
		const stats: StatEntry[] = [
			{ label: "Sex", value: person.sex === 1 ? "Female" : "Male" },
			{
				label: alive ? "Age" : "Died aged",
				value: String(ageAt(person, alive ? viewTimeMs : person.deathTimeMs)),
			},
			{ label: "House", value: person.house ?? "None" },
		]
		if (health)
			stats.push({
				label: "Health",
				value: health,
				swatchColor: uiPalette.person.health[health],
			})

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
			} else if (event.kind === "died") {
				pushTimelineEvent(timelineEvents, {
					...base,
					type: "Life",
					description: `${person.name} died aged ${ageAt(person, event.timeMs)}.`,
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

		const lifeEnd = alive ? "" : ` – ${dateLabel(person.deathTimeMs)}`
		return {
			name: person.name,
			houseColor: colorOf(person),
			metaLabel: `${person.house ? `House ${person.house} · ` : ""}${dateLabel(person.birthTimeMs)}${lifeEnd}`,
			planetTitle: planetName,
			stats,
			groups: [
				{
					label: "Titles",
					chips: view.tenures.flatMap((tenure): PersonWikiChip[] => {
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
				{ label: "Children", chips: chips(view.children) },
			],
			timelineEvents,
			dateRangeStart: history.minTimeMs / DAY_MS,
			dateRangeEnd: history.maxTimeMs / DAY_MS,
			currentDate: selectedTimeMs / DAY_MS,
			currentDateLabel: DATE.formatHistoryTimeMs(selectedTimeMs),
			onBack: () => setSelectedWikiPersonId(null),
			onSelectNation: selectNation,
			onSelectProvince: focusProvince,
			onSelectPerson: (personId: number) => setSelectedWikiPersonId(personId),
			onSelectDate: (day: number) => history.setSelectedTimeMs(day * DAY_MS),
			onSelectOrganization: (orgId: string) =>
				setSelectedWikiOrganizationId(orgId),
			onSelectWar: (warId: number) => setSelectedWikiWarId(warId),
		}
	}, [
		selectedWikiPersonId,
		history.state,
		history.selectedTimeMs,
		history.setSelectedTimeMs,
		history.minTimeMs,
		history.maxTimeMs,
		planetName,
		setSelectedWikiNationId,
		setSelectedWikiOrganizationId,
		setSelectedWikiWarId,
		setSelectedWikiPersonId,
	])
}
