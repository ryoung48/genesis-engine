import type {
	BuildProvinceLocationsParams,
	OpenNeighborCountParams,
	ProvinceLocation,
	ProvinceMarineLocation,
	ResolveProvinceLocationParams,
	SelectMarineLocationParams,
} from "@/model/geography/terrain/provinces/locations/types"

function openNeighbors({
	mesh,
	openWater,
	region,
}: OpenNeighborCountParams): number {
	let count = 0
	for (let j = mesh.adjOffset[region]; j < mesh.adjOffset[region + 1]; j++)
		if (openWater[mesh.adjList[j]]) count++
	return count
}

function selectMarine({
	mesh,
	regions,
	isLand,
	openWater,
	tidalRange,
}: SelectMarineLocationParams): ProvinceMarineLocation | null {
	let shore = -1
	let shoreCount = 0
	for (const region of regions) {
		if (!isLand[region]) continue
		const count = openNeighbors({ mesh, openWater, region })
		if (count === 0) continue
		const range = tidalRange?.[region] ?? 0
		const bestRange = shore >= 0 ? (tidalRange?.[shore] ?? 0) : -Infinity
		if (
			count > shoreCount ||
			(count === shoreCount &&
				(range > bestRange || (range === bestRange && region < shore)))
		) {
			shore = region
			shoreCount = count
		}
	}
	if (shore < 0) return null
	let sea = -1
	let seaCount = -1
	for (let j = mesh.adjOffset[shore]; j < mesh.adjOffset[shore + 1]; j++) {
		const neighbor = mesh.adjList[j]
		if (!openWater[neighbor]) continue
		const count = openNeighbors({ mesh, openWater, region: neighbor })
		if (count > seaCount || (count === seaCount && neighbor < sea)) {
			sea = neighbor
			seaCount = count
		}
	}
	return {
		shore,
		sea: {
			region: sea,
			weight: 1,
			xyz: [
				mesh.r_xyz[3 * sea],
				mesh.r_xyz[3 * sea + 1],
				mesh.r_xyz[3 * sea + 2],
			],
		},
	}
}

function build({
	mesh,
	provinces,
	isLand,
	representatives,
	openWater,
	tidalRange,
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
				marine: null,
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
			marine:
				openWater && !approximateLocation
					? selectMarine({ mesh, regions, isLand, openWater, tidalRange })
					: null,
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
