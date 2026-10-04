import type {
	CensusDeployment,
	CensusEconomy,
} from "@/model/history/record/types"
import type {
	FlushJournalParams,
	JournalPeople,
	JournalRelationChange,
	JournalTransaction,
	PendingJournal,
	RecordCoalitionParams,
	RecordProvinceChangeParams,
	RecordProvinceParams,
	RecordRelationParams,
} from "@/model/history/sim/engine/journal/types"
import { yearMs } from "@/model/history/sim/engine/state/time"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { CHARACTER } from "@/model/history/sim/people/character"

const RULER_TAGS = new Set([
	"succession",
	"regency started",
	"regency ended",
	"regent changed",
	"usurpation",
	"regime change",
])

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
	goal,
	attackers,
	defenders,
}: RecordCoalitionParams): void {
	state.pendingJournal.coalitions.push({ warId, goal, attackers, defenders })
}

function censusEconomy(state: HistoryState): CensusEconomy {
	const roots: number[] = []
	for (let p = 0; p < state.P; p++)
		if (!state.desolate[p] && !state.stateless[p] && state.parentCurrent[p] < 0)
			roots.push(p)
	return {
		nations: Int32Array.from(roots),
		treasury: Float32Array.from(roots, (p) => state.treasuryCurrent[p]),
		revenue: Float32Array.from(roots, (p) => state.revenueCurrent[p]),
		levy: Float32Array.from(roots, (p) => state.levyCurrent[p]),
		regular: Float32Array.from(roots, (p) => state.regularCurrent[p]),
		army: Float32Array.from(
			roots,
			(p) => state.levyCurrent[p] + state.regularCurrent[p],
		),
		deployments: roots.map((p) => {
			const rows: CensusDeployment[] = []
			for (const warId of state.activeWarIds) {
				const enrolled = state.wars[warId].deployed[p] ?? {
					levy: 0,
					regular: 0,
				}
				const troops = enrolled.levy + enrolled.regular
				if (troops > 0) rows.push({ warId, troops, ...enrolled })
			}
			return rows
		}),
		budgets: roots.map((p) => {
			const budget = state.treasuryBudgetCurrent.get(p)
			return budget ? { ...budget } : null
		}),
	}
}

function peopleRows(state: HistoryState): JournalPeople {
	const { persons: table, log } = state.people
	const rows: JournalPeople = {
		stress: log.stress.map(({ person, time, level }) => ({
			person,
			timeMs: time * yearMs,
			level,
		})),
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
			...CHARACTER.of({ people: state.people, person: id }),
		})),
		marriages: log.marriages.map((marriage) => ({
			husband: marriage.husband,
			wife: marriage.wife,
			startTimeMs: marriage.start * yearMs,
		})),
		seats: log.seats.map(({ seat, person, ward, reason }) => ({
			seat,
			person,
			reason,
			kind:
				ward >= 0
					? "regent"
					: state.parentCurrent[seat] < 0
						? "ruler"
						: "district",
			ward,
		})),
		deaths: log.deaths.map(({ person, death }) => ({
			id: person,
			deathTimeMs: death * yearMs,
		})),
		pregnancies: log.pregnancies.map(({ mother, father, time, outcome }) => ({
			mother,
			father,
			timeMs: time * yearMs,
			outcome,
		})),
		betrothals: log.betrothals.map(({ a, b, time }) => ({
			a,
			b,
			timeMs: time * yearMs,
		})),
		betrothalEnds: log.betrothalEnds.map(({ a, b, time, cause }) => ({
			a,
			b,
			timeMs: time * yearMs,
			cause,
		})),
	}
	log.stress.length = 0
	log.persons.length = 0
	log.marriages.length = 0
	log.seats.length = 0
	log.deaths.length = 0
	log.pregnancies.length = 0
	log.betrothals.length = 0
	log.betrothalEnds.length = 0
	return rows
}

function flush({
	state,
	noteCursor,
	census,
	initial,
}: FlushJournalParams): void {
	const pendingJournal = state.pendingJournal
	const log = state.people.log
	if (
		!initial &&
		!census &&
		state.events.length === noteCursor &&
		pendingJournal.parents.size === 0 &&
		pendingJournal.relations.size === 0 &&
		pendingJournal.occupations.size === 0 &&
		pendingJournal.coalitions.length === 0 &&
		log.stress.length === 0 &&
		log.persons.length === 0 &&
		log.marriages.length === 0 &&
		log.seats.length === 0 &&
		log.deaths.length === 0 &&
		log.pregnancies.length === 0 &&
		log.betrothals.length === 0 &&
		log.betrothalEnds.length === 0
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
		if (RULER_TAGS.has(note.tag)) rulerRoots.add(note.data.nation as number)
	}
	const rulers = [...rulerRoots]
		.filter(
			(root) =>
				root >= 0 &&
				root < state.P &&
				state.parentCurrent[root] < 0 &&
				state.people.rulerOf[root] >= 0,
		)
		.map((root) => ({
			root,
			person: state.people.rulerOf[root],
			nameSeed: state.leaderNameSeedCurrent[root],
			dynasty: state.leaderDynCurrent[root],
			birthTimeMs: state.leaderRuntime.birth[root],
			deathTimeMs: state.leaderRuntime.end[root],
			regent: state.people.regencies.get(root)?.regent ?? -1,
			regency: state.people.regencies.get(root)?.kind ?? null,
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
			budget.tributeReceived = 0
			budget.indemnityReceived = 0
			budget.boughtPeace = 0
			budget.succession = 0
			budget.titleCreationExpenses = 0
			budget.otherChangesTotal = 0
		}
	const people = peopleRows(state)
	if (
		people.stress.length > 0 ||
		people.persons.length > 0 ||
		people.marriages.length > 0 ||
		people.seats.length > 0 ||
		people.deaths.length > 0 ||
		people.pregnancies.length > 0 ||
		people.betrothals.length > 0 ||
		people.betrothalEnds.length > 0 ||
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
	pendingJournal.parents.clear()
	pendingJournal.relations.clear()
	pendingJournal.occupations.clear()
	pendingJournal.coalitions = []
}

function transferList(journal: JournalTransaction[]): Transferable[] {
	return journal.flatMap((transaction) =>
		transaction.census
			? [
					transaction.census.urban.buffer,
					transaction.census.rural.buffer,
					transaction.census.development.buffer,
				]
			: [],
	)
}

function releaseSent(state: HistoryState): void {
	state.journal.length = 0
	state.events.length = 0
}

export const JOURNAL = {
	pending,
	parent,
	occupation,
	relation,
	coalition,
	flush,
	releaseSent,
	transferList,
}
