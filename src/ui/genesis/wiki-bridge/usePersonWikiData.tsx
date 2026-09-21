import { useMemo } from "react"
import { DATE } from "@/model/history/earth/date"
import { PERSON_QUERY } from "@/model/history/record/people/query"
import type {
	PersonPage,
	PersonRef,
	SpouseRef,
} from "@/model/history/record/people/query/types"
import type { HistoryState } from "@/model/history/record/types"
import { LIFESPAN } from "@/model/history/sim/people/lifespan"
import type { DeathCause } from "@/model/history/sim/people/log/types"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { uiPalette } from "@/ui/components/tokens"
import { SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE } from "@/ui/genesis/renderer/focus"
import type { PersonWikiDataInput } from "@/ui/genesis/view/types"
import { PERSON_WIKI_TIMELINE } from "@/ui/genesis/wiki-bridge/person-wiki-timeline"
import type { PersonContext } from "@/ui/genesis/wiki-bridge/person-wiki-timeline/types"
import { WIKI_STACK } from "@/ui/genesis/wiki-stack"
import { rgb255ToCss } from "@/ui/wiki/nation/timeline-formatting"
import type {
	PersonWikiChip,
	PersonWikiData,
	PersonWikiLink,
} from "@/ui/wiki/person/PersonWikiPage"

const MS_PER_DAY = 86_400_000
const HEALTH_SCALE = 8

const CAUSE_LABELS: Record<DeathCause, string> = {
	natural: "natural causes",
	childhood: "childhood",
	childbirth: "childbirth",
}

const DIM_TOOLTIPS = {
	unborn: "Not yet born at the selected date",
	dead: "Already dead at the selected date",
}

function yearLabel(timeMs: number): string {
	return DATE.formatEu4Year(DATE.historyTimeMsToYear(timeMs))
}

function sexGlyph(sex: 0 | 1): string {
	return sex === 1 ? "♀" : "♂"
}

function chipOf({
	ref,
	context,
	note,
	tooltip,
}: {
	ref: PersonRef
	context: PersonContext
	note: string | null
	tooltip: string | null
}): PersonWikiChip {
	return {
		key: `${ref.relation}:${ref.id}`,
		id: ref.id,
		name: ref.name,
		color: context.dynastyColor(ref.dynasty),
		sexGlyph: sexGlyph(ref.sex),
		dimmed: ref.dimmed,
		note,
		tooltip: ref.dimReason ? DIM_TOOLTIPS[ref.dimReason] : tooltip,
	}
}

function spouseChip({
	spouse,
	context,
}: {
	spouse: SpouseRef
	context: PersonContext
}): PersonWikiChip {
	const { marriage } = spouse
	const start = yearLabel(marriage.startMs)
	const note =
		marriage.state === "future"
			? `from ${start}`
			: marriage.state === "active"
				? null
				: `${start}–${yearLabel(marriage.endMs ?? marriage.startMs)}${marriage.reason ? `, ${marriage.reason}` : ""}`
	const chip = chipOf({
		ref: spouse,
		context,
		note,
		tooltip:
			marriage.state === "future" ? "Marries after the selected date" : null,
	})
	return {
		...chip,
		key: `spouse:${spouse.id}:${marriage.startMs}`,
		dimmed: chip.dimmed || marriage.state !== "active",
	}
}

function healthLabel(page: PersonPage): string {
	const band = LIFESPAN.bandNames[page.healthBand]
	if (page.status === "dead") {
		const cause = page.deathCause ? ` (${CAUSE_LABELS[page.deathCause]})` : ""
		return `Died in the ${band} band, health ${((page.deathHealth ?? 0) / HEALTH_SCALE).toFixed(1)}${cause}`
	}
	return page.healthSinceMs === null
		? band
		: `${band} since ${yearLabel(page.healthSinceMs)}`
}

function statsOf({
	page,
	state,
	context,
}: {
	page: PersonPage
	state: HistoryState
	context: PersonContext
}): StatEntry[] {
	const culture = state.record.cultures.find((row) => row.id === page.culture)
	const stats: StatEntry[] = [
		{ label: "Gender", value: page.sex === 1 ? "Female" : "Male" },
		{
			label: "Age",
			value:
				page.status === "unborn"
					? "Not yet born"
					: page.status === "dead"
						? `Died aged ${Math.floor(page.ageYears)}`
						: String(Math.floor(page.ageYears)),
		},
		{ label: "Born", value: DATE.formatHistoryTimeMs(page.birthMs) },
	]
	if (page.deathMs !== null)
		stats.push({
			label: "Died",
			value: `${DATE.formatHistoryTimeMs(page.deathMs)}${page.deathCause ? ` (${CAUSE_LABELS[page.deathCause]})` : ""}`,
		})
	stats.push({
		label: "Health",
		value: healthLabel(page),
		swatchColor: uiPalette.healthBands[page.healthBand] ?? null,
	})
	return [
		...stats,
		{
			label: "Culture",
			value: culture?.name ?? `Culture ${page.culture}`,
			swatchColor: culture
				? rgb255ToCss([culture.color[0], culture.color[1], culture.color[2]])
				: null,
		},
		{
			label: "Dynasty",
			value: page.dynastyName,
			swatchColor: context.dynastyColor(page.dynasty),
		},
	]
}

export function usePersonWikiData(
	input: PersonWikiDataInput,
): PersonWikiData | null {
	const {
		selectedWikiPersonId,
		history,
		names,
		getProvinceColor,
		backTitle,
		openWikiPage,
		backWikiPage,
		sceneRef,
	} = input
	const state = history.state
	const context = useMemo(
		() =>
			state && names
				? PERSON_WIKI_TIMELINE.createContext({ state, names, getProvinceColor })
				: null,
		[state, names, getProvinceColor],
	)
	// biome-ignore lint/correctness/useExhaustiveDependencies: history.maxTimeMs signals in-place record appends that the record object identity cannot show.
	const timeline = useMemo(() => {
		if (selectedWikiPersonId === null || !state || !context) return null
		const rows = PERSON_QUERY.timeline({ state, person: selectedWikiPersonId })
		const series = PERSON_QUERY.healthSeries({
			state,
			person: selectedWikiPersonId,
		})
		return {
			events: PERSON_WIKI_TIMELINE.build({ rows, context }),
			countHistory:
				series.length >= 2
					? series.map((point) => ({
							date: point.timeMs / MS_PER_DAY,
							count: point.band,
						}))
					: [],
		}
	}, [selectedWikiPersonId, state, context, history.maxTimeMs])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene ref arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	return useMemo<PersonWikiData | null>(() => {
		if (selectedWikiPersonId === null) return null
		const message = (text: string): PersonWikiData => ({
			kind: "message",
			message: text,
			backTitle,
			onBack: backWikiPage,
		})
		if (!state || !history.query || !names || !context || !timeline)
			return message("Loading history")
		const frame = history.query.frame
		const page = PERSON_QUERY.page({
			state,
			frame,
			names,
			person: selectedWikiPersonId,
			timeMs: frame.timeMs,
		})
		if (!page) return message("Person not found")
		const record = state.record
		const openNation = (nationId: number) =>
			openWikiPage(WIKI_STACK.nationRef({ record, id: nationId }))
		const nationLink = ({
			key,
			label,
			nationId,
		}: {
			key: string
			label: string
			nationId: number | null
		}): PersonWikiLink => ({
			key,
			label,
			onSelect: nationId === null ? null : () => openNation(nationId),
		})
		return {
			kind: "ready",
			name: page.name,
			sexGlyph: sexGlyph(page.sex),
			backTitle,
			dynastyName: page.dynastyName,
			dynastyColor: context.dynastyColor(page.dynasty),
			notice: page.status === "unborn" ? "Not yet born" : null,
			stats: statsOf({ page, state, context }),
			titles: page.titles.map((title) =>
				nationLink({
					key: `title:${title.title}`,
					label: context.titleLabel(title.title),
					nationId: title.realmNationId,
				}),
			),
			parents: page.parents.map((ref) =>
				chipOf({ ref, context, note: null, tooltip: null }),
			),
			spouses: page.spouses.map((spouse) => spouseChip({ spouse, context })),
			children: page.children.map((ref) =>
				chipOf({ ref, context, note: null, tooltip: null }),
			),
			siblings: page.siblings.map((ref) =>
				chipOf({
					ref,
					context,
					note: ref.relation === "half-sibling" ? "half" : null,
					tooltip: null,
				}),
			),
			timelineEvents: timeline.events,
			countHistory: timeline.countHistory,
			formatValue: (value) => LIFESPAN.bandNames[Math.round(value)] ?? "",
			dateRangeStart: record.minTimeMs / MS_PER_DAY,
			dateRangeEnd: record.maxTimeMs / MS_PER_DAY,
			currentDate: frame.timeMs / MS_PER_DAY,
			currentDateLabel: DATE.formatHistoryTimeMs(frame.timeMs),
			onBack: backWikiPage,
			onSelectPerson: (personId, name) =>
				openWikiPage({ kind: "person", id: personId, title: name }),
			onSelectNation: (tag) => openNation(Number(tag)),
			onSelectProvince: (provinceId) => {
				sceneRef.current?.focusOnProvince(provinceId, {
					distanceScale: SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE,
				})
			},
			onSelectDate: (day) => history.setSelectedTimeMs(day * MS_PER_DAY),
		}
	}, [
		selectedWikiPersonId,
		state,
		history.query,
		history.setSelectedTimeMs,
		names,
		context,
		timeline,
		backTitle,
		openWikiPage,
		backWikiPage,
	])
}
