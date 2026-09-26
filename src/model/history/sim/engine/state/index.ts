import { DERIVE } from "@/model/history/sim/engine/derive"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { EVENT_HEAP, EventHeap } from "@/model/history/sim/engine/event-heap"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import {
	getChildren,
	getNationNeighbors,
	getNationPopulation,
	getNationProvinces,
	getProvinceNeighbors,
	rebuildAssignment,
	validateLiveHierarchy,
} from "@/model/history/sim/engine/state/hierarchy"
import {
	getRelation,
	getRulerRelation,
	getSovereign,
	isSovereign,
	setRelation,
} from "@/model/history/sim/engine/state/relations"
import {
	deltaMonth,
	deltaYear,
	diffYears,
	yearMs,
} from "@/model/history/sim/engine/state/time"
import {
	applyDerivedParents,
	considerTitles,
	settleProvinces,
} from "@/model/history/sim/engine/state/titles"
import type {
	BuildProvinceXyzParams,
	CreateActiveWarParams,
	CreateHistoryStateParams,
	FixConnectionsParams,
	FoundRulerParams,
	GetWarAlliesParams,
	HistoryState,
	InstallRulerParams,
	IsProvinceConnectedToParentParams,
	OriginOfParams,
	ProvinceDistanceSqParams,
	QueueBattleEventParams,
	RealmPairParams,
	ReleaseDisconnectedProvinceParams,
	ReleaseProvinceParams,
	ReleaseSubjectRelationsParams,
	RepartitionNationParams,
	ResolveWarParams,
	StartWarParams,
	UnionLink,
	UnionPairParams,
	UnionRealmParams,
	UnionRulerParams,
	UniteParams,
	War,
} from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { FAMILY } from "@/model/history/sim/people/family"
import type { RealmOrigin } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"
import { DEJURE } from "@/model/society/dejure"

export const rel = {
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

export type Relation = (typeof rel)[keyof typeof rel]
const TITLE_CAPACITY = 4096

const DEFAULT_START_YEAR = 867

function buildProvinceXyz({
	provinceSeeds,
	r_xyz,
}: BuildProvinceXyzParams): Float32Array {
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

function getWarAllies({
	state,
	nation,
	type,
	target,
}: GetWarAlliesParams): number[] {
	const validRelMask = new Uint8Array(11)
	validRelMask[rel.OVERLORD] = 1
	validRelMask[rel.VASSAL] = 1
	validRelMask[rel.PU_SENIOR] = 1
	validRelMask[rel.PU_JUNIOR] = 1
	if (type === "defensive") validRelMask[rel.ALLY] = 1

	const allies: number[] = []
	DERIVE.ensureHierarchyClean(state)
	const rels = state.relationsCurrent
	const P = state.P
	const candidates: number[] = []
	for (const i of state.relationColumns[nation]) {
		if (i === nation || i === target) continue
		if (!validRelMask[rels[nation * P + i] as Relation]) continue
		candidates.push(i)
	}
	candidates.sort((a, b) => a - b)
	for (const i of candidates) {
		if (state.parentCurrent[i] >= 0 || state.sovereignCurrent[i] < 0) continue
		if ((rels[i * P + target] as Relation) === rel.ALLY) continue
		allies.push(i)
	}
	return allies
}

function releaseProvince({ state, p, rng }: ReleaseProvinceParams): void {
	const formerSovereign = getSovereign({ state, p })
	const formerPopulation = getNationPopulation({ state, root: formerSovereign })
	const share =
		formerPopulation > 0
			? getNationPopulation({ state, root: p }) / formerPopulation
			: 0
	const manpower =
		FIELDS.prov.manpower.get({ state, p: formerSovereign }) * share
	const treasury =
		Math.max(0, FIELDS.prov.treasury.get({ state, p: formerSovereign })) * share
	FIELDS.prov.manpower.set({ state, p, value: manpower })
	FIELDS.prov.treasury.set({ state, p, value: treasury })
	const releasedBudget = TREASURY_BUDGET.get({ state, p })
	releasedBudget.succession += treasury
	releasedBudget.otherChangesTotal += treasury
	FIELDS.prov.manpower.set({
		state,
		p: formerSovereign,
		value: FIELDS.prov.manpower.get({ state, p: formerSovereign }) - manpower,
	})
	FIELDS.prov.treasury.set({
		state,
		p: formerSovereign,
		value: FIELDS.prov.treasury.get({ state, p: formerSovereign }) - treasury,
	})
	const formerBudget = TREASURY_BUDGET.get({ state, p: formerSovereign })
	formerBudget.succession -= treasury
	formerBudget.otherChangesTotal -= treasury
	FIELDS.prov.parent.set({ state, p, value: -1 })
	rebuildAssignment({ state })
	repartitionNation({ state, nation: formerSovereign, subjects: [] })
	repartitionNation({ state, nation: p, subjects: [] })
	const vassal = state.people.rulerOf[p]
	if (
		vassal >= 0 &&
		state.people.persons.throne[vassal] === p &&
		PEOPLE.aliveAt({
			people: state.people,
			person: vassal,
			time: state.time / yearMs,
		})
	)
		installRuler({ state, p, person: vassal, claim: FOUNDER_CLAIM })
	else foundRuler({ state, p, age: rulerAge(rng), claim: FOUNDER_CLAIM, rng })
	state.heap.enqueue(
		state.leaderRuntime.end[p],
		EVENT_HEAP.evt.SUCCESSION,
		p,
		state.leaderRuntime.idx[p],
	)
}

function isProvinceConnectedToParent({
	state,
	province,
}: IsProvinceConnectedToParentParams): boolean {
	const parent = FIELDS.prov.parent.get({ state, p: province })
	if (parent < 0) return true

	DERIVE.ensureHierarchyClean(state)
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

function releaseDisconnectedProvince({
	state,
	province,
	overlord,
	rng,
}: ReleaseDisconnectedProvinceParams): void {
	if (state.occupationCurrent[province] >= 0) {
		FIELDS.prov.occupation.set({
			state,
			p: province,
			value: -1,
		})
	}
	releaseProvince({ state, p: province, rng })
	state.events.push({
		tag: "province released",
		time: state.time,
		data: { overlord, subject: province },
	})
}

function repartitionNation({
	state,
	nation,
	subjects,
}: RepartitionNationParams): void {
	const members = Array.from(
		new Set(
			[...subjects, ...getNationProvinces({ state, root: nation })].filter(
				(p) => !state.desolate[p],
			),
		),
	)
	if (members.length === 0) return
	// Depose leaders of absorbed sovereigns before parents are rewritten
	for (const p of subjects) {
		if (p === nation || !isSovereign({ state, p })) continue
		state.leaderRuntime.end[p] = state.time
		state.leaderRuntime.idx[p]++
		state.events.push({
			tag: "ruler deposed",
			time: state.time,
			data: { nation: p, leader: state.leaderRuntime.idx[p] - 1 },
		})
	}
	applyDerivedParents({ state, nation, members })
	rebuildAssignment({ state })
	settleProvinces({ state, provinces: members })
}

function releaseSubjectRelations({
	state,
	nation,
}: ReleaseSubjectRelationsParams): void {
	for (let other = 0; other < state.P; other++) {
		if (other === nation || state.desolate[other]) continue
		const relation = getRelation({ state, a: nation, b: other })
		if (
			relation === rel.NEUTRAL ||
			relation === rel.NONE ||
			relation === rel.WAR
		)
			continue

		if (relation === rel.VASSAL) {
			setRelation({ state, a: nation, b: other, rel: rel.NEUTRAL })
			state.events.push({
				tag: "vassalage ended",
				time: state.time,
				data: { vassal: nation, overlord: other },
			})
			continue
		}

		if (relation === rel.OVERLORD) {
			setRelation({ state, a: nation, b: other, rel: rel.NEUTRAL })
			state.events.push({
				tag: "vassalage ended",
				time: state.time,
				data: { vassal: other, overlord: nation },
			})
			continue
		}

		if (relation === rel.PU_JUNIOR) {
			setRelation({ state, a: nation, b: other, rel: rel.NEUTRAL })
			state.events.push({
				tag: "personal union ended",
				time: state.time,
				data: { junior: nation, senior: other },
			})
			continue
		}

		if (relation === rel.PU_SENIOR) {
			setRelation({ state, a: nation, b: other, rel: rel.NEUTRAL })
			state.events.push({
				tag: "personal union ended",
				time: state.time,
				data: { junior: other, senior: nation },
			})
		}
	}
}

function fixConnections({ state, nation, rng }: FixConnectionsParams): void {
	let disconnected = true
	while (disconnected) {
		disconnected = false
		for (const subject of getChildren({ state, p: nation })) {
			if (isProvinceConnectedToParent({ state, province: subject })) continue
			disconnected = true
			releaseDisconnectedProvince({
				state,
				province: subject,
				overlord: nation,
				rng,
			})
		}
	}

	const overlord = FIELDS.prov.parent.get({ state, p: nation })
	if (
		overlord >= 0 &&
		!isProvinceConnectedToParent({ state, province: nation })
	) {
		releaseDisconnectedProvince({ state, province: nation, overlord, rng })
		fixConnections({ state, nation: overlord, rng })
	}
}

function startWar({
	state,
	attacker,
	defender,
	rng,
	rebel,
}: StartWarParams): void {
	if (
		DERIVE.provinceWars({ state, p: attacker }).some((idx) => {
			const war = state.wars[idx]
			return war.endTime === undefined && war.defender === attacker
		})
	)
		return
	createActiveWar({ state, attacker, defender, rng, options: { rebel } })
}

function queueBattleEvent({
	state,
	warIdx,
	attacker,
	defender,
	time,
}: QueueBattleEventParams): void {
	state.heap.enqueue(time, EVENT_HEAP.evt.BATTLE, warIdx, attacker, defender)
}

function createActiveWar({
	state,
	attacker,
	defender,
	rng,
	options = {},
}: CreateActiveWarParams): War {
	const startTime = options.startTime ?? state.time
	const war: War = {
		idx: state.wars.length,
		attacker,
		defender,
		startTime,
		rebel: options.rebel ?? false,
		deployed: {},
		occupied: [],
	}
	state.wars.push(war)
	state.activeWarIds.add(war.idx)
	state.provinceWars[attacker].push(war.idx)
	state.provinceWars[defender].push(war.idx)
	FIELDS.rel.set({
		state,
		a: attacker,
		b: defender,
		rel: rel.WAR,
	})
	if (startTime < state.time) {
		FIELDS.rel.set({
			state,
			a: attacker,
			b: defender,
			rel: rel.WAR,
		})
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
	JOURNAL.coalition({
		state,
		warId: war.idx,
		rebel: war.rebel,
		attackers: [
			attacker,
			...getWarAllies({
				state,
				nation: attacker,
				type: "offensive",
				target: defender,
			}),
		],
		defenders: [
			defender,
			...getWarAllies({
				state,
				nation: defender,
				type: "defensive",
				target: attacker,
			}),
		],
	})
	const occupied = Array.from(
		new Set(
			(options.occupied ?? []).filter(
				(province) =>
					province !== defender &&
					getSovereign({ state, p: province }) === defender &&
					state.occupationCurrent[province] < 0,
			),
		),
	)
	for (const province of occupied) {
		FIELDS.prov.occupation.set({
			state,
			p: province,
			value: war.idx,
		})
		if (startTime < state.time) {
			FIELDS.prov.occupation.set({
				state,
				p: province,
				value: war.idx,
			})
		}
		war.occupied.push(province)
	}
	queueBattleEvent({
		state,
		warIdx: war.idx,
		attacker,
		defender,
		time: options.nextBattleTime ?? state.time + deltaMonth(rng.uniform(1, 6)),
	})
	return war
}

function resolveWar({
	state,
	war,
	rng,
	victory,
	stalemate,
}: ResolveWarParams): void {
	war.endTime = state.time
	state.activeWarIds.delete(war.idx)
	const conquered = (
		victory
			? getNationProvinces({ state, root: war.defender })
			: [...war.occupied]
	).filter((p) => getSovereign({ state, p }) === war.defender)
	const transferred = victory
		? conquered
		: Array.from(
				new Set(
					conquered.flatMap((root) => getNationProvinces({ state, root })),
				),
			)

	for (const p of war.occupied) {
		if (state.occupationCurrent[p] === war.idx) {
			FIELDS.prov.occupation.set({ state, p, value: -1 })
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
		releaseSubjectRelations({ state, nation: war.defender })
	}
	if (transferred.length > 0) {
		repartitionNation({
			state,
			nation: war.attacker,
			subjects: transferred,
		})
		if (isSovereign({ state, p: war.defender }))
			repartitionNation({ state, nation: war.defender, subjects: [] })
	}
	if (!victory) fixConnections({ state, nation: war.defender, rng })
	setRelation({ state, a: war.attacker, b: war.defender, rel: rel.SUSPICIOUS })

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

function provinceDistanceSq({ state, a, b }: ProvinceDistanceSqParams): number {
	const aBase = a * 3
	const bBase = b * 3
	const dx = state.province_xyz[aBase] - state.province_xyz[bBase]
	const dy = state.province_xyz[aBase + 1] - state.province_xyz[bBase + 1]
	const dz = state.province_xyz[aBase + 2] - state.province_xyz[bBase + 2]
	return dx * dx + dy * dy + dz * dz
}

function createHistoryState({
	nations,
	provinces,
	population,
	coastal,
	riverVisible,
	r_xyz,
	cultures,
	religions,
	startYear,
	rng,
	waterAccess,
	landmarks,
	regionProvince,
	regionAdjOffset,
	regionAdjList,
	regionIsLand,
	era = "lateMedieval",
}: CreateHistoryStateParams): HistoryState {
	const P = provinces.count
	const startTime = startYear * yearMs
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
		era,
		parentCurrent: new Int32Array(P).fill(-1),
		childOffset: new Int32Array(P + 1),
		childList: new Int32Array(0),
		sovereignCurrent: new Int32Array(P).fill(-1),
		relationsCurrent: new Uint8Array(P * P).fill(rel.NEUTRAL),
		relationColumns: Array.from({ length: P }, () => new Set<number>()),
		hierarchyDirty: true,
		hierarchyVersion: 0,
		titles: DEJURE.withCapacity({
			titles: nations.titles,
			capacity: nations.titles.count + TITLE_CAPACITY,
		}),
		titleMembers: DEJURE.membersOf({
			titles: nations.titles,
			provinceCount: P,
		}),
		seatRank: DEJURE.seatRank({
			titles: nations.titles,
			provinceCount: P,
			heldOnly: true,
		}),
		titleFounded: new Uint8Array(nations.titles.count + TITLE_CAPACITY),
		titleLapseSince: new Float64Array(
			nations.titles.count + TITLE_CAPACITY,
		).fill(-1),
		assignmentCurrent: new Int32Array(P).fill(-1),
		popRuralCurrent: new Float32Array(P),
		popUrbanCurrent: new Float32Array(P),
		developmentCurrent: new Float32Array(P),
		knowledgeCurrent: new Float32Array(P),
		knowledgeBaseline: 0,
		censusVersion: 0,
		realmCache: new Map(),
		treasuryCurrent: new Float64Array(P),
		treasuryBudgetCurrent: new Map(),
		manpowerCurrent: new Float64Array(P),
		deploymentUpdateTime: new Float64Array(P).fill(-1),
		revenueCurrent: new Float64Array(P),
		plunderedUntil: new Float64Array(P),
		leaderDynCurrent: new Int32Array(P).fill(-1),
		leaderNameSeedCurrent: new Int32Array(P).fill(-1),
		leaderClaimCurrent: new Uint8Array(P),
		leaderBirthYearCurrent: new Float32Array(P).fill(-1),
		occupationCurrent: new Int32Array(P).fill(-1),
		cultureBlendSecondaryCurrent: new Int32Array(P).fill(-1),
		cultureBlendWeightCurrent: new Float32Array(P),
		provinceWars: Array.from({ length: P }, () => [] as number[]),
		provinceSeeds: provinces.seeds.slice(),
		provinceAdjOffset: provinces.adjOffset.slice(),
		provinceAdjList: provinces.adjList.slice(),
		provinceSize: provinces.size.slice(),
		desolate: provinces.desolate.slice(),
		stateless,
		waterAccess: waterAccessLevels.slice(),
		regionProvince: regionProvince?.slice() ?? new Int32Array(0),
		regionAdjOffset: regionAdjOffset?.slice() ?? new Int32Array(0),
		regionAdjList: regionAdjList?.slice() ?? new Int32Array(0),
		regionIsLand: regionIsLand?.slice() ?? new Uint8Array(0),
		r_xyz: r_xyz.slice(),
		province_xyz: buildProvinceXyz({ provinceSeeds: provinces.seeds, r_xyz }),
		habitability: population.habitability.slice(),
		culture: cultures.assignment.slice(),
		cultureCount: cultures.count,
		cultureGenderSystems:
			cultures.genderSystems?.slice() ?? new Uint8Array(cultures.count),
		cultureColors: cultures.colors.slice(),
		religion: religions?.assignment.slice() ?? new Int32Array(P).fill(-1),
		religionCount: religions?.count ?? 0,
		religionColors: religions?.colors.slice() ?? new Float32Array(0),
		nationColors: nations.colors.slice(),
		governmentType: nations.governmentType?.slice() ?? new Uint8Array(P),
		wars: [],
		activeWarIds: new Set(),
		events: [],
		journal: [],
		pendingJournal: JOURNAL.pending(),
		people: PEOPLE.create(P),
		heap: new EventHeap(),
		leaderRuntime: {
			idx: new Int32Array(P),
			birth: new Float64Array(P),
			end: new Float64Array(P),
			targetUrban: new Float32Array(P),
			nameSeed: new Int32Array(P).fill(-1),
		},
		routes: [],
		network: [],
		landmarks: landmarks
			? {
					...landmarks,
					regionLandmark: landmarks.regionLandmark.slice(),
					type: landmarks.type.slice(),
					size: landmarks.size.slice(),
				}
			: {
					regionLandmark: new Int32Array(0),
					type: new Uint8Array(0),
					size: new Int32Array(0),
					count: 0,
				},
	}

	for (let p = 0; p < P; p++) {
		if (provinces.desolate[p]) continue
		state.parentCurrent[p] = nations.parent[p]
		FIELDS.prov.parent.set({
			state,
			p,
			value: nations.parent[p],
		})
		FIELDS.prov.assignment.set({
			state,
			p,
			value: nations.sovereign[p],
		})
		FIELDS.prov.population.rural.set({
			state,
			p,
			value: population.population[p] * 0.95,
		})
		FIELDS.prov.population.urban.set({
			state,
			p,
			value: population.population[p] * 0.05,
		})
		FIELDS.prov.development.set({ state, p, value: 0 })
		FIELDS.prov.leader.dynasty.set({ state, p, value: -1 })
		FIELDS.prov.leader.nameSeed.set({ state, p, value: -1 })
		FIELDS.prov.leader.claim.set({ state, p, value: 0 })
		FIELDS.prov.leader.birthYear.set({ state, p, value: -1 })
		FIELDS.prov.occupation.set({ state, p, value: -1 })
	}

	for (let p = 0; p < P; p++) {
		if (provinces.desolate[p]) continue
		if (state.stateless[p]) continue
		if (nations.parent[p] >= 0) continue
		foundRuler({ state, p, age: rulerAge(rng), claim: FOUNDER_CLAIM, rng })
	}
	rebuildAssignment({ state })

	return state
}

const FOUNDER_CLAIM = 3

function rulerAge(rng: SharedRng): number {
	return (
		rng.weightedChoice([
			{ v: rng.uniform(1, 10), w: 1 },
			{ v: rng.uniform(11, 15), w: 2 },
			{ v: rng.uniform(16, 30), w: 5 },
			{ v: rng.uniform(31, 50), w: 4 },
			{ v: rng.uniform(51, 65), w: 1 },
		]) ?? 30
	)
}

function originOf({ state, realm }: OriginOfParams): RealmOrigin {
	const culture = state.culture[realm]
	return {
		realm,
		culture,
		genderSystem: culture >= 0 ? state.cultureGenderSystems[culture] : 0,
	}
}

const UNION_MERGE_GENERATIONS = 3

function unionPartners({ state, p }: UnionRealmParams): number[] {
	const partners: number[] = []
	for (const other of state.relationColumns[p]) {
		const relation = getRelation({ state, a: p, b: other })
		if (relation === rel.PU_SENIOR || relation === rel.PU_JUNIOR)
			partners.push(other)
	}
	return partners
}

function endUnion({ state, junior, senior }: UnionPairParams): void {
	setRelation({ state, a: junior, b: senior, rel: rel.FRIENDLY })
	state.people.unionGenerations.delete(junior)
	state.events.push({
		tag: "personal union ended",
		time: state.time,
		data: { junior, senior },
	})
}

function juniorsOf({ state, p }: UnionRealmParams): number[] {
	return unionPartners({ state, p }).filter(
		(other) => getRelation({ state, a: p, b: other }) === rel.PU_JUNIOR,
	)
}

// A realm that already has a senior (union junior) or an overlord, or that
// leads union juniors, can only be the senior of a new union.
function mustLead({ state, p }: UnionRealmParams): boolean {
	return (
		!!getRulerRelation({ state, nation: p }) ||
		juniorsOf({ state, p }).length > 0
	)
}

function isUnionJunior({ state, p }: UnionRealmParams): boolean {
	return getRulerRelation({ state, nation: p })?.relation === rel.PU_SENIOR
}

// Two realms may enter a union when they are not at war, neither is already a
// union junior, and at most one of them must lead.
function canUnite({ state, a, b }: RealmPairParams): boolean {
	const relation = getRelation({ state, a, b })
	if (relation === rel.PU_SENIOR || relation === rel.PU_JUNIOR) return true
	return (
		relation !== rel.WAR &&
		!isUnionJunior({ state, p: a }) &&
		!isUnionJunior({ state, p: b }) &&
		!(mustLead({ state, p: a }) && mustLead({ state, p: b }))
	)
}

// A partner stays while its living ruler is the same person or that person's
// spouse; a partner whose ruler just died waits for its own succession.
function breakUnions({ state, p, person }: UnionRulerParams): void {
	const people = state.people
	const time = state.time / yearMs
	for (const other of unionPartners({ state, p })) {
		const ruler = people.rulerOf[other]
		if (ruler === person) continue
		if (ruler >= 0 && !PEOPLE.aliveAt({ people, person: ruler, time })) continue
		if (
			ruler >= 0 &&
			people.persons.spouse[person] === ruler &&
			PEOPLE.aliveAt({ people, person, time })
		)
			continue
		const pJunior = getRelation({ state, a: p, b: other }) === rel.PU_SENIOR
		endUnion({
			state,
			junior: pJunior ? p : other,
			senior: pJunior ? other : p,
		})
	}
}

// Links two realms in a personal union, or counts another shared ruler of an
// existing one. The realm that must lead, else the larger, is senior.
function unite({ state, a, b, ruler, shared }: UniteParams): UnionLink {
	const people = state.people
	const relation = getRelation({ state, a, b })
	let senior = a
	let junior = b
	if (relation === rel.PU_SENIOR || relation === rel.PU_JUNIOR) {
		if (relation === rel.PU_SENIOR) {
			senior = b
			junior = a
		}
		const generations =
			(people.unionGenerations.get(junior) ?? 1) + (shared ? 1 : 0)
		people.unionGenerations.set(junior, generations)
		return {
			senior,
			junior,
			merge:
				generations >= UNION_MERGE_GENERATIONS &&
				getNationNeighbors({ state, nation: senior }).includes(junior),
		}
	}
	const leadsA = mustLead({ state, p: a })
	const leadsB = mustLead({ state, p: b })
	if (
		leadsB ||
		(!leadsA &&
			getNationProvinces({ state, root: b }).length >
				getNationProvinces({ state, root: a }).length)
	) {
		senior = b
		junior = a
	}
	setRelation({ state, a: junior, b: senior, rel: rel.PU_JUNIOR })
	people.unionGenerations.set(junior, 1)
	state.events.push({
		tag: "personal union formed",
		time: state.time,
		data: { junior, senior, ruler },
	})
	return { senior, junior, merge: false }
}

// A ruler married to the ruler of another single-heir realm joins the two
// crowns, as with Castile and Aragon.
function uniteCouple({ state, p, person }: UnionRulerParams): void {
	const people = state.people
	const table = people.persons
	const spouse = table.spouse[person]
	if (spouse < 0) return
	if (!PEOPLE.aliveAt({ people, person: spouse, time: state.time / yearMs }))
		return
	const other = table.throne[spouse]
	if (other < 0 || other === p || !isSovereign({ state, p: other })) return
	if (people.rulerOf[other] !== spouse) return
	for (const realm of [p, other])
		if (
			GOVERNMENT.successionOfIndex(state.governmentType[realm]) !==
			"single_heir"
		)
			return
	if (!canUnite({ state, a: p, b: other })) return
	unite({ state, a: p, b: other, ruler: person, shared: false })
}

function mergeUnion({ state, junior, senior }: UnionPairParams): void {
	setRelation({ state, a: junior, b: senior, rel: rel.NEUTRAL })
	state.people.unionGenerations.delete(junior)
	releaseSubjectRelations({ state, nation: junior })
	PEOPLE.vacate({ people: state.people, seat: junior })
	state.events.push({
		tag: "personal union merged",
		time: state.time,
		data: { junior, senior },
	})
	repartitionNation({
		state,
		nation: senior,
		subjects: getNationProvinces({ state, root: junior }),
	})
}

function installRuler({ state, p, person, claim }: InstallRulerParams): void {
	const people = state.people
	const table = people.persons
	const other = table.throne[person]
	breakUnions({ state, p, person })
	PEOPLE.vacate({ people, seat: p })
	let merge = -1
	if (other >= 0 && other !== p && isSovereign({ state, p: other })) {
		const link = unite({ state, a: p, b: other, ruler: person, shared: true })
		PEOPLE.setRuler({ people, seat: p, person })
		table.throne[person] = link.senior
		table.realm[person] = link.senior
		if (link.merge) merge = link.junior
	} else {
		PEOPLE.enthrone({ people, person, seat: p, realm: p })
		uniteCouple({ state, p, person })
	}
	state.leaderRuntime.idx[p]++
	state.leaderRuntime.birth[p] = table.birth[person] * yearMs
	state.leaderRuntime.end[p] = Math.max(
		state.time,
		table.death[person] * yearMs,
	)
	FIELDS.prov.leader.nameSeed.set({ state, p, value: table.nameSeed[person] })
	FIELDS.prov.leader.dynasty.set({ state, p, value: table.dynasty[person] })
	FIELDS.prov.leader.claim.set({ state, p, value: claim })
	FIELDS.prov.leader.birthYear.set({ state, p, value: table.birth[person] })
	if (merge >= 0)
		mergeUnion({ state, junior: merge, senior: table.throne[person] })
}

function foundRuler({ state, p, age, claim, rng }: FoundRulerParams): void {
	const person = FAMILY.found({
		people: state.people,
		origin: originOf({ state, realm: p }),
		time: state.time / yearMs,
		age,
		rng,
	})
	installRuler({ state, p, person, claim })
}

export const STATE = {
	rel,
	getWarAllies,
	yearMs,
	defaultStartYear: DEFAULT_START_YEAR,
	deltaYear,
	deltaMonth,
	diffYears,
	validateLiveHierarchy,
	getRelation,
	setRelation,
	getRulerRelation,
	getSovereign,
	isSovereign,
	getChildren,
	getNationProvinces,
	getNationPopulation,
	getNationNeighbors,
	getProvinceNeighbors,
	releaseProvince,
	fixConnections,
	startWar,
	queueBattleEvent,
	createActiveWar,
	resolveWar,
	provinceDistanceSq,
	createHistoryState,
	originOf,
	installRuler,
	canUnite,
	uniteCouple,
	foundRuler,
	considerTitles,
}
