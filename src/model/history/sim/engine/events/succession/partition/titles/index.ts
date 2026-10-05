import { PARTITION_SHARES } from "@/model/history/sim/engine/events/succession/partition/shares"
import type {
	AllocateTitleSharesParams,
	TitleAllocation,
} from "@/model/history/sim/engine/events/succession/partition/titles/types"
import type { PartitionShare } from "@/model/history/sim/engine/events/succession/partition/types"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import { DEJURE } from "@/model/society/dejure"

export const PARTITION_TITLES = {
	allocate({
		state,
		realm,
		heirs,
	}: AllocateTitleSharesParams): TitleAllocation {
		const top = STATE_TITLES.topTier({ state, realm })
		const titles = Array.from(
			{ length: state.titles.count },
			(_, title) => title,
		).filter(
			(title) =>
				state.titles.holder[title] === realm &&
				state.titles.tier[title] === top,
		)
		const population = new Map(
			titles.map((title) => {
				let total = 0
				for (
					let i = state.titleMembers.offset[title];
					i < state.titleMembers.offset[title + 1];
					i++
				) {
					const p = state.titleMembers.list[i]
					if (state.sovereignCurrent[p] === realm)
						total += state.popRuralCurrent[p] + state.popUrbanCurrent[p]
				}
				return [title, total]
			}),
		)
		titles.sort(
			(a, b) =>
				(population.get(b) as number) - (population.get(a) as number) ||
				state.titles.seat[a] - state.titles.seat[b],
		)
		const primaryTitle =
			titles.find(
				(title) =>
					DEJURE.titleAt({
						titles: state.titles,
						provinceCount: state.P,
						tier: top,
						province: realm,
					}) === title,
			) ?? titles[0]
		const shares: PartitionShare[] = []
		const allocated = new Set<number>()
		const remaining = [...heirs]
		for (const title of titles) {
			if (title === primaryTitle || remaining.length === 0) continue
			const seat = state.titles.seat[title]
			const supporters = STATE.getChildren({ state, p: realm }).filter(
				(p) =>
					p !== seat &&
					DEJURE.titleAt({
						titles: state.titles,
						provinceCount: state.P,
						tier: top,
						province: p,
					}) === title,
			)
			if (
				[seat, ...supporters].some((p) =>
					PARTITION_SHARES.occupied({ state, seat: p }),
				)
			)
				continue
			shares.push({
				heir: remaining.shift() as number,
				seat,
				kind: "title",
				supporters,
			})
			for (const p of supporters) allocated.add(p)
		}
		return { shares, allocated, remaining }
	},
}
