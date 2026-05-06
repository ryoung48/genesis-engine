import type {
	SerializedHistoryFrame,
	SerializedProvinceTimelineFloat,
	SerializedProvinceTimelineInt,
	SerializedTimelines,
} from "../transport/worker-types"
import { YEAR_MS } from "."
import { PROV } from "./fields"
import { ensureHierarchyClean, type HistoryState, REL } from "./state"
import type { Timeline } from "./timeline"

export interface HistoryTimelineSerializationProfile {
	intFieldsMs: number
	floatFieldsMs: number
	relationsMs: number
	colorsMs: number
	totalMs: number
}

export interface HistoryFrameBuildProfile {
	hierarchyMs: number
	provinceFieldsMs: number
	warsMs: number
	summaryMs: number
	relationsMs: number
	totalMs: number
}

function flattenIntTimelineField(
	field: Timeline<number>[],
): SerializedProvinceTimelineInt {
	const offsets = new Int32Array(field.length + 1)
	let total = 0
	for (let i = 0; i < field.length; i++) {
		total += field[i].length
		offsets[i + 1] = total
	}
	const times = new Float64Array(total)
	const values = new Int32Array(total)
	let cursor = 0
	for (const timeline of field) {
		for (const entry of timeline) {
			times[cursor] = entry.time
			values[cursor] = Math.round(entry.value)
			cursor++
		}
	}
	return { times, values, offsets }
}

function flattenFloatTimelineField(
	field: Timeline<number>[],
): SerializedProvinceTimelineFloat {
	const offsets = new Int32Array(field.length + 1)
	let total = 0
	for (let i = 0; i < field.length; i++) {
		total += field[i].length
		offsets[i + 1] = total
	}
	const times = new Float64Array(total)
	const values = new Float32Array(total)
	let cursor = 0
	for (const timeline of field) {
		for (const entry of timeline) {
			times[cursor] = entry.time
			values[cursor] = entry.value
			cursor++
		}
	}
	return { times, values, offsets }
}

export function serializeHistoryTimelines(
	state: HistoryState,
	endTimeMs = state.time,
	profile?: HistoryTimelineSerializationProfile,
): SerializedTimelines {
	const startedAt = performance.now()

	const intFieldsStartedAt = performance.now()
	const parent = flattenIntTimelineField(state._parent)
	const assignment = flattenIntTimelineField(state._assignment)
	const leaderDynasty = flattenIntTimelineField(state._leader_dyn)
	const leaderNameSeed = flattenIntTimelineField(state._leader_name_seed)
	const leaderClaim = flattenIntTimelineField(state._leader_claim)
	const occupation = flattenIntTimelineField(state._occupation)
	const intFieldsMs = performance.now() - intFieldsStartedAt

	const floatFieldsStartedAt = performance.now()
	const populationRural = flattenFloatTimelineField(state._pop_rural)
	const populationUrban = flattenFloatTimelineField(state._pop_urban)
	const development = flattenFloatTimelineField(state._development)
	const consumption = flattenFloatTimelineField(state._consumption)
	const leaderBirthYear = flattenFloatTimelineField(state._leader_birth_year)
	const floatFieldsMs = performance.now() - floatFieldsStartedAt

	const relationsStartedAt = performance.now()
	const relationEntries = Array.from(state._relations.entries()).sort(
		([a], [b]) => a - b,
	)
	const relationOffsets = new Int32Array(relationEntries.length + 1)
	let relationCount = 0
	for (let i = 0; i < relationEntries.length; i++) {
		relationCount += relationEntries[i][1].length
		relationOffsets[i + 1] = relationCount
	}
	const relationTimes = new Float64Array(relationCount)
	const relationValues = new Int32Array(relationCount)
	const relationA = new Int32Array(relationEntries.length)
	const relationB = new Int32Array(relationEntries.length)
	let relationCursor = 0
	for (let i = 0; i < relationEntries.length; i++) {
		const [key, timeline] = relationEntries[i]
		relationA[i] = Math.floor(key / state.P)
		relationB[i] = key % state.P
		for (const entry of timeline) {
			relationTimes[relationCursor] = entry.time
			relationValues[relationCursor] = entry.value
			relationCursor++
		}
	}
	const relationsMs = performance.now() - relationsStartedAt

	const colorsStartedAt = performance.now()
	const nationColorKeys = new Int32Array(state.nationColors.size)
	const nationColorValues = new Float32Array(state.nationColors.size * 3)
	let colorIndex = 0
	for (const [key, value] of state.nationColors.entries()) {
		nationColorKeys[colorIndex] = key
		nationColorValues[colorIndex * 3] = value[0]
		nationColorValues[colorIndex * 3 + 1] = value[1]
		nationColorValues[colorIndex * 3 + 2] = value[2]
		colorIndex++
	}
	const colorsMs = performance.now() - colorsStartedAt

	const totalMs = performance.now() - startedAt
	if (profile) {
		profile.intFieldsMs = intFieldsMs
		profile.floatFieldsMs = floatFieldsMs
		profile.relationsMs = relationsMs
		profile.colorsMs = colorsMs
		profile.totalMs = totalMs
	}

	return {
		P: state.P,
		startTimeMs: 800 * YEAR_MS,
		endTimeMs,
		parent,
		assignment,
		populationRural,
		populationUrban,
		development,
		consumption,
		leaderDynasty,
		leaderNameSeed,
		leaderClaim,
		leaderBirthYear,
		occupation,
		relations: {
			aIdx: relationA,
			bIdx: relationB,
			offsets: relationOffsets,
			times: relationTimes,
			values: relationValues,
		},
		nationColorKeys,
		nationColorValues,
		wars: state.wars.map((war) => ({ ...war })),
	}
}

export function buildHistoryFrame(
	state: HistoryState,
	profile?: HistoryFrameBuildProfile,
): SerializedHistoryFrame {
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
	const relationEntries = Array.from(state._relations.entries()).filter(
		([, timeline]) =>
			timeline.length > 0 &&
			timeline[timeline.length - 1].value !== REL.NEUTRAL,
	)
	const relationA = new Int32Array(relationEntries.length)
	const relationB = new Int32Array(relationEntries.length)
	const relationValues = new Uint8Array(relationEntries.length)

	const hierarchyStartedAt = performance.now()
	ensureHierarchyClean(state)
	for (let province = 0; province < P; province++) {
		parent[province] = PROV.parent.get(state, province)
	}
	const hierarchyMs = performance.now() - hierarchyStartedAt

	const provinceFieldsStartedAt = performance.now()
	for (let province = 0; province < P; province++) {
		assignment[province] = PROV.assignment.get(state, province)
		sovereign[province] = state.sovereignCurrent[province]
		populationUrban[province] = PROV.population.urban.get(state, province)
		populationTotal[province] =
			PROV.population.rural.get(state, province) + populationUrban[province]
		development[province] = PROV.development.get(state, province)
		consumption[province] = PROV.consumption.get(state, province)
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
				(province) => PROV.occupation.get(state, province) === war.idx,
			),
		}))
	const warsMs = performance.now() - warsStartedAt

	const summaryStartedAt = performance.now()
	let sovereignCount = 0
	let totalPopulation = 0
	for (let province = 0; province < P; province++) {
		if (parent[province] < 0 && assignment[province] >= 0) {
			sovereignCount++
			leaderDynasty[province] = PROV.leader.dynasty.get(state, province)
			leaderNameSeed[province] = PROV.leader.nameSeed.get(state, province)
			leaderClaim[province] = PROV.leader.claim.get(state, province)
			leaderBirthYear[province] = PROV.leader.birthYear.get(state, province)
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
	}
}
