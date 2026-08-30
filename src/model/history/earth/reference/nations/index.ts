import { DATA_SOURCE } from "@/model/history/earth/data-source"
import type { RawNationReference } from "@/model/history/earth/data-source/types"
import type {
	BuildNationTableParams,
	Nation,
	NationTable,
} from "@/model/history/earth/reference/nations/types"

let indexPromise: Promise<Map<string, RawNationReference>> | null = null

function getNationReferenceIndex(): Promise<Map<string, RawNationReference>> {
	if (!indexPromise) {
		indexPromise = DATA_SOURCE.loadNationReference().then((nations) => {
			const map = new Map<string, RawNationReference>()
			for (const nation of nations) map.set(nation.tag, nation)
			return map
		})
	}
	return indexPromise
}

function isRealTag(tag: string | null | undefined): tag is string {
	return !!tag && tag !== "---" && tag !== "XXX"
}

function collectTags(params: BuildNationTableParams): Set<string> {
	const tags = new Set<string>()
	const add = (tag: string | null | undefined) => {
		if (isRealTag(tag)) tags.add(tag)
	}
	for (const tag of Object.keys(params.nationEvents)) add(tag)
	for (const entry of Object.values(params.provinceEvents)) {
		add(entry.base.owner)
		add(entry.base.controller)
		for (const core of entry.base.cores) add(core)
		for (const e of entry.events) {
			if (
				e.kind === "owner" ||
				e.kind === "controller" ||
				e.kind === "coreAdd" ||
				e.kind === "coreRemove"
			) {
				add(e.payload.tag as string | undefined)
			}
		}
	}
	for (const e of params.diplomacy) {
		add(e.payload.firstTag)
		add(e.payload.secondTag)
	}
	for (const war of params.wars) {
		add(war.warGoalTag)
		for (const e of war.events) add(e.nationTag)
		for (const battle of war.battles) {
			add(battle.attacker.country)
			add(battle.defender.country)
		}
	}
	for (const e of params.organizationEvents) {
		if (e.kind === "join" || e.kind === "leave") add(e.nationTag)
	}
	return tags
}

function build(params: BuildNationTableParams): NationTable {
	const sorted = Array.from(collectTags(params)).sort()
	const idByTag = new Map<string, number>()
	const nations: Nation[] = sorted.map((tag, id) => {
		idByTag.set(tag, id)
		const ref = params.nationReference.get(tag)
		return {
			id,
			tag,
			name: ref?.name ?? tag,
			color: ref ? [ref.color[0], ref.color[1], ref.color[2]] : [128, 128, 128],
			isRebel: tag === "REB",
			governmentType: ref?.initialGovernmentType ?? null,
			cultureId: ref?.primaryCulture ?? null,
			religionId: ref?.religion ?? null,
		}
	})
	return { nations, idByTag }
}

export const NATIONS = {
	getNationReferenceIndex,
	build,
}
