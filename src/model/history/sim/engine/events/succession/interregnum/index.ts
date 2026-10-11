import type {
	BeginParams,
	DeclareWarsParams,
	FinishParams,
	InterregnumNoteData,
	InterregnumRun,
	InterregnumSnapshot,
	InterregnumWar,
	SnapshotParams,
} from "@/model/history/sim/engine/events/succession/interregnum/types"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { WAR } from "@/model/history/sim/engine/events/war"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { PEOPLE } from "@/model/history/sim/people"
import { ERAS } from "@/model/society/eras"

const NO_SUPPORTERS: number[] = []

function snapshot({
	state,
	realm,
	dying,
}: SnapshotParams): InterregnumSnapshot {
	const top = STATE_TITLES.topTier({ state, realm })
	const titles: number[] = []
	if (top > 0)
		for (let title = 0; title < state.titles.count; title++)
			if (
				state.titles.holder[title] === realm &&
				state.titles.tier[title] === top
			)
				titles.push(title)
	return {
		titles,
		seats: SUCCESSION_SYSTEMS.districts({ state, realm })
			.filter((district) => district.person !== dying)
			.map(({ seat, person }) => ({ seat, holder: person })),
	}
}

// Frees every district admin's realm in one batch, then destroys the realm's
// top-tier titles and repairs the crown land the releases cut off.
function begin({ state, realm, dying, rng }: BeginParams): InterregnumRun {
	const before = snapshot({ state, realm, dying })
	const run: InterregnumRun = {
		state,
		realm,
		dying,
		rng,
		freed: [],
		skipped: [],
		cutOff: [],
		titles: before.titles,
	}
	for (const entry of before.seats) {
		if (state.sovereignCurrent[entry.seat] !== realm)
			run.skipped.push({ seat: entry.seat, reason: "left the realm" })
		else if (state.people.rulerOf[entry.seat] !== entry.holder)
			run.skipped.push({ seat: entry.seat, reason: "holder changed" })
		else run.freed.push(entry)
	}
	STATE.releaseFactions({
		state,
		seats: run.freed.map(({ seat }) => ({
			p: seat,
			supporters: NO_SUPPORTERS,
		})),
		rng,
		reason: "interregnum",
	})
	for (const { seat, holder } of run.freed)
		if (state.people.rulerOf[seat] === holder)
			PEOPLE.promote({ people: state.people, seat })
	const affected = new Set([realm, ...run.freed.map(({ seat }) => seat)])
	for (const title of run.titles)
		for (const owner of STATE_TITLES.dissolve({ state, title }))
			affected.add(owner)
	STATE_TITLES.relink({ state, nations: affected })
	const logged = state.events.length
	STATE.fixConnections({ state, nation: realm, rng })
	run.cutOff = state.events
		.slice(logged)
		.filter((note) => note.tag === "province released")
		.map((note) => note.data.subject as number)
	return run
}

// Each freed realm attacks its weakest bordering freed realm, in ascending
// seat id; a realm already attacked declares nothing.
function declareWars({ run }: DeclareWarsParams): InterregnumWar[] {
	const { state, rng } = run
	const freed = run.freed
		.map(({ seat }) => seat)
		.filter((seat) => STATE.isSovereign({ state, p: seat }))
	const wars: InterregnumWar[] = []
	for (const attacker of freed) {
		const target = WAR.candidates({ state, nation: attacker })
			.filter(
				(candidate) =>
					candidate.threshold > 0 &&
					!candidate.hasWar &&
					freed.includes(candidate.n),
			)
			.map((candidate) => ({
				defender: candidate.n,
				threat: MILITARY.threat({ state, attacker, defender: candidate.n }),
			}))
			.sort((a, b) => a.threat - b.threat || a.defender - b.defender)[0]
		if (!target) continue
		const started = state.wars.length
		WAR.start({
			state,
			attacker,
			defender: target.defender,
			rng,
			goal: "conquest",
		})
		if (state.wars.length > started)
			wars.push({ attacker, defender: target.defender })
	}
	return wars
}

// Regencies are chosen once the freed realms and the crown-land ruler are
// settled, then the wars start and the note is written.
function finish({ run, ruler }: FinishParams): void {
	const { state } = run
	for (const { seat } of run.freed)
		if (STATE.isSovereign({ state, p: seat }))
			REGENCY.start({ state, realm: seat })
	REGENCY.review({ state })
	const wars = declareWars({ run })
	const data: InterregnumNoteData = {
		nation: run.realm,
		dying: run.dying,
		ruler,
		government: ERAS.governmentTypes[state.governmentType[run.realm]],
		freed: run.freed.map(({ seat }) => seat),
		holders: run.freed.map(({ holder }) => holder),
		skipped: run.skipped.map(({ seat }) => seat),
		skippedReasons: run.skipped.map(({ reason }) => reason),
		cutOff: run.cutOff,
		warAttackers: wars.map(({ attacker }) => attacker),
		warDefenders: wars.map(({ defender }) => defender),
		titlesLost: run.titles,
		titlesLostTier: run.titles.map((title) => state.titles.tier[title]),
	}
	state.events.push({ tag: "interregnum", time: state.time, data })
}

export const INTERREGNUM = { begin, finish }
