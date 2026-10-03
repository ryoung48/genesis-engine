import type {
	BeatTextParams,
	BuildSiegeTimelineParams,
	SiegeTimelineEntry,
} from "@/ui/genesis/wiki-bridge/siege-timeline/types"

const DAY_MS = 86_400_000
const SIEGE_PHASE_DAYS = 30
function beatText({ beat }: BeatTextParams): string {
	switch (beat.beat) {
		case "disease":
			return "Fever spreads through the camp"
		case "supplies shortage":
			return "Supplies run low inside the walls"
		case "food shortage":
			return "Hunger sets in and the garrison thins"
		case "water shortage":
			return "The wells turn foul"
		case "breach":
			return "A breach opens"
		case "desertion":
			return "Men slip away from the garrison"
		case "gates opened":
			return "A traitor opens the gates"
		case "surrender":
			return "The garrison surrenders"
		case "sortie":
			if (beat.effect === "breach repaired")
				return "A sortie from the gates drives the besiegers back and a breach is sealed"
			if (beat.effect === "works burned")
				return "A sortie from the gates burns the siege works"
			return beat.won
				? "A sortie from the gates is fought to a standstill"
				: "A sortie from the gates is cut down"
		case "assault":
			if (beat.effect === "stormed")
				return beat.won && beat.outcome !== "inconclusive"
					? "The besiegers storm the walls and break in"
					: "The garrison is cut down to the last man in the assault and the town falls"
			return beat.effect === "repelled"
				? "The besiegers' assault is thrown back"
				: "The besiegers storm the walls but cannot break in"
		case "relief":
			if (beat.effect === "relieved")
				return "A relief army breaks the siege lines"
			return beat.won
				? "A relief army reaches the lines but cannot break them"
				: "A relief army is beaten off"
	}
}
function build({
	war,
	viewpoint,
	nationNameOf,
	provinceName,
}: BuildSiegeTimelineParams): SiegeTimelineEntry[] {
	const entries: SiegeTimelineEntry[] = []
	war.sieges.forEach((siege, index) => {
		if (
			viewpoint !== null &&
			viewpoint !== siege.besieger &&
			viewpoint !== siege.defender
		)
			return
		const b = nationNameOf(siege.besieger)
		const d = nationNameOf(siege.defender)
		const place = provinceName(siege.province)
		const context = viewpoint === null ? "" : ` (${war.name})`
		const common = {
			besiegerId: siege.besieger,
			defenderId: siege.defender,
			provinceId: siege.province,
			warId: war.id,
		}
		const id = `siege:${war.id}:${index}`
		entries.push({
			...common,
			id: `${id}:start`,
			date: siege.timeMs / DAY_MS,
			type: "Siege",
			description: `${b} laid siege to ${place}, held by ${d}.${context}`,
		})
		siege.beats.forEach((beat, beatIndex) =>
			entries.push({
				...common,
				id: `${id}:beat:${beatIndex}`,
				date: beat.timeMs / DAY_MS,
				type: "Siege",
				description: `At ${b}'s siege of ${place}, held by ${d}: ${beatText({ beat })}.${context}`,
			}),
		)
		if (siege.outcome === null || siege.endTimeMs === null) return
		const days = Math.floor((siege.endTimeMs - siege.timeMs) / DAY_MS)
		const count =
			days >= SIEGE_PHASE_DAYS ? Math.floor(days / SIEGE_PHASE_DAYS) : days
		const unit = days >= SIEGE_PHASE_DAYS ? "month" : "day"
		const duration = `${count} ${unit}${count === 1 ? "" : "s"}`
		const fall = siege.outcome !== "lifted" && siege.outcome !== "relieved"
		const success = fall
			? viewpoint === siege.besieger
			: viewpoint === siege.defender
		const outcome =
			siege.reason === null
				? siege.outcome
				: `${siege.outcome} (${siege.reason})`
		entries.push({
			...common,
			id: `${id}:end`,
			date: siege.endTimeMs / DAY_MS,
			type: viewpoint === null ? "Siege" : success ? "Siege (+)" : "Siege (-)",
			description: fall
				? `${b} took ${place} from ${d} after ${duration}: ${outcome}.${context}`
				: `${b}'s siege of ${place}, held by ${d}, ended after ${duration}: ${outcome}.${context}`,
		})
	})
	return entries
}
export const SIEGE_TIMELINE = { build }
