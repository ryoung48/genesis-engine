import type { DejureTitles } from "@/model/society/dejure/types"

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
	/** Per-node secondary (bleeding) partition index, -1 = no blend. Only
	 * populated for partitions that render border-bleed stripes (culture). */
	blendSecondary?: Int32Array
	/** Per-node blend weight [0, 1] toward blendSecondary. */
	blendWeight?: Float32Array
}

/**
 * Member rank within a GenesisOrganization, mirrored off the Holy Roman
 * Empire's estate hierarchy. "princeElector"/"archbishopElector" are the
 * (up to 7) largest monarchy/theocracy members; "imperialPrelate" and
 * "imperialPrince" are the non-elector monarchy/theocracy remainder;
 * "republic" covers every republic-family member.
 */
export type OrganizationTitle =
	| "emperor"
	| "princeElector"
	| "archbishopElector"
	| "imperialPrelate"
	| "republic"
	/** Size-1 republic-family member -- a self-governing city, not a
	 * princely lord's domain (e.g. poleis, HRE free imperial cities). */
	| "freeCity"
	/** Size-1..2 republic-family member specifically assigned the
	 * peasant_republic government type -- a lord-less free-peasant commune
	 * (e.g. Dithmarschen, Frisia), distinct from an urban free city. */
	| "peasantRepublic"
	| "imperialPrince"
	/** Flat membership tier for non-hierarchical orgs (e.g. a Trade League --
	 * a confederation of equals, unlike the HRE's estate hierarchy). Every
	 * member, including the naming anchor, gets this same title. */
	| "member"

export interface GenesisOrganizationMember {
	nationIndex: number
	title: OrganizationTitle
}

/**
 * A procedurally generated patchwork organization: one large eligible nation
 * is shattered into many small member states.
 * - "imperialPatchwork": HRE-style -- eligible = largest settled
 *   (migrationWave >= 0) nation; one member (the largest) keeps the
 *   "emperor" title; rest get HRE estate titles. See
 *   src/model/history/sim/organizations/imperial-patchwork.
 * - "tradeLeague": Hansa-style -- eligible = largest coastal republic;
 *   members are flat ("member" title, no hierarchy), capped small (< 10
 *   provinces). See src/model/history/sim/organizations/trade-league.
 */
export interface GenesisOrganization {
	id: string
	kind: "imperialPatchwork" | "tradeLeague"
	/** Deterministic name seed; the display name is generated lazily (same
	 * pattern as nation names) from leadNationIndex's culture language. */
	nameSeed: number
	/** The org's own identity color (0-1 RGB), independent of any member
	 * nation's color -- e.g. for its wiki page swatch and map highlight. */
	color: [number, number, number]
	/** Culture index of the lead member's capital province, -1 if unknown
	 * (patched in by the pipeline once cultures are computed). */
	cultureIdx: number
	/** The largest member -- the Emperor for an imperialPatchwork, or just a
	 * naming/culture anchor with no special authority for a tradeLeague. */
	leadNationIndex: number
	members: GenesisOrganizationMember[]
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
	/** Fixed de jure title tree with current holders and seats */
	titles: DejureTitles
	/** Per-nation government type: 0=tribal, 1=monarchy, 2=republic, 3=theocracy */
	governmentType?: Uint8Array
	/** Per-nation colonizer index (-1 = sovereign, ≥0 = index of colonizing nation) */
	nationColonizer?: Int32Array
	/** Active rebel wars — attacker is the overlord, defender is the rebel nation */
	activeRebelWars?: ReadonlyArray<{ attacker: number; defender: number }>
	/** Procedurally generated organizations (e.g. an Imperial Patchwork). */
	organizations?: GenesisOrganization[]
}

export type SocietyEra =
	| "paleolithic"
	| "neolithic"
	| "bronze"
	| "iron"
	| "highMedieval"
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
	// republic (13–19)
	| "oligarchic_republic" // 14: aristocratic senate — medium ancient core
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
	// high medieval set (29–32) — assigned by the sized batch model, not the blend mix
	| "tribal_government"
	| "feudal_government"
	| "bureaucratic_government"
	| "republic_government"

export type GovernmentFamily =
	| "tribal"
	| "monarchy"
	| "republic"
	| "theocracy"
	| "colonial"

// 0 = patriarchal, 1 = equal, 2 = matriarchal (see GENDER_SYSTEM.cultureGenderSystem)
export type CultureGenderSystem = 0 | 1 | 2

export type LeaderGender = "male" | "female"

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
