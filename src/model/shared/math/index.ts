import type { SphereMesh } from "@/model"
import type {
	ClampParams,
	EulerVelocityAtParams,
	PiecewiseParams,
	SmoothstepParams,
} from "@/model/shared/math/types"

const RAD2DEG = 180 / Math.PI

function clamp({ value, lo, hi }: ClampParams): number {
	return Math.max(lo, Math.min(hi, value))
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function smoothstep({ edge0, edge1, x }: SmoothstepParams): number {
	if (edge0 === edge1) return x >= edge0 ? 1 : 0
	const t = clamp01((x - edge0) / (edge1 - edge0))
	return t * t * (3 - 2 * t)
}

function eulerVelocityAt({
	pole,
	omega,
	x,
	y,
	z,
}: EulerVelocityAtParams): [number, number, number] {
	const [px, py, pz] = pole
	return [
		omega * (py * z - pz * y),
		omega * (pz * x - px * z),
		omega * (px * y - py * x),
	]
}

function getRegionLatLonDegrees(mesh: SphereMesh): {
	latDeg: Float32Array
	lonDeg: Float32Array
} {
	const N = mesh.numRegions
	const latDeg = new Float32Array(N)
	const lonDeg = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const z = mesh.r_xyz[3 * r + 2]
		latDeg[r] = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG
		lonDeg[r] = Math.atan2(mesh.r_xyz[3 * r + 1], mesh.r_xyz[3 * r]) * RAD2DEG
	}
	return { latDeg, lonDeg }
}

function piecewise({ domain, range, x }: PiecewiseParams): number {
	if (x <= domain[0]) return range[0]
	if (x >= domain[domain.length - 1]) return range[range.length - 1]
	for (let i = 1; i < domain.length; i++) {
		if (x <= domain[i]) {
			const t = (x - domain[i - 1]) / (domain[i] - domain[i - 1])
			return range[i - 1] + t * (range[i] - range[i - 1])
		}
	}
	return range[range.length - 1]
}

export const MATH = {
	clamp,
	clamp01,
	smoothstep,
	eulerVelocityAt,
	getRegionLatLonDegrees,
	piecewise,
}
