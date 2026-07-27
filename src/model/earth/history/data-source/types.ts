export interface RawEvent {
	date: number
	kind: string
	payload: Record<string, unknown>
	comment?: string
}

export interface RawProvinceEntry {
	base: {
		owner?: string
		controller?: string
		culture?: string
		religion?: string
		/** Whether the province is part of the Holy Roman Empire, from EU4
		 * province history's `hre` field. Dated changes over time are `hre`
		 * events, same pattern as owner/culture/religion. */
		hre?: boolean
		cores: string[]
		/** Real EU4 province name, from geo-explorer's political.json. */
		name: string | null
		/** From geo-explorer's wastelands.json -- EU4's uninhabitable
		 * "wasteland" terrain, unrelated to this app's own desolate model. */
		wasteland: boolean
	}
	events: RawEvent[]
}

export interface RawNationEntry {
	base: {
		reforms: string[]
		/** Raw EU4 province id (string), from history/countries/*.txt's
		 * top-level `capital = <id>` field. Changes over time are
		 * `capitalChange` events, same pattern as owner/culture/religion. */
		capital: string | null
	}
	events: RawEvent[]
}

export interface RawWarParticipantEvent {
	date: number
	nationTag: string
	kind: "warStart" | "warEnd"
	side: "attacker" | "defender"
	/** Editorial commentary from the source war file, e.g. "Treaty of
	 * alliance"/"Treaty of Paris" -- the standalone comment line directly
	 * above this dated block in history/wars/<warId>.txt, when present (see
	 * scripts/build-eu4-history-events.py's _extract_war_commentary). */
	comment?: string
}

export interface RawWarBattleParticipant {
	country: string
	commander: string | null
	infantry: number | null
	cavalry: number | null
	artillery: number | null
	/** Percent losses (0-100), not an absolute casualty count. */
	losses: number | null
}

export interface RawWarBattle {
	date: number
	name: string
	/** Raw EU4 province id where the battle took place, when recorded. */
	locationProvinceId: string | null
	attacker: RawWarBattleParticipant
	defender: RawWarBattleParticipant
	attackerWon: boolean
	/** Editorial commentary preceding this battle's dated block, same
	 * convention as RawWarParticipantEvent.comment. */
	comment?: string
}

export interface RawWar {
	warId: string
	name: string
	casusBelli: string
	/** EU4's war_goal `type` (e.g. "take_capital_imperial", "take_claim") --
	 * distinct from `casusBelli` (the CB id, e.g. "cb_conquest"); a war_goal
	 * always has both. Empty string when history/wars/<warId>.txt had no
	 * war_goal block at all. */
	warGoalType: string
	/** war_goal's target nation tag (e.g. "USA") when the goal targets a
	 * country -- mutually exclusive with warGoalProvince; EU4 war_goals
	 * target either a nation or a province, never both. */
	warGoalTag: string | null
	/** war_goal's target raw EU4 province id (e.g. "552") when the goal
	 * targets a province -- mutually exclusive with warGoalTag. */
	warGoalProvince: string | null
	isRebel: boolean
	events: RawWarParticipantEvent[]
	battles: RawWarBattle[]
}

export interface RawDiplomacyEvent {
	date: number
	nationTag: string
	kind:
		| "allianceStart"
		| "allianceEnd"
		| "guaranteeStart"
		| "guaranteeEnd"
		| "royalMarriageStart"
		| "royalMarriageEnd"
		| "vassalStart"
		| "vassalEnd"
		| "unionStart"
		| "unionEnd"
		| "dependencyStart"
		| "dependencyEnd"
		| "emperorStart"
		| "emperorEnd"
	payload: { firstTag: string; secondTag: string; subjectType?: string }
}

export interface RawOrganizationMembershipEvent {
	date: number
	nationTag: string
	kind: "join" | "leave"
	/** `role` distinguishes sub-categories within one org's membership (e.g.
	 * the Guelphs and Ghibellines org's "guelphLeader"/"guelphMember"/
	 * "ghibellineLeader"/"ghibellineMember") -- see
	 * FoldedNationState.organizations and organization-categories.ts. Omitted
	 * (undefined) means the plain "member" role, matching orgs with no
	 * sub-categories like HSA. */
	payload: { orgId: string; role?: string }
}

export interface RawOrganizationSiteEvent {
	date: number
	provinceId: string
	kind: "siteStart" | "siteEnd"
	payload: { orgId: string; name: string; role: string }
}

export interface RawOrganizationReference {
	id: string
	name: string
	color: [number, number, number]
	borderLightColor: [number, number, number]
	borderDarkColor: [number, number, number]
}

export interface RawNationReference {
	tag: string
	name: string
	color: [number, number, number]
	graphicalCulture: string
	initialGovernmentType: string | null
	primaryCulture: string | null
	religion: string | null
}

export interface RawCulture {
	id: string
	name: string
	primaryTag: string | null
	/** From geo-explorer's cultures.json (pre-flattened JSON, not the
	 * Clausewitz 00_cultures.txt, which has no per-culture color). Null when
	 * a culture id has no entry there. */
	color: [number, number, number] | null
}

export interface RawHeritage {
	id: string
	name: string
	cultures: RawCulture[]
}

export interface RawReligion {
	id: string
	name: string
	color: [number, number, number]
}

export interface RawReligionGroup {
	id: string
	name: string
	religions: RawReligion[]
}

export interface RawProvinceGeography {
	area?: string
	region?: string
	superregion?: string
}

export interface Eu4ProvinceBorderGeometry {
	segmentCount: number
	segmentProvinceA: Int32Array
	segmentProvinceB: Int32Array
	segmentLonLatDeg: Float32Array
}

export interface Eu4ProvinceFillGeometry {
	ringCount: number
	ringProvinceId: Int32Array
	ringPolygonIndex: Int32Array
	ringIsHole: Uint8Array
	ringPointOffset: Int32Array
	pointsLonLatDeg: Float32Array
	triangleGroupCount: number
	triangleProvinceId: Int32Array
	trianglePointOffset: Int32Array
	trianglePointsLonLatDeg: Float32Array
}

export type RawProvinceEvents = Record<string, RawProvinceEntry>

export type RawNationEvents = Record<string, RawNationEntry>

export type RawOrganizationEvent =
	| RawOrganizationMembershipEvent
	| RawOrganizationSiteEvent
