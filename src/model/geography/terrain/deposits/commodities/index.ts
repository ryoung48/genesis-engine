import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import type {
	CommoditiesAtParams,
	CommodityAtParams,
	CommodityId,
	CommodityInfo,
	DepositShares,
	GradeShares,
	SharesParams,
} from "@/model/geography/terrain/deposits/commodities/types"
import { SYSTEMS } from "@/model/geography/terrain/deposits/systems"

const BYTE = 255
const REST = 0.15
const [POOR, MODERATE, RICH] = DEPOSIT_CONFIG.grades

const LIST: readonly CommodityInfo[] = [
	{
		id: "iron",
		name: "Iron",
		group: "metal",
		rgb: [196, 84, 60],
		words:
			"the commonest ore — in most mountain belts, in bogs, beds and crusts: what the Iron Age needed was fuel and skill, not ore",
		sources: [
			["bogIron", 1],
			["ironstone", 1],
			["ironLaterite", 1],
			["bif", 1],
			["iocg", 0.7],
			["skarn", 0.5],
			["ironVein", 1],
			["ioa", 1],
		],
	},
	{
		id: "copper",
		name: "Copper",
		group: "metal",
		rgb: [222, 128, 56],
		words:
			"over volcanic arcs, in sea-floor sulfides and skarns, native in rift basalts",
		sources: [
			["porphyry", 1],
			["vms", 0.8],
			["supergene", 1],
			["skarn", 0.6],
			["nativeCopper", 0.9],
			["iocg", 0.6],
			["magmatic", 0.4],
		],
	},
	{
		id: "gold",
		name: "Gold",
		group: "metal",
		rgb: [244, 204, 64],
		words:
			"in the veins of old collision belts and over young arcs, and down their rivers",
		sources: [
			["orogenicGold", 1],
			["epithermal", 1],
			["placerGold", 1],
			["greenstoneGold", 1],
			["reef", 1],
			["porphyry", 0.2],
			["iocg", 0.3],
			["gossan", 0.3],
			["vms", 0.15],
		],
	},
	{
		id: "silver",
		name: "Silver",
		group: "metal",
		rgb: [70, 100, 220],
		words:
			"with gold over young arcs, with lead in basins, and in weathered caps",
		sources: [
			["epithermal", 0.9],
			["sedex", 0.85],
			["gossan", 0.85],
			["vms", 0.4],
			["supergene", 0.4],
			["mvt", 0.25],
		],
	},
	{
		id: "tin",
		name: "Tin",
		group: "metal",
		rgb: [80, 196, 206],
		words:
			"granites far inboard of collisions and arcs, and the streams below them — scarce, and traded far",
		sources: [
			["tin", 1],
			["placerTin", 1],
		],
	},
	{
		id: "leadZinc",
		name: "Lead and zinc",
		group: "metal",
		rgb: [132, 140, 210],
		words: "in the limestone and shale of sedimentary basins, and with copper",
		sources: [
			["mvt", 1],
			["sedex", 1],
			["vms", 0.6],
			["skarn", 0.4],
		],
	},
	{
		id: "salt",
		name: "Salt",
		group: "metal",
		rgb: [236, 160, 206],
		words: "salt lakes, pans and flats of dry country, and old salt beds",
		sources: [["salt", 1]],
	},
	{
		id: "coal",
		name: "Coal",
		group: "fuel",
		rgb: [52, 48, 48],
		words: "old swamps of basins that lay in a wet belt",
		sources: [["coal", 1]],
	},
	{
		id: "oilGas",
		name: "Oil and gas",
		group: "fuel",
		rgb: [30, 150, 100],
		words:
			"buried, trapped and sealed in sedimentary basins — on land and offshore; seeps and tar where lifted",
		sources: [
			["oil", 1],
			["gas", 0.9],
			["bitumen", 0.6],
		],
	},
	{
		id: "stone",
		name: "Building stone",
		group: "building",
		rgb: [196, 168, 120],
		words: "bedrock that can be got at: crags, scarps and scoured shields",
		sources: [["stone", 1]],
	},
	{
		id: "marble",
		name: "Marble",
		group: "building",
		rgb: [120, 180, 160],
		words: "limestone baked in a mountain belt",
		sources: [["stoneMarble", 1]],
	},
	{
		id: "clay",
		name: "Clay",
		group: "building",
		rgb: [190, 100, 70],
		words: "river plains and shale lowlands — brick where stone is scarce",
		sources: [["clay", 1]],
	},
	{
		id: "sand",
		name: "Sand",
		group: "building",
		rgb: [222, 200, 140],
		words: "the dunes of sand seas and the beaches of sandy coasts",
		sources: [["sand", 1]],
	},
	{
		id: "alum",
		name: "Alum",
		group: "mineral",
		rgb: [176, 120, 110],
		words: "acid-altered volcanic ground and black alum shale",
		sources: [["alum", 1]],
	},
	{
		id: "mercury",
		name: "Mercury",
		group: "mineral",
		rgb: [200, 90, 110],
		words: "cinnabar of hot-spring and serpentinite districts",
		sources: [["mercury", 1]],
	},
	{
		id: "saltpeter",
		name: "Saltpeter",
		group: "mineral",
		rgb: [150, 200, 70],
		words: "nitrate crusts of dry, porous ground",
		sources: [["saltpeter", 1]],
	},
	{
		id: "amber",
		name: "Amber",
		group: "gem",
		rgb: [226, 160, 30],
		words: "fossil resin washed from coaly coastal sediment",
		sources: [["amber", 1]],
	},
	{
		id: "gems",
		name: "Gems",
		group: "gem",
		rgb: [160, 90, 210],
		words:
			"pegmatites, marbles, basalts, dry-country silica, kimberlites and the gravels below them",
		sources: [
			["pegmatite", 1],
			["emerald", 1],
			["corundum", 1],
			["lapis", 1],
			["basaltGems", 1],
			["amethyst", 1],
			["opal", 1],
			["turquoise", 1],
			["gemPlacer", 1],
			["kimberlite", 1],
			["placerDiamond", 1],
			["garnet", 0.25],
		],
	},
]

const INDEX = Object.fromEntries(LIST.map((c, i) => [c.id, i])) as Record<
	CommodityId,
	number
>
const SOURCE_ROWS = LIST.map((c) =>
	Int32Array.from(c.sources, ([id]) => SYSTEMS.index[id]),
)
const SOURCE_WEIGHTS = LIST.map((c) =>
	Float64Array.from(c.sources, ([, weight]) => weight),
)

function combine(strongest: number, total: number): number {
	return Math.min(1, strongest + REST * (total - strongest))
}

function richness({
	rows,
	numRegions,
	region,
	commodity,
}: CommodityAtParams): number {
	const sourceRows = SOURCE_ROWS[commodity]
	const weights = SOURCE_WEIGHTS[commodity]
	let strongest = 0
	let total = 0
	for (let i = 0; i < sourceRows.length; i++) {
		const v = (weights[i] * rows[sourceRows[i] * numRegions + region]) / BYTE
		if (v > strongest) strongest = v
		total += v
	}
	return combine(strongest, total)
}

function all({ rows, numRegions, region, out }: CommoditiesAtParams): void {
	for (let k = 0; k < LIST.length; k++)
		out[k] = richness({ rows, numRegions, region, commodity: k })
}

function grade(value: number): number {
	if (value >= RICH) return 3
	if (value >= MODERATE) return 2
	if (value >= POOR) return 1
	return 0
}

function emptyShares(count: number): GradeShares[] {
	return Array.from({ length: count }, () => ({
		poor: 0,
		moderate: 0,
		rich: 0,
	}))
}

function shares({ rows, numRegions, land }: SharesParams): DepositShares {
	const system = emptyShares(SYSTEMS.count)
	const commodity = emptyShares(LIST.length)
	const at = new Float32Array(LIST.length)
	let landRegions = 0
	const tally = (into: GradeShares, value: number) => {
		const g = grade(value)
		if (g >= 3) into.rich++
		else if (g === 2) into.moderate++
		else if (g === 1) into.poor++
	}
	for (let r = 0; r < numRegions; r++) {
		if (!land[r]) continue
		landRegions++
		for (let k = 0; k < SYSTEMS.count; k++)
			tally(system[k], rows[k * numRegions + r] / BYTE)
		all({ rows, numRegions, region: r, out: at })
		for (let k = 0; k < LIST.length; k++) tally(commodity[k], at[k])
	}
	const scale = landRegions ? 100 / landRegions : 0
	for (const g of [...system, ...commodity]) {
		g.poor *= scale
		g.moderate *= scale
		g.rich *= scale
	}
	return { system, commodity }
}

export const COMMODITIES = {
	list: LIST,
	index: INDEX,
	count: LIST.length,
	richness,
	all,
	grade,
	shares,
}
