import type { OrogenNationHierarchy, OrogenProvinces } from ".."
import { fanoutRangesForSize, rebalanceHierarchy } from "../society/hierarchy"
import type { ProvincePopulation } from "../society/population"
import type { OrogenLandmarks } from "../terrain/landmarks"
import type { Route, RouteEdge } from "../transport/worker-types"
import {
	children,
	type DerivedCache,
	provinceWars as deriveProvinceWars,
	wealthCurrent as deriveWealthCurrent,
	wealthOptimal as deriveWealthOptimal,
	nationAdjacency,
	sovereign,
} from "./derive"
import { EVT, EventHeap } from "./event-heap"
import { PROV, REL as REL_FIELD } from "./fields"
import type { HistoryRng } from "./history-rng"
import type { Timeline } from "./timeline"

export const REL = {
	NONE: 0,
	OVERLORD: 1,
	VASSAL: 2,
	PU_SENIOR: 3,
	PU_JUNIOR: 4,
	ALLY: 5,
	FRIENDLY: 6,
	NEUTRAL: 7,
	SUSPICIOUS: 8,
	RIVAL: 9,
	WAR: 10,
	COLONY: 11,
} as const

export type Relation = (typeof REL)[keyof typeof REL]

export interface War {
	idx: number
	attacker: number
	defender: number
	startTime: number
	endTime?: number
	rebel: boolean
	/** Provinces currently occupied by the attacker in this war. */
	occupied: number[]
}

interface ActiveWarOptions {
	rebel?: boolean
	startTime?: number
	nextBattleTime?: number
	occupied?: number[]
	rebellion?: {
		overlord: number
		subject: number
	}
}

const DAYS_PER_YEAR = 365
const DAYS_PER_MONTH = 30
const HOURS_PER_DAY = 24
const DAY_MS = HOURS_PER_DAY * 60 * 60 * 1000
export const YEAR_MS = DAYS_PER_YEAR * DAY_MS
export const MONTH_MS = DAYS_PER_MONTH * DAY_MS

export function deltaYear(years: number): number {
	return years * YEAR_MS
}
export function deltaMonth(months: number): number {
	return months * MONTH_MS
}
export function diffYears(a: number, b: number): number {
	return (a - b) / YEAR_MS
}

interface LeaderRuntime {
	idx: Int32Array
	birth: Float64Array
	end: Float64Array
	targetUrban: Float32Array
	nameSeed: Int32Array
}

export interface HistoryNote {
	tag: string
	time: number
	data: Record<string, number | number[] | string | boolean | undefined>
}

export interface HistoryState {
	P: number
	time: number

	_parent: Timeline<number>[]
	_assignment: Timeline<number>[]
	_pop_rural: Timeline<number>[]
	_pop_urban: Timeline<number>[]
	_development: Timeline<number>[]
	_consumption: Timeline<number>[]
	_leader_dyn: Timeline<number>[]
	_leader_name_seed: Timeline<number>[]
	_leader_claim: Timeline<number>[]
	_leader_birth_year: Timeline<number>[]
	_occupation: Timeline<number>[]
	_relations: Map<number, Timeline<Relation>>
	_culture_blend_secondary: Timeline<number>[]
	_culture_blend_weight: Timeline<number>[]

	// Live current-time caches (mirror timeline state at state.time).
	// Rebuilt from _parent when hierarchyDirty; written through on REL.set.
	parentCurrent: Int32Array
	childOffset: Int32Array
	childList: Int32Array
	sovereignCurrent: Int32Array
	relationsCurrent: Uint8Array
	hierarchyDirty: boolean
	hierarchyVersion: number
	_nationAdjCache?: { offset: Int32Array; list: Int32Array }
	_nationAdjCacheVersion?: number

	// Dense live-value mirrors of the per-province timelines.
	// Read/written at state.time; timelines remain authoritative for historical queries.
	assignmentCurrent: Int32Array
	popRuralCurrent: Float32Array
	popUrbanCurrent: Float32Array
	developmentCurrent: Float32Array
	consumptionCurrent: Float32Array
	leaderDynCurrent: Int32Array
	leaderNameSeedCurrent: Int32Array
	leaderClaimCurrent: Uint8Array
	leaderBirthYearCurrent: Float32Array
	occupationCurrent: Int32Array

	// Live current-time mirrors for culture blend fields.
	cultureBlendSecondaryCurrent: Int32Array
	cultureBlendWeightCurrent: Float32Array

	// Live per-province war-index lists (mirror of provinceWars derivation).
	provinceWars: number[][]

	provinceSeeds: Int32Array
	provinceAdjOffset: Int32Array
	provinceAdjList: Int32Array
	provinceSize: Int32Array
	provinceColors: Float32Array
	desolate: Uint8Array
	stateless: Uint8Array
	waterAccess: Uint8Array
	regionProvince: Int32Array
	regionAdjOffset: Int32Array
	regionAdjList: Int32Array
	regionIsLand: Uint8Array
	r_xyz: Float32Array
	province_xyz: Float32Array
	habitability: Float32Array
	culture: Int32Array
	cultureCount: number

	wars: War[]
	events: HistoryNote[]
	nextDynasty: number
	heap: EventHeap
	nationColors: Map<number, [number, number, number]>
	leaderRuntime: LeaderRuntime
	routes: Route[]
	network: RouteEdge[]
	landmarks: OrogenLandmarks
}

function makeTimelineArray<T>(length: number): Timeline<T>[] {
	return Array.from({ length }, (): Timeline<T> => [])
}

function buildProvinceXyz(
	provinceSeeds: Int32Array,
	r_xyz: Float32Array,
): Float32Array {
	const out = new Float32Array(provinceSeeds.length * 3)
	for (let p = 0; p < provinceSeeds.length; p++) {
		const src = provinceSeeds[p] * 3
		const dst = p * 3
		out[dst] = r_xyz[src]
		out[dst + 1] = r_xyz[src + 1]
		out[dst + 2] = r_xyz[src + 2]
	}
	return out
}

function ensureNationColor(state: HistoryState, province: number): void {
	if (province < 0 || province >= state.P || state.nationColors.has(province))
		return
	const i = province * 3
	state.nationColors.set(province, [
		state.provinceColors[i],
		state.provinceColors[i + 1],
		state.provinceColors[i + 2],
	])
}

function rebuildAssignment(state: HistoryState, time = state.time): void {
	ensureHierarchyClean(state)
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		const root = state.sovereignCurrent[p]
		PROV.assignment.set(state, p, time, root)
		if (state.parentCurrent[p] < 0) ensureNationColor(state, p)
	}
}

function validateParentArray(
	parent: Int32Array,
	provinceCount: number,
	context: string,
): void {
	for (let p = 0; p < provinceCount; p++) {
		let current = p
		let steps = 0
		while (current >= 0) {
			current = parent[current]
			steps++
			if (steps > provinceCount) {
				throw new Error(
					`Parent cycle detected in ${context} while validating province ${p}, stuck at ${current}`,
				)
			}
		}
	}
}

export function validateLiveHierarchy(
	state: HistoryState,
	context: string,
): void {
	validateParentArray(state.parentCurrent, state.P, context)
}

/** Rebuild live childOffset/childList/sovereign from parentCurrent. */
export function ensureHierarchyClean(state: HistoryState): void {
	if (!state.hierarchyDirty) return
	const P = state.P
	const parent = state.parentCurrent
	// Count children per parent
	const counts = new Int32Array(P)
	for (let p = 0; p < P; p++) {
		const par = parent[p]
		if (par >= 0) counts[par]++
	}
	const offset = new Int32Array(P + 1)
	for (let p = 0; p < P; p++) offset[p + 1] = offset[p] + counts[p]
	const list = new Int32Array(offset[P])
	const cursor = new Int32Array(P)
	for (let p = 0; p < P; p++) {
		const par = parent[p]
		if (par >= 0) list[offset[par] + cursor[par]++] = p
	}
	state.childOffset = offset
	state.childList = list

	// Compute sovereign by walking parent chains
	const sov = state.sovereignCurrent
	for (let p = 0; p < P; p++) sov[p] = -1
	for (let p = 0; p < P; p++) {
		if (state.stateless[p]) continue
		if (sov[p] !== -1) continue
		let cur = p
		let steps = 0
		while (parent[cur] >= 0 && sov[cur] === -1) {
			cur = parent[cur]
			steps++
			if (steps > P) {
				throw new Error(
					`Parent cycle detected while rebuilding hierarchy from province ${p}, stuck at ${cur}`,
				)
			}
		}
		const root = sov[cur] !== -1 ? sov[cur] : cur
		let walk = p
		steps = 0
		while (walk !== root && sov[walk] === -1) {
			sov[walk] = root
			walk = parent[walk]
			steps++
			if (steps > P) {
				throw new Error(
					`Parent cycle detected while assigning sovereign for province ${p}, stuck at ${walk}`,
				)
			}
			if (walk < 0) break
		}
		sov[p] = root
	}
	state.hierarchyDirty = false
	state.hierarchyVersion++
}

export function getRelation(
	state: HistoryState,
	a: number,
	b: number,
): Relation {
	return REL_FIELD.get(state, a, b, state.time)
}

export function setRelation(
	state: HistoryState,
	a: number,
	b: number,
	rel: Relation,
): void {
	REL_FIELD.set(state, a, b, rel, state.time)
}

export function getRulerRelation(
	state: HistoryState,
	nation: number,
): { ruler: number; relation: Relation } | undefined {
	const P = state.P
	const rels = state.relationsCurrent
	const base = nation * P
	for (let other = 0; other < P; other++) {
		if (other === nation || state.desolate[other]) continue
		const rel = rels[base + other] as Relation
		if (rel === REL.OVERLORD || rel === REL.PU_SENIOR) {
			return { ruler: other, relation: rel }
		}
	}
	return undefined
}

export function getSovereign(state: HistoryState, p: number): number {
	return sovereign(state, p, state.time)
}

export function isSovereign(state: HistoryState, p: number): boolean {
	ensureHierarchyClean(state)
	return state.parentCurrent[p] < 0 && state.sovereignCurrent[p] >= 0
}

export function getChildren(state: HistoryState, p: number): number[] {
	return children(state, p, state.time)
}

export function getNationProvinces(
	state: HistoryState,
	root: number,
): number[] {
	const result = [root]
	const stack = [root]
	while (stack.length > 0) {
		const current = stack.pop()!
		for (const child of children(state, current, state.time)) {
			result.push(child)
			stack.push(child)
		}
	}
	return result
}

export function getNationNeighbors(
	state: HistoryState,
	nation: number,
): number[] {
	const adjacency = nationAdjacency(state, state.time)
	const result: number[] = []
	for (
		let i = adjacency.offset[nation];
		i < adjacency.offset[nation + 1];
		i++
	) {
		const nb = adjacency.list[i]
		if (nb !== nation && isSovereign(state, nb)) result.push(nb)
	}
	return result
}

export function getProvinceNeighbors(state: HistoryState, p: number): number[] {
	const result: number[] = []
	for (
		let i = state.provinceAdjOffset[p];
		i < state.provinceAdjOffset[p + 1];
		i++
	) {
		result.push(state.provinceAdjList[i])
	}
	return result
}

export function wealthOptimal(state: HistoryState, p: number): number {
	return deriveWealthOptimal(state, p, state.time)
}

function wealthCurrent(
	state: HistoryState,
	p: number,
	exclude?: number,
	freedom?: boolean,
	cache?: DerivedCache,
): number {
	return deriveWealthCurrent(state, p, state.time, cache, exclude, freedom)
}

function makeDerivedCache(): DerivedCache {
	return {
		children: new Map(),
		sovereign: new Map(),
		gravity: new Map(),
		wealthCurrent: new Map(),
		wealthOptimal: new Map(),
		provinceWars: new Map(),
		nationAdjacency: new Map(),
	}
}

export function warStrengthSolo(
	state: HistoryState,
	p: number,
	exclude?: number,
	cache?: DerivedCache,
): number {
	const curr = Math.max(
		0.1,
		wealthCurrent(state, p, exclude, exclude === p, cache),
	)
	return curr / (1 + deriveProvinceWars(state, p, state.time, cache).length)
}

function getWarAllies(
	state: HistoryState,
	nation: number,
	type: "offensive" | "defensive",
	target: number,
): number[] {
	const validRelMask = new Uint8Array(11)
	validRelMask[REL.OVERLORD] = 1
	validRelMask[REL.VASSAL] = 1
	validRelMask[REL.PU_SENIOR] = 1
	validRelMask[REL.PU_JUNIOR] = 1
	if (type === "defensive") validRelMask[REL.ALLY] = 1

	const allies: number[] = []
	ensureHierarchyClean(state)
	const rels = state.relationsCurrent
	const P = state.P
	for (let i = 0; i < P; i++) {
		if (i === nation || i === target) continue
		if (state.parentCurrent[i] >= 0 || state.sovereignCurrent[i] < 0) continue
		const rel = rels[nation * P + i]
		if (!validRelMask[rel]) continue
		if ((rels[i * P + target] as Relation) === REL.ALLY) continue
		allies.push(i)
	}
	return allies
}

function warStrengthCoalition(
	state: HistoryState,
	attacker: number,
	defender: number,
	exclude?: number,
	cache?: DerivedCache,
): { attacker: number; defender: number } {
	const c = cache ?? makeDerivedCache()
	const atkAllies = getWarAllies(state, attacker, "offensive", defender)
	const defAllies = getWarAllies(state, defender, "defensive", attacker)
	let atk = warStrengthSolo(state, attacker, exclude, c)
	let def = warStrengthSolo(state, defender, exclude, c)
	for (const ally of atkAllies)
		atk += warStrengthSolo(state, ally, undefined, c) * 0.5
	for (const ally of defAllies)
		def += warStrengthSolo(state, ally, undefined, c) * 0.5
	return { attacker: atk, defender: def }
}

export function warThreat(
	state: HistoryState,
	attacker: number,
	defender: number,
	exclude?: number,
): number {
	const strength = warStrengthCoalition(
		state,
		attacker,
		defender,
		exclude,
		makeDerivedCache(),
	)
	const atk = strength.attacker ** 2
	const def = strength.defender ** 2
	return 1 - atk / (atk + def)
}

export function releaseProvince(
	state: HistoryState,
	p: number,
	rng: HistoryRng,
): void {
	PROV.parent.set(state, p, state.time, -1)
	rebuildAssignment(state)
	spawnLeader(state, p, rng)
	state.heap.enqueue(
		state.leaderRuntime.end[p],
		EVT.SUCCESSION,
		p,
		state.leaderRuntime.idx[p],
	)
}

function isProvinceConnectedToParent(
	state: HistoryState,
	province: number,
): boolean {
	const parent = PROV.parent.get(state, province)
	if (parent < 0) return true

	ensureHierarchyClean(state)
	const nation = state.sovereignCurrent[province]
	const visited = new Uint8Array(state.P)
	const queue = [province]
	visited[province] = 1
	let head = 0

	while (head < queue.length) {
		const current = queue[head++]
		for (
			let i = state.provinceAdjOffset[current];
			i < state.provinceAdjOffset[current + 1];
			i++
		) {
			const nb = state.provinceAdjList[i]
			if (nb === parent) return true
			if (visited[nb] || state.sovereignCurrent[nb] !== nation) continue
			visited[nb] = 1
			queue.push(nb)
		}
	}

	return false
}

function releaseDisconnectedProvince(
	state: HistoryState,
	province: number,
	overlord: number,
	rng: HistoryRng,
): void {
	if (state.occupationCurrent[province] >= 0) {
		PROV.occupation.set(state, province, state.time, -1)
	}
	releaseProvince(state, province, rng)
	state.events.push({
		tag: "rebellion",
		time: state.time,
		data: {
			overlord,
			subject: province,
			disconnected: true,
		},
	})
}

function addTerritory(
	state: HistoryState,
	nation: number,
	subjects: number[],
	_rng: HistoryRng,
): void {
	const members = Array.from(
		new Set(
			[...subjects, ...getNationProvinces(state, nation)].filter(
				(p) => p !== nation && !state.desolate[p],
			),
		),
	)
	if (members.length === 0) return

	const nextParent = state.parentCurrent.slice()
	const nextDepth = new Int32Array(state.P)

	nextParent[nation] = -1
	for (const member of members) nextParent[member] = -1

	rebalanceHierarchy({
		capital: nation,
		members: Int32Array.from(members),
		parent: nextParent,
		depth: nextDepth,
		currentDepth: 0,
		fanoutRanges: fanoutRangesForSize(members.length),
		habitability: state.habitability,
		urbanPop: state.popUrbanCurrent,
		waterAccess: state.waterAccess,
		adjOffset: state.provinceAdjOffset,
		adjList: state.provinceAdjList,
		provinceCount: state.P,
	})
	// Depose leaders of absorbed sovereigns before parents are rewritten
	for (const p of subjects) {
		if (!isSovereign(state, p)) continue
		state.leaderRuntime.end[p] = state.time
		state.leaderRuntime.idx[p]++
		state.events.push({
			tag: "ruler deposed",
			time: state.time,
			data: { nation: p, leader: state.leaderRuntime.idx[p] - 1 },
		})
	}
	for (const member of members) {
		PROV.parent.set(state, member, state.time, -1)
	}
	PROV.parent.set(state, nation, state.time, -1)
	for (const member of members) {
		PROV.parent.set(state, member, state.time, nextParent[member])
	}
	rebuildAssignment(state)
}

function releaseSubjectRelations(state: HistoryState, nation: number): void {
	for (let other = 0; other < state.P; other++) {
		if (other === nation || state.desolate[other]) continue
		const rel = getRelation(state, nation, other)
		if (rel === REL.NEUTRAL || rel === REL.NONE || rel === REL.WAR) continue

		if (rel === REL.VASSAL) {
			setRelation(state, nation, other, REL.NEUTRAL)
			state.events.push({
				tag: "vassalage ended",
				time: state.time,
				data: { vassal: nation, overlord: other },
			})
			continue
		}

		if (rel === REL.OVERLORD) {
			setRelation(state, nation, other, REL.NEUTRAL)
			state.events.push({
				tag: "vassalage ended",
				time: state.time,
				data: { vassal: other, overlord: nation },
			})
			continue
		}

		if (rel === REL.PU_JUNIOR) {
			setRelation(state, nation, other, REL.NEUTRAL)
			state.events.push({
				tag: "personal union ended",
				time: state.time,
				data: { junior: nation, senior: other },
			})
			continue
		}

		if (rel === REL.PU_SENIOR) {
			setRelation(state, nation, other, REL.NEUTRAL)
			state.events.push({
				tag: "personal union ended",
				time: state.time,
				data: { junior: other, senior: nation },
			})
		}
	}
}

export function fixConnections(
	state: HistoryState,
	nation: number,
	rng: HistoryRng,
): void {
	let disconnected = true
	while (disconnected) {
		disconnected = false
		for (const subject of getChildren(state, nation)) {
			if (isProvinceConnectedToParent(state, subject)) continue
			disconnected = true
			releaseDisconnectedProvince(state, subject, nation, rng)
		}
	}

	const overlord = PROV.parent.get(state, nation)
	if (overlord >= 0 && !isProvinceConnectedToParent(state, nation)) {
		releaseDisconnectedProvince(state, nation, overlord, rng)
		fixConnections(state, overlord, rng)
	}
}

export function startWar(
	state: HistoryState,
	attacker: number,
	defender: number,
	rng: HistoryRng,
	rebel = false,
): void {
	createActiveWar(state, attacker, defender, rng, { rebel })
}

export function queueBattleEvent(
	state: HistoryState,
	warIdx: number,
	attacker: number,
	defender: number,
	time: number,
): void {
	state.heap.enqueue(time, EVT.BATTLE, warIdx, attacker, defender)
}

export function createActiveWar(
	state: HistoryState,
	attacker: number,
	defender: number,
	rng: HistoryRng,
	options: ActiveWarOptions = {},
): War {
	const startTime = options.startTime ?? state.time
	const war: War = {
		idx: state.wars.length,
		attacker,
		defender,
		startTime,
		rebel: options.rebel ?? false,
		occupied: [],
	}
	state.wars.push(war)
	state.provinceWars[attacker].push(war.idx)
	state.provinceWars[defender].push(war.idx)
	REL_FIELD.set(state, attacker, defender, REL.WAR, startTime)
	if (startTime < state.time) {
		REL_FIELD.set(state, attacker, defender, REL.WAR, state.time)
	}
	if (options.rebellion) {
		state.events.push({
			tag: "rebellion",
			time: startTime,
			data: options.rebellion,
		})
	}
	state.events.push({
		tag: "war started",
		time: startTime,
		data: {
			attacker,
			defender,
			war: war.idx,
		},
	})
	const occupied = Array.from(
		new Set(
			(options.occupied ?? []).filter(
				(province) =>
					province !== defender &&
					getSovereign(state, province) === defender &&
					state.occupationCurrent[province] < 0,
			),
		),
	)
	for (const province of occupied) {
		PROV.occupation.set(state, province, startTime, war.idx)
		if (startTime < state.time) {
			PROV.occupation.set(state, province, state.time, war.idx)
		}
		war.occupied.push(province)
	}
	queueBattleEvent(
		state,
		war.idx,
		attacker,
		defender,
		options.nextBattleTime ?? state.time + deltaMonth(rng.uniform(1, 6)),
	)
	return war
}

export function resolveWar(
	state: HistoryState,
	war: War,
	rng: HistoryRng,
	victory?: boolean,
	stalemate?: string,
): void {
	war.endTime = state.time
	const transferred = (
		victory ? getNationProvinces(state, war.defender) : [...war.occupied]
	).filter((p) => getSovereign(state, p) === war.defender)

	for (const p of war.occupied) {
		if (state.occupationCurrent[p] === war.idx) {
			PROV.occupation.set(state, p, state.time, -1)
		}
	}
	war.occupied.length = 0

	const removeWar = (p: number): void => {
		const list = state.provinceWars[p]
		const i = list.indexOf(war.idx)
		if (i >= 0) list.splice(i, 1)
	}
	removeWar(war.attacker)
	removeWar(war.defender)

	if (victory) {
		releaseSubjectRelations(state, war.defender)
	}
	if (transferred.length > 0) {
		addTerritory(state, war.attacker, transferred, rng)
	}
	if (!victory) fixConnections(state, war.defender, rng)
	setRelation(state, war.attacker, war.defender, REL.SUSPICIOUS)

	state.events.push({
		tag: "war ended",
		time: state.time,
		data: {
			war: war.idx,
			attacker: war.attacker,
			defender: war.defender,
			winner: transferred.length > 0 ? war.attacker : war.defender,
			transferred,
			stalemate,
		},
	})
}

export function provinceDistanceSq(
	state: HistoryState,
	a: number,
	b: number,
): number {
	const aBase = a * 3
	const bBase = b * 3
	const dx = state.province_xyz[aBase] - state.province_xyz[bBase]
	const dy = state.province_xyz[aBase + 1] - state.province_xyz[bBase + 1]
	const dz = state.province_xyz[aBase + 2] - state.province_xyz[bBase + 2]
	return dx * dx + dy * dy + dz * dz
}

export function createHistoryState(
	nations: OrogenNationHierarchy,
	provinces: OrogenProvinces,
	population: ProvincePopulation,
	coastal: Uint8Array,
	riverVisible: Uint8Array,
	r_xyz: Float32Array,
	cultures: { assignment: Int32Array; count: number },
	startYear: number,
	rng: HistoryRng,
	waterAccess?: Uint8Array,
	landmarks?: OrogenLandmarks,
	regionProvince?: Int32Array,
	regionAdjOffset?: Int32Array,
	regionAdjList?: Int32Array,
	regionIsLand?: Uint8Array,
): HistoryState {
	const P = provinces.count
	const startTime = startYear * YEAR_MS
	const waterAccessLevels = waterAccess ?? new Uint8Array(P)
	const stateless = new Uint8Array(P)
	for (let p = 0; p < P; p++) {
		if (!provinces.desolate[p] && nations.sovereign[p] < 0) stateless[p] = 1
	}
	if (!waterAccess) {
		for (let region = 0; region < provinces.regionProvince.length; region++) {
			const province = provinces.regionProvince[region]
			if (province < 0) continue
			if (coastal[region] || riverVisible[region])
				waterAccessLevels[province] = 1
		}
	}
	const state: HistoryState = {
		P,
		time: startTime,
		_parent: makeTimelineArray<number>(P),
		_assignment: makeTimelineArray<number>(P),
		_pop_rural: makeTimelineArray<number>(P),
		_pop_urban: makeTimelineArray<number>(P),
		_development: makeTimelineArray<number>(P),
		_consumption: makeTimelineArray<number>(P),
		_leader_dyn: makeTimelineArray<number>(P),
		_leader_name_seed: makeTimelineArray<number>(P),
		_leader_claim: makeTimelineArray<number>(P),
		_leader_birth_year: makeTimelineArray<number>(P),
		_occupation: makeTimelineArray<number>(P),
		_relations: new Map(),
		_culture_blend_secondary: makeTimelineArray<number>(P),
		_culture_blend_weight: makeTimelineArray<number>(P),
		parentCurrent: new Int32Array(P).fill(-1),
		childOffset: new Int32Array(P + 1),
		childList: new Int32Array(0),
		sovereignCurrent: new Int32Array(P).fill(-1),
		relationsCurrent: new Uint8Array(P * P).fill(REL.NEUTRAL),
		hierarchyDirty: true,
		hierarchyVersion: 0,
		assignmentCurrent: new Int32Array(P).fill(-1),
		popRuralCurrent: new Float32Array(P),
		popUrbanCurrent: new Float32Array(P),
		developmentCurrent: new Float32Array(P),
		consumptionCurrent: new Float32Array(P),
		leaderDynCurrent: new Int32Array(P).fill(-1),
		leaderNameSeedCurrent: new Int32Array(P).fill(-1),
		leaderClaimCurrent: new Uint8Array(P),
		leaderBirthYearCurrent: new Float32Array(P).fill(-1),
		occupationCurrent: new Int32Array(P).fill(-1),
		cultureBlendSecondaryCurrent: new Int32Array(P).fill(-1),
		cultureBlendWeightCurrent: new Float32Array(P),
		provinceWars: Array.from({ length: P }, () => [] as number[]),
		provinceSeeds: provinces.seeds,
		provinceAdjOffset: provinces.adjOffset,
		provinceAdjList: provinces.adjList,
		provinceSize: provinces.size,
		provinceColors: provinces.colors,
		desolate: provinces.desolate,
		stateless,
		waterAccess: waterAccessLevels,
		regionProvince: regionProvince ?? new Int32Array(0),
		regionAdjOffset: regionAdjOffset ?? new Int32Array(0),
		regionAdjList: regionAdjList ?? new Int32Array(0),
		regionIsLand: regionIsLand ?? new Uint8Array(0),
		r_xyz,
		province_xyz: buildProvinceXyz(provinces.seeds, r_xyz),
		habitability: population.habitability.slice(),
		culture: cultures.assignment.slice(),
		cultureCount: cultures.count,
		wars: [],
		events: [],
		nextDynasty: 0,
		heap: new EventHeap(),
		nationColors: new Map(),
		leaderRuntime: {
			idx: new Int32Array(P),
			birth: new Float64Array(P),
			end: new Float64Array(P),
			targetUrban: new Float32Array(P),
			nameSeed: new Int32Array(P).fill(-1),
		},
		routes: [],
		network: [],
		landmarks: landmarks ?? {
			regionLandmark: new Int32Array(0),
			type: new Uint8Array(0),
			size: new Int32Array(0),
			count: 0,
		},
	}

	for (let p = 0; p < P; p++) {
		if (provinces.desolate[p]) continue
		state.parentCurrent[p] = nations.parent[p]
		PROV.parent.set(state, p, startTime, nations.parent[p])
		PROV.assignment.set(state, p, startTime, nations.sovereign[p])
		PROV.population.rural.set(
			state,
			p,
			startTime,
			population.population[p] * 0.95,
		)
		PROV.population.urban.set(
			state,
			p,
			startTime,
			population.population[p] * 0.05,
		)
		PROV.development.set(state, p, startTime, 0)
		PROV.consumption.set(state, p, startTime, 0)
		PROV.leader.dynasty.set(state, p, startTime, -1)
		PROV.leader.nameSeed.set(state, p, startTime, -1)
		PROV.leader.claim.set(state, p, startTime, 0)
		PROV.leader.birthYear.set(state, p, startTime, -1)
		PROV.occupation.set(state, p, startTime, -1)
		if (nations.parent[p] < 0) ensureNationColor(state, p)
	}

	for (let p = 0; p < P; p++) {
		if (provinces.desolate[p]) continue
		if (state.stateless[p]) continue
		if (nations.parent[p] >= 0) continue
		spawnLeader(state, p, rng)
	}
	initDynasties(state, rng)
	rebuildAssignment(state, startTime)

	return state
}

export function spawnLeader(
	state: HistoryState,
	p: number,
	rng: HistoryRng,
	end?: number,
): void {
	const death = end ?? state.time + deltaYear(rng.uniform(1, 60))
	const ageAtAccession =
		rng.weightedChoice([
			{ v: rng.uniform(1, 10), w: 1 },
			{ v: rng.uniform(11, 15), w: 2 },
			{ v: rng.uniform(16, 30), w: 5 },
			{ v: rng.uniform(31, 50), w: 4 },
			{ v: rng.uniform(51, 65), w: 1 },
		]) ?? 30

	state.leaderRuntime.idx[p]++
	state.leaderRuntime.birth[p] = state.time - deltaYear(ageAtAccession)
	state.leaderRuntime.end[p] = death
	PROV.leader.nameSeed.set(state, p, state.time, rng.randint(1, 0x7fffffff))
	PROV.leader.claim.set(state, p, state.time, 3)
	PROV.leader.birthYear.set(
		state,
		p,
		state.time,
		state.leaderRuntime.birth[p] / YEAR_MS,
	)
}

function initDynasties(state: HistoryState, rng: HistoryRng): void {
	const shuffled = rng.shuffle(
		Array.from({ length: state.P }, (_, i) => i).filter(
			(p) =>
				!state.desolate[p] && !state.stateless[p] && state.parentCurrent[p] < 0,
		),
	)
	for (const p of shuffled) {
		if (PROV.leader.dynasty.get(state, p, state.time) >= 0) continue
		const sameCulture: Array<{ dynasty: number; source: number }> = []
		const other: Array<{ dynasty: number; source: number }> = []
		const currentSovereign = (province: number): number => {
			let current = province
			while (state.parentCurrent[current] >= 0) {
				current = state.parentCurrent[current]
			}
			return current
		}
		for (const nb of getProvinceNeighbors(state, p)) {
			const dynasty = PROV.leader.dynasty.get(state, nb, state.time)
			if (state.desolate[nb] || dynasty < 0) continue
			const donor = { dynasty, source: currentSovereign(nb) }
			if (state.culture[p] === state.culture[nb]) sameCulture.push(donor)
			else other.push(donor)
		}
		let dynasty = -1
		let source = -1
		if (sameCulture.length > 0 && rng.random() < 0.4)
			({ dynasty, source } = rng.choice(sameCulture))
		else if (other.length > 0 && rng.random() < 0.05)
			({ dynasty, source } = rng.choice(other))
		if (dynasty < 0) dynasty = state.nextDynasty++
		PROV.leader.dynasty.set(state, p, state.time, dynasty)
		if (source >= 0 && source !== p && dynasty >= 0 && isSovereign(state, p)) {
			state.events.push({
				tag: "dynasty spread",
				time: state.time,
				data: {
					nation: p,
					source,
					dynasty,
				},
			})
		}
	}
}
