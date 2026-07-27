import { DATE } from "@/model/history/earth/date"
import { EU4_DAYS } from "@/model/history/generated/eu4-days"
import {
	getEventDescription,
	getEventDotColor,
} from "@/ui/wiki/nation/event-description"
import type { BuildProceduralWikiTimelineEventParams } from "@/ui/wiki/nation/types"
import type { WikiTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

const NATION_TOKEN_RE = /#(-?\d+)/g

/** Turns a HistoryNote into a WikiTimelineEvent for a procedural (non-EU4)
 * nation's wiki page. Unlike the EU4 wiki path, procedural nations are
 * identified by numeric id rather than an EU4 tag, so `#<id>` placeholder
 * tokens from getEventDescription are resolved here against the live
 * getNationName/getNationColor resolvers (see GenesisView.tsx) instead of
 * against earth-history's own nation reference table. Only nation mentions
 * are supported for now -- provinces/cultures/religions/dynasties/
 * organizations/wars aren't tracked by the sim's event log yet. */
export function buildProceduralWikiTimelineEvent({
	event,
	viewingNation,
	pastEvents,
	getNationName,
	getNationColor,
	index,
}: BuildProceduralWikiTimelineEventParams): WikiTimelineEvent {
	const raw = getEventDescription(event, { pastEvents, viewingNation })
	const mentions = new Map<
		string,
		{ tag: string; name: string; color: string; link: boolean }
	>()
	const description = raw.replace(NATION_TOKEN_RE, (_match, idStr: string) => {
		const nationId = Number(idStr)
		const name = getNationName(nationId)
		const color = getNationColor(nationId) ?? "rgb(148, 163, 184)"
		mentions.set(idStr, { tag: idStr, name, color, link: true })
		return name
	})
	const date = EU4_DAYS.historyMsToEu4Days(event.time)
	return {
		id: `${event.tag}-${event.time}-${viewingNation}-${index}`,
		date,
		dateLabel: DATE.formatEu4Days(date),
		type: event.tag,
		typeColor: getEventDotColor(event, viewingNation),
		description,
		nations: Array.from(mentions.values()),
		provinces: [],
		cultures: [],
		religions: [],
		dynasties: [],
		organizations: [],
		wars: [],
	}
}
