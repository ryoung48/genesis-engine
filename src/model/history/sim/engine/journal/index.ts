import type { CensusEconomy } from "@/model/history/record/types"
import type {
	FlushJournalParams,
	JournalPeople,
	JournalRelationChange,
	PendingJournal,
	RecordCoalitionParams,
	RecordProvinceChangeParams,
	RecordProvinceParams,
	RecordRelationParams,
} from "@/model/history/sim/engine/journal/types"
import { yearMs } from "@/model/history/sim/engine/state/time"
import type { HistoryState } from "@/model/history/sim/engine/state/types"

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

function censusEconomy(state: HistoryState): CensusEconomy {
	const roots: number[] = []
	for (let p = 0; p < state.P; p++)
		if (!state.desolate[p] && !state.stateless[p] && state.parentCurrent[p] < 0)
			roots.push(p)
	return {
		roots: Int32Array.from(roots),
		treasury: Float32Array.from(roots, (p) => state.treasuryCurrent[p]),
		revenue: Float32Array.from(roots, (p) => state.revenueCurrent[p]),
		manpower: Float32Array.from(roots, (p) => state.manpowerCurrent[p]),
		budgets: roots.map((p) => {
			const budget = state.treasuryBudgetCurrent.get(p)
			return budget ? { ...budget } : null
		}),
	}
}

function peopleRows(state: HistoryState): JournalPeople {
	const { persons: table, log } = state.people
	const rows: JournalPeople = {
		persons: log.persons.map((id) => ({
			id,
			sex: table.sex[id],
			birthTimeMs: table.birth[id] * yearMs,
			deathTimeMs: table.death[id] * yearMs,
			father: table.father[id],
			mother: table.mother[id],
			dynasty: table.dynasty[id],
			nameSeed: table.nameSeed[id],
			home: table.home[id],
		})),
		marriages: log.marriages.map((marriage) => ({
			husband: marriage.husband,
			wife: marriage.wife,
			startTimeMs: marriage.start * yearMs,
		})),
		seats: log.seats.map(({ seat, person }) => ({
			seat,
			person,
			sovereign: state.parentCurrent[seat] < 0,
		})),
	}
	state.people.log = { persons: [], marriages: [], seats: [] }
	return rows
}

function flush({
	state,
	noteCursor,
	census,
	initial,
}: FlushJournalParams): void {
	const pendingJournal = state.pendingJournal
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
			person: state.people.rulerOf[root],
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
				economy: censusEconomy(state),
			}
		: null
	if (census)
		for (const budget of state.treasuryBudgetCurrent.values()) {
			budget.plunder = 0
			budget.succession = 0
			budget.reserveAdjustment = 0
			budget.otherChangesTotal = 0
		}
	const people = peopleRows(state)
	if (
		people.persons.length > 0 ||
		people.marriages.length > 0 ||
		people.seats.length > 0 ||
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
			people,
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
