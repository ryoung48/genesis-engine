import type {
	PlaceCountriesParams,
	PlacedCountries,
} from "@/model/history/sim/nations/placement/countries/types"
import { PLACEMENT_FRONTIER } from "@/model/history/sim/nations/placement/frontier"
import { TITLE_CLAIM } from "@/model/history/sim/nations/title-claim"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"

function placeCountries({
	provinces,
	active: baseActive,
	habitability,
	waterAccess,
	provinceContinent,
	migrationWave,
	r_xyz,
	seed,
	maxSpreadRad,
	targets,
	policy,
}: PlaceCountriesParams): PlacedCountries {
	const provinceCount = provinces.count
	const active = baseActive
	const activeCount = active.reduce((a, b) => a + b, 0)
	if (activeCount === 0)
		return {
			assignment: new Int32Array(provinceCount).fill(-1),
			seeds: [],
			sizes: [],
		}
	const noise = new SimplexNoise(seed ^ 0xdeadbeef)
	const assignment = new Int32Array(provinceCount).fill(-1)
	const blocked = new Uint8Array(provinceCount)
	const seeds: number[] = []
	const sizes: number[] = []
	let assigned = 0
	const quotas: number[] = []

	for (let targetIdx = 0; targetIdx < targets.length; targetIdx++) {
		const target = targets[targetIdx]
		const active =
			policy.kind === "distribution"
				? Uint8Array.from(baseActive, (value, province) =>
						value &&
						policy.componentId[province] === policy.targetComponents[targetIdx]
							? 1
							: 0,
					)
				: baseActive
		const components = PLACEMENT_FRONTIER.buildOpenComponents({
			active,
			assignment,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
		const seedProvince = PLACEMENT_FRONTIER.selectSeed({
			target,
			active,
			assignment,
			blocked,
			habitability,
			waterAccess,
			migrationWave: migrationWave,
			provinceContinent,
			componentId: components.componentId,
			componentSizes: components.sizes,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
		if (seedProvince < 0) continue

		const nation = seeds.length
		const seedUnit =
			policy.kind === "simulation"
				? TITLE_CLAIM.unitFor({
						titles: policy.titles,
						members: policy.titleMembers,
						provinceCount,
						assignment,
						province: seedProvince,
						remaining: target,
					})
				: { title: -1, provinces: [seedProvince] }
		const root =
			policy.kind === "simulation" && seedUnit.title >= 0
				? policy.titles.seat[seedUnit.title]
				: seedProvince
		seeds.push(root)
		sizes.push(0)
		quotas.push(target)

		const frontier = new Set<number>()
		const claimUnit = (unit: number[]) => {
			for (const province of unit) {
				PLACEMENT_FRONTIER.claimProvinceDynamic({
					nation,
					province,
					active,
					assignment,
					sizes,
					frontier,
					adjOffset: provinces.adjOffset,
					adjList: provinces.adjList,
				})
				assigned++
			}
		}
		claimUnit(seedUnit.provinces)

		while (sizes[nation] < target) {
			const claim = PLACEMENT_FRONTIER.bestClaim({
				nation,
				seedProvince: root,
				frontier,
				active,
				assignment,
				habitability,
				waterAccess,
				r_xyz,
				provinceSeeds: provinces.seeds,
				adjOffset: provinces.adjOffset,
				adjList: provinces.adjList,
				noise,
				maxSpreadRad,
				sharedBorderWeight:
					policy.kind === "distribution"
						? PLACEMENT_FRONTIER.compactSharedBorderWeight
						: PLACEMENT_FRONTIER.sharedBorderWeight,
			})
			if (claim < 0) break
			claimUnit(
				policy.kind === "simulation"
					? TITLE_CLAIM.unitFor({
							titles: policy.titles,
							members: policy.titleMembers,
							provinceCount,
							assignment,
							province: claim,
							remaining: target - sizes[nation],
						}).provinces
					: [claim],
			)
		}

		const blockHops = Math.max(1, Math.round(Math.sqrt(target) * 0.5))
		PLACEMENT_FRONTIER.markBlocked({
			start: root,
			hops: blockHops,
			active,
			blocked,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
	}

	if (policy.kind === "simulation" && assigned < activeCount) {
		const components = PLACEMENT_FRONTIER.buildOpenComponents({
			active,
			assignment,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
		const componentMembers: number[][] = new Array(components.sizes.length)
		for (let i = 0; i < componentMembers.length; i++) componentMembers[i] = []
		for (let p = 0; p < provinceCount; p++) {
			const cid = components.componentId[p]
			if (cid >= 0) componentMembers[cid].push(p)
		}

		for (let cid = 0; cid < componentMembers.length; cid++) {
			const members = componentMembers[cid]
			if (members.length === 0) continue

			let bestNation = -1
			let bestScore = -Infinity
			for (let i = 0; i < members.length; i++) {
				const province = members[i]
				for (
					let j = provinces.adjOffset[province],
						jEnd = provinces.adjOffset[province + 1];
					j < jEnd;
					j++
				) {
					const nation = assignment[provinces.adjList[j]]
					if (nation < 0) continue
					const score =
						PLACEMENT_FRONTIER.nationPlacementScore({
							province,
							habitability,
							waterAccess,
							provinceContinent,
							target: members.length,
						}) -
						sizes[nation] * 0.02
					if (score > bestScore) {
						bestScore = score
						bestNation = nation
					}
				}
			}

			if (bestNation >= 0) {
				for (let i = 0; i < members.length; i++) {
					assignment[members[i]] = bestNation
				}
				sizes[bestNation] += members.length
				assigned += members.length
				continue
			}

			const nation = seeds.length
			let seedProvince = members[0]
			let seedScore = PLACEMENT_FRONTIER.nationPlacementScore({
				province: seedProvince,
				habitability,
				waterAccess,
				provinceContinent,
				target: members.length,
			})
			for (let i = 1; i < members.length; i++) {
				const province = members[i]
				const score = PLACEMENT_FRONTIER.nationPlacementScore({
					province,
					habitability,
					waterAccess,
					provinceContinent,
					target: members.length,
				})
				if (score > seedScore) {
					seedProvince = province
					seedScore = score
				}
			}
			seeds.push(seedProvince)
			sizes.push(members.length)
			for (let i = 0; i < members.length; i++) {
				assignment[members[i]] = nation
			}
			assigned += members.length
		}
	}

	if (policy.kind === "distribution") {
		while (assigned < activeCount) {
			const open = PLACEMENT_FRONTIER.buildOpenComponents({
				active,
				assignment,
				adjOffset: provinces.adjOffset,
				adjList: provinces.adjList,
			})
			const cid = open.componentId.find((value) => value >= 0)
			if (cid === undefined) break
			const mask = Uint8Array.from(active, (value, p) =>
				value && open.componentId[p] === cid ? 1 : 0,
			)
			let recipient = -1,
				candidate = -1,
				score = -Infinity
			for (let p = 0; p < provinceCount; p++) {
				if (!mask[p]) continue
				for (
					let j = provinces.adjOffset[p];
					j < provinces.adjOffset[p + 1];
					j++
				) {
					const n = assignment[provinces.adjList[j]]
					if (n < 0 || sizes[n] >= Math.min(quotas[n], policy.ceiling)) continue
					const value =
						PLACEMENT_FRONTIER.nationPlacementScore({
							province: p,
							habitability,
							waterAccess,
							provinceContinent,
							target: open.sizes[cid],
						}) -
						sizes[n] * 0.02
					if (
						value > score ||
						(value === score &&
							(n < recipient || (n === recipient && p < candidate)))
					) {
						score = value
						recipient = n
						candidate = p
					}
				}
			}
			if (recipient >= 0) {
				PLACEMENT_FRONTIER.claimProvinceDynamic({
					nation: recipient,
					province: candidate,
					active,
					assignment,
					sizes,
					frontier: new Set(),
					adjOffset: provinces.adjOffset,
					adjList: provinces.adjList,
				})
				assigned++
				continue
			}
			const target = Math.min(
				policy.ceiling,
				Math.max(...policy.residualSizes({ capacity: open.sizes[cid] })),
			)
			const selected = PLACEMENT_FRONTIER.selectSeed({
				target,
				active: mask,
				assignment,
				blocked,
				habitability,
				waterAccess,
				migrationWave,
				provinceContinent,
				componentId: open.componentId,
				componentSizes: open.sizes,
				adjOffset: provinces.adjOffset,
				adjList: provinces.adjList,
			})
			const root =
				selected >= 0 ? selected : mask.findIndex((value) => value === 1)
			const nation = seeds.length,
				frontier = new Set<number>()
			seeds.push(root)
			sizes.push(0)
			quotas.push(target)
			let next = root
			while (next >= 0 && sizes[nation] < target) {
				PLACEMENT_FRONTIER.claimProvinceDynamic({
					nation,
					province: next,
					active: mask,
					assignment,
					sizes,
					frontier,
					adjOffset: provinces.adjOffset,
					adjList: provinces.adjList,
				})
				assigned++
				next = PLACEMENT_FRONTIER.bestClaim({
					nation,
					seedProvince: root,
					frontier,
					active: mask,
					assignment,
					habitability,
					waterAccess,
					r_xyz,
					provinceSeeds: provinces.seeds,
					adjOffset: provinces.adjOffset,
					adjList: provinces.adjList,
					noise,
					maxSpreadRad: Math.PI,
					sharedBorderWeight: PLACEMENT_FRONTIER.sharedBorderWeight,
				})
			}
		}
	}

	return { assignment, seeds, sizes }
}

export const PLACEMENT_COUNTRIES = { place: placeCountries }
