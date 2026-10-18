import { ANCHORS } from "@/model/people/anchors"
import { CAST } from "@/model/people/cast"
import type { Person } from "@/model/people/cast/types"
import { MARRIAGE } from "@/model/people/marriage"
import { KINSHIP } from "@/model/people/marriage/kinship"
import type {
	CandidateParams,
	ChooseParams,
	ConjureParams,
	FamilyParams,
	FreeParams,
	SeatOption,
	SeatOptionsParams,
} from "@/model/people/marriage/spouse/types"
import { NOBILITY } from "@/model/people/nobility"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const BUCKET = NOBILITY.bucketMs
const HOLDER_AGE = { min: 36, span: 26 }
const HOLDER_MALE_SHARE = 0.85
const CADET_CHANCE = { focus: 0.4, ring: 0.25 }
const MAX_DEPTH = 1
const MAX_SEATS_TRIED = 3
const SPOUSE_AGE = {
	male: { min: 18, max: 69 },
	female: { min: 16, max: 44 },
}
const CHANNEL = {
	sex: 1130,
	age: 1131,
	cadet: 1132,
	family: 1133,
	order: 1137,
	late: 1141,
}

function conjure({
	cast,
	owner,
	profile,
	spouseBirthMs,
	startMs,
}: ConjureParams): Person {
	cast.stats.createdSpouses++
	return CAST.add({
		cast,
		spec: {
			sex: 1 - owner.sex,
			birthMs: spouseBirthMs,
			lineage: {
				house: false,
				dynasty: profile.dynasty,
				dynastyOrigin: profile.dynastyOrigin,
				home: owner.home,
			},
			ruler: { kind: "none" },
			tier: profile.tier,
			seat: profile.seat,
			parents: { kind: "none", reason: "conjured" },
			inputs: { survivesMs: startMs, fixedDeathMs: null, forcedCause: null },
		},
	})
}

function free({ cast, person, fromMs }: FreeParams): boolean {
	const deathMs = CAST.lifeOf({ cast, person }).deathMs
	for (const id of person.marriages) {
		const marriage = cast.marriages[id]
		if (!MARRIAGE.exclusive({ person, marriage })) continue
		const begins = marriage.betrothedMs ?? marriage.startMs
		if (CAST.endOf({ cast, marriage }) > fromMs && begins < deathMs)
			return false
	}
	return true
}

function candidate({
	cast,
	owner,
	startMs,
	fromMs,
	tier,
	realms,
}: CandidateParams): Person | null {
	const spouseSex = 1 - owner.sex
	const bounds = spouseSex === 1 ? SPOUSE_AGE.female : SPOUSE_AGE.male
	const window = spouseSex === 1 ? [-10, 2] : [-2, 10]
	const ownerAge = (startMs - owner.birthMs) / YEAR
	const seed = CAST.seedOf({ cast, id: owner.id })
	let best: Person | null = null
	let bestRoll = Infinity
	for (const id of cast.bySex[spouseSex]) {
		const other = cast.persons[id]
		const age = (startMs - other.birthMs) / YEAR
		if (
			age < bounds.min ||
			age > bounds.max ||
			age - ownerAge < window[0] ||
			age - ownerAge > window[1] ||
			other.generatedUntil > startMs ||
			other.id === owner.id
		)
			continue
		const roll = HASH.unit({ seed, channel: CHANNEL.order, salt: other.id })
		if (roll >= bestRoll) continue
		if (CAST.lifeOf({ cast, person: other }).deathMs <= startMs) continue
		if (!free({ cast, person: other, fromMs })) continue
		if (NOBILITY.tierOf({ cast, person: other, timeMs: startMs }) !== tier)
			continue
		if (!realms.has(NOBILITY.realmOf({ cast, person: other, timeMs: startMs })))
			continue
		if (!KINSHIP.allowed({ cast, first: owner, second: other })) continue
		best = other
		bestRoll = roll
	}
	return best
}

function family({
	cast,
	seat,
	nationId,
	focusNation,
	timeMs,
}: FamilyParams): Person {
	const bucket = Math.floor(timeMs / BUCKET)
	const id = `${seat.key}:${bucket}`
	const male = NOBILITY.keyed(cast, id, CHANNEL.sex, 0) < HOLDER_MALE_SHARE
	const age =
		HOLDER_AGE.min + NOBILITY.keyed(cast, id, CHANNEL.age, 0) * HOLDER_AGE.span
	const ruler = ANCHORS.rulerAt({ index: cast.anchors, nationId, timeMs })
	const cadet =
		ruler !== null &&
		ruler.ref.dynasty >= 0 &&
		NOBILITY.keyed(cast, id, CHANNEL.cadet, 0) <
			(nationId === focusNation ? CADET_CHANCE.focus : CADET_CHANCE.ring)
	const holder = CAST.add({
		cast,
		spec: {
			sex: male ? 0 : 1,
			birthMs: timeMs - age * YEAR,
			lineage: {
				house: true,
				dynasty:
					cadet && ruler
						? ruler.ref.dynasty
						: Math.floor(
								NOBILITY.keyed(cast, seat.key, CHANNEL.family, 0) * 50000,
							),
				dynastyOrigin: cadet && ruler ? ruler.ref.dynastyOrigin : seat.province,
				home: seat.province,
			},
			ruler: { kind: "none" },
			tier: seat.tier,
			seat: seat.province,
			parents: { kind: "none", reason: "conjured" },
			inputs: { survivesMs: timeMs, fixedDeathMs: null, forcedCause: null },
		},
	})
	cast.seatFamilies.set(id, holder.id)
	cast.stats.seatFamilies++
	cast.depth++
	try {
		MARRIAGE.extend({ cast, id: holder.id, untilMs: timeMs })
	} finally {
		cast.depth--
	}
	return holder
}

function seatOptions({
	cast,
	nations,
	tier,
	owner,
	startMs,
}: SeatOptionsParams): SeatOption[] {
	const frame = CAST.snappedFrame({ cast, timeMs: startMs })
	if (!frame) return []
	const bucket = Math.floor(startMs / BUCKET)
	const seed = CAST.seedOf({ cast, id: owner.id })
	const order = (key: string) =>
		HASH.unit({
			seed: HASH.keyed({ seed, key }),
			channel: CHANNEL.order,
			salt: 0,
		})
	return nations
		.flatMap((nationId) =>
			NOBILITY.seatsOf({ frame, nationId })
				.filter(
					(seat) =>
						seat.tier === tier &&
						!cast.seatFamilies.has(`${seat.key}:${bucket}`),
				)
				.map((seat) => ({ seat, nationId })),
		)
		.sort((a, b) => order(a.seat.key) - order(b.seat.key))
		.slice(0, MAX_SEATS_TRIED)
}

function choose({
	cast,
	owner,
	startMs,
	spouseBirthMs,
	betrothedMs,
	forced,
}: ChooseParams): Person | null {
	const seat = NOBILITY.seatOf({ cast, person: owner, timeMs: startMs })
	const frame = CAST.snappedFrame({ cast, timeMs: startMs })
	const nation = frame?.provinceNation[seat] ?? -1
	const conjureWith = (profile: ConjureParams["profile"]) =>
		conjure({ cast, owner, profile, spouseBirthMs, startMs })
	if (!frame || nation < 0) return conjureWith(NOBILITY.lowbornSpouse(seat))
	const rank = NOBILITY.draw({ cast, owner, startMs })
	if (rank.lowborn) return conjureWith(NOBILITY.lowbornSpouse(seat))
	const nations = [
		nation,
		...NOBILITY.ringOf({ cast, nationId: nation, timeMs: startMs }),
	]
	const params = {
		cast,
		owner,
		startMs,
		fromMs: betrothedMs ?? startMs,
		tier: rank.tier,
		realms: new Set(nations),
	}
	const found = candidate(params)
	if (found) {
		cast.stats.castSpouses++
		return found
	}
	if (rank.tier < 1 || cast.depth >= MAX_DEPTH)
		return conjureWith(NOBILITY.nobleSpouse(cast, rank.tier, seat))
	for (const option of seatOptions({
		cast,
		nations,
		tier: rank.tier,
		owner,
		startMs,
	})) {
		family({
			cast,
			seat: option.seat,
			nationId: option.nationId,
			focusNation: nation,
			timeMs: startMs,
		})
		const raised = candidate(params)
		if (raised) {
			cast.stats.castSpouses++
			return raised
		}
	}
	const age = (startMs - owner.birthMs) / YEAR
	const chance = Math.min(0.5, Math.max(0, age - 25) / 20)
	const roll = HASH.unit({
		seed: CAST.seedOf({ cast, id: owner.id }),
		channel: CHANNEL.late,
		salt: Math.floor(startMs / YEAR),
	})
	if (forced || roll < chance) return conjureWith(NOBILITY.lowbornSpouse(seat))
	return null
}

export const SPOUSE = { choose }
