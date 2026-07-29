import type { AssignColonialRelationsParams } from "@/model/society/nations/colonial/types"
import { GOVERNMENT } from "@/model/society/nations/government"
import { PLACEMENT } from "@/model/society/nations/placement"

function assignColonialRelations(params: AssignColonialRelationsParams): void {
	const {
		nationCount,
		nationGovType,
		nationColonizer,
		assignment,
		seeds,
		size,
		colonialFraction,
		waterAccess,
		habitability,
		provinceSeeds,
		r_xyz,
		sizeWeight,
		maxSpreadRad,
	} = params

	const totalMass = size.reduce((s, v) => s + v, 0)
	let budgetRemaining = Math.round(totalMass * colonialFraction)
	if (budgetRemaining <= 0) return

	// Precompute which nations own at least one ocean-coastal province.
	const nationHasOceanCoastal = new Array(nationCount).fill(false)
	for (let p = 0; p < provinceSeeds.length; p++) {
		const n = assignment[p]
		if (n >= 0 && waterAccess[p] >= 2) nationHasOceanCoastal[n] = true
	}

	// Score colonizer candidates: non-tribal, coastal, large enough.
	const colonizers: Array<{ nation: number }> = []
	for (let n = 0; n < nationCount; n++) {
		if (GOVERNMENT.govFamilyOfIndex(nationGovType[n]) === "tribal") continue // tribal cannot colonize
		if (nationColonizer[n] >= 0) continue
		if (waterAccess[seeds[n]] < 2) continue // must be ocean-coastal
		if (size[n] < 8) continue
		colonizers.push({ nation: n })
	}
	if (colonizers.length === 0) return

	// Collect targets: any non-republic nation that owns an ocean-coastal province.
	// Nations that already qualify as colonizers (non-tribal, size≥8, coastal capital)
	// are excluded — they're the colonizing powers, not targets.
	const targets: Array<{
		nation: number
		capital: number
		hab: number
	}> = []
	for (let n = 0; n < nationCount; n++) {
		if (nationColonizer[n] >= 0) continue
		const family = GOVERNMENT.govFamilyOfIndex(nationGovType[n])
		if (family === "republic" || family === "colonial") continue // skip republic types & colonial
		if (family !== "tribal" && size[n] >= 8 && waterAccess[seeds[n]] >= 2)
			continue // matches colonizer criteria — skip
		if (!nationHasOceanCoastal[n]) continue
		targets.push({ nation: n, capital: seeds[n], hab: habitability[seeds[n]] })
	}
	if (targets.length === 0) return

	// Deterministic shuffle so colony type/size isn't ordered by habitability.
	for (let i = targets.length - 1; i > 0; i--) {
		const h = ((i * 2654435761) ^ (targets[i].capital * 31337)) >>> 0
		const j = (h >>> 0) % (i + 1)
		;[targets[i], targets[j]] = [targets[j], targets[i]]
	}

	// Minimum colonial distance: beyond the colonizer's natural spread radius so that
	// truly adjacent tribal nations get absorbed rather than colonised. Scales with
	// planet size since maxSpreadRad is already planet-relative. The 1.5x multiplier
	// provides extra buffer against accidental adjacency.
	const minColonialDistRad = maxSpreadRad * 1.5

	for (const target of targets) {
		if (budgetRemaining <= 0) break

		let bestColonizer = -1
		let bestDist = Infinity
		for (const col of colonizers) {
			if (nationColonizer[col.nation] >= 0) continue
			const d = PLACEMENT.provinceSeedDistance({
				aProvince: seeds[col.nation],
				bProvince: target.capital,
				provinceSeeds,
				r_xyz,
			})
			if (d < minColonialDistRad) continue
			if (d < bestDist) {
				bestDist = d
				bestColonizer = col.nation
			}
		}
		if (bestColonizer < 0) continue

		nationColonizer[target.nation] = bestColonizer
		budgetRemaining -= size[target.nation]

		const h = ((target.capital * 2654435761) ^ (target.nation * 31337)) >>> 0
		const r = (h >>> 0) / 0xffffffff
		const settlerChance =
			sizeWeight < 0.4 ? 0.15 + 0.6 * Math.min(1, size[target.nation] / 30) : 0
		const isSettler = target.hab >= 0.5 && r < settlerChance
		nationGovType[target.nation] = isSettler
			? GOVERNMENT.getGovIdx().settler_colony
			: GOVERNMENT.getGovIdx().trading_company
	}
}

export const COLONIAL = {
	assignColonialRelations,
}
