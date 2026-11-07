import { CAST } from "@/model/people/cast"
import type { Person } from "@/model/people/cast/types"
import { MARRIAGE } from "@/model/people/marriage"
import { KINSHIP } from "@/model/people/marriage/kinship"
import type {
	CandidateParams,
	ChooseParams,
	ConjureParams,
	FreeParams,
} from "@/model/people/marriage/spouse/types"
import { NOBILITY } from "@/model/people/nobility"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const SPOUSE_AGE = {
	male: { min: 18, max: 69 },
	female: { min: 16, max: 44 },
}
const CHANNEL = { order: 1137 }

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

function choose({
	cast,
	owner,
	startMs,
	spouseBirthMs,
	betrothedMs,
}: ChooseParams): Person {
	const seat = NOBILITY.seatOf({ cast, person: owner, timeMs: startMs })
	const frame = CAST.snappedFrame({ cast, timeMs: startMs })
	const nation = frame?.provinceNation[seat] ?? -1
	const conjureWith = (profile: ConjureParams["profile"]) =>
		conjure({ cast, owner, profile, spouseBirthMs, startMs })
	if (!frame || nation < 0) return conjureWith(NOBILITY.lowbornSpouse(seat))
	const rank = NOBILITY.draw({ cast, owner, startMs })
	if (rank.lowborn) return conjureWith(NOBILITY.lowbornSpouse(seat))
	const found = candidate({
		cast,
		owner,
		startMs,
		fromMs: betrothedMs ?? startMs,
		tier: rank.tier,
		realms: new Set([
			nation,
			...NOBILITY.ringOf({ cast, nationId: nation, timeMs: startMs }),
		]),
	})
	if (found) {
		cast.stats.castSpouses++
		return found
	}
	return conjureWith(NOBILITY.nobleSpouse(cast, rank.tier, seat))
}

export const SPOUSE = { choose }
