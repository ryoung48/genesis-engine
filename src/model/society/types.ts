import { GENDER_SYSTEM } from "@/model/society/gender-system"

export interface GenesisProvinces {
	/** Per-region province index (-1 = ocean/unassigned) */
	regionProvince: Int32Array
	/** Seed (capital) region for each province */
	seeds: Int32Array
	/** Number of provinces */
	count: number
	/** Per-province desolate flag (1 = uninhabitable) */
	desolate: Uint8Array
	/** Per-province landmass (connected component) index, -1 for desolate */
	landmassId: Int32Array
	/** Province adjacency — CSR offset, length count+1 */
	adjOffset: Int32Array
	/** Province adjacency — neighbor indices */
	adjList: Int32Array
	/** Per-province land region count */
	size: Int32Array
	/** Per-province land area in km², when known from the source geometry. */
	areaKm2?: Float32Array
	/** Per-province RGB colors, length count*3 */
	colors: Float32Array
	/** Per-province water access level: 0=none, 1=river/lake, 2=ocean */
	waterAccess: Uint8Array
	/** Per-province flag: has at least one visible river cell */
	riverAccess: Uint8Array
	/** Per-province flag: adjacent to a lake */
	lakeAccess: Uint8Array
	/** Real-world province name, only set when provinces were assigned from
	 * imported Earth data (computeWeightedProvinces) rather than the
	 * procedural BFS partition. */
	names?: string[]
	/** Raw source province id (e.g. EU4 province id) per compact province
	 * index, only set when provinces were assigned from a rasterized
	 * real-world id map (computeProvincesFromRaster). Lets downstream code
	 * (e.g. the earth-history event engine) translate id-keyed historical
	 * data onto this partition's compact indices without re-matching. */
	realIds?: Int32Array
}

export interface GenesisPartition {
	/** Per-node partition index (-1 = inactive/unassigned) */
	assignment: Int32Array
	/** Seed node for each partition */
	seeds: Int32Array
	/** Deterministic per-partition language/identity seed */
	languageSeeds?: Int32Array
	/** Deterministic per-partition display/name seed */
	nameSeeds?: Int32Array
	/** Per-partition ruler gender system (0=patriarchal, 1=equal, 2=matriarchal) */
	genderSystems?: Uint8Array
	/** Number of partitions */
	count: number
	/** Partition adjacency — CSR offset, length count+1 */
	adjOffset: Int32Array
	/** Partition adjacency — neighbor indices */
	adjList: Int32Array
	/** Per-partition node count */
	size: Int32Array
	/** Per-partition RGB colors, length count*3 */
	colors: Float32Array
}

export interface GenesisNationHierarchy extends GenesisPartition {
	/** Deterministic per-nation name seed aligned to `seeds` order */
	nameSeeds?: Int32Array
	/** Per-province parent index (-1 = sovereign root) */
	parent: Int32Array
	/** Per-province hierarchy depth (0 = root) */
	depth: Int32Array
	/** Province children in CSR form, length count+1 */
	childOffset: Int32Array
	/** Flattened province children list */
	childList: Int32Array
	/** Per-province sovereign root */
	sovereign: Int32Array
	/** Per-province settlement gravity */
	gravity: Float32Array
	/** Per-nation government type: 0=tribal, 1=monarchy, 2=republic, 3=theocracy */
	governmentType?: Uint8Array
	/** Per-nation colonizer index (-1 = sovereign, ≥0 = index of colonizing nation) */
	nationColonizer?: Int32Array
	/** Active rebel wars — attacker is the overlord, defender is the rebel nation */
	activeRebelWars?: ReadonlyArray<{ attacker: number; defender: number }>
}

export type SocietyEra =
	| "paleolithic"
	| "neolithic"
	| "bronze"
	| "iron"
	| "lateMedieval"
	| "earlyModern"
	| "industrial"
	| "information"

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
	| "settler_colony"

export type GovernmentFamily =
	| "tribal"
	| "monarchy"
	| "republic"
	| "theocracy"
	| "colonial"

export type CultureGenderSystem =
	(typeof GENDER_SYSTEM.cultureGenderSystem)[keyof typeof GENDER_SYSTEM.cultureGenderSystem]

export type LeaderGender = "male" | "female"
