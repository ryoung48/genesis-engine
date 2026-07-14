/** Raw JSON shapes produced by scripts/build-eu4-history-events.py and
 * scripts/build-eu4-reference-data.py, served from public/earth-history/.
 * Fetched lazily -- only when an Earth-imported world is active
 * (world.isEarthImport). */

interface RawEvent {
	date: number
	kind: string
	payload: Record<string, unknown>
}

interface RawProvinceEntry {
	base: {
		owner?: string
		controller?: string
		culture?: string
		religion?: string
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

interface RawWarParticipantEvent {
	date: number
	nationTag: string
	kind: "warStart" | "warEnd"
	side: "attacker" | "defender"
}

export interface RawWar {
	warId: string
	name: string
	casusBelli: string
	isRebel: boolean
	events: RawWarParticipantEvent[]
}

export interface RawDiplomacyEvent {
	date: number
	nationTag: string
	kind:
		| "allianceStart"
		| "allianceEnd"
		| "vassalStart"
		| "vassalEnd"
		| "unionStart"
		| "unionEnd"
		| "dependencyStart"
		| "dependencyEnd"
	payload: { firstTag: string; secondTag: string; subjectType?: string }
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

export const loadNationReference = () =>
	loadJson<RawNationReference[]>("reference/nations.json")
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
