import type {
	EraConfig,
	SocietyEra,
	GovernmentType,
	GovernmentFamily,
} from "@/model/society/types"
import type { WavePercentileThresholdParams } from "@/model/society/eras/types"

const governmentTypes: GovernmentType[] = [
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

const governmentTypeLabels: Record<GovernmentType, string> = {
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

const governmentTypeFamily: Record<GovernmentType, GovernmentFamily> = {
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

const nationBuckets: [number, number][] = [
	[251, 600],
	[50, 250],
	[25, 49],
	[10, 24],
	[5, 9],
	[2, 4],
	[1, 1],
]

function normalize(values: number[]): number[] {
	const sum = values.reduce((a, b) => a + b, 0) || 1
	return values.map((v) => v / sum)
}

const eraConfigs: Record<SocietyEra, EraConfig> = {
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
		nationBuckets: nationBuckets,
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
		nationBuckets: nationBuckets,
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
		nationBuckets: nationBuckets,
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
		nationBuckets: nationBuckets,
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
		nationBuckets: nationBuckets,
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
		nationBuckets: nationBuckets,
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

const defaultEra: SocietyEra = "lateMedieval"

function getEraConfig(era?: SocietyEra): EraConfig {
	return eraConfigs[era ?? defaultEra]
}

const eraOrder: SocietyEra[] = [
	"paleolithic",
	"neolithic",
	"bronze",
	"iron",
	"lateMedieval",
	"earlyModern",
	"industrial",
	"information",
]

function wavePercentileThreshold({
	migrationWave,
	desolate,
	fraction,
}: WavePercentileThresholdParams): number {
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

export const ERAS = {
	governmentTypes,
	governmentTypeLabels,
	governmentTypeFamily,
	nationBuckets,
	eraConfigs,
	defaultEra,
	eraOrder,
	getEraConfig,
	wavePercentileThreshold,
}
