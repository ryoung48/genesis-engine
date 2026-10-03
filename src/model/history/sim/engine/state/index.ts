import { DERIVE } from "@/model/history/sim/engine/derive"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { EVENT_HEAP, EventHeap } from "@/model/history/sim/engine/event-heap"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { MILITARY } from "@/model/history/sim/engine/military"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
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
	canAlly,
	diplomaticOverlord,
	getDisposition,
	getRelation,
	getRulerRelation,
	getSovereign,
	isSovereign,
	setDisposition,
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
	ClearRealmDiplomacyParams,
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
	ReleaseFactionParams,
	ReleaseProvinceParams,
	ReleaseSubjectRelationsParams,
	RepartitionNationParams,
	ResolveWarParams,
	ScheduleSuccessionParams,
	SetDispositionParams,
	SetRelationParams,
	StartWarParams,
	UnionLink,
	UnionPairParams,
	UnionRealmParams,
	UnionRulerParams,
	UniteParams,
	War,
	WarSides,
	WarSidesParams,
} from "@/model/history/sim/engine/state/types"
import { TERRAIN } from "@/model/history/sim/engine/terrain"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"
import { FAMILY } from "@/model/history/sim/people/family"
import type { RealmOrigin } from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"
import { DEJURE } from "@/model/society/dejure"

export const rel = {
	NONE: "NONE",
	OVERLORD: "OVERLORD",
	VASSAL: "VASSAL",
	PU_SENIOR: "PU_SENIOR",
	PU_JUNIOR: "PU_JUNIOR",
	ALLY: "ALLY",
	WAR: "WAR",
	COLONY: "COLONY",
} as const

export const disp = {
	RIVAL: "RIVAL",
	SUSPICIOUS: "SUSPICIOUS",
	NEUTRAL: "NEUTRAL",
	FRIENDLY: "FRIENDLY",
	TRUSTED: "TRUSTED",
} as const
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
	const allies: number[] = []
	DERIVE.ensureHierarchyClean(state)
	const candidates: number[] = []
	for (const i of state.relationColumns[nation]) {
		if (i === nation || i === target) continue
		const tie = getRelation({ state, a: nation, b: i })
		if (
			tie !== rel.OVERLORD &&
			tie !== rel.VASSAL &&
			tie !== rel.PU_SENIOR &&
			tie !== rel.PU_JUNIOR &&
			!(type === "defensive" && tie === rel.ALLY)
		)
			continue
		candidates.push(i)
	}
	candidates.sort((a, b) => a - b)
	for (const i of candidates) {
		if (
			state.desolate[i] ||
			state.parentCurrent[i] >= 0 ||
			state.sovereignCurrent[i] < 0
		)
			continue
		// Nobody fights its own ally or the realm that rules it.
		const towardTarget = getRelation({ state, a: i, b: target })
		if (
			towardTarget === rel.ALLY ||
			towardTarget === rel.OVERLORD ||
			towardTarget === rel.PU_SENIOR
		)
			continue
		allies.push(i)
	}
	return allies
}

function releaseFaction({
	state,
	p,
	rng,
	reason,
	supporters,
}: ReleaseFactionParams): void {
	const formerSovereign = getSovereign({ state, p })
	const supportingProvinces = [...new Set(supporters)]
		.filter(
			(seat) =>
				seat !== p &&
				FIELDS.prov.parent.get({ state, p: seat }) === formerSovereign,
		)
		.flatMap((seat) => getNationProvinces({ state, root: seat }))
	const formerPopulation = getNationPopulation({ state, root: formerSovereign })
	const share =
		formerPopulation > 0
			? (getNationPopulation({ state, root: p }) +
					supportingProvinces.reduce(
						(sum, province) =>
							sum +
							state.popRuralCurrent[province] +
							state.popUrbanCurrent[province],
						0,
					)) /
				formerPopulation
			: 0
	RECRUITMENT.settleOwnership({ state, nation: formerSovereign })
	const treasury =
		Math.max(0, FIELDS.prov.treasury.get({ state, p: formerSovereign })) * share
	FIELDS.prov.treasury.set({ state, p, value: treasury })
	const releasedBudget = TREASURY_BUDGET.get({ state, p })
	releasedBudget.succession += treasury
	releasedBudget.otherChangesTotal += treasury
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
	repartitionNation({ state, nation: p, subjects: supportingProvinces })
	RECRUITMENT.reconstitute({ state, nation: formerSovereign })
	RECRUITMENT.reconstitute({ state, nation: p })
	clearRealmDiplomacy({ state, nation: p })
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
		installRuler({ state, p, person: vassal, claim: FOUNDER_CLAIM, reason })
	else
		foundRuler({
			state,
			p,
			age: rulerAge(rng),
			claim: FOUNDER_CLAIM,
			rng,
			reason,
		})
	scheduleSuccession({ state, p })
}

function releaseProvince(params: ReleaseProvinceParams): void {
	releaseFaction({ ...params, supporters: [] })
}

// Schedules the ruler's succession at their death.
function scheduleSuccession({ state, p }: ScheduleSuccessionParams): void {
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
	releaseProvince({ state, p: province, rng, reason: "territorial change" })
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
	for (const root of new Set([
		nation,
		...subjects.map((p) => getSovereign({ state, p })),
	]))
		if (root >= 0) {
			MILITARY.beforeMutation({ state, nation: root })
			if (state.militaryReady)
				RECRUITMENT.settleOwnership({ state, nation: root })
		}
	const absorbed = subjects.filter(
		(p) => p !== nation && isSovereign({ state, p }),
	)
	const members = Array.from(
		new Set(
			[...subjects, ...getNationProvinces({ state, root: nation })].filter(
				(p) => !state.desolate[p],
			),
		),
	)
	if (members.length === 0) return
	for (const root of absorbed)
		if (state.militaryReady) RECRUITMENT.disband({ state, nation: root })
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
	for (const subject of absorbed)
		if (!isSovereign({ state, p: subject }))
			clearRealmDiplomacy({ state, nation: subject })
}

function clearRealmDiplomacy({
	state,
	nation,
}: ClearRealmDiplomacyParams): void {
	for (const other of [...state.relationColumns[nation]]) {
		if (other === nation) continue
		if (getRelation({ state, a: nation, b: other }) !== rel.WAR)
			setRelation({ state, a: nation, b: other, rel: rel.NONE })
		setDisposition({ state, a: nation, b: other, disposition: disp.NEUTRAL })
	}
}

function releaseSubjectRelations({
	state,
	nation,
}: ReleaseSubjectRelationsParams): void {
	for (let other = 0; other < state.P; other++) {
		if (other === nation || state.desolate[other]) continue
		const relation = getRelation({ state, a: nation, b: other })
		if (relation === rel.NONE || relation === rel.WAR) continue

		if (relation === rel.VASSAL) {
			setRelation({ state, a: nation, b: other, rel: rel.NONE })
			state.events.push({
				tag: "vassalage ended",
				time: state.time,
				data: { vassal: nation, overlord: other },
			})
			continue
		}

		if (relation === rel.OVERLORD) {
			setRelation({ state, a: nation, b: other, rel: rel.NONE })
			state.events.push({
				tag: "vassalage ended",
				time: state.time,
				data: { vassal: other, overlord: nation },
			})
			continue
		}

		if (relation === rel.PU_JUNIOR) {
			setRelation({ state, a: nation, b: other, rel: rel.NONE })
			state.events.push({
				tag: "personal union ended",
				time: state.time,
				data: { junior: nation, senior: other },
			})
			continue
		}

		if (relation === rel.PU_SENIOR) {
			setRelation({ state, a: nation, b: other, rel: rel.NONE })
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
	goal,
}: StartWarParams): War | null {
	if (
		DERIVE.provinceWars({ state, p: attacker }).some((idx) => {
			const war = state.wars[idx]
			return war.endTime === undefined && war.defender === attacker
		})
	)
		return null
	return createActiveWar({ state, attacker, defender, rng, options: { goal } })
}

function warSides({ war }: WarSidesParams): WarSides {
	if (war.goal === "throne")
		return { rebels: war.attacker, crown: war.defender }
	if (war.goal === "independence")
		return { rebels: war.defender, crown: war.attacker }
	return { rebels: -1, crown: -1 }
}

function queueBattleEvent({
	state,
	warIdx,
	attacker,
	time,
}: QueueBattleEventParams): void {
	state.heap.enqueue(time, EVENT_HEAP.evt.BATTLE, warIdx, attacker)
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
		goal: options.goal ?? "conquest",
		backers: [],
		refusedCalls: new Set(),
		originalCrownRuler:
			options.goal === "throne" ? state.people.rulerOf[defender] : -1,
		siege: null,
		deployed: {},
		participants: {},
		candidates: { attacker: [], defender: [] },
		callable: { attacker: [], defender: [] },
		candidatesHierarchyVersion: -1,
		allocation: {},
		occupied: [],
		allies: new Set(),
	}
	state.wars.push(war)
	state.activeWarIds.add(war.idx)
	state.militaryDiplomacyDirty = true
	state.provinceWars[attacker].push(war.idx)
	state.provinceWars[defender].push(war.idx)
	setRelation({
		state,
		a: attacker,
		b: defender,
		rel: rel.WAR,
	})
	if (startTime < state.time) {
		setRelation({
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
		time: options.nextBattleTime ?? state.time + deltaMonth(rng.uniform(1, 4)),
	})
	return war
}

function resolveWar({
	state,
	war,
	transferred,
	receiver,
}: ResolveWarParams): void {
	SIEGE.end({ state, war, outcome: "lifted", reason: "war ended" })
	for (const nation of Object.keys(war.participants).map(Number)) {
		MILITARY.beforeMutation({ state, nation })
		state.militaryAllocationDirty.add(nation)
	}
	war.endTime = state.time
	state.activeWarIds.delete(war.idx)
	state.militaryDiplomacyDirty = true
	war.participants = {}
	war.deployed = {}
	war.allocation = {}

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

	if (transferred.length > 0) {
		repartitionNation({
			state,
			nation: receiver,
			subjects: transferred,
		})
		const loser = receiver === war.attacker ? war.defender : war.attacker
		if (isSovereign({ state, p: loser }))
			repartitionNation({ state, nation: loser, subjects: [] })
	}
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
	planetRadiusKm,
	topography,
	vegetation,
}: CreateHistoryStateParams): HistoryState {
	const P = provinces.count
	const terrain = TERRAIN.provinceTerrain({
		topography,
		vegetation,
		seeds: provinces.seeds,
	})
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
	const riverByProvince = new Uint8Array(P)
	for (let r = 0; r < provinces.regionProvince.length; r++) {
		const p = provinces.regionProvince[r]
		if (p >= 0 && riverVisible[r]) riverByProvince[p] = 1
	}
	const state: HistoryState = {
		riverByProvince,
		P,
		time: startTime,
		era,
		parentCurrent: new Int32Array(P).fill(-1),
		childOffset: new Int32Array(P + 1),
		childList: new Int32Array(0),
		sovereignCurrent: new Int32Array(P).fill(-1),
		relationsCurrent: new Uint8Array(P * P),
		dispositionsCurrent: new Uint8Array(P * P).fill(2),
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
		levyCurrent: new Float64Array(P),
		regularCurrent: new Float64Array(P),
		militaryIntervals: new Map(),
		militaryAssignments: new Map(),
		militaryTotals: {
			recruited: { levy: 0, regular: 0 },
			casualties: { levy: 0, regular: 0 },
			demobilized: { levy: 0, regular: 0 },
			settled: { levy: 0, regular: 0 },
			levyReplacementsAtWar: 0,
			fiscalDiscrepancy: 0,
		},
		militaryDirty: new Set(),
		militaryAllocationDirty: new Set(),
		militaryStrengthDirty: new Set(),
		militaryReady: false,
		militaryDepth: 0,
		militaryTouched: new Set(),
		militaryWarIndex: new Map(),
		militaryWarIndexStale: true,
		militaryDiplomacyDirty: false,
		armySizeCurrent: new Float64Array(P),
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
		planetRadiusKm,
		provinceTopography: terrain.topography,
		provinceVegetation: terrain.vegetation,
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
		truces: new Map(),
		indemnities: [],
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
		foundRuler({
			state,
			p,
			age: rulerAge(rng),
			claim: FOUNDER_CLAIM,
			rng,
			reason: "unknown",
		})
	}
	rebuildAssignment({ state })

	return state
}

const FOUNDER_CLAIM = 3

// Children are about as common among starting rulers as among reigning ones
// once successions settle, 4-6%.
function rulerAge(rng: SharedRng): number {
	return (
		rng.weightedChoice([
			{ v: rng.uniform(1, 10), w: 0.4 },
			{ v: rng.uniform(11, 15), w: 0.2 },
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
	setRelation({ state, a: junior, b: senior, rel: rel.NONE })
	if (getDisposition({ state, a: junior, b: senior }) === disp.TRUSTED)
		setDisposition({ state, a: junior, b: senior, disposition: disp.FRIENDLY })
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
		data: { junior, senior, ruler, shared },
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
	setRelation({ state, a: junior, b: senior, rel: rel.NONE })
	state.people.unionGenerations.delete(junior)
	releaseSubjectRelations({ state, nation: junior })
	PEOPLE.vacate({ people: state.people, seat: junior, reason: "union" })
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

function installRuler({
	state,
	p,
	person,
	claim,
	reason,
}: InstallRulerParams): void {
	const people = state.people
	const table = people.persons
	const other = table.throne[person]
	breakUnions({ state, p, person })
	PEOPLE.vacate({ people, seat: p, reason })
	let merge = -1
	if (other >= 0 && other !== p && isSovereign({ state, p: other })) {
		const link = unite({ state, a: p, b: other, ruler: person, shared: true })
		PEOPLE.setRuler({
			people,
			seat: p,
			person,
			rank: state.seatRank[p],
			reason,
		})
		table.throne[person] = link.senior
		table.realm[person] = link.senior
		if (link.merge) merge = link.junior
	} else {
		PEOPLE.enthrone({
			people,
			person,
			seat: p,
			realm: p,
			rank: state.seatRank[p],
			reason,
		})
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

function foundRuler({
	state,
	p,
	age,
	claim,
	rng,
	reason,
}: FoundRulerParams): void {
	const person = FAMILY.found({
		people: state.people,
		origin: originOf({ state, realm: p }),
		time: state.time / yearMs,
		age,
		rank: state.seatRank[p],
		rng,
	})
	installRuler({ state, p, person, claim, reason })
}

export const STATE = {
	rel,
	disp,
	getWarAllies,
	yearMs,
	defaultStartYear: DEFAULT_START_YEAR,
	deltaYear,
	deltaMonth,
	diffYears,
	validateLiveHierarchy,
	getRelation,
	getDisposition,
	setRelation: (params: SetRelationParams) =>
		MILITARY.mutate({ state: params.state, action: () => setRelation(params) }),
	setDisposition: (params: SetDispositionParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => setDisposition(params),
		}),
	canAlly,
	diplomaticOverlord,
	getRulerRelation,
	getSovereign,
	isSovereign,
	getChildren,
	getNationProvinces,
	getNationPopulation,
	getNationNeighbors,
	getProvinceNeighbors,
	releaseProvince: (params: ReleaseProvinceParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => releaseProvince(params),
		}),
	releaseFaction: (params: ReleaseFactionParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => releaseFaction(params),
		}),
	fixConnections: (params: FixConnectionsParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => fixConnections(params),
		}),
	startWar: (params: StartWarParams) =>
		MILITARY.mutate({ state: params.state, action: () => startWar(params) }),
	warSides,
	queueBattleEvent,
	createActiveWar: (params: CreateActiveWarParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => createActiveWar(params),
		}),
	resolveWar: (params: ResolveWarParams) =>
		MILITARY.mutate({ state: params.state, action: () => resolveWar(params) }),
	repartitionNation: (params: RepartitionNationParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => repartitionNation(params),
		}),
	releaseSubjectRelations: (params: ReleaseSubjectRelationsParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => releaseSubjectRelations(params),
		}),
	provinceDistanceSq,
	createHistoryState,
	originOf,
	installRuler: (params: InstallRulerParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => installRuler(params),
		}),
	scheduleSuccession,
	canUnite,
	uniteCouple: (params: UnionRulerParams) =>
		MILITARY.mutate({ state: params.state, action: () => uniteCouple(params) }),
	foundRuler: (params: FoundRulerParams) =>
		MILITARY.mutate({ state: params.state, action: () => foundRuler(params) }),
	considerTitles,
}
