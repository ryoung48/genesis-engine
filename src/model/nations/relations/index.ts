import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { NATION } from ".."
import { Relation } from "./types"

const _relations = {
	get: (params: { province: Province; other: Province; time?: number }) => {
		const { province, other, time } = params
		const { relation } = PROVINCE.history.find<
			{ relation: Relation },
			Province["_relations"][number][number]
		>(province._relations[other.idx] ?? [], { relation: "neutral" }, time)
		return relation
	},
	set: (params: {
		province: Province
		other: Province
		relation: Relation
	}) => {
		const { province, other, relation } = params
		if (!province._relations[other.idx]) province._relations[other.idx] = []
		const lastEntry =
			province._relations[other.idx][province._relations[other.idx].length - 1]
		if (relation === lastEntry?.relation) return
		if (lastEntry && lastEntry.time === window.world.time) {
			lastEntry.relation = relation
			const prior =
				province._relations[other.idx][
					province._relations[other.idx].length - 2
				]
			if (prior && prior.relation === relation)
				province._relations[other.idx].pop()
		} else {
			province._relations[other.idx].push({
				time: window.world.time,
				relation,
			})
		}
	},
}

const DEFENDER_ALLIES: Relation[] = [
	"ally",
	"overlord",
	"vassal",
	"personal_union_senior",
	"personal_union_junior",
]
const ATTACKER_ALLIES: Relation[] = [
	"overlord",
	"vassal",
	"personal_union_senior",
	"personal_union_junior",
]

export const RELATIONS = {
	allies: (params: {
		nation: Province
		type: "offensive" | "defensive"
		target?: Province
		time?: number
	}) => {
		const { nation, type, target, time } = params
		const valid = type === "offensive" ? ATTACKER_ALLIES : DEFENDER_ALLIES
		return RELATIONS.all(nation, time)
			.filter(
				(p) =>
					valid.includes(p.relation) &&
					target !== p.nation &&
					_relations.get({
						province: p.nation,
						other: target,
						time,
					}) !== "ally",
			)
			.map((p) => p.nation)
	},
	get: (params: { nation: Province; other: Province; time?: number }) => {
		return _relations.get({
			province: params.nation,
			other: params.other,
			time: params.time,
		})
	},
	all: (nation: Province, time?: number) => {
		const others = Object.keys(nation._relations)
			.map((idxStr) => Number(idxStr))
			.sort((a, b) => a - b)
			.map((otherIdx) => window.world.provinces[otherIdx])
			.filter((other) => other && NATION.sovereign(other))

		return others.map((other) => ({
			nation: other,
			relation: _relations.get({ province: nation, other, time }),
		}))
	},
	set: (params: { nation: Province; other: Province; relation: Relation }) => {
		const { nation, other, relation } = params
		const flip =
			relation === "vassal"
				? "overlord"
				: relation === "overlord"
					? "vassal"
					: relation === "personal_union_junior"
						? "personal_union_senior"
						: relation === "personal_union_senior"
							? "personal_union_junior"
							: relation
		_relations.set({
			province: nation,
			other,
			relation: flip,
		})
		_relations.set({
			province: other,
			other: nation,
			relation,
		})
	},
	overlord: (province: Province, time?: number): Province | undefined => {
		return RELATIONS.all(province, time).find(
			(r) =>
				r.relation === "overlord" ||
				r.relation === "personal_union_senior",
		)?.nation
	},
}
