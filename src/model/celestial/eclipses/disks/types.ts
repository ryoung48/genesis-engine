export interface EclipseDiskParams {
	starRadius: number
	moonRadius: number
	separation: number
}
export interface EclipseDisk {
	x: number
	y: number
	radius: number
}
export interface EclipseDiskUnionParams {
	starRadius: number
	disks: EclipseDisk[]
}
export interface EclipseDiskUnion {
	coverage: number
	total: boolean
}
