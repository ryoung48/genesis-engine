import type { SerializedGenesisWorld } from "@/model/transport/worker-types"

const TIMEZONE_BAND_WATER: readonly [number, number, number][] = [
	[0.635, 0.718, 0.725],
	[0.792, 0.82, 0.553],
	[0.902, 0.788, 0.549],
	[0.886, 0.659, 0.506],
]

function saturateDarken(
	[r, g, b]: readonly [number, number, number],
	sat: number,
	dark: number,
): [number, number, number] {
	const luma = 0.299 * r + 0.587 * g + 0.114 * b
	const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
	return [
		clamp01((luma + (r - luma) * sat) * dark),
		clamp01((luma + (g - luma) * sat) * dark),
		clamp01((luma + (b - luma) * sat) * dark),
	]
}

const TIMEZONE_BAND_LAND: readonly [number, number, number][] =
	TIMEZONE_BAND_WATER.map((c) => saturateDarken(c, 1.9, 0.88))

function timezoneOffset(lonDeg: number): number {
	const offset = Math.round(lonDeg / 15)
	return offset < -12 ? -12 : offset > 12 ? 12 : offset
}

export function regionTimezoneOffset(
	world: SerializedGenesisWorld,
	region: number,
): number {
	const r_xyz = world.mesh.r_xyz
	const offsetOf = (r: number): number =>
		timezoneOffset(Math.atan2(r_xyz[3 * r + 1], r_xyz[3 * r]) * (180 / Math.PI))
	const provinces = world.provinces
	const p = provinces ? provinces.regionProvince[region] : -1
	if (!provinces || p < 0) return offsetOf(region)
	const nations = world.nations
	const capitalProvince = nations ? (nations.assignment[p] ?? -1) : -1
	const seedProvince = capitalProvince >= 0 ? capitalProvince : p
	const seedRegion = provinces.seeds[seedProvince] ?? -1
	return seedRegion >= 0 ? offsetOf(seedRegion) : offsetOf(region)
}

export function regionTimezoneLabel(
	world: SerializedGenesisWorld,
	region: number,
): string {
	const offset = regionTimezoneOffset(world, region)
	return `UTC${offset >= 0 ? "+" : "-"}${Math.abs(offset)}`
}

export function timezoneWaterColor(offset: number): [number, number, number] {
	return TIMEZONE_BAND_WATER[((offset % 4) + 4) % 4]
}

export function timezoneLandColor(offset: number): [number, number, number] {
	return TIMEZONE_BAND_LAND[((offset % 4) + 4) % 4]
}
