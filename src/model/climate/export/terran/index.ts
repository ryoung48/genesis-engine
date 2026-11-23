import { KOPPEN } from "@/model/climate/classification/koppen"
import type { TerranWorldInput } from "@/model/climate/export/terran/types"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { ELEVATION } from "@/model/geography/terrain/elevation"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { UNITS } from "@/model/shared/units"

async function createFile(world: TerranWorldInput): Promise<Blob> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0))
	const { mesh, landmarks, params, rivers } = world
	const { numRegions, r_xyz, adjOffset, adjList } = mesh
	if (!landmarks) throw new Error("The world has no water-body classification")

	const elevation = new Float32Array(numRegions)
	const water = new Int32Array(numRegions)
	const marsh = new Uint8Array(numRegions)
	const lakeLevels = new Float32Array(landmarks.count + 1)
	const lakeCounts = new Uint32Array(lakeLevels.length)
	const maxElevKm = (params.maxElevation ?? 6000) / 1000
	const maxDepthKm = UNITS.getMaxOceanDepthKm(params.planetRadiusKm)
	const koppen = world.realKoppenClimate ?? world.koppenClimate
	const temperature =
		world.climate.real_temperature_monthly ?? world.climate.temperature_monthly
	const rainfall = world.rainfall.real_monthly ?? world.rainfall.monthly

	for (let cell = 0; cell < numRegions; cell++) {
		elevation[cell] = world.elevation_km[cell] * 1000
		const landmark = landmarks.regionLandmark[cell]
		if (world.isLand[cell]) {
			marsh[cell] = Number(world.topography[cell] === CLASSIFICATION.topoMarsh)
			continue
		}
		if (landmarks.type[landmark] !== LANDMARKS.landmarkTypeLake) {
			water[cell] = -1
			continue
		}
		const lake = landmark + 1
		water[cell] = lake
		const level = rivers.waterLevel[cell]
		const levelKm = world.isEarthImport
			? level || world.elevation_km[cell]
			: ELEVATION.elevToHeightKm({ elev: level, maxElevKm, maxDepthKm })
		lakeLevels[lake] += levelKm * 1000
		lakeCounts[lake]++
	}
	for (let lake = 1; lake < lakeLevels.length; lake++) {
		if (lakeCounts[lake]) lakeLevels[lake] /= lakeCounts[lake]
	}

	const riverLengths = Uint32Array.from(rivers.lines, (line) => line.length)
	const riverPoints = new Float32Array(
		riverLengths.reduce((total, length) => total + length, 0) * 4,
	)
	let offset = 0
	for (const line of rivers.lines) {
		for (const [lon, lat, discharge, height] of line) {
			riverPoints[offset++] = lon
			riverPoints[offset++] = lat
			riverPoints[offset++] = discharge
			riverPoints[offset++] =
				1000 *
				(world.isEarthImport
					? height
					: ELEVATION.elevToHeightKm({ elev: height, maxElevKm, maxDepthKm }))
		}
	}

	const metadata = new TextEncoder().encode(
		JSON.stringify({
			numRegions,
			neighbors: adjList.length,
			lakes: lakeLevels.length,
			rivers: riverLengths.length,
			riverPoints: riverPoints.length,
			radiusKm: params.planetRadiusKm,
			koppenCodes: KOPPEN.koppenLabels,
		}),
	)
	const header = new Uint8Array(Math.ceil((12 + metadata.length) / 4) * 4)
	header.set(new TextEncoder().encode("TERRAN01"))
	new DataView(header.buffer).setUint32(8, metadata.length, true)
	header.set(metadata, 12)

	return new Blob(
		[
			header,
			new Float32Array(r_xyz),
			new Int32Array(adjOffset),
			new Int32Array(adjList),
			elevation,
			water,
			lakeLevels,
			new Float32Array(temperature),
			new Float32Array(rainfall),
			riverLengths,
			riverPoints,
			new Uint8Array(koppen),
			marsh,
		],
		{ type: "application/octet-stream" },
	)
}

export const TERRAN_EXPORT = { createFile }
