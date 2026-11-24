export type Vec3 = [number, number, number]

export interface Vec3Pair {
	a: Vec3
	b: Vec3
}

export interface CellVecParams {
	xyz: Float32Array
	cell: number
}

export interface RotateAboutParams {
	p: Vec3
	axis: Vec3
	angle: number
}

export interface GreatCircleKmParams extends Vec3Pair {
	radiusKm: number
}
