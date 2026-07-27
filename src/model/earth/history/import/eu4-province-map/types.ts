export interface Eu4ProvinceMap {
	/** compact province index -> raw EU4 province id */
	compactToRealId: Int32Array
	/** raw EU4 province id (as string, matches provinces.json keys) -> compact index */
	realIdToCompact: Map<string, number>
}
