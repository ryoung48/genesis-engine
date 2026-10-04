import type {
	CensusDeployment,
	CensusEconomy,
} from "@/model/history/record/types"
import type {
	FlushJournalParams,
	JournalRelationChange,
	JournalTransaction,
	PendingJournal,
	RecordCoalitionParams,
	RecordProvinceChangeParams,
	RecordProvinceParams,
	RecordRelationParams,
} from "@/model/history/sim/engine/journal/types"
import type {
	EngineNote,
	HistoryState,
} from "@/model/history/sim/engine/state/types"
import { PEOPLE_LOG } from "@/model/history/sim/people/log"
import type { PeoplePacket } from "@/model/history/sim/people/log/types"
import type { DeathCause } from "@/model/history/sim/people/types"

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
		state.events.length === noteCursor &&
		pendingJournal.parents.size === 0 &&
		pendingJournal.relations.size === 0 &&
		pendingJournal.occupations.size === 0 &&
		pendingJournal.coalitions.length === 0 &&
		!PEOPLE_LOG.pending(state.people)
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
	const deaths = new Map<number, EngineNote>()
	if (rulerRoots.size > 0)
		for (const note of notes)
			if (note.tag === "succession")
				deaths.set(note.data.nation as number, note)
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
			regent: state.people.regencies.get(root)?.regent ?? -1,
			regency: state.people.regencies.get(root)?.kind ?? null,
			deceased: (deaths.get(root)?.data.dying as number | undefined) ?? -1,
			deathCause:
				(deaths.get(root)?.data.cause as DeathCause | undefined) ?? null,
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
	const people = PEOPLE_LOG.pending(state.people)
		? PEOPLE_LOG.seal({
				people: state.people,
				sovereign: (seat) => state.parentCurrent[seat] < 0,
			})
		: null
	if (
		people ||
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

function packetBuffers(packet: PeoplePacket): Transferable[] {
	return [
		packet.time.buffer,
		packet.kind.buffer,
		packet.a.buffer,
		packet.b.buffer,
		packet.c.buffer,
		packet.d.buffer,
		packet.sex.buffer,
		packet.death.buffer,
		packet.createdAt.buffer,
		packet.healthBand.buffer,
		packet.dynasty.buffer,
		packet.culture.buffer,
		packet.nameSeed.buffer,
		packet.home.buffer,
		packet.initialResidence.buffer,
		packet.bases.buffer,
		packet.personality.buffer,
		packet.grades.buffer,
		packet.congenital.buffer,
		packet.carried.buffer,
	]
}

function transferList(journal: JournalTransaction[]): Transferable[] {
	return journal.flatMap((transaction) => [
		...(transaction.census
			? [
					transaction.census.urban.buffer,
					transaction.census.rural.buffer,
					transaction.census.development.buffer,
				]
			: []),
		...(transaction.people ? packetBuffers(transaction.people) : []),
	])
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
