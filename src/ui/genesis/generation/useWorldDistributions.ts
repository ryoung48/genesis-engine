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
import { buildNationSizeDistribution } from "@/ui/genesis/political/nation-size-distribution"
import { climateZoneColor } from "@/ui/genesis/shared/colors/misc"
import { vegetationColor } from "@/ui/genesis/shared/colors/vegetation"
import { getTopographyColor } from "@/ui/genesis/shared/region-colors/palette"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
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
	const { world, worldForDisplay, history, dataVariant } = input

	const nationProvinceCounts = useMemo(() => {
		const counts = new Map<number, number>()
		if (!history.query) return counts
		for (const nationId of history.query.frame.provinceNation) {
			if (nationId < 0) continue
			counts.set(nationId, (counts.get(nationId) ?? 0) + 1)
		}
		return counts
	}, [history.query])

	const earthGovernmentDistribution = useMemo(() => {
		if (!world?.isEarthImport || !history.query) return null
		const { nations } = history.query.frame
		const counts = new Map<
			(typeof GOVERNMENT.earthHistoryGovernmentFamilies)[number],
			number
		>()
		for (const nationId of nationProvinceCounts.keys()) {
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
	}, [world?.isEarthImport, history.query, nationProvinceCounts])

	// Habitable provinces owned by nobody. On Earth import that is land EU4 has
	// not colonised at the scrubbed date; procedurally it is the era's stateless
	// land (see the neolithic/lateMedieval statehoodFraction). Desolate
	// provinces are excluded -- they are uninhabitable, not merely unclaimed.
	const unclaimedProvinceCount = useMemo(() => {
		if (!history.query) return 0
		const desolate = world?.isEarthImport
			? null
			: worldForDisplay?.provinces?.desolate
		let unclaimed = 0
		const { provinceNation } = history.query.frame
		for (let province = 0; province < provinceNation.length; province++) {
			if (desolate?.[province]) continue
			if (provinceNation[province] < 0) unclaimed++
		}
		return unclaimed
	}, [world?.isEarthImport, history.query, worldForDisplay])

	const nationSizeDistribution = useMemo(
		() =>
			buildNationSizeDistribution(nationProvinceCounts, unclaimedProvinceCount),
		[nationProvinceCounts, unclaimedProvinceCount],
	)

	const governmentDistribution = useMemo(() => {
		if (earthGovernmentDistribution) return earthGovernmentDistribution
		const counts = new Array(ERAS.governmentTypes.length).fill(0)
		if (history.query) {
			const { nations } = history.query.frame
			for (const nationId of nationProvinceCounts.keys()) {
				const government = nations.get(nationId)?.government
				const index = ERAS.governmentTypes.findIndex(
					(key) => key === government,
				)
				if (index >= 0) counts[index]++
			}
		}
		return ERAS.governmentTypes.map((key, i) => ({
			label: ERAS.governmentTypeLabels[key],
			count: counts[i] ?? 0,
			color: GOVERNMENT_COLORS_CSS[i] ?? "rgb(148, 163, 184)",
		}))
	}, [earthGovernmentDistribution, history.query, nationProvinceCounts])

	const religionTypeDistribution = useMemo(() => {
		const relTypes = worldForDisplay?.religionTypes
		if (!relTypes || !history.query) return []
		const { provinceNation, provinceReligion } = history.query.frame

		// Per-nation accumulator: religion type → province count
		const nationBuckets = new Map<number, number[]>()
		for (let p = 0; p < provinceNation.length; p++) {
			const nationId = provinceNation[p]
			if (nationId < 0) continue
			const religionId = provinceReligion[p]
			if (religionId < 0) continue
			let buckets = nationBuckets.get(nationId)
			if (!buckets) {
				buckets = new Array<number>(RELIGION.religionTypeNames.length).fill(0)
				nationBuckets.set(nationId, buckets)
			}
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
	}, [worldForDisplay?.religionTypes, history.query])

	// Wars and diplomatic relations were procedural-sim products; Earth import
	// surfaces its own conflict data through history.
	const conflictDistribution = useMemo<DistributionBucket[]>(() => [], [])
	const relationDistribution = useMemo<DistributionBucket[]>(() => [], [])

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
		nationSizeDistribution,
		relationDistribution,
		religionTypeDistribution,
		showObservedDistributions,
		topographyDistribution,
		tradeGoodsDistribution,
		vegetationDistribution,
	}
}
