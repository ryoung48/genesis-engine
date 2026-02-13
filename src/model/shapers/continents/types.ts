export type RegionBorders = Record<number, Record<number, Set<number>>> // region -> region -> cells
export type RegionAddBordersParams = {
	borders: RegionBorders
	r1: number
	r2: number
	c1: number
	c2: number
}
