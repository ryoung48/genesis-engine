import { DERIVE } from "@/model/history/generated/derive"
import { FIELDS } from "@/model/history/generated/fields"
import type { FrameAtParams } from "@/model/history/generated/frame/types"
import { STATE } from "@/model/history/generated/state"
import type { HistoryState } from "@/model/history/generated/state/types"
import type {
	NationFrame,
	NationRelations,
	PartitionRow,
	WarFrame,
	WorldFrame,
} from "@/model/history/world-frame/types"
import { ERAS } from "@/model/society/eras"

function colorAt({
	colors,
	id,
}: {
	colors: Float32Array
	id: number
}): readonly [number, number, number] {
	const offset = id * 3
	return [0, 1, 2].map((component) =>
		Math.round(Math.max(0, Math.min(1, colors[offset + component] ?? 0)) * 255),
	) as [number, number, number]
}

function partitionRows({
	colors,
	count,
	prefix,
}: {
	colors: Float32Array
	count: number
	prefix: string
}): PartitionRow[] {
	return Array.from({ length: count }, (_, id) => ({
		id,
		key: `${prefix.toLowerCase()}-${id}`,
		name: `${prefix} ${id + 1}`,
		color: colorAt({ colors, id }),
	}))
}

function emptyRelations(): NationRelations {
	return {
		overlord: -1,
		vassals: [],
		vassalSubjectTypes: [],
		unionSeniorOf: [],
		unionJuniorPartner: -1,
		allies: [],
		guarantees: [],
		royalMarriages: [],
		rivals: [],
	}
}

function relationsAt({
	state,
	nation,
	timeMs,
}: {
	state: HistoryState
	nation: number
	timeMs: number
}): NationRelations {
	const relations = emptyRelations()
	for (let other = 0; other < state.P; other++) {
		if (other === nation || state.desolate[other]) continue
		const relation = FIELDS.rel.get({
			state,
			a: nation,
			b: other,
			time: timeMs,
		})
		if (relation === STATE.rel.OVERLORD) {
			relations.overlord = other
		} else if (relation === STATE.rel.VASSAL) {
			relations.vassals.push(other)
			relations.vassalSubjectTypes.push({
				nationId: other,
				subjectType: "vassal",
			})
		} else if (relation === STATE.rel.COLONY) {
			relations.vassals.push(other)
			relations.vassalSubjectTypes.push({
				nationId: other,
				subjectType: "colony",
			})
		} else if (relation === STATE.rel.PU_SENIOR) {
			relations.unionJuniorPartner = other
		} else if (relation === STATE.rel.PU_JUNIOR) {
			relations.unionSeniorOf.push(other)
		} else if (relation === STATE.rel.ALLY) {
			relations.allies.push(other)
		} else if (relation === STATE.rel.RIVAL) {
			relations.rivals.push(other)
		}
	}
	return relations
}

function cultureBlendAt({ state, timeMs }: FrameAtParams): Int32Array {
	const blends = new Int32Array(state.P).fill(-1)
	for (let province = 0; province < state.P; province++) {
		blends[province] = FIELDS.prov.cultureBlendSecondary.get({
			state,
			p: province,
			time: timeMs,
		})
	}
	return blends
}

function warsAt({ state, timeMs }: FrameAtParams): WarFrame[] {
	const occupiedByWar = new Map<number, number[]>()
	for (let province = 0; province < state.P; province++) {
		const warId = FIELDS.prov.occupation.get({
			state,
			p: province,
			time: timeMs,
		})
		if (warId < 0) continue
		const occupied = occupiedByWar.get(warId) ?? []
		occupied.push(province)
		occupiedByWar.set(warId, occupied)
	}
	return state.wars.flatMap((war) => {
		if (war.startTime > timeMs || (war.endTime ?? Infinity) <= timeMs) return []
		return [
			{
				id: war.idx,
				name: `War ${war.idx + 1}`,
				rebel: war.rebel,
				attackers: [war.attacker],
				defenders: [war.defender],
				occupiedProvinces: occupiedByWar.get(war.idx) ?? [],
			},
		]
	})
}

function nationFrame({
	state,
	nation,
	timeMs,
}: {
	state: HistoryState
	nation: number
	timeMs: number
}): NationFrame {
	const nameSeed = FIELDS.prov.leader.nameSeed.get({
		state,
		p: nation,
		time: timeMs,
	})
	const dynasty = FIELDS.prov.leader.dynasty.get({
		state,
		p: nation,
		time: timeMs,
	})
	const government = ERAS.governmentTypes[state.governmentType[nation]] ?? ""
	const wealth = Math.max(
		0,
		state.habitability[nation] -
			FIELDS.prov.consumption.get({ state, p: nation, time: timeMs }),
	)
	return {
		id: nation,
		name: `Nation ${nation + 1}`,
		color: colorAt({ colors: state.nationColors, id: nation }),
		capitalProvince: nation,
		government,
		governmentReform: "",
		ruler:
			nameSeed < 0
				? null
				: {
						name: `Ruler ${nameSeed}`,
						dynasty: dynasty < 0 ? null : `Dynasty ${dynasty + 1}`,
					},
		birthTimeMs: state._assignment[nation][0]?.time ?? timeMs,
		deathTimeMs: -1,
		relations: relationsAt({ state, nation, timeMs }),
		wealth,
		optimalWealth: state.habitability[nation],
		isEmperor: false,
		isElector: false,
		organizations: [],
	}
}

function frameAt({ state, timeMs }: FrameAtParams): WorldFrame {
	const provinceNation = new Int32Array(state.P).fill(-1)
	const provinceController = new Int32Array(state.P).fill(-1)
	const provincePopulation = new Float32Array(state.P)
	const provincePopulationUrban = new Float32Array(state.P)
	const provinceDevelopment = new Float32Array(state.P)
	const wars = warsAt({ state, timeMs })
	const controllerByWar = new Map(wars.map((war) => [war.id, war.attackers[0]]))
	let totalPopulation = 0
	for (let province = 0; province < state.P; province++) {
		if (!state.desolate[province]) {
			provinceNation[province] = DERIVE.sovereign({
				state,
				p: province,
				t: timeMs,
			})
		}
		const occupation = FIELDS.prov.occupation.get({
			state,
			p: province,
			time: timeMs,
		})
		provinceController[province] =
			controllerByWar.get(occupation) ?? provinceNation[province]
		const urban = FIELDS.prov.population.urban.get({
			state,
			p: province,
			time: timeMs,
		})
		provincePopulationUrban[province] = urban
		provincePopulation[province] =
			FIELDS.prov.population.rural.get({ state, p: province, time: timeMs }) +
			urban
		provinceDevelopment[province] = FIELDS.prov.development.get({
			state,
			p: province,
			time: timeMs,
		})
		totalPopulation += provincePopulation[province]
	}
	const nations = new Map<number, NationFrame>()
	for (const nation of new Set(provinceNation)) {
		if (nation >= 0) nations.set(nation, nationFrame({ state, nation, timeMs }))
	}
	return {
		timeMs,
		provinceCount: state.P,
		provinceNation,
		provinceController,
		provinceCulture: state.culture.slice(),
		provinceReligion: state.religion.slice(),
		provinceCultureBlendSecondary: cultureBlendAt({ state, timeMs }),
		provinceHre: new Uint8Array(state.P),
		provincePopulation,
		provincePopulationUrban,
		provinceDevelopment,
		nations,
		wars,
		organizations: [],
		cultures: partitionRows({
			colors: state.cultureColors,
			count: state.cultureCount,
			prefix: "Culture",
		}),
		religions: partitionRows({
			colors: state.religionColors,
			count: state.religionCount,
			prefix: "Religion",
		}),
		nationCount: nations.size,
		totalPopulation,
	}
}

export const FRAME = { frameAt }
