import type { DivideTitlesParams } from "@/model/history/sim/engine/events/succession/division/types"
import { UNNAMED } from "@/model/history/sim/heirs/types"
import { RULER } from "@/model/history/sim/ruler"
import { DEJURE } from "@/model/society/dejure"
import { HOLDING } from "@/model/society/dejure/holding"

function divide({ state, dying, juniors, law, rng }: DivideTitlesParams): void {
	if (law === "single_heir" || juniors.length === 0) return
	const titles = state.titles
	const held: number[] = []
	for (let title = 0; title < titles.count; title++)
		if (titles.holder[title] === dying) held.push(title)
	if (held.length < 2) return
	const size = (title: number): number =>
		state.titleMembers.offset[title + 1] - state.titleMembers.offset[title]
	held.sort(
		(a, b) =>
			titles.tier[b] - titles.tier[a] ||
			Number(titles.seat[b] === dying) - Number(titles.seat[a] === dying) ||
			size(b) - size(a) ||
			a - b,
	)
	const candidates = held.slice(1)
	const realm = state.sovereignCurrent[dying]
	const demesne = new Uint8Array(state.P)
	let total = 0
	if (law === "high_partition") {
		for (let p = 0; p < state.P; p++) {
			if (state.sovereignCurrent[p] !== realm) continue
			let holder = realm
			for (let tier = 1; tier <= 5; tier++) {
				const title = DEJURE.titleAt({
					titles,
					provinceCount: state.P,
					tier,
					province: p,
				})
				if (title < 0 || titles.holder[title] < 0) continue
				const candidate = titles.holder[title]
				if (state.sovereignCurrent[candidate] === realm) {
					holder = candidate
					break
				}
			}
			if (holder === dying) {
				demesne[p] = 1
				total++
			}
		}
	}
	const minimum = Math.ceil(total / 2)
	candidates.sort((a, b) => {
		const byTier = titles.tier[b] - titles.tier[a]
		if (byTier !== 0) return byTier
		return law === "confederate"
			? size(b) - size(a) || a - b
			: size(a) - size(b) || a - b
	})
	let granted = 0
	for (const title of candidates) {
		if (granted >= juniors.length) break
		let contribution = 0
		if (law === "high_partition") {
			for (
				let i = state.titleMembers.offset[title];
				i < state.titleMembers.offset[title + 1];
				i++
			)
				contribution += demesne[state.titleMembers.list[i]]
			if (total - contribution < minimum) continue
		}
		let seat = titles.seat[title]
		if (seat === dying || state.leaderNameSeedCurrent[seat] >= 0)
			seat = HOLDING.bestSeat({
				titles,
				members: state.titleMembers,
				provinceCount: state.P,
				ownerOf: state.sovereignCurrent,
				rank: state.seatRank,
				habitability: state.habitability,
				urbanPop: state.popUrbanCurrent,
				waterAccess: state.waterAccess,
				title,
				holder: realm,
				exclude: dying,
			})
		if (seat === dying || state.leaderNameSeedCurrent[seat] >= 0) continue
		if (seat !== titles.seat[title]) {
			state.events.push({
				tag: "capital moved",
				time: state.time,
				data: {
					title,
					from: titles.seat[title],
					to: seat,
					cause: "division",
				},
			})
			titles.seat[title] = seat
		}
		RULER.install({
			state,
			seat,
			heir: juniors[granted] === UNNAMED ? UNNAMED : juniors[granted],
			dynasty: state.leaderDynCurrent[dying],
			rng,
			initial: false,
		})
		titles.holder[title] = seat
		state.events.push({
			tag: "title passed",
			time: state.time,
			data: { title, from: dying, to: seat, cause: "division" },
		})
		if (law === "high_partition") {
			for (
				let i = state.titleMembers.offset[title];
				i < state.titleMembers.offset[title + 1];
				i++
			) {
				const p = state.titleMembers.list[i]
				if (demesne[p]) {
					demesne[p] = 0
					total--
				}
			}
		}
		granted++
	}
}

export const DIVISION = { divide }
