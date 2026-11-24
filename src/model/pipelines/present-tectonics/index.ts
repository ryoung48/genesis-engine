import { BELT_RECORDS } from "@/model/geography/tectonics/belt-records"
import { BENT_PIECES } from "@/model/geography/tectonics/bent-pieces"
import { CRUST } from "@/model/geography/tectonics/crust"
import { CRUST_PAST } from "@/model/geography/tectonics/crust-past"
import { PLATE_FRONTS } from "@/model/geography/tectonics/plate-fronts"
import { PLATE_MOTION } from "@/model/geography/tectonics/plate-motion"
import { SIM_MESH } from "@/model/geography/tectonics/sim-mesh"
import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import { WORLD_SAMPLE } from "@/model/geography/tectonics/world-sample"
import { ARC_CRUST } from "@/model/geography/terrain/arc-crust"
import { ARC_SITES } from "@/model/geography/terrain/arc-sites"
import { HEIGHT_SCALE } from "@/model/geography/terrain/height-scale"
import { PLUMES } from "@/model/geography/terrain/plumes"
import { VOLCANO_EDIFICES } from "@/model/geography/terrain/volcano-edifices"
import type {
	BuildPresentTectonicsParams,
	MarkVolcanoFeaturesParams,
	PresentTectonics,
	StampVolcanoesParams,
	VolcanoStamp,
} from "@/model/pipelines/present-tectonics/types"

const FRONT_MIN_CELLS = 3

function build({
	mesh,
	planetRadiusKm,
	seed,
	r_plate,
	plateVec,
	plateIsOcean,
	plateDensity,
	superPlateData,
	featureMask,
	arc,
	seaAgeMyr,
}: BuildPresentTectonicsParams): PresentTectonics {
	const motion = PLATE_MOTION.build({
		mesh,
		plates: PLATE_MOTION.buildMovingPlates({
			r_plate,
			plateVec,
			plateIsOcean,
			plateDensity,
			superPlateData: null,
		}),
	})
	const superOf = new Map<number, number>()
	if (superPlateData)
		for (let r = 0; r < mesh.numRegions; r++)
			if (!superOf.has(r_plate[r]))
				superOf.set(r_plate[r], superPlateData.r_superPlate[r])
	const fronts = PLATE_FRONTS.build({
		mesh,
		motion,
		planetRadiusKm,
		seed,
		durationGroup: (plate) => superOf.get(plate) ?? plate,
	})
	const simMesh = SIM_MESH.get()
	const sample = WORLD_SAMPLE.build({ simMesh, mesh })
	const simFronts = WORLD_SAMPLE.sampleFronts({
		sample,
		fronts,
		minCells: FRONT_MIN_CELLS,
	})
	const space = SIM_MESH.space(planetRadiusKm)
	const gather = <T extends Float32Array | Uint8Array>(field: T) =>
		WORLD_SAMPLE.gather({ sample, field })
	const arcCode: number[] = []
	arcCode[ARC_CRUST.CRUST.CONTINENT] = CRUST.TYPE.CONTINENT
	arcCode[ARC_CRUST.CRUST.ARC] = CRUST.TYPE.ARC
	arcCode[ARC_CRUST.CRUST.OCEAN] = CRUST.TYPE.OCEAN
	const simType = gather(arc.crustType).map((t) => arcCode[t])
	const simArc = {
		formedAtMyr: gather(arc.formedAtMyr),
		arcFront: gather(arc.arcFront),
		shelfSea: gather(arc.shelfSea),
	}
	const simSeaAge = gather(seaAgeMyr)
	const crust = BELT_RECORDS.initCrust({
		space,
		plate: WORLD_SAMPLE.gather({ sample, field: motion.plates.cellPlate }),
		crustType: simType,
		seaAgeMyr: simSeaAge,
		arc: simArc,
	})
	const pieces = BENT_PIECES.build({ space, crust, motion, simFronts, seed })
	const past = CRUST_PAST.replay({ space, crust, pieces, seed })
	const belts = BELT_RECORDS.build({
		seed,
		space,
		crust,
		motion,
		simFronts,
		seaAgeMyr: simSeaAge,
		featureMask: WORLD_SAMPLE.anyBits({ sample, field: featureMask }),
		arc: simArc,
	})
	const plumes = PLUMES.build({ space, crust, motion, seed })
	const sites = [
		...ARC_SITES.build({
			space,
			crust,
			arcFront: simArc.arcFront,
			formedAtMyr: simArc.formedAtMyr,
			seed,
		}),
		...VOLCANO_EDIFICES.hotspotSites({ crust, seaAgeMyr: simSeaAge }),
	]
	const edifices = VOLCANO_EDIFICES.build({
		space,
		sites,
		seed,
		meshEdgeKm:
			Math.sqrt((8 * Math.PI) / (Math.sqrt(3) * mesh.numRegions)) *
			planetRadiusKm,
	})
	return {
		simMesh,
		sample,
		motion,
		fronts,
		simFronts,
		space,
		crust,
		belts,
		past,
		record: null,
		plumes,
		sites,
		edifices,
		volcano: null,
	}
}

function stampVolcanoes({
	present,
	mesh,
	planetRadiusKm,
	seed,
	elevation,
	maxElevKm,
	maxDepthKm,
	terrainFeatures,
}: StampVolcanoesParams): VolcanoStamp {
	const heightKm = new Float32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++)
		heightKm[r] = HEIGHT_SCALE.elevToHeightKm({
			elev: elevation[r],
			maxElevKm,
			maxDepthKm,
		})
	const lipKm = PLUMES.lift({
		crust: present.crust,
		cellOfRegion: present.sample.cellOfRegion,
		mesh,
		planetRadiusKm,
	})
	for (let r = 0; r < mesh.numRegions; r++) heightKm[r] += lipKm[r]
	const stamped = VOLCANO_EDIFICES.stamp({
		mesh,
		planetRadiusKm,
		edifices: present.edifices,
		seed,
		heightKm,
	})
	const result: VolcanoStamp = { ...stamped, lipKm }
	for (let r = 0; r < mesh.numRegions; r++)
		if (result.addedKm[r] > 0 || lipKm[r] > 0)
			elevation[r] = HEIGHT_SCALE.heightKmToElev({
				heightKm: heightKm[r] + result.addedKm[r],
				maxElevKm,
				maxDepthKm,
			})
	if (terrainFeatures) markVolcanoFeatures({ present, result, terrainFeatures })
	return result
}

function markVolcanoFeatures({
	present,
	result,
	terrainFeatures,
}: MarkVolcanoFeaturesParams): void {
	const F = TERRAIN_FEATURES.genesisTerrainFeature
	const { featureMask, dominantFeature, dominantMagnitude } = terrainFeatures
	const mark = (r: number, feature: number, magnitude: number) => {
		if (magnitude <= 1e-5) return
		featureMask[r] |= 1 << (feature - 1)
		if (magnitude > dominantMagnitude[r]) {
			dominantMagnitude[r] = magnitude
			dominantFeature[r] = feature
		}
	}
	const featureOfKind = [0, F.VOLCANIC_ARC, F.VOLCANIC_ARC, F.HOTSPOT_VOLCANO]
	const { cellOfRegion } = present.sample
	const { crust } = present
	for (let r = 0; r < result.addedKm.length; r++) {
		mark(r, featureOfKind[result.kindAt[r]], result.addedKm[r])
		if (crust.volcType[cellOfRegion[r]] === CRUST.VOLCANIC.LIP)
			mark(r, F.LARGE_IGNEOUS_PROVINCE, crust.volcKm[cellOfRegion[r]])
	}
}

export const PRESENT_TECTONICS = { build, stampVolcanoes }
