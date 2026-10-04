import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { PEOPLE } from "@/model/history/sim/people"
import type {
	Anchor,
	BridgeParams,
	HouseParams,
	MaterializeParams,
	PredecessorRelation,
	StartingHouse,
} from "@/model/history/sim/people/family/starting/anchors/types"
import { STARTING_RANDOM } from "@/model/history/sim/people/family/starting/random"
import { FERTILITY } from "@/model/history/sim/people/fertility"
import type { Sex } from "@/model/history/sim/people/types"

const SPACING = 280 / 365 + 0.25

function bridge({ path, origin, older, younger }: BridgeParams): boolean {
	if (older.father || older.mother || younger.father || younger.mother)
		return false
	const gap = younger.birth - older.birth
	if (gap < SPACING || gap > 12) return false
	const parent = (sex: Sex): Anchor => ({
		path: [...path, sex],
		origin,
		sex,
		birth: older.birth - (sex === 0 ? 28 : 25),
		survives: younger.birth,
		death: null,
		father: null,
		mother: null,
		rank: null,
		person: -1,
	})
	const father = parent(0)
	const mother = parent(1)
	// Both births are fixed facts; the shared parents survive through them.
	older.father = younger.father = father
	older.mother = younger.mother = mother
	return true
}

function house({
	seed,
	path,
	seat,
	origin,
	time,
	age,
	rank,
	sovereign,
}: HouseParams): StartingHouse {
	const sources = new Map<number, ReturnType<typeof STARTING_RANDOM.source>>()
	const source = (role: number) => {
		let rng = sources.get(role)
		if (!rng) {
			rng = STARTING_RANDOM.source({ seed, path: [...path, role], purpose: 2 })
			sources.set(role, rng)
		}
		return rng
	}
	const ages = (role: number) =>
		STARTING_RANDOM.source({ seed, path: [...path, role], purpose: 0 })
	const sexSource = STARTING_RANDOM.source({
		seed,
		path: [...path, 0],
		purpose: 1,
	})
	const sex: Sex =
		GENDER_SYSTEM.resolveLeaderGender({
			system: origin.genderSystem,
			seed: sexSource.randint(1, 0x7fffffff),
		}) === "female"
			? 1
			: 0
	const birth = time - age
	const accession = sovereign
		? time - source(0).uniform(0, Math.min(age, 30))
		: time
	const preference = PEOPLE.preference(origin)
	const predecessorSex: Sex =
		preference === "female"
			? 1
			: preference === "male"
				? 0
				: GENDER_SYSTEM.resolveLeaderGender({
							system: origin.genderSystem,
							seed: STARTING_RANDOM.source({
								seed,
								path: [...path, 3],
								purpose: 1,
							}).randint(1, 0x7fffffff),
						}) === "female"
					? 1
					: 0
	const roll = source(3).random()
	const proposal: PredecessorRelation | null = !sovereign
		? null
		: roll < 0.7
			? "child"
			: roll < 0.78
				? "sibling"
				: roll < 0.83
					? "extended kin"
					: "unrelated"
	const make = (role: number): Anchor => ({
		path: [...path, role],
		origin,
		sex: 0,
		birth,
		survives: birth,
		death: null,
		father: null,
		mother: null,
		rank: null,
		person: -1,
	})
	const father = { ...make(1), birth: birth - ages(1).uniform(20, 40), rank }
	const mother = {
		...make(2),
		sex: 1 as const,
		birth:
			birth -
			ages(2).uniform(
				proposal === "sibling" ? Math.max(17, 16 + SPACING) : 17,
				32,
			),
	}
	const holder = { ...make(0), sex, survives: time, father, mother, rank }
	let predecessor: Anchor | null = null
	let relation = proposal
	let fallback: string | null = null
	if (proposal === "child") predecessor = predecessorSex === 0 ? father : mother
	if (proposal === "sibling") {
		const gap = source(3).uniform(
			SPACING,
			Math.min(12, birth - mother.birth - 16, birth - father.birth - 16),
		)
		predecessor = {
			...make(3),
			sex: predecessorSex,
			birth: birth - gap,
			survives: accession,
			death: accession,
			father,
			mother,
			rank,
		}
	}
	if (proposal === "extended kin") {
		const parent = predecessorSex === 0 ? father : mother
		const gap = source(3).uniform(SPACING, 12)
		predecessor = {
			...make(3),
			sex: predecessorSex,
			birth: parent.birth + gap,
			survives: accession,
			death: accession,
			rank,
		}
		bridge({ path: [...path, 9], origin, older: parent, younger: predecessor })
	}
	if (predecessor && (predecessor.birth > accession || birth >= accession)) {
		fallback = "accession before required parent death window"
		predecessor = null
		relation = "unrelated"
	}
	if (sovereign && !predecessor) {
		predecessor = {
			...make(3),
			sex: predecessorSex,
			birth: accession - STARTING_RANDOM.rulerAge({ rng: ages(3) }),
			survives: accession,
			death: accession,
			rank,
		}
		relation = "unrelated"
	}
	const parents = [father, mother]
	for (const parent of parents) {
		if (parent === predecessor) {
			parent.death = accession
			parent.survives = accession
			parent.rank = rank
		} else if (
			parent === father ||
			relation === "sibling" ||
			relation === "extended kin"
		) {
			parent.death =
				accession -
				source(parent.sex === 0 ? 1 : 2).random() * (accession - birth)
			parent.survives = parent.death
		}
	}
	return {
		seed,
		path,
		seat,
		time,
		accession,
		holder,
		predecessor,
		proposal,
		relation,
		fallback,
	}
}

function materialize({ people, seed, anchors }: MaterializeParams): void {
	const pending = new Set<Anchor>()
	const collect = (anchor: Anchor) => {
		if (pending.has(anchor) || anchor.person >= 0) return
		pending.add(anchor)
		if (anchor.father) collect(anchor.father)
		if (anchor.mother) collect(anchor.mother)
	}
	for (const anchor of anchors) collect(anchor)
	const compare = (a: Anchor, b: Anchor) => {
		for (let i = 0; i < Math.max(a.path.length, b.path.length); i++) {
			const difference = (a.path[i] ?? -1) - (b.path[i] ?? -1)
			if (difference) return difference
		}
		return 0
	}
	while (pending.size) {
		const available = [...pending]
			.filter(
				(anchor) =>
					(!anchor.father || anchor.father.person >= 0) &&
					(!anchor.mother || anchor.mother.person >= 0),
			)
			.sort(compare)
		if (!available.length) throw new Error("Cyclic starting ancestry")
		const anchor = available[0]
		const father = anchor.father?.person ?? -1
		const mother = anchor.mother?.person ?? -1
		const dynasty =
			father >= 0 && mother >= 0
				? FERTILITY.childDynasty({
						people,
						father,
						mother,
						origin: anchor.origin,
					})
				: people.nextDynasty++
		anchor.person = PEOPLE.spawn({
			death: anchor.death,
			people,
			sex: anchor.sex,
			birth: anchor.birth,
			survives: anchor.survives,
			father,
			mother,
			dynasty,
			origin: anchor.origin,
			...STARTING_RANDOM.draws({
				seed,
				path: anchor.path,
				sex: anchor.sex,
				origin: anchor.origin,
			}),
		})
		if (anchor.death !== null)
			people.persons.death[anchor.person] = anchor.death
		if (anchor.rank !== null)
			PEOPLE.raise({ people, person: anchor.person, rank: anchor.rank })
		pending.delete(anchor)
	}
}

export const STARTING_ANCHORS = { house, bridge, materialize, spacing: SPACING }
