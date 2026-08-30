import { GRAPH_PARTITION } from "@/model/history/sim/graph-partition"
import { COLONIAL } from "@/model/history/sim/nations/colonial"
import { COLORING } from "@/model/history/sim/nations/coloring"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PLACEMENT } from "@/model/history/sim/nations/placement"
import type {
	BuildNationPlanParams,
	ComputeNationsParams,
	IntegerMassParams,
	SpreadBucketSizesParams,
} from "@/model/history/sim/nations/types"
import { IMPERIAL_PATCHWORK } from "@/model/history/sim/organizations/imperial-patchwork"
import { TRADE_LEAGUE } from "@/model/history/sim/organizations/trade-league"
import { MATH } from "@/model/shared/math/core"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"
import { IDENTITY_SEEDS } from "@/model/shared/random/identity-seeds"
import { RNG } from "@/model/shared/random/rng"
import { UNITS } from "@/model/shared/units"
import { ERAS } from "@/model/society/eras"
import { HIERARCHY } from "@/model/society/hierarchy"
import type {
	GenesisNationHierarchy,
	GenesisOrganization,
	GenesisOrganizationMember,
	GenesisProvinces,
	GovernmentMix,
	OrganizationTitle,
} from "@/model/society/types"
import { WATER_ACCESS } from "@/model/society/water-access"

const MAX_NATION_SPREAD_KM = 2000

const NATION_PERCENTAGES = MATH.normalize([
	0.0, 0.11, 0.144, 0.194, 0.165, 0.251, 0.137,
])

/**
 * Government mix for Imperial Patchwork members, overriding the era's own
 * governmentMix (see the buildImperialPatchwork branch below). The era mix is
 * tuned for the whole settled world including its frontier (lateMedieval
 * skews tribal at 0.44), which doesn't fit a shattered "civilized empire"
 * patchwork -- this skews heavily monarchy (many Imperial Princes), with
 * enough republic share that Free Cities/Peasant Republics actually show up,
 * a modest theocracy share for Prelates/Electors, and no tribal at all.
 */
const IMPERIAL_PATCHWORK_GOVERNMENT_MIX: GovernmentMix = {
	tribal: 0,
	monarchy: 0.68,
	republic: 0.22,
	theocracy: 0.1,
}

/** Number of Trade Leagues to place per world, each from its own largest
 * eligible remaining coastal, non-tribal nation. */
const TRADE_LEAGUE_COUNT = 3

function computeNations(params: ComputeNationsParams): GenesisNationHierarchy {
	const {
		provinces,
		coastal,
		riverVisible,
		waterAccess: providedWaterAccess,
		provinceContinent,
		habitability,
		r_xyz,
	} = params
	const maxSpreadRad =
		MAX_NATION_SPREAD_KM /
		(params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm)
	const provinceCount = provinces.count
	if (provinceCount === 0) return emptyPartition(provinceCount)

	const active = new Uint8Array(provinceCount)
	const waterAccess =
		providedWaterAccess ??
		WATER_ACCESS.computeProvinceWaterAccess({
			provinces,
			oceanCoastal: coastal,
			lakeCoastal: new Uint8Array(provinceCount),
			riverVisible,
		}).waterAccess
	let activeCount = 0
	for (let p = 0; p < provinceCount; p++) {
		if (provinces.desolate[p]) continue
		if (params.eraActiveMask && !params.eraActiveMask[p]) continue
		active[p] = 1
		activeCount++
	}
	if (activeCount === 0) return emptyPartition(provinceCount)

	const noise = new SimplexNoise(params.seed ^ 0xdeadbeef)
	const plan = buildNationPlan({
		total: activeCount,
		nationPercentages: params.nationPercentages,
		nationBuckets: params.nationBuckets,
	})
	const assignment = new Int32Array(provinceCount).fill(-1)
	const blocked = new Uint8Array(provinceCount)
	const seeds: number[] = []
	const sizes: number[] = []
	let assigned = 0

	for (let targetIdx = 0; targetIdx < plan.targets.length; targetIdx++) {
		const target = plan.targets[targetIdx]
		const components = PLACEMENT.buildOpenComponents({
			active,
			assignment,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
		const seedProvince = PLACEMENT.selectSeed({
			target,
			active,
			assignment,
			blocked,
			habitability,
			waterAccess,
			migrationWave: params.migrationWave,
			provinceContinent,
			componentId: components.componentId,
			componentSizes: components.sizes,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
		if (seedProvince < 0) continue

		const nation = seeds.length
		seeds.push(seedProvince)
		sizes.push(1)
		assignment[seedProvince] = nation
		assigned++

		const frontier = new Set<number>()
		for (
			let j = provinces.adjOffset[seedProvince],
				jEnd = provinces.adjOffset[seedProvince + 1];
			j < jEnd;
			j++
		) {
			const nb = provinces.adjList[j]
			if (active[nb] && assignment[nb] < 0) frontier.add(nb)
		}

		while (sizes[nation] < target) {
			const claim = PLACEMENT.bestClaim({
				nation,
				seedProvince,
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
			})
			if (claim < 0) break
			PLACEMENT.claimProvinceDynamic({
				nation,
				province: claim,
				active,
				assignment,
				sizes,
				frontier,
				adjOffset: provinces.adjOffset,
				adjList: provinces.adjList,
			})
			assigned++
		}

		const blockHops = Math.max(1, Math.round(Math.sqrt(target) * 0.5))
		PLACEMENT.markBlocked({
			start: seedProvince,
			hops: blockHops,
			active,
			blocked,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		})
	}

	if (assigned < activeCount) {
		const components = PLACEMENT.buildOpenComponents({
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
						PLACEMENT.nationPlacementScore({
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
			let seedScore = PLACEMENT.nationPlacementScore({
				province: seedProvince,
				habitability,
				waterAccess,
				provinceContinent,
				target: members.length,
			})
			for (let i = 1; i < members.length; i++) {
				const province = members[i]
				const score = PLACEMENT.nationPlacementScore({
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

	let organizationPlan: ReturnType<
		typeof IMPERIAL_PATCHWORK.buildImperialPatchwork
	> = null
	if (params.buildImperialPatchwork && params.governmentMix) {
		organizationPlan = IMPERIAL_PATCHWORK.buildImperialPatchwork({
			provinces,
			assignment,
			seeds,
			sizes,
			habitability,
			waterAccess,
			r_xyz,
			migrationWave: params.migrationWave,
			provinceContinent,
			maxSpreadRad,
			seed: params.seed,
		})
	}

	const nationRemap = compactZeroSizeNations({ seeds, sizes, assignment })
	if (organizationPlan) {
		organizationPlan = {
			...organizationPlan,
			leadNationIndex: nationRemap[organizationPlan.leadNationIndex],
			memberNationIndices: organizationPlan.memberNationIndices.map(
				(i) => nationRemap[i],
			),
		}
	}

	// Runs after Imperial Patchwork (above). Placed up to TRADE_LEAGUE_COUNT
	// times: each call only sees whatever nation is still standing after the
	// previous one's compaction, so a fully consumed target (and its new
	// members, all below the eligibility floor) can't be picked again --
	// stops early once no further nation qualifies. excludeNations also keeps
	// any Imperial Patchwork member, and every earlier Trade League's
	// members, off-limits -- an org member can't be shattered into a second
	// org even on the rare occasion it'd otherwise be large/coastal enough.
	const tradeLeaguePlans: NonNullable<
		ReturnType<typeof TRADE_LEAGUE.buildTradeLeague>
	>[] = []
	if (params.buildTradeLeague && params.governmentMix) {
		for (let i = 0; i < TRADE_LEAGUE_COUNT; i++) {
			// Nations already in the Imperial Patchwork or an earlier Trade
			// League this loop placed are off-limits -- an org member can't be
			// shattered into a second org.
			const excludeNations = new Set<number>(
				organizationPlan?.memberNationIndices ?? [],
			)
			for (const plan of tradeLeaguePlans) {
				for (const idx of plan.memberNationIndices) excludeNations.add(idx)
			}
			const plan = TRADE_LEAGUE.buildTradeLeague({
				provinces,
				assignment,
				seeds,
				sizes,
				habitability,
				waterAccess,
				r_xyz,
				migrationWave: params.migrationWave,
				provinceContinent,
				maxSpreadRad,
				seed: params.seed + i,
				governmentMix: params.governmentMix,
				governmentSizeWeight: params.governmentSizeWeight ?? 0.55,
				statehoodFraction: params.statehoodFraction ?? 0.75,
				excludeNations,
			})
			if (!plan) break
			tradeLeaguePlans.push(plan)

			const remap = compactZeroSizeNations({ seeds, sizes, assignment })
			if (organizationPlan) {
				organizationPlan = {
					...organizationPlan,
					leadNationIndex: remap[organizationPlan.leadNationIndex],
					memberNationIndices: organizationPlan.memberNationIndices.map(
						(idx) => remap[idx],
					),
				}
			}
			for (let j = 0; j < tradeLeaguePlans.length; j++) {
				tradeLeaguePlans[j] = {
					...tradeLeaguePlans[j],
					leadNationIndex: remap[tradeLeaguePlans[j].leadNationIndex],
					memberNationIndices: tradeLeaguePlans[j].memberNationIndices.map(
						(idx) => remap[idx],
					),
				}
			}
		}
	}

	const nationCount = seeds.length
	const size = Int32Array.from(sizes)

	const adjSets: Set<number>[] = new Array(nationCount)
	for (let i = 0; i < nationCount; i++) adjSets[i] = new Set()
	for (let p = 0; p < provinceCount; p++) {
		const n1 = assignment[p]
		if (n1 < 0) continue
		for (
			let j = provinces.adjOffset[p], jEnd = provinces.adjOffset[p + 1];
			j < jEnd;
			j++
		) {
			const n2 = assignment[provinces.adjList[j]]
			if (n2 >= 0 && n2 !== n1) adjSets[n1].add(n2)
		}
	}

	const adjOffset = new Int32Array(nationCount + 1)
	let totalAdj = 0
	for (let i = 0; i < nationCount; i++) {
		totalAdj += adjSets[i].size
		adjOffset[i + 1] = totalAdj
	}
	const adjList = new Int32Array(totalAdj)
	for (let i = 0; i < nationCount; i++) {
		let wi = adjOffset[i]
		for (const nb of adjSets[i]) adjList[wi++] = nb
	}

	printNationDistribution({
		actualSizes: size,
		targetProvinceMass: plan.targetProvinceMass,
		targetNationCount: plan.targetNationCount,
		buckets: params.nationBuckets,
	})

	const nationMembers = COLORING.groupByNation({
		assignment,
		nationCount,
		provinceCount,
	})
	const parent = new Int32Array(provinceCount).fill(-1)
	const depth = new Int32Array(provinceCount)
	const urbanPop = new Float32Array(provinceCount)
	for (let nation = 0; nation < nationCount; nation++) {
		const members = nationMembers[nation]
		const capital = seeds[nation]
		const subjects = members.filter((province) => province !== capital)
		if (subjects.length === 0) continue
		HIERARCHY.rebalanceHierarchy({
			capital,
			members: Int32Array.from(subjects),
			parent,
			depth,
			currentDepth: 0,
			fanoutRanges: HIERARCHY.fanoutRangesForSize(sizes[nation]),
			habitability,
			urbanPop,
			waterAccess,
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
			provinceCount,
		})
	}

	const { childOffset, childList } = HIERARCHY.buildChildrenCSR({
		parent,
		provinceCount,
	})
	const sovereign = HIERARCHY.buildSovereign({ parent, provinceCount })
	for (let p = 0; p < provinceCount; p++) {
		if (assignment[p] < 0) sovereign[p] = -1
	}
	const gravity = HIERARCHY.computeGravity({
		habitability,
		childOffset,
		childList,
		depth,
		provinceCount,
		fanoutRanges: HIERARCHY.hegemonFanout,
	})

	// Per-province government type — indexed by province like leaderDynasty.
	// Assign one government per nation using size + spatial biases, then expand.
	const governmentType = new Uint8Array(provinceCount)
	const nationColonizer = new Int32Array(nationCount).fill(-1)
	const organizations: GenesisOrganization[] = []
	if (params.governmentMix && nationCount > 0) {
		const sizeWeight = params.governmentSizeWeight ?? 0.55
		const statehoodFraction = params.statehoodFraction ?? 0.75
		const patchworkMemberSet = organizationPlan
			? new Set(organizationPlan.memberNationIndices)
			: null
		const tradeLeagueMemberSet = new Set(
			tradeLeaguePlans.flatMap((plan) => plan.memberNationIndices),
		)
		// Trade cities have no stateless frontier equivalent -- tribal
		// government is forbidden outright, not just deprioritized, so tribal
		// is zeroed here (GOVERNMENT.assignGovernmentType renormalizes across
		// the remaining three) rather than reusing the era's own mix.
		const tradeLeagueGovernmentMix: GovernmentMix | undefined =
			params.governmentMix && { ...params.governmentMix, tribal: 0 }
		const nationGovType = new Uint8Array(nationCount)
		for (let i = 0; i < nationCount; i++) {
			const eraMix = patchworkMemberSet?.has(i)
				? IMPERIAL_PATCHWORK_GOVERNMENT_MIX
				: tradeLeagueMemberSet.has(i)
					? (tradeLeagueGovernmentMix ?? params.governmentMix)
					: params.governmentMix
			nationGovType[i] = GOVERNMENT.assignGovernmentType({
				nationIndex: i,
				capitalProvince: seeds[i],
				nationSize: sizes[i],
				eraMix,
				sizeWeight,
				habitability,
				waterAccess,
				migrationWave: params.migrationWave,
				statehoodFraction,
				seed: params.seed,
			})
			if (
				tradeLeagueMemberSet.has(i) &&
				GOVERNMENT.govFamilyOfIndex(nationGovType[i]) === "tribal"
			) {
				// Small nations carry a strong tribal prior from size alone
				// (SIZE_GOV_PRIORS), independent of eraMix, so zeroing
				// eraMix.tribal above doesn't fully guarantee no tribal draws --
				// resolved with one direct weighted draw over monarchy/republic/
				// theocracy (same tribal-zeroed mix), each mapped to a
				// representative subtype.
				const mix = tradeLeagueGovernmentMix ?? params.governmentMix
				const family =
					RNG.createRng({ seed: params.seed + i * 7919 }).weightedChoice([
						{ v: "monarchy" as const, w: mix.monarchy },
						{ v: "republic" as const, w: mix.republic },
						{ v: "theocracy" as const, w: mix.theocracy },
					]) ?? "republic"
				nationGovType[i] =
					family === "monarchy"
						? GOVERNMENT.getGovIdx().feudal_monarchy
						: family === "theocracy"
							? GOVERNMENT.getGovIdx().theocracy
							: GOVERNMENT.getGovIdx().oligarchic_republic
			}
			if (patchworkMemberSet?.has(i)) {
				const govType = ERAS.governmentTypes[nationGovType[i]]
				// imperial_cult ("state religion as imperial authority") doesn't
				// fit a member -- that role is already the org's own Emperor
				// title -- so it always falls back to plain theocracy.
				if (govType === "imperial_cult") {
					nationGovType[i] = GOVERNMENT.getGovIdx().theocracy
				} else if (
					// monastic_state should be rare among members (most theocratic
					// members are prelates/bishoprics, not military-religious
					// orders) -- demoted to plain theocracy 98% of the time, via a
					// draw independent of the government subtype's own.
					govType === "monastic_state" &&
					RNG.createRng({ seed: params.seed + i * 4001 }).random() >= 0.02
				) {
					nationGovType[i] = GOVERNMENT.getGovIdx().theocracy
				} else if (
					govType === "absolute_monarchy" ||
					govType === "elective_monarchy"
				) {
					// Neither absolutism nor an elected crown fits a shattered
					// patchwork member -- forced to feudal_monarchy instead.
					nationGovType[i] = GOVERNMENT.getGovIdx().feudal_monarchy
				} else if (
					// Oligarchic republic preferred over dynastic signoria among
					// members -- demoted 90% of the time, via a draw independent of
					// the government subtype's own.
					govType === "dynastic_signoria" &&
					RNG.createRng({ seed: params.seed + i * 5003 }).random() >= 0.1
				) {
					nationGovType[i] = GOVERNMENT.getGovIdx().oligarchic_republic
				}
			}
		}
		if ((params.governmentMix.colonial ?? 0) > 0) {
			COLONIAL.assignColonialRelations({
				nationCount,
				nationGovType,
				nationColonizer,
				assignment,
				seeds,
				size,
				colonialFraction: params.governmentMix.colonial!,
				waterAccess,
				habitability,
				provinceSeeds: provinces.seeds,
				r_xyz,
				sizeWeight,
				maxSpreadRad,
			})
		}
		for (let p = 0; p < provinceCount; p++) {
			const n = assignment[p]
			if (n >= 0) governmentType[p] = nationGovType[n]
		}
		if (organizationPlan) {
			const members = resolveOrganizationTitles({
				leadNationIndex: organizationPlan.leadNationIndex,
				memberNationIndices: organizationPlan.memberNationIndices,
				nationGovType,
				sizes,
				seed: params.seed,
			})
			organizations.push({
				id: `org-${params.seed}-imperialPatchwork`,
				kind: "imperialPatchwork",
				nameSeed: organizationPlan.nameSeed,
				// Distinct from every member nation's own color (nation colors are
				// picked via graph-coloring against neighbors -- an org's identity
				// color is unrelated to that, hashed straight off its own name seed).
				color: GRAPH_PARTITION.hslToRgb({
					h: organizationPlan.nameSeed % 360,
					s: 0.7,
					l: 0.5,
				}),
				// Patched in by the pipeline once cultures are computed --
				// culture assignment isn't available at nation-generation time.
				cultureIdx: -1,
				leadNationIndex: organizationPlan.leadNationIndex,
				members,
			})
			printOrganizationSummary({
				leadNationIndex: organizationPlan.leadNationIndex,
				members,
				sizes,
				seeds,
				provinces,
				r_xyz,
			})
		} else if (params.buildImperialPatchwork) {
			console.log(
				"[NATIONS] Imperial Patchwork: skipped (no nation was large/settled enough to shatter)",
			)
		}
		if (tradeLeaguePlans.length > 0) {
			for (let i = 0; i < tradeLeaguePlans.length; i++) {
				const tradeLeaguePlan = tradeLeaguePlans[i]
				// Flat membership, no hierarchy -- every member (including the
				// naming-anchor lead) gets the same "member" title.
				const members = tradeLeaguePlan.memberNationIndices.map(
					(nationIndex) => ({
						nationIndex,
						title: "member" as OrganizationTitle,
					}),
				)
				organizations.push({
					id: `org-${params.seed}-tradeLeague-${i}`,
					kind: "tradeLeague",
					nameSeed: tradeLeaguePlan.nameSeed,
					color: GRAPH_PARTITION.hslToRgb({
						h: tradeLeaguePlan.nameSeed % 360,
						s: 0.7,
						l: 0.5,
					}),
					cultureIdx: -1,
					leadNationIndex: tradeLeaguePlan.leadNationIndex,
					members,
				})
				console.log(
					`[NATIONS] Trade League ${i + 1}/${tradeLeaguePlans.length}: ${members.length} members, lead nation #${tradeLeaguePlan.leadNationIndex} (${sizes[tradeLeaguePlan.leadNationIndex]} provinces)`,
				)
			}
			if (tradeLeaguePlans.length < TRADE_LEAGUE_COUNT) {
				console.log(
					`[NATIONS] Trade League: only placed ${tradeLeaguePlans.length}/${TRADE_LEAGUE_COUNT} (no further coastal, non-tribal nation was large enough to shatter)`,
				)
			}
		} else if (params.buildTradeLeague) {
			console.log(
				"[NATIONS] Trade League: skipped (no coastal, non-tribal nation was large enough to shatter)",
			)
		}
	} else if (params.buildImperialPatchwork || params.buildTradeLeague) {
		console.log(
			"[NATIONS] Imperial Patchwork / Trade League: skipped (governmentMix not supplied)",
		)
	}

	return {
		assignment,
		seeds: new Int32Array(seeds),
		languageSeeds: new Int32Array(0),
		nameSeeds: IDENTITY_SEEDS.buildIdentitySeeds({
			count: nationCount,
			seed: params.seed + 4103,
		}),
		count: nationCount,
		adjOffset,
		adjList,
		size,
		colors: COLORING.nationColorsFromProvinces({
			nationCount,
			seeds,
			provinceColors: provinces.colors,
			adjOffset,
			adjList,
		}),
		parent,
		depth,
		childOffset,
		childList,
		sovereign,
		gravity,
		governmentType,
		nationColonizer,
		organizations,
	}
}

/**
 * Removes any zero-size nation slots (left behind by IMPERIAL_PATCHWORK
 * shattering a nation into replacements) and remaps assignment to the
 * compacted indices. Returns the old-index -> new-index map (identity where
 * nothing changed) so callers holding onto now-stale indices can translate.
 */
function compactZeroSizeNations(params: {
	seeds: number[]
	sizes: number[]
	assignment: Int32Array
}): Int32Array {
	const { seeds, sizes, assignment } = params
	const remap = new Int32Array(seeds.length).fill(-1)
	const newSeeds: number[] = []
	const newSizes: number[] = []
	for (let i = 0; i < seeds.length; i++) {
		if (sizes[i] <= 0) continue
		remap[i] = newSeeds.length
		newSeeds.push(seeds[i])
		newSizes.push(sizes[i])
	}
	if (newSeeds.length === seeds.length) return remap

	for (let p = 0; p < assignment.length; p++) {
		const n = assignment[p]
		if (n >= 0) assignment[p] = remap[n]
	}
	seeds.length = 0
	seeds.push(...newSeeds)
	sizes.length = 0
	sizes.push(...newSizes)
	return remap
}

/**
 * Ranks an Imperial Patchwork's members into HRE-style titles: the shatter
 * target is Emperor; up to 7 of the largest non-Emperor monarchy/theocracy
 * members are Electors (mirroring the historical Prince-/Archbishop-Electors);
 * the monarchy/theocracy remainder are Imperial Princes/Prelates. Republics
 * split three ways by size/subtype: a peasant_republic-governed member of
 * size 1, 1-in-6 of the time, is a Peasant Republic (lord-less free-peasant
 * commune, e.g. Dithmarschen); every other size-1 republic is a Free City;
 * everything larger is a plain Republic.
 */
function resolveOrganizationTitles(params: {
	leadNationIndex: number
	memberNationIndices: number[]
	nationGovType: Uint8Array
	sizes: number[]
	seed: number
}): GenesisOrganizationMember[] {
	const { leadNationIndex, memberNationIndices, nationGovType, sizes, seed } =
		params
	const familyOf = (nation: number) =>
		GOVERNMENT.govFamilyOfIndex(nationGovType[nation])

	const nonEmperor = memberNationIndices.filter((i) => i !== leadNationIndex)
	const electorSet = new Set(
		nonEmperor
			.filter((i) => {
				const family = familyOf(i)
				return family === "monarchy" || family === "theocracy"
			})
			.sort((a, b) => sizes[b] - sizes[a])
			.slice(0, 7),
	)

	return memberNationIndices.map((nation) => {
		if (nation === leadNationIndex) {
			return { nationIndex: nation, title: "emperor" as OrganizationTitle }
		}
		const family = familyOf(nation)
		let title: OrganizationTitle
		if (family === "theocracy") {
			title = electorSet.has(nation) ? "archbishopElector" : "imperialPrelate"
		} else if (family === "republic") {
			const govType = ERAS.governmentTypes[nationGovType[nation]]
			// peasant_republic's own government-assignment odds (~1 in 4 among
			// small republics) make it far too common relative to Free City
			// against a real HRE member-list reference (roughly 1 Peasant
			// Republic per 6 Free Cities) -- demoted to Free City/Republic the
			// rest of the time via a second, independent deterministic draw.
			const isPeasantRepublic =
				govType === "peasant_republic" &&
				sizes[nation] === 1 &&
				RNG.createRng({ seed: seed + nation * 6007 }).random() < 1 / 6
			if (isPeasantRepublic) {
				title = "peasantRepublic"
			} else if (sizes[nation] === 1) {
				title = "freeCity"
			} else {
				title = "republic"
			}
		} else {
			// monarchy, plus tribal/colonial fallback
			title = electorSet.has(nation) ? "princeElector" : "imperialPrince"
		}
		return { nationIndex: nation, title }
	})
}

/** Console table confirming an Imperial Patchwork actually fired, and what
 * it produced -- there's otherwise no visible signal that organization
 * generation ran at all. */
function printOrganizationSummary(params: {
	leadNationIndex: number
	members: GenesisOrganizationMember[]
	sizes: number[]
	seeds: number[]
	provinces: GenesisProvinces
	r_xyz: Float32Array
}) {
	const { leadNationIndex, members, sizes, seeds, provinces, r_xyz } = params
	const titleCounts = new Map<OrganizationTitle, number>()
	for (const member of members) {
		titleCounts.set(member.title, (titleCounts.get(member.title) ?? 0) + 1)
	}
	const capitalProvince = seeds[leadNationIndex]
	const region = provinces.seeds[capitalProvince]
	const x = r_xyz[3 * region]
	const y = r_xyz[3 * region + 1]
	const z = r_xyz[3 * region + 2]
	const latDeg = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
	const lonDeg = (Math.atan2(y, x) * 180) / Math.PI
	console.log(
		`[NATIONS] Imperial Patchwork: ${members.length} members, emperor nation #${leadNationIndex} (${sizes[leadNationIndex]} provinces), capital province #${capitalProvince} at lat ${latDeg.toFixed(1)}, lon ${lonDeg.toFixed(1)}`,
	)
	console.table(
		Array.from(titleCounts.entries()).map(([title, count]) => ({
			title,
			count,
		})),
	)
}

function printNationDistribution(params: {
	actualSizes: Int32Array
	targetProvinceMass: number[]
	targetNationCount: number[]
	buckets?: [number, number][]
}) {
	const { actualSizes, targetProvinceMass, targetNationCount } = params
	const buckets = params.buckets ?? ERAS.nationBuckets
	const totalProvinceMass = actualSizes.reduce((sum, value) => sum + value, 0)
	const rows = buckets.map(([min, max], idx) => {
		let nationCount = 0
		let provinceMass = 0
		for (let i = 0; i < actualSizes.length; i++) {
			const size = actualSizes[i]
			if (size >= min && size <= max) {
				nationCount++
				provinceMass += size
			}
		}
		return {
			bucket: `${min}-${max}`,
			targetProvinceMass: targetProvinceMass[idx] ?? 0,
			actualProvinceMass: provinceMass,
			actualProvincePct: `${((provinceMass / Math.max(1, totalProvinceMass)) * 100).toFixed(1)}%`,
			targetNationCount: targetNationCount[idx] ?? 0,
			actualNationCount: nationCount,
		}
	})

	console.table(rows)
}

function integerMass({ total, weights }: IntegerMassParams): number[] {
	const raw = weights.map((weight) => weight * total)
	const base = raw.map((value) => Math.floor(value))
	let remainder = total - base.reduce((sum, value) => sum + value, 0)
	const order = raw
		.map((value, idx) => ({ idx, remainder: value - base[idx] }))
		.sort((a, b) => b.remainder - a.remainder)
	for (let i = 0; i < order.length && remainder > 0; i++, remainder--) {
		base[order[i].idx] += 1
	}
	return base
}

function buildNationPlan({
	total,
	nationPercentages,
	nationBuckets,
}: BuildNationPlanParams): {
	targetProvinceMass: number[]
	targetNationCount: number[]
	targets: number[]
} {
	const percentages = nationPercentages ?? NATION_PERCENTAGES
	const buckets = nationBuckets ?? ERAS.nationBuckets
	const budgets = integerMass({ total, weights: percentages })
	const targetNationCount = new Array<number>(buckets.length).fill(0)
	const targets: number[] = []
	for (let i = 0; i < budgets.length; i++) {
		const budget = budgets[i]
		if (budget <= 0) continue
		const [minSize, maxSize] = buckets[i]
		if (budget <= minSize) {
			targets.push(budget)
			targetNationCount[i] = 1
			continue
		}
		const avg = (minSize + maxSize) / 2
		const minCount = Math.max(1, Math.ceil(budget / maxSize))
		const maxCount = Math.max(1, Math.floor(budget / minSize))
		const count = Math.max(
			minCount,
			Math.min(maxCount, Math.round(budget / avg)),
		)
		targetNationCount[i] = count
		const sizes = spreadBucketSizes({ budget, minSize, maxSize, count })
		for (let j = 0; j < count; j++) targets.push(sizes[j])
	}
	return {
		targetProvinceMass: budgets,
		targetNationCount,
		targets: targets.sort((a, b) => b - a),
	}
}

function spreadBucketSizes({
	budget,
	minSize,
	maxSize,
	count,
}: SpreadBucketSizesParams): Int32Array {
	if (count <= 1)
		return new Int32Array([Math.max(minSize, Math.min(maxSize, budget))])

	const sizes = new Int32Array(count)
	const span = maxSize - minSize
	for (let i = 0; i < count; i++) {
		const t = count === 1 ? 0.5 : i / (count - 1)
		sizes[i] = Math.round(minSize + span * t)
	}

	let remaining = budget - sizes.reduce((sum, value) => sum + value, 0)
	while (remaining !== 0) {
		let changed = false
		if (remaining > 0) {
			const order = Array.from({ length: count }, (_, idx) => idx).sort(
				(a, b) => {
					if (sizes[a] !== sizes[b]) return sizes[a] - sizes[b]
					return a - b
				},
			)
			for (let i = 0; i < order.length && remaining > 0; i++) {
				const idx = order[i]
				if (sizes[idx] >= maxSize) continue
				sizes[idx]++
				remaining--
				changed = true
			}
		} else {
			const order = Array.from({ length: count }, (_, idx) => idx).sort(
				(a, b) => {
					if (sizes[a] !== sizes[b]) return sizes[b] - sizes[a]
					return a - b
				},
			)
			for (let i = 0; i < order.length && remaining < 0; i++) {
				const idx = order[i]
				if (sizes[idx] <= minSize) continue
				sizes[idx]--
				remaining++
				changed = true
			}
		}
		if (!changed) break
	}

	return sizes
}

function emptyPartition(nodeCount: number): GenesisNationHierarchy {
	return {
		assignment: new Int32Array(nodeCount).fill(-1),
		seeds: new Int32Array(0),
		languageSeeds: new Int32Array(0),
		nameSeeds: new Int32Array(0),
		count: 0,
		adjOffset: new Int32Array(1),
		adjList: new Int32Array(0),
		size: new Int32Array(0),
		colors: new Float32Array(0),
		parent: new Int32Array(nodeCount).fill(-1),
		depth: new Int32Array(nodeCount),
		childOffset: new Int32Array(nodeCount + 1),
		childList: new Int32Array(0),
		sovereign: new Int32Array(nodeCount).fill(-1),
		gravity: new Float32Array(nodeCount),
		governmentType: new Uint8Array(nodeCount),
		nationColonizer: new Int32Array(0),
	}
}

export const NATIONS = {
	computeNations,
}
