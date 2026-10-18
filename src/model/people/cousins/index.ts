import { ANCHORS } from "@/model/people/anchors"
import { COUPLES } from "@/model/people/anchors/couples"
import type { LinkParams, SideParams } from "@/model/people/cousins/types"
import { PEOPLE_STORE } from "@/model/people/store"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"

const YEAR = TIME.constants.yearMS
const GESTATION = (280 / 365) * YEAR
const MIN_GAP = YEAR
const MAX_GAP = 12 * YEAR
const LAST_BIRTH = 45 * YEAR
const FATHER_GAP = { min: 20, span: 20 }
const MOTHER_GAP = { min: 17, span: 15 }
const CHANNEL = { father: 1140, mother: 1141 }

function generated(store: LinkParams["store"], ruler: LinkParams["first"]) {
	const index = PEOPLE_STORE.index(store)
	const couple = ANCHORS.parentCouple({
		index,
		key: ruler.key,
		info: {
			house: true,
			dynasty: ruler.ref.dynasty,
			dynastyOrigin: ruler.ref.dynastyOrigin,
			home: ruler.ref.nameOrigin,
			birthMs: ruler.birthMs,
			sex: ruler.ref.sex,
		},
	})
	return couple.id.startsWith("p:") ? couple : null
}

function side({ store, mothersSide, fathersSide }: SideParams): boolean {
	const index = PEOPLE_STORE.index(store)
	const mothersCouple = generated(store, mothersSide)
	const fathersCouple = generated(store, fathersSide)
	if (!mothersCouple || !fathersCouple) return false
	const motherKey = mothersCouple.mother
	const fatherKey = fathersCouple.father
	const mother = index.injected.get(motherKey)
	const father = index.injected.get(fatherKey)
	if (
		!mother ||
		!father ||
		!father.house ||
		index.parentCouple.has(motherKey) ||
		index.parentCouple.has(fatherKey) ||
		store.stubs.has(motherKey)
	)
		return false
	const gap = Math.abs(mother.birthMs - father.birthMs)
	if (gap < MIN_GAP || gap > MAX_GAP) return false
	const older = Math.min(mother.birthMs, father.birthMs)
	const younger = Math.max(mother.birthMs, father.birthMs)
	const id = `c:${motherKey}`
	const fatherRoll = HASH.unit({
		seed: store.worldSeed ^ (older | 0),
		channel: CHANNEL.father,
		salt: 0,
	})
	const motherRoll = HASH.unit({
		seed: store.worldSeed ^ (older | 0),
		channel: CHANNEL.mother,
		salt: 0,
	})
	const grandMotherBirth =
		older - (MOTHER_GAP.min + MOTHER_GAP.span * motherRoll) * YEAR
	if (younger - grandMotherBirth > LAST_BIRTH) return false
	const grandfather = COUPLES.inject({
		index,
		anchor: id,
		role: "f",
		sex: 0,
		birthMs: older - (FATHER_GAP.min + FATHER_GAP.span * fatherRoll) * YEAR,
		lineage: {
			house: true,
			dynasty: father.dynasty,
			dynastyOrigin: father.dynastyOrigin,
			home: father.home,
		},
		noParentCharacter: true,
		survivesMs: younger - GESTATION,
	})
	const grandmother = COUPLES.inject({
		index,
		anchor: id,
		role: "m",
		sex: 1,
		birthMs: grandMotherBirth,
		lineage: {
			house: false,
			dynasty: -1,
			dynastyOrigin: -1,
			home: father.home,
		},
		noParentCharacter: true,
		survivesMs: younger,
	})
	const couple = COUPLES.newCouple({
		index,
		id,
		father: grandfather.key,
		mother: grandmother.key,
		tie: null,
	})
	COUPLES.join({ index, couple, child: motherKey, birthMs: mother.birthMs })
	COUPLES.join({ index, couple, child: fatherKey, birthMs: father.birthMs })
	mother.dynasty = father.dynasty
	mother.dynastyOrigin = father.dynastyOrigin
	return true
}

function link({ store, first, second }: LinkParams): boolean {
	return (
		side({ store, mothersSide: first, fathersSide: second }) ||
		side({ store, mothersSide: second, fathersSide: first })
	)
}

export const COUSINS = { link }
