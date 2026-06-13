import type { HistoryNote } from "@/model/history"
import { REL } from "@/model/history/state"
import { maxFanoutForNationSize } from "@/model/society/hierarchy"
import type {
	SerializedGenesisWorld,
	SerializedProvinceTimelineFloat,
	SerializedProvinceTimelineInt,
	SerializedTimelines,
} from "@/model/transport/worker-types"

export interface TimelineBundle {
	timelines: SerializedTimelines
	events: HistoryNote[]
}

export interface HistoryView {
	timeMs: number
	assignment: Int32Array
	parent: Int32Array
	childOffset?: Int32Array
	childList?: Int32Array
	sovereign: Int32Array
	leaderDynasty: Int32Array
	leaderNameSeed: Int32Array
	leaderClaim: Int32Array
	leaderBirthYear: Float32Array
	colors: Float32Array
	populationTotal: Float32Array
	populationRural: Float32Array
	populationUrban: Float32Array
	development: Float32Array
	consumption: Float32Array
	activeWars: Array<{
		idx: number
		attacker: number
		defender: number
		rebel: boolean
		occupied: number[]
	}>
	sovereignCount: number
	totalPopulation: number
	nationWealth: Float32Array
	nationOptimalWealth: Float32Array
	/** Per-province secondary (bleeding) culture index. -1 = no blend. */
	cultureBlendSecondary: Int32Array
	/** Per-province blend weight [0, 1]. */
	cultureBlendWeight: Float32Array
	relationAt: (a: number, b: number) => number
	/**
	 * Visits every unordered nation pair that holds a relation, once. Unlike the
	 * adjacency graph this includes non-bordering pairs (e.g. overseas colonies),
	 * so callers can find relations that don't follow territory.
	 */
	forEachRelationPair: (cb: (a: number, b: number) => void) => void
	getNationWealth: (nationId: number) => number
	getNationOptimalWealth: (nationId: number) => number
}

export interface HistoryQuery {
	getView: (timeMs: number) => HistoryView
	getEventsInRange: (startTimeMs: number, endTimeMs: number) => HistoryNote[]
	getEventsUntil: (timeMs: number) => HistoryNote[]
}

interface HistoryQueryGetViewProfile {
	readsMs: number
	hierarchyMs: number
	warsMs: number
	summaryMs: number
	cloneMs: number
}

const historyQueryProfiles = new WeakMap<
	HistoryQuery,
	HistoryQueryGetViewProfile
>()

export function readHistoryQueryBenchmark(
	query: HistoryQuery,
): HistoryQueryGetViewProfile | null {
	return historyQueryProfiles.get(query) ?? null
}

interface IntTimelineChanges {
	times: Float64Array
	provinces: Int32Array
	values: Int32Array
}

interface FloatTimelineChanges {
	times: Float64Array
	provinces: Int32Array
	values: Float32Array
}

interface ReplayCursors {
	parent: number
	assignment: number
	populationRural: number
	populationUrban: number
	development: number
	consumption: number
	leaderDynasty: number
	leaderNameSeed: number
	leaderClaim: number
	leaderBirthYear: number
	occupation: number
}

interface ReplayState {
	timeMs: number
	totalPopulation: number
	cursors: ReplayCursors
	hotFields: PackedHistoryFields
	parent: Int32Array
	assignment: Int32Array
	populationRural: Float32Array
	populationUrban: Float32Array
	populationTotal: Float32Array
	development: Float32Array
	consumption: Float32Array
	leaderDynasty: Int32Array
	leaderNameSeed: Int32Array
	leaderClaim: Int32Array
	leaderBirthYear: Float32Array
	occupation: Int32Array
}

interface HistoryKeyframe {
	timeMs: number
	totalPopulation: number
	cursors: ReplayCursors
	hotFields: PackedHistoryFields
	parent: Int32Array
	assignment: Int32Array
	populationRural: Float32Array
	populationUrban: Float32Array
	populationTotal: Float32Array
	development: Float32Array
	consumption: Float32Array
	leaderDynasty: Int32Array
	leaderNameSeed: Int32Array
	leaderClaim: Int32Array
	leaderBirthYear: Float32Array
	occupation: Int32Array
}

interface PackedHistoryFields {
	buffer: ArrayBuffer
	bytes: Uint8Array
	parent: Int32Array
	assignment: Int32Array
	populationRural: Float32Array
	populationUrban: Float32Array
	populationTotal: Float32Array
	development: Float32Array
	consumption: Float32Array
	leaderDynasty: Int32Array
	leaderNameSeed: Int32Array
	leaderClaim: Int32Array
	leaderBirthYear: Float32Array
	occupation: Int32Array
}

const EMPTY_INT_CHANGES: IntTimelineChanges = {
	times: new Float64Array(0),
	provinces: new Int32Array(0),
	values: new Int32Array(0),
}

const EMPTY_FLOAT_CHANGES: FloatTimelineChanges = {
	times: new Float64Array(0),
	provinces: new Int32Array(0),
	values: new Float32Array(0),
}

const MAX_KEYFRAMES = 16
const PACKED_INT_FIELD_COUNT = 6
const PACKED_FLOAT_FIELD_COUNT = 6

function viewPackedHistoryFields(
	buffer: ArrayBuffer,
	provinceCount: number,
): PackedHistoryFields {
	let byteOffset = 0
	const nextInt32 = () => {
		const view = new Int32Array(buffer, byteOffset, provinceCount)
		byteOffset += provinceCount * Int32Array.BYTES_PER_ELEMENT
		return view
	}
	const nextFloat32 = () => {
		const view = new Float32Array(buffer, byteOffset, provinceCount)
		byteOffset += provinceCount * Float32Array.BYTES_PER_ELEMENT
		return view
	}

	const parent = nextInt32()
	const assignment = nextInt32()
	const leaderDynasty = nextInt32()
	const leaderNameSeed = nextInt32()
	const leaderClaim = nextInt32()
	const occupation = nextInt32()
	const populationRural = nextFloat32()
	const populationUrban = nextFloat32()
	const populationTotal = nextFloat32()
	const development = nextFloat32()
	const consumption = nextFloat32()
	const leaderBirthYear = nextFloat32()

	return {
		buffer,
		bytes: new Uint8Array(buffer),
		parent,
		assignment,
		populationRural,
		populationUrban,
		populationTotal,
		development,
		consumption,
		leaderDynasty,
		leaderNameSeed,
		leaderClaim,
		leaderBirthYear,
		occupation,
	}
}

function createPackedHistoryFields(provinceCount: number): PackedHistoryFields {
	const hotFieldCount = PACKED_INT_FIELD_COUNT + PACKED_FLOAT_FIELD_COUNT
	const buffer = new ArrayBuffer(
		provinceCount * hotFieldCount * Float32Array.BYTES_PER_ELEMENT,
	)
	const fields = viewPackedHistoryFields(buffer, provinceCount)
	fields.parent.fill(-1)
	fields.assignment.fill(-1)
	fields.leaderDynasty.fill(-1)
	fields.leaderNameSeed.fill(-1)
	fields.leaderBirthYear.fill(-1)
	fields.occupation.fill(-1)
	return fields
}

function clonePackedHistoryFields(
	source: PackedHistoryFields,
): PackedHistoryFields {
	return viewPackedHistoryFields(source.buffer.slice(0), source.parent.length)
}

function readTimelineValue(
	times: Float64Array,
	values: ArrayLike<number>,
	start: number,
	end: number,
	defaultValue: number,
	time: number,
): number {
	let lo = start
	let hi = end - 1
	let answer = defaultValue
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		if (times[mid] <= time) {
			answer = values[mid]
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return answer
}

function upperBound(times: Float64Array, target: number): number {
	let lo = 0
	let hi = times.length
	while (lo < hi) {
		const mid = (lo + hi) >>> 1
		if (times[mid] <= target) lo = mid + 1
		else hi = mid
	}
	return lo
}

function relationKey(a: number, b: number): string {
	return `${a}:${b}`
}

function flattenIntTimeline(
	field: SerializedProvinceTimelineInt | undefined,
	provinceCount: number,
): IntTimelineChanges {
	if (!field) return EMPTY_INT_CHANGES
	const totalEntries = field.offsets[provinceCount]
	if (totalEntries === 0) return EMPTY_INT_CHANGES

	const rawTimes = new Float64Array(totalEntries)
	const rawProvinces = new Int32Array(totalEntries)
	const rawValues = new Int32Array(totalEntries)

	let cursor = 0
	for (let province = 0; province < provinceCount; province++) {
		for (
			let index = field.offsets[province];
			index < field.offsets[province + 1];
			index++
		) {
			rawTimes[cursor] = field.times[index]
			rawProvinces[cursor] = province
			rawValues[cursor] = field.values[index]
			cursor++
		}
	}

	const order = Array.from({ length: totalEntries }, (_, index) => index)
	order.sort(
		(a, b) =>
			rawTimes[a] - rawTimes[b] || rawProvinces[a] - rawProvinces[b] || a - b,
	)

	const times = new Float64Array(totalEntries)
	const provinces = new Int32Array(totalEntries)
	const values = new Int32Array(totalEntries)
	for (let index = 0; index < totalEntries; index++) {
		const source = order[index]
		times[index] = rawTimes[source]
		provinces[index] = rawProvinces[source]
		values[index] = rawValues[source]
	}

	return { times, provinces, values }
}

function flattenFloatTimeline(
	field: SerializedProvinceTimelineFloat | undefined,
	provinceCount: number,
): FloatTimelineChanges {
	if (!field) return EMPTY_FLOAT_CHANGES
	const totalEntries = field.offsets[provinceCount]
	if (totalEntries === 0) return EMPTY_FLOAT_CHANGES

	const rawTimes = new Float64Array(totalEntries)
	const rawProvinces = new Int32Array(totalEntries)
	const rawValues = new Float32Array(totalEntries)

	let cursor = 0
	for (let province = 0; province < provinceCount; province++) {
		for (
			let index = field.offsets[province];
			index < field.offsets[province + 1];
			index++
		) {
			rawTimes[cursor] = field.times[index]
			rawProvinces[cursor] = province
			rawValues[cursor] = field.values[index]
			cursor++
		}
	}

	const order = Array.from({ length: totalEntries }, (_, index) => index)
	order.sort(
		(a, b) =>
			rawTimes[a] - rawTimes[b] || rawProvinces[a] - rawProvinces[b] || a - b,
	)

	const times = new Float64Array(totalEntries)
	const provinces = new Int32Array(totalEntries)
	const values = new Float32Array(totalEntries)
	for (let index = 0; index < totalEntries; index++) {
		const source = order[index]
		times[index] = rawTimes[source]
		provinces[index] = rawProvinces[source]
		values[index] = rawValues[source]
	}

	return { times, provinces, values }
}

function mergeSortedUniqueTimes(timeArrays: readonly Float64Array[]): number[] {
	const indices = new Int32Array(timeArrays.length)
	const merged: number[] = []
	let last = Number.NaN

	while (true) {
		let next = Number.POSITIVE_INFINITY
		for (let i = 0; i < timeArrays.length; i++) {
			const times = timeArrays[i]
			const index = indices[i]
			if (index < times.length && times[index] < next) next = times[index]
		}
		if (!Number.isFinite(next)) break
		if (merged.length === 0 || next !== last) {
			merged.push(next)
			last = next
		}
		for (let i = 0; i < timeArrays.length; i++) {
			const times = timeArrays[i]
			while (indices[i] < times.length && times[indices[i]] === next) {
				indices[i]++
			}
		}
	}

	return merged
}

function buildKeyframeTimes(params: {
	startTimeMs: number
	endTimeMs: number
	timeArrays: readonly Float64Array[]
}): number[] {
	const mergedTimes = mergeSortedUniqueTimes(params.timeArrays)
	if (mergedTimes.length === 0) return [params.startTimeMs]

	const keyframeTimes = [params.startTimeMs]
	const maxAnchors = Math.min(MAX_KEYFRAMES, mergedTimes.length + 1)
	const step = Math.max(
		1,
		Math.ceil(mergedTimes.length / Math.max(1, maxAnchors - 1)),
	)

	for (let index = step - 1; index < mergedTimes.length; index += step) {
		const time = mergedTimes[Math.min(index, mergedTimes.length - 1)]
		if (time > keyframeTimes[keyframeTimes.length - 1]) keyframeTimes.push(time)
	}

	if (params.endTimeMs > keyframeTimes[keyframeTimes.length - 1]) {
		keyframeTimes.push(params.endTimeMs)
	}

	return keyframeTimes
}

function cloneCursors(cursors: ReplayCursors): ReplayCursors {
	return { ...cursors }
}

function createReplayState(provinceCount: number): ReplayState {
	const hotFields = createPackedHistoryFields(provinceCount)
	return {
		timeMs: Number.NEGATIVE_INFINITY,
		totalPopulation: 0,
		cursors: {
			parent: 0,
			assignment: 0,
			populationRural: 0,
			populationUrban: 0,
			development: 0,
			consumption: 0,
			leaderDynasty: 0,
			leaderNameSeed: 0,
			leaderClaim: 0,
			leaderBirthYear: 0,
			occupation: 0,
		},
		hotFields,
		parent: hotFields.parent,
		assignment: hotFields.assignment,
		populationRural: hotFields.populationRural,
		populationUrban: hotFields.populationUrban,
		populationTotal: hotFields.populationTotal,
		development: hotFields.development,
		consumption: hotFields.consumption,
		leaderDynasty: hotFields.leaderDynasty,
		leaderNameSeed: hotFields.leaderNameSeed,
		leaderClaim: hotFields.leaderClaim,
		leaderBirthYear: hotFields.leaderBirthYear,
		occupation: hotFields.occupation,
	}
}

function copyKeyframeIntoState(
	keyframe: HistoryKeyframe,
	state: ReplayState,
): void {
	state.timeMs = keyframe.timeMs
	state.totalPopulation = keyframe.totalPopulation
	state.cursors = cloneCursors(keyframe.cursors)
	state.hotFields.bytes.set(keyframe.hotFields.bytes)
}

function buildChildIndex(parent: Int32Array): {
	childOffset: Int32Array
	childList: Int32Array
} {
	const childOffset = new Int32Array(parent.length + 1)
	for (let province = 0; province < parent.length; province++) {
		const ancestor = parent[province]
		if (ancestor >= 0) childOffset[ancestor + 1]++
	}
	for (let province = 0; province < parent.length; province++) {
		childOffset[province + 1] += childOffset[province]
	}
	const childList = new Int32Array(childOffset[parent.length])
	const cursor = childOffset.slice()
	for (let province = 0; province < parent.length; province++) {
		const ancestor = parent[province]
		if (ancestor < 0) continue
		childList[cursor[ancestor]++] = province
	}
	return { childOffset, childList }
}

function buildLazyWealthAccess(params: {
	parent: Int32Array
	consumption: Float32Array
	habitability: Float32Array | undefined
	ensureChildIndex: () => {
		childOffset: Int32Array
		childList: Int32Array
	}
}): Pick<
	HistoryView,
	| "nationWealth"
	| "nationOptimalWealth"
	| "getNationWealth"
	| "getNationOptimalWealth"
> {
	const { parent, consumption, habitability, ensureChildIndex } = params
	const nationWealth = new Float32Array(parent.length)
	const nationOptimalWealth = new Float32Array(parent.length)

	if (!habitability) {
		return {
			nationWealth,
			nationOptimalWealth,
			getNationWealth: () => 0,
			getNationOptimalWealth: () => 0,
		}
	}

	let computed = false
	const computeWealth = () => {
		if (computed) return
		computed = true
		const { childOffset, childList } = ensureChildIndex()
		const pendingChildren = new Int32Array(parent.length)
		const memberCounts = new Int32Array(parent.length)
		const stack: number[] = []

		for (let nationId = 0; nationId < parent.length; nationId++) {
			pendingChildren[nationId] =
				childOffset[nationId + 1] - childOffset[nationId]
			memberCounts[nationId] = 1
			if (pendingChildren[nationId] === 0) stack.push(nationId)
		}

		while (stack.length > 0) {
			const nationId = stack.pop()!
			const childCount = childOffset[nationId + 1] - childOffset[nationId]
			let optimal = habitability[nationId] ?? 0
			let current = optimal - (consumption[nationId] ?? 0)
			for (
				let childIndex = childOffset[nationId];
				childIndex < childOffset[nationId + 1];
				childIndex++
			) {
				const child = childList[childIndex]
				memberCounts[nationId] += memberCounts[child]
				optimal += nationOptimalWealth[child] * 0.25
				current += nationWealth[child] * 0.25
			}
			if (childCount > maxFanoutForNationSize(memberCounts[nationId])) {
				optimal *= 0.9
				current *= 0.9
			}
			if (parent[nationId] >= 0) current *= 0.75
			nationOptimalWealth[nationId] = optimal
			nationWealth[nationId] = current
			const ancestor = parent[nationId]
			if (ancestor >= 0 && --pendingChildren[ancestor] === 0) {
				stack.push(ancestor)
			}
		}
	}

	return {
		nationWealth,
		nationOptimalWealth,
		getNationWealth: (nationId: number) => {
			if (nationId < 0 || nationId >= parent.length) return 0
			computeWealth()
			return nationWealth[nationId]
		},
		getNationOptimalWealth: (nationId: number) => {
			if (nationId < 0 || nationId >= parent.length) return 0
			computeWealth()
			return nationOptimalWealth[nationId]
		},
	}
}

export function createHistoryQuery(
	bundle: TimelineBundle,
	world: SerializedGenesisWorld,
): HistoryQuery {
	const { timelines, events } = bundle
	const provinceCount = timelines.P
	const relationIndex = new Map<string, number>()
	for (let i = 0; i < timelines.relations.aIdx.length; i++) {
		relationIndex.set(
			relationKey(timelines.relations.aIdx[i], timelines.relations.bIdx[i]),
			i,
		)
	}

	const colorIndex = new Map<number, [number, number, number]>()
	for (let i = 0; i < timelines.nationColorKeys.length; i++) {
		colorIndex.set(timelines.nationColorKeys[i], [
			timelines.nationColorValues[i * 3],
			timelines.nationColorValues[i * 3 + 1],
			timelines.nationColorValues[i * 3 + 2],
		])
	}

	const eventsByTime = events.slice().sort((a, b) => a.time - b.time)
	const habitability = world.population?.habitability

	const parentChanges = flattenIntTimeline(timelines.parent, provinceCount)
	const assignmentChanges = flattenIntTimeline(
		timelines.assignment,
		provinceCount,
	)
	const populationRuralChanges = flattenFloatTimeline(
		timelines.populationRural,
		provinceCount,
	)
	const populationUrbanChanges = flattenFloatTimeline(
		timelines.populationUrban,
		provinceCount,
	)
	const developmentChanges = flattenFloatTimeline(
		timelines.development,
		provinceCount,
	)
	const consumptionChanges = flattenFloatTimeline(
		timelines.consumption,
		provinceCount,
	)
	const leaderDynastyChanges = flattenIntTimeline(
		timelines.leaderDynasty,
		provinceCount,
	)
	const leaderNameSeedChanges = flattenIntTimeline(
		timelines.leaderNameSeed,
		provinceCount,
	)
	const leaderClaimChanges = flattenIntTimeline(
		timelines.leaderClaim,
		provinceCount,
	)
	const leaderBirthYearChanges = flattenFloatTimeline(
		timelines.leaderBirthYear,
		provinceCount,
	)
	const occupationChanges = flattenIntTimeline(
		timelines.occupation,
		provinceCount,
	)

	const keyframeTimes = buildKeyframeTimes({
		startTimeMs: timelines.startTimeMs,
		endTimeMs: timelines.endTimeMs,
		timeArrays: [
			parentChanges.times,
			assignmentChanges.times,
			populationRuralChanges.times,
			populationUrbanChanges.times,
			developmentChanges.times,
			consumptionChanges.times,
			leaderDynastyChanges.times,
			leaderNameSeedChanges.times,
			leaderClaimChanges.times,
			leaderBirthYearChanges.times,
			occupationChanges.times,
		],
	})

	const keyframes: HistoryKeyframe[] = []
	const keyframeBuilder = createReplayState(provinceCount)

	const replayIntChanges = (
		changes: IntTimelineChanges,
		cursor: number,
		timeMs: number,
		target: Int32Array,
	): number => {
		while (cursor < changes.times.length && changes.times[cursor] <= timeMs) {
			target[changes.provinces[cursor]] = changes.values[cursor]
			cursor++
		}
		return cursor
	}

	const replayFloatChanges = (
		changes: FloatTimelineChanges,
		cursor: number,
		timeMs: number,
		target: Float32Array,
	): number => {
		while (cursor < changes.times.length && changes.times[cursor] <= timeMs) {
			target[changes.provinces[cursor]] = changes.values[cursor]
			cursor++
		}
		return cursor
	}

	const replayPopulationChanges = (
		changes: FloatTimelineChanges,
		cursor: number,
		timeMs: number,
		target: Float32Array,
		populationTotal: Float32Array,
		totalPopulation: { value: number },
	): number => {
		while (cursor < changes.times.length && changes.times[cursor] <= timeMs) {
			const province = changes.provinces[cursor]
			const nextValue = changes.values[cursor]
			const previousValue = target[province]
			if (previousValue !== nextValue) {
				target[province] = nextValue
				populationTotal[province] += nextValue - previousValue
				totalPopulation.value += nextValue - previousValue
			}
			cursor++
		}
		return cursor
	}

	const replayStateTo = (state: ReplayState, timeMs: number) => {
		const totalPopulation = { value: state.totalPopulation }
		state.cursors.parent = replayIntChanges(
			parentChanges,
			state.cursors.parent,
			timeMs,
			state.parent,
		)
		state.cursors.assignment = replayIntChanges(
			assignmentChanges,
			state.cursors.assignment,
			timeMs,
			state.assignment,
		)
		state.cursors.populationRural = replayPopulationChanges(
			populationRuralChanges,
			state.cursors.populationRural,
			timeMs,
			state.populationRural,
			state.populationTotal,
			totalPopulation,
		)
		state.cursors.populationUrban = replayPopulationChanges(
			populationUrbanChanges,
			state.cursors.populationUrban,
			timeMs,
			state.populationUrban,
			state.populationTotal,
			totalPopulation,
		)
		state.cursors.development = replayFloatChanges(
			developmentChanges,
			state.cursors.development,
			timeMs,
			state.development,
		)
		state.cursors.consumption = replayFloatChanges(
			consumptionChanges,
			state.cursors.consumption,
			timeMs,
			state.consumption,
		)
		state.cursors.leaderDynasty = replayIntChanges(
			leaderDynastyChanges,
			state.cursors.leaderDynasty,
			timeMs,
			state.leaderDynasty,
		)
		state.cursors.leaderNameSeed = replayIntChanges(
			leaderNameSeedChanges,
			state.cursors.leaderNameSeed,
			timeMs,
			state.leaderNameSeed,
		)
		state.cursors.leaderClaim = replayIntChanges(
			leaderClaimChanges,
			state.cursors.leaderClaim,
			timeMs,
			state.leaderClaim,
		)
		state.cursors.leaderBirthYear = replayFloatChanges(
			leaderBirthYearChanges,
			state.cursors.leaderBirthYear,
			timeMs,
			state.leaderBirthYear,
		)
		state.cursors.occupation = replayIntChanges(
			occupationChanges,
			state.cursors.occupation,
			timeMs,
			state.occupation,
		)
		state.totalPopulation = totalPopulation.value
		state.timeMs = timeMs
	}

	for (const timeMs of keyframeTimes) {
		replayStateTo(keyframeBuilder, timeMs)
		const hotFields = clonePackedHistoryFields(keyframeBuilder.hotFields)
		keyframes.push({
			timeMs,
			totalPopulation: keyframeBuilder.totalPopulation,
			cursors: cloneCursors(keyframeBuilder.cursors),
			hotFields,
			parent: hotFields.parent,
			assignment: hotFields.assignment,
			populationRural: hotFields.populationRural,
			populationUrban: hotFields.populationUrban,
			populationTotal: hotFields.populationTotal,
			development: hotFields.development,
			consumption: hotFields.consumption,
			leaderDynasty: hotFields.leaderDynasty,
			leaderNameSeed: hotFields.leaderNameSeed,
			leaderClaim: hotFields.leaderClaim,
			leaderBirthYear: hotFields.leaderBirthYear,
			occupation: hotFields.occupation,
		})
	}

	const readRelation = (
		a: number,
		b: number,
		timeMs: number,
		defaultValue = REL.NEUTRAL,
	): number => {
		const pairIndex = relationIndex.get(relationKey(a, b))
		if (pairIndex === undefined) return defaultValue
		return readTimelineValue(
			timelines.relations.times,
			timelines.relations.values,
			timelines.relations.offsets[pairIndex],
			timelines.relations.offsets[pairIndex + 1],
			defaultValue,
			timeMs,
		)
	}

	const estimateReplayCost = (cursors: ReplayCursors, timeMs: number): number =>
		upperBound(parentChanges.times, timeMs) -
		cursors.parent +
		(upperBound(assignmentChanges.times, timeMs) - cursors.assignment) +
		(upperBound(populationRuralChanges.times, timeMs) -
			cursors.populationRural) +
		(upperBound(populationUrbanChanges.times, timeMs) -
			cursors.populationUrban) +
		(upperBound(developmentChanges.times, timeMs) - cursors.development) +
		(upperBound(consumptionChanges.times, timeMs) - cursors.consumption) +
		(upperBound(leaderDynastyChanges.times, timeMs) - cursors.leaderDynasty) +
		(upperBound(leaderNameSeedChanges.times, timeMs) - cursors.leaderNameSeed) +
		(upperBound(leaderClaimChanges.times, timeMs) - cursors.leaderClaim) +
		(upperBound(leaderBirthYearChanges.times, timeMs) -
			cursors.leaderBirthYear) +
		(upperBound(occupationChanges.times, timeMs) - cursors.occupation)

	const scratchSovereign = new Int32Array(provinceCount)
	const scratchColors = new Float32Array(provinceCount * 3)
	const workingState = createReplayState(provinceCount)
	let hasWorkingState = false
	let lastComputedMs = Number.NaN
	let lastView: HistoryView | null = null
	let api: HistoryQuery

	const findKeyframeIndex = (timeMs: number): number => {
		let lo = 0
		let hi = keyframes.length
		while (lo < hi) {
			const mid = (lo + hi) >>> 1
			if (keyframes[mid].timeMs <= timeMs) lo = mid + 1
			else hi = mid
		}
		return Math.max(0, lo - 1)
	}

	const getView = (timeMs: number): HistoryView => {
		if (timeMs === lastComputedMs && lastView !== null) return lastView

		const startedAt = performance.now()
		const keyframeIndex = findKeyframeIndex(timeMs)
		const keyframe = keyframes[keyframeIndex]
		let useWorkingState =
			hasWorkingState &&
			workingState.timeMs <= timeMs &&
			timeMs >= keyframe.timeMs

		if (useWorkingState) {
			useWorkingState =
				estimateReplayCost(workingState.cursors, timeMs) <=
				estimateReplayCost(keyframe.cursors, timeMs)
		}
		if (!useWorkingState) {
			copyKeyframeIntoState(keyframe, workingState)
			hasWorkingState = true
		}

		replayStateTo(workingState, timeMs)
		const readsMs = performance.now() - startedAt

		const hierarchyStartedAt = performance.now()
		scratchColors.fill(0)
		let sovereignCount = 0
		for (let province = 0; province < provinceCount; province++) {
			if (
				workingState.parent[province] < 0 &&
				workingState.assignment[province] >= 0
			) {
				sovereignCount++
			}

			let current = province
			while (workingState.parent[current] >= 0)
				current = workingState.parent[current]
			scratchSovereign[province] = current

			const color = colorIndex.get(workingState.assignment[province])
			if (!color) continue
			const base = province * 3
			scratchColors[base] = color[0]
			scratchColors[base + 1] = color[1]
			scratchColors[base + 2] = color[2]
		}
		const hierarchyMs = performance.now() - hierarchyStartedAt

		const warsStartedAt = performance.now()
		const activeWars = timelines.wars
			.filter(
				(war) =>
					war.startTime <= timeMs &&
					(war.endTime ?? Number.POSITIVE_INFINITY) > timeMs,
			)
			.map((war) => ({
				idx: war.idx,
				attacker: war.attacker,
				defender: war.defender,
				rebel: war.rebel,
				occupied: [] as number[],
			}))

		if (activeWars.length > 0) {
			const warIndex = new Map<number, number>()
			for (let index = 0; index < activeWars.length; index++) {
				warIndex.set(activeWars[index].idx, index)
			}
			for (let province = 0; province < provinceCount; province++) {
				const index = warIndex.get(workingState.occupation[province])
				if (index !== undefined) activeWars[index].occupied.push(province)
			}
		}
		const warsMs = performance.now() - warsStartedAt

		const summaryStartedAt = performance.now()
		const assignment = workingState.assignment.slice()
		const parent = workingState.parent.slice()
		const sovereign = scratchSovereign.slice()
		const leaderDynasty = workingState.leaderDynasty.slice()
		const leaderNameSeed = workingState.leaderNameSeed.slice()
		const leaderClaim = workingState.leaderClaim.slice()
		const leaderBirthYear = workingState.leaderBirthYear.slice()
		const colors = scratchColors.slice()
		const populationTotal = workingState.populationTotal.slice()
		const populationRural = workingState.populationRural.slice()
		const populationUrban = workingState.populationUrban.slice()
		const development = workingState.development.slice()
		const consumption = workingState.consumption.slice()
		const viewRef: { current: HistoryView | null } = { current: null }
		const wealthAccess = buildLazyWealthAccess({
			parent,
			consumption,
			habitability,
			ensureChildIndex: () => {
				if (viewRef.current?.childOffset && viewRef.current.childList) {
					return {
						childOffset: viewRef.current.childOffset,
						childList: viewRef.current.childList,
					}
				}
				const index = buildChildIndex(parent)
				if (viewRef.current) {
					viewRef.current.childOffset = index.childOffset
					viewRef.current.childList = index.childList
				}
				return index
			},
		})
		const summaryMs = performance.now() - summaryStartedAt

		const cloneStartedAt = performance.now()
		const activeWarsSnapshot = activeWars.map((war) => ({
			...war,
			occupied: war.occupied.slice(),
		}))
		const cloneMs = performance.now() - cloneStartedAt

		const cultureBlendSecondary = new Int32Array(provinceCount).fill(-1)
		const cultureBlendWeight = new Float32Array(provinceCount)
		const blendSecTimeline = timelines.cultureBlendSecondary
		const blendWtTimeline = timelines.cultureBlendWeight
		if (blendSecTimeline && blendWtTimeline) {
			for (let p = 0; p < provinceCount; p++) {
				cultureBlendSecondary[p] = readTimelineValue(
					blendSecTimeline.times,
					blendSecTimeline.values,
					blendSecTimeline.offsets[p],
					blendSecTimeline.offsets[p + 1],
					-1,
					timeMs,
				)
				cultureBlendWeight[p] = readTimelineValue(
					blendWtTimeline.times,
					blendWtTimeline.values,
					blendWtTimeline.offsets[p],
					blendWtTimeline.offsets[p + 1],
					0,
					timeMs,
				)
			}
		}

		lastComputedMs = timeMs
		lastView = {
			timeMs,
			assignment,
			parent,
			sovereign,
			leaderDynasty,
			leaderNameSeed,
			leaderClaim,
			leaderBirthYear,
			colors,
			populationTotal,
			populationRural,
			populationUrban,
			development,
			consumption,
			activeWars: activeWarsSnapshot,
			sovereignCount,
			totalPopulation: workingState.totalPopulation,
			nationWealth: wealthAccess.nationWealth,
			nationOptimalWealth: wealthAccess.nationOptimalWealth,
			cultureBlendSecondary,
			cultureBlendWeight,
			relationAt: (a, b) => readRelation(a, b, timeMs),
			forEachRelationPair: (cb) => {
				const { aIdx, bIdx } = timelines.relations
				for (let i = 0; i < aIdx.length; i++) {
					if (aIdx[i] < bIdx[i]) cb(aIdx[i], bIdx[i])
				}
			},
			getNationWealth: wealthAccess.getNationWealth,
			getNationOptimalWealth: wealthAccess.getNationOptimalWealth,
		}
		viewRef.current = lastView
		historyQueryProfiles.set(api, {
			readsMs,
			hierarchyMs,
			warsMs,
			summaryMs,
			cloneMs,
		})
		return lastView
	}

	const firstEventAtOrAfter = (timeMs: number): number => {
		let lo = 0
		let hi = eventsByTime.length
		while (lo < hi) {
			const mid = (lo + hi) >>> 1
			if (eventsByTime[mid].time < timeMs) lo = mid + 1
			else hi = mid
		}
		return lo
	}

	api = {
		getView,
		getEventsInRange: (startTimeMs, endTimeMs) => {
			const start = firstEventAtOrAfter(startTimeMs)
			const end = firstEventAtOrAfter(endTimeMs + 1)
			return eventsByTime.slice(start, end)
		},
		getEventsUntil: (timeMs) => {
			const end = firstEventAtOrAfter(timeMs + 1)
			return eventsByTime.slice(0, end)
		},
	}
	return api
}
