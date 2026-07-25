import { NATION_BUCKETS } from "./nations"

export type SocietyEra =
	| "paleolithic"
	| "neolithic"
	| "bronze"
	| "iron"
	| "lateMedieval"
	| "earlyModern"
	| "industrial"
	| "information"

/**
 * 29 government subtypes across 4 main groups plus colonial extensions.
 * Encoding: tribal 0–4, monarchy 5–12, republic 13–19, theocracy 20–22.
 * Indices 23–26 are republic extensions (socialist, junta, fascist, dictatorial).
 * Indices 27–28 are colonial types assigned by the post-pass (earlyModern+).
 */
export type GovernmentType =
	// tribal (0–4)
	| "chiefdom" // 0: small hereditary chief — default tribal
	| "tribal_monarchy" // 1: medium organised tribal kingdom
	| "tribal_federation" // 2: medium+ multi-tribe council
	| "native_council" // 3: small frontier indigenous council
	| "steppe_horde" // 4: large nomadic confederation — Mongols, Huns, Xiongnu
	// monarchy (5–12)
	| "feudal_monarchy" // 5: decentralised lords-and-vassals — ancient/medieval
	| "elective_monarchy" // 6: elected king — medium+
	| "absolute_monarchy" // 7: centralised crown, patrimonial administration — large, earlyModern+
	| "constitutional_monarchy" // 8: limited monarchy — earlyModern+
	| "dynastic_signoria" // 9: republic fallen under one dynastic lord — small, earlyModern (Medici, Visconti)
	| "warlord_state" // 10: fragmented post-imperial military rule — no legitimate succession
	| "shogunate" // 11: military rule under a figurehead monarch — large, institutionalized
	| "bureaucratic_monarchy" // 12: centralised crown, impersonal exam-selected bureaucracy — large (China)
	// republic (13–19)
	| "merchant_republic" // 13: trade oligarchy — small coastal core
	| "oligarchic_republic" // 14: aristocratic senate — medium ancient core
	| "free_city" // 15: self-governing city or league (poleis, Swiss cantons, HRE free cities) — medium
	| "peasant_republic" // 16: lord-less free-peasant commune — small coastal/marsh (Dithmarschen, Frisia)
	| "presidential_republic" // 17: elected executive — industrial+
	| "parliamentary_republic" // 18: legislature-led — industrial+
	| "pirate_republic" // 19: small outlaw haven — coastal, earlyModern
	// theocracy (20–22)
	| "theocracy" // 20: religious government — medium+, default
	| "monastic_state" // 21: military-religious order — small coastal
	| "imperial_cult" // 22: state religion as imperial authority — large
	// republic extensions (23–26)
	| "socialist_state" // 23: one-party socialist republic — industrial+
	| "military_junta" // 24: authoritarian military regime — industrial+
	| "fascist_state" // 25: totalitarian nationalist mass-party regime — industrial (WWII-era)
	| "dictatorial_rule" // 26: personalist authoritarian rule, no military/party institution — industrial+
	// colonial (27–28) — assigned by post-pass, not the normal gov mix
	| "trading_company" // 27: chartered company rule — earlyModern+, coastal
	| "settler_colony" // 28: settler-majority territory — industrial+, large

export const GOVERNMENT_TYPES: GovernmentType[] = [
	// tribal
	"chiefdom",
	"tribal_monarchy",
	"tribal_federation",
	"native_council",
	"steppe_horde",
	// monarchy
	"feudal_monarchy",
	"elective_monarchy",
	"absolute_monarchy",
	"constitutional_monarchy",
	"dynastic_signoria",
	"warlord_state",
	"shogunate",
	"bureaucratic_monarchy",
	// republic
	"merchant_republic",
	"oligarchic_republic",
	"free_city",
	"peasant_republic",
	"presidential_republic",
	"parliamentary_republic",
	"pirate_republic",
	// theocracy
	"theocracy",
	"monastic_state",
	"imperial_cult",
	// republic extensions
	"socialist_state",
	"military_junta",
	"fascist_state",
	"dictatorial_rule",
	// colonial
	"trading_company",
	"settler_colony",
]

export const GOVERNMENT_TYPE_LABELS: Record<GovernmentType, string> = {
	chiefdom: "Chiefdom",
	tribal_monarchy: "Tribal Monarchy",
	tribal_federation: "Tribal Federation",
	native_council: "Native Council",
	steppe_horde: "Steppe Horde",
	feudal_monarchy: "Feudal Monarchy",
	elective_monarchy: "Elective Monarchy",
	absolute_monarchy: "Absolute Monarchy",
	constitutional_monarchy: "Constitutional Monarchy",
	dynastic_signoria: "Dynastic Signoria",
	warlord_state: "Warlord State",
	shogunate: "Shogunate",
	bureaucratic_monarchy: "Bureaucratic Monarchy",
	merchant_republic: "Merchant Republic",
	oligarchic_republic: "Oligarchic Republic",
	free_city: "Free City",
	peasant_republic: "Peasant Republic",
	presidential_republic: "Presidential Republic",
	parliamentary_republic: "Parliamentary Republic",
	pirate_republic: "Pirate Republic",
	theocracy: "Theocracy",
	monastic_state: "Monastic State",
	imperial_cult: "Imperial Cult",
	socialist_state: "Socialist State",
	military_junta: "Military Junta",
	fascist_state: "Fascist State",
	dictatorial_rule: "Dictatorial Rule",
	trading_company: "Trading Company",
	settler_colony: "Settler Colony",
}

export type GovernmentFamily =
	| "tribal"
	| "monarchy"
	| "republic"
	| "theocracy"
	| "colonial"

/** Which of the 5 top-level families each subtype belongs to. Republic
 * extensions (socialist/junta/fascist/dictatorial) count as "republic" here. */
export const GOVERNMENT_TYPE_FAMILY: Record<GovernmentType, GovernmentFamily> =
	{
		chiefdom: "tribal",
		tribal_monarchy: "tribal",
		tribal_federation: "tribal",
		native_council: "tribal",
		steppe_horde: "tribal",
		feudal_monarchy: "monarchy",
		elective_monarchy: "monarchy",
		absolute_monarchy: "monarchy",
		constitutional_monarchy: "monarchy",
		dynastic_signoria: "monarchy",
		warlord_state: "monarchy",
		shogunate: "monarchy",
		bureaucratic_monarchy: "monarchy",
		merchant_republic: "republic",
		oligarchic_republic: "republic",
		free_city: "republic",
		peasant_republic: "republic",
		presidential_republic: "republic",
		parliamentary_republic: "republic",
		pirate_republic: "republic",
		theocracy: "theocracy",
		monastic_state: "theocracy",
		imperial_cult: "theocracy",
		socialist_state: "republic",
		military_junta: "republic",
		fascist_state: "republic",
		dictatorial_rule: "republic",
		trading_company: "colonial",
		settler_colony: "colonial",
	}

/** Fraction of nations assigned each government type. Must sum to ~1. */
export interface GovernmentMix {
	tribal: number
	monarchy: number
	republic: number
	theocracy: number
	/**
	 * Target fraction of total province mass to convert to colonial government
	 * via the post-pass. Drawn from tribal nations on different landmasses.
	 * Does not need to be included in the tribal/monarchy/republic/theocracy sum.
	 */
	colonial?: number
}

interface EraConfig {
	id: SocietyEra
	label: string
	/** Target world population at habitabilityScore = 1 */
	targetPopulation: number
	/**
	 * Fraction (0–1) of non-desolate provinces that are settled, taken from
	 * the lowest-wave end of the migration wave distribution. 1.0 = everywhere.
	 */
	settlementFraction: number
	/**
	 * Strength of the migration-distance falloff applied to population density.
	 */
	migrationFalloff: number
	/**
	 * Fraction (0–1) of settled provinces that are statehood-eligible.
	 */
	statehoodFraction: number
	/** Whether to generate any nations */
	hasNations: boolean
	/** Normalized budget weights across NATION_BUCKETS (or nationBuckets) */
	nationPercentages: number[]
	/** Province-count size ranges; aligns with nationPercentages indices */
	nationBuckets: [number, number][]
	/**
	 * Fraction of nations assigned each government type.
	 * Tribal nations tend to be small (1–4 provinces); state governments larger.
	 * Based on EU4 extended-timeline nation-count distributions.
	 */
	governmentMix: GovernmentMix
	/**
	 * How much nation size drives government type vs. era ideology (0–1).
	 * 1.0 = size alone determines government (ancient world: large=monarchy, tiny=tribal).
	 * 0.0 = era mix alone determines government (modern world: ideology transcends size).
	 * Also scales spatial modifier strength — geography matters less in modernity.
	 */
	governmentSizeWeight: number
}

function normalize(values: number[]): number[] {
	const sum = values.reduce((a, b) => a + b, 0) || 1
	return values.map((v) => v / sum)
}

export const ERA_CONFIGS: Record<SocietyEra, EraConfig> = {
	paleolithic: {
		id: "paleolithic",
		label: "Paleolithic",
		targetPopulation: 3e6,
		// All habitable land has some band presence by late paleolithic; migrationFalloff
		// concentrates population near cradles so density near zero at the frontier
		settlementFraction: 0.45,
		migrationFalloff: 12,
		statehoodFraction: 0,
		hasNations: false,
		nationPercentages: [],
		nationBuckets: [],
		governmentMix: { tribal: 1.0, monarchy: 0, republic: 0, theocracy: 0 },
		governmentSizeWeight: 1.0,
	},
	neolithic: {
		id: "neolithic",
		label: "Neolithic",
		targetPopulation: 10e6,
		// All continental land inhabited; remote Pacific/Madagascar still genuinely empty
		settlementFraction: 0.75,
		migrationFalloff: 8,
		statehoodFraction: 0.08,
		hasNations: true,
		// Only tiny chiefdoms (1–4 provinces)
		nationPercentages: normalize([0, 0, 0, 0, 0.15, 0.35, 0.5]),
		nationBuckets: NATION_BUCKETS,
		governmentMix: {
			tribal: 0.92,
			monarchy: 0.07,
			republic: 0,
			theocracy: 0.01,
		},
		// Size almost entirely determines gov — tiny chiefdoms are all tribal
		governmentSizeWeight: 0.9,
	},
	bronze: {
		id: "bronze",
		label: "Bronze Age",
		targetPopulation: 50e6,
		// Near-complete continental coverage; Pacific/Madagascar edge cases
		settlementFraction: 0.9,
		migrationFalloff: 5,
		statehoodFraction: 0.6,
		hasNations: true,
		// Count-calibrated against Bronze Age size-tier targets:
		// 56% [1], 33% [2-4], 9% [5-9], 2% [10-24], 1% [25-49], 0% [50-250], 0% [251-600]
		nationPercentages: normalize([
			0.0, 0.0, 0.128, 0.1176, 0.218, 0.3426, 0.1938,
		]),
		nationBuckets: NATION_BUCKETS,
		governmentMix: {
			tribal: 0.62,
			monarchy: 0.31,
			republic: 0.01,
			theocracy: 0.06,
		},
		// Size still strongly predicts gov; first city-state republics appear but rare
		governmentSizeWeight: 0.75,
	},
	iron: {
		id: "iron",
		label: "Iron Age",
		targetPopulation: 150e6,
		// All non-desolate land has at least band/tribal presence by the Iron Age
		settlementFraction: 1.0,
		migrationFalloff: 3,
		statehoodFraction: 0.8,
		hasNations: true,
		// Count-calibrated against Iron Age size-tier targets:
		// 41% [1], 38% [2-4], 15% [5-9], 4% [10-24], 1% [25-49], 1% [50-250], 1% [251-600]
		nationPercentages: normalize([
			0.4524, 0.1595, 0.0393, 0.0723, 0.1116, 0.1212, 0.0436,
		]),
		nationBuckets: NATION_BUCKETS,
		governmentMix: {
			tribal: 0.56,
			monarchy: 0.36,
			republic: 0.01,
			theocracy: 0.07,
		},
		// Size still the primary signal; coastal republics (Athens, Carthage) emerge
		governmentSizeWeight: 0.65,
	},
	lateMedieval: {
		id: "lateMedieval",
		label: "Late Medieval",
		targetPopulation: 300e6,
		settlementFraction: 1.0,
		migrationFalloff: 1.5,
		statehoodFraction: 1.0,
		hasNations: true,
		// Measured directly from EU4 extended-timeline ownership folded to
		// 1444.11.11 (public/earth-history/events/provinces.json): 711 nations
		// holding 2,563 provinces. Share of *provinces* per size bucket --
		// which is what buildNationPlan budgets against:
		//   50+   4.4%   25-49 13.8%   10-24 25.7%
		//   5-9  16.0%   2-4   27.3%   1     12.8%
		// By nation count that is 46.1% [1], 37.3% [2-4], 9.1% [5-9],
		// 5.9% [10-24], 1.4% [25-49], 0.1% [50+].
		//
		// These are taken as province shares rather than converted from count
		// shares: the previous weights assumed the 50-250 bucket averaged 150
		// provinces, which handed it 26.8% of all provinces. In 1444 the only
		// nation above 49 is Ming at 113, so that bucket is really 4.4%.
		nationPercentages: normalize([
			0.0, 0.044, 0.138, 0.257, 0.16, 0.273, 0.128,
		]),
		// Top bucket stays empty and the 50+ tier is capped near Ming's 113
		// rather than the shared 250 ceiling, so the largest generated nation
		// lands in the right range instead of doubling the real maximum.
		nationBuckets: [
			[251, 600],
			[50, 120],
			[25, 49],
			[10, 24],
			[5, 9],
			[2, 4],
			[1, 1],
		],
		governmentMix: {
			tribal: 0.44,
			monarchy: 0.48,
			republic: 0.02,
			theocracy: 0.06,
		},
		// Size and era roughly equal; geography (coast → republic) meaningful
		governmentSizeWeight: 0.55,
	},
	earlyModern: {
		id: "earlyModern",
		label: "Early Modern",
		targetPopulation: 600e6,
		settlementFraction: 1.0,
		migrationFalloff: 1.5,
		statehoodFraction: 1.0,
		hasNations: true,
		// Count-calibrated against Renaissance / Early Modern size-tier targets:
		// 51% [1], 33% [2-4], 8% [5-9], 5% [10-24], 2% [25-49], 1% [50-250], 1% [251-600]
		nationPercentages: normalize([
			0.4524, 0.1595, 0.0787, 0.0904, 0.0595, 0.1053, 0.0542,
		]),
		nationBuckets: NATION_BUCKETS,
		governmentMix: {
			tribal: 0.45,
			monarchy: 0.42,
			republic: 0.07,
			theocracy: 0.06,
			colonial: 0.04,
		},
		// Era ideology starts to matter more; mercantile republics spread beyond size norms
		governmentSizeWeight: 0.45,
	},
	industrial: {
		id: "industrial",
		label: "Industrial",
		targetPopulation: 1.2e9,
		settlementFraction: 1.0,
		migrationFalloff: 1.5,
		statehoodFraction: 1.0,
		hasNations: true,
		// Count-calibrated against Industrial size-tier targets:
		// 36% [1], 30% [2-4], 16% [5-9], 8% [10-24], 4% [25-49], 4% [50-250], 3% [251-600]
		nationPercentages: normalize([
			0.5322, 0.2502, 0.0617, 0.0567, 0.0467, 0.0375, 0.015,
		]),
		nationBuckets: NATION_BUCKETS,
		governmentMix: {
			tribal: 0.12,
			monarchy: 0.55,
			republic: 0.27,
			theocracy: 0.06,
			colonial: 0.12,
		},
		// Ideology (nationalism, constitutionalism) increasingly overrides size
		governmentSizeWeight: 0.3,
	},
	information: {
		id: "information",
		label: "Information Age",
		targetPopulation: 8e9,
		settlementFraction: 1.0,
		migrationFalloff: 1.5,
		statehoodFraction: 1.0,
		hasNations: true,
		// Count-calibrated against modern nation-state size-tier targets:
		// 22% [1], 15% [2-4], 21% [5-9], 23% [10-24], 10% [25-49], 6% [50-250], 3% [251-600]
		nationPercentages: normalize([
			0.405, 0.2856, 0.1174, 0.1241, 0.0466, 0.0143, 0.007,
		]),
		nationBuckets: NATION_BUCKETS,
		governmentMix: {
			tribal: 0.0,
			monarchy: 0.15,
			republic: 0.8,
			theocracy: 0.05,
		},
		// Era ideology dominates; Vatican, Monaco are republics/monarchies not because of size
		governmentSizeWeight: 0.15,
	},
}

export const DEFAULT_ERA: SocietyEra = "lateMedieval"

export function getEraConfig(era?: SocietyEra): EraConfig {
	return ERA_CONFIGS[era ?? DEFAULT_ERA]
}

export const ERA_ORDER: SocietyEra[] = [
	"paleolithic",
	"neolithic",
	"bronze",
	"iron",
	"lateMedieval",
	"earlyModern",
	"industrial",
	"information",
]

export function wavePercentileThreshold(
	migrationWave: Float32Array,
	desolate: Uint8Array,
	fraction: number,
): number {
	if (fraction >= 1.0) return 1.0
	if (fraction <= 0) return 0

	const waves: number[] = []
	for (let p = 0; p < migrationWave.length; p++) {
		if (!desolate[p] && migrationWave[p] >= 0) waves.push(migrationWave[p])
	}
	if (waves.length === 0) return 1.0

	waves.sort((a, b) => a - b)
	const idx = Math.min(Math.floor(fraction * waves.length), waves.length - 1)
	return waves[idx]
}
