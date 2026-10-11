import type { RulerRef } from "@/model/history/record/rulers/types"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { STATE_CLOCK } from "@/model/history/sim/engine/state/clock"
import { isSovereign } from "@/model/history/sim/engine/state/relations"
import type {
	AccessionAgeParams,
	AgeBins,
	DrawBinParams,
	DrawRulerParams,
	EndRegencyParams,
	NoteColumnsParams,
	NoteFieldsParams,
	ReadNoteParams,
	RealmRulerParams,
	Ruler,
	RulerRefParams,
	WriteRulerParams,
} from "@/model/history/sim/engine/state/rulers/types"
import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"

const { yearMs, deltaYear } = STATE_CLOCK

const ADULT_AGE = 16
const BIN_YEARS = 5
const NEW_HOUSE_AGE = { min: 20, max: 50 }
const MAX_NAME_SEED = 0x7fffffff

// Accession ages of heirs and of elected rulers, measured on the person model
// over 933 years: 4,097 heirs and 2,724 elected rulers.
const INHERITED_AGE: AgeBins = {
	start: 0,
	weights: [
		337, 342, 387, 401, 436, 490, 511, 453, 399, 190, 100, 26, 17, 6, 2,
	],
}
const ELECTED_AGE: AgeBins = {
	start: 15,
	weights: [226, 284, 387, 434, 392, 329, 238, 192, 149, 59, 30, 4],
}
// Ages of rulers at the 7,668 deaths that opened a succession.
const DEATH_AGE: AgeBins = {
	start: 0,
	weights: [
		37, 14, 28, 92, 174, 208, 284, 328, 350, 378, 468, 929, 1918, 1689, 636,
		123, 12,
	],
}

function drawBin({ bins, floor, rng }: DrawBinParams): number {
	const entries = bins.weights.map((weight, index) => {
		const lo = Math.max(bins.start + index * BIN_YEARS, floor)
		const hi = bins.start + (index + 1) * BIN_YEARS
		return { v: { lo, hi }, w: hi > lo ? (weight * (hi - lo)) / BIN_YEARS : 0 }
	})
	const bin = rng.weightedChoice(entries)
	return bin ? rng.uniform(bin.lo, bin.hi) : floor
}

function accessionAge({ age, rng }: AccessionAgeParams): number {
	if (age === "inherited")
		return drawBin({ bins: INHERITED_AGE, floor: 0, rng })
	if (age === "elected")
		return drawBin({ bins: ELECTED_AGE, floor: ADULT_AGE, rng })
	return rng.uniform(NEW_HOUSE_AGE.min, NEW_HOUSE_AGE.max)
}

function draw({ state, p, dynasty, age, rng }: DrawRulerParams): Ruler {
	const years = accessionAge({ age, rng })
	const culture = state.culture[p]
	const system = culture >= 0 ? state.cultureGenderSystems[culture] : 0
	const nameSeed = rng.randint(1, MAX_NAME_SEED)
	const sequence = state.rulerSequence
	let house = dynasty
	if (house < 0) {
		house = sequence.nextDynasty++
		state.dynastyOrigin.set(house, p)
	}
	const birthMs = state.time - years * yearMs
	const deathAge = Math.max(
		drawBin({ bins: DEATH_AGE, floor: years, rng }),
		years + 1e-6,
	)
	return {
		rulerId: sequence.nextRuler++,
		nameSeed,
		nameOrigin: p,
		sex:
			GENDER_SYSTEM.resolveLeaderGender({ system, seed: nameSeed }) === "female"
				? 1
				: 0,
		dynasty: house,
		birthMs,
		deathMs: birthMs + deathAge * yearMs,
	}
}

function read({ state, p }: RealmRulerParams): Ruler {
	const runtime = state.leaderRuntime
	return {
		rulerId: runtime.rulerId[p],
		nameSeed: runtime.nameSeed[p],
		nameOrigin: runtime.nameOrigin[p],
		sex: runtime.sex[p],
		dynasty: state.leaderDynCurrent[p],
		birthMs: runtime.birth[p],
		deathMs: runtime.death[p],
	}
}

function has({ state, p }: RealmRulerParams): boolean {
	return state.leaderRuntime.rulerId[p] >= 0
}

function write({ state, p, ruler, claim }: WriteRulerParams): void {
	const runtime = state.leaderRuntime
	runtime.idx[p]++
	runtime.rulerId[p] = ruler.rulerId
	runtime.nameOrigin[p] = ruler.nameOrigin
	runtime.sex[p] = ruler.sex
	runtime.birth[p] = ruler.birthMs
	runtime.death[p] = ruler.deathMs
	state.regency[p] = 0
	JOURNAL.ruler({ state, p })
	FIELDS.prov.leader.nameSeed.set({ state, p, value: ruler.nameSeed })
	FIELDS.prov.leader.dynasty.set({ state, p, value: ruler.dynasty })
	FIELDS.prov.leader.claim.set({ state, p, value: claim })
	FIELDS.prov.leader.birthYear.set({ state, p, value: ruler.birthMs / yearMs })
}

function clear({ state, p }: RealmRulerParams): void {
	const runtime = state.leaderRuntime
	runtime.idx[p]++
	runtime.rulerId[p] = -1
	runtime.nameOrigin[p] = -1
	runtime.sex[p] = 0
	runtime.birth[p] = 0
	runtime.death[p] = 0
	state.regency[p] = 0
	FIELDS.prov.leader.nameSeed.set({ state, p, value: -1 })
	FIELDS.prov.leader.dynasty.set({ state, p, value: -1 })
	FIELDS.prov.leader.claim.set({ state, p, value: 0 })
	FIELDS.prov.leader.birthYear.set({ state, p, value: -1 })
}

function enqueueSuccession({ state, p }: RealmRulerParams): void {
	state.heap.enqueue(
		Math.max(state.time, state.leaderRuntime.death[p]),
		EVENT_HEAP.evt.SUCCESSION,
		p,
		state.leaderRuntime.idx[p],
	)
}

function enqueueComingOfAge({ state, p }: RealmRulerParams): void {
	state.heap.enqueue(
		state.leaderRuntime.birth[p] + deltaYear(ADULT_AGE),
		EVENT_HEAP.evt.REGENCY,
		p,
		state.leaderRuntime.idx[p],
	)
}

function reschedule({ state, p }: RealmRulerParams): void {
	state.leaderRuntime.idx[p]++
	enqueueSuccession({ state, p })
	if (state.regency[p]) enqueueComingOfAge({ state, p })
}

function ageYears({ state, p }: RealmRulerParams): number {
	return (state.time - state.leaderRuntime.birth[p]) / yearMs
}

// A child on a sovereign throne is governed by a council until sixteen. The
// end is queued for that birthday; a ruler who has died or been deposed by
// then leaves it stale.
function startRegency({ state, p }: RealmRulerParams): void {
	if (!has({ state, p }) || !isSovereign({ state, p })) return
	if (ageYears({ state, p }) >= ADULT_AGE) return
	state.regency[p] = 1
	state.events.push({
		tag: "regency started",
		time: state.time,
		data: {
			nation: p,
			leader: state.leaderRuntime.idx[p],
			age: Math.round(ageYears({ state, p })),
		},
	})
	enqueueComingOfAge({ state, p })
}

function endRegency({ state, realm, cause }: EndRegencyParams): void {
	if (!state.regency[realm]) return
	state.regency[realm] = 0
	state.events.push({
		tag: "regency ended",
		time: state.time,
		data: { nation: realm, cause },
	})
}

function ref({ state, ruler }: RulerRefParams): RulerRef {
	return {
		rulerId: ruler.rulerId,
		nameSeed: ruler.nameSeed,
		nameOrigin: ruler.nameOrigin,
		sex: ruler.sex,
		dynasty: ruler.dynasty,
		dynastyOrigin: state.dynastyOrigin.get(ruler.dynasty) ?? ruler.nameOrigin,
	}
}

const NOTE_KEYS = [
	"Id",
	"NameSeed",
	"NameOrigin",
	"Sex",
	"Dynasty",
	"DynastyOrigin",
] as const

function noteValues(ref: RulerRef): number[] {
	return [
		ref.rulerId,
		ref.nameSeed,
		ref.nameOrigin,
		ref.sex,
		ref.dynasty,
		ref.dynastyOrigin,
	]
}

function noteFields({ prefix, ref }: NoteFieldsParams): Record<string, number> {
	const values = noteValues(ref)
	return Object.fromEntries(
		NOTE_KEYS.map((key, index) => [`${prefix}${key}`, values[index]]),
	)
}

function noteColumns({
	prefix,
	refs,
}: NoteColumnsParams): Record<string, number[]> {
	return Object.fromEntries(
		NOTE_KEYS.map((key, index) => [
			`${prefix}${key}`,
			refs.map((ref) => noteValues(ref)[index]),
		]),
	)
}

function readNote({ data, prefix }: ReadNoteParams): RulerRef {
	const [rulerId, nameSeed, nameOrigin, sex, dynasty, dynastyOrigin] =
		NOTE_KEYS.map((key) => data[`${prefix}${key}`] as number)
	return { rulerId, nameSeed, nameOrigin, sex, dynasty, dynastyOrigin }
}

function readNoteColumns({ data, prefix }: ReadNoteParams): RulerRef[] {
	const columns = NOTE_KEYS.map((key) => data[`${prefix}${key}`] as number[])
	return columns[0].map((rulerId, index) => ({
		rulerId,
		nameSeed: columns[1][index],
		nameOrigin: columns[2][index],
		sex: columns[3][index],
		dynasty: columns[4][index],
		dynastyOrigin: columns[5][index],
	}))
}

export const STATE_RULERS = {
	adultAge: ADULT_AGE,
	draw,
	read,
	has,
	write,
	clear,
	enqueueSuccession,
	enqueueComingOfAge,
	reschedule,
	startRegency,
	endRegency,
	ageYears,
	ref,
	noteFields,
	noteColumns,
	readNote,
	readNoteColumns,
}
