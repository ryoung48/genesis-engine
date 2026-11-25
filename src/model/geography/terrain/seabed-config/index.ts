import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import { SHORE_CONFIG } from "@/model/geography/terrain/shore-config"

export const SEABED_CONFIG = {
	photicDepthM: 30,
	shareMinPercent: 2,
	reachKm: 175,
	coralMinColdC: 18,
	kelpMaxWarmC: 20,
	iceMonthsMax: 6,
	seagrassLeeMaxM: SHORE_CONFIG.exposureEdgesM[1],
	plumeFlowM3s: [SHORE_CONFIG.estuaryFlowM3s, SHORE_CONFIG.deltaFlowM3s],
	seamountKm: PRESENT_CONFIG.seamountKm,
	hotspotMinKm: PRESENT_CONFIG.volcano.hotspotMinKm,
	islandErosionKmPerMyr: PRESENT_CONFIG.islandErosionKmPerMyr,
	monthsPerYear: 12,
} as const
