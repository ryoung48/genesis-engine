import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { findEu4ProvinceForLonLat } from "@/ui/genesis/political/eu4-hover-province"
import { buildEu4ProvinceRingGroups } from "@/ui/genesis/renderer/eu4-province-geometry"
import type {
	ProvinceClickTarget,
	ProvinceClickTargetParams,
	ProvinceRepresentativesParams,
	ResolvePickedProvinceParams,
	UnprojectMapPointParams,
} from "@/ui/genesis/shared/province-selection/types"

const realIdMaps = new WeakMap<
	NonNullable<SerializedGenesisWorld["provinces"]>,
	Map<number, number>
>()

function resolve({
	world,
	geometry,
	region,
	longitude,
	latitude,
}: ResolvePickedProvinceParams): number | null {
	const provinces = world?.provinces
	if (!provinces) return null
	if (geometry && provinces.realIds) {
		let mapping = realIdMaps.get(provinces)
		if (!mapping) {
			mapping = new Map(
				Array.from(provinces.realIds, (raw, index) => [raw, index]),
			)
			realIdMaps.set(provinces, mapping)
		}
		const raw = findEu4ProvinceForLonLat(geometry, longitude, latitude)
		const index = raw === null ? undefined : mapping.get(raw)
		if (index !== undefined) return index
	}
	const index = provinces.regionProvince[region]
	return index >= 0 && index < provinces.count ? index : null
}

function representatives({ world, geometry }: ProvinceRepresentativesParams) {
	const points = new Map<number, [number, number]>()
	const settlements = world?.realSettlement
	if (settlements)
		for (let p = 0; p < settlements.names.length; p++)
			if (settlements.names[p])
				points.set(p, [settlements.lons[p], settlements.lats[p]])
	if (geometry && world?.provinces?.realIds) {
		const mapping = new Map(
			Array.from(world.provinces.realIds, (raw, index) => [raw, index]),
		)
		for (const group of buildEu4ProvinceRingGroups(geometry)) {
			const province = mapping.get(group.provinceId)
			if (
				province !== undefined &&
				!points.has(province) &&
				group.exterior.length >= 2
			)
				points.set(province, [group.exterior[0], group.exterior[1]])
		}
	}
	return points
}

function clickTarget({
	province,
	owner,
	colorMode,
	toolActive,
}: ProvinceClickTargetParams): ProvinceClickTarget {
	if (toolActive || province === null) return { kind: "none", id: null }
	if (colorMode === "nations" && owner !== null && owner >= 0)
		return { kind: "nation", id: owner }
	return { kind: "province", id: province }
}

function unproject({
	x,
	y,
	centerLongitude,
	centerLatitude,
}: UnprojectMapPointParams) {
	const lon = (x * Math.PI) / 2
	const lat = (y * Math.PI) / 2
	const rx = Math.cos(lat) * Math.cos(lon)
	const ry = Math.cos(lat) * Math.sin(lon)
	const rz = Math.sin(lat)
	const tilt = (centerLatitude * Math.PI) / 180
	const a = Math.cos(tilt) * rx - Math.sin(tilt) * rz
	const b = ry
	const z = Math.sin(tilt) * rx + Math.cos(tilt) * rz
	return {
		latitude: (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
		longitude:
			(((Math.atan2(b, a) * 180) / Math.PI + centerLongitude + 540) % 360) -
			180,
	}
}

export const PROVINCE_SELECTION = {
	resolve,
	clickTarget,
	unproject,
	representatives,
}
