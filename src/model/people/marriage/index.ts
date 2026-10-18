import { FRAME } from "@/model/history/world-frame"
import { CAST } from "@/model/people/cast"
import type { Marriage, Reservation } from "@/model/people/cast/types"
import { RELIGION_DOCTRINE } from "@/model/people/doctrine"
import type { MarriageType } from "@/model/people/doctrine/types"
import { FERTILITY } from "@/model/people/fertility"
import { KINSHIP } from "@/model/people/marriage/kinship"
import { SPOUSE } from "@/model/people/marriage/spouse"
import type {
	AttemptParams,
	CoverParams,
	DueParams,
	ExclusiveParams,
	ExtendParams,
	MarkUnfitParams,
	OpenParams,
	PlaceParams,
	SearchParams,
	SettleParams,
	StandingParams,
	TypeAtParams,
	WedParams,
} from "@/model/people/marriage/types"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const MONTH = YEAR / 12
const MARKET_CHANCE = 0.35
const MAX_GAP_YEARS = 9
const AGES = {
	female: { min: 16, max: 44 },
	male: { min: 18, max: 69 },
}
const CHANNEL = {
	seek: 1100,
	gap: 1101,
	season: 1102,
	betroth: 1103,
	betrothSeason: 1104,
	betrothGap: 1105,
	plural: 1110,
	pluralSeason: 1111,
	pluralGap: 1112,
}
const PLURAL = {
	minAge: 18,
	maxAge: 69,
	desired: [0, 0, 1, 2, 3, 3],
}
const BETROTHAL = { minAge: 12, adultAge: 16, maxGap: 5, maxSpouseAge: 20 }
const FORCED_WIFE_MAX_AGE = 38
const FORCED_LEAD = 2 * YEAR

function clamp(value: number, low: number, high: number): number {
	return Math.max(low, Math.min(high, value))
}

function exclusive({ person, marriage }: ExclusiveParams): boolean {
	if (marriage.wife === person.id) return true
	return marriage.kind !== "plural" && marriage.kind !== "concubine"
}

function place({ cast, marriage, reservation }: PlaceParams): boolean {
	const spec = reservation.child
	if (
		spec.ruler.kind === "ruler" &&
		cast.rulerPerson.has(spec.ruler.ref.rulerId)
	)
		return false
	const fact =
		spec.ruler.kind === "ruler"
			? cast.anchors.facts.get(spec.ruler.ref.rulerId)
			: undefined
	const child = CAST.add({
		cast,
		spec: {
			sex: spec.sex,
			birthMs: reservation.birthMs,
			lineage:
				spec.lineage ??
				FERTILITY.childLineage({
					husband: cast.persons[marriage.husband],
					wife: cast.persons[marriage.wife],
				}),
			ruler: spec.ruler,
			tier: spec.tier,
			seat: -2,
			parents: { kind: "couple", marriage: marriage.id },
			inputs: fact
				? {
						survivesMs: fact.survivesMs,
						fixedDeathMs: fact.fixedDeathMs,
						forcedCause: null,
					}
				: {
						survivesMs: spec.survivesMs,
						fixedDeathMs: spec.ruler.kind === "ruler" ? Infinity : null,
						forcedCause: null,
					},
		},
	})
	FERTILITY.planBirth({
		marriage,
		child: child.id,
		birthMs: reservation.birthMs,
	})
	reservation.state = "placed"
	reservation.placed = child.id
	return true
}

function settleReserved(cast: OpenParams["cast"], marriage: Marriage): void {
	for (const id of [marriage.husband, marriage.wife]) {
		for (const reservation of cast.reservations.get(
			CAST.ownerKey(cast.persons[id]),
		) ?? []) {
			if (
				reservation.state !== "open" ||
				!FERTILITY.canBear({ cast, marriage, birthMs: reservation.birthMs })
			)
				continue
			place({ cast, marriage, reservation })
		}
	}
}

function open({
	cast,
	husband,
	wife,
	startMs,
	kind,
	betrothedMs,
	kinship,
	revealedLater,
}: OpenParams): Marriage {
	const marriage: Marriage = {
		id: cast.marriages.length,
		husband,
		wife,
		startMs,
		kind,
		betrothedMs,
		kinship,
		pregnancies: [],
		children: [],
		cursor: { month: 0, nextFreeMs: startMs, closed: false },
		revealedLater,
	}
	cast.marriages.push(marriage)
	for (const id of [husband, wife]) {
		const list = cast.persons[id].marriages
		list.push(marriage.id)
		list.sort((a, b) => cast.marriages[a].startMs - cast.marriages[b].startMs)
	}
	settleReserved(cast, marriage)
	return marriage
}

function wed({
	cast,
	owner,
	spouse,
	startMs,
	betrothedMs,
	kind,
	exclusive: strict,
}: WedParams): Marriage | null {
	const start =
		betrothedMs === null
			? startMs
			: Math.max(
					owner.birthMs + BETROTHAL.adultAge * YEAR,
					spouse.birthMs + BETROTHAL.adultAge * YEAR,
				)
	const endMs = Math.min(
		CAST.lifeOf({ cast, person: owner }).deathMs,
		CAST.lifeOf({ cast, person: spouse }).deathMs,
	)
	if (endMs <= start) return null
	if (
		betrothedMs !== null &&
		spouse.birthMs > betrothedMs - BETROTHAL.minAge * YEAR
	)
		return null
	if (
		strict &&
		owner.marriages.some((id) => {
			const other = cast.marriages[id]
			return (
				exclusive({ person: owner, marriage: other }) &&
				other.startMs < endMs &&
				CAST.endOf({ cast, marriage: other }) > start
			)
		})
	)
		return null
	const [husband, wife] = owner.sex === 0 ? [owner, spouse] : [spouse, owner]
	return open({
		cast,
		husband: husband.id,
		wife: wife.id,
		startMs: start,
		kind,
		betrothedMs,
		kinship: KINSHIP.label({ cast, first: owner, second: spouse }),
		revealedLater: false,
	})
}

function settle(params: SettleParams): Marriage | null {
	const spouse = SPOUSE.choose({
		cast: params.cast,
		owner: params.owner,
		startMs: params.startMs,
		spouseBirthMs: params.spouseBirthMs,
		betrothedMs: params.betrothedMs,
		forced: params.forced,
	})
	if (!spouse) return null
	return wed({
		cast: params.cast,
		owner: params.owner,
		spouse,
		startMs: params.startMs,
		betrothedMs: params.betrothedMs,
		kind: params.kind,
		exclusive: params.exclusive,
	})
}

function due({ cast, person, cursorMs }: DueParams) {
	for (const reservation of cast.reservations.get(CAST.ownerKey(person)) ??
		[]) {
		if (reservation.state !== "open") continue
		const conceptionMs = reservation.birthMs - FERTILITY.gestationMs
		if (conceptionMs <= cursorMs || conceptionMs > cursorMs + FORCED_LEAD)
			continue
		const covered = person.marriages.some((id) =>
			FERTILITY.canBear({
				cast,
				marriage: cast.marriages[id],
				birthMs: reservation.birthMs,
			}),
		)
		if (!covered) return reservation
	}
	return null
}

function cover({ cast, person, fromMs, toMs }: CoverParams): void {
	for (const reservation of cast.reservations.get(CAST.ownerKey(person)) ??
		[]) {
		if (reservation.state !== "open") continue
		const conceptionMs = reservation.birthMs - FERTILITY.gestationMs
		if (conceptionMs <= fromMs || conceptionMs > toMs) continue
		const covered = person.marriages.some((id) =>
			FERTILITY.canBear({
				cast,
				marriage: cast.marriages[id],
				birthMs: reservation.birthMs,
			}),
		)
		if (covered) continue
		attempt({
			cast,
			owner: person,
			cursorMs: fromMs,
			salt: 7000,
			forced: reservation,
			kind: "concubine",
		})
	}
}

function attempt({
	cast,
	owner,
	cursorMs,
	salt,
	forced,
	kind,
}: AttemptParams): Marriage | null {
	const seed = CAST.seedOf({ cast, id: owner.id })
	let startMs =
		cursorMs + HASH.unit({ seed, channel: CHANNEL.season, salt }) * 0.99 * YEAR
	if (forced)
		startMs = Math.max(
			cursorMs,
			forced.birthMs - FERTILITY.gestationMs - 2 * MONTH,
		)
	const age = (startMs - owner.birthMs) / YEAR
	const gap = Math.floor(
		HASH.unit({ seed, channel: CHANNEL.gap, salt }) * MAX_GAP_YEARS,
	)
	const spouseAge =
		owner.sex === 1
			? clamp(age + gap, AGES.male.min, AGES.male.max)
			: clamp(
					age - gap,
					AGES.female.min,
					forced ? FORCED_WIFE_MAX_AGE : AGES.female.max,
				)
	return settle({
		cast,
		owner,
		startMs,
		spouseBirthMs: startMs - spouseAge * YEAR,
		betrothedMs: null,
		kind,
		exclusive: kind === "free",
		forced: forced !== null,
	})
}

function betroth({ cast, person, untilMs }: SearchParams): Marriage | null {
	const state = person.search
	const seed = CAST.seedOf({ cast, id: person.id })
	while (state.betrothAge < BETROTHAL.adultAge) {
		const age = state.betrothAge
		const betrothedMs =
			person.birthMs +
			(age +
				0.99 * HASH.unit({ seed, channel: CHANNEL.betrothSeason, salt: age })) *
				YEAR
		if (betrothedMs > untilMs) return null
		state.betrothAge++
		if (
			HASH.unit({ seed, channel: CHANNEL.betroth, salt: age }) >= MARKET_CHANCE
		)
			continue
		const gap =
			Math.floor(
				HASH.unit({ seed, channel: CHANNEL.betrothGap, salt: age }) *
					(2 * BETROTHAL.maxGap + 1),
			) - BETROTHAL.maxGap
		const spouseBirthMs =
			betrothedMs -
			clamp(age + gap, BETROTHAL.minAge, BETROTHAL.maxSpouseAge) * YEAR
		const marriage = settle({
			cast,
			owner: person,
			startMs: Math.max(
				person.birthMs + BETROTHAL.adultAge * YEAR,
				spouseBirthMs + BETROTHAL.adultAge * YEAR,
			),
			spouseBirthMs,
			betrothedMs,
			kind: "free",
			exclusive: true,
			forced: false,
		})
		if (marriage) {
			state.betrothAge = BETROTHAL.adultAge
			return marriage
		}
	}
	return null
}

function searchFree({ cast, person, untilMs }: SearchParams): void {
	const state = person.search
	const ages = person.sex === 1 ? AGES.female : AGES.male
	const seed = CAST.seedOf({ cast, id: person.id })
	const life = CAST.lifeOf({ cast, person })
	const limit = Math.min(
		life.deathMs,
		person.birthMs + ages.max * YEAR,
		untilMs,
	)
	const betrothed = betroth({ cast, person, untilMs })
	if (betrothed) {
		state.found++
		const end = CAST.endOf({ cast, marriage: betrothed })
		state.cursorMs = Math.max(
			state.cursorMs,
			end === Infinity ? betrothed.startMs : end + YEAR,
		)
	}
	let cursor = state.cursorMs
	if (person.sex === 0 && state.found === 0)
		cover({
			cast,
			person,
			fromMs: person.birthMs + FERTILITY.adult * YEAR,
			toMs: Math.min(cursor + YEAR, untilMs),
		})
	while (cursor <= limit) {
		const inside = person.marriages
			.map((id) => cast.marriages[id])
			.find(
				(marriage) =>
					exclusive({ person, marriage }) &&
					marriage.startMs <= cursor &&
					cursor < CAST.endOf({ cast, marriage }),
			)
		if (inside) {
			const end = CAST.endOf({ cast, marriage: inside })
			if (person.sex === 0)
				cover({ cast, person, fromMs: cursor, toMs: Math.min(end, untilMs) })
			if (end === Infinity || end > limit) break
			cursor = end + YEAR
			continue
		}
		const age = Math.floor((cursor - person.birthMs) / YEAR)
		const salt = state.found * 200 + age
		const forced = due({ cast, person, cursorMs: cursor })
		if (
			forced ||
			HASH.unit({ seed, channel: CHANNEL.seek, salt }) < MARKET_CHANCE
		) {
			const marriage = attempt({
				cast,
				owner: person,
				cursorMs: cursor,
				salt,
				forced,
				kind: "free",
			})
			if (marriage) {
				state.found++
				const end = CAST.endOf({ cast, marriage })
				if (end === Infinity) {
					cursor = Math.max(cursor, marriage.startMs)
					break
				}
				cursor = end + YEAR
				continue
			}
		}
		cursor += YEAR
	}
	state.cursorMs = cursor
}

function standingOf({ cast, person, timeMs }: StandingParams): number {
	const fact = CAST.factOf({ cast, person })
	const reign = fact?.reigns[0]
	const frame = CAST.snappedFrame({ cast, timeMs })
	if (!reign || !frame) return 0
	const tier = FRAME.heldTitles({ frame, nationId: reign.nationId }).reduce(
		(top, title) => Math.max(top, frame.titles?.tier[title] ?? 0),
		-1,
	)
	return tier + 1
}

function marriageTypeAt({ cast, person, timeMs }: TypeAtParams): MarriageType {
	const doctrine = cast.context?.doctrine
	const frame = CAST.snappedFrame({ cast, timeMs })
	if (!doctrine || !frame) return "monogamy"
	return RELIGION_DOCTRINE.marriageType({
		doctrine,
		religion: frame.provinceReligion[person.home] ?? -1,
	})
}

function searchPlural({ cast, person, untilMs }: SearchParams): void {
	if (person.sex !== 0 || !cast.context?.doctrine) return
	const state = person.search
	const seed = CAST.seedOf({ cast, id: person.id })
	const limit = Math.min(
		CAST.lifeOf({ cast, person }).deathMs,
		person.birthMs + PLURAL.maxAge * YEAR,
		untilMs,
	)
	for (; person.birthMs + state.pluralAge * YEAR <= limit; state.pluralAge++) {
		const age = state.pluralAge
		if (
			HASH.unit({ seed, channel: CHANNEL.plural, salt: age }) >= MARKET_CHANCE
		)
			continue
		const now = person.birthMs + age * YEAR
		const type = marriageTypeAt({ cast, person, timeMs: now })
		if (type === "monogamy") continue
		const desired =
			PLURAL.desired[
				Math.min(
					standingOf({ cast, person, timeMs: now }),
					PLURAL.desired.length - 1,
				)
			]
		const current = person.marriages.filter((id) => {
			const marriage = cast.marriages[id]
			return (
				marriage.husband === person.id &&
				!exclusive({ person, marriage }) &&
				CAST.endOf({ cast, marriage }) > now
			)
		}).length
		if (current >= desired) continue
		const startMs =
			now +
			HASH.unit({ seed, channel: CHANNEL.pluralSeason, salt: age }) *
				0.99 *
				YEAR
		const gap = Math.floor(
			HASH.unit({ seed, channel: CHANNEL.pluralGap, salt: age }) *
				MAX_GAP_YEARS,
		)
		settle({
			cast,
			owner: person,
			startMs,
			spouseBirthMs:
				startMs - clamp(age - gap, AGES.female.min, AGES.female.max) * YEAR,
			betrothedMs: null,
			kind: type === "polygamy" ? "plural" : "concubine",
			exclusive: false,
			forced: false,
		})
	}
}

function settled(
	cast: MarkUnfitParams["cast"],
	reservation: Reservation,
): boolean {
	const spec = reservation.child
	if (spec.ruler.kind !== "ruler") return false
	const id = cast.rulerPerson.get(spec.ruler.ref.rulerId)
	if (id === undefined) return false
	reservation.state = "placed"
	reservation.placed = id
	return true
}

function markUnfit({ cast, person, untilMs }: MarkUnfitParams): void {
	for (const reservation of cast.reservations.get(CAST.ownerKey(person)) ??
		[]) {
		if (reservation.state !== "open" || reservation.birthMs > untilMs) continue
		if (settled(cast, reservation)) continue
		reservation.state = "unfit"
		if (reservation.source === "plan") cast.stats.reservedUnfit++
	}
}

function extend({ cast, id, untilMs }: ExtendParams): void {
	const person = cast.persons[id]
	if (untilMs <= person.generatedUntil) return
	if (person.house) {
		searchFree({ cast, person, untilMs })
		searchPlural({ cast, person, untilMs })
	}
	for (const marriageId of [...person.marriages])
		FERTILITY.advance({ cast, marriage: cast.marriages[marriageId], untilMs })
	person.generatedUntil = untilMs
	markUnfit({ cast, person, untilMs })
}

export const MARRIAGE = { extend, open, place, exclusive }
