import { cleanEu4Identifier } from "@/ui/wiki/nation/timeline-formatting"
import type { WikiTimelineEvent as NationTimelineEvent } from "@/ui/wiki/shared/WikiTimeline"

/**
 * Pure formatting/merging helpers used by useNationWikiData's timeline-event
 * builder. Split out of that file (see plans/split-large-files.md #3) since
 * none of these depend on the hook's per-render closures -- each takes its
 * inputs (events, a title, a payload) explicitly.
 */

export function mergeById<T extends { id: string | number }>(items: T[]): T[] {
	const seen = new Set<string | number>()
	const merged: T[] = []
	for (const item of items) {
		if (seen.has(item.id)) continue
		seen.add(item.id)
		merged.push(item)
	}
	return merged
}

export function mergeNations(
	items: NationTimelineEvent["nations"],
): NationTimelineEvent["nations"] {
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

export function formatList(items: string[]): string {
	if (items.length <= 2) return items.join(" and ")
	return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

export function formatPayloadLabel(value: unknown): string {
	return typeof value === "string"
		? cleanEu4Identifier(value)
		: value === true
			? "yes"
			: value === false
				? "no"
				: String(value)
}

export function payloadValue(
	payload: Record<string, unknown>,
	...keys: string[]
): unknown {
	for (const key of keys) {
		if (payload[key] !== undefined) return payload[key]
	}
	return payload.value
}

export function formatSignedValue(value: unknown): string {
	return typeof value === "number" && value > 0 ? `+${value}` : String(value)
}

export function mergeEventComments(
	events: NationTimelineEvent[],
): string | undefined {
	const comments = Array.from(
		new Set(events.map((event) => event.comment).filter(Boolean)),
	)
	return comments.length > 0 ? comments.join(" | ") : undefined
}

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function mergedTerritoryType(events: NationTimelineEvent[]): string {
	const signs = new Set(
		events
			.map((event) => /\(([+-])\)$/.exec(event.type)?.[1])
			.filter((sign): sign is string => sign !== undefined),
	)
	if (signs.size === 1) return `Territory (${Array.from(signs)[0]})`
	return "Territory"
}

export function buildMergedTerritoryDescription(
	events: NationTimelineEvent[],
	title: string,
): string {
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
		const match = /^(took control of|lost control of|gained|lost) (.+)$/.exec(
			clause,
		)
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
		const separator = (targetMatch?.[2] as "to" | "from" | undefined) ?? "to"
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
		for (const entry of actionEntries.get(ownershipAction)?.values() ?? []) {
			for (const objectKey of entry.objectKeys) ownershipObjects.add(objectKey)
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

export function buildMergedProvinceAttributeDescription(
	events: NationTimelineEvent[],
	attribute: "culture" | "religion",
): string {
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
