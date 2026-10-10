import { DISTRIBUTION_ATTACKS } from "@/model/history/distribution/attacks"
import type {
	Candidate,
	NeighborParams,
	StatehoodParams,
} from "@/model/history/distribution/statehood/types"
import { DISTRIBUTION_STATUS } from "@/model/history/distribution/status"
import { DISTRIBUTION_TARGETS } from "@/model/history/distribution/targets"
import { DISTRIBUTION_TERRITORY } from "@/model/history/distribution/territory"

const FOUNDING_MAX_SHARE = 0.02
const STRETCH_PENALTY = 3

function hasStateNeighbor({ territory: t, province }: NeighborParams): boolean {
	for (
		let j = t.provinces.adjOffset[province];
		j < t.provinces.adjOffset[province + 1];
		j++
	)
		if (DISTRIBUTION_STATUS.isOwned({ owner: t.owner[t.provinces.adjList[j]] }))
			return true
	return false
}

function bestSite({ engine: e }: StatehoodParams): number {
	const t = e.territory
	const eligible = (p: number) =>
		DISTRIBUTION_STATUS.isStateless({ owner: t.owner[p] }) &&
		e.year - e.migration.arrivalYear[p] >= 200
	for (const choice of e.cradles.schedule.slice(0, e.cradles.cursor))
		if (
			eligible(choice.province) &&
			!hasStateNeighbor({ territory: t, province: choice.province })
		)
			return choice.province
	const stated = new Set(
		[...t.countries.values()].map((c) => t.componentId[c.capital]),
	)
	const candidates: number[] = []
	for (let p = 0; p < t.owner.length; p++) if (eligible(p)) candidates.push(p)
	const unstated = candidates.filter((p) => !stated.has(t.componentId[p]))
	const pool = unstated.length ? unstated : candidates
	const spaced = pool.filter(
		(p) => !hasStateNeighbor({ territory: t, province: p }),
	)
	const sites = spaced.length ? spaced : pool
	let best = -1,
		score = -Infinity
	for (const p of sites) {
		const value =
			e.siteScore[p] *
			(1 + Math.exp(-e.cradles.nearestDistanceKm[p] / e.cradles.spacingKm))
		if (value > score || (value === score && p < best)) {
			best = p
			score = value
		}
	}
	return best
}
function found({ engine: e }: StatehoodParams): void {
	const limit = Math.max(1, Math.ceil(FOUNDING_MAX_SHARE * e.target.targetN))
	let created = 0
	while (e.territory.countries.size < e.target.targetN && created < limit) {
		const site = bestSite({ engine: e })
		if (site < 0) break
		if (e.year - e.migration.arrivalYear[site] < 200) e.foundingViolations++
		DISTRIBUTION_TERRITORY.found({ territory: e.territory, province: site })
		created++
	}
	e.foundings.projected += created
}

function absorb({ engine: e }: StatehoodParams): void {
	const t = e.territory
	let held = 0
	for (const c of t.countries.values()) held += c.members.size
	const wanted = Math.round(
		DISTRIBUTION_TARGETS.status({ year: e.year }).stateHeld * e.habitableCount,
	)
	let deficit = Math.min(wanted, e.settlement.cursor) - held
	e.unmetDemand = Math.max(0, deficit)
	if (deficit <= 0) return
	const limits = new Map<number, number>()
	const limitOf = (countryId: number) => {
		let limit = limits.get(countryId)
		if (limit === undefined) {
			limit = DISTRIBUTION_ATTACKS.ceiling({
				territory: t,
				countryId,
				target: e.target,
			})
			limits.set(countryId, limit)
		}
		return limit
	}
	const frontier = new Set<number>()
	const stateless = e.settlement.cursor - held
	if (held <= stateless) {
		for (const c of t.countries.values())
			for (const p of c.members)
				for (
					let j = t.provinces.adjOffset[p];
					j < t.provinces.adjOffset[p + 1];
					j++
				) {
					const q = t.provinces.adjList[j]
					if (DISTRIBUTION_STATUS.isStateless({ owner: t.owner[q] }))
						frontier.add(q)
				}
	} else {
		for (let i = 0; i < e.settlement.cursor; i++) {
			const p = e.settlement.order[i]
			if (!DISTRIBUTION_STATUS.isStateless({ owner: t.owner[p] })) continue
			for (
				let j = t.provinces.adjOffset[p];
				j < t.provinces.adjOffset[p + 1];
				j++
			)
				if (
					DISTRIBUTION_STATUS.isOwned({
						owner: t.owner[t.provinces.adjList[j]],
					})
				) {
					frontier.add(p)
					break
				}
		}
	}
	while (deficit > 0 && frontier.size) {
		const options: { v: Candidate; w: number }[] = []
		for (const p of [...frontier]) {
			const seen = new Set<number>()
			for (
				let j = t.provinces.adjOffset[p];
				j < t.provinces.adjOffset[p + 1];
				j++
			) {
				const id = t.owner[t.provinces.adjList[j]]
				if (!DISTRIBUTION_STATUS.isOwned({ owner: id }) || seen.has(id))
					continue
				seen.add(id)
				const country = t.countries.get(id)
				if (!country || country.members.size >= limitOf(id)) continue
				options.push({
					v: { countryId: id, province: p },
					w:
						DISTRIBUTION_TERRITORY.enclosure({
							territory: t,
							attacker: id,
							province: p,
						}) **
							2 *
						Math.exp(
							-STRETCH_PENALTY *
								Math.max(
									0,
									DISTRIBUTION_TERRITORY.stretch({
										territory: t,
										country,
										province: p,
									}) - 1,
								),
						),
				})
			}
			if (!seen.size) frontier.delete(p)
		}
		const choice = e.rng.weightedChoice(options)
		if (!choice) break
		const country = t.countries.get(choice.countryId)
		if (!country) break
		DISTRIBUTION_TERRITORY.claim({
			territory: t,
			country,
			province: choice.province,
		})
		frontier.delete(choice.province)
		for (
			let j = t.provinces.adjOffset[choice.province];
			j < t.provinces.adjOffset[choice.province + 1];
			j++
		) {
			const q = t.provinces.adjList[j]
			if (DISTRIBUTION_STATUS.isStateless({ owner: t.owner[q] }))
				frontier.add(q)
		}
		deficit--
	}
	while (deficit > 0) {
		const site = bestSite({ engine: e })
		if (site < 0) break
		const stated = [...t.countries.values()].some(
			(c) => t.componentId[c.capital] === t.componentId[site],
		)
		if (e.year - e.migration.arrivalYear[site] < 200) e.foundingViolations++
		DISTRIBUTION_TERRITORY.found({ territory: t, province: site })
		if (stated) e.foundings.inStatedComponent++
		else e.foundings.firstInComponent++
		deficit--
	}
	e.unmetDemand = Math.max(0, deficit)
}

export const DISTRIBUTION_STATEHOOD = { found, absorb }
