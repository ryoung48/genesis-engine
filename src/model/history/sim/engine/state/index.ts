import { DERIVE } from "@/model/history/sim/engine/derive"
import type { DerivedCache } from "@/model/history/sim/engine/derive/types"
import { EVENT_HEAP, EventHeap } from "@/model/history/sim/engine/event-heap"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import {
	getChildren,
	getNationNeighbors,
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
	GetWarAlliesParams,
	HistoryState,
	InitDynastiesParams,
	IsProvinceConnectedToParentParams,
	ProvinceDistanceSqParams,
	QueueBattleEventParams,
	ReleaseDisconnectedProvinceParams,
	ReleaseProvinceParams,
	ReleaseSubjectRelationsParams,
	RepartitionNationParams,
	ResolveWarParams,
	SpawnLeaderParams,
	StartWarParams,
	War,
	WarStrengthCoalitionParams,
	WarStrengthSoloParams,
	WarThreatParams,
} from "@/model/history/sim/engine/state/types"
import {
	wealthCurrent,
	wealthOptimal,
} from "@/model/history/sim/engine/state/wealth"
import { DEJURE } from "@/model/society/dejure"
import { ERAS } from "@/model/society/eras"

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

const DAYS_PER_YEAR = 365

const DAYS_PER_MONTH = 30

const HOURS_PER_DAY = 24

const DAY_MS = HOURS_PER_DAY * 60 * 60 * 1000

export const yearMs = DAYS_PER_YEAR * DAY_MS

export const MONTH_MS = DAYS_PER_MONTH * DAY_MS

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

function makeDerivedCache(): DerivedCache {
	return {
		gravity: new Map(),
		wealthCurrent: new Map(),
		wealthOptimal: new Map(),
	}
}

function warStrengthSolo({
	state,
	p,
	exclude,
	cache,
}: WarStrengthSoloParams): number {
	const curr = Math.max(
		0.1,
		wealthCurrent({ state, p, exclude, freedom: exclude === p, cache }),
	)
	return curr / (1 + DERIVE.provinceWars({ state, p }).length)
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

function warStrengthCoalition({
	state,
	attacker,
	defender,
	exclude,
	cache,
}: WarStrengthCoalitionParams): { attacker: number; defender: number } {
	const c = cache ?? makeDerivedCache()
	const atkAllies = getWarAllies({
		state,
		nation: attacker,
		type: "offensive",
		target: defender,
	})
	const defAllies = getWarAllies({
		state,
		nation: defender,
		type: "defensive",
		target: attacker,
	})
	let atk = warStrengthSolo({ state, p: attacker, exclude, cache: c })
	let def = warStrengthSolo({ state, p: defender, exclude, cache: c })
	for (const ally of atkAllies)
		atk +=
			warStrengthSolo({ state, p: ally, exclude: undefined, cache: c }) * 0.5
	for (const ally of defAllies)
		def +=
			warStrengthSolo({ state, p: ally, exclude: undefined, cache: c }) * 0.5
	return { attacker: atk, defender: def }
}

function warThreat({
	state,
	attacker,
	defender,
	exclude,
}: WarThreatParams): number {
	const strength = warStrengthCoalition({
		state,
		attacker,
		defender,
		exclude,
		cache: makeDerivedCache(),
	})
	const atk = strength.attacker ** 2
	const def = strength.defender ** 2
	return 1 - atk / (atk + def)
}

function releaseProvince({ state, p, rng }: ReleaseProvinceParams): void {
	const formerSovereign = getSovereign({ state, p })
	FIELDS.prov.parent.set({ state, p, value: -1 })
	rebuildAssignment({ state })
	repartitionNation({ state, nation: formerSovereign, subjects: [] })
	repartitionNation({ state, nation: p, subjects: [] })
	spawnLeader({ state, p, rng })
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
		tag: "rebellion",
		time: state.time,
		data: {
			overlord,
			subject: province,
			disconnected: true,
		},
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
		occupied: [],
	}
	state.wars.push(war)
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
	era = ERAS.defaultEra,
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
		consumptionCurrent: new Float32Array(P),
		consumptionExact: new Float64Array(P),
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
		cultureColors: cultures.colors.slice(),
		religion: religions?.assignment.slice() ?? new Int32Array(P).fill(-1),
		religionCount: religions?.count ?? 0,
		religionColors: religions?.colors.slice() ?? new Float32Array(0),
		nationColors: nations.colors.slice(),
		governmentType: nations.governmentType?.slice() ?? new Uint8Array(P),
		wars: [],
		events: [],
		journal: [],
		pendingJournal: JOURNAL.pending(),
		nextDynasty: 0,
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
		FIELDS.prov.consumption.set({ state, p, value: 0 })
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
		spawnLeader({ state, p, rng })
	}
	initDynasties({ state, rng })
	rebuildAssignment({ state })

	return state
}

function spawnLeader({ state, p, rng, end }: SpawnLeaderParams): void {
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
	FIELDS.prov.leader.nameSeed.set({
		state,
		p,
		value: rng.randint(1, 0x7fffffff),
	})
	FIELDS.prov.leader.claim.set({ state, p, value: 3 })
	FIELDS.prov.leader.birthYear.set({
		state,
		p,
		value: state.leaderRuntime.birth[p] / yearMs,
	})
}

function initDynasties({ state, rng }: InitDynastiesParams): void {
	const shuffled = rng.shuffle(
		Array.from({ length: state.P }, (_, i) => i).filter(
			(p) =>
				!state.desolate[p] && !state.stateless[p] && state.parentCurrent[p] < 0,
		),
	)
	for (const p of shuffled) {
		if (FIELDS.prov.leader.dynasty.get({ state, p }) >= 0) continue
		const sameCulture: Array<{ dynasty: number; source: number }> = []
		const other: Array<{ dynasty: number; source: number }> = []
		const currentSovereign = (province: number): number => {
			let current = province
			while (state.parentCurrent[current] >= 0) {
				current = state.parentCurrent[current]
			}
			return current
		}
		for (const nb of getProvinceNeighbors({ state, p })) {
			const dynasty = FIELDS.prov.leader.dynasty.get({
				state,
				p: nb,
			})
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
		FIELDS.prov.leader.dynasty.set({
			state,
			p,
			value: dynasty,
		})
		if (
			source >= 0 &&
			source !== p &&
			dynasty >= 0 &&
			isSovereign({ state, p })
		) {
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

export const STATE = {
	rel,
	getWarAllies,
	yearMs,
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
	getNationNeighbors,
	getProvinceNeighbors,
	wealthOptimal,
	warStrengthSolo,
	warThreat,
	releaseProvince,
	fixConnections,
	startWar,
	queueBattleEvent,
	createActiveWar,
	resolveWar,
	provinceDistanceSq,
	createHistoryState,
	spawnLeader,
	considerTitles,
}
