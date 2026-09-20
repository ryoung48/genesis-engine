import type {
	AssignVassalMarksParams,
	BlockAroundParams,
	CountProvincesParams,
	MarkContext,
	SingleCandidatesParams,
	SinglePassParams,
	SubtreeCandidate,
	SubtreeCandidatesParams,
	SubtreePassParams,
	SubtreeStats,
} from "@/model/history/sim/nations/government/vassal-marks/types"
import { ERAS } from "@/model/society/eras"

const TRIBAL = ERAS.governmentTypes.indexOf("tribal_government")
const FEUDAL = ERAS.governmentTypes.indexOf("feudal_government")
const REPUBLIC = ERAS.governmentTypes.indexOf("republic_government")
const THEOCRACY = ERAS.governmentTypes.indexOf("theocracy")
const MAX_SUBTREE_SIZE = 6
const MIN_FEUDAL_TRIBAL_NATION_SIZE = 2
const MIN_REPUBLIC_NATION_SIZE = 3
const MIN_THEOCRACY_NATION_SIZE = 10
const PROVINCES_PER_CIVIC_MARK = 10

function isRoot(ctx: MarkContext, province: number): boolean {
	return ctx.parent[province] < 0
}

function isLeaf(ctx: MarkContext, province: number): boolean {
	return ctx.childOffset[province] === ctx.childOffset[province + 1]
}

function resolve(ctx: MarkContext): void {
	for (let i = 0; i < ctx.order.length; i++) {
		const province = ctx.order[i]
		if (ctx.mark[province] >= 0) ctx.resolved[province] = ctx.mark[province]
		else if (ctx.parent[province] >= 0)
			ctx.resolved[province] = ctx.resolved[ctx.parent[province]]
		else ctx.resolved[province] = ctx.nationGovernment[ctx.assignment[province]]
	}
}

function measureSubtrees(ctx: MarkContext): SubtreeStats {
	const stats: SubtreeStats = {
		size: new Int32Array(ctx.provinceCount),
		waveSum: new Float64Array(ctx.provinceCount),
		habSum: new Float64Array(ctx.provinceCount),
		uniform: new Int16Array(ctx.provinceCount).fill(-1),
	}
	for (let i = 0; i < ctx.order.length; i++) {
		const province = ctx.order[i]
		stats.size[province] = 1
		stats.waveSum[province] = ctx.wave[province]
		stats.habSum[province] = ctx.habitability[province]
		stats.uniform[province] = ctx.resolved[province]
	}
	for (let i = ctx.order.length - 1; i >= 0; i--) {
		const province = ctx.order[i]
		const up = ctx.parent[province]
		if (up < 0) continue
		stats.size[up] += stats.size[province]
		stats.waveSum[up] += stats.waveSum[province]
		stats.habSum[up] += stats.habSum[province]
		if (stats.uniform[province] !== stats.uniform[up]) stats.uniform[up] = -2
	}
	return stats
}

function subtreeCandidates({
	ctx,
	stats,
	provinces,
}: SubtreeCandidatesParams): SubtreeCandidate[] {
	const candidates: SubtreeCandidate[] = []
	for (const province of provinces) {
		const size = stats.size[province]
		if (isRoot(ctx, province) || size > MAX_SUBTREE_SIZE) continue
		candidates.push({
			province,
			size,
			wave: stats.waveSum[province] / size,
			habitability: stats.habSum[province] / size,
		})
	}
	return candidates
}

function countProvinces({
	ctx,
	source,
	nationFilter,
}: CountProvincesParams): number {
	let count = 0
	for (let i = 0; i < ctx.order.length; i++) {
		const province = ctx.order[i]
		if (
			ctx.resolved[province] === source &&
			nationFilter(ctx.assignment[province])
		)
			count++
	}
	return count
}

function blockAround({ ctx, blocked, root }: BlockAroundParams): void {
	const stack = [root]
	while (stack.length > 0) {
		const province = stack.pop() as number
		blocked[province] = 1
		for (
			let i = ctx.childOffset[province];
			i < ctx.childOffset[province + 1];
			i++
		)
			stack.push(ctx.childList[i])
	}
	for (let up = ctx.parent[root]; up >= 0; up = ctx.parent[up]) blocked[up] = 1
}

function markSubtrees({
	ctx,
	candidates,
	quota,
	target,
	wavePreference,
}: SubtreePassParams): void {
	const waveSign = wavePreference === "high" ? -1 : 1
	candidates.sort(
		(a, b) =>
			waveSign * (a.wave - b.wave) ||
			-waveSign * (a.habitability - b.habitability) ||
			a.province - b.province,
	)
	const blocked = new Uint8Array(ctx.provinceCount)
	const pocketCap = ctx.markShares.maxPocketShare * quota
	let filled = 0
	let pocketFilled = 0
	for (const candidate of candidates) {
		if (filled >= quota) break
		if (blocked[candidate.province]) continue
		const isPocket = candidate.size > 1
		if (isPocket && pocketFilled >= pocketCap) continue
		if (isPocket && filled + candidate.size > quota) continue
		ctx.mark[candidate.province] = target
		blockAround({ ctx, blocked, root: candidate.province })
		filled += candidate.size
		if (isPocket) pocketFilled += candidate.size
	}
	resolve(ctx)
}

function markSingles({
	ctx,
	candidates,
	quota,
	target,
	rank,
}: SinglePassParams): void {
	candidates.sort((a, b) => {
		const [primaryA, secondaryA] = rank(a)
		const [primaryB, secondaryB] = rank(b)
		return primaryB - primaryA || secondaryB - secondaryA || a - b
	})
	const nationTaken = new Int32Array(ctx.sizes.length)
	let filled = 0
	for (const province of candidates) {
		if (filled >= quota) break
		const nation = ctx.assignment[province]
		if (
			nationTaken[nation] >=
			Math.ceil(ctx.sizes[nation] / PROVINCES_PER_CIVIC_MARK)
		)
			continue
		let adjacent = false
		for (
			let i = ctx.adjOffset[province];
			i < ctx.adjOffset[province + 1] && !adjacent;
			i++
		)
			adjacent = ctx.civicTaken[ctx.adjList[i]] === 1
		if (adjacent) continue
		ctx.mark[province] = target
		ctx.civicTaken[province] = 1
		nationTaken[nation]++
		filled++
	}
	resolve(ctx)
}

function singleCandidates({
	ctx,
	minNationSize,
}: SingleCandidatesParams): number[] {
	const candidates: number[] = []
	for (let i = 0; i < ctx.order.length; i++) {
		const province = ctx.order[i]
		if (
			!isRoot(ctx, province) &&
			isLeaf(ctx, province) &&
			ctx.resolved[province] === FEUDAL &&
			ctx.sizes[ctx.assignment[province]] >= minNationSize
		)
			candidates.push(province)
	}
	return candidates
}

function tribalInFeudalPass(ctx: MarkContext): void {
	const rows = ctx.markShares.tribalInFeudal
	const rowOf = ctx.sizes.map((size) =>
		rows.findIndex((row) => size <= row.maxSize),
	)
	const stats = measureSubtrees(ctx)
	for (let row = 0; row < rows.length; row++) {
		if (rows[row].share <= 0) continue
		const inRow = (nation: number) => rowOf[nation] === row
		const eligible: number[] = []
		for (let i = 0; i < ctx.order.length; i++) {
			const province = ctx.order[i]
			if (inRow(ctx.assignment[province]) && stats.uniform[province] === FEUDAL)
				eligible.push(province)
		}
		const feudalProvinces = countProvinces({
			ctx,
			source: FEUDAL,
			nationFilter: inRow,
		})
		markSubtrees({
			ctx,
			candidates: subtreeCandidates({ ctx, stats, provinces: eligible }),
			quota: Math.round(rows[row].share * feudalProvinces),
			target: TRIBAL,
			wavePreference: "high",
		})
	}
}

function feudalInTribalPass(ctx: MarkContext): void {
	const stats = measureSubtrees(ctx)
	const eligibleNation = (nation: number) =>
		ctx.sizes[nation] >= MIN_FEUDAL_TRIBAL_NATION_SIZE
	const eligible: number[] = []
	for (let i = 0; i < ctx.order.length; i++) {
		const province = ctx.order[i]
		if (
			eligibleNation(ctx.assignment[province]) &&
			stats.uniform[province] === TRIBAL &&
			ctx.mark[province] < 0
		)
			eligible.push(province)
	}
	markSubtrees({
		ctx,
		candidates: subtreeCandidates({ ctx, stats, provinces: eligible }),
		quota: Math.round(
			ctx.markShares.feudalInTribal *
				countProvinces({ ctx, source: TRIBAL, nationFilter: eligibleNation }),
		),
		target: FEUDAL,
		wavePreference: "low",
	})
}

function republicPass(ctx: MarkContext): void {
	markSingles({
		ctx,
		candidates: singleCandidates({
			ctx,
			minNationSize: MIN_REPUBLIC_NATION_SIZE,
		}),
		quota: Math.round(ctx.markShares.republic * ctx.order.length),
		target: REPUBLIC,
		rank: (province) => [ctx.urbanPop[province], ctx.waterAccess[province]],
	})
}

function theocracyPass(ctx: MarkContext): void {
	markSingles({
		ctx,
		candidates: singleCandidates({
			ctx,
			minNationSize: MIN_THEOCRACY_NATION_SIZE,
		}),
		quota: Math.round(ctx.markShares.theocracy * ctx.order.length),
		target: THEOCRACY,
		rank: (province) => [ctx.urbanPop[province], 0],
	})
}

function assign(params: AssignVassalMarksParams): Uint8Array {
	const provinceCount = params.assignment.length
	const owned: number[] = []
	const wave = new Float32Array(provinceCount)
	for (let p = 0; p < provinceCount; p++) {
		if (params.assignment[p] >= 0) owned.push(p)
		wave[p] = Math.max(0, params.migrationWave?.[p] ?? 0)
	}
	owned.sort((a, b) => params.depth[a] - params.depth[b] || a - b)
	const ctx: MarkContext = {
		...params,
		provinceCount,
		order: Int32Array.from(owned),
		mark: new Int16Array(provinceCount).fill(-1),
		resolved: new Uint8Array(provinceCount),
		civicTaken: new Uint8Array(provinceCount),
		wave,
	}
	resolve(ctx)
	tribalInFeudalPass(ctx)
	feudalInTribalPass(ctx)
	republicPass(ctx)
	theocracyPass(ctx)
	return ctx.resolved
}

export const VASSAL_MARKS = {
	assign,
}
