import type {
	FlushJournalParams,
	JournalRelationChange,
	PendingJournal,
	RecordCoalitionParams,
	RecordProvinceChangeParams,
	RecordProvinceParams,
	RecordRelationParams,
} from "@/model/history/sim/engine/journal/types"

function pending(): PendingJournal {
	return {
		parents: new Map(),
		relations: new Map(),
		occupations: new Map(),
		coalitions: [],
	}
}

function recordProvince({ changes, change }: RecordProvinceChangeParams): void {
	const current = changes.get(change.province)
	if (current) current.after = change.after
	else
		changes.set(change.province, {
			province: change.province,
			before: change.before,
			after: change.after,
		})
}

function parent(params: RecordProvinceParams): void {
	recordProvince({
		changes: params.state.pendingJournal.parents,
		change: params,
	})
}

function occupation(params: RecordProvinceParams): void {
	recordProvince({
		changes: params.state.pendingJournal.occupations,
		change: params,
	})
}

function relation({ state, x, y, before, after }: RecordRelationParams): void {
	const key = x * state.P + y
	const current = state.pendingJournal.relations.get(key)
	if (current) current.after = after
	else {
		const change: JournalRelationChange = { x, y, before, after }
		state.pendingJournal.relations.set(key, change)
	}
}

function coalition({
	state,
	warId,
	rebel,
	attackers,
	defenders,
}: RecordCoalitionParams): void {
	state.pendingJournal.coalitions.push({ warId, rebel, attackers, defenders })
}

function flush({
	state,
	noteCursor,
	census,
	initial,
}: FlushJournalParams): void {
	const pendingJournal = state.pendingJournal
	if (
		!initial &&
		!census &&
		noteCursor === state.events.length &&
		pendingJournal.parents.size === 0 &&
		pendingJournal.relations.size === 0 &&
		pendingJournal.occupations.size === 0 &&
		pendingJournal.coalitions.length === 0
	)
		return
	const parents = [...pendingJournal.parents.values()].filter(
		(change) => change.before !== change.after,
	)
	const relations = [...pendingJournal.relations.values()].filter(
		(change) => change.before !== change.after,
	)
	const occupations = [...pendingJournal.occupations.values()].filter(
		(change) => change.before !== change.after,
	)
	const notes = state.events.slice(noteCursor)
	const rulerRoots = new Set<number>()
	if (initial) {
		for (let root = 0; root < state.P; root++)
			if (
				!state.desolate[root] &&
				!state.stateless[root] &&
				state.parentCurrent[root] < 0
			)
				rulerRoots.add(root)
	}
	for (const change of parents)
		if (change.after < 0) rulerRoots.add(change.province)
	for (const note of notes) {
		if (
			note.tag === "succession" ||
			note.tag === "dynasty spread" ||
			note.tag === "regency started" ||
			note.tag === "regency ended"
		)
			rulerRoots.add(note.data.nation as number)
	}
	const rulers = [...rulerRoots]
		.filter(
			(root) => root >= 0 && root < state.P && state.parentCurrent[root] < 0,
		)
		.map((root) => ({
			root,
			nameSeed: state.leaderNameSeedCurrent[root],
			dynasty: state.leaderDynCurrent[root],
			birthTimeMs: state.leaderRuntime.birth[root],
			deathTimeMs: state.leaderRuntime.end[root],
			regent: notes.some(
				(note) => note.tag === "regency started" && note.data.nation === root,
			),
		}))
	const keyframe = census
		? {
				timeMs: state.time,
				urban: state.popUrbanCurrent.slice(),
				rural: state.popRuralCurrent.slice(),
				development: state.developmentCurrent.slice(),
			}
		: null
	if (
		parents.length > 0 ||
		relations.length > 0 ||
		occupations.length > 0 ||
		pendingJournal.coalitions.length > 0 ||
		rulers.length > 0 ||
		notes.length > 0 ||
		keyframe
	) {
		state.journal.push({
			timeMs: state.time,
			parents,
			relations,
			occupations,
			coalitions: pendingJournal.coalitions,
			rulers,
			notes,
			census: keyframe,
		})
	}
	state.pendingJournal = pending()
}

export const JOURNAL = {
	pending,
	parent,
	occupation,
	relation,
	coalition,
	flush,
}
