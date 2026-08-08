import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { TEXT } from "@/model/shared/text"
import { ERAS } from "@/model/society/eras"
import { RELIGION } from "@/model/society/religion"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { DistributionBucket } from "@/ui/genesis/details/shared"
import { GOVERNMENT_COLORS_CSS } from "@/ui/genesis/political/government-colors"
import { climateZoneColor } from "@/ui/genesis/shared/colors/misc"
import { vegetationColor } from "@/ui/genesis/shared/colors/vegetation"
import { getTopographyColor } from "@/ui/genesis/shared/region-colors/palette"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { DisplayNationModel } from "@/ui/genesis/view/display-model"

interface NationDetailsData {
	id: number
	name: string
	provinceCount: number
	totalPopulation: number
	color: string | null
	neighbors: Array<{
		id: number
		name: string
		color: string | null
	}>
	governmentType: string | null
	governmentColor: string | null
	cultureDistribution: DistributionBucket[]
	heritageDistribution: DistributionBucket[]
	religionDistribution: DistributionBucket[]
	climateDistribution: DistributionBucket[]
	vegetationDistribution: DistributionBucket[]
	topographyDistribution: DistributionBucket[]
}

function colorFromPartition(
	partition: { colors: Float32Array } | null | undefined,
	index: number,
): string {
	if (!partition || index < 0) return "rgb(148, 163, 184)"
	const base = index * 3
	if (base + 2 >= partition.colors.length) return "rgb(148, 163, 184)"
	return `rgb(${Math.round(partition.colors[base] * 255)}, ${Math.round(partition.colors[base + 1] * 255)}, ${Math.round(partition.colors[base + 2] * 255)})`
}

function buildPartitionDistribution(params: {
	provinces: readonly number[]
	getPartitionId: (province: number) => number
	getLabel: (id: number) => string
	getColor: (id: number) => string
}): DistributionBucket[] {
	const counts = new Map<number, number>()
	for (const province of params.provinces) {
		const id = params.getPartitionId(province)
		if (id < 0) continue
		counts.set(id, (counts.get(id) ?? 0) + 1)
	}
	return Array.from(counts.entries())
		.map(([id, count]) => ({
			label: params.getLabel(id),
			count,
			color: params.getColor(id),
		}))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Tallies a per-region zone array (climate/vegetation/topography -- all
 * indexed by mesh region, not province) over just the regions belonging to
 * this nation's provinces, via provinces.regionProvince's region->province
 * map. */
function buildRegionZoneDistribution(params: {
	memberProvinces: ReadonlySet<number>
	regionProvince: Int32Array
	values: ArrayLike<number> | undefined
	getLabel: (zone: number) => string
	getColor: (zone: number) => string
	excludeZones?: ReadonlySet<number>
}): DistributionBucket[] {
	const {
		memberProvinces,
		regionProvince,
		values,
		getLabel,
		getColor,
		excludeZones,
	} = params
	const counts = new Map<number, number>()
	if (values) {
		for (let region = 0; region < regionProvince.length; region++) {
			const province = regionProvince[region]
			if (province < 0 || !memberProvinces.has(province)) continue
			const zone = values[region]
			if (zone == null || excludeZones?.has(zone)) continue
			counts.set(zone, (counts.get(zone) ?? 0) + 1)
		}
	}
	return Array.from(counts.entries())
		.map(([zone, count]) => ({
			label: getLabel(zone),
			count,
			color: getColor(zone),
		}))
		.sort((a, b) => b.count - a.count)
}

function getNationNeighborIds(params: {
	selectedNationId: number
	world: SerializedGenesisWorld
	nationModel: DisplayNationModel
}): number[] {
	const { selectedNationId, world, nationModel } = params
	if (!world.provinces?.adjOffset || !world.provinces.adjList) return []
	const neighborIds = new Set<number>()
	for (let province = 0; province < world.provinces.count; province++) {
		if (nationModel.assignment[province] !== selectedNationId) continue
		for (
			let edge = world.provinces.adjOffset[province];
			edge < world.provinces.adjOffset[province + 1];
			edge++
		) {
			const neighborId = nationModel.assignment[world.provinces.adjList[edge]]
			if (
				neighborId < 0 ||
				neighborId === selectedNationId ||
				!nationModel.counts.has(neighborId)
			) {
				continue
			}
			neighborIds.add(neighborId)
		}
	}
	return Array.from(neighborIds).sort((a, b) => a - b)
}

export function buildSelectedNationDetails(params: {
	selectedNationId: number | null
	world: SerializedGenesisWorld | null
	nationModel: DisplayNationModel | null
	getNationColor: (nationId: number) => string | null
	getNationName: (nationId: number) => string
	getCultureName: (cultureId: number) => string
	getHeritageName: (heritageId: number) => string
}): NationDetailsData | null {
	const {
		selectedNationId,
		world,
		nationModel,
		getNationColor,
		getNationName,
		getCultureName,
		getHeritageName,
	} = params
	if (
		!world?.nations ||
		!world.provinces ||
		selectedNationId === null ||
		!nationModel
	) {
		return null
	}
	if (selectedNationId < 0 || !nationModel.counts.has(selectedNationId)) {
		return null
	}

	const provinceCount = nationModel.counts.get(selectedNationId) as number
	let totalPopulation = 0
	const memberProvinces: number[] = []
	for (let province = 0; province < world.provinces.count; province++) {
		if (nationModel.assignment[province] !== selectedNationId) continue
		memberProvinces.push(province)
		totalPopulation += world.population?.population[province] ?? 0
	}
	const memberProvinceSet = new Set(memberProvinces)

	const neighbors = getNationNeighborIds({
		selectedNationId,
		world,
		nationModel,
	}).map((neighborId) => ({
		id: neighborId,
		name: getNationName(neighborId),
		color: getNationColor(neighborId),
	}))

	const govIdx = world.nations.governmentType?.[selectedNationId] ?? -1
	const govKey = govIdx >= 0 ? (ERAS.governmentTypes[govIdx] ?? null) : null
	const governmentType = govKey
		? (ERAS.governmentTypeLabels[govKey] ?? null)
		: null
	const governmentColor =
		govIdx >= 0 ? (GOVERNMENT_COLORS_CSS[govIdx] ?? null) : null

	return {
		id: selectedNationId,
		name: getNationName(selectedNationId),
		provinceCount,
		totalPopulation,
		governmentType,
		governmentColor,
		color: getNationColor(selectedNationId),
		neighbors,
		cultureDistribution: buildPartitionDistribution({
			provinces: memberProvinces,
			getPartitionId: (province) => world.cultures?.assignment[province] ?? -1,
			getLabel: getCultureName,
			getColor: (id) => colorFromPartition(world.cultures, id),
		}),
		heritageDistribution: buildPartitionDistribution({
			provinces: memberProvinces,
			getPartitionId: (province) => {
				const cultureId = world.cultures?.assignment[province] ?? -1
				return cultureId >= 0
					? (world.heritages?.assignment[cultureId] ?? -1)
					: -1
			},
			getLabel: getHeritageName,
			getColor: (id) => colorFromPartition(world.heritages, id),
		}),
		religionDistribution: buildPartitionDistribution({
			provinces: memberProvinces,
			getPartitionId: (province) => {
				const cultureId = world.cultures?.assignment[province] ?? -1
				if (cultureId < 0) return -1
				return world.religions?.assignment[cultureId] ?? -1
			},
			getLabel: (id) => {
				const typeId = world.religionTypes?.[id] ?? -1
				return typeId >= 0
					? (RELIGION.religionTypeNames[typeId] ?? `Religion #${id}`)
					: `Religion #${id}`
			},
			getColor: (id) => {
				const typeId = world.religionTypes?.[id] ?? -1
				if (typeId < 0) return colorFromPartition(world.religions, id)
				const [r, g, b] =
					RELIGION.religionTypeColors[typeId] ?? RELIGION.religionTypeColors[0]
				return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
			},
		}),
		climateDistribution: buildRegionZoneDistribution({
			memberProvinces: memberProvinceSet,
			regionProvince: world.provinces.regionProvince,
			values: world.climateZones,
			getLabel: (zone) =>
				TEXT.titleCase(VEGETATION.climateLabels[zone] ?? `Climate #${zone}`),
			getColor: (zone) => rgbToCss(climateZoneColor(zone)),
			excludeZones: new Set([0]),
		}),
		vegetationDistribution: buildRegionZoneDistribution({
			memberProvinces: memberProvinceSet,
			regionProvince: world.provinces.regionProvince,
			values: world.vegetation,
			getLabel: (zone) =>
				TEXT.titleCase(VEGETATION.biomeLabels[zone] ?? `Biome #${zone}`),
			getColor: (zone) => rgbToCss(vegetationColor(zone)),
			excludeZones: new Set([0]),
		}),
		topographyDistribution: buildRegionZoneDistribution({
			memberProvinces: memberProvinceSet,
			regionProvince: world.provinces.regionProvince,
			values: world.topography,
			getLabel: (zone) =>
				TEXT.titleCase(
					CLASSIFICATION.genesisTopographyLabels[zone] ?? `Topography #${zone}`,
				),
			getColor: (zone) => {
				const color = getTopographyColor(zone)
				return color ? rgbToCss(color) : "rgb(148, 163, 184)"
			},
			excludeZones: new Set([
				CLASSIFICATION.topoLake,
				CLASSIFICATION.topoOcean,
			]),
		}),
	}
}

const NATION_BUCKETS: [number, number | null][] = [
	[50, null],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]

const NATION_BUCKET_COLORS = [
	"rgb(15, 23, 42)",
	"rgb(30, 41, 59)",
	"rgb(51, 65, 85)",
	"rgb(71, 85, 105)",
	"rgb(100, 116, 139)",
	"rgb(148, 163, 184)",
]

/** Settled land belonging to no nation, distinct from the nation bars. */
const UNCLAIMED_BUCKET_COLOR = "rgb(203, 213, 225)"

export function buildNationSizeDistribution(
	nationProvinceCounts: Map<number, number>,
	/**
	 * Count of habitable provinces held by no nation. Rendered as a trailing
	 * bar. Note this counts *provinces* where every other bar counts *nations*
	 * — there is no nation to count for unclaimed land, so the bar answers
	 * "how much land is stateless" alongside "how many nations are this big".
	 */
	unclaimedProvinceCount = 0,
): DistributionBucket[] {
	const buckets = NATION_BUCKETS.map(([min, max], index) => ({
		label: max === null ? `${min}+` : min === max ? `${min}` : `${min}-${max}`,
		count: Array.from(nationProvinceCounts.values()).filter(
			(size) => size >= min && (max === null || size <= max),
		).length,
		color: NATION_BUCKET_COLORS[index],
	}))
	buckets.push({
		label: "0",
		count: unclaimedProvinceCount,
		color: UNCLAIMED_BUCKET_COLOR,
	})
	return buckets
}
