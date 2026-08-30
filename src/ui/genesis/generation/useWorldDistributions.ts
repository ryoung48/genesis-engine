import { useMemo } from "react"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { GOVERNMENT } from "@/model/history/earth/government"
import { RELIGION } from "@/model/history/sim/religion"
import { ERAS } from "@/model/society/eras"
import { TRADE_GOODS } from "@/model/society/infrastructure/trade/trade-goods"
import { TRADE_GOODS_TABLE } from "@/model/society/infrastructure/trade/trade-goods-table"
import type { DistributionBucket } from "@/ui/genesis/details/shared"
import { GOVERNMENT_COLORS_CSS } from "@/ui/genesis/political/government-colors"
import { buildNationSizeDistribution } from "@/ui/genesis/political/nation-details-model"
import { climateZoneColor } from "@/ui/genesis/shared/colors/misc"
import { vegetationColor } from "@/ui/genesis/shared/colors/vegetation"
import { getTopographyColor } from "@/ui/genesis/shared/region-colors/palette"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import { buildNationAdjacency } from "@/ui/genesis/view/display-model"
import type { WorldDistributionsInput } from "@/ui/genesis/view/types"
import { buildDistribution } from "@/ui/wiki/stats/nation/nation-distributions"

/**
 * Builds every aggregate chart series the world-details panel renders --
 * nation sizes, governments, religion types, trade goods and the
 * climate/vegetation/topography breakdowns -- from whichever source is
 * authoritative for the current world (earth-history's real per-date engine
 * for Earth imports, the procedural snapshot otherwise).
 */
export function useWorldDistributions(input: WorldDistributionsInput) {
	const {
		world,
		worldForDisplay,
		earthHistory,
		nationModel,
		nationProvinceCounts,
		colorMode,
		dataVariant,
	} = input

	const earthNationProvinceCounts = useMemo(() => {
		if (!world?.isEarthImport || !earthHistory.query) return null
		const counts = new Map<number, number>()
		for (const nationId of earthHistory.query.frame.provinceNation) {
			if (nationId < 0) continue
			counts.set(nationId, (counts.get(nationId) ?? 0) + 1)
		}
		return counts
	}, [world?.isEarthImport, earthHistory.query])

	const earthGovernmentDistribution = useMemo(() => {
		if (
			!world?.isEarthImport ||
			!earthHistory.query ||
			!earthNationProvinceCounts
		)
			return null
		const { nations } = earthHistory.query.frame
		const counts = new Map<
			(typeof GOVERNMENT.earthHistoryGovernmentFamilies)[number],
			number
		>()
		for (const nationId of earthNationProvinceCounts.keys()) {
			const governmentType = nations.get(nationId)?.government ?? null
			const family = GOVERNMENT.getEarthHistoryGovernmentFamily(governmentType)
			if (!family) continue
			counts.set(family, (counts.get(family) ?? 0) + 1)
		}
		return GOVERNMENT.earthHistoryGovernmentFamilies.map((family) => ({
			label: GOVERNMENT.earthHistoryGovernmentFamilyLabels[family],
			count: counts.get(family) ?? 0,
			color: rgbToCss(GOVERNMENT.earthHistoryGovernmentFamilyColors[family]),
		}))
	}, [world?.isEarthImport, earthHistory.query, earthNationProvinceCounts])

	// Habitable provinces owned by nobody. On Earth import that is land EU4 has
	// not colonised at the scrubbed date; procedurally it is the era's stateless
	// land (see the neolithic/lateMedieval statehoodFraction). Desolate
	// provinces are excluded -- they are uninhabitable, not merely unclaimed.
	const unclaimedProvinceCount = useMemo(() => {
		if (world?.isEarthImport && earthHistory.query) {
			let unclaimed = 0
			for (const nationId of earthHistory.query.frame.provinceNation) {
				if (nationId < 0) unclaimed++
			}
			return unclaimed
		}
		const provinces = worldForDisplay?.provinces
		const sovereign = worldForDisplay?.nations?.sovereign
		if (!provinces || !sovereign) return 0
		let unclaimed = 0
		for (let province = 0; province < provinces.count; province++) {
			if (provinces.desolate[province]) continue
			if ((sovereign[province] ?? -1) < 0) unclaimed++
		}
		return unclaimed
	}, [world?.isEarthImport, earthHistory.query, worldForDisplay])

	const nationSizeDistribution = useMemo(
		() =>
			buildNationSizeDistribution(
				earthNationProvinceCounts ?? nationProvinceCounts,
				unclaimedProvinceCount,
			),
		[earthNationProvinceCounts, nationProvinceCounts, unclaimedProvinceCount],
	)

	const governmentDistribution = useMemo(() => {
		if (earthGovernmentDistribution) return earthGovernmentDistribution
		const counts = new Array(ERAS.governmentTypes.length).fill(0)
		const govType = worldForDisplay?.nations?.governmentType
		if (govType && nationModel) {
			for (const nationId of nationModel.counts.keys()) {
				const t = govType[nationId] ?? 0
				if (t >= 0 && t < counts.length) counts[t]++
			}
		}
		return ERAS.governmentTypes.map((key, i) => ({
			label: ERAS.governmentTypeLabels[key],
			count: counts[i] ?? 0,
			color: GOVERNMENT_COLORS_CSS[i] ?? "rgb(148, 163, 184)",
		}))
	}, [
		earthGovernmentDistribution,
		worldForDisplay?.nations?.governmentType,
		nationModel,
	])

	const religionTypeDistribution = useMemo(() => {
		const world = worldForDisplay
		const nationAssign = world?.nations?.assignment
		const cultureAssign = world?.cultures?.assignment
		const religionAssign = world?.religions?.assignment
		const relTypes = world?.religionTypes
		if (
			!nationAssign ||
			!cultureAssign ||
			!religionAssign ||
			!relTypes ||
			!nationModel
		)
			return []

		// Per-nation accumulator: religion type → province count
		const nationBuckets = new Map<number, number[]>()
		for (const nationId of nationModel.counts.keys()) {
			nationBuckets.set(
				nationId,
				new Array<number>(RELIGION.religionTypeNames.length).fill(0),
			)
		}

		for (let p = 0; p < nationAssign.length; p++) {
			const nationId = nationAssign[p]
			if (nationId < 0) continue
			const buckets = nationBuckets.get(nationId)
			if (!buckets) continue

			const cultureId = cultureAssign[p] ?? -1
			if (cultureId < 0) continue
			const religionId = religionAssign[cultureId] ?? -1
			if (religionId < 0) continue
			const type = relTypes[religionId] ?? 0
			if (type >= 0 && type < buckets.length) buckets[type]++
		}

		// Pick the dominant religion type per nation, then count nations by type
		const typeCounts = new Array<number>(
			RELIGION.religionTypeNames.length,
		).fill(0)
		for (const buckets of nationBuckets.values()) {
			let best = -1
			let bestCount = 0
			for (let t = 0; t < buckets.length; t++) {
				if (buckets[t] > bestCount) {
					bestCount = buckets[t]
					best = t
				}
			}
			if (best >= 0) typeCounts[best]++
		}

		return RELIGION.religionTypeNames
			.map((label, i) => {
				const [r, g, b] = RELIGION.religionTypeColors[i]!
				return {
					label,
					count: typeCounts[i] ?? 0,
					color: rgbToCss([r, g, b]),
				}
			})
			.filter((bucket) => bucket.count > 0)
	}, [
		worldForDisplay?.nations?.assignment,
		worldForDisplay?.cultures?.assignment,
		worldForDisplay?.religions?.assignment,
		worldForDisplay?.religionTypes,
		nationModel,
		worldForDisplay,
	])

	// Wars and diplomatic relations were procedural-sim products; Earth import
	// surfaces its own conflict data through earthHistory.
	const conflictDistribution = useMemo<DistributionBucket[]>(() => [], [])
	const relationDistribution = useMemo<DistributionBucket[]>(() => [], [])

	const nationAdjacency = useMemo(
		() =>
			colorMode === "nations" && nationModel && worldForDisplay
				? buildNationAdjacency(nationModel.assignment, worldForDisplay)
				: null,
		[colorMode, nationModel, worldForDisplay],
	)

	// "Observed" sources the real-Earth-derived realClimateZones/realVegetation
	// arrays (assignEarthClimateZones/assignVegetation run against actual
	// climate data for Earth imports) instead of the model's own
	// climateZones/vegetation -- same category scheme and bucketer either
	// way, so this tracks the Model/Observed radio the map overlay uses
	// (see OverlayControls' dataVariant) without falling back to the EU5
	// game's coarser per-province preset categories.
	const showObservedDistributions =
		dataVariant === "observed" && !!world?.isEarthImport

	const climateDistribution = useMemo(
		() =>
			buildDistribution(
				VEGETATION.climateLabels,
				showObservedDistributions
					? world?.realClimateZones
					: world?.climateZones,
				(index) => rgbToCss(climateZoneColor(index)),
				new Set([0]),
			),
		[showObservedDistributions, world?.realClimateZones, world?.climateZones],
	)

	const vegetationDistribution = useMemo(
		() =>
			buildDistribution(
				VEGETATION.biomeLabels,
				showObservedDistributions ? world?.realVegetation : world?.vegetation,
				(index) => rgbToCss(vegetationColor(index)),
				new Set([0]),
			),
		[showObservedDistributions, world?.realVegetation, world?.vegetation],
	)

	const topographyDistribution = useMemo(
		() =>
			buildDistribution(
				CLASSIFICATION.genesisTopographyLabels,
				world?.topography,
				(index) => {
					const color = getTopographyColor(index)
					return color ? rgbToCss(color) : "rgb(148, 163, 184)"
				},
				new Set([CLASSIFICATION.topoLake, CLASSIFICATION.topoOcean]),
			),
		[world?.topography],
	)

	const tradeGoodsDistribution = useMemo(() => {
		const material = world?.tradeGoods
		if (!material) return []
		const counts = new Array<number>(
			TRADE_GOODS_TABLE.tradeGoodLabels.length,
		).fill(0)
		for (let i = 0; i < material.length; i++) {
			const idx = material[i]!
			if (idx > 0 && idx < counts.length) counts[idx]++
		}
		return TRADE_GOODS_TABLE.tradeGoodLabels
			.flatMap((label, index) => {
				if (index === 0 || counts[index] === 0) return []
				const [r, g, b] = TRADE_GOODS.tradeGoodColor(index)
				return [
					{
						label: TRADE_GOODS.tradeGoodDisplayName(label),
						count: counts[index]!,
						color: rgbToCss([r!, g!, b!]),
					},
				]
			})
			.sort((a, b) => b.count - a.count)
	}, [world?.tradeGoods])

	return {
		climateDistribution,
		conflictDistribution,
		governmentDistribution,
		nationAdjacency,
		nationSizeDistribution,
		relationDistribution,
		religionTypeDistribution,
		showObservedDistributions,
		topographyDistribution,
		tradeGoodsDistribution,
		vegetationDistribution,
	}
}
