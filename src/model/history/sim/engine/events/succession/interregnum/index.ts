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
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { WAR } from "@/model/history/sim/engine/events/war"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { ERAS } from "@/model/society/eras"

const NO_SUPPORTERS: number[] = []

function snapshot({ state, realm }: SnapshotParams): InterregnumSnapshot {
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
		seats: SUCCESSION_SYSTEMS.districts({ state, realm }),
	}
}

// Frees every district admin's realm in one batch, then destroys the realm's
// top-tier titles and repairs the crown land the releases cut off.
function begin({ state, realm, late, rng }: BeginParams): InterregnumRun {
	const before = snapshot({ state, realm })
	const run: InterregnumRun = {
		state,
		realm,
		late,
		rng,
		freed: [],
		skipped: [],
		cutOff: [],
		titles: before.titles,
	}
	const freed: number[] = []
	for (const seat of before.seats) {
		if (state.sovereignCurrent[seat] !== realm)
			run.skipped.push({ seat, reason: "left the realm" })
		else freed.push(seat)
	}
	STATE.releaseFactions({
		state,
		seats: freed.map((p) => ({
			p,
			supporters: NO_SUPPORTERS,
			ruler: STATE.newHouse,
		})),
		rng,
	})
	run.freed = freed.map((seat) => ({
		seat,
		ruler: STATE_RULERS.ref({
			state,
			ruler: STATE_RULERS.read({ state, p: seat }),
		}),
	}))
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

// Once the freed realms and the crown-land ruler are settled, the wars start
// and the note is written.
function finish({ run, ruler }: FinishParams): void {
	const { state } = run
	const wars = declareWars({ run })
	const data: InterregnumNoteData = {
		nation: run.realm,
		government: ERAS.governmentTypes[state.governmentType[run.realm]],
		freed: run.freed.map(({ seat }) => seat),
		skipped: run.skipped.map(({ seat }) => seat),
		skippedReasons: run.skipped.map(({ reason }) => reason),
		cutOff: run.cutOff,
		warAttackers: wars.map(({ attacker }) => attacker),
		warDefenders: wars.map(({ defender }) => defender),
		titlesLost: run.titles,
		titlesLostTier: run.titles.map((title) => state.titles.tier[title]),
		...STATE_RULERS.noteFields({ prefix: "late", ref: run.late }),
		...STATE_RULERS.noteFields({ prefix: "ruler", ref: ruler }),
		...STATE_RULERS.noteColumns({
			prefix: "freed",
			refs: run.freed.map(({ ruler }) => ruler),
		}),
	}
	state.events.push({ tag: "interregnum", time: state.time, data })
}

export const INTERREGNUM = { begin, finish }
