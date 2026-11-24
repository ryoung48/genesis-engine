import type {
	CellVecParams,
	GreatCircleKmParams,
	RotateAboutParams,
	Vec3,
	Vec3Pair,
} from "@/model/shared/math/vec3/types"

function dot({ a, b }: Vec3Pair): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross({ a, b }: Vec3Pair): Vec3 {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	]
}

function unit(v: Vec3): Vec3 {
	const l = Math.hypot(v[0], v[1], v[2]) || 1
	return [v[0] / l, v[1] / l, v[2] / l]
}

function at({ xyz, cell }: CellVecParams): Vec3 {
	return [xyz[3 * cell], xyz[3 * cell + 1], xyz[3 * cell + 2]]
}

function rotateAbout({ p, axis, angle }: RotateAboutParams): Vec3 {
	const c = Math.cos(angle)
	const s = Math.sin(angle)
	const kx = cross({ a: axis, b: p })
	const kd = dot({ a: axis, b: p })
	return [
		p[0] * c + kx[0] * s + axis[0] * kd * (1 - c),
		p[1] * c + kx[1] * s + axis[1] * kd * (1 - c),
		p[2] * c + kx[2] * s + axis[2] * kd * (1 - c),
	]
}

function greatCircleKm({ a, b, radiusKm }: GreatCircleKmParams): number {
	return radiusKm * Math.acos(Math.max(-1, Math.min(1, dot({ a, b }))))
}

export const VEC3 = { dot, cross, unit, at, rotateAbout, greatCircleKm }
