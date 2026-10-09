import { PEOPLE } from "@/model/history/sim/people"
import { BACKFILL_MARRIAGE } from "@/model/history/sim/people/family/backfill"
import { MARRIAGE_MARKET } from "@/model/history/sim/people/family/market"
import { STARTING_RANDOM } from "@/model/history/sim/people/family/starting/random"
import type {
	AnchorCouple,
	AnchorMarriageParams,
	FamilyParams,
	MarriageHistoryParams,
	WeddingKind,
} from "@/model/history/sim/people/family/starting/types"
import { FERTILITY } from "@/model/history/sim/people/fertility"

function anchorMarriage({
	survives,
	people,
	house,
	mother,
	father,
	path,
}: AnchorMarriageParams): void {
	const table = people.persons
	const children = table.children[mother].filter(
		(child) => table.father[child] === father,
	)
	if (!children.length || table.spouse[mother] === father) return
	const wedding = Math.min(...children.map((child) => table.birth[child])) - 1
	if (
		!PEOPLE.aliveAt({ people, person: mother, time: wedding }) ||
		!PEOPLE.aliveAt({ people, person: father, time: wedding }) ||
		!MARRIAGE_MARKET.seeksSpouse({ people, person: mother, time: wedding }) ||
		!MARRIAGE_MARKET.seeksSpouse({ people, person: father, time: wedding })
	) {
		people.startingFamilies.weddingsRejected.parent++
		return
	}
	people.startingFamilies.weddingsAccepted.parent++
	MARRIAGE_MARKET.marry({ people, a: father, b: mother, time: wedding })
	let ordinal = 0
	FERTILITY.siblings({
		survives,
		people,
		child: children[0],
		until: house.time,
		origin: house.holder.origin,
		rng: STARTING_RANDOM.source({ seed: house.seed, path, purpose: 6 }),
		birthDraws: (sex) =>
			STARTING_RANDOM.draws({
				seed: house.seed,
				path: [...path, 5, ordinal++],
				sex,
				origin: house.holder.origin,
			}),
	})
}

function marriages({
	people,
	house,
	person,
	path,
	founder,
}: MarriageHistoryParams): void {
	const table = people.persons
	const sex = table.sex[person]
	const origin = house.holder.origin
	const age = house.time - table.birth[person]
	if (founder && age < 18) return
	const source = STARTING_RANDOM.source({ seed: house.seed, path, purpose: 5 })
	let wedding = founder
		? Math.min(
				house.time,
				table.birth[person] + source.uniform(sex === 0 ? 18 : 16, 25),
			)
		: table.birth[person] + (sex === 0 ? 18 : 16)
	let completed = 0
	let ordinal = 0
	while (
		wedding <= house.time &&
		wedding < table.death[person] &&
		completed < 2
	) {
		const opportunity = ordinal++
		if (!MARRIAGE_MARKET.seeksSpouse({ people, person, time: wedding })) break
		const chance = founder && opportunity === 0 ? 0.85 : 0.35
		if (source.random() >= chance) {
			if (founder && opportunity === 0) return
			wedding++
			continue
		}
		const candidatePath = [...path, 4, opportunity]
		const spouseSex = sex === 0 ? 1 : 0
		const draws = STARTING_RANDOM.draws({
			seed: house.seed,
			path: candidatePath,
			sex: spouseSex,
			origin,
		})
		const spouse = MARRIAGE_MARKET.outsider({
			people,
			partner: person,
			time: wedding,
			origin,
			rng: STARTING_RANDOM.source({
				seed: house.seed,
				path: candidatePath,
				purpose: 0,
			}),
			draws,
		})
		people.startingFamilies.spouseCandidates++
		const kind: WeddingKind =
			completed > 0 ? "remarriage" : founder ? "founder" : "descendant"
		if (
			!BACKFILL_MARRIAGE.acceptable({
				people,
				a: person,
				b: spouse,
				time: wedding,
			})
		) {
			people.startingFamilies.weddingsRejected[kind]++
			people.startingFamilies.rejectedCandidates.push(spouse)
			if (founder && opportunity === 0) return
			wedding++
			continue
		}
		completed++
		people.startingFamilies.weddingsAccepted[kind]++
		if (founder && completed === 1) people.startingFamilies.founderMarriages++
		if (completed === 2) people.startingFamilies.remarriages++
		MARRIAGE_MARKET.marry({ people, a: person, b: spouse, time: wedding })
		const mother = sex === 1 ? person : spouse
		const father = sex === 0 ? person : spouse
		let childOrdinal = 0
		FERTILITY.bear({
			people,
			mother,
			father,
			from: wedding,
			until: house.time,
			survives:
				mother === house.holder.person
					? house.time
					: mother === house.predecessor?.person
						? house.accession
						: wedding,
			now: house.time,
			origin,
			rng: STARTING_RANDOM.source({
				seed: house.seed,
				path: [...candidatePath, 6],
				purpose: 6,
			}),
			birthDraws: (childSex) =>
				STARTING_RANDOM.draws({
					seed: house.seed,
					path: [...candidatePath, 6, childOrdinal++],
					sex: childSex,
					origin,
				}),
		})
		wedding = Math.min(table.death[person], table.death[spouse]) + 1
	}
}

function materialize({ people, house }: FamilyParams): number {
	const table = people.persons
	const holder = house.holder.person
	const father = table.father[holder]
	const mother = table.mother[holder]
	const couples = new Map<number, AnchorCouple>()
	for (const parent of [house.holder.father, house.holder.mother])
		if (parent?.mother && parent.father)
			couples.set(parent.mother.person, {
				father: parent.father.person,
				survives: parent.mother.survives,
			})
	let bridgeOrdinal = 0
	for (const [bridgeMother, { father: bridgeFather, survives }] of couples)
		anchorMarriage({
			people,
			house,
			mother: bridgeMother,
			survives,
			father: bridgeFather,
			path: [...house.path, 9, bridgeOrdinal++],
		})
	anchorMarriage({
		people,
		house,
		mother,
		father,
		survives: house.holder.mother?.survives ?? table.birth[holder],
		path: [...house.path, 1],
	})
	marriages({
		people,
		house,
		person: holder,
		path: [...house.path, 0],
		founder: true,
	})
	const siblings = table.children[mother]
		.filter((person) => person !== holder && table.father[person] === father)
		.sort((a, b) => table.birth[a] - table.birth[b] || a - b)
	const children = [...table.children[holder]].sort(
		(a, b) => table.birth[a] - table.birth[b] || a - b,
	)
	for (const [role, members] of [
		[5, siblings],
		[6, children],
	] as const)
		for (const [ordinal, person] of members.entries())
			marriages({
				people,
				house,
				person,
				path: [...house.path, role, ordinal],
				founder: false,
			})
	return holder
}

export const STARTING_FAMILY = { materialize }
