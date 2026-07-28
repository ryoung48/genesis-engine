import { PASTA } from "@/model/climate/pasta"
import { RNG } from "@/model/shared/random/rng"
import type { LocationTradeGoods } from "@/model/society/infrastructure/trade/trade-goods/types"
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

function aridFallback({
	biome,
	zone,
}: {
	biome: number
	zone: number
}): string | null {
	if (biome !== 1 && biome !== 2) return null
	return zone <= 4 ? "cold_arid" : "arid"
}

function computeTradeGoods(params: {
	seed: number
	locations: {
		count: number
		regionLocation: Int32Array
		locationProvince: Int32Array
	}
	provinces: { desolate: Uint8Array }
	climateZones: Uint8Array
	vegetation: Uint8Array
	topography: Uint8Array
	coastal: Uint8Array
	numRegions: number
	pastaClimate?: Uint8Array
	[key: string]: unknown
}): LocationTradeGoods {
	const {
		seed,
		locations,
		provinces,
		climateZones,
		vegetation,
		topography,
		coastal,
		numRegions,
		pastaClimate,
	} = params
	const { count, regionLocation, locationProvince } = locations
	const { desolate } = provinces

	// Build per-location region lists for representative-cell sampling
	const locRegions: number[][] = Array.from(
		{ length: count },
		() => [] as number[],
	)
	for (let r = 0; r < numRegions; r++) {
		const l = regionLocation[r]
		if (l >= 0) locRegions[l]!.push(r)
	}

	const material = new Uint8Array(count)

	for (let l = 0; l < count; l++) {
		if (desolate[locationProvince[l]!]) continue

		const regions = locRegions[l]!
		if (regions.length === 0) continue

		// Seed per location: mix seed and location index
		const locSeed = (seed ^ (Math.imul(l, 0x9e3779b9) >>> 0)) >>> 0
		const dice = RNG.createRng({ seed: locSeed })

		// Pick a representative region at random for all attributes including coastal
		const r = regions[Math.floor(dice.random() * regions.length)]!

		const zone = climateZones[r]!
		const biome = vegetation[r]!
		const topo = topography[r]!
		const coast = coastal[r]! === 1 ? "coastal" : "inland"

		const topoKey = TOPO_TO_KEY[topo]
		if (!topoKey) continue // ocean or lake region

		const pasta = pastaClimate?.[r] ?? 0
		let climateKey: string | null
		if (PASTA_COLD_ARID.has(pasta)) climateKey = "cold_arid"
		else if (PASTA_ARID.has(pasta)) climateKey = "arid"
		else if (PASTA_OCEANIC.has(pasta)) climateKey = "oceanic"
		else if (PASTA_CONTINENTAL.has(pasta)) climateKey = "continental"
		else if (PASTA_MEDITERRANEAN.has(pasta)) climateKey = "mediterranean"
		else
			climateKey =
				aridFallback({ biome, zone }) ?? ZONE_TO_CLIMATE[zone] ?? null
		if (!climateKey) continue // ocean zone

		const vegKey = BIOME_TO_VEG[biome]
		if (!vegKey) continue // ocean biome

		const key = `${climateKey}|${vegKey}|${topoKey}|${coast}`
		const dist = TRADE_GOODS_TABLE[key] as
			| readonly (readonly [number, number])[]
			| undefined
		if (!dist || dist.length === 0) {
			// Fallback: drop coastal → try inland
			const fallbackKey = `${climateKey}|${vegKey}|${topoKey}|inland`
			const fallback = TRADE_GOODS_TABLE[fallbackKey] as
				| readonly (readonly [number, number])[]
				| undefined
			if (!fallback || fallback.length === 0) continue
			material[l] = dice.weightedChoice(
				fallback.map(([v, w]) => ({ v, w })),
			)!
		} else {
			material[l] = dice.weightedChoice(dist.map(([v, w]) => ({ v, w })))!
		}
	}

	return { material }
}

function tradeGoodColor(materialIndex: number): [number, number, number] {
	return TRADE_GOOD_COLORS[materialIndex] ?? TRADE_GOOD_COLORS[0]!
}

const TRADE_GOOD_COLORS: readonly [number, number, number][] = [
	[0.35, 0.33, 0.32], //  0: none         — neutral gray
	[0.412, 0.275, 0.263], //  1: alum         — #694643
	[0.627, 0.604, 0.149], //  2: amber        — #A09A26
	[0.62, 0.541, 0.157], //  3: beeswax      — approx #9E8A28
	[0.541, 0.157, 0.157], //  4: chili        — approx #8A2828
	[0.525, 0.349, 0.345], //  5: clay         — #865958
	[0.42, 0.29, 0.188], //  6: cloves       — approx #6B4A30
	[0.184, 0.31, 0.31], //  7: coal         — #2F4F4F
	[0.451, 0.275, 0.165], //  8: cocoa        — #73462A
	[0.29, 0.208, 0.145], //  9: coffee       — #4A3525
	[0.569, 0.463, 0.267], // 10: copper       — #917644
	[0.506, 0.529, 0.478], // 11: cotton       — #81877A
	[0.463, 0.255, 0.439], // 12: dyes         — #764170
	[0.576, 0.431, 0.278], // 13: elephants    — #936E47
	[0.129, 0.31, 0.208], // 14: fiber_crops  — #214F35
	[0.255, 0.427, 0.427], // 15: fish         — #416D6D
	[0.569, 0.329, 0.325], // 16: fruit        — #915453
	[0.447, 0.412, 0.365], // 17: fur          — #72695D
	[0.62, 0.553, 0.545], // 18: gems         — #9E8D8B
	[0.698, 0.62, 0.29], // 19: goods_gold   — #B29E4A
	[0.494, 0.475, 0.451], // 20: horses       — #7E7973
	[0.604, 0.439, 0.22], // 21: incense      — approx #9A7038
	[0.227, 0.243, 0.251], // 22: iron         — #3A3E40
	[0.596, 0.537, 0.486], // 23: ivory        — #98897C
	[0.302, 0.259, 0.561], // 24: lead         — #4D428F
	[0.243, 0.471, 0.459], // 25: legumes      — #3E7875
	[0.369, 0.478, 0.153], // 26: livestock    — #5E7A27
	[0.604, 0.624, 0.467], // 27: lumber       — #9A9F77
	[0.557, 0.475, 0.173], // 28: maize        — #8E792C
	[0.612, 0.592, 0.608], // 29: marble       — #9C979B
	[0.616, 0.49, 0.494], // 30: medicaments  — #9D7D7E
	[0.596, 0.392, 0.416], // 31: mercury      — #98646A
	[0.565, 0.549, 0.188], // 32: millet       — approx #908C30
	[0.306, 0.376, 0.043], // 33: olives       — #4E600B
	[0.671, 0.604, 0.545], // 34: pearls       — #AB9A8B
	[0.478, 0.522, 0.373], // 35: pepper       — approx #7A855F
	[0.608, 0.522, 0.412], // 36: potato       — #9B8569
	[0.333, 0.369, 0.271], // 37: rice         — #555E45
	[0.627, 0.376, 0.188], // 38: saffron      — approx #A06030
	[0.627, 0.651, 0.655], // 39: salt         — #A0A6A7
	[0.588, 0.604, 0.608], // 40: saltpeter    — approx #969A9B
	[0.612, 0.635, 0.478], // 41: sand         — #9CA27A
	[0.573, 0.184, 0.169], // 42: silk         — #922F2B
	[0.553, 0.573, 0.58], // 43: silver       — #8D9294
	[0.263, 0.29, 0.325], // 44: stone        — #434A53
	[0.608, 0.624, 0.525], // 45: sugar        — #9B9F86
	[0.098, 0.196, 0.078], // 46: tea          — #193214
	[0.361, 0.318, 0.298], // 47: tin          — #5C514C
	[0.365, 0.467, 0.376], // 48: tobacco      — #5D7760
	[0.576, 0.588, 0.212], // 49: wheat        — #939636
	[0.58, 0.58, 0.408], // 50: wild_game    — #949468
	[0.333, 0.204, 0.314], // 51: wine         — #553450
	[0.467, 0.51, 0.522], // 52: wool         — #778285
]

export const TRADE_GOODS = {
	tradeGoodDisplayName,
	computeTradeGoods,
	tradeGoodColor,
}
