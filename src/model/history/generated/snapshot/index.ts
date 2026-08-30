import { DERIVE } from "@/model/history/generated/derive"
import { FIELDS } from "@/model/history/generated/fields"
import type { BuildHistoryFrameParams } from "@/model/history/generated/snapshot/types"
import { STATE } from "@/model/history/generated/state"
import type {
	NationFrame,
	NationRelations,
	PartitionRow,
	WorldFrame,
} from "@/model/history/world-frame/types"

const GOLDEN_RATIO_CONJUGATE = 0.618033988749895

function rulerColor(rulerId: number): readonly [number, number, number] {
	const hue = (rulerId * GOLDEN_RATIO_CONJUGATE) % 1
	const s = 0.58
	const l = 0.52
	const c = (1 - Math.abs(2 * l - 1)) * s
	const x = c * (1 - Math.abs(((hue * 6) % 2) - 1))
	const m = l - c / 2
	switch (Math.floor(hue * 6) % 6) {
		case 0:
			return [c + m, x + m, m]
		case 1:
			return [x + m, c + m, m]
		case 2:
			return [m, c + m, x + m]
		case 3:
			return [m, x + m, c + m]
		case 4:
			return [x + m, m, c + m]
		default:
			return [c + m, m, x + m]
	}
}

function buildWorldFrame({
	state,
	time = state.time,
	profile,
}: BuildHistoryFrameParams): WorldFrame {
	const startedAt = performance.now()
	const P = state.P
	const assignment = new Int32Array(P)
	const controller = new Int32Array(P)
	const populationTotal = new Float32Array(P)
	const populationUrban = new Float32Array(P)
	const development = new Float32Array(P)
	const cultureBlendSecondary = new Int32Array(P).fill(-1)

	const hierarchyStartedAt = performance.now()
	DERIVE.ensureHierarchyClean(state)
	const hierarchyMs = performance.now() - hierarchyStartedAt

	const provinceFieldsStartedAt = performance.now()
	for (let province = 0; province < P; province++) {
		assignment[province] = FIELDS.prov.assignment.get({
			state,
			p: province,
			time,
		})
		controller[province] = assignment[province]
		populationUrban[province] = FIELDS.prov.population.urban.get({
			state,
			p: province,
			time,
		})
		populationTotal[province] =
			FIELDS.prov.population.rural.get({ state, p: province, time }) +
			populationUrban[province]
		development[province] = FIELDS.prov.development.get({
			state,
			p: province,
			time,
		})
		cultureBlendSecondary[province] = FIELDS.prov.cultureBlendSecondary.get({
			state,
			p: province,
			time,
		})
	}
	const provinceFieldsMs = performance.now() - provinceFieldsStartedAt

	const warsStartedAt = performance.now()
	const wars = state.wars
		.filter(
			(war) =>
				war.startTime <= time &&
				(war.endTime ?? Number.POSITIVE_INFINITY) > time,
		)
		.map((war) => ({
			id: war.idx,
			name: `War ${war.idx + 1}`,
			rebel: war.rebel,
			attackers: [war.attacker],
			defenders: [war.defender],
			occupiedProvinces: Array.from(
				{ length: P },
				(_, province) => province,
			).filter(
				(province) =>
					FIELDS.prov.occupation.get({ state, p: province, time }) === war.idx,
			),
		}))
	const warsMs = performance.now() - warsStartedAt

	const summaryStartedAt = performance.now()
	const nations = new Map<number, NationFrame>()
	let totalPopulation = 0
	for (let province = 0; province < P; province++) {
		totalPopulation += populationTotal[province]
	}
	const summaryMs = performance.now() - summaryStartedAt

	const relationsStartedAt = performance.now()
	for (let nationId = 0; nationId < P; nationId++) {
		if (state.desolate[nationId] || state.parentCurrent[nationId] >= 0) continue
		const relations: NationRelations = {
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
		for (let other = 0; other < P; other++) {
			const relation = FIELDS.rel.get({ state, a: nationId, b: other, time })
			if (relation === STATE.rel.OVERLORD) {
				relations.vassals.push(other)
				relations.vassalSubjectTypes.push({
					nationId: other,
					subjectType: "vassal",
				})
			} else if (relation === STATE.rel.VASSAL) relations.overlord = other
			else if (relation === STATE.rel.PU_SENIOR)
				relations.unionSeniorOf.push(other)
			else if (relation === STATE.rel.PU_JUNIOR)
				relations.unionJuniorPartner = other
			else if (relation === STATE.rel.ALLY) relations.allies.push(other)
			else if (relation === STATE.rel.RIVAL) relations.rivals.push(other)
		}
		const color = rulerColor(nationId).map((component) =>
			Math.round(component * 255),
		) as [number, number, number]
		nations.set(nationId, {
			id: nationId,
			name: `Nation ${nationId + 1}`,
			color,
			capitalProvince: nationId,
			government: String(state.governmentType[nationId]),
			governmentReform: "",
			ruler: null,
			birthTimeMs: -1,
			deathTimeMs: -1,
			relations,
			wealth: Math.max(
				0,
				state.habitability[nationId] - state.consumptionCurrent[nationId],
			),
			optimalWealth: state.habitability[nationId],
			isEmperor: false,
			isElector: false,
			organizations: [],
		})
	}
	const relationsMs = performance.now() - relationsStartedAt

	const totalMs = performance.now() - startedAt
	if (profile) {
		profile.hierarchyMs = hierarchyMs
		profile.provinceFieldsMs = provinceFieldsMs
		profile.warsMs = warsMs
		profile.summaryMs = summaryMs
		profile.relationsMs = relationsMs
		profile.totalMs = totalMs
	}

	const cultures: PartitionRow[] = Array.from(
		{ length: state.cultureCount },
		(_, id) => ({
			id,
			key: `culture-${id}`,
			name: `Culture ${id + 1}`,
			color: [
				Math.round(state.cultureColors[id * 3] * 255),
				Math.round(state.cultureColors[id * 3 + 1] * 255),
				Math.round(state.cultureColors[id * 3 + 2] * 255),
			],
		}),
	)
	const religions: PartitionRow[] = Array.from(
		{ length: state.religionCount },
		(_, id) => ({
			id,
			key: `religion-${id}`,
			name: `Religion ${id + 1}`,
			color: [
				Math.round(state.religionColors[id * 3] * 255),
				Math.round(state.religionColors[id * 3 + 1] * 255),
				Math.round(state.religionColors[id * 3 + 2] * 255),
			],
		}),
	)
	return {
		timeMs: time,
		provinceCount: P,
		provinceNation: assignment,
		provinceController: controller,
		provinceCulture: state.culture.slice(),
		provinceReligion: state.religion.slice(),
		provinceCultureBlendSecondary: cultureBlendSecondary,
		provinceHre: new Uint8Array(P),
		provincePopulation: populationTotal,
		provincePopulationUrban: populationUrban,
		provinceDevelopment: development,
		nations,
		wars,
		organizations: [],
		cultures,
		religions,
		nationCount: nations.size,
		totalPopulation,
	}
}

export const SNAPSHOT = {
	buildWorldFrame,
}
