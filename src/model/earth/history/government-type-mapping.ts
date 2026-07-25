import type { GovernmentType } from "@/model/society/eras"
import { getEarthHistoryGovernmentFamily } from "./government"

type EarthHistoryFamily = "tribal" | "monarchy" | "republic" | "theocracy"

/** Fallback per family when governmentReform is null/generic/unmapped. */
const FAMILY_DEFAULT: Record<EarthHistoryFamily, GovernmentType> = {
	tribal: "chiefdom",
	monarchy: "feudal_monarchy",
	republic: "oligarchic_republic",
	theocracy: "theocracy",
}

/** Reforms whose meaning depends on family -- same EU4 reform id, different
 * real-world government type depending on whether it's attached to a
 * monarchy or a republic (e.g. "powerful_head_of_state" means an absolute
 * monarch in one context and a strong elected president in the other). */
const FAMILY_REFORM_OVERRIDES: Partial<
	Record<EarthHistoryFamily, Record<string, GovernmentType>>
> = {
	monarchy: {
		powerful_head_of_state: "absolute_monarchy",
		authoritarian_rule: "absolute_monarchy",
		authoritatian_rule: "absolute_monarchy", // source-data misspelling, kept verbatim
		democracy_reform: "constitutional_monarchy",
	},
	republic: {
		powerful_head_of_state: "presidential_republic",
		authoritarian_rule: "dictatorial_rule",
		authoritatian_rule: "dictatorial_rule",
		democracy_reform: "parliamentary_republic",
	},
}

/** Reforms that mean the same government type regardless of family. Built
 * from the full reform-id census across events/nations.json (see
 * scripts/audit/ancient-nation-audit-prompt.md-adjacent conversation notes);
 * covers every reform with more than a handful of uses plus all named
 * historical one-offs. Pure "modifier" reforms with no standalone type
 * (universal_suffrage_reform, multi_party_system, strengthen_executive_
 * powers_reform, reinforce_republican_values_reform, regional_representation_
 * reform, legislative_houses_reform, single_party_system's monarchy case,
 * cavalry_focus, etc.) are intentionally omitted -- they fall through to the
 * family default, since they describe a change alongside a government type
 * rather than a government type themselves. */
const REFORM_TYPE: Record<string, GovernmentType> = {
	// tribal
	native_chiefdom_reform: "chiefdom",
	native_settle_down_reform: "chiefdom",
	native_oral_tradition_reform: "chiefdom",
	polynesian_tribe: "chiefdom",
	siberian_tribe: "chiefdom",
	stateless_society: "native_council",
	native_clan_council_reform: "native_council",
	native_land_tradition_reform: "native_council",
	matrilineal_system: "native_council",
	tribal_kingdom: "tribal_monarchy",
	tribal_despotism: "tribal_monarchy",
	barbarian_reform: "tribal_monarchy",
	polynesian_kingdom: "tribal_monarchy",
	gond_kingdom: "tribal_monarchy",
	shaka_regime: "tribal_monarchy",
	native_martial_tradition_reform: "tribal_monarchy",
	tribal_federation: "tribal_federation",
	native_federation_reform: "tribal_federation",
	steppe_horde: "steppe_horde",

	// monarchy
	autocracy_reform: "absolute_monarchy",
	barbary_sultanate_reform: "absolute_monarchy",
	indian_sultanate_reform: "absolute_monarchy",
	political_absolutism_reform: "absolute_monarchy",
	tsardom: "absolute_monarchy",
	persian_achaemenid_monarchy: "absolute_monarchy",
	prussian_monarchy: "absolute_monarchy",
	despotism: "absolute_monarchy",
	revolutionary_empire_reform: "absolute_monarchy",
	// Empires with a famous formalized administrative class distinct from a
	// hereditary court aristocracy (Byzantine themes/civil service, Ottoman
	// devşirme-trained administrators, Roman provincial/tax bureaucracy after
	// Diocletian, Mamluk slave-soldier-administrator institution) --
	// bureaucratic_monarchy rather than absolute_monarchy.
	ottoman_government: "bureaucratic_monarchy",
	byzantine_autocracy_reform: "bureaucratic_monarchy",
	mamluk_government: "bureaucratic_monarchy",
	roman_empire_reform: "bureaucratic_monarchy",
	feudalism_reform: "feudal_monarchy",
	iqta: "feudal_monarchy",
	daimyo: "feudal_monarchy",
	salic_reform: "feudal_monarchy",
	rajput_kingdom: "feudal_monarchy",
	principality: "feudal_monarchy",
	margraviate_reform: "feudal_monarchy",
	crusader_state: "feudal_monarchy",
	satrap_diadochi: "feudal_monarchy",
	parthian_reform: "feudal_monarchy",
	vedic_kingdom: "feudal_monarchy",
	indep_daimyo: "feudal_monarchy",
	austrian_archduchy_reform: "feudal_monarchy",
	grand_duchy_reform: "feudal_monarchy",
	feudal_france_reform: "feudal_monarchy",
	imperial_march_reform: "feudal_monarchy",
	aristocratic_monarchy: "feudal_monarchy",
	nayankara_reform: "feudal_monarchy",
	mandala_reform: "feudal_monarchy",
	local_administrations: "feudal_monarchy",
	elective_monarchy: "elective_monarchy",
	signoria_reform: "dynastic_signoria",
	ceremonial_monarch: "constitutional_monarchy",
	english_monarchy: "constitutional_monarchy",
	celestial_empire: "bureaucratic_monarchy",
	confucian_bureaucracy: "bureaucratic_monarchy",
	chinese_imperial_bureaucracy: "bureaucratic_monarchy",
	district_divisions: "bureaucratic_monarchy",
	chinese_warlord: "warlord_state",
	warlord_state: "warlord_state",
	shogunate: "shogunate",

	// republic
	parliamentary_reform: "parliamentary_republic",
	ceremonial_president: "parliamentary_republic",
	abolish_presidency: "parliamentary_republic",
	regional_representation_reform: "parliamentary_republic",
	legislative_houses_reform: "parliamentary_republic",
	presidential_reform: "presidential_republic",
	federal_republic: "presidential_republic",
	presidential_despot_reform: "presidential_republic",
	revolutionary_republic_reform: "presidential_republic",
	oligarchy_reform: "oligarchic_republic",
	oligarchic_reform: "oligarchic_republic",
	noble_elite_reform: "oligarchic_republic",
	res_publica: "oligarchic_republic",
	late_res_publica: "oligarchic_republic",
	licinian_sextian_reform: "oligarchic_republic",
	marian_military_reform: "oligarchic_republic",
	carthaginian_republic: "oligarchic_republic",
	phoenician_oligarchy: "oligarchic_republic",
	veche_republic: "oligarchic_republic",
	citizens_republic: "oligarchic_republic",
	classical_polis: "free_city",
	united_cantons_reform: "free_city",
	hellenic_league_hegemon: "free_city",
	free_city: "free_city",
	merchants_reform: "merchant_republic",
	plutocratic_reform: "merchant_republic",
	dutch_republic: "merchant_republic",
	ambrosian_republic: "merchant_republic",
	venice_merchants_reform: "merchant_republic",
	somali_maritime_city_state: "merchant_republic",
	pirate_republic_reform: "pirate_republic",
	// Medieval lord-less free-peasant confederacies (Dithmarschen, Frisia, East
	// Frisia) -- not a socialist/agrarian-revolutionary state despite the name.
	peasants_republic: "peasant_republic",

	// theocracy
	leading_clergy_reform: "theocracy",
	caliphate_reform: "theocracy",
	caliphate_theocratic_reform: "theocracy",
	papacy_reform: "theocracy",
	heterodoxy: "theocracy",
	monastic_order_reform: "monastic_state",
	// Used by Islamic/Jewish feudal-theocratic states (Algiers, Sokoto,
	// Rassids, Oman, Judea, etc.) -- "prince-bishopric" was a Western Catholic-
	// specific structural term (a bishop also holding secular princely
	// authority) that didn't fit these non-Christian contexts.
	feudal_theocracy: "theocracy",
	atenist_revolution: "imperial_cult",
	amun_restoration: "imperial_cult",

	// republic extensions
	communist_government: "socialist_state",
	single_party_system: "socialist_state",
	military_government: "military_junta",
	dictatorial_rule: "dictatorial_rule",
	fascist_government: "fascist_state",

	// colonial
	trade_company_government: "trading_company",
	colonial_government: "settler_colony",
}

/** Resolves a fictional-world-taxonomy GovernmentType from an earth-history
 * nation's raw (governmentType, governmentReform) state -- the same two
 * fields fold.ts already resolves per nation. Three-tier lookup: a small
 * family-specific override table (for reforms that mean different things
 * under a monarchy vs. a republic), then a flat global reform->type table,
 * then a per-family default. */
export function resolveSocietyGovernmentType(params: {
	governmentType: string | null
	governmentReform?: string | null
}): GovernmentType {
	const family =
		getEarthHistoryGovernmentFamily(params.governmentType) ?? "monarchy"
	const reform = params.governmentReform?.trim().toLowerCase() || null

	if (reform) {
		const override = FAMILY_REFORM_OVERRIDES[family]?.[reform]
		if (override) return override

		const flat = REFORM_TYPE[reform]
		if (flat) return flat
	}

	return FAMILY_DEFAULT[family]
}
