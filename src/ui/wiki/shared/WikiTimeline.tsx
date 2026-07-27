import React, { useState } from "react"
import { DATE } from "@/model/history/earth/date"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"

/** One timeline entry shared by the nation and organization wiki pages --
 * built by GenesisView from the earth-history engine's raw events. Mentions
 * (nations/provinces/cultures/religions/organizations) are matched by name
 * against `description` and rendered as clickable/swatched inline links --
 * see renderLinkedTimelineText. */
export interface WikiTimelineEvent {
	id: string
	date: number
	dateLabel: string
	type: string
	typeColor: string
	description: string
	comment?: string
	plainTextRanges?: Array<{ start: number; end: number }>
	nations: Array<{ tag: string; name: string; color: string; link?: boolean }>
	provinces: Array<{ id: number; name: string; color: string }>
	cultures: Array<{ id: string; name: string; color: string }>
	religions: Array<{ id: string; name: string; color: string }>
	dynasties: Array<{ id: string; name: string; color: string }>
	/** International organizations (HRE, Hanseatic League, ...) mentioned in
	 * this event's description -- clicking navigates to that org's wiki
	 * page via refs.onSelectOrganization. */
	organizations: Array<{ id: string; name: string; color: string }>
	/** Wars (wars.json) mentioned in this event's description -- clicking
	 * navigates to that war's wiki page via refs.onSelectWar. */
	wars: Array<{ id: string; name: string; color: string }>
}

interface WikiTimelineRefs {
	onSelectNation: (tag: string) => void
	onSelectProvince: (provinceId: number) => void
	onSelectOrganization: (orgId: string) => void
	onSelectWar: (warId: string) => void
	onSelectDate: (date: number) => void
}

export interface WikiCountHistoryPoint {
	date: number
	count: number
}

// Always-open section: everything on the page stays visible so the reader
// scans by scrolling instead of toggling accordions open one at a time.
export function WikiSection({
	title,
	meta,
	children,
}: {
	title: string
	meta?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<Surface
			tone="panel"
			borderTone="default"
			radius="xl"
			className="border-t border-slate-200 px-3 py-2.5"
		>
			<div className="mb-1.5 flex items-baseline justify-between gap-2">
				<span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
					{title}
				</span>
				{meta ? (
					<span className="font-mono text-[8px] text-slate-400">{meta}</span>
				) : null}
			</div>
			{children}
		</Surface>
	)
}

function compareMentionsByLength(
	a: { name: string },
	b: { name: string },
): number {
	return b.name.length - a.name.length
}

function renderLinkedTimelineText(
	event: WikiTimelineEvent,
	refs: WikiTimelineRefs,
) {
	const mentions: Array<
		| {
				kind: "nation"
				key: string
				name: string
				color: string
				tag: string
				link: boolean
		  }
		| { kind: "province"; key: string; name: string; color: string; id: number }
		| {
				kind: "organization"
				key: string
				name: string
				color: string
				id: string
		  }
		| {
				kind: "war"
				key: string
				name: string
				color: string
				id: string
		  }
		| { kind: "label"; key: string; name: string; color: string }
	> = [
		...event.nations.map((entry) => ({
			kind: "nation" as const,
			key: `nation:${entry.tag}`,
			name: entry.name,
			color: entry.color,
			tag: entry.tag,
			link: entry.link !== false,
		})),
		...event.provinces.map((entry) => ({
			kind: "province" as const,
			key: `province:${entry.id}`,
			name: entry.name,
			color: entry.color,
			id: entry.id,
		})),
		...event.organizations.map((entry) => ({
			kind: "organization" as const,
			key: `organization:${entry.id}`,
			name: entry.name,
			color: entry.color,
			id: entry.id,
		})),
		...event.wars.map((entry) => ({
			kind: "war" as const,
			key: `war:${entry.id}`,
			name: entry.name,
			color: entry.color,
			id: entry.id,
		})),
		...event.cultures.map((entry) => ({
			kind: "label" as const,
			key: `culture:${entry.id}`,
			name: entry.name,
			color: entry.color,
		})),
		...event.religions.map((entry) => ({
			kind: "label" as const,
			key: `religion:${entry.id}`,
			name: entry.name,
			color: entry.color,
		})),
		...event.dynasties.map((entry) => ({
			kind: "label" as const,
			key: `dynasty:${entry.id}`,
			name: entry.name,
			color: entry.color,
		})),
	].sort(compareMentionsByLength)

	// Two distinct mentions can coincidentally share the same name (e.g. a
	// province named after the nation that once ruled it, "Armagnac" the
	// county vs. "Armagnac" the country) -- the plain "first entry in array
	// order wins every tie" rule below would then hand every occurrence of
	// that text to the same one, leaving the other never linked. Tie-break
	// instead by least-recently-used (so repeat occurrences of a shared name
	// alternate between the colliding entities instead of all going to one),
	// then prefer non-nation kinds (province/org/war/...) -- description
	// templates consistently name the object of an action before the nation
	// clause ("<subject> took control of <object> from <nation>"), so on a
	// fresh tie the earlier occurrence is the non-nation entity.
	const usageCounts = new Map<string, number>()
	const kindPriority = (kind: (typeof mentions)[number]["kind"]): number =>
		kind === "nation" ? 1 : 0
	const isBetterTie = (
		candidate: (typeof mentions)[number],
		current: (typeof mentions)[number],
	): boolean => {
		const candidateCount = usageCounts.get(candidate.key) ?? 0
		const currentCount = usageCounts.get(current.key) ?? 0
		if (candidateCount !== currentCount) return candidateCount < currentCount
		return kindPriority(candidate.kind) < kindPriority(current.kind)
	}

	const nodes: React.ReactNode[] = []
	let cursor = 0
	let key = 0
	while (cursor < event.description.length) {
		let match:
			| {
					mention: (typeof mentions)[number]
					index: number
			  }
			| undefined
		for (const mention of mentions) {
			let index = event.description.indexOf(mention.name, cursor)
			while (
				index >= 0 &&
				event.plainTextRanges?.some(
					(range) =>
						index < range.end && index + mention.name.length > range.start,
				)
			) {
				index = event.description.indexOf(
					mention.name,
					index + mention.name.length,
				)
			}
			if (index < 0) continue
			if (
				!match ||
				index < match.index ||
				(index === match.index && isBetterTie(mention, match.mention))
			) {
				match = { mention, index }
			}
		}
		if (!match) {
			nodes.push(event.description.slice(cursor))
			break
		}
		usageCounts.set(
			match.mention.key,
			(usageCounts.get(match.mention.key) ?? 0) + 1,
		)
		if (match.index > cursor) {
			nodes.push(event.description.slice(cursor, match.index))
		}
		const mention = match.mention
		if (
			mention.kind === "label" ||
			(mention.kind === "nation" && !mention.link)
		) {
			nodes.push(
				<span
					key={`${mention.key}:${key++}`}
					className="inline-flex items-center gap-1 align-baseline"
				>
					<Swatch color={mention.color} className="shrink-0" />
					<span>{mention.name}</span>
				</span>,
			)
		} else {
			nodes.push(
				<button
					key={`${mention.key}:${key++}`}
					type="button"
					onClick={(e) => {
						e.stopPropagation()
						if (mention.kind === "nation") refs.onSelectNation(mention.tag)
						else if (mention.kind === "province")
							refs.onSelectProvince(mention.id)
						else if (mention.kind === "war") refs.onSelectWar(mention.id)
						else refs.onSelectOrganization(mention.id)
					}}
					className="inline-flex items-center gap-1 align-baseline underline"
				>
					<Swatch color={mention.color} className="shrink-0" />
					<span>{mention.name}</span>
				</button>,
			)
		}
		cursor = match.index + mention.name.length
	}
	return nodes
}

// One flowing text row per event: date and type lead the description inline
// instead of sitting on their own header line, so each event costs one or two
// lines of height instead of three-plus.
function TimelineEventRow({
	event,
	refs,
	state,
}: {
	event: WikiTimelineEvent
	refs: WikiTimelineRefs
	state: "past" | "present" | "future"
}) {
	const isPresent = state === "present"
	return (
		<div
			className={`border-l-2 py-0.5 pl-2 text-[10px] leading-snug ${
				isPresent
					? "bg-indigo-50/80 text-slate-700"
					: state === "future"
						? "text-slate-500 opacity-80"
						: "text-slate-600"
			}`}
			style={{ borderColor: isPresent ? "#4f46e5" : event.typeColor }}
		>
			<div>
				<button
					type="button"
					onClick={() => refs.onSelectDate(event.date)}
					className="mr-1.5 align-baseline font-mono text-[9px] underline"
					title={`Jump to ${event.dateLabel}`}
				>
					{event.dateLabel}
				</button>
				<span
					className="mr-1.5 align-baseline text-[8px] font-bold uppercase tracking-[0.12em]"
					style={{ color: event.typeColor }}
				>
					{event.type}
				</span>
				{renderLinkedTimelineText(event, refs)}
			</div>
			{event.comment ? (
				<div className="mt-0.5 text-[9px] leading-snug text-slate-400">
					{event.comment}
				</div>
			) : null}
		</div>
	)
}

function TimelineDivider({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-2 py-0.5">
			<div className="h-px flex-1 bg-slate-200" />
			<span className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-indigo-600">
				{label}
			</span>
			<div className="h-px flex-1 bg-slate-200" />
		</div>
	)
}

const PLOT_HEIGHT = 64

// The chart x-domain is a sliding window centered on the current date
// (shifted, not shrunk, when the current date sits near either end of the
// simulation range). Default width is 100 years; zoom narrows/widens it
// between MIN_CHART_WINDOW_DAYS and the full simulation span.
const CHART_WINDOW_DAYS = 50 * 365
const MIN_CHART_WINDOW_DAYS = 2 * 365

function niceCeil(value: number): number {
	if (value <= 1) return 1
	const magnitude = 10 ** Math.floor(Math.log10(value))
	for (const step of [1, 2, 5, 10]) {
		if (step * magnitude >= value) return step * magnitude
	}
	return 10 * magnitude
}

// A count-over-time step chart (owned provinces for a nation, member
// territory for an organization -- a count only changes at discrete
// events). Hover snaps a crosshair to the nearest change; clicking jumps the
// simulation to that date. Single series, so the label row names it and no
// legend is needed.
function CountHistoryChart({
	countHistory,
	countChartLabel,
	countUnitLabel,
	dateRangeStart,
	dateRangeEnd,
	currentDate,
	timelineEvents,
	onSelectDate,
}: {
	countHistory: WikiCountHistoryPoint[]
	countChartLabel: string
	countUnitLabel: string
	dateRangeStart: number
	dateRangeEnd: number
	currentDate: number
	timelineEvents: WikiTimelineEvent[]
	onSelectDate: (date: number) => void
}) {
	const [hoverDate, setHoverDate] = useState<number | null>(null)
	const [hoverYear, setHoverYear] = useState<number | null>(null)
	const [halfWindowDays, setHalfWindowDays] = useState(CHART_WINDOW_DAYS)
	const allPoints = countHistory
	if (allPoints.length === 0) return null
	const rangeStart = dateRangeStart
	const rangeEnd = Math.max(
		dateRangeEnd,
		allPoints[allPoints.length - 1].date,
		currentDate,
	)
	const maxHalfWindowDays = Math.max(
		MIN_CHART_WINDOW_DAYS,
		(rangeEnd - rangeStart) / 2,
	)
	const zoomBy = (factor: number) => {
		setHalfWindowDays((prev) =>
			Math.min(
				maxHalfWindowDays,
				Math.max(MIN_CHART_WINDOW_DAYS, prev * factor),
			),
		)
	}
	let start = currentDate - halfWindowDays
	let end = currentDate + halfWindowDays
	if (start < rangeStart) {
		end = Math.min(rangeEnd, end + (rangeStart - start))
		start = rangeStart
	}
	if (end > rangeEnd) {
		start = Math.max(rangeStart, start - (end - rangeEnd))
		end = rangeEnd
	}
	const span = Math.max(1, end - start)
	const xPct = (date: number) =>
		((Math.min(Math.max(date, start), end) - start) / span) * 100
	// Step series clipped to the window: the count carried into the window
	// start, then every change inside it.
	let startCount = allPoints[0].count
	const points: Array<{ date: number; count: number }> = []
	for (const point of allPoints) {
		if (point.date <= start) startCount = point.count
		else if (point.date <= end) points.push(point)
	}
	points.unshift({ date: start, count: startCount })
	const maxCount = niceCeil(Math.max(...points.map((point) => point.count)))
	// 3px top / 1px bottom inset keeps the 2px stroke inside the plot box.
	const yPx = (count: number) =>
		PLOT_HEIGHT - 1 - (count / maxCount) * (PLOT_HEIGHT - 4)

	let path = `M ${xPct(points[0].date)} ${yPx(points[0].count)}`
	for (let index = 1; index < points.length; index++) {
		path += ` H ${xPct(points[index].date)} V ${yPx(points[index].count)}`
	}
	path += " H 100"
	const areaPath = `${path} V ${yPx(0)} H ${xPct(points[0].date)} Z`

	// One bar per year that has events, height-scaled by event count, so busy
	// eras read as taller marks under the plot.
	const eventYears = new Map<
		number,
		{ count: number; dateSum: number; firstDate: number }
	>()
	for (const event of timelineEvents) {
		if (event.date < start || event.date > end) continue
		const year = DATE.eu4DaysToYear(event.date)
		const entry = eventYears.get(year)
		if (entry) {
			entry.count++
			entry.dateSum += event.date
		} else {
			eventYears.set(year, {
				count: 1,
				dateSum: event.date,
				firstDate: event.date,
			})
		}
	}

	const dateFromPointer = (
		event: React.MouseEvent<HTMLDivElement>,
	): number | null => {
		const rect = event.currentTarget.getBoundingClientRect()
		if (rect.width <= 0) return null
		const fraction = Math.min(
			1,
			Math.max(0, (event.clientX - rect.left) / rect.width),
		)
		return Math.round(start + fraction * span)
	}
	// Step lookup: the count in effect at an arbitrary date.
	const countAt = (date: number): number => {
		let count = points[0].count
		for (const point of points) {
			if (point.date > date) break
			count = point.count
		}
		return count
	}
	const yearEntries = Array.from(eventYears.entries()).map(([year, entry]) => ({
		year,
		count: entry.count,
		date: entry.dateSum / entry.count,
		firstDate: entry.firstDate,
	}))
	const maxYearCount = Math.max(1, ...yearEntries.map((entry) => entry.count))
	// Nearest-dot targeting: the strip is one pointer surface and the closest
	// year wins, so tiny dots never lose clicks to a neighbor's hit box.
	const nearestYearEntry = (event: React.MouseEvent<HTMLDivElement>) => {
		const date = dateFromPointer(event)
		if (date === null || yearEntries.length === 0) return null
		let nearest = yearEntries[0]
		for (const entry of yearEntries) {
			if (Math.abs(entry.date - date) < Math.abs(nearest.date - date)) {
				nearest = entry
			}
		}
		return nearest
	}
	const hoveredYearEntry =
		hoverYear !== null
			? (yearEntries.find((entry) => entry.year === hoverYear) ?? null)
			: null

	return (
		<div className="mb-2">
			<div className="mb-1 flex items-baseline justify-between gap-2">
				<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
					{countChartLabel}
				</span>
				<div className="flex items-center gap-1.5">
					<span className="font-mono text-[8px] text-slate-400">
						0–{maxCount}
					</span>
					<div className="flex items-center gap-0.5">
						<button
							type="button"
							onClick={() => zoomBy(2)}
							disabled={halfWindowDays >= maxHalfWindowDays}
							title="Zoom out"
							className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-slate-300 font-mono text-[9px] leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-30"
						>
							−
						</button>
						<button
							type="button"
							onClick={() => zoomBy(0.5)}
							disabled={halfWindowDays <= MIN_CHART_WINDOW_DAYS}
							title="Zoom in"
							className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-slate-300 font-mono text-[9px] leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-30"
						>
							+
						</button>
					</div>
				</div>
			</div>
			<div
				role="img"
				aria-label={countChartLabel}
				className="relative cursor-pointer"
				style={{ height: PLOT_HEIGHT }}
				onPointerMove={(event) => setHoverDate(dateFromPointer(event))}
				onPointerLeave={() => setHoverDate(null)}
				onClick={(event) => {
					const date = dateFromPointer(event)
					if (date !== null) onSelectDate(date)
				}}
				onWheel={(event) => {
					event.preventDefault()
					zoomBy(event.deltaY > 0 ? 1.2 : 1 / 1.2)
				}}
			>
				<svg
					className="absolute inset-0 h-full w-full"
					viewBox={`0 0 100 ${PLOT_HEIGHT}`}
					preserveAspectRatio="none"
				>
					{[maxCount, maxCount / 2].map((tick) => (
						<line
							key={tick}
							x1={0}
							x2={100}
							y1={yPx(tick)}
							y2={yPx(tick)}
							stroke="#e2e8f0"
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					))}
					<path d={areaPath} fill="rgba(22, 163, 74, 0.1)" stroke="none" />
					<path
						d={path}
						fill="none"
						stroke="#16a34a"
						strokeWidth={2}
						strokeLinejoin="round"
						strokeLinecap="round"
						vectorEffect="non-scaling-stroke"
					/>
					{hoverDate !== null ? (
						<line
							x1={xPct(hoverDate)}
							x2={xPct(hoverDate)}
							y1={0}
							y2={PLOT_HEIGHT}
							stroke="#94a3b8"
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					) : null}
					<line
						x1={xPct(currentDate)}
						x2={xPct(currentDate)}
						y1={0}
						y2={PLOT_HEIGHT}
						stroke="#4f46e5"
						strokeWidth={1.5}
						strokeDasharray="4 3"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
				{hoverDate !== null ? (
					<div
						className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-sm bg-slate-900/95 px-1.5 py-0.5 font-mono text-[9px] text-white shadow-sm"
						style={{
							left: `${Math.min(85, Math.max(15, xPct(hoverDate)))}%`,
						}}
					>
						<span className="font-semibold">{countAt(hoverDate)}</span>
						<span className="text-slate-300">
							{" "}
							{countUnitLabel} · {DATE.formatEu4Days(hoverDate)}
						</span>
					</div>
				) : null}
			</div>
			{yearEntries.length > 0 ? (
				<div
					className="relative mt-0.5 h-3.5 cursor-pointer border-b border-slate-200"
					onPointerMove={(event) =>
						setHoverYear(nearestYearEntry(event)?.year ?? null)
					}
					onPointerLeave={() => setHoverYear(null)}
					onClick={(event) => {
						const entry = nearestYearEntry(event)
						if (entry) onSelectDate(entry.firstDate)
					}}
				>
					{yearEntries.map((entry) => {
						const height = Math.max(
							2,
							Math.round((entry.count / maxYearCount) * 14),
						)
						return (
							<span
								key={entry.year}
								className={`absolute bottom-0 w-[2px] -translate-x-1/2 rounded-t-[1px] ${
									hoverYear === entry.year
										? "bg-indigo-600"
										: "bg-indigo-500/60"
								}`}
								style={{ left: `${xPct(entry.date)}%`, height }}
							/>
						)
					})}
					{hoveredYearEntry ? (
						<div
							className="pointer-events-none absolute bottom-full z-10 mb-0.5 -translate-x-1/2 whitespace-nowrap rounded-sm bg-slate-900/95 px-1.5 py-0.5 font-mono text-[9px] text-white shadow-sm"
							style={{
								left: `${Math.min(85, Math.max(15, xPct(hoveredYearEntry.date)))}%`,
							}}
						>
							<span className="font-semibold">{hoveredYearEntry.count}</span>
							<span className="text-slate-300">
								{" "}
								event{hoveredYearEntry.count === 1 ? "" : "s"} ·{" "}
								{DATE.formatEu4Year(hoveredYearEntry.year)}
							</span>
						</div>
					) : null}
				</div>
			) : null}
			<div className="mt-0.5 flex justify-between font-mono text-[7px] text-slate-400">
				<span>{DATE.formatEu4Year(DATE.eu4DaysToYear(start))}</span>
				<span>{DATE.formatEu4Year(DATE.eu4DaysToYear(end))}</span>
			</div>
		</div>
	)
}

interface WikiTimelineSectionProps {
	countHistory: WikiCountHistoryPoint[]
	/** Label above the count chart, e.g. "Provinces over time" (nation) or
	 * "Member territory over time" (organization). */
	countChartLabel: string
	/** Unit word for the hover tooltip, e.g. "provinces". */
	countUnitLabel: string
	dateRangeStart: number
	dateRangeEnd: number
	currentDate: number
	currentDateLabel: string
	timelineEvents: WikiTimelineEvent[]
	refs: WikiTimelineRefs
}

/** Shared "Timeline" wiki section -- count-over-time chart plus a scrollable
 * past/present/future event list -- used by both NationWikiPage and
 * OrganizationWikiPage so they read and behave identically. */
export function WikiTimelineSection({
	countHistory,
	countChartLabel,
	countUnitLabel,
	dateRangeStart,
	dateRangeEnd,
	currentDate,
	currentDateLabel,
	timelineEvents,
	refs,
}: WikiTimelineSectionProps) {
	const pastEvents = timelineEvents
		.filter((event) => event.date < currentDate)
		.slice(-5)
	const presentEvents = timelineEvents.filter(
		(event) => event.date === currentDate,
	)
	const futureEvents = timelineEvents
		.filter((event) => event.date > currentDate)
		.slice(0, 5)
	return (
		<WikiSection title="Timeline">
			<CountHistoryChart
				countHistory={countHistory}
				countChartLabel={countChartLabel}
				countUnitLabel={countUnitLabel}
				dateRangeStart={dateRangeStart}
				dateRangeEnd={dateRangeEnd}
				currentDate={currentDate}
				timelineEvents={timelineEvents}
				onSelectDate={refs.onSelectDate}
			/>
			{timelineEvents.length === 0 ? (
				<div className="py-1 text-center text-[10px] text-slate-400">
					No recorded events
				</div>
			) : (
				<div className="space-y-1">
					{pastEvents.map((event) => (
						<TimelineEventRow
							key={event.id}
							event={event}
							refs={refs}
							state="past"
						/>
					))}
					<TimelineDivider label={`Current ${currentDateLabel}`} />
					{presentEvents.length > 0 ? (
						presentEvents.map((event) => (
							<TimelineEventRow
								key={event.id}
								event={event}
								refs={refs}
								state="present"
							/>
						))
					) : (
						<div className="py-0.5 text-center text-[10px] text-slate-400">
							No events on this date
						</div>
					)}
					{futureEvents.map((event) => (
						<TimelineEventRow
							key={event.id}
							event={event}
							refs={refs}
							state="future"
						/>
					))}
				</div>
			)}
		</WikiSection>
	)
}
