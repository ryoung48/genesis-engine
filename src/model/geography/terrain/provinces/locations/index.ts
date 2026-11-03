import type {
	BuildProvinceLocationsParams,
	ProvinceLocation,
	ResolveProvinceLocationParams,
} from "@/model/geography/terrain/provinces/locations/types"

function build({
	mesh,
	provinces,
	isLand,
	representatives,
}: BuildProvinceLocationsParams): ProvinceLocation[] {
	const members = Array.from({ length: provinces.count }, () => [] as number[])
	for (let r = 0; r < mesh.numRegions; r++) {
		const p = provinces.regionProvince[r]
		if (p >= 0 && p < members.length) members[p].push(r)
	}
	return members.map((regions, province) => {
		let approximateLocation = false
		if (!regions.length) {
			const point = representatives.get(province)
			if (point) {
				const lat = (point[1] * Math.PI) / 180
				const lon = (point[0] * Math.PI) / 180
				let best = -1
				let dot = -Infinity
				for (let r = 0; r < mesh.numRegions; r++) {
					if (!isLand[r]) continue
					const d =
						mesh.r_xyz[3 * r] * Math.cos(lat) * Math.cos(lon) +
						mesh.r_xyz[3 * r + 1] * Math.cos(lat) * Math.sin(lon) +
						mesh.r_xyz[3 * r + 2] * Math.sin(lat)
					if (d > dot) {
						dot = d
						best = r
					}
				}
				if (best >= 0) {
					regions.push(best)
					approximateLocation = true
				}
			}
		}
		if (!regions.length)
			return {
				province,
				latitude: 0,
				longitude: 0,
				samples: [],
				approximateLocation: true,
			}
		const seed = provinces.seeds[province]
		const chosen = [regions.includes(seed) ? seed : regions[0]]
		while (chosen.length < Math.min(3, regions.length)) {
			let best = -1
			let distance = -1
			for (const region of regions) {
				if (chosen.includes(region)) continue
				let nearest = Infinity
				for (const other of chosen) {
					let d = 0
					for (let axis = 0; axis < 3; axis++)
						d +=
							(mesh.r_xyz[3 * region + axis] - mesh.r_xyz[3 * other + axis]) **
							2
					nearest = Math.min(nearest, d)
				}
				if (nearest > distance) {
					distance = nearest
					best = region
				}
			}
			if (best < 0) break
			chosen.push(best)
		}
		const weights = chosen.map(() => 0)
		for (const region of regions) {
			let nearest = Infinity
			let index = 0
			for (let i = 0; i < chosen.length; i++) {
				let d = 0
				for (let axis = 0; axis < 3; axis++)
					d +=
						(mesh.r_xyz[3 * region + axis] -
							mesh.r_xyz[3 * chosen[i] + axis]) **
						2
				if (d < nearest) {
					nearest = d
					index = i
				}
			}
			weights[index] +=
				mesh.regionArea?.[region] > 0 ? mesh.regionArea[region] : 1
		}
		const total = weights.reduce((sum, weight) => sum + weight, 0)
		const first = chosen[0]
		return {
			province,
			latitude:
				(Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * first + 2]))) *
					180) /
				Math.PI,
			longitude:
				(Math.atan2(mesh.r_xyz[3 * first + 1], mesh.r_xyz[3 * first]) * 180) /
				Math.PI,
			approximateLocation,
			samples: chosen.map((region, i) => ({
				region,
				weight: weights[i] / total,
				xyz: [
					mesh.r_xyz[3 * region],
					mesh.r_xyz[3 * region + 1],
					mesh.r_xyz[3 * region + 2],
				] as [number, number, number],
			})),
		}
	})
}

function resolve({
	locations,
	province,
}: ResolveProvinceLocationParams): ProvinceLocation | null {
	return locations[province] ?? null
}

export const PROVINCE_LOCATIONS = { build, resolve }
