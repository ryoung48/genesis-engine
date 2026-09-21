import { UNNAMED } from "@/model/history/sim/heirs/types"
import { RULER } from "@/model/history/sim/ruler"
import type {
	DistanceParams,
	GrantInitialParams,
	GrantNodeParams,
	GrantSubtreeParams,
	TitleCandidate,
} from "@/model/history/sim/vassalage/types"
import { DEJURE } from "@/model/society/dejure"
import { HOLDING } from "@/model/society/dejure/holding"

function grantShare(size: number): number {
	if (size <= 4) return 0
	if (size >= 25) return 0.92
	if (size <= 7) return ((size - 4) / 3) * 0.13
	if (size <= 10) return 0.13 + ((size - 7) / 3) * 0.57
	return 0.7 + ((size - 10) / 14) * 0.2
}

function ownedSize({ state, realm, title }: GrantNodeParams): number {
	if (title < 0) {
		let count = 0
		for (let p = 0; p < state.P; p++)
			if (state.sovereignCurrent[p] === realm) count++
		return count
	}
	let count = 0
	for (
		let i = state.titleMembers.offset[title];
		i < state.titleMembers.offset[title + 1];
		i++
	)
		if (state.sovereignCurrent[state.titleMembers.list[i]] === realm) count++
	return count
}

function grantSubtree({
	state,
	title,
	from,
	to,
	children,
}: GrantSubtreeParams): void {
	if (state.titles.holder[title] !== from || state.titles.seat[title] === from)
		return
	state.titles.holder[title] = to
	state.events.push({
		tag: "title passed",
		time: state.time,
		data: { title, from, to, cause: "grant" },
	})
	for (const child of children.get(title) ?? [])
		grantSubtree({ state, title: child, from, to, children })
}

function grantNode(params: GrantNodeParams): void {
	const { state, seed, realm, holder, title, children, rng } = params
	const candidates: TitleCandidate[] = []
	for (const child of children.get(title) ?? []) {
		if (state.titles.tier[child] < 2) continue
		let seat = state.titles.seat[child]
		if (
			state.titles.holder[child] !== holder ||
			state.sovereignCurrent[seat] !== realm
		)
			continue
		if (seat === holder || state.leaderNameSeedCurrent[seat] >= 0)
			seat = HOLDING.bestSeat({
				titles: state.titles,
				members: state.titleMembers,
				provinceCount: state.P,
				ownerOf: state.sovereignCurrent,
				rank: state.seatRank,
				habitability: state.habitability,
				urbanPop: state.popUrbanCurrent,
				waterAccess: state.waterAccess,
				title: child,
				holder: realm,
				exclude: holder,
			})
		if (seat === holder || state.leaderNameSeedCurrent[seat] >= 0) continue
		const distance = distanceBetween({ state, a: holder, b: seat })
		const score = DEJURE.seatScore({
			province: seat,
			habitability: state.habitability,
			urbanPop: state.popUrbanCurrent,
			waterAccess: state.waterAccess,
		})
		const jitter = ((Math.imul(child + 1, 2654435761) ^ seed) >>> 0) / 2 ** 32
		candidates.push({ title: child, seat, key: score - distance + jitter })
	}
	candidates.sort((a, b) => a.key - b.key || a.title - b.title)
	const grantRoll = ((Math.imul(holder + 1, 2246822519) ^ seed) >>> 0) / 2 ** 32
	const grants = Math.floor(
		grantShare(ownedSize(params)) * candidates.length + grantRoll,
	)
	for (const candidate of candidates.slice(0, grants)) {
		if (state.leaderNameSeedCurrent[candidate.seat] >= 0) continue
		if (state.titles.seat[candidate.title] !== candidate.seat) {
			state.events.push({
				tag: "capital moved",
				time: state.time,
				data: {
					title: candidate.title,
					from: state.titles.seat[candidate.title],
					to: candidate.seat,
					cause: "grant",
				},
			})
			state.titles.seat[candidate.title] = candidate.seat
		}
		grantSubtree({
			state,
			title: candidate.title,
			from: holder,
			to: candidate.seat,
			children,
		})
		const dynasty =
			rng.random() < 0.5 ? state.leaderDynCurrent[holder] : state.nextDynasty++
		RULER.install({
			state,
			seat: candidate.seat,
			heir: UNNAMED,
			dynasty,
			rng,
			initial: true,
		})
	}
	for (const child of children.get(title) ?? []) {
		const nextHolder = state.titles.holder[child]
		if (nextHolder < 0) continue
		grantNode({
			state,
			seed,
			rng,
			realm,
			holder: nextHolder,
			title: child,
			children,
		})
	}
}

function distanceBetween({ state, a, b }: DistanceParams): number {
	const i = a * 3
	const j = b * 3
	const x = state.province_xyz[i] - state.province_xyz[j]
	const y = state.province_xyz[i + 1] - state.province_xyz[j + 1]
	const z = state.province_xyz[i + 2] - state.province_xyz[j + 2]
	return Math.sqrt(x * x + y * y + z * z)
}

function grantInitial({ state, seed, rng }: GrantInitialParams): void {
	const children = new Map<number, number[]>()
	const rootsByRealm = new Map<number, number[]>()
	for (let title = 0; title < state.titles.count; title++) {
		const holder = state.titles.holder[title]
		if (holder < 0) continue
		const realm = state.sovereignCurrent[holder]
		let parent = -1
		for (let tier = state.titles.tier[title] + 1; tier <= 5; tier++) {
			const ancestor = DEJURE.titleAt({
				titles: state.titles,
				provinceCount: state.P,
				tier,
				province: state.titles.seat[title],
			})
			if (
				ancestor >= 0 &&
				state.titles.holder[ancestor] >= 0 &&
				state.sovereignCurrent[state.titles.holder[ancestor]] === realm
			) {
				parent = ancestor
				break
			}
		}
		if (parent >= 0) {
			const group = children.get(parent) ?? []
			group.push(title)
			children.set(parent, group)
		} else {
			const group = rootsByRealm.get(realm) ?? []
			group.push(title)
			rootsByRealm.set(realm, group)
		}
	}
	for (const [realm, roots] of rootsByRealm) {
		children.set(-1, roots)
		grantNode({ state, seed, rng, realm, holder: realm, title: -1, children })
	}
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
		ownerOf: state.sovereignCurrent,
	})
}

export const VASSALAGE = { grantInitial, grantShare }
