import { DERIVE } from "@/model/history/generated/derive"
import { FIELDS } from "@/model/history/generated/fields"
import type { BuildHistoryFrameParams } from "@/model/history/generated/snapshot/types"
import { STATE } from "@/model/history/generated/state"
import type { SerializedHistoryFrame } from "@/model/worker-protocol/types"

const GOLDEN_RATIO_CONJUGATE = 0.618033988749895

/** Deterministic fill colour for the polity ruled from province `rulerId`
 * ("your ruling province is your nation"). A pure function of the id: stable
 * across playback and scrubbing, distinct for adjacent ids via golden-ratio
 * hue spacing, and — unlike copying from a lazily-populated palette map —
 * provably finite in [0, 1] for every `rulerId >= 0`. */
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

function buildHistoryFrame({
	state,
	time = state.time,
	profile,
}: BuildHistoryFrameParams): SerializedHistoryFrame {
	const startedAt = performance.now()
	const live = time === state.time
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
	const relationEntries: Array<{ a: number; b: number; value: number }> = []
	for (const key of state._relations.keys()) {
		const value = FIELDS.rel.get({
			state,
			a: Math.floor(key / P),
			b: key % P,
			time,
		})
		if (value !== STATE.rel.NEUTRAL) {
			relationEntries.push({ a: Math.floor(key / P), b: key % P, value })
		}
	}
	const relationA = new Int32Array(relationEntries.length)
	const relationB = new Int32Array(relationEntries.length)
	const relationValues = new Uint8Array(relationEntries.length)

	const hierarchyStartedAt = performance.now()
	DERIVE.ensureHierarchyClean(state)
	for (let province = 0; province < P; province++) {
		parent[province] = FIELDS.prov.parent.get({ state, p: province, time })
	}
	const hierarchyMs = performance.now() - hierarchyStartedAt

	const provinceFieldsStartedAt = performance.now()
	for (let province = 0; province < P; province++) {
		assignment[province] = FIELDS.prov.assignment.get({
			state,
			p: province,
			time,
		})
		sovereign[province] = live
			? state.sovereignCurrent[province]
			: state.stateless[province]
				? -1
				: DERIVE.sovereign({ state, p: province, t: time })
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
		consumption[province] = FIELDS.prov.consumption.get({
			state,
			p: province,
			time,
		})
		cultureBlendSecondary[province] = FIELDS.prov.cultureBlendSecondary.get({
			state,
			p: province,
			time,
		})
		cultureBlendWeight[province] = FIELDS.prov.cultureBlendWeight.get({
			state,
			p: province,
			time,
		})
		if (assignment[province] < 0) continue
		const [cr, cg, cb] = rulerColor(assignment[province])
		const base = province * 3
		colors[base] = cr
		colors[base + 1] = cg
		colors[base + 2] = cb
	}
	const provinceFieldsMs = performance.now() - provinceFieldsStartedAt

	const warsStartedAt = performance.now()
	const activeWars = state.wars
		.filter(
			(war) =>
				war.startTime <= time &&
				(war.endTime ?? Number.POSITIVE_INFINITY) > time,
		)
		.map((war) => ({
			idx: war.idx,
			attacker: war.attacker,
			defender: war.defender,
			rebel: war.rebel,
			occupied: Array.from({ length: P }, (_, province) => province).filter(
				(province) =>
					FIELDS.prov.occupation.get({ state, p: province, time }) === war.idx,
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
				time,
			})
			leaderNameSeed[province] = FIELDS.prov.leader.nameSeed.get({
				state,
				p: province,
				time,
			})
			leaderClaim[province] = FIELDS.prov.leader.claim.get({
				state,
				p: province,
				time,
			})
			leaderBirthYear[province] = FIELDS.prov.leader.birthYear.get({
				state,
				p: province,
				time,
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
		relationA[i] = relationEntries[i].a
		relationB[i] = relationEntries[i].b
		relationValues[i] = relationEntries[i].value
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
		timeMs: time,
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
