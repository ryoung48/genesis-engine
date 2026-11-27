import { PASTA } from "@/model/climate/classification/pasta"
import { RNG } from "@/model/shared/random/rng"
import { LIVESTOCK_VOYAGES } from "@/model/society/farming/livestock-voyages"
import { REGIONAL_GOODS } from "@/model/society/infrastructure/trade/trade-goods/regional"
import type {
	DominantClassParams,
	DrawParams,
	FarmlandParams,
	GateKind,
	GateRowParams,
	LocationClass,
	LocationOptions,
	LocationTradeGoods,
	TableRow,
	TradeGoodsParams,
} from "@/model/society/infrastructure/trade/trade-goods/types"
import { TRADE_GOODS_TABLE } from "@/model/society/infrastructure/trade/trade-goods-table"

function tradeGoodDisplayName(label: string): string {
	return label
		.replace(/^goods_/, "")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase())
}

const ZONE_TO_CLIMATE: readonly (string | null)[] = [
	null, // 0 ocean
	"arctic", // 1 arctic
	"arctic", // 2 subarctic
	"arctic", // 3 boreal
	"continental", // 4 temperate → default; pasta overrides to "oceanic" or "mediterranean"
	"subtropical", // 5 subtropical → default; pasta overrides to "mediterranean"
	"tropical", // 6 tropical
	"tropical", // 7 infernal
	"arctic", // 8 chaotic (fallback)
]

function pastaIndex(label: string): number {
	return PASTA.pastaLabels.indexOf(label as (typeof PASTA.pastaLabels)[number])
}

const PASTA_OCEANIC = new Set([
	pastaIndex("CDa"),
	pastaIndex("CDap"),
	pastaIndex("CEa"),
	pastaIndex("CEap"),
])

const PASTA_CONTINENTAL = new Set([pastaIndex("CDb"), pastaIndex("CDbp")])

const PASTA_MEDITERRANEAN = new Set([
	pastaIndex("CMa"),
	pastaIndex("CMb"),
	pastaIndex("CAMa"),
	pastaIndex("CAMb"),
])

const PASTA_COLD_ARID = new Set([pastaIndex("Adc"), pastaIndex("Ahc")])

const PASTA_ARID = new Set([
	pastaIndex("Ada"),
	pastaIndex("Adh"),
	pastaIndex("Ade"),
	pastaIndex("Aha"),
	pastaIndex("Ahh"),
	pastaIndex("Ahe"),
])

const BIOME_TO_VEG: readonly (string | null)[] = [
	null, // 0 ocean
	"desert", // 1 desert
	"sparse", // 2 sparse
	"grasslands", // 3 grasslands
	"woods", // 4 woods
	"forest", // 5 forest
	"jungle", // 6 jungle
]

const TOPO_TO_KEY: readonly (string | null)[] = [
	"flatland", // 0 flat
	"hills", // 1 hill
	"plateau", // 2 plateau
	"mountains", // 3 mountain
	"wetlands", // 4 marsh
	null, // 5 ocean — no material
	null, // 6 lake — no material
]

// EU5 farmland share of goods-bearing locations per climate and per
// topography (EU5toGIS locations.gpkg: 20,846 locations, 766 farmland).
const FARMLAND_CLIMATE_SHARE: Readonly<Record<string, number>> = {
	arctic: 0,
	cold_arid: 0.0204,
	arid: 0.0466,
	continental: 0.0344,
	oceanic: 0.0762,
	mediterranean: 0.1005,
	subtropical: 0.0613,
	tropical: 0.0127,
}
const FARMLAND_TOPO_SHARE: Readonly<Record<string, number>> = {
	flatland: 0.0588,
	wetlands: 0.0656,
	plateau: 0.0154,
	hills: 0.012,
	mountains: 0.0025,
}
// Farmland only where most people farm, the majority rule capitals use.
const FARMLAND_MIN_FARM_SHARE = 0.5

// Goods people grow: weighted by the province's farm share at the start year.
const CROP_GOODS = new Set([
	"grain",
	"legumes",
	"cotton",
	"sugar",
	"tobacco",
	"cocoa",
	"coffee",
	"tea",
	"spices",
	"olives",
	"wine",
	"fruit",
	"fiber_crops",
	"silk",
])
// Goods from herd animals: only where herds have arrived, weighted by farm
// plus herd share (mixed farming keeps livestock too).
const ANIMAL_GOODS = new Set(["livestock", "wool", "horses"])
// Goods EU5 confines to one region well beyond what climate explains (3.8 to
// 6.9 times the climate table's concentration at 500 to 4,000 km for cocoa and
// tobacco): each is held to the landmass where it first rolls, until ships
// cross the open ocean (the Columbian Exchange level livestock voyages use) and
// the crops travel world-wide.
const REGIONAL = ["tobacco", "cocoa", "tea", "coffee"]
// Lowest leader tech level a good appears at, on the tech-level scale's ages
// (society/tech-level DESCRIPTORS): copper and tin with copper smelting and
// bronze (TL 1, Copper Age); iron with the Iron Age (TL 2); coal at TL 2 too,
// burnt as fuel in Han China; saltpeter with gunpowder (TL 3, Tang China, Early
// Middle Ages); oil and gas with the first commercial wells of the 1850s (TL 5,
// Industrial Revolution).
const GOOD_MIN_TECH_LEVEL: Readonly<Record<string, number>> = {
	copper: 1,
	tin: 1,
	iron: 2,
	coal: 2,
	saltpeter: 3,
	oil_and_gas: 5,
}
// Wild goods keep full weight in forager land and fall to this share of it in
// fully farmed or herded land: EU5's share of the good in farmed Europe over
// its share in mostly foraging North America, continental climate only
// (EU5toGIS; 2,090 and 908 locations). Ivory is hunted like game.
const WILD_FARMED_SHARE: Readonly<Record<string, number>> = {
	wild_game: 0.32,
	ivory: 0.32,
	fur: 0.25,
	lumber: 0.41,
}
// Share of EU5's goods-bearing locations per climate in forager land in 1337:
// North America north of 24° N, Siberia, Australia, the Amazon and South
// America south of 35° S (EU5toGIS; 4,105 of 20,846 locations). The table's
// rows average over these and farmed land, so forager land gets
// ×1/(φ + (1 − φ) r), the weight that row average implies there; farmed land
// keeps the full ×r cut.
const FORAGER_SHARE: Readonly<Record<string, number>> = {
	arctic: 0.657,
	cold_arid: 0.201,
	continental: 0.192,
	subtropical: 0.16,
	arid: 0.113,
	oceanic: 0.107,
	tropical: 0.086,
	mediterranean: 0.057,
}

const CLIMATES = [
	"arctic",
	"cold_arid",
	"arid",
	"continental",
	"oceanic",
	"mediterranean",
	"subtropical",
	"tropical",
] as const

function climateCode(climate: string | null): number {
	return climate ? CLIMATES.indexOf(climate as (typeof CLIMATES)[number]) : -1
}

const COLD_ARID = climateCode("cold_arid")
const ARID = climateCode("arid")

const ZONE_CLIMATE = new Int8Array(256).fill(-1)
ZONE_TO_CLIMATE.forEach((climate, zone) => {
	ZONE_CLIMATE[zone] = climateCode(climate)
})

// Pasta classes that set the climate outright; later sets take priority.
const PASTA_CLIMATE = new Int8Array(256).fill(-1)
for (const [codes, climate] of [
	[PASTA_MEDITERRANEAN, "mediterranean"],
	[PASTA_CONTINENTAL, "continental"],
	[PASTA_OCEANIC, "oceanic"],
	[PASTA_ARID, "arid"],
	[PASTA_COLD_ARID, "cold_arid"],
] as const)
	for (const code of codes)
		if (code >= 0) PASTA_CLIMATE[code] = climateCode(climate)

// The location's most common climate, vegetation and topography (the first to
// reach the top count wins ties); coastal when any of its regions touches the
// coast, like an EU5 location with a port. Each region's class is packed as
// climate · 64 + biome · 8 + topography.
function dominantClass({
	regions,
	params,
}: DominantClassParams): LocationClass | null {
	const keys: number[] = []
	const counts: number[] = []
	let coastal = false
	let best = -1
	let bestCount = 0
	for (const region of regions) {
		const topography = params.topography[region]!
		if (!TOPO_TO_KEY[topography]) continue
		const biome = params.vegetation[region]!
		if (!BIOME_TO_VEG[biome]) continue
		const zone = params.climateZones[region]!
		let climate = PASTA_CLIMATE[params.pastaClimate[region]!]!
		if (climate < 0)
			climate =
				biome === 1 || biome === 2
					? zone <= 4
						? COLD_ARID
						: ARID
					: ZONE_CLIMATE[zone]!
		if (climate < 0) continue
		if (params.coastal[region] === 1) coastal = true
		const key = climate * 64 + biome * 8 + topography
		let index = keys.indexOf(key)
		if (index < 0) {
			index = keys.length
			keys.push(key)
			counts.push(0)
		}
		counts[index]!++
		if (counts[index]! > bestCount) {
			best = key
			bestCount = counts[index]!
		}
	}
	if (best < 0) return null
	return {
		climate: CLIMATES[best >> 6]!,
		vegetation: BIOME_TO_VEG[(best >> 3) & 7]!,
		topography: TOPO_TO_KEY[best & 7]!,
		coast: coastal ? "coastal" : "inland",
	}
}

// Marks the densest farming locations as farmland until each climate holds
// EU5's farmland share, preferring EU5's farmland topographies.
function farmland({ classes, params }: FarmlandParams): Uint8Array {
	const marked = new Uint8Array(classes.length)
	const { wayOfLife } = params
	if (!wayOfLife) return marked
	const byClimate = new Map<
		string,
		{ total: number; ranked: [number, number][] }
	>()
	classes.forEach((cls, l) => {
		if (!cls) return
		const group = byClimate.get(cls.climate) ?? { total: 0, ranked: [] }
		group.total++
		byClimate.set(cls.climate, group)
		const p = params.locations.locationProvince[l]!
		const farm = wayOfLife.farm[p]!
		if (farm < FARMLAND_MIN_FARM_SHARE) return
		const score =
			farm * wayOfLife.density[p]! * (FARMLAND_TOPO_SHARE[cls.topography] ?? 0)
		if (score > 0) group.ranked.push([l, score])
	})
	for (const [climate, group] of byClimate) {
		const quota = Math.round(
			(FARMLAND_CLIMATE_SHARE[climate] ?? 0) * group.total,
		)
		group.ranked.sort((a, b) => b[1] - a[1] || a[0] - b[0])
		for (const [l] of group.ranked.slice(0, quota)) marked[l] = 1
	}
	return marked
}

const GOOD_GATE: readonly GateKind[] = TRADE_GOODS_TABLE.tradeGoodLabels.map(
	(label) => {
		if (CROP_GOODS.has(label)) return "crop"
		if (ANIMAL_GOODS.has(label)) return "animal"
		if (WILD_FARMED_SHARE[label] !== undefined) return "wild"
		return "free"
	},
)
const GOOD_WILD_SHARE: readonly number[] =
	TRADE_GOODS_TABLE.tradeGoodLabels.map(
		(label) => WILD_FARMED_SHARE[label] ?? 1,
	)

// Writes the row's gated weights into the options at `at`; true when any is
// positive.
function gateRow({ row, gates, options, at }: GateRowParams): boolean {
	const { farm, settled, herdArrived, forager } = gates
	let any = false
	row.forEach(([good, weight], i) => {
		const kind = GOOD_GATE[good]
		let w = weight
		if (kind === "crop") w = weight * farm
		else if (kind === "animal") w = weight * (herdArrived ? settled : 0)
		else if (kind === "wild") {
			const wild = GOOD_WILD_SHARE[good]!
			const boost = 1 / (forager + (1 - forager) * wild)
			w = weight * ((1 - settled) * boost + wild * settled)
		}
		options.goods[at + i] = good
		options.weights[at + i] = w
		if (w > 0) any = true
	})
	return any
}

function draw({ seed, options, pick }: DrawParams): Uint8Array {
	const { start, goods, weights } = options
	const material = new Uint8Array(pick.length)
	for (let l = 0; l < pick.length; l++) {
		const from = start[l]!
		const length = start[l + 1]! - from
		if (!pick[l] || length === 0) continue
		const locSeed = (seed ^ (Math.imul(l, 0x9e3779b9) >>> 0)) >>> 0
		const index = RNG.createRng({ seed: locSeed }).weightedIndex({
			length,
			weightAt: (i) => weights[from + i]!,
		})
		material[l] = index < 0 ? 0 : goods[from + index]!
	}
	return material
}

// Table rows without the goods the world's tech level has not reached, cached
// per key; a row left empty is no row.
function availableRows(
	leaderTechLevel: number,
): (key: string) => TableRow | null {
	const allowed = TRADE_GOODS_TABLE.tradeGoodLabels.map(
		(label) => (GOOD_MIN_TECH_LEVEL[label] ?? 0) <= leaderTechLevel,
	)
	const cache = new Map<string, TableRow | null>()
	return (key) => {
		let row = cache.get(key)
		if (row === undefined) {
			const full = (TRADE_GOODS_TABLE[key] as TableRow | undefined) ?? []
			const kept = full.filter(([good]) => allowed[good])
			row = kept.length > 0 ? kept : null
			cache.set(key, row)
		}
		return row
	}
}

function computeTradeGoods(params: TradeGoodsParams): LocationTradeGoods {
	const { seed, locations, provinces, numRegions } = params
	const { count, regionLocation, locationProvince } = locations

	const locRegions = Array.from({ length: count }, (): number[] => [])
	for (let r = 0; r < numRegions; r++) {
		const l = regionLocation[r]
		if (l >= 0) locRegions[l]!.push(r)
	}

	const classes = locRegions.map((regions, l) =>
		provinces.desolate[locationProvince[l]!] || regions.length === 0
			? null
			: dominantClass({ regions, params }),
	)
	const isFarmland = farmland({ classes, params })
	const tableRow = availableRows(params.leaderTechLevel)
	const rows = classes.map((cls, l) => {
		if (!cls) return null
		const { climate, topography, coast } = cls
		const vegetations = isFarmland[l]
			? ["farmland", cls.vegetation]
			: [cls.vegetation]
		for (const vegetation of vegetations) {
			const row =
				tableRow(`${climate}|${vegetation}|${topography}|${coast}`) ??
				tableRow(`${climate}|${vegetation}|${topography}|inland`)
			if (row) return row
		}
		return null
	})

	const { wayOfLife } = params
	const start = new Int32Array(count + 1)
	rows.forEach((row, l) => {
		start[l + 1] = start[l]! + (row?.length ?? 0)
	})
	const options: LocationOptions = {
		start,
		goods: new Uint8Array(start[count]!),
		weights: new Float64Array(start[count]!),
	}
	rows.forEach((row, l) => {
		if (!row) return
		const at = start[l]!
		if (wayOfLife) {
			const province = locationProvince[l]!
			const farm = wayOfLife.farm[province]!
			const gates = {
				farm,
				settled: farm + wayOfLife.herd[province]!,
				herdArrived:
					wayOfLife.herdAdoptionYear[province]! <= wayOfLife.startYear,
				forager: FORAGER_SHARE[classes[l]!.climate] ?? 0,
			}
			if (gateRow({ row, gates, options, at })) return
		}
		row.forEach(([good, weight], i) => {
			options.goods[at + i] = good
			options.weights[at + i] = weight
		})
	})
	const firstDraw = draw({ seed, options, pick: new Uint8Array(count).fill(1) })
	if (params.leaderTechLevel >= LIVESTOCK_VOYAGES.openOceanLevel)
		return { material: firstDraw }
	const seedRegions = Array.from(
		{ length: count },
		(_, l) => locations.seeds[l]!,
	)
	const confined = REGIONAL_GOODS.confine({
		goods: REGIONAL.map((label) =>
			TRADE_GOODS_TABLE.tradeGoodLabels.indexOf(label),
		),
		options,
		material: firstDraw,
		landmass: Int32Array.from(seedRegions, (r) => params.regionLandmark[r]!),
		coastal: Uint8Array.from(classes, (cls) =>
			cls?.coast === "coastal" ? 1 : 0,
		),
		xyz: Float32Array.from(
			{ length: 3 * count },
			(_, i) => params.r_xyz[3 * seedRegions[Math.floor(i / 3)]! + (i % 3)]!,
		),
	})
	const redrawn = draw({ seed, options, pick: confined })
	const material = Uint8Array.from(firstDraw, (good, l) =>
		confined[l] ? redrawn[l]! : good,
	)

	return { material }
}

function tradeGoodColor(materialIndex: number): [number, number, number] {
	const label = TRADE_GOODS_TABLE.tradeGoodLabels[materialIndex] ?? "none"
	return TRADE_GOOD_COLORS[label] ?? TRADE_GOOD_COLORS.none!
}

const TRADE_GOOD_COLORS: Readonly<Record<string, [number, number, number]>> = {
	alum: [0.31, 0.525, 0.659], // #4F86A8
	beeswax: [0.769, 0.573, 0.165], // #C4922A
	clay: [0.651, 0.369, 0.306], // #A65E4E
	coal: [0.133, 0.137, 0.165], // #22232A
	cocoa: [0.431, 0.255, 0.157], // #6E4128
	coffee: [0.227, 0.137, 0.094], // #3A2318
	copper: [0.761, 0.412, 0.184], // #C2692F
	cotton: [0.498, 0.655, 0.604], // #7FA79A
	dyes: [0.494, 0.235, 0.612], // #7E3C9C
	fiber_crops: [0.612, 0.69, 0.29], // #9CB04A
	fish: [0.122, 0.416, 0.6], // #1F6A99
	fruit: [0.824, 0.282, 0.353], // #D2485A
	fur: [0.545, 0.439, 0.333], // #8B7055
	gems: [0.059, 0.522, 0.576], // #0F8593
	goods_gold: [0.659, 0.502, 0.039], // #A8800A
	grain: [0.561, 0.545, 0.18], // #8F8B2E
	horses: [0.478, 0.306, 0.165], // #7A4E2A
	incense: [0.71, 0.475, 0.227], // #B5793A
	iron: [0.243, 0.267, 0.282], // #3E4448
	ivory: [0.639, 0.541, 0.416], // #A38A6A
	lead: [0.29, 0.353, 0.541], // #4A5A8A
	legumes: [0.306, 0.604, 0.227], // #4E9A3A
	livestock: [0.478, 0.416, 0.247], // #7A6A3F
	lumber: [0.71, 0.541, 0.369], // #B58A5E
	marble: [0.49, 0.478, 0.549], // #7D7A8C
	medicaments: [0.247, 0.627, 0.627], // #3FA0A0
	mercury: [0.561, 0.69, 0.741], // #8FB0BD
	none: [0.549, 0.549, 0.549], // #8C8C8C
	oil_and_gas: [0.118, 0.588, 0.392], // #1E9664, the deposits map colour
	olives: [0.369, 0.478, 0.173], // #5E7A2C
	pearls: [0.71, 0.486, 0.557], // #B57C8E
	salt: [0.353, 0.561, 0.769], // #5A8FC4
	saltpeter: [0.62, 0.604, 0.306], // #9E9A4E
	sand: [0.722, 0.604, 0.369], // #B89A5E
	silk: [0.643, 0.141, 0.231], // #A4243B
	silver: [0.604, 0.639, 0.671], // #9AA3AB
	spices: [0.878, 0.471, 0.106], // #E0781B
	stone: [0.361, 0.322, 0.275], // #5C5246
	sugar: [0.612, 0.573, 0.463], // #9C9276
	tea: [0.122, 0.361, 0.227], // #1F5C3A
	tin: [0.416, 0.522, 0.58], // #6A8594
	tobacco: [0.31, 0.42, 0.227], // #4F6B3A
	wild_game: [0.494, 0.353, 0.282], // #7E5A48
	wine: [0.427, 0.102, 0.212], // #6D1A36
	wool: [0.663, 0.627, 0.549], // #A9A08C
}

export const TRADE_GOODS = {
	tradeGoodDisplayName,
	computeTradeGoods,
	tradeGoodColor,
}
