import { DERIVE } from "@/model/history/generated/derive"
import { FIELDS } from "@/model/history/generated/fields"
import type { BuildHistoryFrameParams } from "@/model/history/generated/snapshot/types"
import { STATE } from "@/model/history/generated/state"
import type { SerializedHistoryFrame } from "@/model/worker-protocol/types"

function buildHistoryFrame({
	state,
	profile,
}: BuildHistoryFrameParams): SerializedHistoryFrame {
	const startedAt = performance.now()
	const P = state.P
	const assignment = new Int32Array(P)
	const parent = new Int32Array(P)
	const sovereign = new Int32Array(P)
	const leaderDynasty = new Int32Array(P).fill(-1)
	const leaderNameSeed = new Int32Array(P).fill(-1)
	const leaderClaim = new Int32Array(P)
	const leaderBirthYear = new Float32Array(P).fill(-1)
	const colors = new Float32Array(P * 3)
	const populationTotal = new Float32Array(P)
	const populationUrban = new Float32Array(P)
	const development = new Float32Array(P)
	const consumption = new Float32Array(P)
	const nationWealth = new Float32Array(P)
	const nationOptimalWealth = new Float32Array(P)
	const cultureBlendSecondary = new Int32Array(P).fill(-1)
	const cultureBlendWeight = new Float32Array(P)
	const relationEntries = Array.from(state._relations.entries()).filter(
		([, timeline]) =>
			timeline.length > 0 &&
			timeline[timeline.length - 1].value !== STATE.rel.NEUTRAL,
	)
	const relationA = new Int32Array(relationEntries.length)
	const relationB = new Int32Array(relationEntries.length)
	const relationValues = new Uint8Array(relationEntries.length)

	const hierarchyStartedAt = performance.now()
	DERIVE.ensureHierarchyClean(state)
	for (let province = 0; province < P; province++) {
		parent[province] = FIELDS.prov.parent.get({ state, p: province })
	}
	const hierarchyMs = performance.now() - hierarchyStartedAt

	const provinceFieldsStartedAt = performance.now()
	for (let province = 0; province < P; province++) {
		assignment[province] = FIELDS.prov.assignment.get({ state, p: province })
		sovereign[province] = state.sovereignCurrent[province]
		populationUrban[province] = FIELDS.prov.population.urban.get({
			state,
			p: province,
		})
		populationTotal[province] =
			FIELDS.prov.population.rural.get({ state, p: province }) +
			populationUrban[province]
		development[province] = FIELDS.prov.development.get({ state, p: province })
		consumption[province] = FIELDS.prov.consumption.get({ state, p: province })
		cultureBlendSecondary[province] = FIELDS.prov.cultureBlendSecondary.get({
			state,
			p: province,
		})
		cultureBlendWeight[province] = FIELDS.prov.cultureBlendWeight.get({
			state,
			p: province,
		})
		const color = state.nationColors.get(assignment[province])
		if (!color) continue
		const base = province * 3
		colors[base] = color[0]
		colors[base + 1] = color[1]
		colors[base + 2] = color[2]
	}
	const provinceFieldsMs = performance.now() - provinceFieldsStartedAt

	const warsStartedAt = performance.now()
	const activeWars = state.wars
		.filter(
			(war) =>
				war.startTime <= state.time &&
				(war.endTime ?? Number.POSITIVE_INFINITY) > state.time,
		)
		.map((war) => ({
			idx: war.idx,
			attacker: war.attacker,
			defender: war.defender,
			rebel: war.rebel,
			occupied: Array.from({ length: P }, (_, province) => province).filter(
				(province) =>
					FIELDS.prov.occupation.get({ state, p: province }) === war.idx,
			),
		}))
	const warsMs = performance.now() - warsStartedAt

	const summaryStartedAt = performance.now()
	let sovereignCount = 0
	let totalPopulation = 0
	for (let province = 0; province < P; province++) {
		if (parent[province] < 0 && assignment[province] >= 0) {
			sovereignCount++
			leaderDynasty[province] = FIELDS.prov.leader.dynasty.get({
				state,
				p: province,
			})
			leaderNameSeed[province] = FIELDS.prov.leader.nameSeed.get({
				state,
				p: province,
			})
			leaderClaim[province] = FIELDS.prov.leader.claim.get({
				state,
				p: province,
			})
			leaderBirthYear[province] = FIELDS.prov.leader.birthYear.get({
				state,
				p: province,
			})
			nationWealth[province] = Math.max(
				0,
				state.habitability[province] - consumption[province],
			)
			nationOptimalWealth[province] = state.habitability[province]
		}
		totalPopulation += populationTotal[province]
	}
	const summaryMs = performance.now() - summaryStartedAt

	const relationsStartedAt = performance.now()
	for (let i = 0; i < relationEntries.length; i++) {
		const [key, timeline] = relationEntries[i]
		relationA[i] = Math.floor(key / P)
		relationB[i] = key % P
		relationValues[i] = timeline[timeline.length - 1].value
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

	return {
		timeMs: state.time,
		assignment,
		parent,
		sovereign,
		leaderDynasty,
		leaderNameSeed,
		leaderClaim,
		leaderBirthYear,
		colors,
		populationTotal,
		populationUrban,
		development,
		consumption,
		nationWealth,
		nationOptimalWealth,
		relationA,
		relationB,
		relationValues,
		activeWars,
		sovereignCount,
		totalPopulation,
		cultureBlendSecondary,
		cultureBlendWeight,
	}
}

export const SNAPSHOT = {
	buildHistoryFrame,
}
