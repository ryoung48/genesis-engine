import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { getProvinceAreaKm2 } from "@/ui/genesis/shared/population-density"
import { formatArea, formatElevation } from "@/ui/genesis/shared/ui-format"
import type {
	DescribeProvinceParams,
	ProvinceDescription,
	ProvinceFrameIndexParams,
} from "@/ui/genesis/wiki-bridge/province/types"

function frameIndex({
	world,
	history,
	province,
}: ProvinceFrameIndexParams): number | null {
	if (!history.state) return null
	const raw = world.provinces?.realIds?.[province] ?? province
	return history.state.provinceMap.realIdToCompact.get(String(raw)) ?? null
}

function worldIndex({
	world,
	history,
	province,
}: ProvinceFrameIndexParams): number | null {
	const raw = history.state?.provinceMap.compactToRealId[province]
	if (raw === undefined) return null
	if (world.provinces?.realIds) {
		const index = world.provinces.realIds.indexOf(raw)
		return index >= 0 ? index : null
	}
	return province >= 0 && province < (world.provinces?.count ?? 0)
		? province
		: null
}

function describe(input: DescribeProvinceParams): ProvinceDescription {
	const { world, history, province, unitSystem } = input
	if (
		!world?.provinces ||
		province === null ||
		province < 0 ||
		province >= world.provinces.count
	)
		return null
	const region = world.provinces.seeds[province]
	const index = frameIndex({ world, history, province })
	const frame = history.query?.frame
	const nation = (id: number) => {
		if (id < 0 || !frame) return null
		const entry = frame.nations.get(id)
		return entry
			? { id, name: entry.name, color: `rgb(${entry.color.join(",")})` }
			: null
	}
	const xyz = world.mesh.r_xyz
	const latitude =
		(Math.asin(Math.max(-1, Math.min(1, xyz[3 * region + 2]))) * 180) / Math.PI
	const longitude =
		(Math.atan2(xyz[3 * region + 1], xyz[3 * region]) * 180) / Math.PI
	const stats: StatEntry[] = [
		{
			label: "Area",
			value: formatArea(getProvinceAreaKm2(world, province), unitSystem),
		},
		{
			label: "Location",
			value: Number.isFinite(latitude + longitude)
				? `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`
				: "Unavailable",
		},
		{
			label: "Elevation",
			value: Number.isFinite(world.elevation_km[region])
				? formatElevation(world.elevation_km[region], unitSystem)
				: "Unavailable",
		},
		{
			label: "Terrain",
			value:
				CLASSIFICATION.genesisTopographyLabels[
					world.topography?.[region] ?? -1
				] ?? "Unavailable",
		},
		{
			label: "Vegetation",
			value: VEGETATION.biomeLabels[world.vegetation[region]] ?? "Unavailable",
		},
	]
	stats.push({
		label: "Climate",
		value:
			VEGETATION.climateLabels[world.climateZones[region]] ?? "Unavailable",
	})
	const societyStats: StatEntry[] = []
	if (frame && index !== null) {
		societyStats.push(
			{
				label: "Population",
				value: Math.round(
					frame.provincePopulation[index] ?? 0,
				).toLocaleString(),
			},
			{
				label: "Urban population",
				value: Math.round(
					frame.provincePopulationUrban[index] ?? 0,
				).toLocaleString(),
			},
			{
				label: "Development",
				value: Number(frame.provinceDevelopment[index] ?? 0).toFixed(1),
			},
			{
				label: "Knowledge",
				value: Number(frame.provinceKnowledge[index] ?? 0).toFixed(1),
			},
			{
				label: "Culture",
				value:
					frame.cultures.find(
						(entry) => entry.id === frame.provinceCulture[index],
					)?.name ?? "Unavailable",
			},
			{
				label: "Religion",
				value:
					frame.religions.find(
						(entry) => entry.id === frame.provinceReligion[index],
					)?.name ?? "Unavailable",
			},
		)
	}
	return {
		province,
		title:
			world.provinces.names?.[province] ??
			(index === null ? null : history.state?.provinceMeta[index]?.name) ??
			input.getProvinceName(province),
		planetTitle: input.planetName,
		sourceId: world.provinces.realIds?.[province] ?? null,
		stats,
		societyStats,
		owner: frame && index !== null ? nation(frame.provinceNation[index]) : null,
		controller:
			frame && index !== null ? nation(frame.provinceController[index]) : null,
		societyAvailable: !!frame && index !== null,
		onBack: input.onBack,
		onFocus: input.onFocus,
		onSelectNation: input.onSelectNation,
	}
}

export const PROVINCE_WIKI = { describe, frameIndex, worldIndex }
