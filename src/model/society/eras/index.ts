import type { EraConfig, EraOfParams } from "@/model/society/eras/types"
import type {
	GovernmentFamily,
	GovernmentType,
	SocietyEra,
} from "@/model/society/types"

const governmentTypes: GovernmentType[] = [
	// tribal
	"chiefdom",
	"tribal_monarchy",
	"tribal_federation",
	"native_council",
	// monarchy
	"feudal_monarchy",
	"elective_monarchy",
	"absolute_monarchy",
	"constitutional_monarchy",
	"warlord_state",
	// republic
	"oligarchic_republic",
	"dynastic_signoria",
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
	feudal_monarchy: "Feudal Monarchy",
	elective_monarchy: "Elective Monarchy",
	absolute_monarchy: "Absolute Monarchy",
	constitutional_monarchy: "Constitutional Monarchy",
	dynastic_signoria: "Dynastic Signoria",
	warlord_state: "Warlord State",
	oligarchic_republic: "Oligarchic Republic",
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
	feudal_monarchy: "monarchy",
	elective_monarchy: "monarchy",
	absolute_monarchy: "monarchy",
	constitutional_monarchy: "monarchy",
	warlord_state: "monarchy",
	oligarchic_republic: "republic",
	dynastic_signoria: "republic",
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

const eraConfigs: Record<SocietyEra, EraConfig> = {
	paleolithic: {
		id: "paleolithic",
		label: "Paleolithic",
		techLevel: 0,
		migrationFalloff: 12,
		hasNations: false,
		governmentMix: { tribal: 1.0, monarchy: 0, republic: 0, theocracy: 0 },
		governmentSizeWeight: 1.0,
	},
	neolithic: {
		id: "neolithic",
		label: "Neolithic",
		techLevel: 0.19,
		migrationFalloff: 8,
		hasNations: true,
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
		techLevel: 0.56,
		migrationFalloff: 5,
		hasNations: true,
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
		techLevel: 1.42,
		migrationFalloff: 3,
		hasNations: true,
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
		techLevel: 2.35,
		migrationFalloff: 1.5,
		hasNations: true,
		governmentMix: {
			tribal: 0.44,
			monarchy: 0.49,
			republic: 0.01,
			theocracy: 0.06,
		},
		// Size and era roughly equal; geography (coast → republic) meaningful
		governmentSizeWeight: 0.55,
		maxRepublicSize: 40,
		maxTheocracySize: 40,
	},
	earlyModern: {
		id: "earlyModern",
		label: "Early Modern",
		techLevel: 3.27,
		migrationFalloff: 1.5,
		hasNations: true,
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
		techLevel: 4.24,
		migrationFalloff: 1.5,
		hasNations: true,
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
		techLevel: 7.78,
		migrationFalloff: 1.5,
		hasNations: true,
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

function eraOf({ techLevel }: EraOfParams): SocietyEra {
	let era = eraOrder[0]
	for (const candidate of eraOrder)
		if (eraConfigs[candidate].techLevel <= techLevel) era = candidate
	return era
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
	eraOf,
	defaultTechLevel: eraConfigs[defaultEra].techLevel,
}
