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
	/** Per-province RGB colors, length count*3 */
	colors: Float32Array
	/** Per-province water access level: 0=none, 1=river/lake, 2=ocean */
	waterAccess: Uint8Array
	/** Per-province flag: has at least one visible river cell */
	riverAccess: Uint8Array
	/** Per-province flag: adjacent to a lake */
	lakeAccess: Uint8Array
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

export interface GenesisLocations {
	/** Per-mesh-region location index (-1 = ocean/unassigned) */
	regionLocation: Int32Array
	/** Per-location parent province index */
	locationProvince: Int32Array
	/** Seed (capital) region for each location */
	seeds: Int32Array
	/** Number of locations */
	count: number
	/** Location adjacency — CSR offset, length count+1 */
	adjOffset: Int32Array
	/** Location adjacency — neighbor indices */
	adjList: Int32Array
	/** Per-location land region count */
	size: Int32Array
	/** Per-location RGB colors, length count*3 */
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

export interface GenesisRivers {
	/** Each river is a polyline of [lonDeg, latDeg, flow, elevation] quads */
	lines: [number, number, number, number][][]
	/** Maximum flow value for normalization */
	maxFlow: number
	/** Flow threshold (minimum flow for a river cell), in m3/s */
	minFlow: number
	/** Per-cell mean discharge from upstream thawed-rain runoff, in m3/s */
	flow: Float32Array
	/** Per-cell monthly discharge, length 12*N, indexed [month*N + r], in m3/s */
	flow_monthly: Float32Array
	/** Per-cell flag for cells that belong to a rendered river polyline */
	visible: Uint8Array
	/** Per-cell river system ID (-1 = not a river cell). Tributaries share the main river's ID. */
	riverId: Int32Array
	/** Per-cell total length of the visible river system, in km. */
	riverLengthKm: Float32Array
	/** Per-cell terminal flag for the last visible river cell before its sink. */
	terminal: Uint8Array
	/** Terminal river cells that drain into ocean or other non-land water. */
	terminalCoastal: Uint8Array
	/** Terminal river cells that end in inland basins, lakes, or playas. */
	terminalInterior: Uint8Array
	/** Per-cell enclosed basin ID (-1 = not assigned to a basin) */
	basinId: Int32Array
	/** Per-cell water surface elevation (only meaningful for lake cells) */
	waterLevel: Float32Array
}

export const GENESIS_TOPOGRAPHY_LABELS = [
	"flat",
	"hill",
	"plateau",
	"mountains",
	"marsh",
	"ocean",
	"lake",
] as const
