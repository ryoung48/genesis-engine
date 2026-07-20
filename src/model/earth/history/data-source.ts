/** Raw JSON shapes produced by scripts/build-eu4-history-events.py and
 * scripts/build-eu4-reference-data.py, served from public/earth-history/.
 * Fetched lazily -- only when an Earth-imported world is active
 * (world.isEarthImport). */

interface RawEvent {
	date: number
	kind: string
	payload: Record<string, unknown>
	comment?: string
}

interface RawProvinceEntry {
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

/** Keyed by raw EU4 province id (string, matches GenesisProvinces.realIds). */
export type RawProvinceEvents = Record<string, RawProvinceEntry>

interface RawNationEntry {
	base: {
		reforms: string[]
		/** Raw EU4 province id (string), from history/countries/*.txt's
		 * top-level `capital = <id>` field. Changes over time are
		 * `capitalChange` events, same pattern as owner/culture/religion. */
		capital: string | null
	}
	events: RawEvent[]
}

/** Keyed by EU4 country tag. */
export type RawNationEvents = Record<string, RawNationEntry>

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

/** One side's forces in a RawWarBattle -- EU4's war_goal battle sub-block
 * (attacker/defender). Unit-count fields are null when that unit type
 * wasn't present in the source (e.g. a battle with no recorded cavalry). */
interface RawWarBattleParticipant {
	country: string
	commander: string | null
	infantry: number | null
	cavalry: number | null
	artillery: number | null
	/** Percent losses (0-100), not an absolute casualty count. */
	losses: number | null
}

/** A single named battle within a war, from history/wars/<warId>.txt's
 * `battle = { ... }` sub-blocks -- distinct from RawWarParticipantEvent
 * (join/leave); a war can have any number of these at any date within its
 * span. */
interface RawWarBattle {
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

/** International organization nation-membership event. HRE isn't represented
 * here -- its membership is territorial (province-level `hre` field), not a
 * discrete per-nation relation like this. */
interface RawOrganizationMembershipEvent {
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

/** International organization province-level site event. Used for locations
 * such as Hanseatic kontors/trade posts, which were foreign offices rather
 * than member states. */
interface RawOrganizationSiteEvent {
	date: number
	provinceId: string
	kind: "siteStart" | "siteEnd"
	payload: { orgId: string; name: string; role: string }
}

export type RawOrganizationEvent =
	| RawOrganizationMembershipEvent
	| RawOrganizationSiteEvent

/** Static per-organization metadata -- name, a single representative swatch
 * color, and the two alternating colors used for the map's striped IO
 * border overlay (see eu4-nation-border-overlay.ts). Hand-authored (not
 * derived from EU4 source data), analogous to CURATED_WASTELAND_PROVINCE_IDS
 * in build-eu4-history-events.py. */
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

interface RawCulture {
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

interface RawReligion {
	id: string
	name: string
	color: [number, number, number]
}

export interface RawReligionGroup {
	id: string
	name: string
	religions: RawReligion[]
}

const EARTH_HISTORY_BASE = "/earth-history"

const cache = new Map<string, Promise<unknown>>()

function loadJson<T>(path: string): Promise<T> {
	let promise = cache.get(path) as Promise<T> | undefined
	if (!promise) {
		promise = fetch(`${EARTH_HISTORY_BASE}/${path}`, {
			cache: "no-store",
		}).then((res) => {
			if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
			return res.json() as Promise<T>
		})
		cache.set(path, promise)
	}
	return promise
}

export const loadProvinceEvents = () =>
	loadJson<RawProvinceEvents>("events/provinces.json")
export const loadNationEvents = () =>
	loadJson<RawNationEvents>("events/nations.json")
export const loadWars = () => loadJson<RawWar[]>("events/wars.json")
export const loadDiplomacyEvents = () =>
	loadJson<RawDiplomacyEvent[]>("events/diplomacy.json")
export const loadOrganizationEvents = () =>
	loadJson<RawOrganizationEvent[]>("events/organizations.json")

export const loadNationReference = () =>
	loadJson<RawNationReference[]>("reference/nations.json")
export const loadOrganizationReference = () =>
	loadJson<RawOrganizationReference[]>("reference/organizations.json")
export const loadHeritages = () =>
	loadJson<RawHeritage[]>("reference/heritages.json")
export const loadReligionGroups = () =>
	loadJson<RawReligionGroup[]>("reference/religion-groups.json")

let provinceCoordinatesPromise: Promise<
	Map<string, { lon: number; lat: number }>
> | null = null

/** Raw EU4 province id -> representative point, from the same
 * eu4-provinces-seeds.json used to build the province map at heightmap-import
 * time (outside EARTH_HISTORY_BASE -- it's a general heightmap asset, not
 * earth-history-specific). Used for nation-label placement when no capital
 * is known for a tag (e.g. Cliopatria-sourced pre-2AD polities, which have
 * no capital data at all) -- see adapter.ts's centroid-nearest fallback. */
export function loadProvinceCoordinates(): Promise<
	Map<string, { lon: number; lat: number }>
> {
	if (!provinceCoordinatesPromise) {
		provinceCoordinatesPromise = fetch("/heightmap/eu4-provinces-seeds.json", {
			cache: "no-store",
		})
			.then((res) => {
				if (!res.ok)
					throw new Error(
						`Failed to load eu4-provinces-seeds.json: ${res.status}`,
					)
				return res.json() as Promise<{ id: number; lon: number; lat: number }[]>
			})
			.then((seeds) => {
				const map = new Map<string, { lon: number; lat: number }>()
				for (const seed of seeds)
					map.set(String(seed.id), { lon: seed.lon, lat: seed.lat })
				return map
			})
	}
	return provinceCoordinatesPromise
}

/** Shared boundary polylines between adjacent EU4 provinces, in raw EU4
 * province ids -- from scripts/build-eu4-province-borders.py. Used to draw
 * nation/province borders along the game's real province shapes instead of
 * the procedural planet mesh's own Voronoi edges, when world.isEarthImport.
 * Flat arrays, parallel-indexed by segment: segmentProvinceA[i]/
 * segmentProvinceB[i] are the two EU4 province ids sharing that edge,
 * segmentLonLatDeg[4*i..4*i+3] is [lon0, lat0, lon1, lat1] in degrees. */
export interface Eu4ProvinceBorderGeometry {
	segmentCount: number
	segmentProvinceA: Int32Array
	segmentProvinceB: Int32Array
	segmentLonLatDeg: Float32Array
}

let provinceBorderGeometryPromise: Promise<Eu4ProvinceBorderGeometry> | null =
	null

export function loadEu4ProvinceBorderGeometry(): Promise<Eu4ProvinceBorderGeometry> {
	if (!provinceBorderGeometryPromise) {
		provinceBorderGeometryPromise = fetch(
			`${EARTH_HISTORY_BASE}/reference/eu4-province-borders.json`,
			{ cache: "no-store" },
		)
			.then((res) => {
				if (!res.ok)
					throw new Error(
						`Failed to load eu4-province-borders.json: ${res.status}`,
					)
				return res.json() as Promise<{ segmentCount: number; bin: string }>
			})
			.then(async (meta) => {
				const binRes = await fetch(
					`${EARTH_HISTORY_BASE}/reference/${meta.bin}`,
					{ cache: "no-store" },
				)
				if (!binRes.ok)
					throw new Error(`Failed to load ${meta.bin}: ${binRes.status}`)
				const buffer = await binRes.arrayBuffer()
				const view = new DataView(buffer)
				const segmentProvinceA = new Int32Array(meta.segmentCount)
				const segmentProvinceB = new Int32Array(meta.segmentCount)
				const segmentLonLatDeg = new Float32Array(meta.segmentCount * 4)
				for (let i = 0; i < meta.segmentCount; i++) {
					const offset = i * 24
					segmentProvinceA[i] = view.getInt32(offset, true)
					segmentProvinceB[i] = view.getInt32(offset + 4, true)
					segmentLonLatDeg[4 * i] = view.getFloat32(offset + 8, true)
					segmentLonLatDeg[4 * i + 1] = view.getFloat32(offset + 12, true)
					segmentLonLatDeg[4 * i + 2] = view.getFloat32(offset + 16, true)
					segmentLonLatDeg[4 * i + 3] = view.getFloat32(offset + 20, true)
				}
				return {
					segmentCount: meta.segmentCount,
					segmentProvinceA,
					segmentProvinceB,
					segmentLonLatDeg,
				}
			})
	}
	return provinceBorderGeometryPromise
}

/** Closed fill-polygon rings per EU4 province, in raw EU4 province ids --
 * from scripts/build-eu4-province-borders.py's fill-geometry export. Used to
 * paint nation territory following the game's real province shapes instead
 * of the procedural planet mesh's own Voronoi cells, when world.isEarthImport.
 * Rings are grouped by (provinceId, polygonIndex) -- a hole ring only
 * applies to the exterior ring sharing its polygonIndex, so a province's
 * separate islands (different polygonIndex) don't leak holes into each
 * other. Flat parallel arrays indexed by ring; `ringPointOffset[i]` is the
 * index into `pointsLonLatDeg` (in lon/lat *pairs*, not floats) where ring
 * i's points begin, and it has `ringCount + 1` entries so a ring's point
 * count is `ringPointOffset[i + 1] - ringPointOffset[i]`. */
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

let provinceFillGeometryPromise: Promise<Eu4ProvinceFillGeometry> | null = null

export function loadEu4ProvinceFillGeometry(): Promise<Eu4ProvinceFillGeometry> {
	if (!provinceFillGeometryPromise) {
		provinceFillGeometryPromise = fetch(
			`${EARTH_HISTORY_BASE}/reference/eu4-province-borders-fills.json`,
			{ cache: "no-store" },
		)
			.then((res) => {
				if (!res.ok)
					throw new Error(
						`Failed to load eu4-province-borders-fills.json: ${res.status}`,
					)
				return res.json() as Promise<{
					ringCount: number
					triangleGroupCount?: number
					bin?: string
					ringsBin?: string
					trianglesBin?: string
				}>
			})
			.then(async (meta) => {
				const ringsBin = meta.ringsBin ?? meta.bin
				if (!ringsBin)
					throw new Error("EU4 fill geometry metadata missing rings bin")
				const ringsRes = await fetch(
					`${EARTH_HISTORY_BASE}/reference/${ringsBin}`,
					{ cache: "no-store" },
				)
				if (!ringsRes.ok)
					throw new Error(`Failed to load ${ringsBin}: ${ringsRes.status}`)
				const ringsBuffer = await ringsRes.arrayBuffer()
				const view = new DataView(ringsBuffer)

				const ringProvinceId = new Int32Array(meta.ringCount)
				const ringPolygonIndex = new Int32Array(meta.ringCount)
				const ringIsHole = new Uint8Array(meta.ringCount)
				const ringPointOffset = new Int32Array(meta.ringCount + 1)

				// Records are variable-length (pointCount differs per ring), so
				// a first pass reads only headers to size the flat point buffer,
				// then a second pass fills it in.
				let byteOffset = 0
				let pointTotal = 0
				const pointCounts = new Int32Array(meta.ringCount)
				for (let i = 0; i < meta.ringCount; i++) {
					ringProvinceId[i] = view.getInt32(byteOffset, true)
					ringPolygonIndex[i] = view.getInt32(byteOffset + 4, true)
					ringIsHole[i] = view.getInt32(byteOffset + 8, true)
					const pointCount = view.getInt32(byteOffset + 12, true)
					pointCounts[i] = pointCount
					ringPointOffset[i] = pointTotal
					pointTotal += pointCount
					byteOffset += 16 + pointCount * 8
				}
				ringPointOffset[meta.ringCount] = pointTotal

				const pointsLonLatDeg = new Float32Array(pointTotal * 2)
				byteOffset = 0
				for (let i = 0; i < meta.ringCount; i++) {
					const pointCount = pointCounts[i]
					let pointByteOffset = byteOffset + 16
					const base = ringPointOffset[i] * 2
					for (let p = 0; p < pointCount; p++) {
						pointsLonLatDeg[base + 2 * p] = view.getFloat32(
							pointByteOffset,
							true,
						)
						pointsLonLatDeg[base + 2 * p + 1] = view.getFloat32(
							pointByteOffset + 4,
							true,
						)
						pointByteOffset += 8
					}
					byteOffset += 16 + pointCount * 8
				}

				const triangleGroupCount = meta.triangleGroupCount ?? 0
				const triangleProvinceId = new Int32Array(triangleGroupCount)
				const trianglePointOffset = new Int32Array(triangleGroupCount + 1)
				let trianglePointsLonLatDeg = new Float32Array(0)
				if (triangleGroupCount > 0) {
					const trianglesBin = meta.trianglesBin
					if (!trianglesBin)
						throw new Error("EU4 fill geometry metadata missing triangles bin")
					const trianglesRes = await fetch(
						`${EARTH_HISTORY_BASE}/reference/${trianglesBin}`,
						{ cache: "no-store" },
					)
					if (!trianglesRes.ok)
						throw new Error(
							`Failed to load ${trianglesBin}: ${trianglesRes.status}`,
						)
					const trianglesBuffer = await trianglesRes.arrayBuffer()
					const trianglesView = new DataView(trianglesBuffer)
					let triangleByteOffset = 0
					let trianglePointTotal = 0
					const trianglePointCounts = new Int32Array(triangleGroupCount)
					for (let i = 0; i < triangleGroupCount; i++) {
						triangleProvinceId[i] = trianglesView.getInt32(
							triangleByteOffset,
							true,
						)
						const pointCount = trianglesView.getInt32(
							triangleByteOffset + 4,
							true,
						)
						trianglePointCounts[i] = pointCount
						trianglePointOffset[i] = trianglePointTotal
						trianglePointTotal += pointCount
						triangleByteOffset += 8 + pointCount * 8
					}
					trianglePointOffset[triangleGroupCount] = trianglePointTotal
					trianglePointsLonLatDeg = new Float32Array(trianglePointTotal * 2)
					triangleByteOffset = 0
					for (let i = 0; i < triangleGroupCount; i++) {
						const pointCount = trianglePointCounts[i]
						let pointByteOffset = triangleByteOffset + 8
						const base = trianglePointOffset[i] * 2
						for (let p = 0; p < pointCount; p++) {
							trianglePointsLonLatDeg[base + 2 * p] = trianglesView.getFloat32(
								pointByteOffset,
								true,
							)
							trianglePointsLonLatDeg[base + 2 * p + 1] =
								trianglesView.getFloat32(pointByteOffset + 4, true)
							pointByteOffset += 8
						}
						triangleByteOffset += 8 + pointCount * 8
					}
				}

				return {
					ringCount: meta.ringCount,
					ringProvinceId,
					ringPolygonIndex,
					ringIsHole,
					ringPointOffset,
					pointsLonLatDeg,
					triangleGroupCount,
					triangleProvinceId,
					trianglePointOffset,
					trianglePointsLonLatDeg,
				}
			})
	}
	return provinceFillGeometryPromise
}
