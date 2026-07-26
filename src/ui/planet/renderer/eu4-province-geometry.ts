import type { Eu4ProvinceFillGeometry } from "@/model/earth"

interface Eu4ProvinceRingGroup {
	provinceId: number
	exterior: Float32Array
	holes: Float32Array[]
}

function unwrapEu4RingLonLatDeg(lonLatDeg: Float32Array): Float32Array {
	const out = new Float32Array(lonLatDeg.length)
	out[0] = lonLatDeg[0]
	out[1] = lonLatDeg[1]
	for (let i = 2; i < lonLatDeg.length; i += 2) {
		let lon = lonLatDeg[i]
		const prevLon = out[i - 2]
		while (lon - prevLon > 180) lon -= 360
		while (lon - prevLon < -180) lon += 360
		out[i] = lon
		out[i + 1] = lonLatDeg[i + 1]
	}
	return out
}

export function buildEu4ProvinceRingGroups(
	geometry: Eu4ProvinceFillGeometry,
): Eu4ProvinceRingGroup[] {
	const {
		ringCount,
		ringProvinceId,
		ringPolygonIndex,
		ringIsHole,
		ringPointOffset,
		pointsLonLatDeg,
	} = geometry
	const groups = new Map<string, Eu4ProvinceRingGroup>()
	const order: Eu4ProvinceRingGroup[] = []
	for (let i = 0; i < ringCount; i++) {
		const provinceId = ringProvinceId[i]
		const start = ringPointOffset[i] * 2
		const end = ringPointOffset[i + 1] * 2
		if (end - start < 6) continue
		const ring = unwrapEu4RingLonLatDeg(pointsLonLatDeg.subarray(start, end))
		const key = `${provinceId}:${ringPolygonIndex[i]}`
		let group = groups.get(key)
		if (!group) {
			group = { provinceId, exterior: new Float32Array(0), holes: [] }
			groups.set(key, group)
			order.push(group)
		}
		if (ringIsHole[i]) group.holes.push(ring)
		else group.exterior = ring
	}
	return order.filter((group) => group.exterior.length >= 6)
}
