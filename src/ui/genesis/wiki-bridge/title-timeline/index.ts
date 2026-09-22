import { TITLES } from "@/model/society/titles"
import { TITLE_TIER_LABELS } from "@/ui/genesis/shared/title-colors"
import { TITLE_NAMES } from "@/ui/genesis/wiki-bridge/title-names"
import type {
	BuildTitleTimelineParams,
	StartingHoldingsParams,
	TitleTimelineEntry,
} from "@/ui/genesis/wiki-bridge/title-timeline/types"

const MS_PER_DAY = 86_400_000

const SINGULARS = ["", "duchy", "kingdom", "empire", "hegemony"]
const PLURALS = ["", "duchies", "kingdoms", "empires", "hegemonies"]

function startingHoldings({ base, nationId }: StartingHoldingsParams): {
	top: number
	others: string
} {
	let top = -1
	const counts = new Array<number>(SINGULARS.length).fill(0)
	for (let title = 0; title < base.count; title++) {
		if (base.holder[title] !== nationId) continue
		counts[base.tier[title]]++
		if (top < 0 || base.tier[title] > base.tier[top]) top = title
	}
	if (top >= 0) counts[base.tier[top]]--
	const others = counts
		.map((count, tier) =>
			count > 0
				? `${count} ${count === 1 ? SINGULARS[tier] : PLURALS[tier]}`
				: "",
		)
		.filter((text) => text !== "")
		.reverse()
		.join(", ")
	return { top, others: others ? `holding ${others}` : "" }
}

function build({
	record,
	nationId,
	nationName,
	provinceName,
}: BuildTitleTimelineParams): TitleTimelineEntry[] {
	const base = record.titles
	if (!base) return []
	const created = record.events.titleEvents.filter(
		(event) => event.kind === "created",
	).length
	const capacity = base.count + created
	const tier = new Uint8Array(capacity)
	const holder = new Int32Array(capacity).fill(-1)
	const nameSeat = TITLE_NAMES.nameSeats({ record })
	tier.set(base.tier)
	holder.set(base.holder)
	const label = (title: number) =>
		`${TITLE_TIER_LABELS[TITLES.tierOrder[tier[title]]]} of ${provinceName(nameSeat[title])}`

	const entries: TitleTimelineEntry[] = []
	const startHoldings = startingHoldings({ base, nationId })
	if (startHoldings.top >= 0)
		entries.push({
			id: `title:start:${nationId}`,
			date: record.minTimeMs / MS_PER_DAY,
			type: "Title",
			description: `${nationName} held the ${label(startHoldings.top)}${startHoldings.others ? `, also ${startHoldings.others}` : ""}, at the start of history.`,
			provinces: [nameSeat[startHoldings.top]],
		})
	record.events.titleEvents.forEach((event, index) => {
		const date = event.timeMs / MS_PER_DAY
		const id = `title:${event.title}:${event.kind}:${index}`
		if (event.kind === "passed") {
			holder[event.title] = event.to
		} else if (event.kind === "created") {
			tier[event.title] = event.tier
			holder[event.title] = event.holder
			if (event.holder === nationId)
				entries.push({
					id,
					date,
					type: "Title",
					description: `${nationName} founded the ${label(event.title)}.`,
					provinces: [event.seat],
				})
		} else if (event.kind === "destroyed") {
			if (holder[event.title] === nationId)
				entries.push({
					id,
					date,
					type: "Title",
					description: `The ${label(event.title)} held by ${nationName} was dissolved.`,
					provinces: [nameSeat[event.title]],
				})
			holder[event.title] = -1
		}
	})
	return entries
}

export const TITLE_TIMELINE = { build }
