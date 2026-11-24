import { useMemo } from "react"
import { KOPPEN } from "@/model/climate/classification/koppen"
import { PASTA } from "@/model/climate/classification/pasta"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { GOVERNMENT } from "@/model/history/earth/government"
import { RELIGION } from "@/model/history/sim/religion"
import { ERAS } from "@/model/society/eras"
import { TRADE_GOODS } from "@/model/society/infrastructure/trade/trade-goods"
import { TRADE_GOODS_TABLE } from "@/model/society/infrastructure/trade/trade-goods-table"
import { TECH_LEVEL } from "@/model/society/tech-level"
import type { DistributionBucket } from "@/ui/genesis/details/shared"
import { GOVERNMENT_COLORS_CSS } from "@/ui/genesis/political/government-colors"
import { buildNationSizeDistribution } from "@/ui/genesis/political/nation-size-distribution"
import { techLevelColor } from "@/ui/genesis/shared/colors/tech-level"
import { vegetationColor } from "@/ui/genesis/shared/colors/vegetation"
import { getTopographyColor } from "@/ui/genesis/shared/region-colors/palette"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { WorldDistributionsInput } from "@/ui/genesis/view/types"
import { buildDistribution } from "@/ui/wiki/stats/nation/nation-distributions"

export function useWorldDistributions(input: WorldDistributionsInput) {
	const { world, worldForDisplay, history, dataVariant, climateSubMode } = input
	const techLevelDistribution = useMemo((): DistributionBucket[] => {
		const population = worldForDisplay?.population
		if (!population) return []
		const settled: number[] = []
		for (let p = 0; p < population.techLevel.length; p++)
			if (
				Number.isFinite(population.techLevel[p]) &&
				population.population[p] > 0
			)
				settled.push(p)
		settled.sort((a, b) => population.techLevel[a] - population.techLevel[b])
		const eras = new Map<string, { provinces: number; mass: number }>()
		for (const p of settled) {
			const label = TECH_LEVEL.describe({
				techLevel: population.techLevel[p],
			})
			const era = eras.get(label) ?? { provinces: 0, mass: 0 }
			era.provinces++
			era.mass += population.techLevel[p]
			eras.set(label, era)
		}
		return Array.from(eras, ([label, { provinces, mass }]) => ({
			label,
			count: provinces,
			color: rgbToCss(techLevelColor(mass / provinces)),
		}))
	}, [worldForDisplay])

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

	const nationSizeDistribution = useMemo(
		() =>
			history.query ? buildNationSizeDistribution(history.query.frame) : [],
		[history.query],
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

	const showObservedDistributions =
		dataVariant === "observed" && !!world?.isEarthImport

	const climateDistribution = useMemo(() => {
		if (!world) return []
		const koppen = climateSubMode === "koppen"
		const values = koppen
			? showObservedDistributions
				? world.realKoppenClimate
				: world.koppenClimate
			: showObservedDistributions
				? world.realPastaClimate
				: world.pastaClimate
		if (!values) return []
		const landValues: number[] = []
		for (let i = 0; i < values.length; i++) {
			if (world.isLand[i]) landValues.push(values[i])
		}
		const labels = koppen
			? KOPPEN.koppenLabels.map((label) =>
					KOPPEN.koppenClimateName(KOPPEN.koppenLabels.indexOf(label)),
				)
			: PASTA.pastaLabels.map((label) =>
					PASTA.pastaClimateName(PASTA.pastaLabels.indexOf(label)),
				)
		return buildDistribution(
			labels,
			landValues,
			(index) =>
				rgbToCss(
					koppen
						? KOPPEN.koppenClimateColor(index)
						: PASTA.pastaClimateColor(index),
				),
			new Set([0]),
		)
	}, [world, climateSubMode, showObservedDistributions])

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
		techLevelDistribution,
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
