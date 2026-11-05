import type {
	ConeDistanceParams,
	ShadowParams,
	ShadowState,
} from "@/model/celestial/eclipses/shadow/types"

function coneDistance({
	x,
	r,
	start,
	end,
	slope,
	intercept,
}: ConeDistanceParams): number {
	const radius = intercept + slope * x
	if (x >= start && x <= end && r <= radius)
		return -Math.min(x - start, end - x, (radius - r) / Math.hypot(1, slope))
	let distance = Infinity
	for (const sign of [-1, 1]) {
		const projection = Math.max(
			start,
			Math.min(end, (x + slope * (sign * r - intercept)) / (1 + slope * slope)),
		)
		distance = Math.min(
			distance,
			Math.hypot(x - projection, r - sign * (intercept + slope * projection)),
		)
	}
	for (const edge of [start, end]) {
		if (!Number.isFinite(edge)) continue
		const limit = Math.max(0, intercept + slope * edge)
		distance = Math.min(distance, Math.hypot(x - edge, Math.max(0, r - limit)))
	}
	return distance
}

function evaluate({
	star,
	occluder,
	target,
	starRadiusM: rs,
	occluderRadiusM: ro,
	targetRadiusM: rt,
}: ShadowParams): ShadowState {
	const delta = occluder.map((v, n) => v - star[n])
	const length = Math.hypot(...delta)
	const offset = target.map((v, n) => v - occluder[n])
	const separation = Math.hypot(...offset)
	const invalid = {
		valid: false,
		penumbra: -Infinity,
		umbra: -Infinity,
		antumbra: -Infinity,
		contained: false,
	}
	if (
		![...star, ...occluder, ...target, rs, ro, rt].every(Number.isFinite) ||
		Math.min(rs, ro, rt) <= 0 ||
		length <= rs + ro ||
		separation <= ro + rt ||
		Math.hypot(...target.map((v, n) => v - star[n])) <= rs + rt
	)
		return invalid
	const axis = delta.map((v) => v / length)
	const x = offset.reduce((sum, v, n) => sum + v * axis[n], 0)
	const r = Math.hypot(...offset.map((v, n) => v - x * axis[n]))
	const sinP = (rs + ro) / length,
		cosP = Math.sqrt(1 - sinP * sinP)
	const sinU = (rs - ro) / length,
		cosU = Math.sqrt(1 - sinU * sinU)
	const slopeP = sinP / cosP,
		slopeU = sinU / cosU
	const vertex = sinU > 0 ? ro / sinU : Infinity
	const penumbra =
		rt -
		coneDistance({
			x,
			r,
			start: -ro * sinP,
			end: Infinity,
			slope: slopeP,
			intercept: ro / cosP,
		})
	const umbraDistance = coneDistance({
		x,
		r,
		start: ro * sinU,
		end: vertex,
		slope: -slopeU,
		intercept: ro / cosU,
	})
	const antumbra =
		sinU > 0
			? rt -
				coneDistance({
					x,
					r,
					start: vertex,
					end: Infinity,
					slope: slopeU,
					intercept: -ro / cosU,
				})
			: -Infinity
	return {
		valid: true,
		penumbra,
		umbra: rt - umbraDistance,
		antumbra,
		contained: -umbraDistance > rt,
	}
}

export const ECLIPSE_SHADOW = { evaluate }
