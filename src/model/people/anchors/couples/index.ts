import type {
	AliveBoundParams,
	AnchoredCouple,
	BirthOfParams,
	BirthWindow,
	ChildCoupleParams,
	CoupleStartParams,
	InjectedPerson,
	InjectParams,
	JoinParams,
	Lineage,
	NewCoupleParams,
	ParentCoupleParams,
	RaiseSurvivesParams,
	WindowParams,
} from "@/model/people/anchors/types"
import { PERSON_KEY } from "@/model/people/keys"
import type { PersonKey } from "@/model/people/keys/types"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const GESTATION = (280 / 365) * YEAR
const ADULT = 16 * YEAR
const LAST_BIRTH = 45 * YEAR
const CHANNEL = { fatherGap: 1300, motherGap: 1301, outsider: 1302 }
const FATHER_GAP = { min: 20, span: 20 }
const MOTHER_GAP = { min: 17, span: 15 }

function unit(params: {
	index: { worldSeed: number }
	id: string
	channel: number
}) {
	return HASH.unit({
		seed: PERSON_KEY.seed({
			worldSeed: params.index.worldSeed,
			key: params.id,
		}),
		channel: params.channel,
		salt: 0,
	})
}

function rulerIdOf(key: PersonKey): number {
	return key.startsWith("R(") ? Number(key.slice(2, -1)) : -1
}

function birthOf({ index, key }: BirthOfParams): number {
	const rulerId = rulerIdOf(key)
	if (rulerId >= 0) return index.facts.get(rulerId)?.birthMs ?? Number.NaN
	return index.injected.get(key)?.birthMs ?? Number.NaN
}

function sexOf({ index, key }: BirthOfParams): number {
	const rulerId = rulerIdOf(key)
	if (rulerId >= 0) return index.facts.get(rulerId)?.ref.sex ?? 0
	return index.injected.get(key)?.sex ?? 0
}

function aliveUntil({ index, key }: AliveBoundParams): number {
	const rulerId = rulerIdOf(key)
	if (rulerId < 0) return Infinity
	return index.facts.get(rulerId)?.fixedDeathMs ?? Infinity
}

function raiseSurvives({ index, key, timeMs }: RaiseSurvivesParams): void {
	const rulerId = rulerIdOf(key)
	if (rulerId >= 0) {
		const fact = index.facts.get(rulerId)
		if (fact) fact.survivesMs = Math.max(fact.survivesMs, timeMs)
		return
	}
	const person = index.injected.get(key)
	if (person) person.survivesMs = Math.max(person.survivesMs, timeMs)
}

function lineage({ index, key }: BirthOfParams): Lineage {
	const rulerId = rulerIdOf(key)
	if (rulerId >= 0) {
		const ref = index.facts.get(rulerId)?.ref
		if (ref)
			return {
				house: true,
				dynasty: ref.dynasty,
				dynastyOrigin: ref.dynastyOrigin,
				home: ref.nameOrigin,
			}
	}
	const person = index.injected.get(key)
	return person
		? {
				house: person.house,
				dynasty: person.dynasty,
				dynastyOrigin: person.dynastyOrigin,
				home: person.home,
			}
		: { house: false, dynasty: -1, dynastyOrigin: -1, home: 0 }
}

function isRuler(key: PersonKey): boolean {
	return key.startsWith("R(")
}

function childLineage({
	index,
	couple,
}: {
	index: WindowParams["index"]
	couple: AnchoredCouple
}): Lineage {
	const father = lineage({ index, key: couple.father })
	const mother = lineage({ index, key: couple.mother })
	if (father.house && mother.house)
		return isRuler(couple.mother) ? mother : father
	if (father.house) return father
	if (mother.house) return mother
	return { ...father, dynasty: -1, dynastyOrigin: -1 }
}

function inject({
	index,
	anchor,
	role,
	sex,
	birthMs,
	lineage: place,
	noParentCharacter,
	survivesMs,
}: InjectParams): InjectedPerson {
	const key = PERSON_KEY.injected({ anchor, role })
	const person: InjectedPerson = {
		key,
		sex,
		birthMs,
		survivesMs,
		noParentCharacter,
		...place,
	}
	index.injected.set(key, person)
	return person
}

function register(index: NewCoupleParams["index"], key: PersonKey, id: string) {
	const list = index.spouseCouples.get(key)
	if (list) list.push(id)
	else index.spouseCouples.set(key, [id])
}

function newCouple({
	index,
	id,
	father,
	mother,
	tie,
}: NewCoupleParams): AnchoredCouple {
	const couple: AnchoredCouple = { id, father, mother, children: [], tie }
	index.couples.set(id, couple)
	register(index, father, id)
	register(index, mother, id)
	return couple
}

function birthWindow({ index, couple }: WindowParams): BirthWindow {
	const fatherBirth = birthOf({ index, key: couple.father })
	const motherBirth = birthOf({ index, key: couple.mother })
	return {
		lo: Math.max(motherBirth + ADULT, fatherBirth + ADULT + GESTATION),
		hi: Math.min(
			motherBirth + LAST_BIRTH,
			aliveUntil({ index, key: couple.mother }),
			aliveUntil({ index, key: couple.father }) + GESTATION,
		),
	}
}

function soloWindow({
	index,
	parent,
}: {
	index: WindowParams["index"]
	parent: PersonKey
}): BirthWindow {
	const birth = birthOf({ index, key: parent })
	if (sexOf({ index, key: parent }) === 1)
		return {
			lo: birth + ADULT,
			hi: Math.min(birth + LAST_BIRTH, aliveUntil({ index, key: parent })),
		}
	return {
		lo: birth + ADULT + GESTATION,
		hi: aliveUntil({ index, key: parent }) + GESTATION,
	}
}

function fits(window: BirthWindow, birthMs: number): boolean {
	return window.lo <= birthMs && birthMs <= window.hi
}

function join({ index, couple, child, birthMs }: JoinParams): void {
	couple.children.push({ key: child, birthMs })
	index.parentCouple.set(child, couple.id)
	raiseSurvives({ index, key: couple.father, timeMs: birthMs - GESTATION })
	raiseSurvives({ index, key: couple.mother, timeMs: birthMs })
}

function outsiderFor({
	index,
	parent,
	anchor,
	firstBirthMs,
}: ChildCoupleParams & { firstBirthMs: number }): AnchoredCouple {
	const existing = index.couples.get(`k:${parent}`)
	if (existing) return existing
	const parentSex = sexOf({ index, key: parent })
	const outsiderSex = 1 - parentSex
	const gap = outsiderSex === 1 ? MOTHER_GAP : FATHER_GAP
	const roll = unit({
		index,
		id: `k:${parent}`,
		channel: outsiderSex === 1 ? CHANNEL.motherGap : CHANNEL.fatherGap,
	})
	const own = lineage({ index, key: parent })
	const person = inject({
		index,
		anchor,
		role: outsiderSex === 1 ? "om" : "oh",
		sex: outsiderSex,
		birthMs: firstBirthMs - (gap.min + gap.span * roll) * YEAR,
		lineage: { house: false, dynasty: -1, dynastyOrigin: -1, home: own.home },
		noParentCharacter: true,
		survivesMs: firstBirthMs,
	})
	const [father, mother] =
		outsiderSex === 1 ? [parent, person.key] : [person.key, parent]
	return newCouple({ index, id: `k:${parent}`, father, mother, tie: null })
}

function kidsWindow({
	index,
	parent,
}: {
	index: WindowParams["index"]
	parent: PersonKey
}): BirthWindow {
	const couple = index.couples.get(`k:${parent}`)
	return couple ? birthWindow({ index, couple }) : soloWindow({ index, parent })
}

function parentCoupleFor({
	index,
	key,
	info,
}: ParentCoupleParams): AnchoredCouple {
	const existing = index.parentCouple.get(key)
	if (existing) {
		const couple = index.couples.get(existing)
		if (couple) return couple
	}
	const id = `p:${key}`
	const fatherRoll = unit({ index, id, channel: CHANNEL.fatherGap })
	const motherRoll = unit({ index, id, channel: CHANNEL.motherGap })
	const fatherHouse = info.house && info.dynasty >= 0
	const father = inject({
		index,
		anchor: id,
		role: "f",
		sex: 0,
		birthMs:
			info.birthMs - (FATHER_GAP.min + FATHER_GAP.span * fatherRoll) * YEAR,
		lineage: fatherHouse
			? {
					house: true,
					dynasty: info.dynasty,
					dynastyOrigin: info.dynastyOrigin,
					home: info.home,
				}
			: { house: false, dynasty: -1, dynastyOrigin: -1, home: info.home },
		noParentCharacter: true,
		survivesMs: info.birthMs - GESTATION,
	})
	const mother = inject({
		index,
		anchor: id,
		role: "m",
		sex: 1,
		birthMs:
			info.birthMs - (MOTHER_GAP.min + MOTHER_GAP.span * motherRoll) * YEAR,
		lineage: { house: false, dynasty: -1, dynastyOrigin: -1, home: info.home },
		noParentCharacter: true,
		survivesMs: info.birthMs,
	})
	const couple = newCouple({
		index,
		id,
		father: father.key,
		mother: mother.key,
		tie: null,
	})
	join({ index, couple, child: key, birthMs: info.birthMs })
	return couple
}

function start({ index, couple }: CoupleStartParams): number {
	if (couple.tie) return couple.tie.startMs
	const first = Math.min(...couple.children.map((child) => child.birthMs))
	return Math.max(
		first - GESTATION - YEAR,
		birthOf({ index, key: couple.father }) + ADULT,
		birthOf({ index, key: couple.mother }) + ADULT,
	)
}

function spouseCouples({ index, key }: BirthOfParams): AnchoredCouple[] {
	return (index.spouseCouples.get(key) ?? [])
		.map((id) => index.couples.get(id))
		.filter((couple): couple is AnchoredCouple => couple !== undefined)
}

export const COUPLES = {
	birthOf,
	sexOf,
	aliveUntil,
	raiseSurvives,
	lineage,
	childLineage,
	inject,
	newCouple,
	birthWindow,
	soloWindow,
	kidsWindow,
	fits,
	join,
	outsiderFor,
	parentCoupleFor,
	start,
	spouseCouples,
	unit,
}
