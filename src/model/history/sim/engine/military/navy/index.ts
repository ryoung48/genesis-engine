import { ECONOMY } from "@/model/history/sim/engine/economy"
import type {
	CommitParams,
	CrewParams,
	ExposureOfParams,
	InitializeParams,
	LoseParams,
	NationParams,
	NavalCoalition,
	NavalCoalitionParams,
	NavalExposure,
	NavalExposureCacheEntry,
	PortCountParams,
	ReachParams,
	RefreshParams,
	ReleaseParams,
	ShareParams,
	ShipYearsParams,
	SplitParams,
} from "@/model/history/sim/engine/military/navy/types"
import { RECOVERY } from "@/model/history/sim/engine/military/recovery"
import { STATE } from "@/model/history/sim/engine/state"
import type { RealmCacheEntry } from "@/model/history/sim/engine/state/types"
import { MATH } from "@/model/shared/math/core"

const CREW = { domain: [0.42, 1, 1.44, 2.38], range: [60, 200, 250, 375] }
const NAVAL_SHARE_CAP = 0.35
const LAND_BORDER_WEIGHT = 1
const BUILD_RATE = 0.25

const exposureCache = new WeakMap<RealmCacheEntry, NavalExposureCacheEntry>()

function crew({ knowledge }: CrewParams): number {
	return MATH.piecewise({ ...CREW, x: knowledge })
}

function ships({ state, nation }: NationParams): number {
	return Math.round(state.shipsCurrent[nation])
}

function isHostile({ state, nation, other }: NationParams & { other: number }) {
	const relation = STATE.getRelation({ state, a: nation, b: other })
	return relation === "NONE" || relation === "WAR"
}

function exposureOf({
	state,
	nation,
	provinces,
}: ExposureOfParams): NavalExposure {
	if (provinces.length === 0) return { ports: 0, hostile: 0 }
	const inside = new Set(provinces)
	const former = STATE.getSovereign({ state, p: provinces[0] })
	let ports = 0
	let hostile = 0
	const { provinceAdjOffset, provinceAdjList, provinceWaterBody } = state
	for (const p of provinces) {
		if (provinceWaterBody[p] >= 0) ports++
		for (let i = provinceAdjOffset[p]; i < provinceAdjOffset[p + 1]; i++) {
			const neighbor = provinceAdjList[i]
			if (inside.has(neighbor)) continue
			const other = STATE.getSovereign({ state, p: neighbor })
			if (
				other >= 0 &&
				(other === former || isHostile({ state, nation, other }))
			) {
				hostile++
				break
			}
		}
	}
	return {
		ports: ports / provinces.length,
		hostile: hostile / provinces.length,
	}
}

function exposure({ state, nation }: NationParams): NavalExposure {
	const realm = ECONOMY.realm({ state, p: nation })
	const cached = exposureCache.get(realm)
	if (
		cached &&
		cached.hierarchyVersion === state.hierarchyVersion &&
		cached.relationVersion === state.relationVersion
	)
		return cached.exposure
	const computed = exposureOf({
		state,
		nation,
		provinces: STATE.getNationProvinces({ state, root: nation }),
	})
	exposureCache.set(realm, {
		hierarchyVersion: state.hierarchyVersion,
		relationVersion: state.relationVersion,
		exposure: computed,
	})
	return computed
}

function share({ exposure: { ports, hostile } }: ShareParams): number {
	return ports > 0
		? (NAVAL_SHARE_CAP * ports) / (ports + LAND_BORDER_WEIGHT * hostile)
		: 0
}

function portCount({ state, provinces }: PortCountParams): number {
	let count = 0
	for (const p of provinces) if (state.provinceWaterBody[p] >= 0) count++
	return count
}

function reaches({ state, nation, waterBody }: ReachParams): boolean {
	for (const p of STATE.getNationProvinces({ state, root: nation }))
		if (state.provinceWaterBody[p] === waterBody) return true
	return false
}

function strength({ state, nation }: NationParams): number {
	return (
		ships({ state, nation }) *
		crew({ knowledge: ECONOMY.realmKnowledge({ state, p: nation }) })
	)
}

function coalition({
	state,
	war,
	nations,
	waterBody,
}: NavalCoalitionParams): NavalCoalition {
	const members: NavalCoalition["members"] = []
	let total = 0
	for (const nation of nations) {
		const committed = war.ships[nation] ?? 0
		if (committed <= 0 || !reaches({ state, nation, waterBody })) continue
		const force =
			committed *
			crew({ knowledge: ECONOMY.realmKnowledge({ state, p: nation }) })
		members.push({ nation, levy: 0, regular: force, force })
		total += committed
	}
	return { members, ships: total }
}

function wholeShipYears({
	before,
	after,
	target,
	rate,
	years,
}: ShipYearsParams): number {
	const first = Math.round(before)
	const last = Math.round(after)
	const total = first * years
	if (last === first) return total
	const k = -Math.log1p(-rate)
	const gap = target - before
	let built = 0
	for (let m = first; m < last; m++) {
		const crossing = -Math.log1p(-(m + 0.5 - before) / gap) / k
		built += years - Math.min(years, Math.max(0, crossing))
	}
	return total + built
}

function initialize({ state, nation, target }: InitializeParams): void {
	state.shipsCurrent[nation] = target.ships
	state.navalIntervals.set(nation, {
		time: state.time,
		target: target.ships,
		home: target.home,
		campaign: target.campaign,
		committed: 0,
		pending: 0,
		settled: 0,
	})
}

function advance({ state, nation }: NationParams): void {
	const interval = state.navalIntervals.get(nation)
	if (!interval || state.time <= interval.time) return
	const years = (state.time - interval.time) / STATE.yearMs
	const before = state.shipsCurrent[nation]
	const { holdings } = RECOVERY.recover({
		holdings: before,
		target: interval.target,
		rate: BUILD_RATE,
		years,
	})
	state.shipsCurrent[nation] = holdings
	const shipYears = wholeShipYears({
		before,
		after: holdings,
		target: interval.target,
		rate: BUILD_RATE,
		years,
	})
	const committed = Math.min(interval.committed, Math.round(before))
	interval.pending +=
		shipYears * interval.home +
		committed * years * (interval.campaign - interval.home)
	interval.time = state.time
}

function decommission({ state, nation }: NationParams): void {
	const interval = state.navalIntervals.get(nation)
	if (!interval) return
	const whole = ships({ state, nation })
	if (interval.target >= whole) return
	state.navalTotals.decommissions += whole - interval.target
	state.shipsCurrent[nation] = interval.target
}

function commit({ state, nation, wars }: CommitParams): void {
	const interval = state.navalIntervals.get(nation)
	if (!interval) return
	const counts = MATH.apportion({
		shares: wars.map((war) => war.allocation[nation] ?? 0),
		total: ships({ state, nation }),
	})
	for (const [i, war] of wars.entries()) war.ships[nation] = counts[i]
	interval.committed = counts.reduce((sum, count) => sum + count, 0)
}

function refresh({ state, nation, target, wars }: RefreshParams): void {
	advance({ state, nation })
	const interval = state.navalIntervals.get(nation)
	if (!interval) return
	interval.target = target.ships
	interval.home = target.home
	interval.campaign = target.campaign
	decommission({ state, nation })
	commit({ state, nation, wars })
	interval.time = state.time
}

function reconstitute({ state, nation, target }: InitializeParams): void {
	const previous = state.navalIntervals.get(nation)
	state.navalIntervals.set(nation, {
		time: state.time,
		target: target.ships,
		home: target.home,
		campaign: target.campaign,
		committed: 0,
		pending: previous?.pending ?? 0,
		settled: previous?.settled ?? 0,
	})
	decommission({ state, nation })
}

function upkeep({ state, nation }: NationParams): number {
	const interval = state.navalIntervals.get(nation)
	if (!interval) return 0
	const whole = ships({ state, nation })
	return (
		whole * interval.home +
		Math.min(interval.committed, whole) * (interval.campaign - interval.home)
	)
}

function pending({ state, nation }: NationParams): number {
	return state.navalIntervals.get(nation)?.pending ?? 0
}

function settle({ state, nation }: NationParams): number {
	advance({ state, nation })
	const interval = state.navalIntervals.get(nation)
	if (!interval) return 0
	const expense = interval.pending
	interval.pending = 0
	interval.settled += expense
	return expense
}

function lose({ state, war, nation, ships: requested }: LoseParams): number {
	advance({ state, nation })
	const interval = state.navalIntervals.get(nation)
	const lost = Math.min(
		requested,
		war.ships[nation] ?? 0,
		ships({ state, nation }),
	)
	if (lost <= 0) return 0
	state.shipsCurrent[nation] -= lost
	war.ships[nation] -= lost
	if (interval) interval.committed = Math.max(0, interval.committed - lost)
	state.navalTotals.shipsLost += lost
	return lost
}

function clear({ state, nation }: NationParams): void {
	state.shipsCurrent[nation] = 0
	const interval = state.navalIntervals.get(nation)
	if (interval) {
		interval.target = 0
		interval.committed = 0
	}
	for (const idx of state.activeWarIds) delete state.wars[idx].ships[nation]
}

function split({ ships: whole, ports }: SplitParams): number[] {
	if (ports.every((count) => count <= 0))
		return ports.map((_, i) => (i === 0 ? whole : 0))
	return MATH.apportion({ shares: ports, total: whole })
}

function release({ state, from, to }: ReleaseParams): void {
	const counts = split({
		ships: ships({ state, nation: from }),
		ports: [from, ...to].map((nation) =>
			portCount({
				state,
				provinces: STATE.getNationProvinces({ state, root: nation }),
			}),
		),
	})
	for (const [i, nation] of to.entries()) {
		state.shipsCurrent[nation] = counts[i + 1]
		state.shipsCurrent[from] -= counts[i + 1]
	}
}

export const NAVY = {
	exposure,
	exposureOf,
	share,
	crew,
	ships,
	strength,
	portCount,
	coalition,
	initialize,
	advance,
	refresh,
	reconstitute,
	commit,
	lose,
	clear,
	split,
	release,
	upkeep,
	pending,
	settle,
}
