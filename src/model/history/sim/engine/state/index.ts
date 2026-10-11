import { DERIVE } from "@/model/history/sim/engine/derive"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { EVENT_HEAP, EventHeap } from "@/model/history/sim/engine/event-heap"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import { CORONATION_COUNTERS } from "@/model/history/sim/engine/events/succession/coronation/counters"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { HISTORY_RNG } from "@/model/history/sim/engine/history-rng"
import { JOURNAL } from "@/model/history/sim/engine/journal"
import { MILITARY } from "@/model/history/sim/engine/military"
import { RECRUITMENT } from "@/model/history/sim/engine/military/recruitment"
import { STATE_CLOCK } from "@/model/history/sim/engine/state/clock"
import { STATE_GOVERNMENT } from "@/model/history/sim/engine/state/government"
import {
	getChildren,
	getNationNeighbors,
	getNationPopulation,
	getNationProvinces,
	getProvinceNeighbors,
	occupiedLand,
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
import { STATE_RULERS } from "@/model/history/sim/engine/state/rulers"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type {
	BuildProvinceXyzParams,
	ClearRealmDiplomacyParams,
	CreateActiveWarParams,
	CreateHistoryStateParams,
	DetachJuniorParams,
	EndMarriageAllianceParams,
	EndMarriageTiesParams,
	FixConnectionsParams,
	FoundRulerParams,
	GetWarAlliesParams,
	HistoryState,
	IsProvinceConnectedToParentParams,
	NewRuler,
	ProvinceDistanceSqParams,
	QueueBattleEventParams,
	RealmPairParams,
	ReconcileGovernmentParams,
	RegroupParams,
	ReleaseDisconnectedProvinceParams,
	ReleaseFactionParams,
	ReleaseFactionsParams,
	ReleaseProvinceParams,
	ReleaseSubjectRelationsParams,
	RepartitionNationParams,
	ResolveWarParams,
	SeatRulerParams,
	SeedRulersParams,
	SetDispositionParams,
	SetRelationParams,
	SettleCutOffParams,
	ShareRulerParams,
	StartWarParams,
	UnionLink,
	UnionPairParams,
	UnionRealmParams,
	UniteParams,
	War,
	WarSides,
	WarSidesParams,
} from "@/model/history/sim/engine/state/types"
import { WAR_GOAL } from "@/model/history/sim/engine/state/war-goal"
import { TERRAIN } from "@/model/history/sim/engine/terrain"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { DEJURE } from "@/model/society/dejure"
import { ERAS } from "@/model/society/eras"

const {
	defaultStartYear: DEFAULT_START_YEAR,
	deltaMonth,
	deltaYear,
	diffYears,
	yearMs,
} = STATE_CLOCK
const { isRebel: isRebelGoal } = WAR_GOAL

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

function releaseFactions({ state, seats, rng }: ReleaseFactionsParams): void {
	const releases = seats.map(({ p, supporters, ruler }) => {
		const formerSovereign = getSovereign({ state, p })
		const supportingSeats = [...new Set(supporters)].filter(
			(seat) =>
				seat !== p &&
				FIELDS.prov.parent.get({ state, p: seat }) === formerSovereign,
		)
		const supportingProvinces = supportingSeats.flatMap((seat) =>
			getNationProvinces({ state, root: seat }),
		)
		const formerPopulation = getNationPopulation({
			state,
			root: formerSovereign,
		})
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
		return {
			p,
			formerSovereign,
			supportingSeats,
			supportingProvinces,
			share,
			government: state.governmentType[formerSovereign],
			ruler,
		}
	})
	const formerRealms = new Set(
		releases.map((release) => release.formerSovereign),
	)
	for (const nation of formerRealms)
		RECRUITMENT.settleOwnership({ state, nation })
	const treasuries = releases.map(
		({ formerSovereign, share }) =>
			Math.max(0, FIELDS.prov.treasury.get({ state, p: formerSovereign })) *
			share,
	)
	for (const [
		index,
		{ p, formerSovereign, supportingSeats },
	] of releases.entries()) {
		const treasury = treasuries[index]
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
		for (const seat of supportingSeats)
			FIELDS.prov.parent.set({ state, p: seat, value: p })
	}
	rebuildAssignment({ state })
	for (const nation of formerRealms)
		repartitionNation({ state, nation, subjects: [] })
	for (const { p, supportingProvinces } of releases)
		repartitionNation({ state, nation: p, subjects: supportingProvinces })
	for (const nation of formerRealms) RECRUITMENT.reconstitute({ state, nation })
	for (const { p, government, ruler } of releases) {
		const from = ERAS.governmentTypes[state.governmentType[p]]
		FIELDS.prov.government.set({ state, p, value: government })
		if (from !== ERAS.governmentTypes[government])
			state.events.push({
				tag: "government change",
				time: state.time,
				data: {
					nation: p,
					from,
					to: ERAS.governmentTypes[government],
					cause: "inherited",
				},
			})
		const transition = STATE_GOVERNMENT.found({
			state,
			realm: p,
			provinces: getNationProvinces({ state, root: p }),
			rng,
		})
		RECRUITMENT.reconstitute({ state, nation: p })
		clearRealmDiplomacy({ state, nation: p })
		foundRuler({ state, p, ruler, rng })
		reconcileGovernment({ state, realm: p, transition, rng })
	}
}

function releaseFaction({
	state,
	p,
	supporters,
	ruler,
	rng,
}: ReleaseFactionParams): void {
	releaseFactions({ state, seats: [{ p, supporters, ruler }], rng })
}

function releaseProvince(params: ReleaseProvinceParams): void {
	releaseFaction({
		...params,
		supporters: [],
		ruler: params.ruler ?? NEW_HOUSE,
	})
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
		state.unionGenerations.delete(p)
		STATE_RULERS.clear({ state, p })
		state.events.push({
			tag: "ruler deposed",
			time: state.time,
			data: { nation: p, leader: state.leaderRuntime.idx[p] - 1 },
		})
	}
	STATE_TITLES.applyDerivedParents({ state, nation, members })
	rebuildAssignment({ state })
	STATE_TITLES.settleProvinces({ state, provinces: members })
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
	const orphans = new Map<number, number>()
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
				data: { junior: other, senior: nation },
			})
			orphans.set(other, state.unionGenerations.get(other) ?? 1)
			continue
		}

		if (relation === rel.PU_SENIOR) {
			setRelation({ state, a: nation, b: other, rel: rel.NONE })
			state.events.push({
				tag: "personal union ended",
				time: state.time,
				data: { junior: nation, senior: other },
			})
		}
	}
	regroup({ state, generations: orphans })
}

// Juniors that just lost their senior and still share one ruler stay together
// under the largest of them, keeping their generation counts; one left alone
// keeps that ruler on its own throne.
function regroup({ state, generations }: RegroupParams): void {
	const byRuler = new Map<number, number[]>()
	for (const realm of generations.keys()) {
		if (
			!isSovereign({ state, p: realm }) ||
			!STATE_RULERS.has({ state, p: realm })
		)
			continue
		const ruler = state.leaderRuntime.rulerId[realm]
		const group = byRuler.get(ruler)
		if (group) group.push(realm)
		else byRuler.set(ruler, [realm])
	}
	for (const [ruler, group] of byRuler) {
		const sizes = new Map(
			group.map((p) => [p, getNationProvinces({ state, root: p }).length]),
		)
		const senior = [...group].sort(
			(x, y) =>
				Number(mustLead({ state, p: y })) - Number(mustLead({ state, p: x })) ||
				sizes.get(y)! - sizes.get(x)! ||
				x - y,
		)[0]
		state.unionGenerations.delete(senior)
		const juniors = group.filter((p) => p !== senior)
		for (const junior of juniors) {
			setRelation({ state, a: junior, b: senior, rel: rel.PU_JUNIOR })
			state.unionGenerations.set(junior, generations.get(junior) ?? 1)
		}
		STATE_RULERS.reschedule({ state, p: senior })
		if (juniors.length > 0)
			state.events.push({
				tag: "personal union continued",
				time: state.time,
				data: { senior, juniors, ruler },
			})
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

// A realm that takes land in a peace also takes the districts that land cut
// off from the loser's capital, when they border it; other cut-off districts
// are released as usual.
function settleCutOff({
	state,
	nation,
	other,
	rng,
}: SettleCutOffParams): number[] {
	const joined: number[] = []
	let moved = true
	while (moved) {
		moved = false
		for (const subject of getChildren({ state, p: nation })) {
			if (isProvinceConnectedToParent({ state, province: subject })) continue
			const provinces = getNationProvinces({ state, root: subject })
			if (
				!provinces.some((p) =>
					getProvinceNeighbors({ state, p }).some(
						(nb) => state.sovereignCurrent[nb] === other,
					),
				)
			)
				continue
			for (const p of provinces)
				if (state.occupationCurrent[p] >= 0)
					FIELDS.prov.occupation.set({ state, p, value: -1 })
			repartitionNation({ state, nation: other, subjects: provinces })
			repartitionNation({ state, nation, subjects: [] })
			joined.push(...provinces)
			moved = true
			break
		}
	}
	fixConnections({ state, nation, rng })
	return joined
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
	const war = createActiveWar({
		state,
		attacker,
		defender,
		rng,
		options: { goal },
	})
	return war
}

function isPressing({ state, p }: UnionRealmParams): boolean {
	return DERIVE.provinceWars({ state, p }).some((idx) => {
		const war = state.wars[idx]
		return (
			war.endTime === undefined &&
			war.attacker === p &&
			(war.goal === "throne" || war.goal === "claim")
		)
	})
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
			options.goal === "throne" || options.goal === "claim"
				? state.leaderRuntime.rulerId[defender]
				: -1,
		claimantRuler:
			options.goal === "claim" ? state.leaderRuntime.rulerId[attacker] : -1,
		siege: null,
		deployed: {},
		participants: {},
		candidates: { attacker: [], defender: [] },
		callable: { attacker: [], defender: [] },
		candidatesHierarchyVersion: -1,
		allocation: {},
		occupied: [],
		battleScore: 0,
		dealConsidered: false,
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
	heritages,
	religions,
	religionGender,
	startYear,
	seed,
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
		districtSeat: new Uint8Array(P),
		coronationOwed: new Int32Array(P).fill(-1),
		compositeRealm: new Uint8Array(P),
		districtRank: new Uint8Array(P),
		topTier: new Uint8Array(P),
		duchyGap: new Uint8Array(P),
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
		knowledgeSpinUp: { origin: 0, years: 0 },
		censusVersion: 0,
		realmCache: new Map(),
		electionStreaks: new Map(),
		provinceEconomyCache: {
			capital: new Int32Array(P).fill(-1),
			distanceMultiplier: new Float64Array(P),
			development: new Float64Array(P).fill(Number.NaN),
			developmentFactor: new Float64Array(P),
			knowledge: new Float64Array(P).fill(Number.NaN),
			knowledgeFactor: new Float64Array(P),
		},
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
		militaryDiplomacyNations: new Set(),
		militaryCandidatesRefresh: { hierarchyVersion: -1, wars: 0 },
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
		marriageTies: new Map(),
		unionGenerations: new Map(),
		dynastyOrigin: new Map(),
		rulerSequence: { nextRuler: 0, nextDynasty: 0 },
		regency: new Uint8Array(P),
		coronations: CORONATION_COUNTERS.create(),
		heritageOfCulture:
			heritages?.assignment.slice() ?? new Int32Array(cultures.count).fill(-1),
		cultureGenderSystems:
			cultures.genderSystems?.slice() ?? new Uint8Array(cultures.count),
		cultureColors: cultures.colors.slice(),
		religion: religions?.assignment.slice() ?? new Int32Array(P).fill(-1),
		religionCount: religions?.count ?? 0,
		religionGender:
			religionGender?.slice() ?? new Uint8Array(religions?.count ?? 0),
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
		heap: new EventHeap(),
		leaderRuntime: {
			idx: new Int32Array(P),
			birth: new Float64Array(P),
			targetUrban: new Float32Array(P),
			nameSeed: new Int32Array(P).fill(-1),
			rulerId: new Int32Array(P).fill(-1),
			nameOrigin: new Int32Array(P).fill(-1),
			sex: new Uint8Array(P),
			death: new Float64Array(P),
		},
		roads: null,
		roadsLastBatchTime: 0,
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
		FIELDS.prov.parent.set({ state, p, value: nations.parent[p] })
		FIELDS.prov.assignment.set({ state, p, value: nations.sovereign[p] })
		FIELDS.prov.development.set({ state, p, value: 0 })
		FIELDS.prov.leader.dynasty.set({ state, p, value: -1 })
		FIELDS.prov.leader.nameSeed.set({ state, p, value: -1 })
		FIELDS.prov.leader.claim.set({ state, p, value: 0 })
		FIELDS.prov.leader.birthYear.set({ state, p, value: -1 })
		FIELDS.prov.occupation.set({ state, p, value: -1 })
	}

	rebuildAssignment({ state })
	for (const nation of new Set(state.sovereignCurrent)) {
		if (nation < 0 || state.sovereignCurrent[nation] !== nation) continue
		STATE_TITLES.applyDerivedParents({
			state,
			nation,
			members: getNationProvinces({ state, root: nation }).filter(
				(p) => !state.desolate[p],
			),
		})
	}
	rebuildAssignment({ state })
	seedRulers({ state, rng: HISTORY_RNG.createHistoryRng(seed + 7331) })

	return state
}

const FOUNDER_CLAIM = 3
const UNION_ENDED_CLAIM = 2
const UNION_MERGE_GENERATIONS = 3
// Share of starting sovereigns that adopt the house of a bordering realm:
// 226 of 1,002 sovereigns shared a dynasty with a neighbour on the person
// model, and an adopter and its donor both count, so s = f / (2 - f).
const DYNASTY_SEED_CHANCE = 0.13
const NEW_HOUSE: NewRuler = { dynasty: -1, age: "fresh", claim: FOUNDER_CLAIM }

function unionPartners({ state, p }: UnionRealmParams): number[] {
	const partners: number[] = []
	for (const other of state.relationColumns[p]) {
		const relation = getRelation({ state, a: p, b: other })
		if (relation === rel.PU_SENIOR || relation === rel.PU_JUNIOR)
			partners.push(other)
	}
	return partners
}

function endMarriageAlliance({ state, key }: EndMarriageAllianceParams): void {
	const binding = state.marriageTies.get(key)
	if (!binding) return
	state.marriageTies.delete(key)
	state.events.push({
		tag: "marriage alliance ended",
		time: state.time,
		data: { first: binding.first, second: binding.second },
	})
}

function endMarriageTies({ state, realm }: EndMarriageTiesParams): void {
	for (const [key, tie] of [...state.marriageTies])
		if (tie.first === realm || tie.second === realm)
			endMarriageAlliance({ state, key })
}

function reconcileGovernment({
	state,
	realm,
	rng,
}: ReconcileGovernmentParams): void {
	const government = state.governmentType[realm]
	if (GOVERNMENT.successionOfIndex(government) !== "single_heir") {
		const senior = seniorOf({ state, p: realm })
		if (senior >= 0) detachJunior({ state, junior: realm, senior, rng })
		else
			for (const junior of juniorsOf({ state, p: realm }))
				detachJunior({ state, junior, senior: realm, rng })
	}
	if (!GOVERNMENT.marriageAlliancesOfIndex(government))
		endMarriageTies({ state, realm })
}

function endUnion({ state, junior, senior }: UnionPairParams): void {
	setRelation({ state, a: junior, b: senior, rel: rel.NONE })
	if (getDisposition({ state, a: junior, b: senior }) === disp.TRUSTED)
		setDisposition({ state, a: junior, b: senior, disposition: disp.FRIENDLY })
	state.unionGenerations.delete(junior)
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

function seniorOf({ state, p }: UnionRealmParams): number {
	return (
		unionPartners({ state, p }).find(
			(other) => getRelation({ state, a: p, b: other }) === rel.PU_SENIOR,
		) ?? -1
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

function unionAllowed({ state, a, b }: RealmPairParams): boolean {
	return (
		GOVERNMENT.successionOfIndex(state.governmentType[a]) === "single_heir" &&
		GOVERNMENT.successionOfIndex(state.governmentType[b]) === "single_heir" &&
		!isUnionJunior({ state, p: a }) &&
		!isUnionJunior({ state, p: b }) &&
		!(mustLead({ state, p: a }) && mustLead({ state, p: b }))
	)
}

function isLinked({ state, a, b }: RealmPairParams): boolean {
	const relation = getRelation({ state, a, b })
	return relation === rel.PU_SENIOR || relation === rel.PU_JUNIOR
}

// Two single-heir realms may enter a union when they are not at war, neither is
// already a union junior, and at most one of them must lead.
function canUnite({ state, a, b }: RealmPairParams): boolean {
	if (isLinked({ state, a, b })) return true
	return (
		getRelation({ state, a, b }) !== rel.WAR && unionAllowed({ state, a, b })
	)
}

function canUniteAfterWar({ state, a, b }: RealmPairParams): boolean {
	return isLinked({ state, a, b }) || unionAllowed({ state, a, b })
}

// Gives the ruler to the senior and every junior that does not already have
// them. Only the senior holds the succession event, and a minority regency
// follows each realm's own copy of the birth date.
function shareRuler({ state, senior, ruler, claim }: ShareRulerParams): void {
	for (const p of [senior, ...juniorsOf({ state, p: senior })]) {
		if (state.leaderRuntime.rulerId[p] === ruler.rulerId) continue
		endMarriageTies({ state, realm: p })
		STATE_RULERS.write({ state, p, ruler, claim })
		STATE_RULERS.startRegency({ state, p })
		if (p === senior) STATE_RULERS.enqueueSuccession({ state, p })
	}
}

// A junior leaving its union gets a ruler of the shared house of its own.
function detachJunior({
	state,
	junior,
	senior,
	rng,
}: DetachJuniorParams): void {
	const dynasty = state.leaderDynCurrent[senior]
	endUnion({ state, junior, senior })
	shareRuler({
		state,
		senior: junior,
		ruler: STATE_RULERS.draw({
			state,
			p: junior,
			dynasty,
			age: "inherited",
			rng,
		}),
		claim: UNION_ENDED_CLAIM,
	})
}

function mergeUnion({ state, junior, senior }: UnionPairParams): void {
	setRelation({ state, a: junior, b: senior, rel: rel.NONE })
	state.unionGenerations.delete(junior)
	releaseSubjectRelations({ state, nation: junior })
	STATE_RULERS.clear({ state, p: junior })
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

// Each junior counts another reign of the shared house and the adjacent
// ones merge into their senior after enough of them.
function advanceUnion({ state, p }: UnionRealmParams): void {
	for (const junior of juniorsOf({ state, p })) {
		const generations = (state.unionGenerations.get(junior) ?? 1) + 1
		state.unionGenerations.set(junior, generations)
		if (
			generations >= UNION_MERGE_GENERATIONS &&
			getNationNeighbors({ state, nation: p }).includes(junior)
		)
			mergeUnion({ state, junior, senior: p })
	}
}

// Replaces the realm's ruler. A union junior leaves its union first; a senior
// keeps its juniors only when the new ruler is of the same house, and
// natural successions count toward a merge.
function seatRuler({
	state,
	p,
	ruler,
	claim,
	natural,
	rng,
}: SeatRulerParams): void {
	const senior = seniorOf({ state, p })
	if (senior >= 0) endUnion({ state, junior: p, senior })
	const juniors = juniorsOf({ state, p })
	const keep = juniors.length > 0 && state.leaderDynCurrent[p] === ruler.dynasty
	if (!keep)
		for (const junior of juniors)
			detachJunior({ state, junior, senior: p, rng })
	shareRuler({ state, senior: p, ruler, claim })
	if (keep && natural) advanceUnion({ state, p })
}

function foundRuler({ state, p, ruler, rng }: FoundRulerParams): void {
	seatRuler({
		state,
		p,
		ruler: STATE_RULERS.draw({
			state,
			p,
			dynasty: ruler.dynasty,
			age: ruler.age,
			rng,
		}),
		claim: ruler.claim,
		natural: false,
		rng,
	})
}

// Links two realms in a personal union under the one that must lead, else the
// larger, and gives the whole group the living ruler.
function unite({ state, a, b, ruler, claim, rng }: UniteParams): UnionLink {
	const leadsA = mustLead({ state, p: a })
	const leadsB = mustLead({ state, p: b })
	let senior = a
	let junior = b
	if (
		leadsB ||
		(!leadsA &&
			getNationProvinces({ state, root: b }).length >
				getNationProvinces({ state, root: a }).length)
	) {
		senior = b
		junior = a
	}
	const sharedClaim = senior === a ? claim : state.leaderClaimCurrent[senior]
	if (state.leaderRuntime.rulerId[senior] !== ruler.rulerId)
		seatRuler({
			state,
			p: senior,
			ruler,
			claim: sharedClaim,
			natural: false,
			rng,
		})
	setRelation({ state, a: junior, b: senior, rel: rel.PU_JUNIOR })
	state.unionGenerations.set(junior, 1)
	state.events.push({
		tag: "personal union formed",
		time: state.time,
		data: { junior, senior, ruler: ruler.rulerId },
	})
	shareRuler({ state, senior, ruler, claim: sharedClaim })
	return { senior, junior }
}

// Starting sovereigns take a new house each, except that some adopt the house
// of a bordering sovereign seated before them.
function seedRulers({ state, rng }: SeedRulersParams): void {
	const realms: number[] = []
	for (let p = 0; p < state.P; p++)
		if (isSovereign({ state, p }) && !state.stateless[p] && !state.desolate[p])
			realms.push(p)
	const seated = new Map<number, number>()
	for (const p of rng.shuffle(realms)) {
		const donors = [
			...new Set(getNationNeighbors({ state, nation: p })),
		].filter((other) => seated.has(other))
		const adopt = donors.length > 0 && rng.random() < DYNASTY_SEED_CHANCE
		const ruler = STATE_RULERS.draw({
			state,
			p,
			dynasty: adopt ? (seated.get(rng.choice(donors)) as number) : -1,
			age: "fresh",
			rng,
		})
		seated.set(p, ruler.dynasty)
		shareRuler({ state, senior: p, ruler, claim: FOUNDER_CLAIM })
	}
}

export const STATE = {
	reconcileGovernment,
	endMarriageAlliance,
	endMarriageTies,
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
	occupiedLand,
	getNationPopulation,
	getNationNeighbors,
	getProvinceNeighbors,
	releaseProvince: (params: ReleaseProvinceParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => releaseProvince(params),
		}),
	releaseFactions: (params: ReleaseFactionsParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => releaseFactions(params),
		}),
	releaseFaction: (params: ReleaseFactionParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => releaseFaction(params),
		}),
	isConnectedToParent: isProvinceConnectedToParent,
	fixConnections: (params: FixConnectionsParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => fixConnections(params),
		}),
	settleCutOff: (params: SettleCutOffParams) =>
		MILITARY.mutate({
			state: params.state,
			action: () => settleCutOff(params),
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
	seatRuler: (params: SeatRulerParams) =>
		MILITARY.mutate({ state: params.state, action: () => seatRuler(params) }),
	foundRuler: (params: FoundRulerParams) =>
		MILITARY.mutate({ state: params.state, action: () => foundRuler(params) }),
	newHouse: NEW_HOUSE,
	founderClaim: FOUNDER_CLAIM,
	canUnite,
	canUniteAfterWar,
	isRebelGoal,
	isPressing,
	isUnionJunior,
	juniorsOf,
	seniorOf,
	unite: (params: UniteParams) =>
		MILITARY.mutate({ state: params.state, action: () => unite(params) }),
}
